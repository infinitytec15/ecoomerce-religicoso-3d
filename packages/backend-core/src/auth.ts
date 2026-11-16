import { z } from 'zod';
import { transaction, lock, type Transaction, type Prisma } from '@maos-em-oracao/database';
import type { Session, Address, Role } from '@maos-em-oracao/contracts';
import {
  loginSchema,
  addressSchema,
  registerSchema,
  REGISTER_MESSAGE,
} from '@maos-em-oracao/contracts';
import type { Context } from './context';
import { rateLimit } from './context';
import { Notifications } from './notifications';
import { CrmService } from './crm';
import {
  token,
  digest,
  sessionHash,
  normalizeEmail,
  hashPassword,
  verifyPassword,
} from './security';
import {
  type Actor,
  permissions,
  json,
  data,
  requireActor,
  requireValue,
  DomainError,
  audit,
  addDays,
} from './shared';
export const passwordSchema = z
  .string()
  .min(12, 'Use uma senha com pelo menos 12 caracteres.')
  .max(128);
type EmailToken = Prisma.EmailTokenGetPayload<object>;
type User = Prisma.UserGetPayload<object>;
/**
 * Shared per-client budget for the unauthenticated endpoints that consume a link token
 * (verify, reset, e-mail change, guest order, team invitation), so tokens cannot be guessed
 * and argon2 cannot be driven at will from one client.
 */
export async function limitTokenAttempts(ctx: Context, clientKey: string) {
  await rateLimit(ctx, 'token/' + clientKey, 20, 900000);
}
const emptyAddress = (name: string, email: string): Address => ({
  name,
  email,
  phone: '',
  cep: '',
  street: '',
  number: '',
  extra: '',
  district: '',
  city: '',
  state: '',
});
export class AuthService {
  async guestOrder(value: unknown, actor: Actor | null, clientKey: string) {
    await limitTokenAttempts(this.ctx, clientKey);
    const input = z.object({ token: z.string().min(20).max(200) }).parse(value);
    return transaction(this.ctx.db, async (tx) => {
      await lock(tx, 'guest-token/' + digest(input.token));
      const t = requireValue(
        await tx.emailToken.findUnique({ where: { tokenHash: digest(input.token) } }),
        'Link inválido ou expirado.',
      );
      if (t.purpose !== 'guest-order' || t.usedAt || t.expiresAt < new Date())
        throw new DomainError(
          'INVALID_TOKEN',
          'Este acesso expirou ou já foi utilizado. Abra um link mais recente enviado por e-mail.',
        );
      const orderId = z.string().parse(data<{ orderId: string }>(t.data).orderId),
        order = requireValue(await tx.order.findUnique({ where: { id: orderId } }));
      await tx.emailToken.update({ where: { id: t.id }, data: { usedAt: new Date() } });
      await audit(tx, actor?.id || 'guest', 'Acesso seguro ao pedido', order.id);
      return {
        orderId: order.id,
        raw:
          actor?.userId && actor.customerId === order.customerId
            ? undefined
            : await this.session(tx, undefined, order.id),
      };
    });
  }
  readonly notifications: Notifications;
  private crm: CrmService;
  private dummy = hashPassword(token());
  constructor(private ctx: Context) {
    this.notifications = new Notifications(ctx);
    this.crm = new CrmService(ctx);
  }
  publicSession(actor: Actor): Session {
    return {
      id: actor.id,
      name: actor.name,
      email: actor.email,
      role: actor.role,
      permissions: actor.permissions,
      owner: actor.owner,
      demo: false,
      guest: !!actor.guestOrderId,
    };
  }
  async actor(raw?: string): Promise<Actor | null> {
    if (!raw || raw.length > 128) return null;
    const s = await this.ctx.db.session.findUnique({
      where: { tokenHash: sessionHash(raw, this.ctx.config) },
      include: {
        user: { include: { customer: true } },
        guestOrder: { include: { customer: true } },
      },
    });
    if (!s || s.expiresAt < new Date()) return null;
    if (s.user) {
      const u = s.user;
      if (!u.enabled) return null;
      return {
        id: u.id,
        userId: u.id,
        customerId: u.customer?.id,
        name: u.name,
        email: u.email,
        role: u.role as Role,
        permissions: u.owner ? permissions : (u.permissions as Actor['permissions']),
        owner: u.owner,
        demo: false,
      };
    }
    if (s.guestOrder) {
      const o = s.guestOrder,
        a = data<Address>(o.address);
      return {
        id: s.id,
        guestOrderId: o.id,
        customerId: o.customerId,
        name: a.name,
        email: a.email,
        role: 'customer',
        permissions: [],
        owner: false,
        demo: false,
      };
    }
    return null;
  }
  async session(tx: Transaction, userId?: string, guestOrderId?: string) {
    const raw = token();
    const user = userId
      ? await tx.user.findUnique({ where: { id: userId }, select: { role: true } })
      : null;
    await tx.session.create({
      data: {
        tokenHash: sessionHash(raw, this.ctx.config),
        userId,
        guestOrderId,
        expiresAt: addDays(guestOrderId ? 1 : user && user.role !== 'customer' ? 1 / 3 : 7),
      },
    });
    return raw;
  }
  async login(value: unknown, clientKey: string) {
    const input = loginSchema.parse(value),
      email = normalizeEmail(input.email);
    await rateLimit(this.ctx, 'login/' + digest(email), 10, 900000);
    await rateLimit(this.ctx, 'login-ip/' + clientKey, 200, 900000);
    if (input.register) {
      if (input.kind !== 'customer')
        throw new DomainError('FORBIDDEN', 'O cadastro da equipe exige convite.', 403);
      // Bundles cached before the confirmation flow still send register + password. The password
      // is never taken from this request: the link mailed by register() lets the owner of the
      // address create it, and the old client only shows the message.
      await this.register(
        { name: input.name, email: input.email, marketingOptIn: input.marketingOptIn ?? false },
        clientKey,
      );
      throw new DomainError('CONFIRM_EMAIL', REGISTER_MESSAGE, 409);
    }
    const user = await this.ctx.db.user.findUnique({ where: { email } });
    const valid = await verifyPassword(user?.passwordHash || (await this.dummy), input.password);
    if (
      !user ||
      !valid ||
      !user.enabled ||
      (input.kind === 'staff' && user.role === 'customer') ||
      (input.kind === 'customer' && user.role !== 'customer')
    )
      throw new DomainError('INVALID_CREDENTIALS', 'E-mail ou senha inválidos.', 401);
    const raw = await transaction(this.ctx.db, async (tx) => {
      await audit(tx, user.id, 'Sessão iniciada', user.id);
      return this.session(tx, user.id);
    });
    return { raw, session: this.publicSession(requireActor(await this.actor(raw))) };
  }
  /**
   * Customer sign-up. The account is created without a usable password and without a session:
   * whoever opens the link mailed to the address creates the password (see consume), so nobody
   * can register someone else's e-mail and keep the account. The answer never reveals whether
   * the address already has an account.
   */
  async register(value: unknown, clientKey: string) {
    const input = registerSchema.parse(value),
      email = normalizeEmail(input.email);
    await rateLimit(this.ctx, 'register/' + digest(email), 3, 3600000);
    await rateLimit(this.ctx, 'register-ip/' + clientKey, 20, 3600000);
    // Hashed for every request so the answer takes the same time whether or not the account exists.
    const unusablePassword = await hashPassword(token());
    await transaction(this.ctx.db, async (tx) => {
      await lock(tx, 'register/' + email);
      const existing = await tx.user.findUnique({ where: { email } });
      if (!existing) {
        const name = input.name;
        const user = await tx.user.create({
          data: {
            email,
            name,
            passwordHash: unusablePassword,
            customer: { create: { email, name, address: json(emptyAddress(name, email)) } },
          },
        });
        await this.sendVerification(tx, user);
        await audit(tx, user.id, 'Conta criada', user.id);
        return;
      }
      if (existing.role !== 'customer' || !existing.enabled) return;
      if (!existing.verifiedAt) await this.sendVerification(tx, existing);
      // Already confirmed: the person most likely forgot the account, so offer a new password.
      else await this.sendPasswordReset(tx, existing);
    });
    return { message: REGISTER_MESSAGE };
  }
  /** Confirms a sign-up link: creates the password, signs the confirmer in and returns the session. */
  async verify(value: unknown, clientKey: string) {
    const raw = requireValue(await this.consume(value, 'verify-email', clientKey));
    return { raw, session: this.publicSession(requireActor(await this.actor(raw))) };
  }
  /** Mails a new sign-up link; only the latest one can be used. */
  private async sendVerification(tx: Transaction, user: User) {
    await tx.emailToken.updateMany({
      where: { userId: user.id, purpose: 'verify-email', usedAt: null },
      data: { usedAt: new Date() },
    });
    const t = token(),
      expires = addDays(1);
    await tx.emailToken.create({
      data: {
        tokenHash: digest(t),
        userId: user.id,
        purpose: 'verify-email',
        data: {},
        expiresAt: expires,
      },
    });
    await this.notifications.email(tx, 'verify/' + digest(t), user.id, user.email, {
      kind: 'verify-email',
      purpose: 'register',
      name: user.name,
      actionUrl: this.ctx.config.PUBLIC_WEB_URL + '/conta/confirmar?token=' + t,
      expiresAtLabel:
        expires.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) + ' (Brasília)',
    });
  }
  /** Mails a password-reset link; earlier unused links stop working. */
  private async sendPasswordReset(tx: Transaction, user: User) {
    await tx.emailToken.updateMany({
      where: { userId: user.id, purpose: 'password-reset', usedAt: null },
      data: { usedAt: new Date() },
    });
    const t = token(),
      expires = new Date(Date.now() + 1800000);
    await tx.emailToken.create({
      data: {
        userId: user.id,
        tokenHash: digest(t),
        purpose: 'password-reset',
        data: {},
        expiresAt: expires,
      },
    });
    await this.notifications.email(tx, 'reset/' + digest(t), user.id, user.email, {
      kind: 'password-reset',
      name: user.name,
      actionUrl:
        this.ctx.config.PUBLIC_WEB_URL +
        '/conta/redefinir?kind=' +
        (user.role === 'customer' ? 'customer' : 'staff') +
        '&token=' +
        t,
      expiresAtLabel:
        expires.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) + ' (Brasília)',
    });
  }
  async logout(raw?: string) {
    if (raw)
      await this.ctx.db.session.deleteMany({
        where: { tokenHash: sessionHash(raw, this.ctx.config) },
      });
  }
  async recover(value: unknown, clientKey: string) {
    const input = z.object({ email: z.email(), kind: z.enum(['customer', 'staff']) }).parse(value),
      email = normalizeEmail(input.email);
    await rateLimit(this.ctx, 'recover/' + digest(email), 3, 3600000);
    await rateLimit(this.ctx, 'recover-ip/' + clientKey, 50, 3600000);
    const user = await this.ctx.db.user.findUnique({ where: { email } });
    if (user?.enabled && (input.kind === 'staff') === (user.role !== 'customer'))
      await transaction(this.ctx.db, (tx) => this.sendPasswordReset(tx, user));
    return {
      message: 'Se houver uma conta válida, enviaremos as instruções para o e-mail informado.',
    };
  }
  async consume(
    value: unknown,
    purpose: 'verify-email' | 'password-reset' | 'email-change',
    clientKey: string,
    actor: Actor | null = null,
  ): Promise<string | undefined> {
    await limitTokenAttempts(this.ctx, clientKey);
    const input = z
      .object({
        token: z.string().min(20).max(200),
        password: passwordSchema.optional(),
        marketingOptIn: z.boolean().optional(),
      })
      .parse(value);
    // A sign-up link creates the password: the account belongs to whoever controls the e-mail.
    if (purpose !== 'email-change' && !input.password)
      throw new DomainError(
        'PASSWORD_REQUIRED',
        purpose === 'verify-email' ? 'Crie uma senha para a sua conta.' : 'Informe a nova senha.',
      );
    const usable = (t: EmailToken | null): EmailToken & { userId: string } => {
      const found = requireValue(t, 'Link inválido ou expirado.');
      if (
        found.purpose !== purpose ||
        found.usedAt ||
        found.expiresAt < new Date() ||
        !found.userId
      )
        throw new DomainError('INVALID_TOKEN', 'Link inválido ou expirado.');
      return { ...found, userId: found.userId };
    };
    // Cheap lookup first: argon2 only runs for a token that can still be used.
    const found = usable(
      await this.ctx.db.emailToken.findUnique({ where: { tokenHash: digest(input.token) } }),
    );
    // An e-mail change only completes in the browser signed in to that account. Otherwise
    // whoever asked to move their account to someone else's address would get that person's
    // guest orders the moment the link is opened.
    if (purpose === 'email-change' && (!actor?.userId || actor.userId !== found.userId))
      throw new DomainError(
        'LOGIN_REQUIRED',
        'Entre na sua conta neste navegador e abra o link novamente.',
        401,
      );
    const passwordHash =
      purpose !== 'email-change' && input.password ? await hashPassword(input.password) : undefined;
    return transaction(this.ctx.db, async (tx) => {
      await lock(tx, 'token/' + digest(input.token));
      // Re-checked under the lock: a concurrent request may have used it meanwhile.
      const t = usable(
        await tx.emailToken.findUnique({ where: { tokenHash: digest(input.token) } }),
      );
      const u = requireValue(await tx.user.findUnique({ where: { id: t.userId } }));
      if (!u.enabled) throw new DomainError('INVALID_TOKEN', 'Link inválido ou expirado.');
      if (purpose === 'password-reset') {
        await tx.user.update({ where: { id: u.id }, data: { passwordHash } });
        await tx.session.deleteMany({ where: { userId: u.id } });
      } else if (purpose === 'verify-email') {
        await tx.user.update({
          where: { id: u.id },
          data: { passwordHash, verifiedAt: new Date() },
        });
        // Anyone who signed in before the address was confirmed (the old flow let the person
        // registering pick the password) is signed out; the confirmer gets a fresh session below.
        await tx.session.deleteMany({ where: { userId: u.id } });
        // Marketing consent is asked on the confirmation page itself: only the owner of the inbox
        // can give it (the sign-up form can be filled in with anyone's address).
        if (input.marketingOptIn === true)
          await this.crm.consent(tx, { email: u.email, name: u.name, source: 'register' });
      } else {
        const email = z.email().parse(data<{ email: string }>(t.data).email);
        if (await tx.user.findFirst({ where: { email, id: { not: u.id } } }))
          throw new DomainError('EMAIL_EXISTS', 'Este e-mail não pode ser utilizado.', 409);
        await tx.user.update({ where: { id: u.id }, data: { email, verifiedAt: new Date() } });
        const customer = await tx.customer.findUnique({ where: { userId: u.id } });
        if (customer)
          await tx.customer.update({
            where: { id: customer.id },
            data: { email, address: json({ ...data<Address>(customer.address), email }) },
          });
        await tx.session.deleteMany({ where: { userId: u.id } });
      }
      if (purpose !== 'password-reset') {
        const verified = requireValue(
          await tx.user.findUnique({ where: { id: u.id }, include: { customer: true } }),
        );
        if (verified.customer) {
          const guests = await tx.customer.findMany({
            where: { userId: null, email: { equals: verified.email, mode: 'insensitive' } },
            select: { id: true },
          });
          for (const guest of guests) {
            await tx.order.updateMany({
              where: { customerId: guest.id },
              data: { customerId: verified.customer.id },
            });
            await tx.ticket.updateMany({
              where: { customerId: guest.id },
              data: { customerId: verified.customer.id },
            });
            await tx.review.updateMany({
              where: { customerId: guest.id },
              data: { customerId: verified.customer.id },
            });
            await tx.customer.update({ where: { id: guest.id }, data: { active: false } });
          }
          if (
            !verified.customer.reviewRequestsOptOut &&
            (await tx.customer.count({
              where: { id: { in: guests.map((g) => g.id) }, reviewRequestsOptOut: true },
            }))
          )
            await tx.customer.update({
              where: { id: verified.customer.id },
              data: { reviewRequestsOptOut: true },
            });
        }
      }
      await tx.emailToken.update({ where: { id: t.id }, data: { usedAt: new Date() } });
      await audit(
        tx,
        u.id,
        purpose === 'password-reset' ? 'Senha redefinida' : 'E-mail confirmado',
        u.id,
      );
      return purpose === 'verify-email' ? this.session(tx, u.id) : undefined;
    });
  }
  async updateProfile(actor: Actor | null, value: unknown) {
    const a = requireActor(actor);
    if (!a.userId || !a.customerId)
      throw new DomainError('REGISTER_REQUIRED', 'Crie uma conta para editar seu perfil.', 403);
    const input = z
      .object({
        name: z.string().trim().min(3).max(120),
        email: z.email(),
        address: addressSchema.optional(),
      })
      .parse(value);
    const emailChanged = normalizeEmail(input.email) !== a.email;
    // Each change mails a confirmation link to an address the caller picks.
    if (emailChanged) await rateLimit(this.ctx, 'email-change/' + a.userId, 3, 3600000);
    await transaction(this.ctx.db, async (tx) => {
      const customer = requireValue(await tx.customer.findUnique({ where: { id: a.customerId } }));
      await tx.user.update({ where: { id: a.userId }, data: { name: input.name } });
      await tx.customer.update({
        where: { id: customer.id },
        data: {
          name: input.name,
          ...(input.address ? { address: json({ ...input.address, email: a.email }) } : {}),
        },
      });
      if (emailChanged) {
        // Only the latest requested address can be confirmed.
        await tx.emailToken.updateMany({
          where: { userId: a.userId, purpose: 'email-change', usedAt: null },
          data: { usedAt: new Date() },
        });
        const t = token();
        await tx.emailToken.create({
          data: {
            userId: a.userId,
            purpose: 'email-change',
            tokenHash: digest(t),
            data: { email: normalizeEmail(input.email) },
            expiresAt: addDays(1),
          },
        });
        await this.notifications.email(tx, 'email-change/' + digest(t), a.id, input.email, {
          kind: 'verify-email',
          purpose: 'email-change',
          name: input.name,
          actionUrl:
            this.ctx.config.PUBLIC_WEB_URL + '/conta/confirmar?purpose=email-change&token=' + t,
          expiresAtLabel:
            addDays(1).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) + ' (Brasília)',
        });
      }
      await audit(tx, a.id, 'Perfil atualizado', customer.id);
    });
  }
}

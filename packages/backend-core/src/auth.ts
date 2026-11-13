import { z } from 'zod';
import { transaction, lock, type Transaction } from '@maos-em-oracao/database';
import type { Session, Address, Role } from '@maos-em-oracao/contracts';
import { loginSchema, addressSchema } from '@maos-em-oracao/contracts';
import type { Context } from './context';
import { rateLimit } from './context';
import { Notifications } from './notifications';
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
  async guestOrder(value: unknown, actor: Actor | null) {
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
  private dummy = hashPassword(token());
  constructor(private ctx: Context) {
    this.notifications = new Notifications(ctx);
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
      passwordSchema.parse(input.password);
      const name = z.string().trim().min(3).max(100).parse(input.name);
      const result = await transaction(this.ctx.db, async (tx) => {
        await lock(tx, 'register/' + email);
        if (await tx.user.findUnique({ where: { email } }))
          throw new DomainError(
            'ACCOUNT_EXISTS',
            'Não foi possível criar esta conta. Tente entrar ou recuperar o acesso.',
            409,
          );
        const user = await tx.user.create({
          data: {
            email,
            name,
            passwordHash: await hashPassword(input.password),
            customer: { create: { email, name, address: json(emptyAddress(name, email)) } },
          },
        });
        const verifyToken = token();
        await tx.emailToken.create({
          data: {
            tokenHash: digest(verifyToken),
            userId: user.id,
            purpose: 'verify-email',
            data: {},
            expiresAt: addDays(1),
          },
        });
        await this.notifications.email(tx, 'verify/' + user.id, user.id, email, {
          kind: 'verify-email',
          name,
          actionUrl: this.ctx.config.PUBLIC_WEB_URL + '/conta/confirmar?token=' + verifyToken,
          expiresAtLabel:
            addDays(1).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) + ' (Brasília)',
        });
        await audit(tx, user.id, 'Conta criada', user.id);
        return { raw: await this.session(tx, user.id), userId: user.id };
      });
      const actor = requireActor(await this.actor(result.raw));
      return { raw: result.raw, session: this.publicSession(actor) };
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
      await transaction(this.ctx.db, async (tx) => {
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
      });
    return {
      message: 'Se houver uma conta válida, enviaremos as instruções para o e-mail informado.',
    };
  }
  async consume(value: unknown, purpose: 'verify-email' | 'password-reset' | 'email-change') {
    const input = z
      .object({ token: z.string().min(20).max(200), password: passwordSchema.optional() })
      .parse(value);
    if (purpose === 'password-reset' && !input.password)
      throw new DomainError('PASSWORD_REQUIRED', 'Informe a nova senha.');
    const passwordHash = input.password ? await hashPassword(input.password) : undefined;
    await transaction(this.ctx.db, async (tx) => {
      await lock(tx, 'token/' + digest(input.token));
      const t = requireValue(
        await tx.emailToken.findUnique({ where: { tokenHash: digest(input.token) } }),
        'Link inválido ou expirado.',
      );
      if (t.purpose !== purpose || t.usedAt || t.expiresAt < new Date() || !t.userId)
        throw new DomainError('INVALID_TOKEN', 'Link inválido ou expirado.');
      const u = requireValue(await tx.user.findUnique({ where: { id: t.userId } }));
      if (!u.enabled) throw new DomainError('INVALID_TOKEN', 'Link inválido ou expirado.');
      if (purpose === 'password-reset') {
        await tx.user.update({ where: { id: u.id }, data: { passwordHash } });
        await tx.session.deleteMany({ where: { userId: u.id } });
      } else if (purpose === 'verify-email')
        await tx.user.update({ where: { id: u.id }, data: { verifiedAt: new Date() } });
      else {
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
            await tx.customer.update({ where: { id: guest.id }, data: { active: false } });
          }
        }
      }
      await tx.emailToken.update({ where: { id: t.id }, data: { usedAt: new Date() } });
      await audit(
        tx,
        u.id,
        purpose === 'password-reset' ? 'Senha redefinida' : 'E-mail confirmado',
        u.id,
      );
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
      if (normalizeEmail(input.email) !== a.email) {
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

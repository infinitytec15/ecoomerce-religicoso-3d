import { z } from 'zod';
import { transaction, lock } from '@maos-em-oracao/database';
import { permissionSchema, type Role, type TeamInvitation } from '@maos-em-oracao/contracts';
import type { Context } from './context';
import { Notifications, type EmailEnvelope } from './notifications';
import {
  ownerOnly,
  type Actor,
  requireValue,
  DomainError,
  audit,
  addDays,
  instant,
  json,
} from './shared';
import { token, digest, hashPassword, normalizeEmail, unseal } from './security';
import { passwordSchema } from './auth';
export const roleNames: Record<string, string> = {
  admin: 'Administrador',
  support: 'Atendimento',
  production: 'Produção',
  finance: 'Financeiro',
};
export const rolePermissions: Record<string, Actor['permissions']> = {
  admin: [
    'orders',
    'subscriptions',
    'production',
    'shipping',
    'catalog',
    'customers',
    'finance',
    'support',
    'community',
    'marketing',
    'reports',
  ],
  support: ['orders', 'customers', 'support', 'community'],
  production: ['production', 'shipping'],
  finance: ['finance', 'reports'],
};
export class TeamService {
  private mail: Notifications;
  constructor(private ctx: Context) {
    this.mail = new Notifications(ctx);
  }
  async invite(actor: Actor | null, value: unknown, existingId?: string) {
    const a = ownerOnly(actor),
      input = z
        .object({
          name: z.string().trim().min(3).max(120),
          email: z.email(),
          role: z.enum(['admin', 'support', 'production', 'finance']),
          permissions: z.array(permissionSchema),
        })
        .parse(value),
      t = token(),
      email = normalizeEmail(input.email),
      expires = addDays(3);
    await transaction(this.ctx.db, async (tx) => {
      await lock(tx, 'invite/' + email);
      const member = await tx.user.findUnique({ where: { email } });
      if (member?.owner)
        throw new DomainError(
          'OWNER_PROTECTED',
          'O responsável pela loja não pode receber um convite de alteração de perfil.',
        );
      const saved = existingId
        ? await tx.teamInvitation.update({
            where: { id: existingId },
            data: {
              name: input.name,
              email,
              role: input.role,
              permissions: input.permissions,
              tokenHash: digest(t),
              expiresAt: expires,
              status: 'Pendente',
            },
          })
        : await tx.teamInvitation.create({
            data: {
              name: input.name,
              email,
              role: input.role,
              permissions: input.permissions,
              tokenHash: digest(t),
              expiresAt: expires,
            },
          });
      await this.mail.email(
        tx,
        'team-invite/' + saved.id + '/' + digest(t),
        saved.id,
        email,
        {
          kind: 'team-invite',
          name: input.name,
          role: roleNames[input.role],
          expiresAtLabel:
            expires.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) + ' (Brasília)',
          actionUrl: this.ctx.config.PUBLIC_WEB_URL + '/convite/' + t,
        },
        { adminToken: t },
      );
      await audit(tx, a.id, existingId ? 'Convite renovado' : 'Convite criado', saved.id);
    });
  }
  async listInvitations(actor: Actor | null): Promise<TeamInvitation[]> {
    ownerOnly(actor);
    const rows = await this.ctx.db.teamInvitation.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return Promise.all(
      rows.map(async (r) => {
        const delivery = await this.ctx.db.outboxEvent.findFirst({
          where: { aggregateId: r.id, kind: 'email' },
          orderBy: { createdAt: 'desc' },
        });
        const raw =
          r.status === 'Pendente' && r.expiresAt > new Date() && delivery
            ? unseal<EmailEnvelope>(delivery.payloadEncrypted, this.ctx.config).adminToken || ''
            : '';
        return {
          id: r.id,
          name: r.name,
          email: r.email,
          role: r.role as Exclude<Role, 'customer'>,
          permissions: r.permissions as TeamInvitation['permissions'],
          status: r.status as TeamInvitation['status'],
          token: raw,
          created: instant(r.createdAt),
          expiresAt: instant(r.expiresAt),
        };
      }),
    );
  }
  async info(raw: string) {
    const r = requireValue(
      await this.ctx.db.teamInvitation.findUnique({ where: { tokenHash: digest(raw) } }),
      'Convite inválido.',
    );
    if (r.status !== 'Pendente' || r.expiresAt < new Date())
      throw new DomainError('INVITATION_EXPIRED', 'O convite expirou ou foi revogado.', 410);
    return {
      id: r.id,
      name: r.name,
      email: r.email,
      role: r.role as Exclude<Role, 'customer'>,
      permissions: r.permissions,
      status: r.status,
      token: raw,
      created: instant(r.createdAt),
      expiresAt: instant(r.expiresAt),
    };
  }
  async accept(raw: string, value: unknown) {
    const input = z
        .object({ name: z.string().trim().min(3).max(120), password: passwordSchema })
        .parse(value),
      passwordHash = await hashPassword(input.password);
    await transaction(this.ctx.db, async (tx) => {
      await lock(tx, 'invitation/' + digest(raw));
      const r = requireValue(
        await tx.teamInvitation.findUnique({ where: { tokenHash: digest(raw) } }),
        'Convite inválido.',
      );
      if (r.status !== 'Pendente' || r.expiresAt < new Date())
        throw new DomainError('INVITATION_EXPIRED', 'O convite expirou ou já foi utilizado.', 410);
      const existing = await tx.user.findUnique({ where: { email: r.email } });
      if (existing?.owner)
        throw new DomainError('OWNER_PROTECTED', 'Este convite não pode alterar o responsável.');
      const user = await tx.user.upsert({
        where: { email: r.email },
        create: {
          email: r.email,
          name: input.name,
          passwordHash,
          role: r.role,
          permissions: r.permissions,
          verifiedAt: new Date(),
        },
        update: {
          name: input.name,
          passwordHash,
          role: r.role,
          permissions: r.permissions,
          enabled: true,
          verifiedAt: new Date(),
        },
      });
      await tx.session.deleteMany({ where: { userId: user.id } });
      await tx.teamInvitation.update({ where: { id: r.id }, data: { status: 'Aceito' } });
      await audit(tx, user.id, 'Convite aceito; senha definida', r.id);
    });
  }
  async revoke(actor: Actor | null, id: string) {
    const a = ownerOnly(actor);
    await this.ctx.db.teamInvitation.update({ where: { id }, data: { status: 'Revogado' } });
    await audit(this.ctx.db, a.id, 'Convite revogado', id);
  }
  async resend(actor: Actor | null, id: string) {
    const r = requireValue(await this.ctx.db.teamInvitation.findUnique({ where: { id } }));
    if (r.status === 'Aceito')
      throw new DomainError('INVITATION_ACCEPTED', 'O convite já foi aceito. Edite o integrante.');
    return this.invite(
      actor,
      { name: r.name, email: r.email, role: r.role, permissions: r.permissions },
      id,
    );
  }
  async save(
    actor: Actor | null,
    member: {
      id: string;
      name: string;
      email: string;
      role: string;
      status: string;
      permissions?: Actor['permissions'];
    },
  ) {
    const a = ownerOnly(actor),
      role = Object.keys(roleNames).find((k) => roleNames[k] === member.role) || member.role;
    if (!roleNames[role]) throw new DomainError('INVALID_ROLE', 'Perfil não reconhecido.');
    const existing = await this.ctx.db.user.findUnique({ where: { id: member.id } });
    if (!existing)
      return this.invite(a, {
        ...member,
        role,
        permissions: member.permissions || rolePermissions[role],
      });
    if (existing.owner)
      throw new DomainError(
        'OWNER_PROTECTED',
        'O responsável não pode ser desativado ou rebaixado neste fluxo.',
      );
    if (normalizeEmail(member.email) !== existing.email)
      throw new DomainError(
        'INVITATION_REQUIRED',
        'Para mudar o e-mail de acesso, envie um novo convite.',
      );
    await transaction(this.ctx.db, async (tx) => {
      await tx.user.update({
        where: { id: existing.id },
        data: {
          name: member.name,
          role,
          enabled: member.status === 'Ativo',
          permissions: member.permissions || rolePermissions[role],
        },
      });
      await tx.session.deleteMany({ where: { userId: existing.id } });
      await audit(tx, a.id, 'Perfil da equipe atualizado', existing.id);
    });
    void json;
  }
}

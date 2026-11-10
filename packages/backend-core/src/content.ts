import { z } from 'zod';
import { transaction, lock } from '@maos-em-oracao/database';
import { prayerSchema, newsletterSchema, type Address } from '@maos-em-oracao/contracts';
import type { Context } from './context';
import { settings, rateLimit } from './context';
import { Notifications } from './notifications';
import { token, digest, normalizeEmail, readSignedToken, recipientHash } from './security';
import {
  type Actor,
  permit,
  requireValue,
  DomainError,
  json,
  data,
  audit,
  addDays,
} from './shared';
import { prayerDto } from './projections';
export class ContentService {
  private mail: Notifications;
  constructor(private ctx: Context) {
    this.mail = new Notifications(ctx);
  }
  async prayers(actorKey: string) {
    return (
      await this.ctx.db.prayer.findMany({
        where: { OR: [{ moderation: 'Publicado' }, { actorKey }] },
        include: { reactions: true, reports: true },
        orderBy: { createdAt: 'desc' },
        take: 200,
      })
    ).map((p) => prayerDto(p, actorKey));
  }
  async postPrayer(actorKey: string, value: unknown) {
    const input = prayerSchema.parse(value);
    await rateLimit(this.ctx, 'prayer/' + actorKey, 5, 3600000);
    const s = await settings(this.ctx.db);
    await this.ctx.db.prayer.create({
      data: {
        actorKey,
        name: input.anonymous ? 'Anônimo' : input.name || 'Pessoa da comunidade',
        title: input.title,
        message: input.message,
        category: input.category,
        anonymous: input.anonymous,
        moderation: s.workspace.reviewPrayers ? 'Em análise' : 'Publicado',
      },
    });
  }
  async react(actorKey: string, id: string) {
    await rateLimit(this.ctx, 'reaction/' + actorKey, 100, 3600000);
    await transaction(this.ctx.db, async (tx) => {
      await lock(tx, 'reaction/' + id + '/' + actorKey);
      requireValue(await tx.prayer.findFirst({ where: { id, moderation: 'Publicado' } }));
      const old = await tx.prayerReaction.findUnique({
        where: { prayerId_actorKey: { prayerId: id, actorKey } },
      });
      if (old) await tx.prayerReaction.delete({ where: { id: old.id } });
      else await tx.prayerReaction.create({ data: { prayerId: id, actorKey } });
    });
  }
  async deletePrayer(actorKey: string, id: string) {
    const count = await this.ctx.db.prayer.updateMany({
      where: { id, actorKey },
      data: { moderation: 'Oculto' },
    });
    if (!count.count) throw new DomainError('NOT_FOUND', 'Pedido de oração não encontrado.', 404);
  }
  async report(actorKey: string, id: string, value: unknown) {
    const input = z.object({ reason: z.string().trim().min(5).max(300) }).parse(value);
    await rateLimit(this.ctx, 'prayer-report/' + actorKey, 10, 3600000);
    await transaction(this.ctx.db, async (tx) => {
      requireValue(await tx.prayer.findUnique({ where: { id } }));
      await tx.prayerReport.upsert({
        where: { prayerId_actorKey: { prayerId: id, actorKey } },
        create: { prayerId: id, actorKey, reason: input.reason },
        update: {},
      });
      if ((await tx.prayerReport.count({ where: { prayerId: id } })) >= 3)
        await tx.prayer.update({ where: { id }, data: { moderation: 'Em análise' } });
    });
  }
  async moderate(actor: Actor | null, id: string, status: string, note: string) {
    const a = permit(actor, 'community');
    z.enum(['Publicado', 'Em análise', 'Oculto']).parse(status);
    z.string().max(2000).parse(note);
    await transaction(this.ctx.db, async (tx) => {
      await tx.prayer.update({ where: { id }, data: { moderation: status, moderationNote: note } });
      await audit(tx, a.id, 'Moderação: ' + status, id);
    });
  }
  async newsletter(value: unknown, clientKey: string) {
    const input = newsletterSchema.parse(value),
      email = normalizeEmail(input.email);
    await rateLimit(this.ctx, 'newsletter/' + digest(email), 3, 3600000);
    await rateLimit(this.ctx, 'newsletter-ip/' + clientKey, 30, 3600000);
    await transaction(this.ctx.db, async (tx) => {
      await lock(tx, 'newsletter/' + email);
      const old = await tx.devotionalSubscriber.findUnique({ where: { email } });
      if (old?.verifiedAt && !old.unsubscribedAt) return;
      const sub = old
        ? await tx.devotionalSubscriber.update({
            where: { id: old.id },
            data: {
              name: input.name,
              consentAt: new Date(),
              consentVersion: 'prayer-v1',
              tokenVersion: { increment: 1 },
            },
          })
        : await tx.devotionalSubscriber.create({
            data: { email, name: input.name, consentVersion: 'prayer-v1', consentAt: new Date() },
          });
      const t = token();
      await tx.emailToken.create({
        data: {
          tokenHash: digest(t),
          purpose: 'devotional-opt-in',
          data: { subscriberId: sub.id, version: sub.tokenVersion },
          expiresAt: addDays(1),
        },
      });
      await this.mail.email(tx, 'devotional-opt-in/' + digest(t), sub.id, email, {
        kind: 'devotional-opt-in',
        name: input.name || 'pessoa querida',
        actionUrl: this.ctx.config.PUBLIC_WEB_URL + '/oracao/confirmar?token=' + t,
        expiresAtLabel:
          addDays(1).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) + ' (Brasília)',
      });
    });
    return {
      message: 'Confira seu e-mail para confirmar o recebimento gratuito da oração diária.',
    };
  }
  async confirmNewsletter(value: unknown) {
    const input = z.object({ token: z.string().min(20).max(200) }).parse(value);
    await transaction(this.ctx.db, async (tx) => {
      await lock(tx, 'newsletter-token/' + digest(input.token));
      const t = requireValue(
        await tx.emailToken.findUnique({ where: { tokenHash: digest(input.token) } }),
        'Link inválido ou expirado.',
      );
      if (t.purpose !== 'devotional-opt-in' || t.usedAt || t.expiresAt < new Date())
        throw new DomainError('INVALID_TOKEN', 'Link inválido ou expirado.');
      const p = data<{ subscriberId: string; version: number }>(t.data),
        s = requireValue(
          await tx.devotionalSubscriber.findUnique({ where: { id: p.subscriberId } }),
        );
      if (s.tokenVersion !== p.version)
        throw new DomainError(
          'INVALID_TOKEN',
          'Este link foi substituído por uma nova solicitação.',
        );
      await tx.devotionalSubscriber.update({
        where: { id: s.id },
        data: { verifiedAt: new Date(), unsubscribedAt: null },
      });
      await tx.emailToken.update({ where: { id: t.id }, data: { usedAt: new Date() } });
    });
  }
  async unsubscribe(value: unknown) {
    const input = z.object({ token: z.string().min(20).max(2048) }).parse(value);
    let p: { id: string; version: number };
    try {
      p = readSignedToken(input.token, 'unsubscribe', this.ctx.config);
    } catch {
      throw new DomainError('INVALID_TOKEN', 'Link de descadastro inválido ou expirado.');
    }
    await transaction(this.ctx.db, async (tx) => {
      await tx.devotionalSubscriber.updateMany({
        where: { id: p.id, tokenVersion: p.version },
        data: { unsubscribedAt: new Date() },
      });
      await audit(tx, 'subscriber', 'Descadastro solicitado', p.id);
    });
  }
  async createTicket(actor: Actor | null, value: unknown, clientKey: string) {
    const input = z
      .object({
        subject: z.string().trim().min(5).max(160),
        category: z.string().max(80),
        message: z.string().trim().min(10).max(5000),
        name: z.string().min(3).max(120).optional(),
        email: z.email().optional(),
      })
      .parse(value);
    await rateLimit(this.ctx, 'support/' + clientKey, 10, 3600000);
    if (actor && actor.role !== 'customer')
      throw new DomainError(
        'CUSTOMER_ACCOUNT_REQUIRED',
        'Abra atendimentos de clientes pelo painel da gestão.',
        403,
      );
    await transaction(this.ctx.db, async (tx) => {
      const customer = actor?.customerId
        ? requireValue(await tx.customer.findUnique({ where: { id: actor.customerId } }))
        : await tx.customer.create({
            data: {
              name: requireValue(input.name, 'Informe seu nome.'),
              email: requireValue(input.email, 'Informe seu e-mail.'),
              address: json({
                name: input.name || '',
                email: input.email || '',
                phone: '',
                cep: '',
                street: '',
                number: '',
                extra: '',
                district: '',
                city: '',
                state: '',
              } satisfies Address),
            },
          });
      const ticket = await tx.ticket.create({
        data: {
          customerId: customer.id,
          subject: input.subject,
          category: input.category,
          messages: { create: { by: 'cliente', text: input.message, attachments: [] } },
        },
      });
      if ((await settings(tx)).workspace.notificationTicket)
        await this.mail.operation(
          tx,
          'new-ticket/' + ticket.id,
          ticket.id,
          'support',
          'Uma pessoa precisa de acolhimento.',
          'Novo atendimento: ' + ticket.subject,
          '/admin/suporte/' + ticket.id,
        );
    });
  }
  async reply(actor: Actor | null, id: string, value: unknown) {
    if (!actor?.userId || !actor.customerId || actor.role !== 'customer')
      throw new DomainError('UNAUTHORIZED', 'Entre na conta para responder.', 401);
    const input = z.object({ message: z.string().trim().min(1).max(5000) }).parse(value);
    await rateLimit(this.ctx, 'ticket-reply/' + actor.id, 60, 3600000);
    await transaction(this.ctx.db, async (tx) => {
      const t = requireValue(
        await tx.ticket.findFirst({ where: { id, customerId: actor.customerId } }),
      );
      await tx.ticketMessage.create({
        data: { ticketId: t.id, by: 'cliente', text: input.message, attachments: [] },
      });
      await tx.ticket.update({ where: { id }, data: { status: 'Aberto' } });
    });
  }
  async staffReply(
    actor: Actor | null,
    value: {
      id: string;
      message: string;
      internal?: boolean;
      status: string;
      assignee: string;
      priority?: string;
    },
  ) {
    const a = permit(actor, 'support');
    z.string().trim().min(1).max(5000).parse(value.message);
    z.enum(['Aberto', 'Em atendimento', 'Resolvido']).parse(value.status);
    await transaction(this.ctx.db, async (tx) => {
      const t = requireValue(
        await tx.ticket.findUnique({ where: { id: value.id }, include: { customer: true } }),
      );
      const m = await tx.ticketMessage.create({
        data: {
          ticketId: t.id,
          by: 'equipe',
          text: value.message,
          internal: !!value.internal,
          attachments: [],
        },
      });
      await tx.ticket.update({
        where: { id: t.id },
        data: {
          status: value.status,
          assignee: value.assignee.slice(0, 120),
          priority: value.priority || t.priority,
        },
      });
      if (!value.internal) {
        await this.mail.email(tx, 'ticket-reply/' + m.id, t.id, t.customer.email, {
          kind: 'support-reply',
          name: t.customer.name,
          ticketNumber: t.id.slice(0, 8),
          visibility: 'public',
          reply: value.message,
          actionUrl: this.ctx.config.PUBLIC_WEB_URL + '/conta/suporte',
        });
      }
      await audit(
        tx,
        a.id,
        value.internal ? 'Nota interna de atendimento' : 'Resposta pública de atendimento',
        t.id,
      );
    });
  }
  async fanoutCampaign(id: string) {
    const c = requireValue(await this.ctx.db.campaign.findUnique({ where: { id } }));
    if (!['Agendada', 'Preparando'].includes(c.state)) return;
    await this.ctx.db.campaign.update({ where: { id }, data: { state: 'Preparando' } });
    let cursor: string | undefined;
    for (;;) {
      const subscribers = await this.ctx.db.devotionalSubscriber.findMany({
        where: { verifiedAt: { not: null }, unsubscribedAt: null },
        orderBy: { id: 'asc' },
        take: 100,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      if (!subscribers.length) break;
      for (const sub of subscribers) {
        const current = await this.ctx.db.campaign.findUnique({ where: { id } });
        if (current?.state === 'Cancelada') return;
        if (
          c.audience === 'Assinantes do clube' &&
          !(await this.ctx.db.subscription.findFirst({
            where: { status: 'Ativa', customer: { email: sub.email } },
          }))
        )
          continue;
        await transaction(this.ctx.db, async (tx) => {
          await this.mail.email(
            tx,
            'campaign/' + c.id + '/' + sub.id,
            c.id,
            sub.email,
            {
              kind: 'daily-prayer',
              name: sub.name || 'pessoa querida',
              title: c.subject,
              prayer: c.message,
              reflection: c.previewText || 'Leve este momento de oração para o seu dia.',
              dateLabel: (c.scheduledAt || new Date()).toLocaleDateString('pt-BR', {
                timeZone: 'America/Sao_Paulo',
              }),
              actionUrl: this.ctx.config.PUBLIC_WEB_URL + '/cantinho-da-fe',
              ...this.mail.unsubscribeLinks(sub.id, sub.tokenVersion),
            },
            { subscriberId: sub.id, subscriberVersion: sub.tokenVersion, campaignId: c.id },
          );
        });
      }
      cursor = subscribers.at(-1)!.id;
    }
    await this.ctx.db.campaign.updateMany({
      where: { id, state: 'Preparando' },
      data: { state: 'Processando' },
    });
  }
  suppressionKey(email: string) {
    return recipientHash(normalizeEmail(email), this.ctx.config);
  }
}

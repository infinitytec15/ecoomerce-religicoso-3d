import type { AdminCommand, Operations, Session } from '@/lib/domain/types';
import { ApiError, requireValue } from '@/lib/api/contracts';
import {
  couponSchema,
  editionSchema,
  invitationSchema,
  workspaceSchema,
} from '@/lib/domain/admin-schemas';
import { enqueueProduction } from '@/lib/domain/commerce';
import { today, uid } from '@/lib/domain/format';
export function applyAdminExtension(s: Operations, c: AdminCommand, actor: Session) {
  switch (c.type) {
    case 'product.archive': {
      const p = requireValue(s.products.find((p) => p.id === c.id));
      p.active = false;
      p.archived = true;
      return true;
    }
    case 'stock.adjust': {
      const p = requireValue(s.products.find((p) => p.id === c.productId));
      if (
        !Number.isInteger(c.delta) ||
        !c.delta ||
        p.stock + c.delta < 0 ||
        c.reason.trim().length < 5
      )
        throw new ApiError(
          'INVALID_STOCK',
          'Informe uma quantidade válida e um motivo com pelo menos 5 caracteres.',
        );
      p.stock += c.delta;
      s.stockMovements.unshift({
        id: uid('EST'),
        productId: p.id,
        delta: c.delta,
        reason: c.reason,
        date: new Date().toISOString(),
        actor: actor.name,
      });
      return true;
    }
    case 'orders.batch':
      for (const id of c.ids) {
        const o = requireValue(s.orders.find((o) => o.id === id));
        if (c.action === 'priority') o.priority = 'Alta';
        if (c.action === 'production')
          enqueueProduction(s, id, {
            printer: s.printers.find((p) => p.status === 'Disponível')?.name || 'A definir',
            hours: 2,
            assignee: actor.name,
          });
        if (c.action === 'cancel') {
          if (
            ['Enviado', 'Entregue'].includes(o.status) ||
            s.charges.some((charge) => charge.orderId === id && charge.status === 'Pago')
          )
            throw new ApiError(
              'PAID_ORDER',
              'Estorne o pagamento antes de cancelar. Pedidos enviados precisam do fluxo de devolução.',
            );
          o.status = 'Cancelado';
          s.jobs = s.jobs.filter((j) => j.orderId !== id);
        }
      }
      return true;
    case 'production.update': {
      if (c.hours <= 0 || c.grams < 0 || !c.assignee.trim())
        throw new ApiError('INVALID_JOB', 'Confira tempo, material e responsável.');
      Object.assign(requireValue(s.jobs.find((j) => j.id === c.id)), {
        printer: c.printer,
        hours: c.hours,
        assignee: c.assignee,
        due: c.due,
        priority: c.priority,
        notes: c.notes,
        material: c.material,
        grams: c.grams,
      });
      return true;
    }
    case 'shipping.label': {
      const o = requireValue(s.orders.find((o) => o.id === c.id));
      if (!['Pronto para envio', 'Enviado'].includes(o.status))
        throw new ApiError('NOT_READY', 'Conclua a conferência antes de preparar uma etiqueta.');
      if (c.action === 'generate' && o.labelStatus !== 'Preparada')
        throw new ApiError('NOT_PREPARED', 'Confira os dados e prepare a etiqueta primeiro.');
      o.labelStatus =
        c.action === 'prepare' ? 'Preparada' : c.action === 'generate' ? 'Gerada' : 'Cancelada';
      return true;
    }
    case 'edition.save': {
      const edition = editionSchema.parse(c.edition);
      if (
        Object.values(edition.profiles)
          .flat()
          .some((id) => !s.products.some((p) => p.id === id && !p.archived))
      )
        throw new ApiError('INVALID_PRODUCT', 'Escolha produtos disponíveis para a edição.');
      const existing = s.editions.find((e) => e.id === edition.id);
      if (existing) Object.assign(existing, edition);
      else s.editions.unshift(edition);
      return true;
    }
    case 'edition.activate': {
      const e = requireValue(s.editions.find((e) => e.id === c.id));
      s.settings = {
        ...s.settings,
        edition: e.name,
        editionMonth: e.month,
        dispatchDay: e.dispatchDay,
        profiles: e.profiles,
      };
      e.status = 'Programada';
      return true;
    }
    case 'coupon.save': {
      const coupon = couponSchema.parse(c.coupon);
      coupon.code = coupon.code.toUpperCase().trim();
      if (s.coupons.some((x) => x.id !== coupon.id && x.code === coupon.code))
        throw new ApiError('DUPLICATE_CODE', 'Este código já existe.');
      const existing = s.coupons.find((x) => x.id === coupon.id);
      if (existing) Object.assign(existing, coupon);
      else s.coupons.push(coupon);
      return true;
    }
    case 'coupon.archive':
      requireValue(s.coupons.find((x) => x.id === c.id)).active = false;
      return true;
    case 'invite.create': {
      if (
        s.team.some((t) => t.email.toLowerCase() === c.email.toLowerCase()) ||
        s.invitations.some(
          (i) => i.email.toLowerCase() === c.email.toLowerCase() && i.status === 'Pendente',
        )
      )
        throw new ApiError(
          'EMAIL_IN_USE',
          'Este e-mail já pertence à equipe ou tem um convite pendente.',
        );
      s.invitations.unshift(
        invitationSchema.parse({
          id: uid('INV'),
          name: c.name,
          email: c.email.toLowerCase(),
          role: c.role,
          permissions: c.permissions,
          status: 'Pendente',
          token: crypto.randomUUID(),
          created: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
        }),
      );
      return true;
    }
    case 'invite.revoke':
      requireValue(s.invitations.find((i) => i.id === c.id)).status = 'Revogado';
      return true;
    case 'invite.resend': {
      const i = requireValue(s.invitations.find((i) => i.id === c.id));
      if (i.status === 'Aceito') throw new ApiError('ACCEPTED', 'Este convite já foi aceito.');
      i.status = 'Pendente';
      i.token = crypto.randomUUID();
      i.expiresAt = new Date(Date.now() + 7 * 86400000).toISOString();
      return true;
    }
    case 'workspace.save':
      s.workspace = workspaceSchema.parse(c.settings);
      return true;
    case 'prayer.review': {
      const p = requireValue(s.prayers.find((p) => p.id === c.id));
      p.moderation = c.status;
      p.hidden = c.status !== 'Publicado';
      p.moderationNote = c.note;
      return true;
    }
    case 'campaign.save': {
      if (c.campaign.subject.trim().length < 5 || c.campaign.message.trim().length < 10)
        throw new ApiError('INVALID_CAMPAIGN', 'Complete o assunto e a oração.');
      const existing = s.campaigns.find((x) => x.id === c.campaign.id);
      if (existing) Object.assign(existing, c.campaign);
      else s.campaigns.unshift({ ...c.campaign, recipients: 0, status: 'Rascunho' });
      return true;
    }
    case 'campaign.action': {
      const campaign = requireValue(s.campaigns.find((x) => x.id === c.id));
      if (c.action === 'schedule' && campaign.date < today())
        throw new ApiError('PAST_DATE', 'Escolha uma data atual ou futura.');
      campaign.status =
        c.action === 'schedule' ? 'Agendada' : c.action === 'cancel' ? 'Cancelada' : 'Rascunho';
      return true;
    }
    default:
      return false;
  }
}

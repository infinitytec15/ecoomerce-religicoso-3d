import { z } from 'zod';
import { transaction, lock, type Transaction } from '@maos-em-oracao/database';
import type { Operations, Permission, Address, Campaign } from '@maos-em-oracao/contracts';
import type { Context } from './context';
import { settings } from './context';
import { commandSchema, type Command } from './command-schema';
import { CatalogService } from './catalog';
import { ContentService } from './content';
import { OrdersService } from './orders';
import { SubscriptionsService } from './subscriptions';
import { ShippingService } from './shipping';
import { TeamService, roleNames } from './team';
import { Notifications } from './notifications';
import {
  orderInclude,
  orderDto,
  customerDto,
  chargeDto,
  subscriptionDto,
  jobDto,
  ticketDto,
  prayerDto,
  productDto,
} from './projections';
import {
  type Actor,
  requireActor,
  permit,
  requireValue,
  DomainError,
  data,
  json,
  day,
  instant,
  month,
  audit,
} from './shared';
import { normalizeEmail, digest } from './security';
const permissionMap: Record<string, Permission> = {
  customer: 'customers',
  product: 'catalog',
  stock: 'catalog',
  orders: 'orders',
  order: 'orders',
  production: 'production',
  printer: 'production',
  shipping: 'shipping',
  charge: 'finance',
  expense: 'finance',
  subscription: 'subscriptions',
  edition: 'subscriptions',
  coupon: 'catalog',
  ticket: 'support',
  prayer: 'community',
  campaign: 'marketing',
  team: 'team',
  invite: 'team',
  workspace: 'settings',
  settings: 'settings',
};
export class AdminService {
  async executeIdempotent(actor: Actor | null, value: unknown, key?: string) {
    const command = commandSchema.parse(value),
      a = permit(actor, permissionMap[command.type.split('.')[0]]);
    z.uuid().parse(key);
    const requestHash = digest(JSON.stringify(command));
    const claim = await transaction(this.ctx.db, async (tx) => {
      await lock(tx, 'admin-request/' + key);
      const old = await tx.idempotencyRecord.findUnique({ where: { key: key! } });
      if (old) {
        if (
          old.actorId !== a.id ||
          old.scope !== 'admin/' + command.type ||
          old.requestHash !== requestHash
        )
          throw new DomainError(
            'IDEMPOTENCY_CONFLICT',
            'A chave já foi usada para outra operação.',
            409,
          );
        const response = data<{ state: string; code?: string; message?: string; status?: number }>(
          old.response,
        );
        if (response.state === 'completed') return false;
        if (response.state === 'failed')
          throw new DomainError(
            response.code || 'COMMAND_FAILED',
            response.message || 'Confira a operação.',
            response.status || 422,
          );
        throw new DomainError(
          'OPERATION_PENDING',
          'A operação anterior precisa ser consultada antes de repetir.',
          409,
        );
      }
      await tx.idempotencyRecord.create({
        data: {
          key: key!,
          actorId: a.id,
          scope: 'admin/' + command.type,
          requestHash,
          response: { state: 'processing' },
        },
      });
      return true;
    });
    if (!claim) return;
    try {
      await this.execute(a, command);
      await this.ctx.db.idempotencyRecord.update({
        where: { key: key! },
        data: { response: { state: 'completed' } },
      });
    } catch (error) {
      await this.ctx.db.idempotencyRecord.update({
        where: { key: key! },
        data: {
          response: json(
            error instanceof DomainError
              ? { state: 'failed', code: error.code, message: error.message, status: error.status }
              : { state: 'unknown' },
          ),
        },
      });
      throw error;
    }
  }
  readonly catalog: CatalogService;
  readonly content: ContentService;
  readonly orders: OrdersService;
  readonly subscriptions: SubscriptionsService;
  readonly shipping: ShippingService;
  readonly team: TeamService;
  readonly mail: Notifications;
  constructor(private ctx: Context) {
    this.catalog = new CatalogService(ctx);
    this.content = new ContentService(ctx);
    this.orders = new OrdersService(ctx);
    this.subscriptions = new SubscriptionsService(ctx);
    this.shipping = new ShippingService(ctx);
    this.team = new TeamService(ctx);
    this.mail = new Notifications(ctx);
  }
  async operations(actor: Actor | null): Promise<Operations> {
    const a = requireActor(actor);
    if (a.role === 'customer')
      throw new DomainError('FORBIDDEN', 'Acesso exclusivo à equipe.', 403);
    const can = (p: Permission) => a.owner || a.permissions.includes(p),
      orderRead = ['orders', 'production', 'shipping', 'finance', 'support', 'subscriptions'].some(
        (p) => can(p as Permission),
      ),
      s = await settings(this.ctx.db);
    const [
      products,
      clients,
      orders,
      subscriptions,
      jobs,
      printers,
      expenses,
      tickets,
      users,
      prayers,
      campaigns,
      logs,
      editions,
      coupons,
      movements,
    ] = await Promise.all([
      can('catalog') || can('production')
        ? this.ctx.db.product.findMany({ orderBy: { createdAt: 'desc' }, take: 1000 })
        : [],
      ['customers', 'orders', 'shipping', 'finance', 'support', 'subscriptions'].some((p) =>
        can(p as Permission),
      )
        ? this.ctx.db.customer.findMany({ orderBy: { createdAt: 'desc' }, take: 1000 })
        : [],
      orderRead
        ? this.ctx.db.order.findMany({
            include: orderInclude,
            orderBy: { createdAt: 'desc' },
            take: 1000,
          })
        : [],
      can('subscriptions')
        ? this.ctx.db.subscription.findMany({ orderBy: { createdAt: 'desc' }, take: 1000 })
        : [],
      can('production') || can('shipping')
        ? this.ctx.db.productionJob.findMany({
            where: { order: { status: { not: 'Cancelado' } } },
            include: { printer: true },
            orderBy: { due: 'asc' },
            take: 1000,
          })
        : [],
      can('production') ? this.ctx.db.printer.findMany() : [],
      can('finance') ? this.ctx.db.expense.findMany({ orderBy: { date: 'desc' }, take: 1000 }) : [],
      can('support')
        ? this.ctx.db.ticket.findMany({
            include: { messages: { orderBy: { createdAt: 'asc' } } },
            orderBy: { updatedAt: 'desc' },
            take: 1000,
          })
        : [],
      can('team')
        ? this.ctx.db.user.findMany({
            where: { role: { not: 'customer' } },
            orderBy: { name: 'asc' },
            take: 200,
          })
        : [],
      can('community')
        ? this.ctx.db.prayer.findMany({
            include: { reactions: true, reports: true },
            orderBy: { createdAt: 'desc' },
            take: 1000,
          })
        : [],
      can('marketing')
        ? this.ctx.db.campaign.findMany({ orderBy: { createdAt: 'desc' }, take: 500 })
        : [],
      this.ctx.db.auditEntry.findMany({
        where: a.owner ? {} : { actorId: a.id },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      can('subscriptions')
        ? this.ctx.db.clubEdition.findMany({ orderBy: { month: 'desc' }, take: 100 })
        : [],
      can('catalog') ? this.ctx.db.coupon.findMany({ take: 500 }) : [],
      can('catalog')
        ? this.ctx.db.stockMovement.findMany({ orderBy: { createdAt: 'desc' }, take: 1000 })
        : [],
    ]);
    const names = new Map(users.map((u) => [u.id, u.name]));
    return {
      version: 2,
      products: products.map(
        (p) =>
          ({
            ...productDto(p, can('catalog')),
            costCents: can('catalog') ? p.costCents : 0,
          }) as Operations['products'][number],
      ),
      clients: clients.map((c) => customerDto(c, can('customers'))),
      orders: orders.map((o) => {
        const dto = orderDto(o, can('orders') || can('shipping'));
        if (
          !['orders', 'shipping', 'finance', 'support', 'subscriptions'].some((p) =>
            can(p as Permission),
          )
        )
          dto.address = {
            name: '',
            email: '',
            phone: '',
            cep: '',
            street: '',
            number: '',
            extra: '',
            district: '',
            city: '',
            state: '',
          };
        return dto;
      }),
      subscriptions: subscriptions.map(subscriptionDto),
      charges:
        can('finance') || can('orders')
          ? orders.map(chargeDto).filter((v): v is Operations['charges'][number] => !!v)
          : [],
      jobs: jobs.map(jobDto),
      printers: printers.map((p) => ({
        id: p.id,
        name: p.name,
        status: p.status as Operations['printers'][number]['status'],
        capacity: p.capacity,
      })),
      expenses: expenses.map((e) => ({
        id: e.id,
        name: e.name,
        category: e.category,
        amountCents: e.amountCents,
        status: e.status as Operations['expenses'][number]['status'],
        date: day(e.date),
      })),
      tickets: tickets.map((t) => ticketDto(t, true)),
      team: users.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: roleNames[u.role] || u.role,
        status: u.enabled ? 'Ativo' : 'Inativo',
        permissions: u.permissions as Permission[],
      })),
      settings: s.store,
      workspace: s.workspace,
      campaigns: campaigns.map((c) => ({
        id: c.id,
        subject: c.subject,
        message: c.message,
        date: day(c.scheduledAt || c.createdAt),
        recipients: c.recipients,
        status: c.state,
        previewText: c.previewText,
        scheduledAt: c.scheduledAt?.toISOString(),
        audience: c.audience as Campaign['audience'],
      })),
      audit: logs.map((l) => ({
        id: l.id,
        actor: names.get(l.actorId) || (l.actorId === 'system' ? 'Sistema' : 'Equipe'),
        date: instant(l.createdAt),
        action: l.action,
        entity: l.entity,
      })),
      prayers: prayers.map((p) => prayerDto(p, 'user/' + a.id, true)),
      newsletter: null,
      processed: {},
      invitations: a.owner ? await this.team.listInvitations(a) : [],
      editions: editions.map((e) => ({
        ...data<Operations['editions'][number]>(e.data),
        id: e.id,
        status: e.status as Operations['editions'][number]['status'],
      })),
      coupons: coupons.map((c) => ({
        ...data<Operations['coupons'][number]>(c.data),
        id: c.id,
        used: c.used,
        active: c.active,
      })),
      stockMovements: movements.map((m) => ({
        id: m.id,
        productId: m.productId,
        delta: m.delta,
        reason: m.reason,
        date: instant(m.createdAt),
        actor: names.get(m.actorId) || 'Sistema',
      })),
    };
  }
  async execute(actor: Actor | null, value: unknown) {
    const c = commandSchema.parse(value),
      a = permit(actor, permissionMap[c.type.split('.')[0]]);
    switch (c.type) {
      case 'product.save':
        return this.catalog.save(a, c.product);
      case 'product.archive':
        await this.ctx.db.product.update({
          where: { id: c.id },
          data: { active: false, archived: true, version: { increment: 1 } },
        });
        break;
      case 'stock.adjust':
        return this.catalog.stock(a, c.productId, c.delta, c.reason);
      case 'workspace.save':
        return this.catalog.saveSettings(a, c.settings, true);
      case 'settings.save':
        return this.catalog.saveSettings(a, c.settings);
      case 'customer.save': {
        const v = c.customer;
        await transaction(this.ctx.db, async (tx) => {
          const id = v.id,
            address = {
              name: v.name,
              email: normalizeEmail(v.email),
              phone: v.phone || '',
              document: v.document || '',
              cep: v.cep || '',
              street: v.street || '',
              number: v.number || '',
              extra: v.extra || '',
              district: v.district || '',
              city: v.city || '',
              state: v.state || '',
            };
          if (id) {
            const current = requireValue(await tx.customer.findUnique({ where: { id } }));
            await tx.customer.update({
              where: { id },
              data: {
                name: v.name,
                email: normalizeEmail(v.email),
                address: json({ ...data<Address>(current.address), ...address }),
                notes: v.notes,
                active: v.status ? v.status === 'Ativo' : undefined,
              },
            });
          } else
            await tx.customer.create({
              data: {
                name: v.name,
                email: normalizeEmail(v.email),
                address: json(address),
                notes: v.notes || '',
              },
            });
        });
        break;
      }
      case 'customer.archive':
        await this.ctx.db.customer.update({ where: { id: c.id }, data: { active: false } });
        break;
      case 'customer.delete':
        return this.deleteCustomer(a, c.id);
      case 'order.delete':
        return this.deleteOrder(a, c.id);
      case 'order.create':
        return this.manualOrder(a, c);
      case 'orders.batch':
        await transaction(this.ctx.db, async (tx) => {
          for (const id of [...new Set(c.ids)].sort()) {
            await lock(tx, 'order/' + id);
            requireValue(await tx.order.findUnique({ where: { id }, select: { id: true } }));
            if (c.action === 'priority')
              await tx.order.update({ where: { id }, data: { priority: 'Alta' } });
            else if (c.action === 'cancel') await this.cancelOrder(tx, a, id);
            else {
              permit(a, 'production');
              await this.orders.payments.production(tx, id);
            }
          }
        });
        break;
      case 'order.update':
        await transaction(this.ctx.db, async (tx) => {
          await lock(tx, 'order/' + c.id);
          const o = requireValue(
            await tx.order.findUnique({
              where: { id: c.id },
              include: { payment: true, job: true },
            }),
          );
          if (c.status === 'Cancelado') await this.cancelOrder(tx, a, o.id);
          else if (c.status !== o.status) {
            if (['Enviado', 'Entregue'].includes(c.status))
              throw new DomainError(
                'USE_SHIPPING',
                'Confirme postagem e entrega pelo fluxo de expedição.',
              );
            if (['Cancelado', 'Enviado', 'Entregue'].includes(o.status))
              throw new DomainError('ORDER_CLOSED', 'O pedido não pode voltar de etapa.', 409);
            if (c.status === 'Aguardando pagamento' && o.payment?.status === 'Pago')
              throw new DomainError('PAYMENT_CONFIRMED', 'O pagamento já está confirmado.');
            if (c.status !== 'Aguardando pagamento' && o.payment?.status !== 'Pago')
              throw new DomainError('PAYMENT_REQUIRED', 'Confirme o pagamento pelo provedor.');
            if (c.status === 'Em produção') await this.orders.payments.production(tx, o.id);
            if (
              c.status === 'Em acabamento' &&
              !['Acabamento', 'Conferência', 'Pronto'].includes(o.job?.stage || '')
            )
              throw new DomainError('PRODUCTION_STAGE', 'Avance a produção pela fila.');
            if (c.status === 'Pronto para envio' && o.job?.stage !== 'Pronto')
              throw new DomainError('PRODUCTION_STAGE', 'Conclua a conferência da produção.');
            await tx.order.update({ where: { id: o.id }, data: { status: c.status } });
          }
          await tx.order.update({
            where: { id: o.id },
            data: {
              priority: c.priority,
              notes: c.notes,
              due: new Date(c.due),
              version: { increment: 1 },
            },
          });
        });
        break;
      case 'production.create':
        await transaction(this.ctx.db, async (tx) => {
          await this.orders.payments.production(tx, c.orderId);
          const p = c.printer ? await tx.printer.findUnique({ where: { name: c.printer } }) : null;
          await tx.productionJob.update({
            where: { orderId: c.orderId },
            data: { printerId: p?.id, hours: c.hours, assignee: c.assignee },
          });
        });
        break;
      case 'production.update': {
        const printer = c.printer
          ? await this.ctx.db.printer.findUnique({ where: { name: c.printer } })
          : null;
        if (c.printer && !printer)
          throw new DomainError('PRINTER_NOT_FOUND', 'Selecione uma impressora cadastrada.');
        await this.ctx.db.productionJob.update({
          where: { id: c.id },
          data: {
            printerId: printer?.id,
            hours: c.hours,
            assignee: c.assignee,
            due: new Date(c.due),
            priority: c.priority,
            data: json({ notes: c.notes, material: c.material, grams: c.grams }),
          },
        });
        break;
      }
      case 'production.advance':
        return this.advance(a, c.id);
      case 'printer.update': {
        if (
          c.status === 'Disponível' &&
          (await this.ctx.db.productionJob.findFirst({
            where: { printerId: c.id, stage: 'Impressão', order: { status: { not: 'Cancelado' } } },
          }))
        )
          throw new DomainError(
            'PRINTER_BUSY',
            'Finalize ou interrompa a impressão antes de liberar a máquina.',
          );
        await this.ctx.db.printer.update({ where: { id: c.id }, data: { status: c.status } });
        break;
      }
      case 'shipping.label':
        return this.shipping.request(a, c.id, c.action);
      case 'shipping.dispatch':
        return this.shipping.dispatch(a, c.id, c.tracking, c.carrier);
      case 'shipping.deliver': {
        const s = requireValue(await this.ctx.db.shipment.findUnique({ where: { orderId: c.id } }));
        if (this.ctx.config.INTEGRATIONS_MODE === 'mock') {
          await this.ctx.db.shipment.update({ where: { id: s.id }, data: { state: 'delivered' } });
          await this.ctx.db.order.update({ where: { id: c.id }, data: { status: 'Entregue' } });
        } else await this.shipping.reconcile(s.id);
        break;
      }
      case 'charge.pay':
        return this.orders.payments.mockApprove(c.id);
      case 'charge.refund': {
        const p = requireValue(await this.ctx.db.paymentIntent.findUnique({ where: { id: c.id } }));
        await transaction(this.ctx.db, async (tx) => {
          await this.mail.event(tx, 'refund-request/' + p.id, 'refund-order', p.orderId, {
            orderId: p.orderId,
            reason: c.reason,
          });
          await audit(tx, a.id, 'Estorno solicitado', p.orderId);
        });
        return;
      }
      case 'expense.create':
        await transaction(this.ctx.db, async (tx) => {
          const e = await tx.expense.create({
            data: { ...c.expense, date: new Date(c.expense.date) },
          });
          if (e.status === 'Pago')
            await tx.ledgerEntry.create({
              data: { eventKey: 'expense/' + e.id, kind: 'expense', amountCents: -e.amountCents },
            });
        });
        break;
      case 'expense.pay':
        await transaction(this.ctx.db, async (tx) => {
          const e = requireValue(await tx.expense.findUnique({ where: { id: c.id } }));
          await tx.expense.update({ where: { id: e.id }, data: { status: 'Pago' } });
          await tx.ledgerEntry.upsert({
            where: { eventKey: 'expense/' + e.id },
            create: { eventKey: 'expense/' + e.id, kind: 'expense', amountCents: -e.amountCents },
            update: {},
          });
        });
        break;
      case 'subscription.state':
        if (c.status === 'Pagamento pendente')
          throw new DomainError(
            'PROVIDER_STATE',
            'O estado de pagamento é controlado pelo provedor.',
          );
        return this.subscriptions.change(
          a,
          c.id,
          {
            action:
              c.status === 'Pausada' ? 'pause' : c.status === 'Cancelada' ? 'cancel' : 'resume',
          },
          true,
        );
      case 'subscription.renew': {
        if (this.ctx.config.INTEGRATIONS_MODE !== 'mock') {
          const sub = requireValue(
            await this.ctx.db.subscription.findUnique({ where: { id: c.id } }),
          );
          if (sub.payment === 'card') {
            if (!sub.providerId)
              throw new DomainError(
                'SUBSCRIPTION_SYNC_REQUIRED',
                'A autorização ainda precisa ser conciliada.',
                409,
              );
            for (const invoice of await this.ctx.payments.invoices(sub.providerId))
              await this.subscriptions.recurringPayment(invoice);
          } else {
            if (sub.nextRenewal > new Date())
              throw new DomainError('CYCLE_NOT_DUE', 'O próximo ciclo ainda não venceu.', 409);
            await this.subscriptions.tick();
          }
          break;
        }
        const s = requireValue(await this.ctx.db.subscription.findUnique({ where: { id: c.id } }));
        const cycle = await transaction(this.ctx.db, (tx) =>
          this.subscriptions.cycle(
            tx,
            s.id,
            s.status === 'Pagamento pendente' ? month(s.createdAt) : month(s.nextRenewal),
          ),
        );
        if (c.result === 'Pago') {
          const p = requireValue(
            await this.ctx.db.paymentIntent.findUnique({
              where: { orderId: requireValue(cycle.orderId) },
            }),
          );
          await this.orders.payments.mockApprove(p.id);
        }
        break;
      }
      case 'edition.save':
        await this.validateEdition(c.edition.profiles);
        await this.ctx.db.clubEdition.upsert({
          where: { id: c.edition.id },
          create: {
            id: c.edition.id,
            month: c.edition.month,
            name: c.edition.name,
            status: c.edition.status,
            data: json(c.edition),
          },
          update: {
            month: c.edition.month,
            name: c.edition.name,
            status: c.edition.status,
            data: json(c.edition),
          },
        });
        break;
      case 'edition.activate':
        await transaction(this.ctx.db, async (tx) => {
          const e = requireValue(await tx.clubEdition.findUnique({ where: { id: c.id } })),
            d = data<Operations['editions'][number]>(e.data),
            s = await settings(tx);
          await tx.clubEdition.update({ where: { id: e.id }, data: { active: true } });
          await tx.appSetting.update({
            where: { key: 'store' },
            data: {
              data: json({
                ...s.store,
                edition: e.name,
                editionMonth: e.month,
                dispatchDay: d.dispatchDay,
                profiles: d.profiles,
              }),
              version: { increment: 1 },
            },
          });
        });
        break;
      case 'coupon.save':
        await this.ctx.db.coupon.upsert({
          where: { id: c.coupon.id },
          create: {
            id: c.coupon.id,
            code: c.coupon.code.trim().toUpperCase(),
            limit: c.coupon.limit,
            active: c.coupon.active,
            data: json(c.coupon),
          },
          update: {
            code: c.coupon.code.trim().toUpperCase(),
            limit: c.coupon.limit,
            active: c.coupon.active,
            data: json(c.coupon),
          },
        });
        break;
      case 'coupon.archive':
        await this.ctx.db.coupon.update({ where: { id: c.id }, data: { active: false } });
        break;
      case 'ticket.reply':
        return this.content.staffReply(a, c);
      case 'prayer.review':
        return this.content.moderate(a, c.id, c.status, c.note);
      case 'prayer.moderate': {
        const p = requireValue(await this.ctx.db.prayer.findUnique({ where: { id: c.id } }));
        return this.content.moderate(
          a,
          p.id,
          p.moderation === 'Publicado' ? 'Oculto' : 'Publicado',
          '',
        );
      }
      case 'campaign.create':
      case 'campaign.save': {
        const v = c.campaign,
          id = 'id' in v ? v.id : undefined;
        if (id) {
          const old = await this.ctx.db.campaign.findUnique({ where: { id } });
          if (old && !['Rascunho', 'Cancelada'].includes(old.state))
            throw new DomainError(
              'CAMPAIGN_LOCKED',
              'Cancele o agendamento antes de editar o conteúdo.',
              409,
            );
        }
        const d = {
          subject: v.subject,
          message: v.message,
          previewText: 'previewText' in v ? v.previewText || '' : '',
          audience: 'audience' in v ? v.audience || 'Inscritos em oração' : 'Inscritos em oração',
          state: 'Rascunho',
          scheduledAt: new Date(
            'scheduledAt' in v && v.scheduledAt
              ? v.scheduledAt
              : v.date + 'T' + (await settings(this.ctx.db)).workspace.prayerSendHour + ':00-03:00',
          ),
        };
        if (id) {
          const previous = await this.ctx.db.campaign.findUnique({ where: { id } });
          if (
            previous &&
            (!['Rascunho', 'Cancelada'].includes(previous.state) ||
              (await this.ctx.db.outboxEvent.findFirst({ where: { aggregateId: id } })))
          )
            throw new DomainError(
              'CAMPAIGN_IMMUTABLE',
              'Crie um novo rascunho para alterar uma oração que já entrou no processamento.',
              409,
            );
        }
        if (id)
          await this.ctx.db.campaign.upsert({ where: { id }, create: { id, ...d }, update: d });
        else await this.ctx.db.campaign.create({ data: d });
        break;
      }
      case 'campaign.action': {
        const campaign = requireValue(
          await this.ctx.db.campaign.findUnique({ where: { id: c.id } }),
        );
        if (c.action === 'schedule') {
          if (await this.ctx.db.outboxEvent.findFirst({ where: { aggregateId: campaign.id } }))
            throw new DomainError(
              'CAMPAIGN_IMMUTABLE',
              'Crie um novo rascunho para um novo envio.',
              409,
            );
          if (!campaign.scheduledAt || campaign.scheduledAt < new Date())
            throw new DomainError('SCHEDULE_IN_PAST', 'Escolha uma data e um horário futuros.');
          if (!['Rascunho', 'Cancelada'].includes(campaign.state))
            throw new DomainError(
              'CAMPAIGN_STATE',
              'Esta campanha já foi agendada ou enviada.',
              409,
            );
        }
        await this.ctx.db.campaign.update({
          where: { id: c.id },
          data: {
            state:
              c.action === 'schedule'
                ? 'Agendada'
                : c.action === 'cancel'
                  ? 'Cancelada'
                  : 'Rascunho',
          },
        });
        break;
      }
      case 'invite.create':
        return this.team.invite(a, c);
      case 'invite.resend':
        return this.team.resend(a, c.id);
      case 'invite.revoke':
        return this.team.revoke(a, c.id);
      case 'team.save':
        return this.team.save(a, c.member);
      default: {
        const exhaustive: never = c;
        throw new Error(String(exhaustive));
      }
    }
    await audit(this.ctx.db, a.id, c.type, 'id' in c ? c.id : 'operation');
  }
  private async validateEdition(profiles: Operations['settings']['profiles']) {
    for (const ids of Object.values(profiles))
      for (const id of ids)
        requireValue(
          await this.ctx.db.product.findFirst({ where: { id, active: true, archived: false } }),
          'Uma peça da edição está indisponível.',
        );
  }
  /**
   * Hard delete is only for orders where no money or goods moved (tests, abandoned carts).
   * Anything with a captured payment, ledger, label or started production must be cancelled
   * or kept for accounting and tracking.
   */
  private async deleteOrder(a: Actor, id: string) {
    await transaction(this.ctx.db, async (tx) => {
      await lock(tx, 'order/' + id);
      const o = requireValue(
        await tx.order.findUnique({
          where: { id },
          include: {
            payment: { include: { parts: { include: { refunds: true } }, ledger: true } },
            shipment: true,
            job: true,
          },
        }),
        'Pedido não encontrado.',
      );
      const parts = o.payment?.parts || [];
      const moneyMoved =
        parts.some((p) => ['approved', 'refunded', 'charged_back', 'unknown'].includes(p.status)) ||
        parts.some((p) => p.refunds.length > 0) ||
        (o.payment?.ledger.length || 0) > 0;
      if (moneyMoved)
        throw new DomainError(
          'ORDER_HAS_PAYMENT',
          'Este pedido tem pagamento registrado. Cancele-o (com estorno) para manter o histórico financeiro.',
          409,
        );
      if (o.shipment?.providerId || (o.job && o.job.startedAt))
        throw new DomainError(
          'ORDER_IN_FULFILLMENT',
          'Este pedido já tem etiqueta ou produção iniciada. Cancele-o em vez de excluir.',
          409,
        );
      // A Pix already issued at the provider could still be paid: cancel first.
      if (
        parts.some((p) => p.providerId && !['cancelled', 'rejected', 'expired'].includes(p.status))
      )
        throw new DomainError(
          'CANCEL_FIRST',
          'Cancele o pedido primeiro. A exclusão fica disponível quando a cobrança for encerrada no Mercado Pago.',
          409,
        );
      if (o.status !== 'Cancelado') await this.orders.payments.release(tx, id);
      await tx.outboxEvent.updateMany({
        where: { aggregateId: id, state: { in: ['pending', 'enqueued'] } },
        data: { state: 'cancelled', errorCode: 'ORDER_DELETED' },
      });
      await tx.subscriptionCycle.updateMany({ where: { orderId: id }, data: { orderId: null } });
      await tx.session.deleteMany({ where: { guestOrderId: id } });
      await tx.stockReservation.deleteMany({ where: { orderId: id } });
      if (o.payment) {
        await tx.paymentPart.deleteMany({ where: { intentId: o.payment.id } });
        await tx.paymentIntent.delete({ where: { id: o.payment.id } });
      }
      await tx.productionJob.deleteMany({ where: { orderId: id } });
      await tx.shipment.deleteMany({ where: { orderId: id } });
      await tx.orderItem.deleteMany({ where: { orderId: id } });
      await tx.order.delete({ where: { id } });
      await audit(tx, a.id, 'Pedido excluído', id);
    });
  }
  /** Only customers without orders or subscriptions; otherwise archive keeps history. */
  private async deleteCustomer(a: Actor, id: string) {
    await transaction(this.ctx.db, async (tx) => {
      const c = requireValue(
        await tx.customer.findUnique({
          where: { id },
          include: {
            user: true,
            _count: { select: { orders: true, subscriptions: true } },
          },
        }),
        'Cliente não encontrado.',
      );
      if (c._count.orders || c._count.subscriptions)
        throw new DomainError(
          'CUSTOMER_HAS_HISTORY',
          'Este cliente tem pedidos ou assinatura. Exclua os pedidos de teste antes ou arquive o cliente.',
          409,
        );
      if (c.user?.owner || (c.user && c.user.role !== 'customer'))
        throw new DomainError(
          'PROTECTED_ACCOUNT',
          'Contas da equipe não podem ser excluídas aqui.',
          409,
        );
      const tickets = await tx.ticket.findMany({ where: { customerId: id }, select: { id: true } });
      await tx.ticketMessage.deleteMany({ where: { ticketId: { in: tickets.map((t) => t.id) } } });
      await tx.ticket.deleteMany({ where: { customerId: id } });
      await tx.customer.delete({ where: { id } });
      if (c.user) await tx.user.delete({ where: { id: c.user.id } });
      await audit(tx, a.id, 'Cliente excluído', id);
    });
  }
  private async cancelOrder(tx: Transaction, a: Actor, id: string) {
    const o = requireValue(
      await tx.order.findUnique({
        where: { id },
        include: { payment: { include: { parts: true } }, job: true, shipment: true },
      }),
    );
    if (['Enviado', 'Entregue'].includes(o.status))
      throw new DomainError(
        'RETURN_REQUIRED',
        'O pedido foi postado. Abra um atendimento de devolução.',
        409,
      );
    if (o.status === 'Cancelado') return;
    await tx.order.update({
      where: { id },
      data: { status: 'Cancelado', version: { increment: 1 } },
    });
    await this.orders.payments.release(tx, id);
    if (o.payment)
      await this.mail.event(tx, 'cancel-pending/' + o.payment.id, 'payment-cancel', o.id, {
        intentId: o.payment.id,
      });
    if (o.job?.stage === 'Impressão' && o.job.printerId)
      await tx.printer.update({ where: { id: o.job.printerId }, data: { status: 'Manutenção' } });
    if (o.payment?.parts.some((p) => p.status === 'approved'))
      await this.mail.event(tx, 'cancel-refund/' + id, 'refund-order', id, {
        orderId: id,
        reason: 'Cancelamento do pedido pela loja.',
      });
    if (o.shipment && !['cancelled', 'posted', 'delivered'].includes(o.shipment.state))
      await this.mail.event(tx, 'cancel-label/' + o.shipment.id, 'shipping-cancel', o.shipment.id, {
        shipmentId: o.shipment.id,
      });
    if (o.couponId)
      await tx.coupon.update({ where: { id: o.couponId }, data: { used: { decrement: 1 } } });
    await audit(tx, a.id, 'Pedido cancelado', id);
  }
  private async advance(actor: Actor, id: string) {
    await transaction(this.ctx.db, async (tx) => {
      const j = requireValue(
        await tx.productionJob.findUnique({
          where: { id },
          include: { order: { include: { payment: true } } },
        }),
      );
      await lock(tx, 'production/' + id);
      if (j.order.payment?.status !== 'Pago' || j.order.status === 'Cancelado')
        throw new DomainError(
          'PAYMENT_REQUIRED',
          'Este pedido não está liberado para produção.',
          409,
        );
      const stages = ['Fila', 'Impressão', 'Acabamento', 'Conferência', 'Pronto'],
        index = stages.indexOf(j.stage);
      if (index < 0 || index === 4) return;
      const next = stages[index + 1];
      if (next === 'Impressão') {
        if (!j.printerId)
          throw new DomainError('PRINTER_REQUIRED', 'Selecione uma impressora antes de iniciar.');
        await lock(tx, 'printer/' + j.printerId);
        const p = requireValue(await tx.printer.findUnique({ where: { id: j.printerId } }));
        if (p.status !== 'Disponível')
          throw new DomainError('PRINTER_BUSY', 'A impressora não está disponível.', 409);
        await tx.printer.update({ where: { id: p.id }, data: { status: 'Imprimindo' } });
      }
      if (j.stage === 'Impressão' && j.printerId)
        await tx.printer.update({ where: { id: j.printerId }, data: { status: 'Disponível' } });
      await tx.productionJob.update({
        where: { id },
        data: {
          stage: next,
          startedAt: next === 'Impressão' ? new Date() : undefined,
          completedAt: next === 'Pronto' ? new Date() : undefined,
        },
      });
      await tx.order.update({
        where: { id: j.orderId },
        data: {
          status:
            next === 'Pronto'
              ? 'Pronto para envio'
              : next === 'Impressão'
                ? 'Em produção'
                : 'Em acabamento',
        },
      });
      if (next === 'Impressão') {
        const a = data<Address>(j.order.address);
        await this.mail.email(tx, 'production-started/' + j.id, j.orderId, a.email, {
          kind: 'production-started',
          name: a.name,
          orderNumber: 'MEO-' + String(j.order.number).padStart(6, '0'),
          actionUrl: await this.mail.orderUrl(tx, j.orderId),
        });
      }
      await audit(tx, actor.id, 'Produção: ' + next, id);
    });
  }
  private async manualOrder(actor: Actor, c: Extract<Command, { type: 'order.create' }>) {
    if (c.paid && this.ctx.config.INTEGRATIONS_MODE !== 'mock')
      throw new DomainError(
        'PROVIDER_CONFIRMATION_REQUIRED',
        'Não marque um pagamento real como recebido neste formulário.',
      );
    const o = await transaction(this.ctx.db, async (tx) => {
      const customer = requireValue(await tx.customer.findUnique({ where: { id: c.customerId } })),
        p = requireValue(await tx.product.findUnique({ where: { id: c.productId } })),
        product = data<Operations['products'][number]>(p.data),
        total = p.priceCents * c.quantity + c.shippingCents;
      if (total <= 0) throw new DomainError('TOTAL_INVALID', 'Valor inválido.');
      const item = {
        key: p.id,
        productId: p.id,
        name: p.name,
        image: product.image,
        imageIndex: product.imageIndex,
        color: product.colors[0],
        size: product.sizes[0],
        sizeIndex: 0,
        unitCents: p.priceCents,
        quantity: c.quantity,
        dedication: '',
      };
      if (!p.active || p.archived)
        throw new DomainError('PRODUCT_UNAVAILABLE', 'O produto não está disponível.', 409);
      const config = await settings(tx);
      if (config.workspace.inventoryPolicy === 'stock') {
        await lock(tx, 'stock/' + p.id);
        const current = requireValue(await tx.product.findUnique({ where: { id: p.id } }));
        if (current.stock - current.reserved < c.quantity)
          throw new DomainError('OUT_OF_STOCK', 'Não há estoque disponível.', 409);
      }
      const order = await tx.order.create({
        data: {
          customerId: customer.id,
          totalCents: total,
          subtotalCents: p.priceCents * c.quantity,
          discountCents: 0,
          shippingCents: c.shippingCents,
          address: customer.address as import('@maos-em-oracao/database').Prisma.InputJsonValue,
          data: { manual: true },
          due: new Date(c.due),
          items: {
            create: {
              productId: p.id,
              quantity: c.quantity,
              unitCents: p.priceCents,
              costCents: p.costCents * c.quantity,
              data: json(item),
            },
          },
          payment: {
            create: {
              amountCents: total,
              method: 'pix',
              due: new Date(c.due),
              parts: {
                create: {
                  method: 'pix',
                  amountCents: total,
                  idempotencyKey: 'manual-' + crypto.randomUUID(),
                },
              },
            },
          },
        },
      });
      if (config.workspace.inventoryPolicy === 'stock') {
        await tx.product.update({
          where: { id: p.id },
          data: { reserved: { increment: c.quantity } },
        });
        await tx.stockReservation.create({
          data: {
            orderId: order.id,
            productId: p.id,
            quantity: c.quantity,
            expiresAt: new Date(c.due),
          },
        });
      }
      await audit(tx, actor.id, 'Pedido manual criado', order.id);
      return order;
    });
    const payment = requireValue(
      await this.ctx.db.paymentIntent.findUnique({ where: { orderId: o.id } }),
    );
    if (c.paid) await this.orders.payments.mockApprove(payment.id);
    else await this.orders.payments.start(o.id);
  }
}

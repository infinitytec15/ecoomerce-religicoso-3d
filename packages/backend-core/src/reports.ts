import { z } from 'zod';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { transaction, type Prisma } from '@maos-em-oracao/database';
import type { Context } from './context';
import type { Permission } from '@maos-em-oracao/contracts';
import {
  orderInclude,
  orderDto,
  customerDto,
  productDto,
  subscriptionDto,
  jobDto,
  ticketDto,
  prayerDto,
} from './projections';
import {
  type Actor,
  permit,
  requireActor,
  requireValue,
  DomainError,
  json,
  data,
  audit,
  safeCsv,
  permissions,
  month,
} from './shared';
import { Notifications } from './notifications';
import { MediaService } from './media';
const resourcePermission: Record<string, Permission> = {
  orders: 'orders',
  subscriptions: 'subscriptions',
  customers: 'customers',
  products: 'catalog',
  production: 'production',
  shipping: 'shipping',
  finance: 'finance',
  expenses: 'finance',
  support: 'support',
  prayers: 'community',
  campaigns: 'marketing',
  team: 'team',
  editions: 'subscriptions',
  coupons: 'catalog',
  inventory: 'catalog',
  audit: 'reports',
};
const querySchema = z.object({
  cursor: z.string().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  status: z.string().max(50).optional(),
  q: z.string().max(120).optional(),
});
export class ReportsService {
  constructor(private ctx: Context) {}
  private authorize(actor: Actor | null, resource: string) {
    if (!resourcePermission[resource])
      throw new DomainError('REPORT_NOT_FOUND', 'Relatório não encontrado.', 404);
    const a = permit(actor, resourcePermission[resource]);
    if (resource === 'team' && !a.owner)
      throw new DomainError(
        'FORBIDDEN',
        'Relatório de acessos disponível apenas ao responsável.',
        403,
      );
    return a;
  }
  async page(actor: Actor | null, resource: string, raw: unknown) {
    const a = this.authorize(actor, resource),
      q = querySchema.parse(raw);
    if (q.from && q.to && q.from > q.to)
      throw new DomainError('INVALID_PERIOD', 'O início deve anteceder o fim.');
    const opts = {
        take: q.limit + 1,
        orderBy: { id: 'asc' as const },
        ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
      },
      dates = q.from || q.to ? { gte: q.from, lte: q.to } : undefined;
    const page = async <T extends { id: string }>(
      rows: Promise<T[]>,
      count: Promise<number>,
      map: (row: T) => unknown,
    ) => {
      const [items, total] = await Promise.all([rows, count]);
      const more = items.length > q.limit,
        visible = items.slice(0, q.limit);
      return { items: visible.map(map), total, nextCursor: more ? visible.at(-1)!.id : null };
    };
    switch (resource) {
      case 'orders': {
        const where: Prisma.OrderWhereInput = { createdAt: dates, status: q.status };
        return page(
          this.ctx.db.order.findMany({ ...opts, where, include: orderInclude }),
          this.ctx.db.order.count({ where }),
          (o) => orderDto(o, true),
        );
      }
      case 'subscriptions': {
        const where: Prisma.SubscriptionWhereInput = { createdAt: dates, status: q.status };
        return page(
          this.ctx.db.subscription.findMany({ ...opts, where }),
          this.ctx.db.subscription.count({ where }),
          subscriptionDto,
        );
      }
      case 'customers': {
        const where: Prisma.CustomerWhereInput = {
          createdAt: dates,
          ...(q.q
            ? {
                OR: [
                  { name: { contains: q.q, mode: 'insensitive' } },
                  { email: { contains: q.q, mode: 'insensitive' } },
                ],
              }
            : {}),
        };
        return page(
          this.ctx.db.customer.findMany({ ...opts, where }),
          this.ctx.db.customer.count({ where }),
          (c) => customerDto(c, true),
        );
      }
      case 'products': {
        const where: Prisma.ProductWhereInput = q.q
          ? {
              OR: [
                { name: { contains: q.q, mode: 'insensitive' } },
                { sku: { contains: q.q, mode: 'insensitive' } },
              ],
            }
          : {};
        return page(
          this.ctx.db.product.findMany({ ...opts, where }),
          this.ctx.db.product.count({ where }),
          (p) => productDto(p, true),
        );
      }
      case 'production': {
        const where: Prisma.ProductionJobWhereInput = { due: dates, stage: q.status };
        return page(
          this.ctx.db.productionJob.findMany({ ...opts, where, include: { printer: true } }),
          this.ctx.db.productionJob.count({ where }),
          jobDto,
        );
      }
      case 'shipping': {
        const where: Prisma.ShipmentWhereInput = { createdAt: dates, state: q.status };
        return page(
          this.ctx.db.shipment.findMany({ ...opts, where }),
          this.ctx.db.shipment.count({ where }),
          (s) => ({
            id: s.id,
            orderId: s.orderId,
            status: s.state,
            serviceId: s.serviceId,
            carrier: s.carrier,
            tracking: s.tracking,
            createdAt: s.createdAt,
          }),
        );
      }
      case 'finance': {
        const where: Prisma.LedgerEntryWhereInput = { createdAt: dates };
        return page(
          this.ctx.db.ledgerEntry.findMany({ ...opts, where }),
          this.ctx.db.ledgerEntry.count({ where }),
          (r) => ({
            id: r.id,
            intentId: r.intentId,
            kind: r.kind,
            amountCents: r.amountCents,
            eventKey: r.eventKey,
            createdAt: r.createdAt,
          }),
        );
      }
      case 'expenses': {
        const where: Prisma.ExpenseWhereInput = { date: dates, status: q.status };
        return page(
          this.ctx.db.expense.findMany({ ...opts, where }),
          this.ctx.db.expense.count({ where }),
          (r) => r,
        );
      }
      case 'support': {
        const where: Prisma.TicketWhereInput = { createdAt: dates, status: q.status };
        return page(
          this.ctx.db.ticket.findMany({
            ...opts,
            where,
            include: { messages: { orderBy: { createdAt: 'asc' } } },
          }),
          this.ctx.db.ticket.count({ where }),
          (r) => ticketDto(r, true),
        );
      }
      case 'prayers': {
        const where: Prisma.PrayerWhereInput = { createdAt: dates, moderation: q.status };
        return page(
          this.ctx.db.prayer.findMany({
            ...opts,
            where,
            include: { reactions: true, reports: true },
          }),
          this.ctx.db.prayer.count({ where }),
          (r) => prayerDto(r, 'user/' + a.id, true),
        );
      }
      case 'campaigns': {
        const where: Prisma.CampaignWhereInput = { createdAt: dates, state: q.status };
        return page(
          this.ctx.db.campaign.findMany({ ...opts, where }),
          this.ctx.db.campaign.count({ where }),
          (r) => ({
            id: r.id,
            subject: r.subject,
            state: r.state,
            scheduledAt: r.scheduledAt,
            recipients: r.recipients,
            audience: r.audience,
          }),
        );
      }
      case 'team': {
        const where: Prisma.UserWhereInput = { role: { not: 'customer' } };
        return page(
          this.ctx.db.user.findMany({ ...opts, where }),
          this.ctx.db.user.count({ where }),
          (r) => ({
            id: r.id,
            name: r.name,
            email: r.email,
            role: r.role,
            enabled: r.enabled,
            permissions: r.permissions,
            createdAt: r.createdAt,
          }),
        );
      }
      case 'editions':
        return page(
          this.ctx.db.clubEdition.findMany(opts),
          this.ctx.db.clubEdition.count(),
          (r) => ({
            id: r.id,
            name: r.name,
            month: r.month,
            status: r.status,
            active: r.active,
            ...data<object>(r.data),
          }),
        );
      case 'coupons':
        return page(this.ctx.db.coupon.findMany(opts), this.ctx.db.coupon.count(), (r) => ({
          id: r.id,
          code: r.code,
          used: r.used,
          limit: r.limit,
          active: r.active,
        }));
      case 'inventory': {
        const where: Prisma.StockMovementWhereInput = { createdAt: dates };
        return page(
          this.ctx.db.stockMovement.findMany({ ...opts, where }),
          this.ctx.db.stockMovement.count({ where }),
          (r) => r,
        );
      }
      case 'audit': {
        if (!a.owner)
          throw new DomainError(
            'FORBIDDEN',
            'Auditoria integral disponível apenas ao responsável.',
            403,
          );
        const where: Prisma.AuditEntryWhereInput = { createdAt: dates };
        return page(
          this.ctx.db.auditEntry.findMany({ ...opts, where }),
          this.ctx.db.auditEntry.count({ where }),
          (r) => r,
        );
      }
      default:
        throw new DomainError('REPORT_NOT_FOUND', 'Relatório não encontrado.', 404);
    }
  }
  async overview(actor: Actor | null, raw: unknown = {}) {
    const a = requireActor(actor);
    if (a.role === 'customer')
      throw new DomainError('FORBIDDEN', 'Acesso exclusivo à equipe.', 403);
    const can = (p: Permission) => a.owner || a.permissions.includes(p),
      now = new Date(),
      q = z
        .object({
          from: z.coerce.date().optional(),
          to: z.coerce.date().optional(),
          origin: z.enum(['Loja', 'Clube']).optional(),
        })
        .parse(raw),
      from = q.from || new Date(month(now) + '-01T00:00:00-03:00'),
      to = q.to || new Date(from);
    if (!q.to) to.setUTCMonth(to.getUTCMonth() + 1);
    if (from >= to) throw new DomainError('INVALID_PERIOD', 'O início deve anteceder o fim.');
    const [orders, active, mrr, pending, pendingCount, jobs, tickets, ledger] = await Promise.all([
      can('orders') || can('production')
        ? this.ctx.db.order.count({ where: { status: { notIn: ['Entregue', 'Cancelado'] } } })
        : 0,
      can('subscriptions') ? this.ctx.db.subscription.count({ where: { status: 'Ativa' } }) : 0,
      can('subscriptions')
        ? this.ctx.db.subscription.aggregate({
            where: { status: 'Ativa' },
            _sum: { priceCents: true },
          })
        : null,
      can('finance')
        ? this.ctx.db.paymentIntent.aggregate({
            where: { status: 'Pendente' },
            _sum: { amountCents: true },
          })
        : null,
      can('finance')
        ? this.ctx.db.paymentIntent.count({ where: { status: { in: ['Pendente', 'Recusado'] } } })
        : 0,
      can('production')
        ? this.ctx.db.productionJob.count({
            where: { stage: { not: 'Pronto' }, order: { status: { not: 'Cancelado' } } },
          })
        : 0,
      can('support') ? this.ctx.db.ticket.count({ where: { status: { not: 'Resolvido' } } }) : 0,
      can('finance')
        ? this.ctx.db.ledgerEntry.findMany({
            where: {
              createdAt: { gte: from, lt: to },
              ...(q.origin ? { intent: { order: { type: q.origin } } } : {}),
            },
            select: { kind: true, amountCents: true, createdAt: true },
          })
        : [],
    ]);
    const gross = ledger.filter((l) => l.amountCents > 0).reduce((n, l) => n + l.amountCents, 0),
      outgoing = -ledger.filter((l) => l.amountCents < 0).reduce((n, l) => n + l.amountCents, 0),
      refunds = -ledger
        .filter((l) => ['refund', 'chargeback'].includes(l.kind))
        .reduce((n, l) => n + l.amountCents, 0);
    const daily = new Map<
      string,
      { date: string; income: number; expense: number; orders: number }
    >();
    for (const l of ledger) {
      const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(
          l.createdAt,
        ),
        v = daily.get(date) || { date, income: 0, expense: 0, orders: 0 };
      if (l.amountCents > 0) v.income += l.amountCents;
      else v.expense -= l.amountCents;
      daily.set(date, v);
    }
    const [distribution, pipeline, datedOrders] = await Promise.all([
      can('finance')
        ? this.ctx.db.paymentIntent.groupBy({
            by: ['method'],
            where: {
              paidAt: { gte: from, lt: to },
              ...(q.origin ? { order: { type: q.origin } } : {}),
            },
            _sum: { amountCents: true },
            _count: { _all: true },
          })
        : [],
      can('orders') || can('production')
        ? this.ctx.db.order.groupBy({
            by: ['status'],
            where: { createdAt: { gte: from, lt: to }, ...(q.origin ? { type: q.origin } : {}) },
            _count: { _all: true },
          })
        : [],
      can('orders')
        ? this.ctx.db.order.findMany({
            where: { createdAt: { gte: from, lt: to }, ...(q.origin ? { type: q.origin } : {}) },
            select: { createdAt: true },
          })
        : [],
    ]);
    for (const o of datedOrders) {
      const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(
          o.createdAt,
        ),
        v = daily.get(date) || { date, income: 0, expense: 0, orders: 0 };
      v.orders++;
      daily.set(date, v);
    }
    return {
      distribution: distribution.map((v) => ({
        method: v.method,
        cents: v._sum.amountCents || 0,
        count: v._count._all,
      })),
      pipeline: pipeline.map((v) => ({ status: v.status, count: v._count._all })),
      paidCount: distribution.reduce((n, v) => n + v._count._all, 0),
      ordersInProgress: orders,
      activeSubscriptions: active,
      mrrCents: mrr?._sum.priceCents || 0,
      pendingCents: pending?._sum.amountCents || 0,
      pendingCharges: pendingCount,
      productionOpen: jobs,
      supportOpen: tickets,
      grossCents: gross,
      refundsCents: refunds,
      expensesCents: outgoing - refunds,
      netCents: gross - outgoing,
      daily: [...daily.values()].sort((x, y) => x.date.localeCompare(y.date)),
      period: { from: from.toISOString(), to: to.toISOString() },
    };
  }
  async export(actor: Actor | null, resource: string, filters: unknown) {
    const a = this.authorize(actor, resource);
    permit(a, 'reports');
    const parsed = querySchema.parse(filters),
      mail = new Notifications(this.ctx);
    const job = await transaction(this.ctx.db, async (tx) => {
      const row = await tx.reportExport.create({
        data: {
          actorId: a.userId || a.id,
          kind: resource,
          data: json(parsed),
          expiresAt: new Date(Date.now() + 86400000),
        },
      });
      await mail.event(tx, 'export/' + row.id, 'report-export', row.id, { exportId: row.id });
      await audit(tx, a.id, 'Exportação solicitada: ' + resource, row.id);
      return row;
    });
    return { id: job.id, status: job.state };
  }
  async generate(id: string) {
    const row = requireValue(await this.ctx.db.reportExport.findUnique({ where: { id } })),
      user = requireValue(await this.ctx.db.user.findUnique({ where: { id: row.actorId } }));
    if (!user.enabled || user.role === 'customer')
      throw new DomainError('FORBIDDEN', 'Acesso ao relatório revogado.', 403);
    const actor: Actor = {
      id: user.id,
      userId: user.id,
      name: user.name,
      email: user.email,
      role: user.role as Actor['role'],
      permissions: user.owner ? permissions : (user.permissions as Permission[]),
      owner: user.owner,
      demo: false,
    };
    permit(actor, 'reports');
    await this.ctx.db.reportExport.update({ where: { id }, data: { state: 'processing' } });
    const rows: unknown[] = [];
    let cursor: string | undefined;
    do {
      const page = await this.page(actor, row.kind, {
        ...data<object>(row.data),
        limit: 200,
        cursor,
      });
      if (page.total > 10000)
        throw new DomainError(
          'REPORT_TOO_LARGE',
          'Restrinja o período para exportar até 10 mil registros.',
        );
      rows.push(...page.items);
      cursor = page.nextCursor || undefined;
    } while (cursor);
    const records = rows as Record<string, unknown>[],
      columns = records.length ? Object.keys(records[0]) : ['resultado'],
      text =
        columns.map(safeCsv).join(';') +
        '\n' +
        records
          .map((r) =>
            columns
              .map((k) => safeCsv(r[k] && typeof r[k] === 'object' ? JSON.stringify(r[k]) : r[k]))
              .join(';'),
          )
          .join('\n'),
      bytes = Buffer.from('\uFEFF' + text, 'utf8');
    if (bytes.length > 8 * 1024 * 1024)
      throw new DomainError('REPORT_TOO_LARGE', 'Reduza o período ou selecione outro relatório.');
    const key = 'reports/' + row.id + '.csv';
    if (this.ctx.config.INTEGRATIONS_MODE === 'mock') {
      const file = new MediaService(this.ctx).path(key);
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, bytes, { mode: 0o600 });
    } else await this.ctx.media.put(key, bytes, 'text/csv; charset=utf-8', true);
    await this.ctx.db.reportExport.update({
      where: { id },
      data: { state: 'ready', storageKey: key },
    });
  }
  async status(actor: Actor | null, id: string) {
    const a = requireActor(actor),
      row = requireValue(await this.ctx.db.reportExport.findUnique({ where: { id } }));
    if (!a.owner && row.actorId !== a.userId)
      throw new DomainError('NOT_FOUND', 'Exportação não encontrada.', 404);
    permit(a, 'reports');
    this.authorize(a, row.kind);
    return {
      id: row.id,
      status: row.state,
      expiresAt: row.expiresAt.toISOString(),
      downloadUrl: row.state === 'ready' ? '/api/v1/admin/exports/' + row.id + '/download' : null,
    };
  }
  async download(actor: Actor | null, id: string) {
    await this.status(actor, id);
    const row = requireValue(await this.ctx.db.reportExport.findUnique({ where: { id } }));
    if (row.state !== 'ready' || !row.storageKey || row.expiresAt < new Date())
      throw new DomainError(
        'EXPORT_EXPIRED',
        'A exportação expirou ou ainda não está pronta.',
        410,
      );
    const bytes =
      this.ctx.config.INTEGRATIONS_MODE === 'mock'
        ? await readFile(new MediaService(this.ctx).path(row.storageKey))
        : Buffer.from(await (await this.ctx.media.get(row.storageKey, true)).arrayBuffer());
    return { bytes, filename: row.kind + '-' + row.id + '.csv' };
  }
}

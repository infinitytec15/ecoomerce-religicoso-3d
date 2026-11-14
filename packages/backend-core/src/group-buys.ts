import {
  transaction,
  lock,
  type Prisma,
  type PrismaClient,
  type Transaction,
} from '@maos-em-oracao/database';
import {
  groupBuyInputSchema,
  groupBuyJoinable,
  groupDifferenceCents,
  groupUnitCents,
  participantInitials,
  unitPriceCents,
  type AdminGroupBuy,
  type GroupBuyMode,
  type GroupBuyOrderSnapshot,
  type GroupBuyPublic,
  type GroupBuySummary,
  type InventoryProduct,
  type OrderItemInput,
} from '@maos-em-oracao/contracts';
import type { Context } from './context';
import { Notifications } from './notifications';
import {
  groupBuyAdminDto,
  groupBuyAdminOrderInclude,
  groupBuyInclude,
  groupBuyPublicDto,
  groupBuySummaryDto,
  type GroupBuyAdminOrderRow,
  type GroupBuyRow,
  type GroupBuyStats,
} from './projections';
import { type Actor, permit, requireValue, DomainError, data, audit } from './shared';

const OPEN_STATUSES = ['Aberta', 'Meta atingida'];
const MAX_INITIALS = 8;

/** What the payment flow does with a paid group order. */
export type GroupPaidOutcome = 'hold' | 'release' | 'fail';
/** A validated group checkout: the campaign, the unit price to charge and the order snapshot. */
export interface GroupCheckout {
  groupBuy: Prisma.GroupBuyGetPayload<object>;
  unitCents: number;
  snapshot: GroupBuyOrderSnapshot;
}
type GroupCheckoutInput = { groupBuyId: string; items: OrderItemInput[]; coupon: string };

export class GroupBuysService {
  private mail: Notifications;
  constructor(private ctx: Context) {
    this.mail = new Notifications(ctx);
  }

  /** Customers that paid: distinct customers among paid, non-cancelled orders of the campaign. */
  async participants(db: PrismaClient | Transaction, groupBuyId: string): Promise<number> {
    const rows = await db.order.findMany({
      where: { groupBuyId, status: { not: 'Cancelado' }, payment: { status: 'Pago' } },
      distinct: ['customerId'],
      select: { customerId: true },
    });
    return rows.length;
  }

  /** Participant count and first initials (by payment order) of several campaigns in one query. */
  private async stats(
    db: PrismaClient | Transaction,
    ids: string[],
  ): Promise<Map<string, GroupBuyStats>> {
    const result = new Map<string, GroupBuyStats>(
      ids.map((id) => [id, { participants: 0, initials: [] }]),
    );
    if (!ids.length) return result;
    const rows = await db.order.findMany({
        where: {
          groupBuyId: { in: ids },
          status: { not: 'Cancelado' },
          payment: { status: 'Pago' },
        },
        select: {
          groupBuyId: true,
          customerId: true,
          customer: { select: { name: true } },
        },
        orderBy: [{ payment: { paidAt: 'asc' } }, { createdAt: 'asc' }],
      }),
      seen = new Set<string>();
    for (const row of rows) {
      const stats = result.get(row.groupBuyId!)!,
        key = row.groupBuyId + '/' + row.customerId;
      if (seen.has(key)) continue;
      seen.add(key);
      stats.participants++;
      if (stats.initials.length < MAX_INITIALS)
        stats.initials.push(participantInitials(row.customer.name));
    }
    return result;
  }

  async save(actor: Actor | null, value: unknown): Promise<void> {
    const a = permit(actor, 'marketing'),
      input = groupBuyInputSchema.parse(value),
      endsAt = new Date(input.endsAt);
    await transaction(this.ctx.db, async (tx) => {
      const now = new Date();
      await lock(tx, 'group-buy/product/' + input.productId);
      const existing = input.id
        ? requireValue(
            await tx.groupBuy.findUnique({ where: { id: input.id } }),
            'Campanha não encontrada.',
          )
        : null;
      if (existing) await lock(tx, 'group-buy/' + existing.id);
      const open = !existing || OPEN_STATUSES.includes(existing.status),
        hasOrders = existing
          ? (await tx.order.count({ where: { groupBuyId: existing.id } })) > 0
          : false,
        locked = hasOrders || !open;
      if (existing && locked) {
        const startsAt = input.startsAt ? new Date(input.startsAt) : existing.startsAt;
        if (
          input.productId !== existing.productId ||
          input.sizeIndex !== existing.sizeIndex ||
          input.groupPriceCents !== existing.groupPriceCents ||
          input.goal !== existing.goal ||
          input.mode !== existing.mode ||
          startsAt.getTime() !== existing.startsAt.getTime() ||
          endsAt.getTime() !== existing.endsAt.getTime()
        )
          throw new DomainError(
            'GROUP_BUY_LOCKED',
            'Esta campanha já tem pedidos ou foi encerrada: só título, descrição, ativação e limites podem mudar.',
            409,
          );
        if (
          input.maxParticipants !== null &&
          input.maxParticipants < (await this.participants(tx, existing.id))
        )
          throw new DomainError(
            'INVALID_LIMIT',
            'O limite de participantes não pode ser menor que os participantes atuais.',
            422,
          );
        await tx.groupBuy.update({
          where: { id: existing.id },
          data: {
            title: input.title,
            description: input.description,
            active: input.active,
            perPersonLimit: input.perPersonLimit,
            maxParticipants: input.maxParticipants,
          },
        });
        await audit(tx, a.id, 'Compra coletiva salva', existing.id);
        return;
      }
      const product = await tx.product.findFirst({
        where: { id: input.productId, active: true, archived: false },
      });
      if (!product)
        throw new DomainError('INVALID_PRODUCT', 'Escolha um produto ativo e não arquivado.', 422);
      const info = data<InventoryProduct>(product.data);
      if (input.sizeIndex >= (info.sizes?.length ?? 0))
        throw new DomainError('INVALID_SIZE', 'Escolha um tamanho do produto.', 422);
      const normal = unitPriceCents(
        { priceCents: product.priceCents, sizePrices: info.sizePrices },
        input.sizeIndex,
      );
      if (input.groupPriceCents >= normal)
        throw new DomainError(
          'GROUP_PRICE_NOT_LOWER',
          'O preço de grupo precisa ser menor que o preço normal do tamanho.',
          422,
        );
      if (endsAt.getTime() <= now.getTime())
        throw new DomainError('INVALID_END', 'O encerramento precisa estar no futuro.', 422);
      const startsAt = input.startsAt ? new Date(input.startsAt) : (existing?.startsAt ?? now);
      if (endsAt.getTime() <= startsAt.getTime())
        throw new DomainError('INVALID_END', 'O encerramento precisa ser depois do início.', 422);
      if (
        await tx.groupBuy.count({
          where: {
            productId: input.productId,
            status: { in: OPEN_STATUSES },
            ...(existing ? { id: { not: existing.id } } : {}),
          },
        })
      )
        throw new DomainError(
          'GROUP_BUY_EXISTS',
          'Este produto já tem uma compra coletiva aberta.',
          409,
        );
      const fields = {
        title: input.title,
        description: input.description,
        productId: input.productId,
        sizeIndex: input.sizeIndex,
        groupPriceCents: input.groupPriceCents,
        goal: input.goal,
        maxParticipants: input.maxParticipants,
        perPersonLimit: input.perPersonLimit,
        mode: input.mode,
        active: input.active,
        startsAt,
        endsAt,
      };
      const saved = existing
        ? await tx.groupBuy.update({ where: { id: existing.id }, data: fields })
        : await tx.groupBuy.create({ data: fields });
      await audit(tx, a.id, 'Compra coletiva salva', saved.id);
    });
  }

  async extend(actor: Actor | null, id: string, endsAtValue: string): Promise<void> {
    const a = permit(actor, 'marketing'),
      endsAt = new Date(endsAtValue);
    await transaction(this.ctx.db, async (tx) => {
      await lock(tx, 'group-buy/' + id);
      const gb = requireValue(
        await tx.groupBuy.findUnique({ where: { id } }),
        'Campanha não encontrada.',
      );
      if (
        !OPEN_STATUSES.includes(gb.status) ||
        endsAt.getTime() <= gb.endsAt.getTime() ||
        endsAt.getTime() <= Date.now()
      )
        throw new DomainError(
          'INVALID_END',
          'Só campanhas abertas podem ser prorrogadas, para uma data depois do encerramento atual.',
          422,
        );
      await tx.groupBuy.update({ where: { id }, data: { endsAt } });
      await audit(tx, a.id, 'Compra coletiva prorrogada', id);
    });
  }

  async close(actor: Actor | null, id: string): Promise<void> {
    const a = permit(actor, 'marketing'),
      now = new Date(),
      gb = requireValue(
        await this.ctx.db.groupBuy.findUnique({ where: { id } }),
        'Campanha não encontrada.',
      );
    if (OPEN_STATUSES.includes(gb.status) && gb.endsAt.getTime() > now.getTime())
      await this.ctx.db.groupBuy.updateMany({
        where: { id, status: { in: OPEN_STATUSES } },
        data: { endsAt: now },
      });
    if (!(await this.closeCampaign(id, now)))
      throw new DomainError('GROUP_BUY_CLOSED', 'Esta campanha já foi encerrada.', 409);
    await audit(this.ctx.db, a.id, 'Compra coletiva encerrada', id);
  }

  /**
   * Claims the closing of an open campaign: Concluída when the goal was reached, Não fechou otherwise.
   * Returns false when someone else already closed it.
   */
  async closeCampaign(id: string, now: Date): Promise<boolean> {
    return transaction(this.ctx.db, async (tx) => {
      await lock(tx, 'group-buy/' + id);
      const gb = await tx.groupBuy.findUnique({ where: { id } });
      if (!gb) return false;
      const claimed = await tx.groupBuy.updateMany({
        where: { id, status: { in: OPEN_STATUSES } },
        data: { status: gb.goalReachedAt ? 'Concluída' : 'Não fechou', closedAt: now },
      });
      return claimed.count > 0;
    });
  }

  /**
   * Validates a group checkout and prices its single line. With the buyer's e-mail (checkout) it runs
   * under the campaign lock, and the caller must create the order in this same transaction. Without
   * one (the public estimate) it only reads: no lock, no per-person limit, no participant cap.
   */
  async context(
    tx: Transaction,
    input: GroupCheckoutInput,
    email: string,
    now: Date,
  ): Promise<GroupCheckout>;
  async context(
    db: PrismaClient | Transaction,
    input: GroupCheckoutInput,
    email: null,
    now: Date,
  ): Promise<GroupCheckout>;
  async context(
    db: PrismaClient | Transaction,
    input: GroupCheckoutInput,
    email: string | null,
    now: Date,
  ): Promise<GroupCheckout> {
    const id = input.groupBuyId;
    // The overloads guarantee a transaction whenever an e-mail is given.
    if (email !== null) await lock(db as Transaction, 'group-buy/' + id);
    const found = await db.groupBuy.findUnique({ where: { id }, include: { product: true } });
    if (!found || !groupBuyJoinable(found, now))
      throw new DomainError('GROUP_BUY_CLOSED', 'Esta compra coletiva não está aberta.', 409);
    const { product, ...groupBuy } = found,
      [item, ...rest] = input.items;
    if (!item || rest.length)
      throw new DomainError(
        'GROUP_BUY_SINGLE_ITEM',
        'A compra coletiva aceita um único item por pedido.',
        422,
      );
    if (item.productId !== groupBuy.productId || item.sizeIndex !== groupBuy.sizeIndex)
      throw new DomainError('GROUP_BUY_ITEM', 'Este item não faz parte da compra coletiva.', 422);
    if (input.coupon.trim())
      throw new DomainError('COUPON_NOT_ALLOWED', 'Cupons não valem na compra coletiva.', 422);
    if (email !== null) {
      const mine = {
          groupBuyId: id,
          status: { not: 'Cancelado' },
          customer: { email: { equals: email.trim(), mode: 'insensitive' as const } },
        },
        bought = await db.orderItem.aggregate({
          where: { order: mine },
          _sum: { quantity: true },
        });
      if ((bought._sum.quantity ?? 0) + item.quantity > groupBuy.perPersonLimit)
        throw new DomainError(
          'GROUP_BUY_LIMIT',
          `Cada pessoa pode levar até ${groupBuy.perPersonLimit} ${groupBuy.perPersonLimit === 1 ? 'unidade' : 'unidades'} nesta compra coletiva.`,
          422,
        );
      if (
        groupBuy.maxParticipants !== null &&
        (await this.participants(db, id)) >= groupBuy.maxParticipants &&
        !(await db.order.count({ where: { ...mine, payment: { status: 'Pago' } } }))
      )
        throw new DomainError(
          'GROUP_BUY_FULL',
          'Esta compra coletiva já atingiu o limite de participantes.',
          409,
        );
    }
    const mode = groupBuy.mode as GroupBuyMode,
      normalUnitCents = unitPriceCents(
        {
          priceCents: product.priceCents,
          sizePrices: data<{ sizePrices?: number[] }>(product.data).sizePrices,
        },
        groupBuy.sizeIndex,
      ),
      unitCents = groupUnitCents(
        mode,
        groupBuy.goalReachedAt !== null,
        normalUnitCents,
        groupBuy.groupPriceCents,
      );
    return {
      groupBuy,
      unitCents,
      snapshot: {
        id,
        title: groupBuy.title,
        mode,
        normalUnitCents,
        groupUnitCents: groupBuy.groupPriceCents,
        paidUnitCents: unitCents,
        quantity: item.quantity,
      },
    };
  }

  /**
   * Called by the payment flow once a group order is fully paid and its stock is secured. Re-counts
   * participants under the campaign lock, marks the goal and queues the follow-up work.
   */
  async onPaid(tx: Transaction, orderId: string, now: Date): Promise<GroupPaidOutcome> {
    const order = await tx.order.findUniqueOrThrow({
        where: { id: orderId },
        select: { groupBuyId: true, data: true },
      }),
      id = requireValue(order.groupBuyId, 'Campanha não encontrada.');
    await lock(tx, 'group-buy/' + id);
    let gb = await tx.groupBuy.findUniqueOrThrow({ where: { id } });
    if (gb.status === 'Não fechou') {
      // A difference-mode buyer paid the normal price: a failed campaign owes them nothing.
      if (gb.mode !== 'hold') return 'release';
      await this.mail.event(tx, 'group-fail/' + orderId, 'group-buy-fail-order', orderId, {
        orderId,
      });
      return 'fail';
    }
    if (!gb.goalReachedAt && (await this.participants(tx, id)) >= gb.goal) {
      gb = await tx.groupBuy.update({
        where: { id },
        data: { goalReachedAt: now, status: 'Meta atingida' },
      });
      await this.mail.event(tx, 'group-reached/' + id, 'group-buy-reached', id, {
        groupBuyId: id,
      });
    }
    if (gb.mode === 'hold' && !gb.goalReachedAt) return 'hold';
    const snapshot = data<{ groupBuy?: GroupBuyOrderSnapshot }>(order.data).groupBuy;
    if (
      gb.mode === 'difference' &&
      gb.goalReachedAt &&
      snapshot &&
      groupDifferenceCents(snapshot) > 0
    )
      await this.mail.event(tx, 'group-diff/' + orderId, 'group-buy-refund', orderId, {
        orderId,
      });
    return 'release';
  }

  /** Worker: the goal was reached (implemented in the worker task). */
  async reached(groupBuyId: string): Promise<void> {
    void groupBuyId;
  }

  /** Worker: refunds the difference of a difference-mode order (implemented in the worker task). */
  async refundDifference(orderId: string): Promise<void> {
    void orderId;
  }

  /** Worker: cancels and refunds an order of a campaign that did not close (worker task). */
  async failOrder(orderId: string): Promise<void> {
    void orderId;
  }

  /** Joinable campaigns of the given products, by product id (storefront). */
  async forProduct(
    db: PrismaClient | Transaction,
    productIds: string[],
    now = new Date(),
  ): Promise<Map<string, GroupBuySummary>> {
    const result = new Map<string, GroupBuySummary>();
    if (!productIds.length) return result;
    const rows = await this.joinable(db, { productId: { in: productIds } }, now),
      stats = await this.stats(
        db,
        rows.map((r) => r.id),
      );
    for (const row of rows)
      if (!result.has(row.productId))
        result.set(row.productId, groupBuySummaryDto(row, stats.get(row.id)));
    return result;
  }

  async publicList(now = new Date()): Promise<GroupBuyPublic[]> {
    const rows = await this.joinable(this.ctx.db, {}, now),
      stats = await this.stats(
        this.ctx.db,
        rows.map((r) => r.id),
      );
    return rows.map((row) => groupBuyPublicDto(row, stats.get(row.id)));
  }

  async publicOne(id: string, now = new Date()): Promise<GroupBuyPublic> {
    const row = await this.ctx.db.groupBuy.findUnique({ where: { id }, include: groupBuyInclude });
    if (!row || !groupBuyJoinable(row, now) || !this.visible(row))
      throw new DomainError('NOT_FOUND', 'Campanha não encontrada.', 404);
    return groupBuyPublicDto(row, (await this.stats(this.ctx.db, [id])).get(id));
  }

  /** Admin snapshot: newest first, with orders and refunds. */
  async forAdmin(): Promise<AdminGroupBuy[]> {
    const rows = await this.ctx.db.groupBuy.findMany({
      include: groupBuyInclude,
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    if (!rows.length) return [];
    const ids = rows.map((r) => r.id),
      [stats, orders] = await Promise.all([
        this.stats(this.ctx.db, ids),
        this.ctx.db.order.findMany({
          where: { groupBuyId: { in: ids } },
          include: groupBuyAdminOrderInclude,
          orderBy: { createdAt: 'desc' },
          take: 2000,
        }),
      ]),
      byCampaign = new Map<string, GroupBuyAdminOrderRow[]>();
    for (const order of orders)
      byCampaign.set(order.groupBuyId!, [...(byCampaign.get(order.groupBuyId!) ?? []), order]);
    return rows.map((row) =>
      groupBuyAdminDto(row, stats.get(row.id)!, byCampaign.get(row.id) ?? []),
    );
  }

  /** A campaign whose product was deactivated or archived is not offered. */
  private visible(row: GroupBuyRow) {
    return row.product.active && !row.product.archived;
  }

  private async joinable(
    db: PrismaClient | Transaction,
    where: { productId?: { in: string[] } },
    now: Date,
  ): Promise<GroupBuyRow[]> {
    const rows = await db.groupBuy.findMany({
      where: {
        ...where,
        active: true,
        status: { in: OPEN_STATUSES },
        startsAt: { lte: now },
        endsAt: { gt: now },
        product: { active: true, archived: false },
      },
      include: groupBuyInclude,
      orderBy: { endsAt: 'asc' },
      take: 200,
    });
    return rows.filter((row) => groupBuyJoinable(row, now));
  }
}

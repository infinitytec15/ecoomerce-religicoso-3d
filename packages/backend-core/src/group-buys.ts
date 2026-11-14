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
  type Address,
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
// Circular with payments.ts: only used inside methods, never at module load.
import { PaymentsService } from './payments';
import {
  groupBuyAdminDto,
  groupBuyAdminOrderInclude,
  groupBuyInclude,
  groupBuyPublicDto,
  groupBuySummaryDto,
  type GroupBuyAdminOrderRow,
  type GroupBuyAdminScope,
  type GroupBuyRow,
  type GroupBuyStats,
} from './projections';
import { type Actor, permit, requireValue, DomainError, data, audit } from './shared';

const OPEN_STATUSES = ['Aberta', 'Meta atingida'];
const MAX_INITIALS = 8;
/** The orders of a campaign that make their customer a participant: paid and not cancelled. */
const PARTICIPANT_ORDER = {
  status: { not: 'Cancelado' },
  payment: { status: 'Pago' },
} satisfies Prisma.OrderWhereInput;
const orderNumber = (n: number) => 'MEO-' + String(n).padStart(6, '0');
/** One person per e-mail, whatever its case: the same rule as the per-person limit. */
const personKey = (email: string) => email.trim().toLowerCase();

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

  /**
   * People that paid: distinct e-mails (case-insensitive) among the paid, non-cancelled orders of
   * the campaign. Guest checkout makes a Customer per order, so customer ids would count twice.
   */
  async participants(db: PrismaClient | Transaction, groupBuyId: string): Promise<number> {
    const rows = await db.order.findMany({
      where: { groupBuyId, ...PARTICIPANT_ORDER },
      select: { customer: { select: { email: true } } },
    });
    return new Set(rows.map((row) => personKey(row.customer.email))).size;
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
        where: { groupBuyId: { in: ids }, ...PARTICIPANT_ORDER },
        select: {
          groupBuyId: true,
          customer: { select: { name: true, email: true } },
        },
        orderBy: [{ payment: { paidAt: 'asc' } }, { createdAt: 'asc' }],
      }),
      seen = new Set<string>();
    for (const row of rows) {
      const stats = result.get(row.groupBuyId!)!,
        key = row.groupBuyId + '/' + personKey(row.customer.email);
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

  /** Admin: ends an open campaign now. The clamp, the claim and its follow-up work are atomic. */
  async close(actor: Actor | null, id: string): Promise<void> {
    const a = permit(actor, 'marketing');
    await transaction(this.ctx.db, async (tx) => {
      const now = new Date();
      await lock(tx, 'group-buy/' + id);
      const gb = requireValue(
        await tx.groupBuy.findUnique({ where: { id } }),
        'Campanha não encontrada.',
      );
      if (OPEN_STATUSES.includes(gb.status) && gb.endsAt.getTime() > now.getTime())
        await tx.groupBuy.update({ where: { id }, data: { endsAt: now } });
      if (!(await this.claim(tx, id, now)))
        throw new DomainError('GROUP_BUY_CLOSED', 'Esta campanha já foi encerrada.', 409);
      await audit(tx, a.id, 'Compra coletiva encerrada', id);
    });
  }

  /**
   * Closes an open campaign: Concluída when the goal was reached, Não fechou otherwise. A hold
   * campaign that did not close queues the cancellation of each of its orders. Returns false when
   * someone else already closed it.
   */
  async closeCampaign(id: string, now: Date): Promise<boolean> {
    return transaction(this.ctx.db, async (tx) => {
      await lock(tx, 'group-buy/' + id);
      return this.claim(tx, id, now);
    });
  }

  /** The close itself; the caller holds the `group-buy/<id>` lock. */
  private async claim(tx: Transaction, id: string, now: Date): Promise<boolean> {
    const gb = await tx.groupBuy.findUnique({ where: { id } });
    if (!gb) return false;
    const status = gb.goalReachedAt ? 'Concluída' : 'Não fechou',
      claimed = await tx.groupBuy.updateMany({
        where: { id, status: { in: OPEN_STATUSES } },
        data: { status, closedAt: now },
      });
    if (!claimed.count) return false;
    // Only a hold buyer is owed anything: a difference buyer paid the normal price.
    if (gb.mode === 'hold' && status === 'Não fechou') {
      const orders = await tx.order.findMany({
        where: { groupBuyId: id, status: { not: 'Cancelado' } },
        select: { id: true },
      });
      for (const o of orders)
        await this.mail.event(tx, 'group-fail/' + o.id, 'group-buy-fail-order', o.id, {
          orderId: o.id,
        });
    }
    // A second sweep of the held orders: recovers any the goal event left behind (it may have
    // failed for good). `reached` skips the orders already released.
    if (gb.mode === 'hold' && status === 'Concluída')
      await this.mail.event(tx, 'group-close-release/' + id, 'group-buy-reached', id, {
        groupBuyId: id,
      });
    return true;
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

  /**
   * Worker: the goal was reached. A hold campaign releases each held order to production; a
   * difference campaign queues the refund of each paid order that paid more than the group price.
   */
  async reached(groupBuyId: string): Promise<void> {
    const gb = await this.ctx.db.groupBuy.findUnique({ where: { id: groupBuyId } });
    if (!gb?.goalReachedAt) return;
    if (gb.mode === 'hold') {
      if (gb.status === 'Não fechou') return;
      const payments = new PaymentsService(this.ctx),
        held = await this.ctx.db.order.findMany({
          where: { groupBuyId, status: 'Aguardando grupo', payment: { status: 'Pago' } },
          select: { id: true },
          orderBy: { createdAt: 'asc' },
        });
      // One transaction per order, under its own lock and never the campaign's (lock order).
      await this.eachOrder(
        held.map((o) => o.id),
        (id) =>
          transaction(this.ctx.db, async (tx) => {
            await lock(tx, 'order/' + id);
            const order = await tx.order.findUniqueOrThrow({
              where: { id },
              include: { payment: true },
            });
            if (order.status !== 'Aguardando grupo' || order.payment?.status !== 'Pago') return;
            // Confirmed first: production refuses an order still waiting for the group.
            await tx.order.update({
              where: { id },
              data: { status: 'Confirmado', version: { increment: 1 } },
            });
            await payments.production(tx, id);
            const a = data<Address>(order.address);
            await this.mail.email(tx, 'group-confirmed/' + id, id, a.email, {
              kind: 'group-confirmed',
              name: a.name,
              orderNumber: orderNumber(order.number),
              totalCents: order.totalCents,
              actionUrl: await this.mail.orderUrl(tx, id),
              groupTitle: gb.title,
            });
          }),
      );
      return;
    }
    const orders = await this.ctx.db.order.findMany({
      where: { groupBuyId, ...PARTICIPANT_ORDER },
      select: { id: true, data: true },
    });
    await this.eachOrder(
      orders
        .filter((o) => {
          const snapshot = data<{ groupBuy?: GroupBuyOrderSnapshot }>(o.data).groupBuy;
          return snapshot && groupDifferenceCents(snapshot) > 0;
        })
        .map((o) => o.id),
      (id) =>
        transaction(this.ctx.db, async (tx) => {
          await this.mail.event(tx, 'group-diff/' + id, 'group-buy-refund', id, { orderId: id });
        }),
    );
  }

  /**
   * Runs `work` for every order, so one failing order never blocks the ones after it, then
   * rethrows. Any transient failure becomes a plain Error, so the outbox retries the whole event
   * (the work is idempotent per order); otherwise the first DomainError fails it for good.
   */
  private async eachOrder(ids: string[], work: (id: string) => Promise<void>): Promise<void> {
    let permanent: DomainError | null = null,
      transient = false;
    for (const id of ids)
      try {
        await work(id);
      } catch (error) {
        console.error(
          'Compra coletiva: pedido não processado:',
          id,
          (error as { code?: string } | null)?.code ?? (error as Error | null)?.name ?? 'erro',
        );
        if (error instanceof DomainError) permanent ??= error;
        else transient = true;
      }
    if (transient) throw new Error('GROUP_ORDER_RETRY');
    if (permanent) throw permanent;
  }

  /** Worker: refunds what a difference-mode buyer paid above the group price, then tells them. */
  async refundDifference(orderId: string): Promise<void> {
    const order = await this.ctx.db.order.findUniqueOrThrow({
        where: { id: orderId },
        include: { groupBuy: true },
      }),
      snapshot = data<{ groupBuy?: GroupBuyOrderSnapshot }>(order.data).groupBuy,
      diff = snapshot ? groupDifferenceCents(snapshot) : 0;
    if (order.status === 'Cancelado' || diff <= 0) return;
    await new PaymentsService(this.ctx).refundPartial(
      orderId,
      diff,
      'Compra coletiva: diferença devolvida',
      'group-diff/' + orderId,
    );
    await transaction(this.ctx.db, async (tx) => {
      const a = data<Address>(order.address);
      await this.mail.email(tx, 'group-difference/' + orderId, orderId, a.email, {
        kind: 'group-difference',
        name: a.name,
        orderNumber: orderNumber(order.number),
        totalCents: order.totalCents,
        refundedCents: diff,
        actionUrl: await this.mail.orderUrl(tx, orderId),
        groupTitle: order.groupBuy?.title ?? snapshot!.title,
      });
    });
  }

  /**
   * Worker: cancels an order of a hold campaign that did not close, returns its stock, cancels a
   * pending payment and queues the refund of what was captured.
   */
  async failOrder(orderId: string): Promise<void> {
    const payments = new PaymentsService(this.ctx);
    await transaction(this.ctx.db, async (tx) => {
      await lock(tx, 'order/' + orderId);
      const order = await tx.order.findUniqueOrThrow({
        where: { id: orderId },
        include: { payment: { include: { parts: true } }, groupBuy: true },
      });
      // The event alone is not enough: only an unshipped order of a failed hold campaign is cancelled.
      if (
        ['Cancelado', 'Enviado', 'Entregue'].includes(order.status) ||
        order.groupBuy?.mode !== 'hold' ||
        order.groupBuy.status !== 'Não fechou'
      )
        return;
      await tx.order.update({
        where: { id: orderId },
        data: { status: 'Cancelado', version: { increment: 1 } },
      });
      await payments.release(tx, orderId);
      const consumed = await tx.stockReservation.findMany({
        where: { orderId, state: 'consumed' },
        orderBy: { productId: 'asc' },
      });
      for (const r of consumed) {
        await lock(tx, 'stock/' + r.productId);
        await tx.product.update({
          where: { id: r.productId },
          data: { stock: { increment: r.quantity } },
        });
        await tx.stockMovement.create({
          data: {
            productId: r.productId,
            delta: r.quantity,
            reason: 'Compra coletiva não fechou ' + orderId,
            actorId: 'system',
          },
        });
        await tx.stockReservation.update({ where: { id: r.id }, data: { state: 'released' } });
      }
      const intent = order.payment;
      if (intent?.status === 'Pendente')
        await this.mail.event(tx, 'cancel-pending/' + intent.id, 'payment-cancel', orderId, {
          intentId: intent.id,
        });
      if (intent?.parts.some((p) => p.status === 'approved'))
        await this.mail.event(tx, 'group-fail-refund/' + orderId, 'refund-order', orderId, {
          orderId,
          reason: 'Compra coletiva não fechou',
        });
      if (intent?.status === 'Pago') {
        const a = data<Address>(order.address);
        await this.mail.email(tx, 'group-failed/' + orderId, orderId, a.email, {
          kind: 'group-failed',
          name: a.name,
          orderNumber: orderNumber(order.number),
          totalCents: order.totalCents,
          actionUrl: await this.mail.orderUrl(tx, orderId),
          groupTitle: order.groupBuy?.title ?? '',
        });
      }
      await audit(tx, 'system', 'Pedido cancelado: compra coletiva não fechou', orderId);
    });
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

  /** Admin snapshot: newest first, with orders and refunds, limited to what the viewer may see. */
  async forAdmin(scope: GroupBuyAdminScope): Promise<AdminGroupBuy[]> {
    const rows = await this.ctx.db.groupBuy.findMany({
      include: groupBuyInclude,
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    if (!rows.length) return [];
    const ids = rows.map((r) => r.id),
      [stats, orders, counts] = await Promise.all([
        this.stats(this.ctx.db, ids),
        this.ctx.db.order.findMany({
          where: { groupBuyId: { in: ids } },
          include: groupBuyAdminOrderInclude,
          orderBy: { createdAt: 'desc' },
          take: 2000,
        }),
        this.ctx.db.order.groupBy({
          by: ['groupBuyId'],
          where: { groupBuyId: { in: ids } },
          _count: { _all: true },
        }),
      ]),
      byCampaign = new Map<string, GroupBuyAdminOrderRow[]>(),
      orderCount = new Map(counts.map((c) => [c.groupBuyId!, c._count._all]));
    for (const order of orders)
      byCampaign.set(order.groupBuyId!, [...(byCampaign.get(order.groupBuyId!) ?? []), order]);
    return rows.map((row) =>
      groupBuyAdminDto(
        row,
        stats.get(row.id)!,
        byCampaign.get(row.id) ?? [],
        orderCount.get(row.id) ?? 0,
        scope,
      ),
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

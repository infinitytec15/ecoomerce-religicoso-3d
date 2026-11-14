import {
  groupBuyJoinable,
  groupBuyPublicSchema,
  groupBuySummarySchema,
  groupUnitCents,
  participantInitials,
  remainingParticipants,
  unitCostCents,
  unitPriceCents,
  type AdminGroupBuy,
  type GroupBuyInput,
  type GroupBuyPublic,
  type GroupBuySummary,
} from '@maos-em-oracao/contracts';
import { ApiError, requireValue } from '@/lib/api/contracts';
import type { InventoryProduct, Operations, OrderItemInput } from './types';

/** Demo rules of the group buy (compra coletiva); they mirror the backend service. */
const MAX_INITIALS = 8;
const isOpen = (gb: Pick<AdminGroupBuy, 'status'>) =>
  gb.status === 'Aberta' || gb.status === 'Meta atingida';
const sameEmail = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export const publicGroupBuy = (gb: AdminGroupBuy): GroupBuyPublic => groupBuyPublicSchema.parse(gb);
export const joinableGroupBuys = (groupBuys: AdminGroupBuy[], now = new Date()) =>
  groupBuys.filter((gb) => groupBuyJoinable(gb, now));

/** The product as the storefront sees it: carrying its joinable campaign, if any. */
export function withGroupBuy<T extends { id: string }>(
  groupBuys: AdminGroupBuy[],
  product: T,
  now = new Date(),
): T & { groupBuy?: GroupBuySummary } {
  const gb = joinableGroupBuys(groupBuys, now).find((g) => g.productId === product.id);
  return gb ? { ...product, groupBuy: groupBuySummarySchema.parse(gb) } : product;
}

type GroupCheckoutInput = { groupBuyId: string; items: OrderItemInput[]; coupon: string };
/**
 * Validates a group checkout and prices its single line. With the buyer's e-mail it also enforces
 * the per-person limit and the participant cap; without one (the estimate) it only reads.
 */
export function groupCheckout(
  state: Operations,
  input: GroupCheckoutInput,
  email: string | null,
  now = new Date(),
) {
  const gb = state.groupBuys.find((g) => g.id === input.groupBuyId);
  if (!gb || !groupBuyJoinable(gb, now))
    throw new ApiError('GROUP_BUY_CLOSED', 'Esta compra coletiva não está aberta.', 409);
  const [item, ...rest] = input.items;
  if (!item || rest.length)
    throw new ApiError(
      'GROUP_BUY_SINGLE_ITEM',
      'A compra coletiva aceita um único item por pedido.',
      422,
    );
  if (item.productId !== gb.productId || item.sizeIndex !== gb.sizeIndex)
    throw new ApiError('GROUP_BUY_ITEM', 'Este item não faz parte da compra coletiva.', 422);
  if (input.coupon.trim())
    throw new ApiError('COUPON_NOT_ALLOWED', 'Cupons não valem na compra coletiva.', 422);
  if (email !== null) {
    const mine = gb.orders.filter((o) => sameEmail(o.email, email) && o.status !== 'Cancelado'),
      bought = mine.reduce((total, o) => total + o.quantity, 0);
    if (bought + item.quantity > gb.perPersonLimit)
      throw new ApiError(
        'GROUP_BUY_LIMIT',
        `Cada pessoa pode levar até ${gb.perPersonLimit} ${gb.perPersonLimit === 1 ? 'unidade' : 'unidades'} nesta compra coletiva.`,
        422,
      );
    if (
      gb.maxParticipants !== null &&
      gb.participants >= gb.maxParticipants &&
      !mine.some((o) => o.paymentStatus === 'Pago')
    )
      throw new ApiError(
        'GROUP_BUY_FULL',
        'Esta compra coletiva já atingiu o limite de participantes.',
        409,
      );
  }
  const product = requireValue(state.products.find((p) => p.id === gb.productId)),
    normalUnitCents = unitPriceCents(product, gb.sizeIndex);
  return {
    gb,
    unitCents: groupUnitCents(gb.mode, gb.goalReached, normalUnitCents, gb.groupPriceCents),
  };
}

/** Links a new group order to its campaign; it becomes a participant only once paid. */
export function recordGroupOrder(
  gb: AdminGroupBuy,
  order: { id: string; number: string; status: AdminGroupBuy['orders'][number]['status'] },
  buyer: { name: string; email: string },
  quantity: number,
  paidUnitCents: number,
) {
  gb.orders.unshift({
    orderId: order.id,
    number: order.number,
    customerName: buyer.name,
    email: buyer.email,
    quantity,
    paidUnitCents,
    status: order.status,
    paymentStatus: 'Pendente',
    refund: null,
    createdAt: new Date().toISOString(),
  });
  gb.locked = true;
}

/** Counts a paid order as a participant, marks the goal and holds or releases hold-mode orders. */
export function settleGroupPayment(state: Operations, orderId: string) {
  const gb = state.groupBuys.find((g) => g.orders.some((o) => o.orderId === orderId)),
    record = gb?.orders.find((o) => o.orderId === orderId),
    order = state.orders.find((o) => o.id === orderId);
  if (!gb || !record || !order || record.paymentStatus === 'Pago') return;
  const setStatus = (target: typeof order, status: typeof order.status) => {
    target.status = status;
    const entry = gb.orders.find((o) => o.orderId === target.id);
    if (entry) entry.status = status;
  };
  record.paymentStatus = 'Pago';
  // A hold campaign that did not close refunds in the real service; the demo just cancels.
  if (gb.mode === 'hold' && gb.status === 'Não fechou') return setStatus(order, 'Cancelado');
  const known = gb.orders.some(
    (o) =>
      o !== record &&
      o.paymentStatus === 'Pago' &&
      o.status !== 'Cancelado' &&
      sameEmail(o.email, record.email),
  );
  if (!known) {
    gb.participants++;
    if (gb.initials.length < MAX_INITIALS)
      gb.initials.push(participantInitials(record.customerName));
  }
  gb.remaining = remainingParticipants(gb.goal, gb.participants);
  if (!gb.goalReached && gb.participants >= gb.goal) {
    gb.goalReached = true;
    if (gb.status === 'Aberta') gb.status = 'Meta atingida';
  }
  if (gb.mode !== 'hold') return;
  if (!gb.goalReached) return setStatus(order, 'Aguardando grupo');
  for (const held of state.orders)
    if (gb.orders.some((o) => o.orderId === held.id) && held.status === 'Aguardando grupo')
      setStatus(held, 'Confirmado');
}

/** Ends an open campaign now: Concluída with the goal, Não fechou without it. */
export function closeGroupBuy(state: Operations, gb: AdminGroupBuy, now = new Date()) {
  if (!isOpen(gb)) throw new ApiError('GROUP_BUY_CLOSED', 'Esta campanha já foi encerrada.', 409);
  if (Date.parse(gb.endsAt) > now.getTime()) gb.endsAt = now.toISOString();
  gb.status = gb.goalReached ? 'Concluída' : 'Não fechou';
  if (gb.mode === 'hold' && gb.status === 'Não fechou')
    for (const record of gb.orders) {
      const order = state.orders.find((o) => o.id === record.orderId);
      if (order && !['Enviado', 'Entregue', 'Cancelado'].includes(order.status)) {
        order.status = 'Cancelado';
        record.status = 'Cancelado';
      }
    }
}

export function extendGroupBuy(gb: AdminGroupBuy, endsAt: string, now = new Date()) {
  if (!isOpen(gb) || Date.parse(endsAt) <= Date.parse(gb.endsAt) || Date.parse(endsAt) <= +now)
    throw new ApiError(
      'INVALID_END',
      'Só campanhas abertas podem ser prorrogadas, para uma data depois do encerramento atual.',
      422,
    );
  gb.endsAt = endsAt;
}

/** Fields of the campaign that follow its product and size. */
export function groupBuyProductFields(product: InventoryProduct, sizeIndex: number) {
  return {
    productName: product.name,
    productImage: product.image,
    colors: product.colors,
    size: product.sizes[sizeIndex],
    normalPriceCents: unitPriceCents(product, sizeIndex),
    costCents: unitCostCents(product, sizeIndex),
  };
}

/** Creates or edits a campaign. A campaign with orders (or already closed) keeps its commercial terms. */
export function saveGroupBuy(state: Operations, input: GroupBuyInput, now = new Date()) {
  const existing = input.id
    ? requireValue(
        state.groupBuys.find((g) => g.id === input.id),
        'Campanha não encontrada.',
      )
    : undefined;
  const startsAt = input.startsAt ?? existing?.startsAt ?? now.toISOString();
  if (existing && (existing.orders.length || !isOpen(existing))) {
    if (
      input.productId !== existing.productId ||
      input.sizeIndex !== existing.sizeIndex ||
      input.groupPriceCents !== existing.groupPriceCents ||
      input.goal !== existing.goal ||
      input.mode !== existing.mode ||
      Date.parse(startsAt) !== Date.parse(existing.startsAt) ||
      Date.parse(input.endsAt) !== Date.parse(existing.endsAt)
    )
      throw new ApiError(
        'GROUP_BUY_LOCKED',
        'Esta campanha já tem pedidos ou foi encerrada: só título, descrição, ativação e limites podem mudar.',
        409,
      );
    if (input.maxParticipants !== null && input.maxParticipants < existing.participants)
      throw new ApiError(
        'INVALID_LIMIT',
        'O limite de participantes não pode ser menor que os participantes atuais.',
        422,
      );
    Object.assign(existing, {
      title: input.title,
      description: input.description,
      active: input.active,
      perPersonLimit: input.perPersonLimit,
      maxParticipants: input.maxParticipants,
    });
    return existing;
  }
  const product = state.products.find((p) => p.id === input.productId && p.active && !p.archived);
  if (!product)
    throw new ApiError('INVALID_PRODUCT', 'Escolha um produto ativo e não arquivado.', 422);
  if (input.sizeIndex >= product.sizes.length)
    throw new ApiError('INVALID_SIZE', 'Escolha um tamanho do produto.', 422);
  if (input.groupPriceCents >= unitPriceCents(product, input.sizeIndex))
    throw new ApiError(
      'GROUP_PRICE_NOT_LOWER',
      'O preço de grupo precisa ser menor que o preço normal do tamanho.',
      422,
    );
  if (Date.parse(input.endsAt) <= +now)
    throw new ApiError('INVALID_END', 'O encerramento precisa estar no futuro.', 422);
  if (Date.parse(input.endsAt) <= Date.parse(startsAt))
    throw new ApiError('INVALID_END', 'O encerramento precisa ser depois do início.', 422);
  if (
    state.groupBuys.some(
      (g) => g.id !== existing?.id && g.productId === input.productId && isOpen(g),
    )
  )
    throw new ApiError('GROUP_BUY_EXISTS', 'Este produto já tem uma compra coletiva aberta.', 409);
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
    endsAt: input.endsAt,
    ...groupBuyProductFields(product, input.sizeIndex),
  };
  if (existing) {
    Object.assign(existing, fields);
    existing.remaining = remainingParticipants(existing.goal, existing.participants);
    existing.goalReached = existing.participants >= existing.goal;
    existing.status = existing.goalReached ? 'Meta atingida' : 'Aberta';
    return existing;
  }
  const created: AdminGroupBuy = {
    id: crypto.randomUUID(),
    ...fields,
    participants: 0,
    remaining: input.goal,
    goalReached: false,
    status: 'Aberta',
    initials: [],
    createdAt: now.toISOString(),
    locked: false,
    refundedCents: 0,
    orders: [],
  };
  state.groupBuys.unshift(created);
  return created;
}

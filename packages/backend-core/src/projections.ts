import type {
  Address,
  InventoryProduct,
  KitSummary,
  Product,
  Order,
  Charge,
  Subscription,
  ProductionJob,
  Customer,
  Ticket,
  Prayer,
  PublicReview,
  AdminReview,
  GroupBuySummary,
  GroupBuyPublic,
  GroupBuyStatus,
  AdminGroupBuy,
  GroupBuyOrderSnapshot,
} from '@maos-em-oracao/contracts';
import { unitPriceCents, unitCostCents, remainingParticipants } from '@maos-em-oracao/contracts';
import type { Prisma } from '@maos-em-oracao/database';
import { data, day, instant } from './shared';
export const orderInclude = {
  items: true,
  payment: { include: { parts: true } },
  shipment: true,
} satisfies Prisma.OrderInclude;
export type OrderRow = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;
export function productDto(
  p: Prisma.ProductGetPayload<object>,
  privateData = false,
  rating?: Product['rating'],
  /** Derived kit data: the summary and the stock allowed by the components. */
  kitExtras?: { kitSummary: KitSummary; stock: number },
): Product | InventoryProduct {
  const d = data<InventoryProduct>(p.data),
    value = {
      ...d,
      id: p.id,
      sku: p.sku,
      name: p.name,
      category: p.category as Product['category'],
      priceCents: p.priceCents,
      stock: kitExtras?.stock ?? Math.max(0, p.stock - p.reserved),
      active: p.active,
      archived: p.archived,
      ...(rating ? { rating } : {}),
      ...(kitExtras ? { kitSummary: kitExtras.kitSummary } : {}),
    };
  if (privateData) return { ...value, costCents: p.costCents, stock: p.stock };
  const publicValue = { ...value };
  Reflect.deleteProperty(publicValue, 'costCents');
  Reflect.deleteProperty(publicValue, 'costBreakdown');
  Reflect.deleteProperty(publicValue, 'costBySize');
  return publicValue;
}
export function customerDto(c: Prisma.CustomerGetPayload<object>, privateData = false): Customer {
  return {
    ...data<Address>(c.address),
    id: c.id,
    name: c.name,
    email: c.email,
    status: c.active ? 'Ativo' : 'Inativo',
    notes: privateData ? c.notes : '',
    created: day(c.createdAt),
  };
}
export function orderDto(o: OrderRow, privateData = false): Order {
  const extra = data<Partial<Order>>(o.data);
  return {
    ...extra,
    id: o.id,
    number: 'MEO-' + String(o.number).padStart(6, '0'),
    customerId: o.customerId,
    subscriptionId: o.subscriptionId || undefined,
    type: o.type as Order['type'],
    items: o.items.map((i) => ({
      ...data<Order['items'][number]>(i.data),
      quantity: i.quantity,
      unitCents: i.unitCents,
      productId: i.productId,
      itemId: i.id,
    })),
    totalCents: o.totalCents,
    subtotalCents: o.subtotalCents,
    shippingCents: o.shippingCents,
    discountCents: o.discountCents,
    status: o.status as Order['status'],
    created: day(o.createdAt),
    due: day(o.due),
    address: data<Address>(o.address),
    chargeId: o.payment?.id || '',
    tracking: o.shipment?.tracking || '',
    carrier: o.shipment?.carrier || '',
    priority: o.priority as Order['priority'],
    notes: privateData ? o.notes : '',
    labelStatus: o.shipment
      ? (({
          prepared: 'Preparada',
          created: 'Preparada',
          purchased: 'Preparada',
          generating: 'Preparada',
          ready: 'Gerada',
          posted: 'Gerada',
          delivered: 'Gerada',
          cancelled: 'Cancelada',
        }[o.shipment.state] || 'Preparada') as Order['labelStatus'])
      : 'Não solicitada',
    labelUrl: privateData ? o.shipment?.labelUrl || undefined : undefined,
  };
}
export function chargeDto(o: OrderRow): Charge | null {
  const p = o.payment;
  if (!p) return null;
  return {
    id: p.id,
    customerId: o.customerId,
    subscriptionId: o.subscriptionId || undefined,
    orderId: o.id,
    amountCents: p.amountCents,
    method: p.method as Charge['method'],
    status: (p.status === 'Expirando' ? 'Pendente' : p.status) as Charge['status'],
    due: day(p.due),
    paidAt: p.paidAt ? day(p.paidAt) : undefined,
    description: o.subscriptionId
      ? 'Mensalidade do clube'
      : 'Pedido MEO-' + String(o.number).padStart(6, '0'),
    cycle: day(o.createdAt).slice(0, 7),
    pixCents: p.parts.filter((v) => v.method === 'pix').reduce((n, v) => n + v.amountCents, 0),
    cardCents: p.parts.filter((v) => v.method === 'card').reduce((n, v) => n + v.amountCents, 0),
    installments: p.installments,
    refundReason: p.refundReason || undefined,
  };
}
export function subscriptionDto(s: Prisma.SubscriptionGetPayload<object>): Subscription {
  return {
    id: s.id,
    customerId: s.customerId,
    profile: s.profile as Subscription['profile'],
    finish: s.finish,
    priceCents: s.priceCents,
    status: s.status as Subscription['status'],
    payment: s.payment as 'pix' | 'card',
    created: day(s.createdAt),
    nextRenewal: day(s.nextRenewal),
    nextShipment: day(s.nextShipment),
    address: data<Address>(s.address),
    history: data<Subscription['history']>(s.history),
  };
}
export function jobDto(
  j: Prisma.ProductionJobGetPayload<{ include: { printer: true } }>,
): ProductionJob {
  return {
    ...data<Partial<ProductionJob>>(j.data),
    id: j.id,
    orderId: j.orderId,
    stage: j.stage as ProductionJob['stage'],
    printer: j.printer?.name || 'A definir',
    assignee: j.assignee,
    hours: j.hours,
    priority: j.priority as ProductionJob['priority'],
    due: day(j.due),
    startedAt: j.startedAt ? instant(j.startedAt) : undefined,
    completedAt: j.completedAt ? instant(j.completedAt) : undefined,
  };
}
export function ticketDto(
  t: Prisma.TicketGetPayload<{ include: { messages: true } }>,
  privateData = false,
): Ticket {
  return {
    id: t.id,
    customerId: t.customerId,
    subject: t.subject,
    category: t.category,
    status: t.status as Ticket['status'],
    priority: t.priority as Ticket['priority'],
    assignee: privateData ? t.assignee : '',
    created: day(t.createdAt),
    messages: t.messages
      .filter((m) => privateData || !m.internal)
      .map((m) => ({
        by: m.by as 'cliente' | 'equipe',
        text: m.text,
        date: instant(m.createdAt),
        ...(privateData ? { internal: m.internal } : {}),
        attachments: data(m.attachments),
      })),
  };
}
export function prayerDto(
  p: Prisma.PrayerGetPayload<{ include: { reactions: true; reports: true } }>,
  actorKey: string,
  privateData = false,
): Prayer {
  return {
    id: p.id,
    name: p.anonymous && !privateData ? 'Anônimo' : p.name,
    title: p.title,
    message: p.message,
    category: p.category,
    anonymous: p.anonymous,
    example: false,
    hidden: p.moderation !== 'Publicado',
    created: day(p.createdAt),
    reactions: p.reactions.length,
    owned: p.actorKey === actorKey,
    prayed: p.reactions.some((r) => r.actorKey === actorKey),
    // The author needs the review state to see the pending notice and a disabled reaction.
    ...(p.actorKey === actorKey ? { moderation: p.moderation as Prayer['moderation'] } : {}),
    ...(privateData
      ? {
          moderation: p.moderation as Prayer['moderation'],
          reports: p.reports.map((r) => ({ reason: r.reason, date: instant(r.createdAt) })),
          moderationNote: p.moderationNote,
        }
      : {}),
  };
}
export type ReviewRow = Prisma.ReviewGetPayload<object>;
export const reviewAdminInclude = {
  product: true,
  order: true,
  customer: true,
} satisfies Prisma.ReviewInclude;
export type AdminReviewRow = Prisma.ReviewGetPayload<{ include: typeof reviewAdminInclude }>;
export function reviewDto(r: ReviewRow): PublicReview;
export function reviewDto(r: AdminReviewRow, privateData: true): AdminReview;
export function reviewDto(r: ReviewRow | AdminReviewRow, privateData = false) {
  const base: PublicReview = {
    id: r.id,
    rating: r.rating,
    title: r.title,
    text: r.text,
    author: r.author,
    createdAt: instant(r.createdAt),
    variant: r.variant,
    photos: data<{ url: string }[]>(r.photos).map((p) => ({ url: p.url })),
    reply: r.reply || null,
    repliedAt: r.repliedAt ? instant(r.repliedAt) : null,
  };
  if (!privateData || !('customer' in r)) return base;
  return {
    ...base,
    status: r.status as AdminReview['status'],
    productId: r.productId,
    productName: r.product.name,
    orderId: r.orderId,
    orderNumber: 'MEO-' + String(r.order.number).padStart(6, '0'),
    customerName: r.customer.name,
    customerEmail: r.customer.email,
  } satisfies AdminReview;
}

export const groupBuyInclude = { product: true } satisfies Prisma.GroupBuyInclude;
export type GroupBuyRow = Prisma.GroupBuyGetPayload<{ include: typeof groupBuyInclude }>;
export const groupBuyAdminOrderInclude = {
  customer: true,
  items: true,
  payment: { include: { parts: { include: { refunds: true } } } },
} satisfies Prisma.OrderInclude;
export type GroupBuyAdminOrderRow = Prisma.OrderGetPayload<{
  include: typeof groupBuyAdminOrderInclude;
}>;
export interface GroupBuyStats {
  participants: number;
  initials: string[];
}
export function groupBuySummaryDto(
  gb: GroupBuyRow,
  stats: GroupBuyStats = { participants: 0, initials: [] },
): GroupBuySummary {
  const product = data<InventoryProduct>(gb.product.data);
  return {
    id: gb.id,
    title: gb.title,
    mode: gb.mode as GroupBuySummary['mode'],
    sizeIndex: gb.sizeIndex,
    size: product.sizes?.[gb.sizeIndex] ?? '',
    groupPriceCents: gb.groupPriceCents,
    normalPriceCents: unitPriceCents(
      { priceCents: gb.product.priceCents, sizePrices: product.sizePrices },
      gb.sizeIndex,
    ),
    goal: gb.goal,
    participants: stats.participants,
    remaining: remainingParticipants(gb.goal, stats.participants),
    maxParticipants: gb.maxParticipants,
    perPersonLimit: gb.perPersonLimit,
    endsAt: instant(gb.endsAt),
    goalReached: gb.goalReachedAt !== null,
    status: gb.status as GroupBuyStatus,
    initials: stats.initials,
  };
}
export function groupBuyPublicDto(gb: GroupBuyRow, stats?: GroupBuyStats): GroupBuyPublic {
  const product = data<InventoryProduct>(gb.product.data);
  return {
    ...groupBuySummaryDto(gb, stats),
    description: gb.description,
    productId: gb.productId,
    productName: gb.product.name,
    productImage: product.image ?? '',
    colors: product.colors ?? [],
  };
}
export function groupBuyAdminDto(
  gb: GroupBuyRow,
  stats: GroupBuyStats,
  orders: GroupBuyAdminOrderRow[],
): AdminGroupBuy {
  const product = data<InventoryProduct>(gb.product.data),
    refunded = (o: GroupBuyAdminOrderRow) =>
      (o.payment?.parts ?? []).flatMap((part) => part.refunds);
  return {
    ...groupBuyPublicDto(gb, stats),
    active: gb.active,
    startsAt: instant(gb.startsAt),
    createdAt: instant(gb.createdAt),
    costCents: unitCostCents(
      {
        costCents: gb.product.costCents,
        costBreakdown: product.costBreakdown,
        costBySize: product.costBySize,
      },
      gb.sizeIndex,
    ),
    locked: orders.length > 0,
    refundedCents: orders.reduce(
      (sum, o) => sum + (o.payment?.parts ?? []).reduce((n, part) => n + part.refundedCents, 0),
      0,
    ),
    orders: orders.map((o) => {
      const snapshot = data<{ groupBuy?: GroupBuyOrderSnapshot }>(o.data).groupBuy,
        refunds = refunded(o);
      return {
        orderId: o.id,
        number: 'MEO-' + String(o.number).padStart(6, '0'),
        customerName: o.customer.name,
        email: o.customer.email,
        quantity: snapshot?.quantity ?? (o.items.reduce((n, i) => n + i.quantity, 0) || 1),
        paidUnitCents: snapshot?.paidUnitCents ?? o.items[0]?.unitCents ?? 0,
        status: o.status as AdminGroupBuy['orders'][number]['status'],
        paymentStatus: o.payment?.status ?? 'Pendente',
        refund: refunds.length
          ? {
              amountCents: refunds.reduce((n, r) => n + r.amountCents, 0),
              status: refunds.some((r) => r.status === 'pending')
                ? 'pending'
                : refunds.at(-1)!.status,
            }
          : null,
        createdAt: instant(o.createdAt),
      };
    }),
  };
}

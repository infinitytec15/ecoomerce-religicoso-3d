import type {
  Address,
  InventoryProduct,
  Product,
  Order,
  Charge,
  Subscription,
  ProductionJob,
  Customer,
  Ticket,
  Prayer,
} from '@maos-em-oracao/contracts';
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
): Product | InventoryProduct {
  const d = data<InventoryProduct>(p.data),
    value = {
      ...d,
      id: p.id,
      sku: p.sku,
      name: p.name,
      category: p.category as Product['category'],
      priceCents: p.priceCents,
      stock: Math.max(0, p.stock - p.reserved),
      active: p.active,
      archived: p.archived,
    };
  if (privateData) return { ...value, costCents: p.costCents, stock: p.stock };
  const publicValue = { ...value };
  Reflect.deleteProperty(publicValue, 'costCents');
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
    ...(privateData
      ? {
          moderation: p.moderation as Prayer['moderation'],
          reports: p.reports.map((r) => ({ reason: r.reason, date: instant(r.createdAt) })),
          moderationNote: p.moderationNote,
        }
      : {}),
  };
}

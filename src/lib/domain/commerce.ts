import type {
  Address,
  CartItem,
  CheckoutInput,
  Operations,
  Order,
  Product,
  Session,
  Subscription,
} from './types';
import { KIT_COLOR, KIT_SIZE, unitPriceCents } from '@maos-em-oracao/contracts';
import { ApiError, requireValue } from '@/lib/api/contracts';
import { addMonth, monthLabel, today, uid } from './format';
import { normalizeAddress } from './address';
import { forSale } from './kits';
import { groupCheckout, recordGroupOrder, settleGroupPayment } from './group-buys';
export function cartLine(
  product: Product,
  quantity = 1,
  color = product.colors[0],
  sizeIndex = 0,
  dedication = '',
): CartItem {
  if (product.kit) return kitCartLine(product, product.kit, quantity, dedication);
  if (
    !product.active ||
    !product.colors.includes(color) ||
    !product.sizes[sizeIndex] ||
    quantity < 1 ||
    quantity > 10 ||
    !Number.isInteger(quantity)
  )
    throw new ApiError('INVALID_ITEM', 'Confira as opções e a quantidade da peça.');
  return {
    key: [product.id, color, sizeIndex, dedication].join('|'),
    productId: product.id,
    name: product.name,
    image: product.image,
    imageIndex: product.imageIndex,
    color,
    size: product.sizes[sizeIndex],
    sizeIndex,
    unitCents: unitPriceCents(product, sizeIndex),
    quantity,
    dedication: dedication.slice(0, 40),
  };
}
function kitCartLine(
  product: Product,
  kit: NonNullable<Product['kit']>,
  quantity: number,
  dedication: string,
): CartItem {
  const summary = product.kitSummary;
  if (
    !product.active ||
    !summary ||
    summary.items.length !== kit.components.length ||
    quantity < 1 ||
    quantity > 10 ||
    !Number.isInteger(quantity)
  )
    throw new ApiError('INVALID_ITEM', 'Confira as opções e a quantidade da peça.');
  return {
    key: [product.id, KIT_COLOR, 0, dedication].join('|'),
    productId: product.id,
    name: product.name,
    image: product.image,
    imageIndex: product.imageIndex,
    color: KIT_COLOR,
    size: KIT_SIZE,
    sizeIndex: 0,
    unitCents: product.priceCents,
    quantity,
    dedication: dedication.slice(0, 40),
    kit: {
      items: summary.items.map((item, index) => ({
        productId: item.productId,
        name: item.name,
        size: item.size,
        sizeIndex: kit.components[index].sizeIndex,
        color: item.color,
        quantity: item.quantity,
      })),
    },
  };
}
export function calculateTotals(items: CartItem[], shippingCents = 1890, coupon = '') {
  const subtotalCents = items.reduce((total, item) => total + item.unitCents * item.quantity, 0),
    discountCents =
      coupon.trim().toUpperCase() === 'PRIMEIRAFE' ? Math.round(subtotalCents * 0.1) : 0;
  return {
    subtotalCents,
    discountCents,
    shippingCents,
    totalCents: subtotalCents - discountCents + shippingCents,
  };
}
export function validateSplit(totalCents: number, pixCents: number) {
  if (!Number.isInteger(pixCents) || pixCents <= 0 || pixCents >= totalCents)
    throw new ApiError(
      'INVALID_SPLIT',
      'A parte em Pix deve ser maior que zero e menor que o total.',
    );
  return { pixCents, cardCents: totalCents - pixCents };
}
export function audit(
  state: Operations,
  action: string,
  entity: string,
  actor = 'Equipe de demonstração',
) {
  state.audit.unshift({ id: uid('LOG'), date: new Date().toISOString(), actor, action, entity });
  state.audit = state.audit.slice(0, 200);
}
export function ensureCustomer(state: Operations, address: Address) {
  let customer = state.clients.find((c) => c.email.toLowerCase() === address.email.toLowerCase());
  if (customer) Object.assign(customer, address);
  else {
    customer = { ...address, id: uid('CLI'), status: 'Ativo', created: today(), notes: '' };
    state.clients.unshift(customer);
  }
  return customer;
}
export function setOrderStatus(state: Operations, id: string, status: Order['status']) {
  const order = requireValue(state.orders.find((o) => o.id === id));
  order.status = status;
  audit(state, 'Pedido: ' + status, id);
}
export function enqueueProduction(
  state: Operations,
  id: string,
  options?: { printer: string; hours: number; assignee: string },
) {
  const order = requireValue(state.orders.find((o) => o.id === id));
  if (state.charges.find((c) => c.id === order.chargeId)?.status !== 'Pago')
    throw new ApiError('PAYMENT_REQUIRED', 'Confirme o recebimento antes de iniciar a produção.');
  if (['Enviado', 'Entregue', 'Cancelado'].includes(order.status))
    throw new ApiError('ORDER_CLOSED', 'Este pedido não pode voltar à produção.');
  if (order.status === 'Aguardando grupo')
    throw new ApiError(
      'GROUP_PENDING',
      'Este pedido aguarda a meta da compra coletiva antes de ir para a produção.',
      409,
    );
  if (state.jobs.some((j) => j.orderId === id)) return;
  state.jobs.push({
    id: uid('OP'),
    orderId: id,
    stage: 'Fila',
    printer:
      options?.printer ||
      state.printers.find((p) => p.status !== 'Manutenção')?.name ||
      'A definir',
    hours: options?.hours || 6,
    assignee: options?.assignee || 'Pedro',
    priority: order.priority,
    due: order.due,
  });
  audit(state, 'Ordem de produção criada', id);
}
export function payCharge(state: Operations, id: string) {
  const charge = requireValue(state.charges.find((c) => c.id === id));
  if (charge.status === 'Pago') return;
  if (!['Pendente', 'Recusado'].includes(charge.status))
    throw new ApiError('CHARGE_CLOSED', 'Esta cobrança não pode ser confirmada.');
  charge.status = 'Pago';
  charge.paidAt = today();
  const order = state.orders.find((o) => o.id === charge.orderId);
  if (order?.status === 'Aguardando pagamento') order.status = 'Confirmado';
  if (order) settleGroupPayment(state, order.id);
  const sub = state.subscriptions.find((s) => s.id === charge.subscriptionId);
  if (sub) {
    if (sub.status === 'Pagamento pendente') sub.status = 'Ativa';
    if (charge.due >= sub.nextRenewal) sub.nextRenewal = addMonth(charge.due);
    sub.history.unshift({ date: today(), label: 'Pagamento de demonstração confirmado.' });
    if (order) enqueueProduction(state, order.id);
  }
  audit(state, 'Recebimento confirmado na demonstração', id);
}
export function clubItems(state: Operations, profile: Subscription['profile'], finish: string) {
  return state.settings.profiles[profile].map((id) => {
    const product = requireValue(
      state.products.find((p) => p.id === id),
      'Revise a curadoria antes de criar esta edição.',
    );
    return cartLine(
      { ...product, active: true },
      1,
      finish === 'Surpresa'
        ? product.colors[0]
        : product.colors.includes(finish)
          ? finish
          : product.colors[0],
      0,
      '',
    );
  });
}
export function createShopOrder(state: Operations, input: CheckoutInput, session: Session | null) {
  const existing = state.processed[input.idempotencyKey];
  if (existing) return existing;
  if (!input.items.length) throw new ApiError('EMPTY_CART', 'Adicione uma peça ao carrinho.');
  const group = input.groupBuyId
    ? groupCheckout(
        state,
        { groupBuyId: input.groupBuyId, items: input.items, coupon: input.coupon },
        input.address.email,
      )
    : null;
  const items = input.items.map((x) =>
    cartLine(
      forSale(state.products, requireValue(state.products.find((p) => p.id === x.productId))),
      x.quantity,
      x.color,
      x.sizeIndex,
      x.dedication,
    ),
  );
  if (group) items[0].unitCents = group.unitCents;
  const totals = calculateTotals(items, input.shipping === 'express' ? 2990 : 1890, input.coupon);
  const split =
    input.payment === 'split'
      ? validateSplit(totals.totalCents, input.pixCents)
      : {
          pixCents: input.payment === 'pix' ? totals.totalCents : 0,
          cardCents: input.payment === 'card' ? totals.totalCents : 0,
        };
  const address = normalizeAddress(input.address),
    customer = ensureCustomer(state, address);
  const id = uid('PED'),
    cid = uid('COB'),
    paid = input.payment === 'card';
  state.orders.unshift({
    id,
    number: `MEO-${String(state.orders.length + 1).padStart(4, '0')}`,
    customerId: customer.id,
    type: 'Loja',
    items,
    ...totals,
    status: paid ? 'Confirmado' : 'Aguardando pagamento',
    created: today(),
    due: today(),
    address,
    chargeId: cid,
    tracking: '',
    carrier: 'A definir',
    priority: 'Normal',
    notes: '',
  });
  state.charges.unshift({
    id: cid,
    customerId: customer.id,
    orderId: id,
    amountCents: totals.totalCents,
    method: input.payment,
    status: paid ? 'Pago' : 'Pendente',
    due: today(),
    paidAt: paid ? today() : undefined,
    description: 'Compra na loja',
    cycle: today().slice(0, 7),
    ...split,
    installments: input.installments,
  });
  if (group) {
    recordGroupOrder(
      group.gb,
      state.orders[0],
      { name: customer.name, email: customer.email },
      items[0].quantity,
      group.unitCents,
    );
    if (paid) settleGroupPayment(state, id);
  }
  audit(state, 'Pedido criado', id, session?.name || customer.name);
  return (state.processed[input.idempotencyKey] = { orderId: id });
}
export function generateCycle(
  state: Operations,
  sub: Subscription,
  result: 'Pago' | 'Pendente' | 'Recusado',
) {
  if (sub.status !== 'Ativa')
    throw new ApiError('SUBSCRIPTION_INACTIVE', 'Retome a assinatura antes de gerar um ciclo.');
  const due = sub.nextRenewal,
    cycle = due.slice(0, 7);
  if (
    state.charges.some(
      (c) =>
        c.subscriptionId === sub.id &&
        c.cycle === cycle &&
        !['Cancelada', 'Estornado'].includes(c.status),
    )
  )
    throw new ApiError('DUPLICATE_CYCLE', 'Este ciclo já tem uma cobrança. Confira o financeiro.');
  const id = uid('PED'),
    cid = uid('COB'),
    paid = result === 'Pago';
  state.orders.unshift({
    id,
    number: id,
    customerId: sub.customerId,
    subscriptionId: sub.id,
    type: 'Clube',
    edition: monthLabel(due) + ' · ' + state.settings.edition,
    items: clubItems(state, sub.profile, sub.finish),
    totalCents: sub.priceCents,
    subtotalCents: sub.priceCents,
    discountCents: 0,
    shippingCents: 0,
    status: paid ? 'Confirmado' : 'Aguardando pagamento',
    created: today(),
    due: due.slice(0, 8) + String(state.settings.dispatchDay).padStart(2, '0'),
    address: { ...sub.address },
    chargeId: cid,
    tracking: '',
    carrier: 'A definir',
    priority: 'Normal',
    notes: 'Ciclo mensal de demonstração.',
  });
  state.charges.unshift({
    id: cid,
    customerId: sub.customerId,
    subscriptionId: sub.id,
    orderId: id,
    amountCents: sub.priceCents,
    method: sub.payment,
    status: result,
    due,
    paidAt: paid ? today() : undefined,
    description: 'Clube · ' + monthLabel(due),
    cycle,
    pixCents: sub.payment === 'pix' ? sub.priceCents : 0,
    cardCents: sub.payment === 'card' ? sub.priceCents : 0,
    installments: 1,
  });
  sub.history.unshift({
    date: today(),
    label: 'Renovação simulada: ' + result.toLowerCase() + '.',
  });
  if (paid) {
    sub.nextRenewal = addMonth(due);
    enqueueProduction(state, id);
  } else if (result === 'Recusado') sub.status = 'Pagamento pendente';
  audit(state, 'Ciclo mensal gerado', sub.id);
  return id;
}
export function financialSummary(state: Operations) {
  const paid = state.charges
      .filter((c) => c.status === 'Pago')
      .reduce((a, c) => a + c.amountCents, 0),
    pending = state.charges
      .filter((c) => ['Pendente', 'Recusado'].includes(c.status))
      .reduce((a, c) => a + c.amountCents, 0),
    expenses = state.expenses
      .filter((e) => e.status === 'Pago')
      .reduce((a, e) => a + e.amountCents, 0),
    mrr = state.subscriptions
      .filter((s) => s.status === 'Ativa')
      .reduce((a, s) => a + s.priceCents, 0);
  return { paid, pending, expenses, mrr, net: paid - expenses };
}

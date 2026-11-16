import { describe, it, expect } from 'vitest';
import {
  cartLine,
  calculateTotals,
  orderItems,
  validateSplit,
  createShopOrder,
  enqueueProduction,
  generateCycle,
  payCharge,
} from './commerce';
import type { OrderItemInput } from './types';
import { addMonth, centsFromInput, csvText } from './format';
import { createSeed, seedCatalog } from '@/lib/demo/seed';
import { demoAddress, checkoutSchema } from './schemas';
import type { CheckoutInput } from './types';
const checkout = (overrides: Partial<CheckoutInput> = {}): CheckoutInput => ({
  items: [
    { productId: 'cruz-essencial', quantity: 1, color: 'Marfim', sizeIndex: 0, dedication: '' },
  ],
  address: demoAddress,
  shipping: 'standard',
  coupon: '',
  payment: 'pix',
  pixCents: 0,
  installments: 1,
  consent: true,
  idempotencyKey: crypto.randomUUID(),
  ...overrides,
});
describe('money and checkout rules', () => {
  it('uses integer cents for quantities, shipping and rounded discounts', () => {
    const p = { ...createSeed().products[0], priceCents: 8999 };
    expect(calculateTotals([cartLine(p, 3)], 1890, 'primeirafe')).toEqual({
      subtotalCents: 26997,
      discountCents: 2700,
      shippingCents: 1890,
      totalCents: 26187,
    });
    expect(centsFromInput('49,90')).toBe(4990);
  });
  it('reads pt-BR money with thousand separators', () => {
    const cases: [string, number][] = [
      ['49,90', 4990],
      ['129.90', 12990],
      ['129', 12900],
      ['6.000', 600000],
      ['6.000,00', 600000],
      ['1.234,56', 123456],
      ['1.500.000', 150000000],
      ['R$ 1.299,90', 129990],
      ['  0,5 ', 50],
      ['', 0],
    ];
    for (const [text, cents] of cases) expect(centsFromInput(text), text).toBe(cents);
    for (const bad of ['abc', '1,2,3', '12a', '1.2.3,4,5', ','])
      expect(centsFromInput(bad), bad).toBeNaN();
  });
  it('rejects impossible split amounts and preserves the exact total', () => {
    for (const amount of [0, -1, 10000, 10001, 50.5, NaN])
      expect(() => validateSplit(10000, amount)).toThrow();
    expect(validateSplit(10000, 3333)).toEqual({ pixCents: 3333, cardCents: 6667 });
  });
  it('validates sizes, colors, quantity and publication before pricing', () => {
    const p = createSeed().products[0];
    expect(cartLine(p, 2, p.colors[0], 1).unitCents).toBe(p.priceCents + 2000);
    expect(() => cartLine(p, 11)).toThrow();
    expect(() => cartLine(p, 1, 'Inválida')).toThrow();
    expect(() => cartLine({ ...p, active: false })).toThrow();
  });
  it('cart line uses the configured size price', () => {
    const p = {
      ...createSeed().products[0],
      sizes: ['15 cm', '20 cm', '25 cm'],
      priceCents: 9990,
      sizePrices: [9990, 12990, 15990],
    };
    const line = cartLine(p, 1, p.colors[0], 2, '');
    expect(line.unitCents).toBe(15990);
  });
  it('ignores any client-side price and recomputes against the catalog', () => {
    const s = createSeed(),
      input = checkout();
    s.products[0].priceCents = 12345;
    const result = createShopOrder(s, input, null),
      o = s.orders.find((o) => o.id === result.orderId)!;
    expect(o.totalCents).toBe(14235);
    expect(o.items[0].unitCents).toBe(12345);
  });
  it('creates only one order for a retried idempotency key', () => {
    const s = createSeed(),
      input = checkout(),
      count = s.orders.length,
      a = createShopOrder(s, input, null),
      b = createShopOrder(s, input, null);
    expect(a).toEqual(b);
    expect(s.orders).toHaveLength(count + 1);
  });
  it('requires consent, a valid address and a UUID', () => {
    expect(checkoutSchema.safeParse(checkout()).success).toBe(true);
    expect(checkoutSchema.safeParse(checkout({ consent: false })).success).toBe(false);
    expect(checkoutSchema.safeParse(checkout({ idempotencyKey: 'retry' })).success).toBe(false);
  });
  it('keeps pending orders out of production', () => {
    const s = createSeed(),
      { orderId } = createShopOrder(s, checkout(), null);
    expect(() => enqueueProduction(s, orderId)).toThrow('Confirme o recebimento');
    const order = s.orders.find((o) => o.id === orderId)!;
    payCharge(s, order.chargeId);
    enqueueProduction(s, orderId);
    enqueueProduction(s, orderId);
    expect(s.jobs.filter((j) => j.orderId === orderId)).toHaveLength(1);
  });
});
describe('subscription cycles', () => {
  it('handles month ends and leap years without rolling into the wrong month', () => {
    expect(addMonth('2026-01-31')).toBe('2026-02-28');
    expect(addMonth('2028-01-31')).toBe('2028-02-29');
    expect(addMonth('2026-12-31')).toBe('2027-01-31');
  });
  it('preserves the contracted price after the public price changes', () => {
    const s = createSeed(),
      sub = s.subscriptions.find((x) => x.status === 'Ativa')!;
    s.settings.priceCents += 5000;
    sub.nextRenewal = '2030-01-15';
    const id = generateCycle(s, sub, 'Pago'),
      order = s.orders.find((o) => o.id === id)!;
    expect(order.totalCents).toBe(sub.priceCents);
    expect(order.shippingCents).toBe(0);
    expect(s.jobs.some((j) => j.orderId === id)).toBe(true);
    expect(sub.nextRenewal).toBe('2030-02-15');
  });
  it('blocks duplicate and paused renewals', () => {
    const s = createSeed(),
      sub = s.subscriptions.find((x) => x.status === 'Ativa')!;
    sub.nextRenewal = '2030-01-15';
    generateCycle(s, sub, 'Pendente');
    expect(() => generateCycle(s, sub, 'Pendente')).toThrow('Este ciclo já');
    sub.status = 'Pausada';
    expect(() => generateCycle(s, sub, 'Pago')).toThrow('Retome a assinatura');
  });
  it('advances renewal only once when a pending payment is retried', () => {
    const s = createSeed(),
      sub = s.subscriptions.find((x) => x.status === 'Ativa')!;
    sub.nextRenewal = '2030-01-15';
    const id = generateCycle(s, sub, 'Recusado'),
      order = s.orders.find((o) => o.id === id)!;
    expect(sub.status).toBe('Pagamento pendente');
    expect(s.jobs.some((j) => j.orderId === id)).toBe(false);
    payCharge(s, order.chargeId);
    payCharge(s, order.chargeId);
    expect(sub.status).toBe('Ativa');
    expect(sub.nextRenewal).toBe('2030-02-15');
    expect(s.jobs.filter((j) => j.orderId === id)).toHaveLength(1);
  });
  it('escapes formulas and quotes in exported CSV', () => {
    const csv = csvText(
      ['Nome', 'Nota'],
      [
        ['=HYPERLINK("evil")', 'a;b'],
        ['Normal', '"texto"'],
      ],
    );
    expect(csv).toContain("'=HYPERLINK");
    expect(csv).toContain('""texto""');
  });
});
describe('kit cart lines', () => {
  const demoKit = seedCatalog.find((p) => p.kit)!;
  it('builds a kit line priced at the kit price with a component snapshot', () => {
    const line = cartLine(demoKit, 2);
    expect(line.size).toBe('Kit completo');
    expect(line.color).toBe('Padrão');
    expect(line.unitCents).toBe(demoKit.priceCents);
    expect(line.kit?.items).toHaveLength(3);
    expect(line.kit?.items[0]).toMatchObject({ productId: 'cruz-essencial', sizeIndex: 1 });
    expect(line.kit?.items[2].color).toBeNull();
  });
  it('refuses a kit without its summary', () => {
    expect(() => cartLine({ ...demoKit, kitSummary: undefined })).toThrow(/opções/);
  });
});

describe('story video attribution', () => {
  const cruz = seedCatalog.find((p) => p.id === 'cruz-essencial')!;
  const demoKit = seedCatalog.find((p) => p.kit)!;
  it('cartLine carries the video only when given, without changing the line key', () => {
    const plain = cartLine(cruz, 1, cruz.colors[0], 0);
    const fromVideo = cartLine(cruz, 1, cruz.colors[0], 0, '', { videoId: 'v1' });
    expect(plain).not.toHaveProperty('videoId');
    expect(fromVideo.videoId).toBe('v1');
    expect(fromVideo.key).toBe(plain.key);
    expect(cartLine(demoKit, 1, undefined, 0, '', { videoId: 'v2' }).videoId).toBe('v2');
  });
  it('orderItems sends the video of each line that has one', () => {
    const lines = [cartLine(cruz, 2, cruz.colors[0], 0, '', { videoId: 'v1' }), cartLine(cruz)];
    expect(orderItems(lines)).toEqual([
      {
        productId: 'cruz-essencial',
        quantity: 2,
        color: cruz.colors[0],
        sizeIndex: 0,
        dedication: '',
        videoId: 'v1',
      },
      {
        productId: 'cruz-essencial',
        quantity: 1,
        color: cruz.colors[0],
        sizeIndex: 0,
        dedication: '',
      },
    ]);
    expect(checkoutSchema.shape.items.safeParse(orderItems(lines)).success).toBe(true);
  });
  it('the demo order keeps the video of the item', () => {
    const state = createSeed();
    const item: OrderItemInput = {
      productId: 'cruz-essencial',
      quantity: 1,
      color: 'Marfim',
      sizeIndex: 0,
      dedication: '',
      videoId: 'video-demo-1',
    };
    const input = checkout({ items: [item] });
    const { orderId } = createShopOrder(state, input, null);
    const order = state.orders.find((o) => o.id === orderId)!;
    expect(order.items[0].videoId).toBe('video-demo-1');
  });
});

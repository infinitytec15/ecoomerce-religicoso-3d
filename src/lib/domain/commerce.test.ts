import { describe, it, expect } from 'vitest';
import {
  cartLine,
  calculateTotals,
  validateSplit,
  createShopOrder,
  enqueueProduction,
  generateCycle,
  payCharge,
} from './commerce';
import { addMonth, centsFromInput, csvText } from './format';
import { createSeed } from '@/lib/demo/seed';
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

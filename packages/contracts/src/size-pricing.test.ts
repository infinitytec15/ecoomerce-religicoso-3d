import { describe, it, expect } from 'vitest';
import { unitPriceCents, unitCostBreakdown, unitCostCents } from './size-pricing';

describe('preço e custo por tamanho', () => {
  it('falls back to the legacy +R$ 20 per size', () => {
    expect(unitPriceCents({ priceCents: 8990 }, 2)).toBe(12990);
  });
  it('uses the configured price of each size', () => {
    expect(unitPriceCents({ priceCents: 9990, sizePrices: [9990, 12990, 15990] }, 2)).toBe(15990);
  });
  it('picks the cost of the size, then the product breakdown, then the plain total', () => {
    const b = (n: number) => ({ materialCents: n, packagingCents: 0, energyCents: 0, laborCents: 0, otherCents: 0 });
    expect(unitCostCents({ costCents: 900, costBySize: [b(1000), b(2500)] }, 1)).toBe(2500);
    expect(unitCostCents({ costCents: 900, costBreakdown: b(1200) }, 1)).toBe(1200);
    expect(unitCostBreakdown({ costCents: 900 }, 0)).toEqual({ ...b(0), otherCents: 900 });
  });
});

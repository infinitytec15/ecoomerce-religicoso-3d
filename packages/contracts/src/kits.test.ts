import { describe, expect, it } from 'vitest';
import { defaultCalculatorSettings } from './print-cost';
import { kitAvailable, kitCostCents, kitMargin, kitPieces, kitSchema, kitSummary } from './kits';

const A = {
  name: 'Cruz',
  image: '/a.webp',
  sizes: ['15 cm', '20 cm'],
  priceCents: 6990,
  costCents: 1500,
};
const B = {
  name: 'Terço',
  image: '/b.webp',
  sizes: ['Único'],
  priceCents: 3990,
  costCents: 800,
  sizePrices: [3990],
};
const kit = {
  components: [
    { productId: 'a', sizeIndex: 1, color: 'Marfim', quantity: 2 },
    { productId: 'b', sizeIndex: 0, color: null, quantity: 1 },
  ],
};

describe('kits', () => {
  it('counts pieces and rejects single-piece kits', () => {
    expect(kitPieces(kit)).toBe(3);
    expect(() =>
      kitSchema.parse({ components: [{ productId: 'a', sizeIndex: 0, color: null, quantity: 1 }] }),
    ).toThrow();
  });
  it('available kits is the minimum over components', () => {
    expect(
      kitAvailable(
        kit,
        new Map([
          ['a', 5],
          ['b', 4],
        ]),
      ),
    ).toBe(2);
    expect(kitAvailable(kit, new Map([['a', 5]]))).toBe(0);
  });
  it('sums component costs by size plus kit packaging', () => {
    // A size 1 without costBySize -> costCents 1500; 2 × 1500 + 800 + 300
    expect(
      kitCostCents(
        kit,
        new Map([
          ['a', A],
          ['b', B],
        ]),
        300,
      ),
    ).toBe(4100);
  });
  it('summarizes savings against the separate prices', () => {
    const products = new Map([
      ['a', A],
      ['b', B],
    ]);
    // A size 1 = 6990 + 2000 = 8990; 2 × 8990 + 3990 = 21970
    expect(kitSummary({ priceCents: 17990 }, kit, products)).toMatchObject({
      pieces: 3,
      componentsTotalCents: 21970,
      savingsCents: 3980,
    });
    expect(kitSummary({ priceCents: 25000 }, kit, products).savingsCents).toBe(0);
  });
  it('skips missing components in the summary', () => {
    const s = kitSummary({ priceCents: 1000 }, kit, new Map([['b', B]]));
    expect(s.items).toHaveLength(1);
    expect(s.componentsTotalCents).toBe(3990);
  });
  it('flags margin below the configured minimum', () => {
    const s = { ...defaultCalculatorSettings, minMarginPct: 20 };
    // fee 8.586% of 10000 = 859; 10000 − 7500 − 859 = 1641 → 16.4% < 20
    expect(kitMargin({ priceCents: 10000, costCents: 7500 }, s)).toMatchObject({
      profitCents: 1641,
      marginPct: 16.4,
      belowMinimum: true,
      loss: false,
    });
    expect(kitMargin({ priceCents: 10000, costCents: 4000 }, s).belowMinimum).toBe(false);
    expect(kitMargin({ priceCents: 5000, costCents: 6000 }, s).loss).toBe(true);
  });
});

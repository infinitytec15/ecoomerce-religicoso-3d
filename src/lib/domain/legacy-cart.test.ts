import { expect, it } from 'vitest';
import { migrateLegacyCart } from './legacy-cart';
import { createSeed } from '@/lib/demo/seed';
it('preserves the selected size, dedication, quantity and cents of the original cart', () => {
  const p = createSeed().products[0],
    items = migrateLegacyCart(
      [
        {
          key: 'old',
          id: p.id,
          name: p.name,
          img: 0,
          color: 'Areia',
          size: p.sizes[2],
          price: 109.9,
          qty: 2,
          engraving: 'Com amor',
        },
      ],
      [p],
    );
  expect(items[0]).toMatchObject({
    sizeIndex: 2,
    unitCents: 10990,
    quantity: 2,
    color: 'Areia',
    dedication: 'Com amor',
  });
});

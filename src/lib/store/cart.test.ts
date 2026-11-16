import { beforeEach, describe, expect, it } from 'vitest';
import type { CartItem } from '@/lib/domain/types';
import { useCartStore } from './cart';

const line = (overrides: Partial<CartItem> = {}): CartItem => ({
  key: 'cruz|Marfim|0|',
  productId: 'cruz',
  name: 'Cruz',
  image: '/x.webp',
  imageIndex: 0,
  color: 'Marfim',
  size: 'P',
  sizeIndex: 0,
  unitCents: 8990,
  quantity: 1,
  dedication: '',
  ...overrides,
});

describe('cart store', () => {
  beforeEach(() => useCartStore.setState({ items: [] }));

  it('merging a line from a video into a plain line credits the video', () => {
    useCartStore.getState().add(line());
    useCartStore.getState().add(line({ videoId: 'v1' }));
    expect(useCartStore.getState().items).toEqual([line({ quantity: 2, videoId: 'v1' })]);
  });

  it('the first video keeps the credit when another video adds the same line', () => {
    useCartStore.getState().add(line({ videoId: 'v1' }));
    useCartStore.getState().add(line({ videoId: 'v2', quantity: 3 }));
    expect(useCartStore.getState().items).toEqual([line({ quantity: 4, videoId: 'v1' })]);
  });

  it('plain lines stay without a video', () => {
    useCartStore.getState().add(line());
    useCartStore.getState().add(line());
    expect(useCartStore.getState().items[0]).not.toHaveProperty('videoId');
  });
});

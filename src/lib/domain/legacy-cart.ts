import type { CartItem, Product } from './types';
export interface LegacyCartItem {
  key: string;
  id: string;
  name: string;
  img: number;
  color: string;
  size: string;
  price: number;
  qty: number;
  engraving?: string;
}
/** Convert the original local cart without altering the original storage keys. */
export function migrateLegacyCart(items: LegacyCartItem[], products: Product[]): CartItem[] {
  return items
    .filter(
      (x) =>
        products.some((p) => p.id === x.id) &&
        Number.isFinite(x.price) &&
        x.price > 0 &&
        Number.isInteger(x.qty) &&
        x.qty > 0,
    )
    .map((x) => {
      const product = products.find((p) => p.id === x.id)!;
      return {
        key: x.key,
        productId: x.id,
        name: x.name,
        image: product.image,
        imageIndex: product.imageIndex,
        color: x.color,
        size: x.size,
        sizeIndex: Math.max(0, product.sizes.indexOf(x.size)),
        unitCents: Math.round(x.price * 100),
        quantity: Math.min(x.qty, 10),
        dedication: x.engraving || '',
      };
    });
}

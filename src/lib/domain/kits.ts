import { kitComponentUsable, kitSummary, type Kit } from '@maos-em-oracao/contracts';
import type { Product } from './types';

/** A kit is sellable only while every component exists, is active, is not archived and still offers the chosen size/colour. */
export function kitComponentsAvailable(products: Product[], kit: Kit): boolean {
  return kit.components.every((c) => {
    const component = products.find((p) => p.id === c.productId);
    return (
      !!component && component.active && !component.archived && kitComponentUsable(c, component)
    );
  });
}

/**
 * Demo equivalent of the API's public product: kits carry a freshly computed `kitSummary` and
 * come back as `null` (hidden) when a component is gone. Non-kit products pass through untouched.
 */
export function withKitSummary<T extends Product>(products: Product[], product: T): T | null {
  if (!product.kit) return product;
  if (!kitComponentsAvailable(products, product.kit)) return null;
  return {
    ...product,
    kitSummary: kitSummary(product, product.kit, new Map(products.map((p) => [p.id, p]))),
  };
}

/** The product as the cart sees it: a kit with unavailable components has no summary, so it is refused. */
export function forSale<T extends Product>(products: Product[], product: T): T {
  return withKitSummary(products, product) ?? { ...product, kitSummary: undefined };
}

import { type CalculatorSettings, feeRatePct } from './print-cost';
import { unitCostCents, unitPriceCents } from './size-pricing';
import type { CostBreakdown } from './types';
import type { z } from 'zod';
import type { kitComponentSchema, kitSchema, kitSummarySchema } from './kit-schemas';

export { kitComponentSchema, kitSchema, kitSummarySchema } from './kit-schemas';

/** Fixed size/color labels of a kit as a cart line. */
export const KIT_SIZE = 'Kit completo';
export const KIT_COLOR = 'Padrão';

export type KitComponent = z.infer<typeof kitComponentSchema>;
export type Kit = z.infer<typeof kitSchema>;
export type KitSummary = z.infer<typeof kitSummarySchema>;

type CostSource = {
  costCents: number;
  costBreakdown?: CostBreakdown;
  costBySize?: CostBreakdown[];
};

export function kitPieces(kit: Kit): number {
  return kit.components.reduce((sum, c) => sum + c.quantity, 0);
}

/** How many whole kits the stock allows: the minimum of floor(available / quantity). */
export function kitAvailable(kit: Kit, availableByProduct: Map<string, number>): number {
  let min = Infinity;
  for (const c of kit.components) {
    const available = availableByProduct.get(c.productId);
    if (available === undefined) return 0;
    min = Math.min(min, Math.floor(available / c.quantity));
  }
  return Number.isFinite(min) ? Math.max(0, min) : 0;
}

export function kitCostCents(
  kit: Kit,
  products: Map<string, CostSource & { sizes: string[] }>,
  packagingCents: number,
): number {
  let total = packagingCents;
  for (const c of kit.components) {
    const product = products.get(c.productId);
    if (product) total += unitCostCents(product, c.sizeIndex) * c.quantity;
  }
  return total;
}

/**
 * Display summary of a kit. Total on purpose: components whose product is missing from the map
 * are skipped in `items` and priced as 0 (the backend hides kits with missing components anyway).
 */
export function kitSummary(
  kitProduct: { priceCents: number },
  kit: Kit,
  products: Map<
    string,
    { name: string; image: string; sizes: string[]; priceCents: number; sizePrices?: number[] }
  >,
): KitSummary {
  const items: KitSummary['items'] = [];
  let componentsTotalCents = 0;
  for (const c of kit.components) {
    const product = products.get(c.productId);
    if (!product) continue;
    componentsTotalCents += unitPriceCents(product, c.sizeIndex) * c.quantity;
    items.push({
      productId: c.productId,
      name: product.name,
      image: product.image,
      size: product.sizes[c.sizeIndex] ?? '',
      color: c.color,
      quantity: c.quantity,
    });
  }
  return {
    pieces: kitPieces(kit),
    componentsTotalCents,
    savingsCents: Math.max(0, componentsTotalCents - kitProduct.priceCents),
    items,
  };
}

export function kitMargin(
  product: { priceCents: number; costCents: number },
  settings: CalculatorSettings,
): { profitCents: number; marginPct: number; belowMinimum: boolean; loss: boolean } {
  const fees = Math.round((product.priceCents * feeRatePct(settings)) / 100);
  const profitCents = product.priceCents - product.costCents - settings.fixedPerOrderCents - fees;
  const marginPct =
    product.priceCents > 0 ? Math.round((profitCents / product.priceCents) * 1000) / 10 : 0;
  return {
    profitCents,
    marginPct,
    belowMinimum: marginPct < (settings.minMarginPct ?? 20),
    loss: profitCents < 0,
  };
}

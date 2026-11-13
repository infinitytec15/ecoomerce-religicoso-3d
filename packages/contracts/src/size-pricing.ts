import { costBreakdownTotal } from './schemas';
import type { CostBreakdown } from './types';

/** Legacy price step per size, used when a product has no configured sizePrices. */
export const SIZE_STEP_CENTS = 2000;

export function unitPriceCents(
  p: { priceCents: number; sizePrices?: number[] },
  sizeIndex: number,
): number {
  return p.sizePrices?.[sizeIndex] ?? p.priceCents + sizeIndex * SIZE_STEP_CENTS;
}

export function unitCostBreakdown(
  p: { costCents: number; costBreakdown?: CostBreakdown; costBySize?: CostBreakdown[] },
  sizeIndex: number,
): CostBreakdown {
  return (
    p.costBySize?.[sizeIndex] ??
    p.costBreakdown ?? {
      materialCents: 0,
      packagingCents: 0,
      energyCents: 0,
      laborCents: 0,
      otherCents: p.costCents,
    }
  );
}

export function unitCostCents(
  p: { costCents: number; costBreakdown?: CostBreakdown; costBySize?: CostBreakdown[] },
  sizeIndex: number,
): number {
  return costBreakdownTotal(unitCostBreakdown(p, sizeIndex));
}

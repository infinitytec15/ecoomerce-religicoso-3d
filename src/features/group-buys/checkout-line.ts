import type { GroupBuyPublic } from '@maos-em-oracao/contracts';
import type { CartItem } from '@/lib/domain/types';

/**
 * The single order line of a group checkout. The color and quantity come from the URL, so both are
 * clamped to what the campaign allows; the server validates them again at checkout.
 */
export function groupBuyCheckoutLine(
  gb: GroupBuyPublic,
  color: string,
  quantity: number,
): CartItem {
  const chosen = gb.colors.includes(color) ? color : (gb.colors[0] ?? 'Padrão'),
    qty = Number.isInteger(quantity) ? Math.min(Math.max(quantity, 1), gb.perPersonLimit) : 1;
  return {
    key: ['group', gb.id, chosen].join('|'),
    productId: gb.productId,
    name: gb.productName,
    image: gb.productImage,
    imageIndex: 0,
    color: chosen,
    size: gb.size,
    sizeIndex: gb.sizeIndex,
    // Shown price: in "difference" mode the customer pays the normal price until the goal is hit.
    unitCents:
      gb.mode === 'difference' && !gb.goalReached ? gb.normalPriceCents : gb.groupPriceCents,
    quantity: qty,
    dedication: '',
  };
}

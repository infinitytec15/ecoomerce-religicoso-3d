import type { CartItem } from '@/lib/domain/types';

/** Contents of a kit line: "Kit com N peças" and one "2× Cruz (20 cm · Marfim)" row per component. */
export function KitItems({ kit }: { kit: NonNullable<CartItem['kit']> }) {
  const pieces = kit.items.reduce((sum, item) => sum + item.quantity, 0);
  return (
    <div className="kit-items">
      <small>Kit com {pieces} peças</small>
      <ul>
        {kit.items.map((item, index) => (
          <li key={item.productId + index}>
            <small>
              {item.quantity}× {item.name} ({item.size} · {item.color ?? 'Qualquer cor'})
            </small>
          </li>
        ))}
      </ul>
    </div>
  );
}

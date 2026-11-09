import type { CartItem } from '@/lib/domain/types';
import { calculateTotals } from '@/lib/domain/commerce';
import { money } from '@/lib/domain/format';
import { ProductImage } from '@/components/ui/product-image';
export function PriceSummary({
  items,
  shippingCents,
  coupon = '',
  children,
}: {
  items: CartItem[];
  shippingCents: number;
  coupon?: string;
  children?: React.ReactNode;
}) {
  const totals = calculateTotals(items, shippingCents, coupon);
  return (
    <aside className="summary">
      <h2>Suas escolhas</h2>
      <div className="summary-items">
        {items.map((item) => (
          <div className="summary-item" key={item.key}>
            <ProductImage src={item.image} alt={item.name} sizes="70px" />
            <div>
              <h3>{item.name}</h3>
              <small>
                {item.color} · {item.size} · {item.quantity} un.
              </small>
            </div>
            <strong>{money(item.unitCents * item.quantity)}</strong>
          </div>
        ))}
      </div>
      <div className="money-line">
        <span>Subtotal</span>
        <span>{money(totals.subtotalCents)}</span>
      </div>
      {totals.discountCents > 0 && (
        <div className="money-line">
          <span>Desconto</span>
          <span>− {money(totals.discountCents)}</span>
        </div>
      )}
      <div className="money-line">
        <span>Frete</span>
        <span>{shippingCents === 0 ? 'Incluído' : money(shippingCents)}</span>
      </div>
      <div className="money-line total">
        <span>Total</span>
        <strong>{money(totals.totalCents)}</strong>
      </div>
      {children}
    </aside>
  );
}

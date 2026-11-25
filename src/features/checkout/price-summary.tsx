import type { ShippingQuote } from '@maos-em-oracao/contracts';
import type { CartItem } from '@/lib/domain/types';
import { calculateTotals } from '@/lib/domain/commerce';
import { money } from '@/lib/domain/format';
import { KitItems } from '@/components/commerce/kit-items';
import { ProductImage } from '@/components/ui/product-image';
function DeliveryTime({ quote }: { quote: ShippingQuote }) {
  if (quote.totalDays === undefined)
    return (
      <div className="money-line delivery-time">
        <span>Prazo</span>
        <span>{quote.estimate}</span>
      </div>
    );
  return (
    <div className="money-line delivery-time">
      <span>
        Prazo de entrega
        <small>
          {quote.productionDays} dias de produção + {quote.transitDays} de transporte
        </small>
      </span>
      <strong>até {quote.totalDays} dias úteis</strong>
    </div>
  );
}
export function PriceSummary({
  items,
  shippingCents,
  coupon = '',
  quotedTotals,
  shippingPending = false,
  deliveryQuote,
  children,
}: {
  items: CartItem[];
  shippingCents: number;
  coupon?: string;
  quotedTotals?: ReturnType<typeof calculateTotals>;
  shippingPending?: boolean;
  /** The carrier option the customer picked; shows production + transit time. */
  deliveryQuote?: ShippingQuote;
  children?: React.ReactNode;
}) {
  const totals = quotedTotals || calculateTotals(items, shippingCents, coupon);
  return (
    <aside className="summary">
      <h2>Suas escolhas</h2>
      <div className="summary-items">
        {items.map((item) => (
          <div className="summary-item" key={item.key}>
            <ProductImage src={item.image} alt={item.name} sizes="70px" />
            <div>
              <h3>{item.name}</h3>
              {item.kit ? (
                <>
                  <KitItems kit={item.kit} />
                  <small>{item.quantity} un.</small>
                </>
              ) : (
                <small>
                  {item.color} · {item.size} · {item.quantity} un.
                </small>
              )}
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
        <span>
          {shippingPending
            ? 'A calcular'
            : totals.shippingCents === 0
              ? 'Incluído'
              : money(totals.shippingCents)}
        </span>
      </div>
      {!shippingPending && deliveryQuote && <DeliveryTime quote={deliveryQuote} />}
      <div className="money-line total">
        <span>Total</span>
        <strong>{money(totals.totalCents)}</strong>
      </div>
      {children}
    </aside>
  );
}

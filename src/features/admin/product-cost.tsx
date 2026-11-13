'use client';
import { useEffect, useRef, useState } from 'react';
import type { CostBreakdown, InventoryProduct } from '@/lib/domain/types';
import { centsFromInput, money } from '@/lib/domain/format';

export const costFields: [keyof CostBreakdown, string, string][] = [
  ['materialCents', 'Matéria-prima', 'Filamento ou resina usados na peça'],
  ['packagingCents', 'Embalagem', 'Caixa, proteção, etiqueta e cartão'],
  ['energyCents', 'Energia e máquina', 'Energia e desgaste da impressora'],
  ['laborCents', 'Mão de obra e acabamento', 'Pintura, lixa, montagem'],
  ['otherCents', 'Outros custos', 'Taxas, brindes ou insumos extras'],
];
const fieldName = (key: keyof CostBreakdown) => 'cost_' + key;

/** Reads the breakdown back from the submitted form; costCents is always the sum. */
export function readCostBreakdown(d: FormData) {
  const breakdown = Object.fromEntries(
    costFields.map(([key]) => [key, centsFromInput(String(d.get(fieldName(key)) || 0))]),
  ) as unknown as CostBreakdown;
  const costCents = costFields.reduce((n, [key]) => n + breakdown[key], 0);
  return { costBreakdown: breakdown, costCents };
}

/**
 * Production cost per piece with live total, profit and margin against the sale price
 * typed in the "Dados" tab of the same form.
 */
export function ProductCostFields({ product }: { product?: InventoryProduct }) {
  const ref = useRef<HTMLDivElement>(null);
  const [values, setValues] = useState<CostBreakdown>(
    () =>
      product?.costBreakdown || {
        materialCents: 0,
        packagingCents: 0,
        energyCents: 0,
        laborCents: 0,
        // Products saved before the breakdown keep their total until it is detailed.
        otherCents: product?.costCents || 0,
      },
  );
  const [priceCents, setPriceCents] = useState(product?.priceCents || 8990);
  useEffect(() => {
    const form = ref.current?.closest('form');
    if (!form) return;
    const read = () => {
      const input = form.elements.namedItem('price');
      if (input instanceof HTMLInputElement) setPriceCents(centsFromInput(input.value || 0));
    };
    read();
    form.addEventListener('input', read);
    return () => form.removeEventListener('input', read);
  }, []);
  const total = costFields.reduce((n, [key]) => n + values[key], 0),
    profit = priceCents - total,
    margin = priceCents ? Math.round((profit / priceCents) * 1000) / 10 : 0;
  return (
    <div className="stack product-cost" ref={ref}>
      <h3>Custo de produção por peça</h3>
      <p className="muted">
        Usado para calcular o lucro de cada venda. Pedidos guardam o custo do momento da compra.
      </p>
      <div className="form-grid">
        {costFields.map(([key, label, hint]) => (
          <label key={key}>
            {label} (R$)
            <input
              name={fieldName(key)}
              type="number"
              min={0}
              step=".01"
              inputMode="decimal"
              value={values[key] / 100}
              onChange={(e) =>
                setValues((v) => ({ ...v, [key]: centsFromInput(e.target.value || 0) }))
              }
            />
            <small className="muted">{hint}</small>
          </label>
        ))}
      </div>
      <div className="product-cost-summary" aria-live="polite">
        <div>
          <small>Custo total</small>
          <strong>{money(total)}</strong>
        </div>
        <div>
          <small>Preço de venda</small>
          <strong>{money(priceCents)}</strong>
        </div>
        <div className={profit < 0 ? 'negative' : ''}>
          <small>Lucro por peça</small>
          <strong>{money(profit)}</strong>
        </div>
        <div className={profit < 0 ? 'negative' : ''}>
          <small>Margem</small>
          <strong>{margin}%</strong>
        </div>
      </div>
      {profit < 0 && (
        <p className="form-error" role="alert">
          O custo está acima do preço de venda: esta peça dá prejuízo.
        </p>
      )}
    </div>
  );
}

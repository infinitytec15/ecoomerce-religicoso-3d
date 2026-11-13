'use client';
import { useEffect, useRef, useState } from 'react';
import {
  defaultCalculatorSettings,
  feeRatePct,
  unitCostBreakdown,
  unitPriceCents,
} from '@maos-em-oracao/contracts';
import type { CostBreakdown, InventoryProduct } from '@/lib/domain/types';
import { centsFromInput, money } from '@/lib/domain/format';
import { Modal } from '@/components/ui/modal';
import { useAdminData } from './admin-frame';
import { PrintCostForm } from './cost-calculator';
import { costFields } from './product-cost';

const priceName = (i: number) => `size_price_${i}`;
const costName = (i: number, key: keyof CostBreakdown) => `size_cost_${i}_${key}`;
const sizesFrom = (value: string) =>
  value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
/** Money typed in pt-BR to integer cents; unparseable input is NaN so callers can reject it. */
const toCents = (value: string) => centsFromInput(value.trim());
const safeCents = (value: string) => {
  const n = toCents(value);
  return Number.isFinite(n) ? n : 0;
};
const toInput = (cents: number) => (cents / 100).toFixed(2).replace('.', ',');

type Row = { price: string; cost: Record<keyof CostBreakdown, string> };
const costToInput = (c: CostBreakdown) =>
  Object.fromEntries(costFields.map(([key]) => [key, toInput(c[key])])) as Row['cost'];
const rowTotal = (r: Row) => costFields.reduce((n, [key]) => n + safeCents(r.cost[key]), 0);

/**
 * Reads price and cost per size from the submitted form; row 0 is the base price and cost.
 * Throws a pt-BR message naming the size when a price is not positive or a cost is negative
 * or unparseable, so bad input is never saved as 0.
 */
export function readSizePricing(d: FormData, sizes: number, labels: string[] = []) {
  const count = Math.max(1, sizes);
  const at = (i: number) => labels[i] ?? `tamanho ${i + 1}`;
  const sizePrices = Array.from({ length: count }, (_, i) => {
    const cents = toCents(String(d.get(priceName(i)) ?? ''));
    if (!Number.isFinite(cents) || cents <= 0)
      throw new Error(`Informe um preço válido para ${at(i)}.`);
    return cents;
  });
  const costBySize = Array.from({ length: count }, (_, i) => {
    const out = {} as CostBreakdown;
    for (const [key, label] of costFields) {
      const cents = toCents(String(d.get(costName(i, key)) ?? ''));
      if (!Number.isFinite(cents) || cents < 0)
        throw new Error(`Informe um custo válido em ${label} para ${at(i)}.`);
      out[key] = cents;
    }
    return out;
  });
  const costBreakdown = costBySize[0];
  return {
    priceCents: sizePrices[0],
    sizePrices,
    costBySize,
    costBreakdown,
    costCents: costFields.reduce((n, [key]) => n + costBreakdown[key], 0),
  };
}

/**
 * Price and production cost for each size, with live profit and margin after payment fees.
 * Rows follow the "Tamanhos" field of the same form; a product without configured prices
 * opens with the legacy step so nothing changes until it is edited.
 */
export function ProductSizePricing({ product }: { product?: InventoryProduct }) {
  const ref = useRef<HTMLDivElement>(null);
  const { workspace } = useAdminData();
  const settings = workspace.costCalculator ?? defaultCalculatorSettings;
  const base = product ?? { priceCents: 8990, costCents: 0 };
  const [sizes, setSizes] = useState<string[]>(product?.sizes || ['15 cm', '20 cm', '25 cm']);
  const [rows, setRows] = useState<Row[]>(() =>
    Array.from({ length: Math.max(1, product?.sizes.length ?? 3) }, (_, i) => ({
      price: toInput(unitPriceCents(base, i)),
      cost: costToInput(unitCostBreakdown(base, i)),
    })),
  );
  const [calcRow, setCalcRow] = useState<number | null>(null);
  const count = Math.max(1, sizes.length);
  useEffect(() => {
    const form = ref.current?.closest('form');
    if (!form) return;
    const read = () => {
      const input = form.elements.namedItem('sizes');
      if (!(input instanceof HTMLInputElement)) return;
      const next = sizesFrom(input.value);
      setSizes((old) => (old.join('|') === next.join('|') ? old : next));
      // Rows are only ever appended here: shrinking the list just hides the extras, so
      // a half-typed "Tamanhos" does not lose the numbers already entered.
      setRows((old) => {
        const need = Math.max(1, next.length);
        if (old.length >= need) return old;
        const out = [...old];
        for (let i = old.length; i < need; i++)
          out.push({ price: toInput(unitPriceCents(base, i)), cost: { ...out[i - 1].cost } });
        return out;
      });
    };
    read();
    form.addEventListener('input', read);
    return () => form.removeEventListener('input', read);
    // Subscribe once: `base` only seeds the legacy price of rows added later and never changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const patch = (i: number, fn: (r: Row) => Row) =>
    setRows((old) => old.map((r, j) => (j === i ? fn(r) : r)));
  const feePct = feeRatePct(settings);
  const visible = rows.slice(0, count);
  const figures = visible.map((r) => {
    const price = safeCents(r.price),
      cost = rowTotal(r),
      profit = price - cost - settings.fixedPerOrderCents - Math.round((price * feePct) / 100);
    return { price, cost, profit, margin: price ? Math.round((profit / price) * 1000) / 10 : 0 };
  });
  const loss = figures.some((f) => f.profit < 0);
  return (
    <div className="stack size-pricing" ref={ref}>
      <h3>Preço e custo por tamanho</h3>
      <p className="muted">
        A primeira linha é o preço base mostrado na vitrine. O lucro desconta as taxas de pagamento
        e o custo fixo por pedido da calculadora. Pedidos guardam o custo do momento da compra.
      </p>
      <div className="admin-table-wrap">
        <table className="admin-table size-pricing-table">
          <thead>
            <tr>
              <th scope="col">Tamanho</th>
              <th scope="col">Preço (R$)</th>
              {costFields.map(([key, label]) => (
                <th scope="col" key={key}>
                  {label} (R$)
                </th>
              ))}
              <th scope="col">Custo</th>
              <th scope="col">Lucro</th>
              <th scope="col">Margem</th>
              <th scope="col">
                <span className="sr-only">Calculadora</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row, i) => {
              const label = sizes[i] ?? 'Único',
                f = figures[i];
              return (
                <tr key={i}>
                  <th scope="row">{label}</th>
                  <td>
                    <input
                      aria-label={`Preço — ${label}`}
                      name={priceName(i)}
                      type="text"
                      inputMode="decimal"
                      required
                      value={row.price}
                      onChange={(e) => patch(i, (r) => ({ ...r, price: e.target.value }))}
                    />
                  </td>
                  {costFields.map(([key, name]) => (
                    <td key={key}>
                      <input
                        aria-label={`${name} — ${label}`}
                        name={costName(i, key)}
                        type="text"
                        inputMode="decimal"
                        value={row.cost[key]}
                        onChange={(e) =>
                          patch(i, (r) => ({ ...r, cost: { ...r.cost, [key]: e.target.value } }))
                        }
                      />
                    </td>
                  ))}
                  <td className="num">{money(f.cost)}</td>
                  <td className={`num ${f.profit < 0 ? 'negative' : ''}`}>{money(f.profit)}</td>
                  <td className={`num ${f.profit < 0 ? 'negative' : ''}`}>{f.margin}%</td>
                  <td>
                    <button
                      type="button"
                      className="btn secondary small"
                      onClick={() => setCalcRow(i)}
                    >
                      Calcular
                      <span className="sr-only"> custo — {label}</span>
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {loss && (
        <p className="form-error" role="alert">
          Algum tamanho está com prejuízo: revise preço ou custo.
        </p>
      )}
      <Modal
        open={calcRow !== null}
        onOpenChange={(open) => !open && setCalcRow(null)}
        title="Calcular custo"
        description="Calcula o custo de produção da peça e preenche as cinco partes do custo deste tamanho."
      >
        {calcRow !== null && (
          <PrintCostForm
            settings={settings}
            onApply={(result) => {
              patch(calcRow, (r) => ({ ...r, cost: costToInput(result.breakdown) }));
              setCalcRow(null);
            }}
          />
        )}
      </Modal>
    </div>
  );
}

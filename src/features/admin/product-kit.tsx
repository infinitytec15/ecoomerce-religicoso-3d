'use client';
import { useState } from 'react';
import {
  kitCostCents,
  kitMargin,
  unitPriceCents,
  type CalculatorSettings,
  type Kit,
} from '@maos-em-oracao/contracts';
import type { CostBreakdown, InventoryProduct } from '@/lib/domain/types';
import { centsFromInput, money } from '@/lib/domain/format';
import { Button } from '@/components/ui/button';

const MAX_COMPONENTS = 6;
const toInput = (cents: number) => (cents / 100).toFixed(2).replace('.', ',');
const safeCents = (value: string) => {
  const n = centsFromInput(value.trim());
  return Number.isFinite(n) ? n : 0;
};

/**
 * Reads the kit from the submitted form: component rows (`kit_product_<i>` ...) plus the kit
 * price and its own box. Throws a pt-BR message when the kit is incomplete or a value is invalid.
 */
export function readKit(d: FormData): {
  kit: Kit;
  priceCents: number;
  costBreakdown: CostBreakdown;
  /** Provisional: the API recomputes the kit cost from its components on save. */
  costCents: number;
} {
  const components: Kit['components'] = [];
  for (let i = 0; d.has(`kit_product_${i}`); i++) {
    const productId = String(d.get(`kit_product_${i}`) ?? '');
    const quantity = Number(d.get(`kit_qty_${i}`));
    if (!productId) throw new Error(`Escolha a peça ${i + 1} do kit.`);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10)
      throw new Error(`Informe uma quantidade de 1 a 10 para a peça ${i + 1}.`);
    components.push({
      productId,
      sizeIndex: Number(d.get(`kit_size_${i}`) || 0),
      color: String(d.get(`kit_color_${i}`) ?? '') || null,
      quantity,
    });
  }
  if (components.reduce((sum, c) => sum + c.quantity, 0) < 2)
    throw new Error('Um kit precisa de pelo menos 2 peças.');
  const priceCents = centsFromInput(String(d.get('kit_price') ?? '').trim());
  if (!Number.isFinite(priceCents) || priceCents <= 0)
    throw new Error('Informe um preço válido para o kit.');
  const packagingCents = centsFromInput(String(d.get('kit_packaging') ?? '').trim() || '0');
  if (!Number.isFinite(packagingCents) || packagingCents < 0)
    throw new Error('Informe um custo válido de embalagem do kit.');
  return {
    kit: { components },
    priceCents,
    costCents: packagingCents,
    costBreakdown: {
      materialCents: 0,
      energyCents: 0,
      laborCents: 0,
      packagingCents,
      otherCents: 0,
    },
  };
}

type Row = { productId: string; sizeIndex: number; color: string; quantity: string };

/**
 * Component rows, kit price and own box of a kit, with a live summary of what the customer
 * saves and what the kit earns after payment fees.
 */
export function ProductKitFields({
  product,
  products,
  settings,
}: {
  product?: InventoryProduct;
  products: InventoryProduct[];
  settings: CalculatorSettings;
}) {
  const choices = products.filter((p) => !p.kit && !p.archived && p.id !== product?.id);
  const byId = new Map(products.map((p) => [p.id, p]));
  const [rows, setRows] = useState<Row[]>(() =>
    (product?.kit?.components ?? []).map((c) => ({
      productId: c.productId,
      sizeIndex: c.sizeIndex,
      color: c.color ?? '',
      quantity: String(c.quantity),
    })),
  );
  const [price, setPrice] = useState(toInput(product?.kit ? product.priceCents : 0));
  const [packaging, setPackaging] = useState(
    toInput(product?.kit ? (product.costBreakdown?.packagingCents ?? 0) : 0),
  );
  const patch = (i: number, fn: (r: Row) => Row) =>
    setRows((old) => old.map((r, j) => (j === i ? fn(r) : r)));
  const add = () =>
    setRows((old) => [
      ...old,
      { productId: choices[0]?.id ?? '', sizeIndex: 0, color: '', quantity: '1' },
    ]);

  const valid = rows.flatMap((r) => {
    const quantity = Number(r.quantity);
    return byId.has(r.productId) && Number.isInteger(quantity) && quantity >= 1
      ? [{ productId: r.productId, sizeIndex: r.sizeIndex, color: r.color || null, quantity }]
      : [];
  });
  const kit: Kit = { components: valid };
  const priceCents = safeCents(price);
  const individual = valid.reduce(
    (sum, c) => sum + unitPriceCents(byId.get(c.productId)!, c.sizeIndex) * c.quantity,
    0,
  );
  const costCents = kitCostCents(kit, byId, safeCents(packaging));
  const margin = kitMargin({ priceCents, costCents }, settings);
  const minimum = settings.minMarginPct ?? 20;
  // No alerts while the kit is still being assembled (no pieces or no price yet).
  const ready = priceCents > 0 && valid.length > 0;

  return (
    <div className="stack product-kit">
      <h3>Peças do kit</h3>
      <p className="muted">
        O cliente compra o kit como uma peça só. O estoque vem das peças e o custo é a soma delas
        mais a embalagem do kit.
      </p>
      <div className="admin-table-wrap">
        <table className="admin-table kit-components-table">
          <thead>
            <tr>
              <th scope="col">Peça</th>
              <th scope="col">Tamanho</th>
              <th scope="col">Cor</th>
              <th scope="col">Quantidade</th>
              <th scope="col">
                <span className="sr-only">Ações</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const component = byId.get(row.productId);
              return (
                <tr key={i}>
                  <td>
                    <select
                      aria-label={`Peça ${i + 1}`}
                      name={`kit_product_${i}`}
                      required
                      value={row.productId}
                      onChange={(e) =>
                        patch(i, (r) => ({
                          ...r,
                          productId: e.target.value,
                          sizeIndex: 0,
                          color: '',
                        }))
                      }
                    >
                      {!choices.some((p) => p.id === row.productId) && (
                        <option value={row.productId}>
                          {component?.name ?? 'Peça indisponível'}
                        </option>
                      )}
                      {choices.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <select
                      aria-label={`Tamanho da peça ${i + 1}`}
                      name={`kit_size_${i}`}
                      value={row.sizeIndex}
                      onChange={(e) =>
                        patch(i, (r) => ({ ...r, sizeIndex: Number(e.target.value) }))
                      }
                    >
                      {(component?.sizes ?? []).map((size, index) => (
                        <option key={index} value={index}>
                          {size}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <select
                      aria-label={`Cor da peça ${i + 1}`}
                      name={`kit_color_${i}`}
                      value={row.color}
                      onChange={(e) => patch(i, (r) => ({ ...r, color: e.target.value }))}
                    >
                      <option value="">Qualquer cor</option>
                      {(component?.colors ?? []).map((color) => (
                        <option key={color} value={color}>
                          {color}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      aria-label={`Quantidade da peça ${i + 1}`}
                      name={`kit_qty_${i}`}
                      type="number"
                      min={1}
                      max={10}
                      step={1}
                      required
                      value={row.quantity}
                      onChange={(e) => patch(i, (r) => ({ ...r, quantity: e.target.value }))}
                    />
                  </td>
                  <td>
                    <Button
                      type="button"
                      variant="text"
                      onClick={() => setRows((old) => old.filter((_, j) => j !== i))}
                    >
                      Remover<span className="sr-only"> peça {i + 1}</span>
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div>
        <Button
          type="button"
          variant="secondary"
          disabled={rows.length >= MAX_COMPONENTS || !choices.length}
          onClick={add}
        >
          Adicionar peça
        </Button>
      </div>
      <div className="form-grid">
        <label>
          Preço do kit (R$)
          <input
            name="kit_price"
            type="text"
            inputMode="decimal"
            required
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
        </label>
        <label>
          Embalagem do kit (R$)
          <input
            name="kit_packaging"
            type="text"
            inputMode="decimal"
            value={packaging}
            onChange={(e) => setPackaging(e.target.value)}
          />
        </label>
      </div>
      <section className="stack" aria-label="Resumo do kit">
        <div className="money-line">
          <span>Avulso</span>
          <span>{money(individual)}</span>
        </div>
        <div className="money-line">
          <span>Economia do cliente</span>
          <span>{money(Math.max(0, individual - priceCents))}</span>
        </div>
        <div className="money-line">
          <span>Custo do kit</span>
          <span>{money(costCents)}</span>
        </div>
        <div className="money-line">
          <span>Lucro por kit</span>
          <span className={margin.loss ? 'negative' : ''}>{money(margin.profitCents)}</span>
        </div>
        <div className="money-line">
          <span>Margem</span>
          <span className={margin.loss ? 'negative' : ''}>{margin.marginPct}%</span>
        </div>
      </section>
      {ready && margin.loss && (
        <p className="form-error" role="alert">
          Este kit dá prejuízo.
        </p>
      )}
      {ready && margin.belowMinimum && (
        <p className="form-error" role="alert">
          Margem abaixo da mínima de {minimum}%.
        </p>
      )}
    </div>
  );
}

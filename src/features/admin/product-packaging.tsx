'use client';
import { useEffect, useRef, useState } from 'react';
import type { InventoryProduct, ProductPackage, ProductShipping } from '@/lib/domain/types';

const fields: [keyof ProductPackage, string][] = [
  ['weightGrams', 'Peso (g)'],
  ['widthCm', 'Largura (cm)'],
  ['heightCm', 'Altura (cm)'],
  ['lengthCm', 'Comprimento (cm)'],
];
const fallback: ProductPackage = { weightGrams: 300, widthCm: 18, heightCm: 25, lengthCm: 18 };
const name = (size: number, key: keyof ProductPackage) => `pkg_${size}_${key}`;
const sizesFrom = (value: string) =>
  value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

/** Rebuilds the shipping object: size 0 is the base, every size keeps its own box. */
export function readPackaging(d: FormData, sizes: number): ProductShipping {
  const read = (size: number): ProductPackage =>
    Object.fromEntries(
      fields.map(([key]) => [key, Number(d.get(name(size, key)) || 0)]),
    ) as unknown as ProductPackage;
  const bySize = Array.from({ length: Math.max(1, sizes) }, (_, i) => read(i));
  return {
    ...bySize[0],
    leadTimeDays: Number(d.get('leadTime') || 0),
    bySize,
  };
}

/**
 * Packed measures per size for Melhor Envio quotes. Sizes follow the "Tamanhos" field of
 * the same form live, so a 25 cm piece is quoted in its own box, not the 15 cm one.
 */
export function ProductPackagingFields({
  product,
  single,
}: {
  product?: InventoryProduct;
  /** A kit ships as one fixed option: a single box, regardless of the product's old sizes. */
  single?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [sizes, setSizes] = useState<string[]>(
    single ? [single] : product?.sizes || ['15 cm', '20 cm', '25 cm'],
  );
  useEffect(() => {
    const form = ref.current?.closest('form');
    if (!form || single) return;
    const read = () => {
      const input = form.elements.namedItem('sizes');
      if (input instanceof HTMLInputElement) setSizes(sizesFrom(input.value));
    };
    read();
    form.addEventListener('input', read);
    return () => form.removeEventListener('input', read);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const saved = (i: number): ProductPackage => {
    const s = product?.shipping;
    return s?.bySize?.[i] || (s ? { ...s } : fallback);
  };
  return (
    <div className="stack product-packaging" ref={ref}>
      <h3>Embalagem para Melhor Envio</h3>
      <p className="muted">
        Medidas da peça já embalada, com proteção, para cada tamanho. O frete e a etiqueta usam a
        caixa do tamanho escolhido pelo cliente.
      </p>
      <div className="admin-table-wrap">
        <table className="admin-table packaging-table">
          <thead>
            <tr>
              <th scope="col">Tamanho</th>
              {fields.map(([key, label]) => (
                <th scope="col" key={key}>
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(sizes.length ? sizes : ['Único']).map((size, i) => (
              <tr key={i + size}>
                <th scope="row">{size}</th>
                {fields.map(([key, label]) => (
                  <td key={key}>
                    <input
                      aria-label={`${label} · ${size}`}
                      name={name(i, key)}
                      type="number"
                      min={1}
                      step={key === 'weightGrams' ? 1 : 0.5}
                      required
                      defaultValue={saved(i)[key]}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <label>
        Produção (dias úteis)
        <input
          name="leadTime"
          type="number"
          min={0}
          required
          defaultValue={product?.shipping?.leadTimeDays ?? 5}
        />
      </label>
    </div>
  );
}

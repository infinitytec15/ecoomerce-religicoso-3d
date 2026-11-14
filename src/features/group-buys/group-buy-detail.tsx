'use client';
import { useState } from 'react';
import Link from 'next/link';
import type { GroupBuyPublic } from '@maos-em-oracao/contracts';
import { colorHex } from '@/lib/domain/format';
import { groupBuyUrl } from '@/lib/seo/site-url';
import { Icon } from '@/components/ui/icon';
import { ProductImage } from '@/components/ui/product-image';
import { GroupBuyBlock } from './group-buy-block';

export function GroupBuyDetail({ groupBuy: gb }: { groupBuy: GroupBuyPublic }) {
  const [color, setColor] = useState(gb.colors[0] ?? ''),
    [quantity, setQuantity] = useState(1),
    href =
      `/compra-coletiva/${encodeURIComponent(gb.id)}/checkout?cor=${encodeURIComponent(color)}` +
      `&qtd=${quantity}`;
  return (
    <main id="main" className="container page-top">
      <nav className="breadcrumb" aria-label="Você está aqui">
        <Link href="/">Início</Link>
        <Icon name="chevron" />
        <Link href="/compra-coletiva">Compra coletiva</Link>
        <Icon name="chevron" />
        <span>{gb.title}</span>
      </nav>
      <section className="product-detail">
        <div className="group-buy-photo">
          <ProductImage src={gb.productImage} alt={gb.productName} priority />
        </div>
        <div className="detail-copy">
          <h1>{gb.productName}</h1>
          <span className="badge olive" style={{ marginBottom: 18 }}>
            {gb.title} · tamanho {gb.size}
          </span>
          {gb.description && <p>{gb.description}</p>}
          <div className="detail-options">
            {gb.colors.length > 0 && (
              <div>
                <span className="option-label">
                  Cor: <strong>{color}</strong>
                </span>
                <div className="color-buttons">
                  {gb.colors.map((c) => (
                    <button
                      type="button"
                      className={`color-button ${color === c ? 'selected' : ''}`}
                      key={c}
                      aria-pressed={color === c}
                      onClick={() => setColor(c)}
                    >
                      <i style={{ background: colorHex(c) }} />
                      {c}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <label>
              Quantidade
              <select value={quantity} onChange={(e) => setQuantity(Number(e.target.value))}>
                {Array.from({ length: gb.perPersonLimit }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <GroupBuyBlock groupBuy={gb} href={href} shareUrl={groupBuyUrl(gb.id)} />
        </div>
      </section>
    </main>
  );
}

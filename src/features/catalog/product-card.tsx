'use client';
import Link from 'next/link';
import type { Product } from '@/lib/domain/types';
import { money, colorHex } from '@/lib/domain/format';
import { cartLine } from '@/lib/domain/commerce';
import { useCartStore } from '@/lib/store/cart';
import { Icon } from '@/components/ui/icon';
import { ProductImage } from '@/components/ui/product-image';
import { useNotify } from '@/components/ui/feedback';
import { RatingStars } from './rating-stars';
export function ProductCard({
  product: p,
  priority = false,
}: {
  product: Product;
  priority?: boolean;
}) {
  const favorites = useCartStore((s) => s.favorites),
    toggle = useCartStore((s) => s.toggleFavorite),
    add = useCartStore((s) => s.add),
    notify = useNotify(),
    saved = favorites.includes(p.id);
  return (
    <article className="product-card">
      <div className="product-image">
        <Link href={'/produto/' + p.id} aria-label={'Ver ' + p.name}>
          <ProductImage src={p.image} alt={p.name} priority={priority} />
        </Link>
        <span className="badge">{p.badge}</span>
        <button
          className={`icon-btn fav ${saved ? 'selected' : ''}`}
          aria-label={`${saved ? 'Remover dos' : 'Adicionar aos'} favoritos: ${p.name}`}
          aria-pressed={saved}
          onClick={() => {
            toggle(p.id);
            notify(saved ? 'Peça removida dos favoritos.' : 'Peça guardada nos favoritos.');
          }}
        >
          <Icon name="heart" />
        </button>
        <button
          className="icon-btn quick-add"
          aria-label={'Adicionar ' + p.name + ' ao carrinho'}
          onClick={() => {
            add(cartLine(p));
            notify('Peça adicionada ao carrinho.');
          }}
        >
          <Icon name="plus" />
        </button>
      </div>
      <div className="product-info">
        <span className="category">
          {p.kitSummary
            ? `Kit com ${p.kitSummary.pieces} peças` +
              (p.kitSummary.savingsCents > 0
                ? ` · economize ${money(p.kitSummary.savingsCents)}`
                : '')
            : `${p.category} · impressão 3D`}
        </span>
        <Link href={'/produto/' + p.id}>
          <h3>{p.name}</h3>
        </Link>
        {p.rating && p.rating.count > 0 && (
          <div className="card-rating">
            <RatingStars value={p.rating.average} count={p.rating.count} size={14} />
            <small>({p.rating.count})</small>
          </div>
        )}
        <div className="price">
          {money(p.priceCents)} <small>ou 3× de {money(Math.round(p.priceCents / 3))}</small>
        </div>
        {!p.kit && (
          <div className="swatches" aria-label="Cores disponíveis">
            {p.colors.map((c) => (
              <i key={c} className="swatch" style={{ background: colorHex(c) }} title={c} />
            ))}
          </div>
        )}
      </div>
    </article>
  );
}

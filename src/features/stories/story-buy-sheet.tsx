'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { unitPriceCents } from '@maos-em-oracao/contracts';
import type { Product } from '@/lib/domain/types';
import { cartLine } from '@/lib/domain/commerce';
import { colorHex, money } from '@/lib/domain/format';
import { ApiError } from '@/lib/api/contracts';
import { useCartStore } from '@/lib/store/cart';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { ProductImage } from '@/components/ui/product-image';

/**
 * Buy inside the video: color, size and "Adicionar à sacola" without leaving the player. A kit has
 * no options, so it comes in already added. The line carries the video for sale attribution.
 */
export function StoryBuySheet({
  product,
  videoId,
  added: addedAtOpen = false,
  onAdd,
  onViewBag,
  onOpenProduct,
  onClose,
}: {
  product: Product;
  videoId: string;
  /** The line was already put in the bag (kits). */
  added?: boolean;
  onAdd: () => void;
  onViewBag: () => void;
  /** Leaving the player for the product page. */
  onOpenProduct: () => void;
  onClose: () => void;
}) {
  const [color, setColor] = useState(product.colors[0]),
    [size, setSize] = useState(0),
    [added, setAdded] = useState(addedAtOpen),
    [error, setError] = useState(''),
    add = useCartStore((s) => s.add),
    headingRef = useRef<HTMLHeadingElement>(null),
    price = product.kit ? product.priceCents : unitPriceCents(product, size),
    personalizable = !product.kit && product.tags.includes('Personalizados'),
    chosen = product.kit ? [] : [color, product.sizes[size]];

  useEffect(() => headingRef.current?.focus(), [added]);

  function addToBag() {
    try {
      add(cartLine(product, 1, color, size, '', { videoId }));
    } catch (failure) {
      setError(
        failure instanceof ApiError ? failure.message : 'Não foi possível adicionar esta peça.',
      );
      return;
    }
    setError('');
    setAdded(true);
    onAdd();
  }

  return (
    <div className="story-sheet-layer">
      <button
        type="button"
        className="story-sheet-backdrop"
        tabIndex={-1}
        aria-hidden="true"
        onClick={onClose}
      />
      <section className="story-sheet" role="dialog" aria-label={'Comprar ' + product.name}>
        <div className="story-sheet-product">
          <ProductImage src={product.image} alt="" sizes="56px" />
          <div>
            <h3 ref={headingRef} tabIndex={-1}>
              {added ? 'Adicionado à sacola' : product.name}
            </h3>
            <p>{added ? [product.name, ...chosen, money(price)].join(' · ') : money(price)}</p>
          </div>
          <button
            type="button"
            className="story-sheet-close"
            aria-label="Fechar compra"
            onClick={onClose}
          >
            <Icon name="close" />
          </button>
        </div>
        {added ? (
          <div className="story-sheet-actions" role="status">
            <Button onClick={onViewBag}>
              <Icon name="bag" /> Ver sacola
            </Button>
            <Button variant="secondary" onClick={onClose}>
              Continuar assistindo
            </Button>
          </div>
        ) : (
          <>
            {product.colors.length > 0 && (
              <fieldset className="story-sheet-group">
                <legend>
                  Cor: <strong>{color}</strong>
                </legend>
                <div className="color-buttons">
                  {product.colors.map((c) => (
                    <button
                      type="button"
                      key={c}
                      className={`color-button ${color === c ? 'selected' : ''}`}
                      aria-pressed={color === c}
                      onClick={() => setColor(c)}
                    >
                      <i style={{ background: colorHex(c) }} />
                      {c}
                    </button>
                  ))}
                </div>
              </fieldset>
            )}
            <fieldset className="story-sheet-group">
              <legend>Tamanho</legend>
              <div className="story-size-chips">
                {product.sizes.map((s, index) => (
                  <button
                    type="button"
                    key={s}
                    className={`story-size-chip ${size === index ? 'selected' : ''}`}
                    aria-pressed={size === index}
                    onClick={() => setSize(index)}
                  >
                    <span>{s}</span>
                    <small>{money(unitPriceCents(product, index))}</small>
                  </button>
                ))}
              </div>
            </fieldset>
            {personalizable && (
              <p className="story-sheet-note">
                Quer uma dedicatória na embalagem?{' '}
                <Link href={'/produto/' + product.id} onClick={onOpenProduct}>
                  Personalize na página da peça
                </Link>
                .
              </p>
            )}
            {error && (
              <p className="story-sheet-error" role="alert">
                {error}
              </p>
            )}
            <div className="story-sheet-actions">
              <Button onClick={addToBag}>
                <Icon name="bag" /> Adicionar à sacola
              </Button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

'use client';
import { useEffect, useEffectEvent, useRef, useState, type PointerEvent } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import type { StoryHighlightPublic, StoryProduct } from '@maos-em-oracao/contracts';
import type { Product } from '@/lib/domain/types';
import { useCatalog } from '@/lib/api/query';
import { useCartStore } from '@/lib/store/cart';
import { useAssetUrl } from '@/lib/media/use-asset';
import { money } from '@/lib/domain/format';
import { cartLine } from '@/lib/domain/commerce';
import { buttonClass } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { ProductImage } from '@/components/ui/product-image';
import { attachSource } from './player';
import { useStoryTracker } from './events';
import { StoryBuySheet } from './story-buy-sheet';

const TAP_SLOP_PX = 10,
  CLOSE_DRAG_PX = 80,
  ERROR_ADVANCE_MS = 3000;
type Position = { highlight: number; video: number };
/** Position kept inside the highlights, whose collections all have videos. */
function clampPosition(highlights: StoryHighlightPublic[], position: Position): Position {
  const highlight = Math.min(Math.max(0, position.highlight), highlights.length - 1);
  return {
    highlight,
    video: Math.min(Math.max(0, position.video), highlights[highlight].videos.length - 1),
  };
}
type ViewerProps = {
  highlights: StoryHighlightPublic[];
  start: number;
  /** Video to open in the start collection (a carousel card). */
  startVideo?: number;
  /** Shown instead of the collection title (the product page bubble). */
  title?: string;
  onClose: () => void;
};
/** The open buy sheet: which product, and whether it went in the bag on open (kits). */
type Sheet = { product: Product; added: boolean };

/** The player; closes itself when nothing is left to play (the feed changed while open). */
export default function StoryViewer(props: ViewerProps) {
  const highlights = props.highlights.filter((h) => h.videos.length > 0),
    { onClose } = props,
    empty = highlights.length === 0;
  useEffect(() => {
    if (empty) onClose();
  }, [empty, onClose]);
  return empty ? null : <Player {...props} highlights={highlights} />;
}

function Player({ highlights, start, startVideo = 0, title, onClose }: ViewerProps) {
  const track = useStoryTracker(),
    catalog = useCatalog().data,
    openCart = useCartStore((s) => s.setOpen),
    [stored, setPosition] = useState<Position>(() =>
      clampPosition(highlights, { highlight: start, video: startVideo }),
    ),
    [sheet, setSheet] = useState<Sheet | null>(null),
    [muted, setMuted] = useState(true),
    [progress, setProgress] = useState(0),
    [failed, setFailed] = useState(false),
    [drag, setDrag] = useState(0),
    dialogRef = useRef<HTMLDivElement>(null),
    videoRef = useRef<HTMLVideoElement>(null),
    closeRef = useRef<HTMLButtonElement>(null),
    sheetOpener = useRef<HTMLElement | null>(null),
    pointer = useRef<{ x: number; y: number } | null>(null),
    // The feed can shrink while the player is open (a video leaves after a refresh): stay in range.
    position = clampPosition(highlights, stored),
    highlight = highlights[position.highlight],
    video = highlight.videos[position.video],
    src = useAssetUrl(video.source.src),
    poster = video.source.type === 'hls' ? video.source.poster : undefined,
    heading = title ?? highlight.title;

  /** Sellable catalog product for a video product; none until the catalog loads. */
  function sellable(product: StoryProduct) {
    return catalog?.find((p) => p.id === product.id && p.active && !p.archived);
  }
  function openSheet(product: Product, opener: HTMLElement) {
    sheetOpener.current = opener;
    setSheet({ product, added: product.kit ? addKit(product) : false });
    videoRef.current?.pause();
  }
  /**
   * A kit has no options: straight to the bag, the sheet only confirms. When that fails the sheet
   * opens as for any product, and its own "Adicionar à sacola" shows the reason.
   */
  function addKit(product: Product): boolean {
    try {
      useCartStore.getState().add(cartLine(product, 1, undefined, 0, '', { videoId: video.id }));
    } catch {
      return false;
    }
    track(video.id, 'add_to_cart');
    return true;
  }
  function closeSheet() {
    setSheet(null);
    const opener = sheetOpener.current;
    if (opener?.isConnected) opener.focus();
    else closeRef.current?.focus();
    void videoRef.current?.play()?.catch(() => {});
  }
  function viewBag() {
    onClose();
    openCart(true);
  }
  function openProduct() {
    track(video.id, 'product_click');
    onClose();
  }

  function go(next: Position) {
    setPosition(next);
    setProgress(0);
    setFailed(false);
  }
  function next() {
    if (position.video < highlight.videos.length - 1)
      go({ ...position, video: position.video + 1 });
    else if (position.highlight < highlights.length - 1)
      go({ highlight: position.highlight + 1, video: 0 });
    else onClose();
  }
  function previous() {
    if (position.video > 0) go({ ...position, video: position.video - 1 });
    else if (position.highlight > 0)
      go({
        highlight: position.highlight - 1,
        video: highlights[position.highlight - 1].videos.length - 1,
      });
    else {
      const element = videoRef.current;
      if (element) {
        element.currentTime = 0;
        void element.play().catch(() => {});
      }
      setProgress(0);
    }
  }

  function trapFocus(event: KeyboardEvent) {
    const dialog = sheet
        ? dialogRef.current?.querySelector<HTMLElement>('.story-sheet')
        : dialogRef.current,
      focusable = dialog?.querySelectorAll<HTMLElement>(
        'button:not([tabindex="-1"]), a[href], select, input',
      );
    if (!dialog || !focusable?.length) return;
    const first = focusable[0],
      last = focusable[focusable.length - 1];
    if (!dialog.contains(document.activeElement)) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
    } else if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  const advanceAfterError = useEffectEvent(next);
  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      if (sheet) closeSheet();
      else onClose();
    } else if (event.key === 'Tab') trapFocus(event);
    else if (sheet) return;
    else if (event.key === 'ArrowRight') next();
    else if (event.key === 'ArrowLeft') previous();
    else return;
    if (event.key !== 'Tab') event.preventDefault();
  });
  // Lock the page behind, focus "Fechar", and hand focus back on close.
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null,
      overflow = document.body.style.overflow,
      listener = (event: KeyboardEvent) => onKeyDown(event);
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    document.addEventListener('keydown', listener);
    return () => {
      document.removeEventListener('keydown', listener);
      document.body.style.overflow = overflow;
      if (opener?.isConnected) opener.focus();
    };
  }, []);

  // One source per video; cleaned up when the video changes or the viewer closes.
  const sourceType = video.source.type,
    videoId = video.id;
  useEffect(() => {
    const element = videoRef.current;
    if (!element || !src) return;
    const controller = new AbortController();
    let active = true,
      cleanup: (() => void) | undefined;
    void attachSource(
      element,
      sourceType === 'hls' ? { type: 'hls', src } : { type: 'file', src },
      controller.signal,
    )
      .then((release) => {
        if (active) cleanup = release;
        else release();
      })
      .then(() => {
        if (!active) return;
        // Autoplay with sound can be refused; fall back to muted instead of a frozen frame.
        void element.play().catch((error: unknown) => {
          if (!active || !(error instanceof DOMException) || error.name !== 'NotAllowedError')
            return;
          setMuted(true);
          element.muted = true;
          void element.play().catch(() => {});
        });
      });
    return () => {
      active = false;
      controller.abort();
      cleanup?.();
    };
  }, [src, sourceType, videoId]);

  useEffect(() => {
    if (!failed) return;
    const timer = setTimeout(() => advanceAfterError(), ERROR_ADVANCE_MS);
    return () => clearTimeout(timer);
  }, [failed, position]);

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    pointer.current = { x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (pointer.current) setDrag(Math.max(0, event.clientY - pointer.current.y));
  }
  function onPointerUp(event: PointerEvent<HTMLDivElement>) {
    const from = pointer.current;
    pointer.current = null;
    setDrag(0);
    if (!from) return;
    const dx = event.clientX - from.x,
      dy = event.clientY - from.y;
    if (dy > CLOSE_DRAG_PX) return onClose();
    if (Math.hypot(dx, dy) >= TAP_SLOP_PX) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (event.clientX - rect.left < rect.width / 3) previous();
    else next();
  }
  function onPointerCancel() {
    pointer.current = null;
    setDrag(0);
  }

  return createPortal(
    <div
      ref={dialogRef}
      className="story-viewer"
      role="dialog"
      aria-modal="true"
      aria-label={heading}
      tabIndex={-1}
      style={
        drag ? { transform: `translateY(${drag}px)`, opacity: 1 - Math.min(drag / 400, 0.5) } : {}
      }
    >
      <div className="story-frame">
        <div
          className="story-stage"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
        >
          <video
            ref={videoRef}
            playsInline
            autoPlay
            muted={muted}
            poster={poster}
            onTimeUpdate={(event) => {
              const { currentTime, duration } = event.currentTarget;
              if (duration > 0) setProgress(Math.min(100, (currentTime / duration) * 100));
            }}
            onEnded={() => {
              track(video.id, 'complete');
              next();
            }}
            onError={() => setFailed(true)}
            onPlaying={() => track(video.id, 'play')}
          />
          {failed && (
            <p className="story-error" role="status">
              Não foi possível carregar este vídeo.
            </p>
          )}
        </div>
        <div className="story-top">
          <div className="story-bars">
            {highlight.videos.map((v, index) => {
              const value =
                index < position.video ? 100 : index === position.video ? Math.round(progress) : 0;
              return (
                <div
                  key={v.id}
                  className="story-bar"
                  role="progressbar"
                  aria-label={`Vídeo ${index + 1} de ${highlight.videos.length}`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={value}
                >
                  <i style={{ transform: `scaleX(${value / 100})` }} />
                </div>
              );
            })}
          </div>
          <div className="story-head">
            <strong>{heading}</strong>
            <button type="button" className="story-control" onClick={() => setMuted(!muted)}>
              {muted ? 'Ativar som' : 'Desativar som'}
            </button>
            <button
              ref={closeRef}
              type="button"
              className="story-control story-close"
              aria-label="Fechar"
              onClick={onClose}
            >
              <Icon name="close" />
            </button>
          </div>
        </div>
        <button type="button" className="story-skip story-skip-prev" onClick={previous}>
          Vídeo anterior
        </button>
        <button type="button" className="story-skip story-skip-next" onClick={next}>
          Próximo vídeo
        </button>
        <div className="story-bottom">
          {video.caption && <p>{video.caption}</p>}
          {video.products.length > 0 && (
            <ul className="story-products">
              {video.products.slice(0, 3).map((product) => {
                const full = sellable(product);
                return (
                  <li key={product.id} className="story-product">
                    <ProductImage src={product.image} alt="" sizes="48px" />
                    <span>
                      <strong>{product.name}</strong>
                      <small>{money(full?.priceCents ?? product.priceCents)}</small>
                    </span>
                    <span className="story-product-actions">
                      {full && (
                        <button
                          type="button"
                          className={buttonClass('primary', 'small')}
                          aria-label={`Comprar ${product.name}`}
                          onClick={(event) => openSheet(full, event.currentTarget)}
                        >
                          Comprar
                        </button>
                      )}
                      <Link
                        href={'/produto/' + product.id}
                        className={buttonClass(full ? 'secondary' : 'primary', 'small')}
                        aria-label={`Ver peça ${product.name}`}
                        onClick={openProduct}
                      >
                        Ver peça
                      </Link>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        {sheet && (
          <StoryBuySheet
            key={sheet.product.id}
            product={sheet.product}
            videoId={video.id}
            added={sheet.added}
            onAdd={() => track(video.id, 'add_to_cart')}
            onViewBag={viewBag}
            onOpenProduct={openProduct}
            onClose={closeSheet}
          />
        )}
      </div>
    </div>,
    document.body,
  );
}

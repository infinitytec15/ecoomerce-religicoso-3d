'use client';
import { useEffect, useEffectEvent, useRef, useState, type PointerEvent } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import type { StoryHighlightPublic } from '@maos-em-oracao/contracts';
import { useGateway } from '@/lib/api/query';
import { useAssetUrl } from '@/lib/media/use-asset';
import { money } from '@/lib/domain/format';
import { buttonClass } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { ProductImage } from '@/components/ui/product-image';
import { attachSource } from './player';

/** Videos already counted as viewed on this page load. */
const viewed = new Set<string>();
const TAP_SLOP_PX = 10,
  CLOSE_DRAG_PX = 80,
  ERROR_ADVANCE_MS = 3000;
type Position = { highlight: number; video: number };

export default function StoryViewer({
  highlights,
  start,
  onClose,
}: {
  highlights: StoryHighlightPublic[];
  start: number;
  onClose: () => void;
}) {
  const gateway = useGateway(),
    [position, setPosition] = useState<Position>({ highlight: start, video: 0 }),
    [muted, setMuted] = useState(true),
    [progress, setProgress] = useState(0),
    [failed, setFailed] = useState(false),
    [drag, setDrag] = useState(0),
    dialogRef = useRef<HTMLDivElement>(null),
    videoRef = useRef<HTMLVideoElement>(null),
    closeRef = useRef<HTMLButtonElement>(null),
    pointer = useRef<{ x: number; y: number } | null>(null),
    highlight = highlights[position.highlight],
    video = highlight.videos[position.video],
    src = useAssetUrl(video.source.src),
    poster = video.source.type === 'hls' ? video.source.poster : undefined;

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
    const dialog = dialogRef.current,
      focusable = dialog?.querySelectorAll<HTMLElement>('button, a[href]');
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
    if (event.key === 'Escape') onClose();
    else if (event.key === 'ArrowRight') next();
    else if (event.key === 'ArrowLeft') previous();
    else if (event.key === 'Tab') trapFocus(event);
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
      aria-label={highlight.title}
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
            onEnded={next}
            onError={() => setFailed(true)}
            onPlaying={() => {
              if (viewed.has(video.id)) return;
              viewed.add(video.id);
              void gateway.storyEvent({ videoId: video.id, type: 'view' });
            }}
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
            <strong>{highlight.title}</strong>
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
              {video.products.slice(0, 3).map((product) => (
                <li key={product.id} className="story-product">
                  <ProductImage src={product.image} alt="" sizes="48px" />
                  <span>
                    <strong>{product.name}</strong>
                    <small>{money(product.priceCents)}</small>
                  </span>
                  <Link
                    href={'/produto/' + product.id}
                    className={buttonClass('primary', 'small')}
                    aria-label={`Ver peça ${product.name}`}
                    onClick={() => {
                      void gateway.storyEvent({ videoId: video.id, type: 'click' });
                      onClose();
                    }}
                  >
                    Ver peça
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

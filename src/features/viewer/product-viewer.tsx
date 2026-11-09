'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Product } from '@/lib/domain/types';
import { colorHex } from '@/lib/domain/format';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { ProductImage } from '@/components/ui/product-image';
import type { ViewerController } from './renderer';
export default function ProductViewer({
  product,
  color,
  open,
  onOpenChange,
}: {
  product: Product;
  color: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={product.name + ' em 3D'}
      className="viewer-dialog"
    >
      <ViewerCanvas product={product} initialColor={color} />
    </Modal>
  );
}
function ViewerCanvas({ product, initialColor }: { product: Product; initialColor: string }) {
  const container = useRef<HTMLDivElement>(null),
    controller = useRef<ViewerController | null>(null),
    [ready, setReady] = useState(false),
    [error, setError] = useState(''),
    [attempt, setAttempt] = useState(0),
    [auto, setAuto] = useState(false),
    [color, setColor] = useState(initialColor);
  const autoChanged = useCallback((value: boolean) => setAuto(value), []);
  useEffect(() => {
    let cancelled = false,
      instance: ViewerController | undefined;
    async function start() {
      try {
        const { createViewer } = await import('./renderer');
        if (!container.current || cancelled) return;
        instance = await createViewer(
          container.current,
          product,
          colorHex(initialColor),
          autoChanged,
        );
        if (cancelled) {
          instance.dispose();
          return;
        }
        controller.current = instance;
        setReady(true);
      } catch {
        if (!cancelled)
          setError(
            'O visualizador 3D não pôde ser iniciado neste dispositivo. A fotografia continua disponível.',
          );
      }
    }
    void start();
    return () => {
      cancelled = true;
      instance?.dispose();
      controller.current = null;
    };
  }, [product, initialColor, attempt, autoChanged]);
  return (
    <>
      <div className="viewer-stage">
        <div ref={container} style={{ width: '100%', height: '100%' }} />
        {!ready && !error && (
          <p className="viewer-loading" role="status">
            Preparando sua peça em 3D…
          </p>
        )}
        {error && (
          <div className="viewer-error">
            <ProductImage src={product.image} alt={product.name} sizes="300px" />
            <p role="alert">{error}</p>
            <Button
              variant="secondary"
              onClick={() => {
                setError('');
                setReady(false);
                setAttempt(attempt + 1);
              }}
            >
              Tentar novamente
            </Button>
          </div>
        )}
      </div>
      <div className="viewer-toolbar">
        <button
          className="icon-btn"
          disabled={!ready}
          aria-label="Girar peça para a esquerda"
          onClick={() => controller.current?.rotate(-0.3)}
        >
          <Icon name="rotate" />
        </button>
        <button
          className="icon-btn"
          disabled={!ready}
          aria-label="Aproximar peça"
          onClick={() => controller.current?.zoom(0.85)}
        >
          <Icon name="plus" />
        </button>
        <button
          className="icon-btn"
          disabled={!ready}
          aria-label="Afastar peça"
          onClick={() => controller.current?.zoom(1.15)}
        >
          <Icon name="minus" />
        </button>
        <Button
          variant="secondary"
          className="small"
          disabled={!ready}
          onClick={() => {
            controller.current?.reset();
            setAuto(false);
          }}
        >
          Restaurar visão
        </Button>
        <Button
          variant="secondary"
          className="small"
          disabled={!ready}
          aria-pressed={auto}
          onClick={() => {
            const active = controller.current?.toggleAuto();
            setAuto(!!active);
          }}
        >
          {auto ? 'Parar rotação' : 'Girar sozinho'}
        </Button>
        <div className="color-buttons">
          {product.colors.map((c) => (
            <button
              className={`color-button ${color === c ? 'selected' : ''}`}
              key={c}
              aria-pressed={color === c}
              disabled={!ready}
              onClick={() => {
                setColor(c);
                controller.current?.setColor(colorHex(c));
              }}
            >
              <i style={{ background: colorHex(c) }} />
              {c}
            </button>
          ))}
        </div>
      </div>
      <p className="viewer-disclosure">
        Arraste para girar, use a roda ou o gesto de pinça para aproximar. As setas do teclado giram
        a peça; + e − controlam o zoom. Visualização do arquivo enviado. Cores e acabamento na tela
        podem variar da peça impressa.
      </p>
    </>
  );
}

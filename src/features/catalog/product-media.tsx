'use client';
import { useState } from 'react';
import type { Product, ProductMedia } from '@/lib/domain/types';
import { useAssetUrl } from '@/lib/media/use-asset';
import { ProductImage } from '@/components/ui/product-image';
import { Icon } from '@/components/ui/icon';
export function videoReference(value: string): Pick<ProductMedia, 'source' | 'url'> {
  const url = new URL(value);
  if (url.protocol !== 'https:') throw new Error('Use um link HTTPS.');
  const youtube = [
    'youtube.com',
    'www.youtube.com',
    'm.youtube.com',
    'youtu.be',
    'www.youtube-nocookie.com',
  ].includes(url.hostname);
  if (youtube) {
    const id =
      url.hostname === 'youtu.be'
        ? url.pathname.slice(1)
        : url.searchParams.get('v') || url.pathname.split('/').pop();
    if (!id || !/^[-\w]{11}$/.test(id)) throw new Error('Link do YouTube inválido.');
    return { source: 'youtube', url: `https://www.youtube-nocookie.com/embed/${id}` };
  }
  if (
    url.hostname === 'iframe.mediadelivery.net' &&
    /^\/embed\/\d+\/[a-f0-9-]{36}$/i.test(url.pathname)
  )
    return { source: 'bunny-stream', url: url.origin + url.pathname };
  throw new Error('Informe um vídeo do YouTube ou um link de incorporação do Bunny Stream.');
}
export function MediaPlayer({ media }: { media: ProductMedia }) {
  const src = useAssetUrl(media.url || 'asset:' + media.assetId);
  if (media.status === 'processing')
    return (
      <p className="notice" role="status">
        Vídeo em processamento. Aguarde a preparação da vitrine.
      </p>
    );
  if (media.status === 'failed')
    return (
      <p className="notice" role="alert">
        Não foi possível processar o vídeo. Envie o arquivo novamente.
      </p>
    );
  if (!src) return <p role="status">Carregando vídeo…</p>;
  if (media.source === 'youtube' || media.source === 'bunny-stream') {
    let safe: string;
    try {
      safe = videoReference(src).url!;
    } catch {
      return <p className="notice">Link de vídeo inválido. Edite a mídia do produto.</p>;
    }
    return (
      <iframe
        className="product-video"
        src={safe}
        title={media.alt || 'Vídeo do produto'}
        loading="lazy"
        allow="fullscreen; picture-in-picture"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
      />
    );
  }
  return (
    <video
      className="product-video"
      src={src}
      controls
      preload="metadata"
      playsInline
      aria-label={media.alt}
    />
  );
}
export function ProductGallery({
  product: p,
  onView3D,
}: {
  product: Product;
  onView3D: () => void;
}) {
  const [index, setIndex] = useState(0),
    media = p.media?.length
      ? p.media
      : [
          {
            id: 'cover',
            kind: 'image',
            source: 'external',
            url: p.image,
            alt: p.name,
          } as ProductMedia,
        ],
    current = media[Math.min(index, media.length - 1)];
  return (
    <div>
      <div className="gallery-main">
        {current.kind === 'video' ? (
          <MediaPlayer media={current} />
        ) : (
          <ProductImage
            src={current.url || 'asset:' + current.assetId}
            alt={current.alt || p.name}
            priority
            sizes="(max-width:760px) 100vw, 50vw"
          />
        )}
        {p.model?.status === 'ready' && (
          <button className="open-3d" onClick={onView3D}>
            <Icon name="box" />
            Ver peça em 3D
            <Icon name="rotate" />
          </button>
        )}
      </div>
      <div className="gallery-thumbs">
        {media.map((m, i) => (
          <button
            key={m.id}
            className={index === i ? 'active' : ''}
            aria-label={`Ver ${m.kind === 'video' ? 'vídeo' : 'imagem'} ${i + 1}`}
            aria-pressed={index === i}
            onClick={() => setIndex(i)}
          >
            {m.kind === 'image' ? (
              <ProductImage src={m.url || 'asset:' + m.assetId} alt="" sizes="80px" />
            ) : (
              <>
                <Icon name="video" />
                <span>Vídeo</span>
              </>
            )}
          </button>
        ))}
      </div>
      {!p.media?.length && <p className="demo-text">Imagem conceitual de demonstração.</p>}
    </div>
  );
}

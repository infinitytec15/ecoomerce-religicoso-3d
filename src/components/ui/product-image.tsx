'use client';
import Image from 'next/image';
import { useAssetUrl } from '@/lib/media/use-asset';
export function ProductImage({
  src,
  alt,
  className = '',
  priority = false,
  sizes = '(max-width: 760px) 45vw, 25vw',
}: {
  src: string;
  alt: string;
  className?: string;
  priority?: boolean;
  sizes?: string;
}) {
  const resolved = useAssetUrl(src);
  return (
    <div className={`photo ${className}`}>
      {resolved ? (
        <Image
          src={resolved}
          alt={alt}
          fill
          sizes={sizes}
          preload={priority}
          unoptimized={resolved.startsWith('blob:')}
          style={{ objectFit: 'cover' }}
        />
      ) : (
        <span className="media-placeholder">Imagem indisponível</span>
      )}
    </div>
  );
}

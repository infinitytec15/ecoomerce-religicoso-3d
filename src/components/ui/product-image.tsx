import Image from 'next/image';
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
  return (
    <div className={`photo ${className}`}>
      <Image
        src={src}
        alt={alt}
        fill
        sizes={sizes}
        preload={priority}
        style={{ objectFit: 'cover' }}
      />
    </div>
  );
}

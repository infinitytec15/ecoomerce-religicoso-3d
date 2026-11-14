'use client';
import { useState } from 'react';
import dynamic from 'next/dynamic';
import type { StoryHighlightPublic } from '@maos-em-oracao/contracts';
import { useAssetUrl } from '@/lib/media/use-asset';

// The viewer (and hls.js behind it) only loads when a highlight is opened.
const StoryViewer = dynamic(() => import('./story-viewer'), { ssr: false });

function StoryCover({ src }: { src: string }) {
  const url = useAssetUrl(src);
  return (
    <span className="story-ring">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element -- 64 px cover, may be a blob: URL
        <img src={url} alt="" width={64} height={64} loading="lazy" decoding="async" />
      ) : (
        <span className="story-cover-empty" />
      )}
    </span>
  );
}

export function StoriesRow({
  highlights,
  title,
}: {
  highlights: StoryHighlightPublic[];
  title?: string;
}) {
  const [open, setOpen] = useState<number | null>(null);
  if (!highlights.length) return null;
  return (
    <section className="stories-row" aria-label={title ?? 'Destaques em vídeo'}>
      {title && <h2>{title}</h2>}
      <ul className="stories-list">
        {highlights.map((highlight, index) => (
          <li key={highlight.id}>
            <button
              type="button"
              className="story-bubble"
              aria-label={'Abrir destaque ' + highlight.title}
              onClick={() => setOpen(index)}
            >
              <StoryCover src={highlight.coverUrl} />
              <span className="story-bubble-title">{highlight.title}</span>
            </button>
          </li>
        ))}
      </ul>
      {open !== null && open < highlights.length && (
        <StoryViewer highlights={highlights} start={open} onClose={() => setOpen(null)} />
      )}
    </section>
  );
}

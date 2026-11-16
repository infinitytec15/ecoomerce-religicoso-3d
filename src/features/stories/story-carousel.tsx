'use client';
import { useEffect, useId, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import type { StoryHighlightPublic } from '@maos-em-oracao/contracts';
import { money } from '@/lib/domain/format';
import { Icon } from '@/components/ui/icon';
import { useStoryTracker } from './events';
import { StoryPoster } from './story-poster';

const StoryViewer = dynamic(() => import('./story-viewer'), { ssr: false });
/** Share of a card that must be on screen to count an impression. */
const SEEN_RATIO = 0.5;

/** A collection drawn as a row of vertical video cards; a card opens the player at its video. */
export function StoryCarousel({ highlight }: { highlight: StoryHighlightPublic }) {
  const [open, setOpen] = useState<number | null>(null),
    track = useStoryTracker(),
    list = useRef<HTMLUListElement>(null),
    headingId = useId();

  useEffect(() => {
    const element = list.current;
    if (!element || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = (entry.target as HTMLElement).dataset.videoId;
          if (!id || !entry.isIntersecting || entry.intersectionRatio < SEEN_RATIO) continue;
          track(id, 'impression');
          observer.unobserve(entry.target);
        }
      },
      { threshold: SEEN_RATIO },
    );
    element.querySelectorAll('[data-video-id]').forEach((card) => observer.observe(card));
    return () => observer.disconnect();
  }, [highlight, track]);

  return (
    <section className="story-carousel" aria-labelledby={headingId}>
      <h2 id={headingId}>{highlight.title}</h2>
      <ul ref={list} className="story-cards">
        {highlight.videos.map((video, index) => {
          const product = video.products[0],
            label = video.caption || product?.name || `Vídeo ${index + 1}`;
          return (
            <li key={video.id} data-video-id={video.id}>
              <button
                type="button"
                className="story-card"
                aria-label={`Assistir: ${label}`}
                onClick={() => setOpen(index)}
              >
                <span className="story-card-media">
                  <StoryPoster video={video} />
                  <span className="story-card-play" aria-hidden="true">
                    <Icon name="video" />
                  </span>
                  {video.caption && <span className="story-card-caption">{video.caption}</span>}
                </span>
                {product && (
                  <span className="story-card-product">
                    <strong>{product.name}</strong>
                    <small>{money(product.priceCents)}</small>
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
      {open !== null && open < highlight.videos.length && (
        <StoryViewer
          highlights={[highlight]}
          start={0}
          startVideo={open}
          onClose={() => setOpen(null)}
        />
      )}
    </section>
  );
}

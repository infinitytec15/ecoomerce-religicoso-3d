'use client';
import { useState, useSyncExternalStore } from 'react';
import dynamic from 'next/dynamic';
import {
  productVideos,
  type StoriesFeed,
  type StoryHighlightPublic,
} from '@maos-em-oracao/contracts';
import { Icon } from '@/components/ui/icon';
import { StoryPoster } from './story-poster';

const StoryViewer = dynamic(() => import('./story-viewer'), { ssr: false });

/** Once closed, the bubble stays away for the rest of the browser session (every product). */
export const BUBBLE_DISMISS_KEY = 'meo-product-videos-closed';
const TITLE = 'Vídeos da peça';

const listeners = new Set<() => void>();
function isDismissed() {
  try {
    return sessionStorage.getItem(BUBBLE_DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}
function rememberDismissal() {
  try {
    sessionStorage.setItem(BUBBLE_DISMISS_KEY, '1');
  } catch {
    // Storage blocked: the bubble still hides until the next page load.
  }
  listeners.forEach((listener) => listener());
}
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const hiddenSnapshot = isDismissed;
// Hidden while rendering on the server: the session choice is only known in the browser.
const hiddenOnServer = () => true;

/** Floating bubble of the product page that plays the videos showing this product. */
export function ProductVideoBubble({
  feed,
  productId,
  productName,
}: {
  feed: StoriesFeed;
  productId: string;
  productName: string;
}) {
  const dismissed = useSyncExternalStore(subscribe, hiddenSnapshot, hiddenOnServer),
    [closed, setClosed] = useState(false),
    [open, setOpen] = useState(false),
    videos = productVideos(feed, productId);
  if (!videos.length || ((dismissed || closed) && !open)) return null;
  const highlight: StoryHighlightPublic = {
    id: 'produto-' + productId,
    title: TITLE,
    coverUrl: '',
    format: 'stories',
    placements: [],
    categories: [],
    videos,
  };
  return (
    <>
      <div className={`product-video-bubble ${feed.productPage.position}`}>
        <button
          type="button"
          className="product-video-open"
          aria-label={`Ver vídeos de ${productName}`}
          onClick={() => setOpen(true)}
        >
          <span className="product-video-ring">
            <StoryPoster video={videos[0]} size={64} />
          </span>
          <span className="product-video-badge" aria-hidden="true">
            <Icon name="video" />
            Ver
          </span>
        </button>
        <button
          type="button"
          className="product-video-close"
          aria-label="Fechar vídeos da peça"
          onClick={() => {
            setClosed(true);
            rememberDismissal();
          }}
        >
          <Icon name="close" />
        </button>
      </div>
      {open && (
        <StoryViewer
          highlights={[highlight]}
          start={0}
          title={TITLE}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

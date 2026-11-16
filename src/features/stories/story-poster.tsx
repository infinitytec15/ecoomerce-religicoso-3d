'use client';
import type { StoryVideoPublic } from '@maos-em-oracao/contracts';
import { useAssetUrl } from '@/lib/media/use-asset';

/**
 * Still frame of a video: the HLS poster when there is one, otherwise the first frame of the file
 * (muted, metadata only; nothing plays).
 */
export function StoryPoster({ video, size }: { video: StoryVideoPublic; size?: number }) {
  const file = useAssetUrl(video.source.type === 'file' ? video.source.src : undefined);
  if (video.source.type === 'hls')
    return video.source.poster ? (
      // eslint-disable-next-line @next/next/no-img-element -- remote video poster
      <img
        src={video.source.poster}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
      />
    ) : (
      <span className="story-poster-empty" />
    );
  return file ? (
    <video
      src={file + '#t=0.1'}
      muted
      playsInline
      preload="metadata"
      aria-hidden="true"
      tabIndex={-1}
      disablePictureInPicture
    />
  ) : (
    <span className="story-poster-empty" />
  );
}

import type { StorySource } from '@maos-em-oracao/contracts';

const HLS_MIME = 'application/vnd.apple.mpegurl';

const fail = (video: HTMLVideoElement) => video.dispatchEvent(new Event('error'));

/** Stops the download without firing `error` (an empty `src` would). */
function detach(video: HTMLVideoElement) {
  video.removeAttribute('src');
  video.load();
}

/**
 * Puts a story source on the video. Files and native HLS (Safari/iOS) go straight to `src`;
 * other browsers load `hls.js` on demand. Any failure surfaces as the video's `error` event.
 * Resolves to the cleanup for this source. Once `signal` aborts (the viewer moved on while
 * `hls.js` was loading), nothing is attached and the cleanup is a no-op.
 */
export async function attachSource(
  video: HTMLVideoElement,
  source: StorySource,
  signal?: AbortSignal,
): Promise<() => void> {
  if (source.type === 'file' || video.canPlayType(HLS_MIME) !== '') {
    video.src = source.src;
    return () => detach(video);
  }
  let Hls: typeof import('hls.js').default;
  try {
    ({ default: Hls } = await import('hls.js'));
  } catch {
    if (!signal?.aborted) fail(video);
    return () => {};
  }
  if (signal?.aborted) return () => {};
  if (!Hls.isSupported()) {
    fail(video);
    return () => {};
  }
  const hls = new Hls({ maxBufferLength: 10, capLevelToPlayerSize: true });
  hls.on(Hls.Events.ERROR, (_event, data) => {
    if (data.fatal) fail(video);
  });
  hls.loadSource(source.src);
  hls.attachMedia(video);
  return () => hls.destroy();
}

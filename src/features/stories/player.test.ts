import { describe, it, expect, vi, beforeEach } from 'vitest';
import { attachSource } from './player';

const h = vi.hoisted(() => {
  const state = {
    supported: true,
    handlers: new Map<string, (event: string, data: { fatal: boolean }) => void>(),
  };
  const instance = {
    loadSource: vi.fn(),
    attachMedia: vi.fn(),
    destroy: vi.fn(),
    on: vi.fn((event: string, handler: (event: string, data: { fatal: boolean }) => void) => {
      state.handlers.set(event, handler);
    }),
  };
  const Hls = Object.assign(
    vi.fn(function () {
      return instance;
    }),
    { isSupported: () => state.supported, Events: { ERROR: 'hlsError' } },
  );
  return { state, instance, Hls };
});
vi.mock('hls.js', () => ({ default: h.Hls }));

const playlist = 'https://vz-demo.b-cdn.net/abc/playlist.m3u8';
function videoWith(canPlay: CanPlayTypeResult) {
  const video = document.createElement('video');
  video.canPlayType = vi.fn(() => canPlay);
  return video;
}

describe('attachSource', () => {
  beforeEach(() => {
    h.state.supported = true;
    h.state.handlers.clear();
  });

  it('arquivo vai direto no src', async () => {
    const video = videoWith('');
    await attachSource(video, { type: 'file', src: '/assets/stories/oficina-1.mp4' });
    expect(video.getAttribute('src')).toBe('/assets/stories/oficina-1.mp4');
    expect(h.Hls).not.toHaveBeenCalled();
  });

  it('HLS nativo usa o src sem carregar o hls.js', async () => {
    const video = videoWith('maybe');
    await attachSource(video, { type: 'hls', src: playlist });
    expect(video.src).toBe(playlist);
    expect(h.Hls).not.toHaveBeenCalled();
  });

  it('sem HLS nativo, usa o hls.js e a limpeza destrói a instância', async () => {
    const video = videoWith('');
    const cleanup = await attachSource(video, { type: 'hls', src: playlist });
    expect(h.Hls).toHaveBeenCalledWith({ maxBufferLength: 10, capLevelToPlayerSize: true });
    expect(h.instance.loadSource).toHaveBeenCalledWith(playlist);
    expect(h.instance.attachMedia).toHaveBeenCalledWith(video);
    expect(h.instance.destroy).not.toHaveBeenCalled();
    cleanup();
    expect(h.instance.destroy).toHaveBeenCalledTimes(1);
  });

  it('erro fatal do hls.js dispara error no vídeo; erro não fatal, não', async () => {
    const video = videoWith(''),
      onError = vi.fn();
    video.addEventListener('error', onError);
    await attachSource(video, { type: 'hls', src: playlist });
    const handler = h.state.handlers.get('hlsError')!;
    handler('hlsError', { fatal: false });
    expect(onError).not.toHaveBeenCalled();
    handler('hlsError', { fatal: true });
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('abortado durante o import do hls.js não anexa nada', async () => {
    const video = videoWith(''),
      controller = new AbortController(),
      pending = attachSource(video, { type: 'hls', src: playlist }, controller.signal);
    controller.abort();
    const cleanup = await pending;
    expect(h.Hls).not.toHaveBeenCalled();
    expect(h.instance.loadSource).not.toHaveBeenCalled();
    expect(h.instance.attachMedia).not.toHaveBeenCalled();
    expect(video.hasAttribute('src')).toBe(false);
    expect(cleanup).not.toThrow();
  });

  it('sem suporte a HLS dispara error', async () => {
    h.state.supported = false;
    const video = videoWith(''),
      onError = vi.fn();
    video.addEventListener('error', onError);
    await attachSource(video, { type: 'hls', src: playlist });
    expect(h.Hls).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(1);
  });
});

import { describe, it, expect, vi, afterEach } from 'vitest';
import { EMPTY_STORIES_FEED } from '@maos-em-oracao/contracts';

vi.mock('next/server', () => ({ connection: async () => undefined }));
vi.mock('./config', () => ({ IS_DEMO: false }));

describe('getServerStories', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('returns an empty feed when the API fails, so the page still renders', async () => {
    vi.stubEnv('API_BASE_URL', 'https://api.test');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
    const { getServerStories } = await import('./server');
    await expect(getServerStories()).resolves.toEqual(EMPTY_STORIES_FEED);
  });

  it('returns an empty feed on an error status or an unexpected payload', async () => {
    vi.stubEnv('API_BASE_URL', 'https://api.test');
    const { getServerStories } = await import('./server');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 500 })));
    await expect(getServerStories()).resolves.toEqual(EMPTY_STORIES_FEED);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: 'x' }), { status: 200 })),
    );
    await expect(getServerStories()).resolves.toEqual(EMPTY_STORIES_FEED);
  });

  it('gives up after 2.5 s when the API never answers', async () => {
    vi.useFakeTimers();
    try {
      vi.stubEnv('API_BASE_URL', 'https://api.test');
      vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => undefined)));
      const { getServerStories } = await import('./server');
      const result = getServerStories();
      await vi.advanceTimersByTimeAsync(2500);
      await expect(result).resolves.toEqual(EMPTY_STORIES_FEED);
    } finally {
      vi.useRealTimers();
    }
  });

  it('returns the API feed when it answers', async () => {
    vi.stubEnv('API_BASE_URL', 'https://api.test');
    const video = { id: 'v1', caption: '', source: { type: 'file', src: '/a.mp4' }, products: [] };
    const feed = {
      collections: [
        {
          id: 'h1',
          title: 'Bastidores',
          coverUrl: 'https://cdn.test/c.webp',
          format: 'carousel',
          placements: ['home_middle'],
          categories: [],
          videos: [video],
        },
      ],
      productPage: { enabled: true, position: 'left', videos: [video], byProduct: { p1: ['v1'] } },
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: feed }))));
    const { getServerStories } = await import('./server');
    expect(await getServerStories()).toEqual(feed);
  });
});

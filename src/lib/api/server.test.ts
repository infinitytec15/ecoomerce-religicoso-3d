import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('next/server', () => ({ connection: async () => undefined }));
vi.mock('./config', () => ({ IS_DEMO: false }));

describe('getServerStories', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('returns no stories when the API fails, so the page still renders', async () => {
    vi.stubEnv('API_BASE_URL', 'https://api.test');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
    const { getServerStories } = await import('./server');
    await expect(getServerStories()).resolves.toEqual([]);
  });

  it('returns no stories on an error status or an unexpected payload', async () => {
    vi.stubEnv('API_BASE_URL', 'https://api.test');
    const { getServerStories } = await import('./server');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 500 })));
    await expect(getServerStories()).resolves.toEqual([]);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: 'x' }), { status: 200 })),
    );
    await expect(getServerStories()).resolves.toEqual([]);
  });

  it('returns the API highlights when it answers', async () => {
    vi.stubEnv('API_BASE_URL', 'https://api.test');
    const highlight = {
      id: 'h1',
      title: 'Bastidores',
      coverUrl: 'https://cdn.test/c.webp',
      placements: ['home'],
      categories: [],
      videos: [{ id: 'v1', caption: '', source: { type: 'file', src: '/a.mp4' }, products: [] }],
    };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [highlight] }))),
    );
    const { getServerStories } = await import('./server');
    expect(await getServerStories()).toEqual([highlight]);
  });
});

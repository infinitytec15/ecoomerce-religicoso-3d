import { describe, it, expect } from 'vitest';
import { productVideos, storiesFor, type AdminStoryVideo } from '@maos-em-oracao/contracts';
import {
  publicStoriesFeed,
  recordStoryEvents,
  saveStorySettings,
  storyVideoSales,
} from '@/lib/domain/stories';
import type { Operations, Order } from '@/lib/domain/types';
import { DemoGateway } from './gateway';
import { BrowserDemoStorage, MemoryDemoStorage } from './storage';
import { createSeed, DEMO_EMAIL, DEMO_PASSWORD } from './seed';

const staff = { email: DEMO_EMAIL, password: DEMO_PASSWORD, kind: 'staff' as const };
const highlight = (patch: Record<string, unknown> = {}) =>
  ({
    type: 'story.save',
    title: 'Novo destaque',
    coverAssetId: 'capa-1',
    active: true,
    format: 'stories',
    placements: ['home_top'],
    categories: [],
    ...patch,
  }) as never;
const video = (highlightId: string, patch: Record<string, unknown> = {}) =>
  ({
    type: 'story.video.save',
    highlightId,
    assetId: 'arquivo-1',
    caption: 'Legenda',
    productIds: [],
    active: true,
    ...patch,
  }) as never;
const withAdmin = async (g: DemoGateway) => {
  await g.login(staff);
  return async () => (await g.admin()).stories;
};
/** State read through the memory storage, as the gateway sees it. */
const stateOf = (storage: MemoryDemoStorage) => storage.load();
const videoOf = (state: Operations, id: string) =>
  state.stories.flatMap((h) => h.videos).find((v) => v.id === id) as AdminStoryVideo;

describe('demo stories feed', () => {
  it('shows the demo stories on top of the home and the carousel in the middle', () => {
    const feed = publicStoriesFeed(createSeed());
    expect(feed.collections.map((c) => [c.id, c.format, c.placements])).toEqual([
      ['destaque-demo', 'stories', ['home_top', 'category']],
      ['carrossel-demo', 'carousel', ['home_middle']],
    ]);
    const [stories, carousel] = feed.collections;
    expect(stories).toMatchObject({
      title: 'Bastidores',
      coverUrl: '/assets/stories/bastidores.webp',
      categories: ['Presentes'],
    });
    expect(stories.videos.map((v) => v.id)).toEqual(['video-demo-1', 'video-demo-2']);
    expect(stories.videos[1].source).toEqual({
      type: 'file',
      src: '/assets/stories/oficina-2.mp4',
    });
    expect(carousel.videos).toHaveLength(2);
    expect(storiesFor(feed.collections, { place: 'home_middle' }).map((c) => c.id)).toEqual([
      'carrossel-demo',
    ]);
    expect(
      storiesFor(feed.collections, { place: 'category', category: 'Presentes' }).map((c) => c.id),
    ).toEqual(['destaque-demo']);
    expect(JSON.stringify(feed)).not.toMatch(/views|clicks|assetId|impressions/);
  });

  it('feeds the product page with every video, newest first, by product', () => {
    const seed = createSeed(),
      feed = publicStoriesFeed(seed),
      [first] = seed.products;
    expect(feed.productPage).toMatchObject({ enabled: true, position: 'right' });
    expect(feed.productPage.videos.map((v) => v.id)).toEqual([
      'video-demo-4',
      'video-demo-3',
      'video-demo-2',
      'video-demo-1',
    ]);
    expect(feed.productPage.byProduct[first.id]).toEqual([
      'video-demo-3',
      'video-demo-2',
      'video-demo-1',
    ]);
    expect(productVideos(feed, first.id).map((v) => v.id)).toEqual([
      'video-demo-3',
      'video-demo-2',
      'video-demo-1',
    ]);
  });

  it('only sells products that are active, not archived and in stock', () => {
    const seed = createSeed(),
      [first, second] = seed.products,
      state = {
        ...seed,
        products: seed.products.map((p) =>
          p.id === first.id
            ? { ...p, stock: 0 }
            : p.id === second.id
              ? { ...p, archived: true }
              : p,
        ),
      },
      feed = publicStoriesFeed(state),
      ids = feed.collections.flatMap((c) => c.videos.map((v) => v.id));
    // Video 1 only sells the first piece, video 2 the first and second: both drop out.
    expect(ids).not.toContain('video-demo-1');
    expect(ids).not.toContain('video-demo-2');
    expect(feed.collections.map((c) => c.id)).toEqual(['carrossel-demo']);
    const sold = feed.productPage.videos.flatMap((v) => v.products.map((p) => p.id));
    expect(sold).not.toContain(first.id);
    expect(sold).not.toContain(second.id);
    expect(feed.productPage.byProduct[first.id]).toBeUndefined();
  });

  it('keeps a collection without places off the store but its videos on the product page', () => {
    const seed = createSeed(),
      state = {
        ...seed,
        stories: seed.stories.map((h) =>
          h.id === 'carrossel-demo' ? { ...h, placements: [] } : h,
        ),
      },
      feed = publicStoriesFeed(state);
    expect(feed.collections.map((c) => c.id)).toEqual(['destaque-demo']);
    expect(feed.productPage.videos.map((v) => v.id)).toContain('video-demo-3');
  });

  it('feeds the product page from inactive collections but not inactive videos', () => {
    const seed = createSeed(),
      state = {
        ...seed,
        stories: seed.stories.map((h) =>
          h.id === 'carrossel-demo'
            ? {
                ...h,
                active: false,
                videos: h.videos.map((v) =>
                  v.id === 'video-demo-4' ? { ...v, active: false } : v,
                ),
              }
            : h,
        ),
      },
      feed = publicStoriesFeed(state);
    expect(feed.collections.map((c) => c.id)).toEqual(['destaque-demo']);
    expect(feed.productPage.videos.map((v) => v.id)).toEqual([
      'video-demo-3',
      'video-demo-2',
      'video-demo-1',
    ]);
  });

  it('turns the product page off by the setting', () => {
    const seed = createSeed(),
      feed = publicStoriesFeed({
        ...seed,
        storySettings: { productPage: { enabled: false, position: 'left' } },
      });
    expect(feed.productPage).toEqual({
      enabled: false,
      position: 'left',
      videos: [],
      byProduct: {},
    });
    expect(feed.collections).toHaveLength(2);
  });

  it('caps the videos of one product, newest first', () => {
    const seed = createSeed(),
      [first] = seed.products,
      many = Array.from({ length: 12 }, (_, i) => ({
        ...seed.stories[0].videos[0],
        id: `extra-${i}`,
        position: i,
        createdAt: `2026-12-${String(i + 10).padStart(2, '0')}T00:00:00.000Z`,
      })),
      feed = publicStoriesFeed({
        ...seed,
        stories: [{ ...seed.stories[0], videos: many }],
      });
    expect(feed.productPage.byProduct[first.id]).toEqual(
      Array.from({ length: 10 }, (_, i) => `extra-${11 - i}`),
    );
  });
});

describe('demo story events', () => {
  it('counts each event type and ignores unknown or inactive videos', () => {
    const seed = createSeed(),
      state = {
        ...seed,
        stories: seed.stories.map((h) => ({
          ...h,
          videos: h.videos.map((v) => (v.id === 'video-demo-4' ? { ...v, active: false } : v)),
        })),
      },
      before = videoOf(state, 'video-demo-1'),
      next = recordStoryEvents(state, [
        { videoId: 'video-demo-1', type: 'impression' },
        { videoId: 'video-demo-1', type: 'impression' },
        { videoId: 'video-demo-1', type: 'play' },
        { videoId: 'video-demo-1', type: 'complete' },
        { videoId: 'video-demo-1', type: 'product_click' },
        { videoId: 'video-demo-1', type: 'add_to_cart' },
        { videoId: 'video-demo-4', type: 'play' },
        { videoId: 'nao-existe', type: 'play' },
        { videoId: 'video-demo-1', type: 'like' } as never,
      ]);
    expect(videoOf(next, 'video-demo-1')).toMatchObject({
      impressions: before.impressions + 2,
      views: before.views + 1,
      completes: before.completes + 1,
      clicks: before.clicks + 1,
      carts: before.carts + 1,
    });
    expect(videoOf(next, 'video-demo-4').views).toBe(videoOf(state, 'video-demo-4').views);
    // Immutable: the given state is untouched.
    expect(videoOf(state, 'video-demo-1')).toEqual(before);
  });

  it('counts videos of an inactive collection (they still play on the product page)', () => {
    const seed = createSeed(),
      state = { ...seed, stories: seed.stories.map((h) => ({ ...h, active: false })) },
      next = recordStoryEvents(state, [{ videoId: 'video-demo-3', type: 'play' }]);
    expect(videoOf(next, 'video-demo-3').views).toBe(videoOf(state, 'video-demo-3').views + 1);
  });

  it('returns the same state when nothing counts', () => {
    const seed = createSeed();
    expect(recordStoryEvents(seed, [])).toBe(seed);
  });
});

describe('demo story sales', () => {
  const order = (id: string, status: Order['status'], items: Partial<Order['items'][0]>[]) =>
    ({ id, status, items }) as Order;

  it('counts paid orders and item revenue per video', () => {
    const sales = storyVideoSales([
      order('A', 'Confirmado', [
        { videoId: 'v1', unitCents: 1000, quantity: 2 },
        { videoId: 'v1', unitCents: 500, quantity: 1 },
        { unitCents: 9999, quantity: 1 },
      ]),
      order('B', 'Entregue', [{ videoId: 'v1', unitCents: 700, quantity: 1 }]),
      order('C', 'Aguardando pagamento', [{ videoId: 'v1', unitCents: 100, quantity: 1 }]),
      order('D', 'Cancelado', [{ videoId: 'v1', unitCents: 100, quantity: 1 }]),
      order('E', 'Aguardando grupo', [{ videoId: 'v2', unitCents: 100, quantity: 1 }]),
    ]);
    expect(sales.get('v1')).toEqual({ orders: 2, revenueCents: 3200 });
    expect(sales.has('v2')).toBe(false);
  });

  it('shows the demo sales on the admin snapshot', async () => {
    const g = new DemoGateway(),
      stories = await withAdmin(g),
      seed = createSeed(),
      videos = (await stories()).flatMap((h) => h.videos),
      byId = (id: string) => videos.find((v) => v.id === id)!,
      unit = (orderId: string, videoId: string) =>
        seed.orders
          .find((o) => o.id === orderId)!
          .items.filter((i) => i.videoId === videoId)
          .reduce((sum, i) => sum + i.unitCents * i.quantity, 0);
    expect(byId('video-demo-1')).toMatchObject({
      orders: 1,
      revenueCents: unit('PED-4004', 'video-demo-1'),
    });
    // PED-4005 is waiting for payment: only PED-4002 counts.
    expect(byId('video-demo-4')).toMatchObject({
      orders: 1,
      revenueCents: unit('PED-4002', 'video-demo-4'),
    });
    expect(byId('video-demo-4').revenueCents).toBeGreaterThan(0);
  });
});

describe('demo story admin commands', () => {
  it('requires a category when the highlight appears in category pages', async () => {
    const g = new DemoGateway();
    await g.login(staff);
    await expect(
      g.adminCommand(highlight({ placements: ['category'], categories: [] })),
    ).rejects.toMatchObject({ code: 'CATEGORY_REQUIRED' });
  });

  it('saves the format and allows a highlight without places', async () => {
    const g = new DemoGateway(),
      stories = await withAdmin(g);
    await g.adminCommand(highlight({ format: 'carousel', placements: [] }));
    const created = (await stories()).find((h) => h.title === 'Novo destaque')!;
    expect(created).toMatchObject({ format: 'carousel', placements: [], categories: [] });
    await g.adminCommand(
      highlight({ id: created.id, format: 'stories', placements: ['home_bottom'] }),
    );
    expect((await stories()).find((h) => h.id === created.id)).toMatchObject({
      format: 'stories',
      placements: ['home_bottom'],
    });
  });

  it('saves the product page setting', async () => {
    const g = new DemoGateway();
    await g.login(staff);
    expect((await g.admin()).storySettings).toEqual({
      productPage: { enabled: true, position: 'right' },
    });
    await g.adminCommand({
      type: 'story.settings',
      productPage: { enabled: false, position: 'left' },
    });
    expect((await g.admin()).storySettings).toEqual({
      productPage: { enabled: false, position: 'left' },
    });
    await expect(
      g.adminCommand({
        type: 'story.settings',
        productPage: { enabled: true, position: 'top' },
      } as never),
    ).rejects.toBeTruthy();
  });

  it('validates the setting in the domain', () => {
    const state = createSeed();
    saveStorySettings(state, { productPage: { enabled: true, position: 'left' } });
    expect(state.storySettings).toEqual({ productPage: { enabled: true, position: 'left' } });
    expect(() => saveStorySettings(state, { productPage: { enabled: 'sim' } })).toThrow();
  });

  it('creates, edits, reorders and deletes highlights and videos', async () => {
    const g = new DemoGateway(),
      known = ['destaque-demo', 'carrossel-demo'],
      stories = await withAdmin(g);
    await g.adminCommand(highlight());
    const created = (await stories()).find((h) => !known.includes(h.id))!;
    expect(created).toMatchObject({ position: 2, coverUrl: 'asset:capa-1', videos: [] });
    await g.adminCommand(highlight({ id: created.id, title: 'Renomeado', active: false }));
    expect((await stories())[2]).toMatchObject({ title: 'Renomeado', active: false });

    await g.adminCommand({ type: 'story.reorder', ids: [created.id, ...known] });
    expect((await stories()).map((h) => [h.id, h.position])).toEqual([
      ['destaque-demo', 1],
      ['carrossel-demo', 2],
      [created.id, 0],
    ]);
    await expect(
      g.adminCommand({ type: 'story.reorder', ids: ['destaque-demo'] }),
    ).rejects.toMatchObject({ code: 'INVALID_ORDER' });

    const [first] = createSeed().products;
    await g.adminCommand(video('destaque-demo', { assetId: 'arquivo-9', productIds: [first.id] }));
    const added = (await stories()).find((h) => h.id === 'destaque-demo')!.videos[2];
    expect(added).toMatchObject({
      assetId: 'arquivo-9',
      status: 'ready',
      position: 2,
      impressions: 0,
      views: 0,
      completes: 0,
      clicks: 0,
      carts: 0,
      orders: 0,
      revenueCents: 0,
    });
    await expect(
      g.adminCommand({
        type: 'story.video.reorder',
        highlightId: 'destaque-demo',
        ids: ['video-demo-1', 'video-demo-1', added.id],
      }),
    ).rejects.toMatchObject({ code: 'INVALID_ORDER' });
    await g.adminCommand({
      type: 'story.video.reorder',
      highlightId: 'destaque-demo',
      ids: [added.id, 'video-demo-1', 'video-demo-2'],
    });
    const feed = publicStoriesFeed(await g.admin());
    expect(feed.collections.find((c) => c.id === 'destaque-demo')!.videos[0]).toMatchObject({
      id: added.id,
      source: { type: 'file', src: 'asset:arquivo-9' },
    });
    // The newest video leads the product page.
    expect(feed.productPage.byProduct[first.id][0]).toBe(added.id);
    await g.adminCommand({ type: 'story.video.delete', id: added.id });
    await expect(
      g.adminCommand({ type: 'story.video.delete', id: added.id }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await g.adminCommand({ type: 'story.delete', id: created.id });
    expect(await stories()).toHaveLength(2);
  });

  it('validates video products, limits and moves', async () => {
    const g = new DemoGateway(),
      stories = await withAdmin(g);
    await expect(
      g.adminCommand(video('destaque-demo', { productIds: ['nao-existe'] })),
    ).rejects.toMatchObject({ code: 'INVALID_PRODUCT' });
    await expect(g.adminCommand(video('nao-existe'))).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await g.adminCommand(highlight());
    const other = (await stories()).find((h) => h.title === 'Novo destaque')!;
    await expect(g.adminCommand(video(other.id, { id: 'video-demo-1' }))).rejects.toMatchObject({
      code: 'STORY_MOVE_NOT_ALLOWED',
    });
    for (let i = 0; i < 20; i += 1) await g.adminCommand(video(other.id));
    await expect(g.adminCommand(video(other.id))).rejects.toMatchObject({
      code: 'TOO_MANY_VIDEOS',
    });
    for (let i = 0; i < 27; i += 1) await g.adminCommand(highlight());
    await expect(g.adminCommand(highlight())).rejects.toMatchObject({
      code: 'TOO_MANY_HIGHLIGHTS',
    });
  });

  it('refuses story commands without a staff session', async () => {
    const g = new DemoGateway();
    await expect(
      g.adminCommand({ type: 'story.delete', id: 'destaque-demo' }),
    ).rejects.toBeTruthy();
    await expect(
      g.adminCommand({
        type: 'story.settings',
        productPage: { enabled: false, position: 'right' },
      }),
    ).rejects.toBeTruthy();
  });
});

describe('demo stories storage', () => {
  it('seeds states saved before stories existed but respects a saved empty list', () => {
    localStorage.clear();
    const state = new BrowserDemoStorage().load();
    const legacy = { ...state } as Partial<typeof state>;
    delete legacy.stories;
    localStorage.setItem('meo-commerce-v2', JSON.stringify(legacy));
    expect(new BrowserDemoStorage().load().stories[0]?.id).toBe('destaque-demo');
    localStorage.setItem('meo-commerce-v2', JSON.stringify({ ...state, stories: [] }));
    expect(new BrowserDemoStorage().load().stories).toEqual([]);
  });

  it('brings legacy stored stories and settings up to date', () => {
    localStorage.clear();
    const state = new BrowserDemoStorage().load(),
      legacy = { ...state } as Partial<typeof state>;
    delete legacy.storySettings;
    const legacyVideo = {
      id: 'v-old',
      assetId: '/assets/stories/oficina-1.mp4',
      caption: 'Antigo',
      productIds: [],
      active: true,
      position: 0,
      status: 'ready',
      views: 3,
      clicks: 1,
    };
    localStorage.setItem(
      'meo-commerce-v2',
      JSON.stringify({
        ...legacy,
        stories: [
          {
            id: 'h-old',
            title: 'Antigo',
            coverAssetId: 'c',
            active: true,
            position: 0,
            placements: ['home', 'product', 'category'],
            categories: ['Presentes'],
            videos: [legacyVideo],
          },
        ],
      }),
    );
    const loaded = new BrowserDemoStorage().load();
    expect(loaded.storySettings).toEqual({ productPage: { enabled: true, position: 'right' } });
    expect(loaded.stories[0]).toMatchObject({
      format: 'stories',
      placements: ['home_top', 'category'],
    });
    expect(loaded.stories[0].videos[0]).toMatchObject({
      views: 3,
      clicks: 1,
      impressions: 0,
      completes: 0,
      carts: 0,
      orders: 0,
      revenueCents: 0,
    });
    expect(() => publicStoriesFeed(loaded)).not.toThrow();
  });

  it('maps a legacy carousel home place to the middle of the home', () => {
    const seed = createSeed(),
      storage = new MemoryDemoStorage({
        ...seed,
        stories: [{ ...seed.stories[1], placements: ['home'] as never }],
      });
    expect(storage.load().stories[0].placements).toEqual(['home_middle']);
  });

  it('keeps the product page setting saved by the admin', async () => {
    const storage = new MemoryDemoStorage(),
      g = new DemoGateway(storage);
    await g.login(staff);
    await g.adminCommand({
      type: 'story.settings',
      productPage: { enabled: true, position: 'left' },
    });
    expect(stateOf(storage).storySettings?.productPage.position).toBe('left');
  });
});

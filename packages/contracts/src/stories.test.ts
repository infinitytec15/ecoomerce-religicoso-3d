import { describe, expect, it } from 'vitest';
import {
  EMPTY_STORIES_FEED,
  STORY_LIMITS,
  clickRate,
  normalizePlacements,
  productPageFeed,
  productVideos,
  storiesFeedSchema,
  storiesFor,
  storyEventBatchSchema,
  storyHighlightInputSchema,
  storySettingsSchema,
  storySourceSchema,
  storyVideoInputSchema,
  type StoriesFeed,
  type StoryHighlightPublic,
} from './stories';

const uuid = '11111111-1111-4111-8111-111111111111';
const hl = { title: 'Novidades', coverAssetId: uuid, active: true, placements: ['home_top'] };

describe('story input schemas', () => {
  it('rejects a 41-character title', () => {
    expect(storyHighlightInputSchema.safeParse({ ...hl, title: 'a'.repeat(41) }).success).toBe(
      false,
    );
  });
  it('accepts no placement: the videos still feed the product page', () => {
    expect(storyHighlightInputSchema.safeParse({ ...hl, placements: [] }).success).toBe(true);
  });
  it('defaults categories to [] and the format to stories', () => {
    expect(storyHighlightInputSchema.parse(hl)).toMatchObject({
      categories: [],
      format: 'stories',
    });
    expect(storyHighlightInputSchema.parse({ ...hl, format: 'carousel' }).format).toBe('carousel');
    expect(storyHighlightInputSchema.safeParse({ ...hl, format: 'reels' }).success).toBe(false);
  });
  it('rejects repeated or unknown placements', () => {
    expect(
      storyHighlightInputSchema.safeParse({ ...hl, placements: ['home_top', 'home_top'] }).success,
    ).toBe(false);
    expect(storyHighlightInputSchema.safeParse({ ...hl, placements: ['home'] }).success).toBe(
      false,
    );
  });
  it('accepts the store product ids, which are slugs like "palavra-fe", not uuids', () => {
    const base = { highlightId: uuid, assetId: uuid, active: true };
    expect(
      storyVideoInputSchema.safeParse({ ...base, productIds: ['palavra-fe', 'peca-e9a589cc'] })
        .success,
    ).toBe(true);
    expect(storyVideoInputSchema.safeParse({ ...base, productIds: ['', 'x'] }).success).toBe(false);
    expect(storyVideoInputSchema.safeParse({ ...base, productIds: ['../admin'] }).success).toBe(
      false,
    );
  });
  it('rejects more than 3 products on a video', () => {
    const base = { highlightId: uuid, assetId: uuid, active: true };
    const ids = [1, 2, 3, 4].map((n) => `${n}1111111-1111-4111-8111-111111111111`);
    expect(storyVideoInputSchema.safeParse({ ...base, productIds: ids }).success).toBe(false);
    expect(storyVideoInputSchema.safeParse({ ...base, productIds: ids.slice(0, 3) }).success).toBe(
      true,
    );
    expect(storyVideoInputSchema.parse(base)).toMatchObject({ caption: '', productIds: [] });
  });
});

describe('normalizePlacements', () => {
  it('maps the old home place by format and drops the old product place', () => {
    expect(normalizePlacements(['home', 'product'], 'stories')).toEqual(['home_top']);
    expect(normalizePlacements(['home', 'category'], 'carousel')).toEqual([
      'home_middle',
      'category',
    ]);
    expect(normalizePlacements(['product'], 'stories')).toEqual([]);
  });
  it('keeps current values once, in the canonical order, and ignores unknown ones', () => {
    expect(normalizePlacements(['category', 'home_bottom', 'x', 'home_bottom'], 'stories')).toEqual(
      ['home_bottom', 'category'],
    );
  });
});

describe('storySourceSchema', () => {
  it('rejects unsafe sources', () => {
    expect(storySourceSchema.safeParse({ type: 'file', src: 'javascript:alert(1)' }).success).toBe(
      false,
    );
    expect(storySourceSchema.safeParse({ type: 'hls', src: 'http://x/p.m3u8' }).success).toBe(
      false,
    );
  });
  it('accepts valid sources', () => {
    expect(storySourceSchema.safeParse({ type: 'hls', src: 'https://cdn.x/p.m3u8' }).success).toBe(
      true,
    );
    expect(storySourceSchema.safeParse({ type: 'file', src: '/demo/a.mp4' }).success).toBe(true);
  });
});

const video = (id: string, productIds: string[]) => ({
  id,
  caption: '',
  source: { type: 'file' as const, src: '/a.mp4' },
  products: productIds.map((p) => ({ id: p, name: p, priceCents: 100, image: '/i.png' })),
});
const highlight = (
  id: string,
  placements: StoryHighlightPublic['placements'],
  categories: StoryHighlightPublic['categories'],
  videos: StoryHighlightPublic['videos'],
  format: StoryHighlightPublic['format'] = 'stories',
): StoryHighlightPublic => ({
  id,
  title: id,
  coverUrl: '/c.png',
  format,
  placements,
  categories,
  videos,
});

describe('storiesFor', () => {
  const A = highlight('A', ['home_top'], [], [video('a1', [])]);
  const B = highlight('B', ['category'], ['Presentes'], [video('b1', [])]);
  const C = highlight('C', ['home_middle', 'home_top'], [], [video('c1', [])], 'carousel');
  const all = [A, B, C];
  it('filters by home slot, keeping the received order', () => {
    expect(storiesFor(all, { place: 'home_top' })).toEqual([A, C]);
    expect(storiesFor(all, { place: 'home_middle' })).toEqual([C]);
    expect(storiesFor(all, { place: 'home_bottom' })).toEqual([]);
  });
  it('filters by category', () => {
    expect(storiesFor(all, { place: 'category', category: 'Presentes' })).toEqual([B]);
    expect(storiesFor(all, { place: 'category', category: 'Católicos' })).toEqual([]);
  });
});

describe('productVideos', () => {
  const feed: StoriesFeed = {
    collections: [],
    productPage: {
      enabled: true,
      position: 'right',
      videos: [video('v1', ['p1']), video('v2', ['p1', 'p2']), video('v3', ['p2'])],
      byProduct: { p1: ['v2', 'v1'], p2: ['v3', 'v2', 'gone'] },
    },
  };
  it('returns the product videos in the feed order, skipping ids it does not have', () => {
    expect(productVideos(feed, 'p1').map((v) => v.id)).toEqual(['v2', 'v1']);
    expect(productVideos(feed, 'p2').map((v) => v.id)).toEqual(['v3', 'v2']);
    expect(productVideos(feed, 'p9')).toEqual([]);
  });
  it('returns nothing when the store turned the product page videos off', () => {
    expect(
      productVideos({ ...feed, productPage: { ...feed.productPage, enabled: false } }, 'p1'),
    ).toEqual([]);
  });
  it('caps the videos of one product', () => {
    const many = Array.from({ length: 12 }, (_, i) => video('m' + i, ['p1']));
    const big: StoriesFeed = {
      collections: [],
      productPage: {
        enabled: true,
        position: 'left',
        videos: many,
        byProduct: { p1: many.map((v) => v.id) },
      },
    };
    expect(productVideos(big, 'p1')).toHaveLength(STORY_LIMITS.videosPerProduct);
  });
  it('narrows the feed to one product, so the product page ships only its own videos', () => {
    const withCollection: StoriesFeed = {
      ...feed,
      collections: [highlight('A', ['home_top'], [], [video('a1', [])])],
    };
    const narrow = productPageFeed(withCollection, 'p2');
    expect(narrow.collections).toEqual([]);
    expect(narrow.productPage.videos.map((v) => v.id)).toEqual(['v3', 'v2']);
    expect(narrow.productPage.byProduct).toEqual({ p2: ['v3', 'v2'] });
    expect(productVideos(narrow, 'p2')).toEqual(productVideos(feed, 'p2'));
    expect(productPageFeed(withCollection, 'p9').productPage).toMatchObject({
      enabled: true,
      videos: [],
      byProduct: {},
    });
  });
});

describe('storiesFeedSchema', () => {
  it('parses the empty feed and rejects a collection without videos', () => {
    expect(storiesFeedSchema.parse(EMPTY_STORIES_FEED)).toEqual(EMPTY_STORIES_FEED);
    expect(
      storiesFeedSchema.safeParse({
        ...EMPTY_STORIES_FEED,
        collections: [{ ...highlight('A', ['home_top'], [], []) }],
      }).success,
    ).toBe(false);
  });
});

describe('storyEventBatchSchema', () => {
  it('accepts the five event types in batches of up to 50', () => {
    const types = ['impression', 'play', 'complete', 'product_click', 'add_to_cart'];
    expect(
      storyEventBatchSchema.safeParse({ events: types.map((type) => ({ videoId: 'v1', type })) })
        .success,
    ).toBe(true);
    expect(
      storyEventBatchSchema.safeParse({
        events: Array.from({ length: 51 }, () => ({ videoId: 'v1', type: 'play' })),
      }).success,
    ).toBe(false);
    expect(
      storyEventBatchSchema.safeParse({ events: [{ videoId: 'v1', type: 'view' }] }).success,
    ).toBe(false);
  });
});

describe('storySettingsSchema', () => {
  it('defaults to the product page videos on the right', () => {
    expect(storySettingsSchema.parse({})).toEqual({
      productPage: { enabled: true, position: 'right' },
    });
  });
});

describe('clickRate', () => {
  it('formats pt-BR percentages', () => {
    expect(clickRate(8, 1)).toBe('12,5%');
    expect(clickRate(3, 0)).toBe('0,0%');
    expect(clickRate(0, 0)).toBe('—');
  });
});

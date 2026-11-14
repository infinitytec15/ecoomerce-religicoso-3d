import { describe, expect, it } from 'vitest';
import {
  clickRate,
  storiesFor,
  storyHighlightInputSchema,
  storySourceSchema,
  storyVideoInputSchema,
  type StoryHighlightPublic,
} from './stories';

const uuid = '11111111-1111-4111-8111-111111111111';
const hl = { title: 'Novidades', coverAssetId: uuid, active: true, placements: ['home'] };

describe('story input schemas', () => {
  it('rejects a 41-character title and empty placements', () => {
    expect(storyHighlightInputSchema.safeParse({ ...hl, title: 'a'.repeat(41) }).success).toBe(false);
    expect(storyHighlightInputSchema.safeParse({ ...hl, placements: [] }).success).toBe(false);
  });
  it('defaults missing categories to []', () => {
    expect(storyHighlightInputSchema.parse(hl).categories).toEqual([]);
  });
  it('rejects repeated placements', () => {
    expect(storyHighlightInputSchema.safeParse({ ...hl, placements: ['home', 'home'] }).success).toBe(
      false,
    );
  });
  it('rejects more than 3 products on a video', () => {
    const base = { highlightId: uuid, assetId: uuid, active: true };
    const ids = [1, 2, 3, 4].map((n) => `${n}1111111-1111-4111-8111-111111111111`);
    expect(storyVideoInputSchema.safeParse({ ...base, productIds: ids }).success).toBe(false);
    expect(storyVideoInputSchema.safeParse({ ...base, productIds: ids.slice(0, 3) }).success).toBe(true);
    expect(storyVideoInputSchema.parse(base)).toMatchObject({ caption: '', productIds: [] });
  });
});

describe('storySourceSchema', () => {
  it('rejects unsafe sources', () => {
    expect(storySourceSchema.safeParse({ type: 'file', src: 'javascript:alert(1)' }).success).toBe(false);
    expect(storySourceSchema.safeParse({ type: 'hls', src: 'http://x/p.m3u8' }).success).toBe(false);
  });
  it('accepts valid sources', () => {
    expect(storySourceSchema.safeParse({ type: 'hls', src: 'https://cdn.x/p.m3u8' }).success).toBe(true);
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
): StoryHighlightPublic => ({ id, title: id, coverUrl: '/c.png', placements, categories, videos });

describe('storiesFor', () => {
  const A = highlight('A', ['home'], [], [video('a1', [])]);
  const B = highlight('B', ['category'], ['Presentes'], [video('b1', [])]);
  const C = highlight('C', ['product'], [], [video('v1', ['p1']), video('v2', ['p2'])]);
  const all = [A, B, C];
  it('filters by home', () => {
    expect(storiesFor(all, { place: 'home' })).toEqual([A]);
  });
  it('filters by category', () => {
    expect(storiesFor(all, { place: 'category', category: 'Presentes' })).toEqual([B]);
    expect(storiesFor(all, { place: 'category', category: 'Católicos' })).toEqual([]);
  });
  it('filters by product and drops empty highlights', () => {
    const r = storiesFor(all, { place: 'product', productId: 'p1' });
    expect(r).toHaveLength(1);
    expect(r[0].id).toBe('C');
    expect(r[0].videos.map((v) => v.id)).toEqual(['v1']);
    expect(storiesFor(all, { place: 'product', productId: 'p9' })).toEqual([]);
  });
});

describe('clickRate', () => {
  it('formats pt-BR percentages', () => {
    expect(clickRate(8, 1)).toBe('12,5%');
    expect(clickRate(3, 0)).toBe('0,0%');
    expect(clickRate(0, 0)).toBe('—');
  });
});

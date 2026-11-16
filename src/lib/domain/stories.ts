import { z } from 'zod';
import {
  DEFAULT_STORY_SETTINGS,
  STORY_FORMATS,
  STORY_LIMITS,
  normalizePlacements,
  storyHighlightInputSchema,
  storyHighlightPublicSchema,
  storySettingsSchema,
  storyVideoInputSchema,
  type AdminStoryHighlight,
  type AdminStoryVideo,
  type StoriesFeed,
  type StoryEvent,
  type StoryEventType,
  type StoryFormat,
  type StoryHighlightPublic,
  type StorySettings,
  type StoryVideoPublic,
} from '@maos-em-oracao/contracts';
import { ApiError, requireValue } from '@/lib/api/contracts';
import type { InventoryProduct, Operations, Order, OrderStatus } from './types';

/**
 * Demo rules of the stories (video commerce); they mirror the backend service.
 * Demo ids are not UUIDs, so the schemas are relaxed to plain non-empty ids.
 * A bundled file keeps its path ("/assets/...") as the asset id; an uploaded one is "asset:<id>".
 */
const looseId = z.string().min(1).max(64);
const highlightInput = storyHighlightInputSchema.extend({
  id: looseId.optional(),
  coverAssetId: z.string().min(1).max(500),
});
const videoInput = storyVideoInputSchema.extend({
  id: looseId.optional(),
  highlightId: looseId,
  assetId: z.string().min(1).max(500),
  productIds: z.array(looseId).max(STORY_LIMITS.productsPerVideo).default([]),
});

/** A demo video also keeps when it was created, so the product page can show the newest first. */
export type DemoStoryVideo = AdminStoryVideo & { createdAt?: string };

export const assetSrc = (assetId: string) =>
  assetId.startsWith('/') ? assetId : 'asset:' + assetId;

const byPosition = <T extends { position: number }>(list: T[]) =>
  [...list].sort((a, b) => a.position - b.position);

type StoryProducts = Pick<InventoryProduct, 'id' | 'name' | 'priceCents' | 'image'>;

/**
 * Products a video can sell: active, not archived and, under the 'stock' policy, in stock (made
 * to order sells at stock 0, as checkout does).
 */
function sellableProducts(
  products: InventoryProduct[],
  policy: 'on-demand' | 'stock' = 'on-demand',
): Map<string, StoryProducts> {
  return new Map(
    products
      .filter((p) => p.active && !p.archived && (policy !== 'stock' || p.stock > 0))
      .map((p) => [p.id, p]),
  );
}

/** The public video, or null when it is off, not ready or has nothing to sell. */
function publicVideo(
  v: AdminStoryVideo,
  sellable: Map<string, StoryProducts>,
): StoryVideoPublic | null {
  if (!v.active || v.status !== 'ready') return null;
  const products = v.productIds
    .flatMap((id) => {
      const p = sellable.get(id);
      return p ? [{ id: p.id, name: p.name, priceCents: p.priceCents, image: p.image }] : [];
    })
    .slice(0, STORY_LIMITS.productsPerVideo);
  if (!products.length) return null;
  return {
    id: v.id,
    caption: v.caption,
    source: { type: 'file', src: assetSrc(v.assetId) },
    products,
  };
}

const formatOf = (h: { format?: unknown }): StoryFormat =>
  STORY_FORMATS.includes(h.format as StoryFormat) ? (h.format as StoryFormat) : 'stories';

function publicCollection(
  h: AdminStoryHighlight,
  sellable: Map<string, StoryProducts>,
): StoryHighlightPublic[] {
  const format = formatOf(h),
    placements = normalizePlacements(h.placements, format),
    coverUrl = h.coverUrl ?? (h.coverAssetId ? assetSrc(h.coverAssetId) : '');
  if (!h.active || !placements.length || !coverUrl) return [];
  const videos = byPosition(h.videos).flatMap((v) => {
    const pv = publicVideo(v, sellable);
    return pv ? [pv] : [];
  });
  if (!videos.length) return [];
  return [
    storyHighlightPublicSchema.parse({
      id: h.id,
      title: h.title,
      coverUrl,
      format,
      placements,
      categories: h.categories,
      videos,
    }),
  ];
}

/**
 * Every video in creation order, newest first. Demo videos carry `createdAt`; without it (or on a
 * tie) the later one in the stored lists counts as newer.
 */
function newestFirst(stories: AdminStoryHighlight[]): DemoStoryVideo[] {
  return stories
    .flatMap((h) => h.videos as DemoStoryVideo[])
    .map((video, sequence) => ({ video, sequence }))
    .sort(
      (a, b) =>
        (b.video.createdAt ?? '').localeCompare(a.video.createdAt ?? '') || b.sequence - a.sequence,
    )
    .map(({ video }) => video);
}

function productPageFeed(
  stories: AdminStoryHighlight[],
  sellable: Map<string, StoryProducts>,
  settings: StorySettings,
): StoriesFeed['productPage'] {
  const { enabled, position } = settings.productPage;
  if (!enabled) return { enabled: false, position, videos: [], byProduct: {} };
  const seen = new Set<string>(),
    videos: StoryVideoPublic[] = [];
  for (const v of newestFirst(stories)) {
    if (videos.length >= STORY_LIMITS.productVideos) break;
    const pv = seen.has(v.id) ? null : publicVideo(v, sellable);
    if (!pv) continue;
    seen.add(v.id);
    videos.push(pv);
  }
  const byProduct: Record<string, string[]> = {};
  for (const v of videos)
    for (const p of v.products) {
      const list = (byProduct[p.id] ??= []);
      if (list.length < STORY_LIMITS.videosPerProduct) list.push(v.id);
    }
  return { enabled: true, position, videos, byProduct };
}

/**
 * What the storefront sees. Collections: active highlights with a place and a cover, each with its
 * active ready videos that sell at least one product. Product page: every such video of any
 * highlight (active or not), newest first, indexed by product.
 */
export function publicStoriesFeed(
  state: Pick<Operations, 'stories' | 'products' | 'storySettings'> &
    Partial<Pick<Operations, 'workspace'>>,
): StoriesFeed {
  const sellable = sellableProducts(state.products, state.workspace?.inventoryPolicy),
    settings = state.storySettings ?? DEFAULT_STORY_SETTINGS;
  return {
    collections: byPosition(state.stories).flatMap((h) => publicCollection(h, sellable)),
    productPage: productPageFeed(state.stories, sellable, settings),
  };
}

const findHighlight = (state: Operations, id: string) =>
  requireValue(
    state.stories.find((h) => h.id === id),
    'Destaque não encontrado.',
  );

/** The ids must be exactly the current ones, in any order. */
function reorder<T extends { id: string; position: number }>(list: T[], ids: string[]) {
  if (
    ids.length !== list.length ||
    new Set(ids).size !== ids.length ||
    !ids.every((id) => list.some((x) => x.id === id))
  )
    throw new ApiError('INVALID_ORDER', 'A ordem enviada não corresponde à lista atual.', 422);
  ids.forEach((id, position) => {
    requireValue(list.find((x) => x.id === id)).position = position;
  });
}

/** Saves a highlight. No place is allowed: it is drawn nowhere, its videos still feed the product page. */
export function saveStoryHighlight(state: Operations, raw: unknown) {
  const input = highlightInput.parse(raw);
  if (input.placements.includes('category') && !input.categories.length)
    throw new ApiError('CATEGORY_REQUIRED', 'Escolha ao menos uma categoria.', 422);
  const patch = {
    title: input.title,
    coverAssetId: input.coverAssetId,
    coverUrl: assetSrc(input.coverAssetId),
    active: input.active,
    format: input.format,
    placements: input.placements,
    categories: input.categories,
  };
  if (input.id) {
    Object.assign(findHighlight(state, input.id), patch);
    return;
  }
  if (state.stories.length >= STORY_LIMITS.highlights)
    throw new ApiError('TOO_MANY_HIGHLIGHTS', 'Limite de destaques atingido.', 422);
  state.stories.push({
    ...patch,
    id: crypto.randomUUID(),
    position: Math.max(-1, ...state.stories.map((h) => h.position)) + 1,
    videos: [],
  });
}

export const reorderStoryHighlights = (state: Operations, ids: string[]) =>
  reorder(state.stories, ids);

export function deleteStoryHighlight(state: Operations, id: string) {
  findHighlight(state, id);
  state.stories = state.stories.filter((h) => h.id !== id);
}

function findVideo(state: Operations, id: string) {
  for (const highlight of state.stories) {
    const video = highlight.videos.find((v) => v.id === id);
    if (video) return { highlight, video };
  }
  throw new ApiError('NOT_FOUND', 'Vídeo não encontrado.', 404);
}

/** Usage and sales counters of a new or legacy video. */
const EMPTY_COUNTERS = {
  impressions: 0,
  views: 0,
  completes: 0,
  clicks: 0,
  carts: 0,
  orders: 0,
  revenueCents: 0,
} as const;

export function saveStoryVideo(state: Operations, raw: unknown) {
  const input = videoInput.parse(raw);
  const highlight = findHighlight(state, input.highlightId);
  if (
    input.productIds.some(
      (id) => !state.products.some((p) => p.id === id && p.active && !p.archived),
    )
  )
    throw new ApiError('INVALID_PRODUCT', 'Escolha produtos ativos e não arquivados.', 422);
  const patch = {
    assetId: input.assetId,
    caption: input.caption,
    productIds: input.productIds,
    active: input.active,
  };
  if (input.id) {
    const found = findVideo(state, input.id);
    if (found.highlight.id !== highlight.id)
      throw new ApiError(
        'STORY_MOVE_NOT_ALLOWED',
        'Não é possível mover o vídeo para outro destaque.',
        422,
      );
    Object.assign(found.video, patch);
    return;
  }
  if (highlight.videos.length >= STORY_LIMITS.videosPerHighlight)
    throw new ApiError('TOO_MANY_VIDEOS', 'Limite de vídeos do destaque atingido.', 422);
  const video: DemoStoryVideo = {
    ...patch,
    ...EMPTY_COUNTERS,
    id: crypto.randomUUID(),
    position: Math.max(-1, ...highlight.videos.map((v) => v.position)) + 1,
    status: 'ready',
    createdAt: new Date().toISOString(),
  };
  highlight.videos.push(video);
}

export const reorderStoryVideos = (state: Operations, highlightId: string, ids: string[]) =>
  reorder(findHighlight(state, highlightId).videos, ids);

export function deleteStoryVideo(state: Operations, id: string) {
  const { highlight } = findVideo(state, id);
  highlight.videos = highlight.videos.filter((v) => v.id !== id);
}

/** Saves the product page bubble setting (`story.settings`). */
export function saveStorySettings(state: Operations, raw: unknown) {
  state.storySettings = storySettingsSchema.parse(raw);
}

/** Video counter each event type increments. */
const EVENT_COUNTER: Record<StoryEventType, keyof typeof EMPTY_COUNTERS> = {
  impression: 'impressions',
  play: 'views',
  complete: 'completes',
  product_click: 'clicks',
  add_to_cart: 'carts',
};

/**
 * Counts a batch of usage events and returns the new state. Unknown or inactive videos and unknown
 * types are a silent no-op, like the API. The highlight may be inactive: its videos still play on
 * the product page.
 */
export function recordStoryEvents(state: Operations, events: StoryEvent[]): Operations {
  const increments = new Map<string, Partial<Record<keyof typeof EMPTY_COUNTERS, number>>>();
  for (const event of events) {
    const counter = Object.prototype.hasOwnProperty.call(EVENT_COUNTER, event.type)
      ? EVENT_COUNTER[event.type]
      : null;
    if (!counter) continue;
    const current = increments.get(event.videoId) ?? {};
    increments.set(event.videoId, { ...current, [counter]: (current[counter] ?? 0) + 1 });
  }
  if (!increments.size) return state;
  return {
    ...state,
    stories: state.stories.map((h) =>
      h.videos.some((v) => v.active && increments.has(v.id))
        ? {
            ...h,
            videos: h.videos.map((v) => {
              const add = v.active ? increments.get(v.id) : undefined;
              if (!add) return v;
              const next = { ...v };
              for (const [key, n] of Object.entries(add) as [keyof typeof EMPTY_COUNTERS, number][])
                next[key] = (v[key] ?? 0) + n;
              return next;
            }),
          }
        : h,
    ),
  };
}

/** Orders that never got paid (or are waiting for it) do not count as story sales. */
const UNPAID: readonly OrderStatus[] = ['Aguardando pagamento', 'Cancelado', 'Aguardando grupo'];

/** Paid orders and revenue per story video, from order items that carry `videoId`. */
export function storyVideoSales(
  orders: Order[],
): Map<string, { orders: number; revenueCents: number }> {
  const sales = new Map<string, { orders: number; revenueCents: number }>();
  for (const order of orders) {
    if (UNPAID.includes(order.status)) continue;
    const revenue = new Map<string, number>();
    for (const item of order.items)
      if (item.videoId)
        revenue.set(
          item.videoId,
          (revenue.get(item.videoId) ?? 0) + item.unitCents * item.quantity,
        );
    for (const [videoId, cents] of revenue) {
      const current = sales.get(videoId) ?? { orders: 0, revenueCents: 0 };
      sales.set(videoId, {
        orders: current.orders + 1,
        revenueCents: current.revenueCents + cents,
      });
    }
  }
  return sales;
}

/**
 * The state with each video's `orders`/`revenueCents` derived from the demo orders. The demo storage
 * applies it on every load, so the admin snapshot always shows current sales.
 */
export function withStorySales(state: Operations): Operations {
  const sales = storyVideoSales(state.orders);
  return {
    ...state,
    stories: state.stories.map((h) => ({
      ...h,
      videos: h.videos.map((v) => {
        const sold = sales.get(v.id) ?? { orders: 0, revenueCents: 0 };
        return { ...v, orders: sold.orders, revenueCents: sold.revenueCents };
      }),
    })),
  };
}

/** A stored highlight from before formats, home slots and the new counters, brought up to date. */
function normalizeHighlight(raw: AdminStoryHighlight): AdminStoryHighlight {
  const format = formatOf(raw);
  return {
    ...raw,
    format,
    placements: normalizePlacements(Array.isArray(raw.placements) ? raw.placements : [], format),
    categories: Array.isArray(raw.categories) ? raw.categories : [],
    videos: (Array.isArray(raw.videos) ? raw.videos : []).map((v) => ({
      ...v,
      impressions: v.impressions ?? 0,
      views: v.views ?? 0,
      completes: v.completes ?? 0,
      clicks: v.clicks ?? 0,
      carts: v.carts ?? 0,
      orders: v.orders ?? 0,
      revenueCents: v.revenueCents ?? 0,
    })),
  };
}

/** Legacy stored stories normalized and the product page setting defaulted. */
export function normalizeStoryState(state: Operations): Operations {
  const settings = storySettingsSchema.safeParse(state.storySettings ?? DEFAULT_STORY_SETTINGS);
  return {
    ...state,
    stories: (state.stories ?? []).map(normalizeHighlight),
    storySettings: settings.success ? settings.data : DEFAULT_STORY_SETTINGS,
  };
}

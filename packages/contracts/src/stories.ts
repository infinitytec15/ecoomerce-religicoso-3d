import { z } from 'zod';
import { collectionSchema } from './schemas';

/**
 * Stories (video commerce): collections of short product videos, shown as story bubbles or a video
 * carousel in four places of the home and on category pages, plus a floating bubble on the product
 * page with the videos of that product.
 */
export const STORY_FORMATS = ['stories', 'carousel'] as const;
export type StoryFormat = (typeof STORY_FORMATS)[number];
export const storyFormatLabels: Record<StoryFormat, string> = {
  stories: 'Stories (bolinhas)',
  carousel: 'Carrossel de vídeos',
};
export const HOME_SLOTS = ['home_top', 'home_below_banner', 'home_middle', 'home_bottom'] as const;
export type HomeSlot = (typeof HOME_SLOTS)[number];
export const STORY_PLACEMENTS = [...HOME_SLOTS, 'category'] as const;
export type StoryPlacement = (typeof STORY_PLACEMENTS)[number];
export const storyPlacementLabels: Record<StoryPlacement, string> = {
  home_top: 'Início · topo',
  home_below_banner: 'Início · abaixo do banner',
  home_middle: 'Início · meio',
  home_bottom: 'Início · final',
  category: 'Categoria',
};
export const STORY_LIMITS = {
  highlights: 30,
  videosPerHighlight: 20,
  productsPerVideo: 3,
  title: 40,
  caption: 140,
  cover: 320,
  /** Videos the product page bubble can draw from, newest first. */
  productVideos: 300,
  videosPerProduct: 10,
  eventsPerBatch: 50,
} as const;

/**
 * Current placements of a stored highlight. Before the four home slots there was one `home` place
 * (stories go to the top, a carousel to the middle) and a `product` place, now a store setting.
 */
export function normalizePlacements(
  values: readonly string[],
  format: StoryFormat,
): StoryPlacement[] {
  const wanted = new Set(
    values.map((v) => (v === 'home' ? (format === 'carousel' ? 'home_middle' : 'home_top') : v)),
  );
  return STORY_PLACEMENTS.filter((p) => wanted.has(p));
}

const placementSchema = z.enum(STORY_PLACEMENTS);
const storyId = z.string().min(1).max(64);
const httpsUrl = z
  .string()
  .url()
  .refine((v) => v.startsWith('https://'), 'URL https obrigatória');
const unique = (values: string[]) => new Set(values).size === values.length;

export const storyHighlightInputSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().trim().min(1).max(STORY_LIMITS.title),
  coverAssetId: z.string().uuid(),
  active: z.boolean(),
  format: z.enum(STORY_FORMATS).default('stories'),
  /** Empty: the collection is not drawn anywhere, its videos still feed the product page. */
  placements: z
    .array(placementSchema)
    .max(STORY_PLACEMENTS.length)
    .refine(unique, 'Lugares repetidos'),
  categories: z.array(collectionSchema).max(5).refine(unique, 'Categorias repetidas').default([]),
});
export type StoryHighlightInput = z.infer<typeof storyHighlightInputSchema>;

export const storyVideoInputSchema = z.object({
  id: z.string().uuid().optional(),
  highlightId: z.string().uuid(),
  assetId: z.string().uuid(),
  caption: z.string().trim().max(STORY_LIMITS.caption).default(''),
  productIds: z
    .array(z.string().uuid())
    .max(STORY_LIMITS.productsPerVideo)
    .refine(unique, 'Produtos repetidos')
    .default([]),
  active: z.boolean(),
});
export type StoryVideoInput = z.infer<typeof storyVideoInputSchema>;

export const PRODUCT_PAGE_POSITIONS = ['right', 'left'] as const;
export type ProductPagePosition = (typeof PRODUCT_PAGE_POSITIONS)[number];
/** Store setting (AppSetting `stories`): the floating video bubble of the product page. */
export const storySettingsSchema = z.object({
  productPage: z
    .object({
      enabled: z.boolean().default(true),
      position: z.enum(PRODUCT_PAGE_POSITIONS).default('right'),
    })
    .default({ enabled: true, position: 'right' }),
});
export type StorySettings = z.infer<typeof storySettingsSchema>;
export const DEFAULT_STORY_SETTINGS: StorySettings = {
  productPage: { enabled: true, position: 'right' },
};

export const storySourceSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('hls'), src: httpsUrl, poster: httpsUrl.optional() }),
  z.object({
    type: z.literal('file'),
    src: z
      .string()
      .max(500)
      .refine(
        (v) => v.startsWith('/') || v.startsWith('asset:') || v.startsWith('https://'),
        'Origem inválida',
      ),
  }),
]);
export type StorySource = z.infer<typeof storySourceSchema>;

export const storyProductSchema = z.object({
  id: storyId,
  name: z.string(),
  priceCents: z.number().int().min(0),
  image: z.string(),
});
export type StoryProduct = z.infer<typeof storyProductSchema>;

export const storyVideoPublicSchema = z.object({
  id: storyId,
  caption: z.string(),
  source: storySourceSchema,
  products: z.array(storyProductSchema).max(STORY_LIMITS.productsPerVideo),
});
export type StoryVideoPublic = z.infer<typeof storyVideoPublicSchema>;

export const storyHighlightPublicSchema = z.object({
  id: storyId,
  title: z.string(),
  coverUrl: z.string(),
  format: z.enum(STORY_FORMATS),
  placements: z.array(placementSchema),
  categories: z.array(collectionSchema),
  videos: z.array(storyVideoPublicSchema).min(1),
});
export type StoryHighlightPublic = z.infer<typeof storyHighlightPublicSchema>;

/**
 * Everything the storefront needs to draw the videos, read once and cached. Only active, ready
 * videos with at least one sellable product are in it; a collection left without videos is out.
 */
export const storiesFeedSchema = z.object({
  collections: z.array(storyHighlightPublicSchema),
  productPage: z.object({
    enabled: z.boolean(),
    position: z.enum(PRODUCT_PAGE_POSITIONS),
    /** Every video of the product page, once each. */
    videos: z.array(storyVideoPublicSchema).max(STORY_LIMITS.productVideos),
    /** Product id to its video ids, newest first. */
    byProduct: z.record(z.string(), z.array(storyId).max(STORY_LIMITS.videosPerProduct)),
  }),
});
export type StoriesFeed = z.infer<typeof storiesFeedSchema>;
export const EMPTY_STORIES_FEED: StoriesFeed = {
  collections: [],
  productPage: { enabled: false, position: 'right', videos: [], byProduct: {} },
};

/**
 * Usage events. A play is what counts as a watched video; an impression (the video showing on
 * screen) does not. add_to_cart is a product put in the bag from inside the player.
 */
export const STORY_EVENT_TYPES = [
  'impression',
  'play',
  'complete',
  'product_click',
  'add_to_cart',
] as const;
export type StoryEventType = (typeof STORY_EVENT_TYPES)[number];
export const storyEventSchema = z.object({
  videoId: storyId,
  type: z.enum(STORY_EVENT_TYPES),
});
export type StoryEvent = z.infer<typeof storyEventSchema>;
export const storyEventBatchSchema = z.object({
  events: z.array(storyEventSchema).min(1).max(STORY_LIMITS.eventsPerBatch),
});
export type StoryEventBatch = z.infer<typeof storyEventBatchSchema>;

export type StoryVideoStatus = 'processing' | 'ready' | 'failed';

/** Admin ids are loose strings (not uuid) so the demo snapshot also parses. */
export const adminStoryVideoSchema = z.object({
  id: storyId,
  assetId: storyId,
  caption: z.string(),
  productIds: z.array(storyId),
  active: z.boolean(),
  position: z.number().int(),
  status: z.enum(['processing', 'ready', 'failed']),
  thumbnailUrl: z.string().optional(),
  impressions: z.number().int().min(0).default(0),
  /** Plays: watched videos. */
  views: z.number().int().min(0),
  completes: z.number().int().min(0).default(0),
  /** Product clicks ("Ver peça"). */
  clicks: z.number().int().min(0),
  /** Products put in the bag from the player. */
  carts: z.number().int().min(0).default(0),
  /** Paid orders with an item bought from this video, and the revenue of those items. */
  orders: z.number().int().min(0).default(0),
  revenueCents: z.number().int().min(0).default(0),
});
export type AdminStoryVideo = z.infer<typeof adminStoryVideoSchema>;

export const adminStoryHighlightSchema = z.object({
  id: storyId,
  title: z.string(),
  coverAssetId: storyId,
  coverUrl: z.string().optional(),
  active: z.boolean(),
  position: z.number().int(),
  format: z.enum(STORY_FORMATS).default('stories'),
  placements: z.array(placementSchema),
  categories: z.array(collectionSchema),
  videos: z.array(adminStoryVideoSchema),
});
export type AdminStoryHighlight = z.infer<typeof adminStoryHighlightSchema>;

export type StoryWhere = { place: HomeSlot } | { place: 'category'; category: string };

/** Collections drawn in a place, keeping the received order. */
export function storiesFor(
  list: StoryHighlightPublic[],
  where: StoryWhere,
): StoryHighlightPublic[] {
  const placed = list.filter((h) => h.placements.includes(where.place));
  if (where.place !== 'category') return placed;
  const { category } = where;
  return placed.filter((h) => (h.categories as string[]).includes(category));
}

/** Videos of the product page bubble for one product; none when the store turned it off. */
export function productVideos(feed: StoriesFeed, productId: string): StoryVideoPublic[] {
  const { enabled, videos, byProduct } = feed.productPage;
  if (!enabled) return [];
  const byId = new Map(videos.map((v) => [v.id, v]));
  return (byProduct[productId] ?? [])
    .flatMap((id) => {
      const v = byId.get(id);
      return v ? [v] : [];
    })
    .slice(0, STORY_LIMITS.videosPerProduct);
}

/** The feed cut down to one product's page: its videos only, no collections. */
export function productPageFeed(feed: StoriesFeed, productId: string): StoriesFeed {
  const videos = productVideos(feed, productId);
  return {
    collections: [],
    productPage: {
      ...feed.productPage,
      videos,
      byProduct: videos.length ? { [productId]: videos.map((v) => v.id) } : {},
    },
  };
}

/** Click-through rate as pt-BR percentage with one decimal; '—' when there are no views. */
export function clickRate(views: number, clicks: number): string {
  if (views <= 0) return '—';
  const pct = ((clicks / views) * 100).toLocaleString('pt-BR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  return `${pct}%`;
}

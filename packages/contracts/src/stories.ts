import { z } from 'zod';
import { collectionSchema } from './schemas';

/** Stories (video commerce) contracts: highlight circles with short product videos. */
export const STORY_PLACEMENTS = ['home', 'product', 'category'] as const;
export type StoryPlacement = (typeof STORY_PLACEMENTS)[number];
export const storyPlacementLabels: Record<StoryPlacement, string> = {
  home: 'Página inicial',
  product: 'Página do produto',
  category: 'Categoria',
};
export const STORY_LIMITS = {
  highlights: 30,
  videosPerHighlight: 20,
  productsPerVideo: 3,
  title: 40,
  caption: 140,
  cover: 320,
} as const;

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
  placements: z
    .array(placementSchema)
    .min(1)
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
  placements: z.array(placementSchema),
  categories: z.array(collectionSchema),
  videos: z.array(storyVideoPublicSchema).min(1),
});
export type StoryHighlightPublic = z.infer<typeof storyHighlightPublicSchema>;

export const storyEventSchema = z.object({
  videoId: storyId,
  type: z.enum(['view', 'click']),
});
export type StoryEvent = z.infer<typeof storyEventSchema>;

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
  views: z.number().int().min(0),
  clicks: z.number().int().min(0),
});
export type AdminStoryVideo = z.infer<typeof adminStoryVideoSchema>;

export const adminStoryHighlightSchema = z.object({
  id: storyId,
  title: z.string(),
  coverAssetId: storyId,
  coverUrl: z.string().optional(),
  active: z.boolean(),
  position: z.number().int(),
  placements: z.array(placementSchema),
  categories: z.array(collectionSchema),
  videos: z.array(adminStoryVideoSchema),
});
export type AdminStoryHighlight = z.infer<typeof adminStoryHighlightSchema>;

export type StoryWhere =
  | { place: 'home' }
  | { place: 'category'; category: string }
  | { place: 'product'; productId: string };

/** Highlights shown in a place, keeping the received order. Product place keeps only that product's videos. */
export function storiesFor(
  list: StoryHighlightPublic[],
  where: StoryWhere,
): StoryHighlightPublic[] {
  const placed = list.filter((h) => h.placements.includes(where.place));
  if (where.place === 'home') return placed;
  if (where.place === 'category') {
    const { category } = where;
    return placed.filter((h) => (h.categories as string[]).includes(category));
  }
  const { productId } = where;
  return placed
    .map((h) => ({
      ...h,
      videos: h.videos.filter((v) => v.products.some((p) => p.id === productId)),
    }))
    .filter((h) => h.videos.length > 0);
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

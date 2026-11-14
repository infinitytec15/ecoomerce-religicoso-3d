import { z } from 'zod';
import {
  STORY_LIMITS,
  storyHighlightInputSchema,
  storyHighlightPublicSchema,
  storyVideoInputSchema,
  type AdminStoryVideo,
  type StoryHighlightPublic,
} from '@maos-em-oracao/contracts';
import { ApiError, requireValue } from '@/lib/api/contracts';
import type { Operations } from './types';

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

export const assetSrc = (assetId: string) =>
  assetId.startsWith('/') ? assetId : 'asset:' + assetId;

const byPosition = <T extends { position: number }>(list: T[]) =>
  [...list].sort((a, b) => a.position - b.position);

/** What the storefront sees: active highlights with at least one active video; hidden products drop out. */
export function publicStories(state: Pick<Operations, 'stories' | 'products'>) {
  const visible = new Map(
    state.products.filter((p) => p.active && !p.archived).map((p) => [p.id, p]),
  );
  return byPosition(state.stories)
    .filter((h) => h.active)
    .flatMap((h): StoryHighlightPublic[] => {
      const videos = byPosition(h.videos)
        .filter((v) => v.active && v.status === 'ready')
        .map((v) => ({
          id: v.id,
          caption: v.caption,
          source: { type: 'file' as const, src: assetSrc(v.assetId) },
          products: v.productIds.flatMap((id) => {
            const p = visible.get(id);
            return p ? [{ id: p.id, name: p.name, priceCents: p.priceCents, image: p.image }] : [];
          }),
        }));
      return videos.length
        ? [
            storyHighlightPublicSchema.parse({
              id: h.id,
              title: h.title,
              coverUrl: h.coverUrl ?? assetSrc(h.coverAssetId),
              placements: h.placements,
              categories: h.categories,
              videos,
            }),
          ]
        : [];
    });
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

export function saveStoryHighlight(state: Operations, raw: unknown) {
  const input = highlightInput.parse(raw);
  if (input.placements.includes('category') && !input.categories.length)
    throw new ApiError('CATEGORY_REQUIRED', 'Escolha ao menos uma categoria.', 422);
  const patch = {
    title: input.title,
    coverAssetId: input.coverAssetId,
    coverUrl: assetSrc(input.coverAssetId),
    active: input.active,
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
  const video: AdminStoryVideo = {
    ...patch,
    id: crypto.randomUUID(),
    position: Math.max(-1, ...highlight.videos.map((v) => v.position)) + 1,
    status: 'ready',
    views: 0,
    clicks: 0,
  };
  highlight.videos.push(video);
}

export const reorderStoryVideos = (state: Operations, highlightId: string, ids: string[]) =>
  reorder(findHighlight(state, highlightId).videos, ids);

export function deleteStoryVideo(state: Operations, id: string) {
  const { highlight } = findVideo(state, id);
  highlight.videos = highlight.videos.filter((v) => v.id !== id);
}

/** Counts a view or click. Unknown or inactive videos are a silent no-op, like the API. */
export function recordStoryEvent(
  state: Operations,
  event: { videoId: string; type: 'view' | 'click' },
) {
  const highlight = state.stories.find((h) => h.videos.some((v) => v.id === event.videoId));
  const video = highlight?.videos.find((v) => v.id === event.videoId);
  if (!highlight?.active || !video?.active) return false;
  if (event.type === 'view') video.views += 1;
  else video.clicks += 1;
  return true;
}

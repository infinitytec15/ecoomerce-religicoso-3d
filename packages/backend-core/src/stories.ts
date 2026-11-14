import { z } from 'zod';
import { transaction, lock, type Prisma, type Transaction } from '@maos-em-oracao/database';
import {
  STORY_LIMITS,
  storyEventSchema,
  storyHighlightInputSchema,
  storyVideoInputSchema,
  type AdminStoryHighlight,
  type MediaAsset,
  type StoryHighlightPublic,
  type StoryProduct,
  type StorySource,
  type StoryVideoPublic,
} from '@maos-em-oracao/contracts';
import type { Context } from './context';
import { rateLimit } from './context';
import { CatalogService } from './catalog';
import { type Actor, permit, requireValue, DomainError, data, audit } from './shared';

type AssetRow = Prisma.MediaAssetGetPayload<object>;
const byPosition = [
  { position: 'asc' },
  { createdAt: 'asc' },
] satisfies Prisma.StoryHighlightOrderByWithRelationInput[];
const videosByPosition = [
  { position: 'asc' },
  { createdAt: 'asc' },
] satisfies Prisma.StoryVideoOrderByWithRelationInput[];
/** True when `ids` holds every id of `current` exactly once, in any order. */
const sameSet = (ids: string[], current: string[]) =>
  ids.length === current.length &&
  new Set(ids).size === ids.length &&
  current.every((id) => ids.includes(id));
/** Cover and video assets of the highlights, once each. */
const assetIds = (rows: { coverAssetId: string; videos: { assetId: string }[] }[]) => [
  ...new Set(rows.flatMap((h) => [h.coverAssetId, ...h.videos.map((v) => v.assetId)])),
];
const assetStatus = (state: string) =>
  state === 'ready' ? 'ready' : state === 'failed' ? 'failed' : 'processing';

/** Stories (video commerce): highlight circles with short videos linked to products. */
export class StoriesService {
  private catalog: CatalogService;
  constructor(private ctx: Context) {
    this.catalog = new CatalogService(ctx);
  }

  async save(actor: Actor | null, value: unknown): Promise<void> {
    const a = permit(actor, 'marketing'),
      input = storyHighlightInputSchema.parse(value);
    if (input.placements.includes('category') && !input.categories.length)
      throw new DomainError('CATEGORY_REQUIRED', 'Escolha ao menos uma categoria.', 422);
    await transaction(this.ctx.db, async (tx) => {
      await lock(tx, 'stories');
      const cover = await tx.mediaAsset.findUnique({ where: { id: input.coverAssetId } });
      if (!cover || cover.kind !== 'image' || cover.state !== 'ready')
        throw new DomainError('INVALID_COVER', 'Envie uma imagem de capa pronta.', 422);
      const fields = {
        title: input.title,
        coverAssetId: input.coverAssetId,
        active: input.active,
        placements: input.placements,
        categories: input.categories,
      };
      if (input.id) {
        requireValue(
          await tx.storyHighlight.findUnique({ where: { id: input.id } }),
          'Destaque não encontrado.',
        );
        await tx.storyHighlight.update({ where: { id: input.id }, data: fields });
        await audit(tx, a.id, 'Destaque salvo', input.id);
        return;
      }
      if ((await tx.storyHighlight.count()) >= STORY_LIMITS.highlights)
        throw new DomainError(
          'TOO_MANY_HIGHLIGHTS',
          `Use no máximo ${STORY_LIMITS.highlights} destaques.`,
          422,
        );
      const last = await tx.storyHighlight.aggregate({ _max: { position: true } }),
        saved = await tx.storyHighlight.create({
          data: { ...fields, position: (last._max.position ?? -1) + 1 },
        });
      await audit(tx, a.id, 'Destaque salvo', saved.id);
    });
  }

  /** `ids` must be every highlight; each one takes its index as position. */
  async reorder(actor: Actor | null, ids: string[]): Promise<void> {
    const a = permit(actor, 'marketing');
    await transaction(this.ctx.db, async (tx) => {
      await lock(tx, 'stories');
      const current = await tx.storyHighlight.findMany({ select: { id: true } });
      if (
        !sameSet(
          ids,
          current.map((h) => h.id),
        )
      )
        throw new DomainError(
          'INVALID_ORDER',
          'A nova ordem precisa conter todos os destaques.',
          422,
        );
      await this.position(tx, 'highlight', ids);
      await audit(tx, a.id, 'Destaques reordenados', 'stories');
    });
  }

  /** Deletes the highlight with its videos (the files stay in storage). */
  async remove(actor: Actor | null, id: string): Promise<void> {
    const a = permit(actor, 'marketing');
    await transaction(this.ctx.db, async (tx) => {
      await lock(tx, 'stories');
      // Also the per-highlight lock: a concurrent video save or reorder must not see it vanish.
      await lock(tx, 'stories/' + id);
      requireValue(
        await tx.storyHighlight.findUnique({ where: { id } }),
        'Destaque não encontrado.',
      );
      await tx.storyHighlight.delete({ where: { id } });
      await audit(tx, a.id, 'Destaque excluído', id);
    });
  }

  async saveVideo(actor: Actor | null, value: unknown): Promise<void> {
    const a = permit(actor, 'marketing'),
      input = storyVideoInputSchema.parse(value);
    await transaction(this.ctx.db, async (tx) => {
      await lock(tx, 'stories/' + input.highlightId);
      requireValue(
        await tx.storyHighlight.findUnique({ where: { id: input.highlightId } }),
        'Destaque não encontrado.',
      );
      const existing = input.id
        ? requireValue(
            await tx.storyVideo.findUnique({ where: { id: input.id } }),
            'Vídeo não encontrado.',
          )
        : null;
      if (existing && existing.highlightId !== input.highlightId)
        throw new DomainError(
          'STORY_MOVE_NOT_ALLOWED',
          'Um vídeo não pode mudar de destaque. Exclua e envie de novo no outro destaque.',
          422,
        );
      const asset = await tx.mediaAsset.findUnique({ where: { id: input.assetId } });
      if (!asset || asset.kind !== 'video' || asset.state === 'failed')
        throw new DomainError('INVALID_VIDEO', 'Envie um vídeo válido.', 422);
      if (
        input.productIds.length &&
        (await tx.product.count({ where: { id: { in: input.productIds }, archived: false } })) !==
          input.productIds.length
      )
        throw new DomainError('INVALID_PRODUCT', 'Escolha peças existentes e não arquivadas.', 422);
      const fields = {
        assetId: input.assetId,
        caption: input.caption,
        productIds: input.productIds,
        active: input.active,
      };
      if (existing) {
        await tx.storyVideo.update({ where: { id: existing.id }, data: fields });
        await audit(tx, a.id, 'Vídeo do destaque salvo', existing.id);
        return;
      }
      const where = { highlightId: input.highlightId };
      if ((await tx.storyVideo.count({ where })) >= STORY_LIMITS.videosPerHighlight)
        throw new DomainError(
          'TOO_MANY_VIDEOS',
          `Use no máximo ${STORY_LIMITS.videosPerHighlight} vídeos por destaque.`,
          422,
        );
      const last = await tx.storyVideo.aggregate({ where, _max: { position: true } }),
        saved = await tx.storyVideo.create({
          data: { ...fields, ...where, position: (last._max.position ?? -1) + 1 },
        });
      await audit(tx, a.id, 'Vídeo do destaque salvo', saved.id);
    });
  }

  /** `ids` must be every video of the highlight; each one takes its index as position. */
  async reorderVideos(actor: Actor | null, highlightId: string, ids: string[]): Promise<void> {
    const a = permit(actor, 'marketing');
    await transaction(this.ctx.db, async (tx) => {
      await lock(tx, 'stories/' + highlightId);
      requireValue(
        await tx.storyHighlight.findUnique({ where: { id: highlightId } }),
        'Destaque não encontrado.',
      );
      const current = await tx.storyVideo.findMany({
        where: { highlightId },
        select: { id: true },
      });
      if (
        !sameSet(
          ids,
          current.map((v) => v.id),
        )
      )
        throw new DomainError(
          'INVALID_ORDER',
          'A nova ordem precisa conter todos os vídeos do destaque.',
          422,
        );
      await this.position(tx, 'video', ids);
      await audit(tx, a.id, 'Vídeos do destaque reordenados', highlightId);
    });
  }

  async removeVideo(actor: Actor | null, id: string): Promise<void> {
    const a = permit(actor, 'marketing');
    const video = requireValue(
      await this.ctx.db.storyVideo.findUnique({ where: { id } }),
      'Vídeo não encontrado.',
    );
    await transaction(this.ctx.db, async (tx) => {
      await lock(tx, 'stories/' + video.highlightId);
      requireValue(await tx.storyVideo.findUnique({ where: { id } }), 'Vídeo não encontrado.');
      await tx.storyVideo.delete({ where: { id } });
      await audit(tx, a.id, 'Vídeo do destaque excluído', id);
    });
  }

  /**
   * Storefront highlights, by position: active, with a ready cover and at least one active video
   * whose asset is a ready video. Products follow the catalog rule; hidden ones leave the video.
   */
  async publicList(): Promise<StoryHighlightPublic[]> {
    const rows = await this.ctx.db.storyHighlight.findMany({
      where: { active: true },
      include: { videos: { where: { active: true }, orderBy: videosByPosition } },
      orderBy: byPosition,
      take: STORY_LIMITS.highlights,
    });
    if (!rows.length) return [];
    const assets = new Map(
        (
          await this.ctx.db.mediaAsset.findMany({
            where: {
              id: { in: assetIds(rows) },
              state: 'ready',
            },
          })
        ).map((asset) => [asset.id, asset]),
      ),
      products = await this.catalog.visible([
        ...new Set(rows.flatMap((h) => h.videos.flatMap((v) => v.productIds))),
      ]),
      card = (id: string): StoryProduct[] => {
        const p = products.get(id);
        return p
          ? [{ id: p.id, name: p.name, priceCents: p.priceCents, image: p.image ?? '' }]
          : [];
      };
    return rows.flatMap((h) => {
      const cover = assets.get(h.coverAssetId),
        coverUrl = cover?.kind === 'image' ? data<Partial<MediaAsset>>(cover.data).url : undefined,
        videos = h.videos.flatMap((v): StoryVideoPublic[] => {
          const asset = assets.get(v.assetId),
            source = asset?.kind === 'video' ? this.playable(v.id, asset) : null;
          return source
            ? [
                {
                  id: v.id,
                  caption: v.caption,
                  source,
                  products: v.productIds.flatMap(card).slice(0, STORY_LIMITS.productsPerVideo),
                },
              ]
            : [];
        });
      return coverUrl && videos.length
        ? [
            {
              id: h.id,
              title: h.title,
              coverUrl,
              placements: h.placements as StoryHighlightPublic['placements'],
              categories: h.categories as StoryHighlightPublic['categories'],
              videos,
            },
          ]
        : [];
    });
  }

  /** Counts a view or a click. Unknown or inactive videos are a silent no-op. */
  async event(value: unknown, clientKey: string): Promise<void> {
    const input = storyEventSchema.parse(value);
    await rateLimit(this.ctx, 'story-event/' + clientKey, 600, 3600000);
    if (!z.uuid().safeParse(input.videoId).success) return;
    await this.ctx.db.storyVideo.updateMany({
      where: { id: input.videoId, active: true },
      data: input.type === 'view' ? { views: { increment: 1 } } : { clicks: { increment: 1 } },
    });
  }

  /** Admin snapshot: every highlight by position, with every video, its asset state and metrics. */
  async forAdmin(): Promise<AdminStoryHighlight[]> {
    const rows = await this.ctx.db.storyHighlight.findMany({
      include: { videos: { orderBy: videosByPosition } },
      orderBy: byPosition,
      take: STORY_LIMITS.highlights,
    });
    if (!rows.length) return [];
    const assets = new Map(
      (
        await this.ctx.db.mediaAsset.findMany({
          where: {
            id: { in: assetIds(rows) },
          },
        })
      ).map((asset) => [asset.id, asset]),
    );
    return rows.map((h) => {
      const cover = assets.get(h.coverAssetId),
        coverUrl = cover ? data<Partial<MediaAsset>>(cover.data).url : undefined;
      return {
        id: h.id,
        title: h.title,
        coverAssetId: h.coverAssetId,
        ...(coverUrl ? { coverUrl } : {}),
        active: h.active,
        position: h.position,
        placements: h.placements as AdminStoryHighlight['placements'],
        categories: h.categories as AdminStoryHighlight['categories'],
        videos: h.videos.map((v) => {
          const asset = assets.get(v.assetId),
            thumbnailUrl = asset ? data<Partial<MediaAsset>>(asset.data).thumbnailUrl : undefined;
          return {
            id: v.id,
            assetId: v.assetId,
            caption: v.caption,
            productIds: v.productIds,
            active: v.active,
            position: v.position,
            status: asset ? assetStatus(asset.state) : 'failed',
            ...(thumbnailUrl ? { thumbnailUrl } : {}),
            views: v.views,
            clicks: v.clicks,
          };
        }),
      };
    });
  }

  /**
   * Where the player reads the video. Bunny Stream URLs are derived on read: assets saved before
   * the HLS playlist existed have no `hlsUrl` in their data.
   */
  private source(asset: AssetRow): StorySource | null {
    if (asset.storage === 'bunny-stream' && asset.providerId) {
      const urls = this.ctx.media.videoUrls(asset.providerId);
      return { type: 'hls', src: urls.hlsUrl, poster: urls.thumbnailUrl };
    }
    const url = data<Partial<MediaAsset>>(asset.data).url;
    return url ? { type: 'file', src: url } : null;
  }

  /** The source of one video, or null when it cannot be built: only that video leaves the list. */
  private playable(videoId: string, asset: AssetRow): StorySource | null {
    try {
      return this.source(asset);
    } catch (error) {
      console.warn(
        'Stories: vídeo sem origem reproduzível:',
        videoId,
        (error as { code?: string } | null)?.code ?? (error as Error | null)?.name ?? 'erro',
      );
      return null;
    }
  }

  private async position(tx: Transaction, kind: 'highlight' | 'video', ids: string[]) {
    for (const [position, id] of ids.entries())
      if (kind === 'highlight')
        await tx.storyHighlight.update({ where: { id }, data: { position } });
      else await tx.storyVideo.update({ where: { id }, data: { position } });
  }
}

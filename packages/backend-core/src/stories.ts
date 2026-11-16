import { z } from 'zod';
import { transaction, lock, Prisma, type Transaction } from '@maos-em-oracao/database';
import {
  DEFAULT_STORY_SETTINGS,
  STORY_FORMATS,
  STORY_LIMITS,
  normalizePlacements,
  storyEventBatchSchema,
  storyEventSchema,
  storyHighlightInputSchema,
  storySettingsSchema,
  storyVideoInputSchema,
  type AdminStoryHighlight,
  type MediaAsset,
  type StoriesFeed,
  type StoryEvent,
  type StoryEventType,
  type StoryFormat,
  type StoryHighlightPublic,
  type StoryProduct,
  type StorySettings,
  type StorySource,
  type StoryVideoPublic,
} from '@maos-em-oracao/contracts';
import type { Context } from './context';
import { rateLimit } from './context';
import { CatalogService } from './catalog';
import { type Actor, permit, requireValue, DomainError, data, json, audit } from './shared';

type AssetRow = Prisma.MediaAssetGetPayload<object>;
type Db = Context['db'] | Transaction;
type HighlightRow = Prisma.StoryHighlightGetPayload<{ include: { videos: true } }>;
type PublicVideo = { createdAt: Date; video: StoryVideoPublic };
/** Showable videos by id and the ready cover URLs by asset id. */
type PublicVideos = { videos: Map<string, PublicVideo>; covers: Map<string, string> };
type CounterColumn = 'impressions' | 'views' | 'completes' | 'clicks' | 'carts';
/**
 * Orders that do not count as sold for video attribution. Unlike the sales report (which only
 * leaves out unpaid and cancelled orders), a group buy still waiting for its group is out too:
 * its payment is refunded if the group fails, so it counts once the group closes.
 */
const UNPAID_ORDER_STATUSES = ['Aguardando pagamento', 'Cancelado', 'Aguardando grupo'];
/** Event type to the StoryVideo counter it increments (`views` are plays, `clicks` product clicks). */
const counterColumn: Record<StoryEventType, CounterColumn> = {
  impression: 'impressions',
  play: 'views',
  complete: 'completes',
  product_click: 'clicks',
  add_to_cart: 'carts',
};
/** The first contract only had `view` (now a play) and `click` (now a product click). */
const legacyEventSchema = z.object({
  videoId: storyEventSchema.shape.videoId,
  type: z.enum(['view', 'click']),
});
/** Events of a request body: a batch, one event or one legacy event. Anything else is refused. */
function storyEvents(value: unknown): StoryEvent[] {
  if (value && typeof value === 'object' && 'events' in value)
    return storyEventBatchSchema.parse(value).events;
  const legacy = legacyEventSchema.safeParse(value);
  if (legacy.success)
    return [
      {
        videoId: legacy.data.videoId,
        type: legacy.data.type === 'view' ? 'play' : 'product_click',
      },
    ];
  return [storyEventSchema.parse(value)];
}
const storyFormat = (value: string): StoryFormat =>
  (STORY_FORMATS as readonly string[]).includes(value) ? (value as StoryFormat) : 'stories';
/**
 * The product page bubble: the showable ones of `videos`, newest first, once each, and per product
 * its video ids (newest first).
 */
function productPage(
  videos: { id: string }[],
  shown: Map<string, PublicVideo>,
): Pick<StoriesFeed['productPage'], 'videos' | 'byProduct'> {
  const list = [...new Set(videos.map((v) => v.id))]
    .flatMap((id) => shown.get(id) ?? [])
    .sort(
      (a, b) =>
        b.createdAt.getTime() - a.createdAt.getTime() || b.video.id.localeCompare(a.video.id),
    )
    .slice(0, STORY_LIMITS.productVideos)
    .map((v) => v.video);
  const byProduct: Record<string, string[]> = {};
  for (const v of list)
    for (const p of v.products) {
      const ids = byProduct[p.id] ?? [];
      if (ids.length < STORY_LIMITS.videosPerProduct) byProduct[p.id] = [...ids, v.id];
    }
  return { videos: list, byProduct };
}
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

/** Stories (video commerce): collections of short videos linked to products. */
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
        format: input.format,
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
      // Products already linked to this video stay valid even if archived since.
      const kept = new Set(existing?.productIds ?? []),
        added = input.productIds.filter((id) => !kept.has(id));
      if (
        added.length &&
        (await tx.product.count({ where: { id: { in: added }, archived: false } })) !==
          new Set(added).size
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

  /** Store setting `stories` (AppSetting); a missing or unreadable row is the default. */
  async settings(db: Db = this.ctx.db): Promise<StorySettings> {
    const row = await db.appSetting.findUnique({ where: { key: 'stories' } }),
      parsed = row ? storySettingsSchema.safeParse(row.data) : null;
    return parsed?.success
      ? parsed.data
      : { productPage: { ...DEFAULT_STORY_SETTINGS.productPage } };
  }

  async saveSettings(actor: Actor | null, value: unknown): Promise<void> {
    const a = permit(actor, 'marketing'),
      input = storySettingsSchema.parse(value);
    await transaction(this.ctx.db, async (tx) => {
      await tx.appSetting.upsert({
        where: { key: 'stories' },
        create: { key: 'stories', data: json(input) },
        update: { data: json(input), version: { increment: 1 } },
      });
      await audit(tx, a.id, 'Stories: vídeos da página do produto salvos', 'stories');
    });
  }

  /**
   * Storefront feed. A video shows when it is active, its asset is a ready, playable video and at
   * least one of its products is sellable (catalog-visible with stock); its products are only the
   * sellable ones. Collections: active highlights by position with a ready cover, at least one
   * video and a place to be drawn. Product page: every such video of any highlight (active or
   * not), newest first, indexed by product.
   */
  async feed(): Promise<StoriesFeed> {
    const [settings, rows] = await Promise.all([
      this.settings(),
      this.ctx.db.storyHighlight.findMany({
        include: { videos: { where: { active: true }, orderBy: videosByPosition } },
        orderBy: byPosition,
        take: STORY_LIMITS.highlights,
      }),
    ]);
    const shown = await this.publicVideos(rows);
    const collections = rows.flatMap((h): StoryHighlightPublic[] => {
      const format = storyFormat(h.format),
        placements = normalizePlacements(h.placements, format),
        videos = h.videos.flatMap((v) => shown.videos.get(v.id)?.video ?? []),
        coverUrl = shown.covers.get(h.coverAssetId);
      return h.active && placements.length && coverUrl && videos.length
        ? [
            {
              id: h.id,
              title: h.title,
              coverUrl,
              format,
              placements,
              categories: h.categories as StoryHighlightPublic['categories'],
              videos,
            },
          ]
        : [];
    });
    const { enabled, position } = settings.productPage;
    return {
      collections,
      productPage: enabled
        ? {
            enabled,
            position,
            ...productPage(
              rows.flatMap((h) => h.videos),
              shown.videos,
            ),
          }
        : { enabled, position, videos: [], byProduct: {} },
    };
  }

  /**
   * Counts usage events: a batch `{ events }`, one event, or the legacy `view`/`click` (now play
   * and product click). A call counts once for the rate limit. Unknown, malformed or inactive
   * videos are a silent no-op.
   */
  async event(value: unknown, clientKey: string): Promise<void> {
    const events = storyEvents(value);
    await rateLimit(this.ctx, 'story-event/' + clientKey, 600, 3600000);
    const increments = new Map<string, Partial<Record<CounterColumn, number>>>();
    for (const e of events) {
      if (!z.uuid().safeParse(e.videoId).success) continue;
      const column = counterColumn[e.type],
        current = increments.get(e.videoId) ?? {};
      increments.set(e.videoId, { ...current, [column]: (current[column] ?? 0) + 1 });
    }
    await Promise.all(
      [...increments].map(([id, counts]) =>
        this.ctx.db.storyVideo.updateMany({
          where: { id, active: true },
          data: Object.fromEntries(
            Object.entries(counts).map(([column, n]) => [column, { increment: n }]),
          ),
        }),
      ),
    );
  }

  /** Admin snapshot: every highlight by position, with every video, its asset state and metrics. */
  async forAdmin(): Promise<AdminStoryHighlight[]> {
    const rows = await this.ctx.db.storyHighlight.findMany({
      include: { videos: { orderBy: videosByPosition } },
      orderBy: byPosition,
      take: STORY_LIMITS.highlights,
    });
    if (!rows.length) return [];
    const [assetRows, sales] = await Promise.all([
      this.ctx.db.mediaAsset.findMany({ where: { id: { in: assetIds(rows) } } }),
      this.sales(rows.flatMap((h) => h.videos.map((v) => v.id))),
    ]);
    const assets = new Map(assetRows.map((asset) => [asset.id, asset]));
    return rows.map((h) => {
      const cover = assets.get(h.coverAssetId),
        coverUrl = cover ? data<Partial<MediaAsset>>(cover.data).url : undefined,
        format = storyFormat(h.format);
      return {
        id: h.id,
        title: h.title,
        coverAssetId: h.coverAssetId,
        ...(coverUrl ? { coverUrl } : {}),
        active: h.active,
        position: h.position,
        format,
        placements: normalizePlacements(h.placements, format),
        categories: h.categories as AdminStoryHighlight['categories'],
        videos: h.videos.map((v) => {
          const asset = assets.get(v.assetId),
            thumbnailUrl = asset ? data<Partial<MediaAsset>>(asset.data).thumbnailUrl : undefined,
            sold = sales.get(v.id);
          return {
            id: v.id,
            assetId: v.assetId,
            caption: v.caption,
            productIds: v.productIds,
            active: v.active,
            position: v.position,
            status: asset ? assetStatus(asset.state) : 'failed',
            ...(thumbnailUrl ? { thumbnailUrl } : {}),
            impressions: v.impressions,
            views: v.views,
            completes: v.completes,
            clicks: v.clicks,
            carts: v.carts,
            orders: sold?.orders ?? 0,
            revenueCents: sold?.revenueCents ?? 0,
          };
        }),
      };
    });
  }

  /**
   * Per video: the paid orders (distinct) with an item bought from it and the revenue of those
   * items, in one grouped read.
   */
  private async sales(
    videoIds: string[],
  ): Promise<Map<string, { orders: number; revenueCents: number }>> {
    if (!videoIds.length) return new Map();
    const rows = await this.ctx.db.$queryRaw<{ id: string; orders: number; revenue: bigint }[]>`
      SELECT i."storyVideoId" AS id, count(DISTINCT i."orderId")::int AS orders,
        coalesce(sum(i."unitCents" * i.quantity), 0)::bigint AS revenue
      FROM "OrderItem" i JOIN "Order" o ON o.id = i."orderId"
      WHERE i."storyVideoId" IN (${Prisma.join(videoIds)})
        AND o.status NOT IN (${Prisma.join(UNPAID_ORDER_STATUSES)})
      GROUP BY 1`;
    return new Map(rows.map((r) => [r.id, { orders: r.orders, revenueCents: Number(r.revenue) }]));
  }

  /**
   * Public projection of every showable video of `rows` (see `feed`) and the ready cover URLs, from
   * two reads: the ready assets and the catalog-visible products.
   */
  private async publicVideos(rows: HighlightRow[]): Promise<PublicVideos> {
    const videos = new Map<string, PublicVideo>(),
      covers = new Map<string, string>();
    if (!rows.length) return { videos, covers };
    const [assetRows, products] = await Promise.all([
      this.ctx.db.mediaAsset.findMany({ where: { id: { in: assetIds(rows) }, state: 'ready' } }),
      this.catalog.visible([
        ...new Set(rows.flatMap((h) => h.videos.flatMap((v) => v.productIds))),
      ]),
    ]);
    const assets = new Map(assetRows.map((asset) => [asset.id, asset])),
      card = (id: string): StoryProduct[] => {
        const p = products.get(id);
        return p && p.stock > 0
          ? [{ id: p.id, name: p.name, priceCents: p.priceCents, image: p.image ?? '' }]
          : [];
      };
    for (const asset of assetRows) {
      const url = asset.kind === 'image' ? data<Partial<MediaAsset>>(asset.data).url : undefined;
      if (url) covers.set(asset.id, url);
    }
    for (const v of rows.flatMap((h) => h.videos)) {
      const sellable = v.productIds.flatMap(card).slice(0, STORY_LIMITS.productsPerVideo);
      if (!sellable.length) continue;
      const asset = assets.get(v.assetId),
        source = asset?.kind === 'video' ? this.playable(v.id, asset) : null;
      if (source)
        videos.set(v.id, {
          createdAt: v.createdAt,
          video: { id: v.id, caption: v.caption, source, products: sellable },
        });
    }
    return { videos, covers };
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

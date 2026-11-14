import { z } from 'zod';
import { transaction, lock, type Transaction } from '@maos-em-oracao/database';
import {
  defaultReviewSettings,
  initialReviewStatus,
  reviewAuthorName,
  reviewInputSchema,
  reviewStatusSchema,
  summarizeRatings,
  summarizeRatingCounts,
  type MyReview,
  type ProductReviews,
  type ReviewStatus,
} from '@maos-em-oracao/contracts';
import type { Context } from './context';
import { settings, rateLimit } from './context';
import { readSignedToken } from './security';
import { reviewDto } from './projections';
import { type Actor, permit, requireValue, DomainError, data, audit } from './shared';
export class ReviewsService {
  constructor(private ctx: Context) {}
  /** Public list: the summary covers every published review, the list honours the filter. */
  async forProduct(productId: string, ratingFilter?: unknown): Promise<ProductReviews> {
    const rating = z.coerce
      .number()
      .int()
      .min(1)
      .max(5)
      .optional()
      .parse(ratingFilter || undefined);
    const product = await this.ctx.db.product.findFirst({
      where: { id: productId, active: true, archived: false },
      select: { id: true },
    });
    if (!product) return { summary: summarizeRatings([]), reviews: [] };
    const [groups, rows] = await Promise.all([
      this.ctx.db.review.groupBy({
        by: ['rating'],
        where: { productId, status: 'Publicado' },
        _count: { _all: true },
      }),
      this.ctx.db.review.findMany({
        where: { productId, status: 'Publicado', ...(rating ? { rating } : {}) },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
    ]);
    return {
      summary: summarizeRatingCounts(
        groups.map((g) => ({ rating: g.rating, count: g._count._all })),
      ),
      reviews: rows.map((r) => reviewDto(r)),
    };
  }
  async create(actor: Actor | null, value: unknown): Promise<MyReview> {
    if (!actor?.customerId)
      throw new DomainError('UNAUTHORIZED', 'Entre na conta para avaliar.', 401);
    const customerId = actor.customerId,
      input = reviewInputSchema.parse(value);
    await rateLimit(this.ctx, 'review/' + actor.id, 10, 3600000);
    const reviews = (await settings(this.ctx.db)).workspace.reviews ?? defaultReviewSettings;
    return transaction(this.ctx.db, async (tx) => {
      await lock(tx, 'review/' + input.orderItemId);
      const photos = await this.photos(tx, customerId, input.photoIds);
      const item = requireValue(
        await tx.orderItem.findFirst({
          where: {
            id: input.orderItemId,
            order: { customerId, ...(actor.guestOrderId ? { id: actor.guestOrderId } : {}) },
          },
          include: { order: true },
        }),
        'Item do pedido não encontrado.',
      );
      if (item.order.status !== 'Entregue')
        throw new DomainError(
          'NOT_DELIVERED',
          'Você poderá avaliar depois que o pedido for entregue.',
          409,
        );
      if (await tx.review.findUnique({ where: { orderItemId: item.id } }))
        throw new DomainError('ALREADY_REVIEWED', 'Você já avaliou este item.', 409);
      const customer = requireValue(await tx.customer.findUnique({ where: { id: customerId } })),
        d = data<{ size?: string; color?: string }>(item.data),
        review = await tx.review.create({
          data: {
            orderItemId: item.id,
            orderId: item.orderId,
            productId: item.productId,
            customerId,
            rating: input.rating,
            title: input.title,
            text: input.text,
            photos,
            author: reviewAuthorName(customer.name),
            variant: [d.size, d.color].filter(Boolean).join(' · '),
            status: initialReviewStatus(reviews, input.rating, photos.length),
          },
        });
      await audit(tx, actor.id, 'Avaliação enviada', review.id);
      return {
        orderItemId: review.orderItemId,
        rating: review.rating,
        status: review.status as ReviewStatus,
      };
    });
  }
  /** Customer-side opt-out from "Como ficou sua peça?" e-mails, via the signed link. */
  async optOut(value: unknown) {
    const input = z.object({ token: z.string().min(20).max(2048) }).parse(value);
    let p: { id: string };
    try {
      p = readSignedToken(input.token, 'review-optout', this.ctx.config);
    } catch {
      throw new DomainError('INVALID_TOKEN', 'Link de descadastro inválido ou expirado.');
    }
    await transaction(this.ctx.db, async (tx) => {
      const customer = await tx.customer.findUnique({
        where: { id: p.id },
        select: { email: true },
      });
      if (!customer) return;
      // Guest checkouts create a new Customer row per order, so the opt-out follows the e-mail.
      await tx.customer.updateMany({
        where: { email: { equals: customer.email, mode: 'insensitive' } },
        data: { reviewRequestsOptOut: true },
      });
      await audit(tx, 'customer', 'Descadastro de pedidos de avaliação', p.id);
    });
  }
  /** Photos must be the customer's own finished image uploads, each used by one review only. */
  private async photos(tx: Transaction, customerId: string, ids: string[]) {
    if (!ids.length) return [];
    const unique = [...new Set(ids)].sort(),
      invalid = () =>
        new DomainError('INVALID_PHOTO', 'Não foi possível usar as fotos enviadas.', 422);
    if (unique.length !== ids.length) throw invalid();
    for (const id of unique) await lock(tx, 'review-photo/' + id);
    const assets = await tx.mediaAsset.findMany({
      where: {
        id: { in: unique },
        uploaderId: 'customer/' + customerId,
        state: 'ready',
        kind: 'image',
      },
    });
    if (assets.length !== unique.length) throw invalid();
    const used = await tx.review.count({
      where: { OR: unique.map((assetId) => ({ photos: { array_contains: [{ assetId }] } })) },
    });
    if (used) throw invalid();
    return ids.map((id) => {
      const asset = assets.find((a) => a.id === id)!,
        url = data<{ url?: string }>(asset.data).url;
      if (!url) throw invalid();
      return { assetId: id, url };
    });
  }
  async moderate(actor: Actor | null, id: string, status: unknown, reply: string) {
    const a = permit(actor, 'community'),
      next = reviewStatusSchema.parse(status),
      text = z.string().trim().max(1000).parse(reply);
    await transaction(this.ctx.db, async (tx) => {
      const r = requireValue(await tx.review.findUnique({ where: { id } }));
      await tx.review.update({
        where: { id },
        data: {
          status: next,
          reply: text,
          ...(text !== r.reply ? { repliedAt: text ? new Date() : null } : {}),
        },
      });
      await audit(tx, a.id, 'Avaliação: ' + next, id);
    });
  }
}

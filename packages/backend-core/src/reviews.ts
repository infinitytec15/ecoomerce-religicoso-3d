import { z } from 'zod';
import { transaction, lock } from '@maos-em-oracao/database';
import {
  defaultReviewSettings,
  initialReviewStatus,
  reviewAuthorName,
  reviewInputSchema,
  reviewStatusSchema,
  summarizeRatings,
  type MyReview,
  type ProductReviews,
  type ReviewStatus,
} from '@maos-em-oracao/contracts';
import type { Context } from './context';
import { settings, rateLimit } from './context';
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
    const [all, rows] = await Promise.all([
      this.ctx.db.review.findMany({
        where: { productId, status: 'Publicado' },
        select: { rating: true },
      }),
      this.ctx.db.review.findMany({
        where: { productId, status: 'Publicado', ...(rating ? { rating } : {}) },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
    ]);
    return {
      summary: summarizeRatings(all.map((r) => r.rating)),
      reviews: rows.map((r) => reviewDto(r)),
    };
  }
  async create(actor: Actor | null, value: unknown): Promise<MyReview> {
    if (!actor?.customerId)
      throw new DomainError('UNAUTHORIZED', 'Entre na conta para avaliar.', 401);
    const customerId = actor.customerId,
      input = reviewInputSchema.parse(value);
    await rateLimit(this.ctx, 'review/' + actor.id, 10, 3600000);
    // Task 4 validates uploaded photos; until then any attachment is rejected.
    if (input.photoIds.length)
      throw new DomainError('INVALID_PHOTO', 'Não foi possível usar as fotos enviadas.', 422);
    const reviews = (await settings(this.ctx.db)).workspace.reviews ?? defaultReviewSettings;
    return transaction(this.ctx.db, async (tx) => {
      await lock(tx, 'review/' + input.orderItemId);
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
            photos: [],
            author: reviewAuthorName(customer.name),
            variant: [d.size, d.color].filter(Boolean).join(' · '),
            status: initialReviewStatus(reviews, input.rating, 0),
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

import { z } from 'zod';

export const reviewStatusSchema = z.enum(['Publicado', 'Em análise', 'Oculto']);
export type ReviewStatus = z.infer<typeof reviewStatusSchema>;

export const reviewSettingsSchema = z.object({
  requestEnabled: z.boolean(),
  requestDelayDays: z.number().int().min(1).max(60),
  autoPublishMinRating: z.number().int().min(1).max(5).nullable(),
});
export type ReviewSettings = z.infer<typeof reviewSettingsSchema>;

export const defaultReviewSettings: ReviewSettings = {
  requestEnabled: true,
  requestDelayDays: 7,
  autoPublishMinRating: null,
};

export const reviewInputSchema = z.object({
  orderItemId: z.uuid(),
  rating: z.number().int().min(1).max(5),
  title: z.string().trim().max(80).default(''),
  text: z.string().trim().min(10).max(2000),
  photoIds: z.array(z.uuid()).max(3).default([]),
});
export type ReviewInput = z.infer<typeof reviewInputSchema>;

export interface PublicReview {
  id: string;
  rating: number;
  title: string;
  text: string;
  author: string;
  createdAt: string;
  /** Purchased variant, e.g. "20 cm · Marfim". */
  variant: string;
  photos: { url: string }[];
  reply: string | null;
  repliedAt: string | null;
}
export type AdminReview = PublicReview & {
  status: ReviewStatus;
  productId: string;
  productName: string;
  orderId: string;
  orderNumber: string;
  customerName: string;
  customerEmail: string;
};
export interface MyReview {
  orderItemId: string;
  rating: number;
  status: ReviewStatus;
}
export interface RatingSummary {
  /** One decimal place. */
  average: number;
  count: number;
  histogram: [number, number, number, number, number];
}
export interface ProductReviews {
  summary: RatingSummary;
  reviews: PublicReview[];
}

export const publicReviewSchema = z.object({
  id: z.string(),
  rating: z.number().int().min(1).max(5),
  title: z.string(),
  text: z.string(),
  author: z.string(),
  createdAt: z.string(),
  variant: z.string(),
  photos: z.array(z.object({ url: z.string() })),
  reply: z.string().nullable(),
  repliedAt: z.string().nullable(),
});
export const adminReviewSchema = publicReviewSchema.extend({
  status: reviewStatusSchema,
  productId: z.string(),
  productName: z.string(),
  orderId: z.string(),
  orderNumber: z.string(),
  customerName: z.string(),
  customerEmail: z.string(),
});
export const myReviewSchema = z.object({
  orderItemId: z.string(),
  rating: z.number().int().min(1).max(5),
  status: reviewStatusSchema,
});
export const ratingSummarySchema = z.object({
  average: z.number(),
  count: z.number().int().nonnegative(),
  histogram: z.tuple([z.number(), z.number(), z.number(), z.number(), z.number()]),
});
export const productReviewsSchema = z.object({
  summary: ratingSummarySchema,
  reviews: z.array(publicReviewSchema),
});

/** Average shown to customers: one decimal. */
export function roundRating(average: number): number {
  return Math.round(average * 10) / 10;
}

export function summarizeRatingCounts(groups: { rating: number; count: number }[]): RatingSummary {
  const histogram: RatingSummary['histogram'] = [0, 0, 0, 0, 0];
  let sum = 0,
    count = 0;
  for (const g of groups) {
    histogram[Math.min(5, Math.max(1, Math.round(g.rating))) - 1] += g.count;
    sum += g.rating * g.count;
    count += g.count;
  }
  return { average: count ? roundRating(sum / count) : 0, count, histogram };
}

export function summarizeRatings(ratings: number[]): RatingSummary {
  return summarizeRatingCounts(ratings.map((rating) => ({ rating, count: 1 })));
}

/** Reviews auto-publish only at/above the threshold and never when they carry photos. */
export function initialReviewStatus(
  s: ReviewSettings,
  rating: number,
  photoCount: number,
): 'Publicado' | 'Em análise' {
  return s.autoPublishMinRating !== null && rating >= s.autoPublishMinRating && photoCount === 0
    ? 'Publicado'
    : 'Em análise';
}

/** First name plus the last name's initial, e.g. "Maria S.". */
export function reviewAuthorName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'Cliente';
  const cap = (w: string) =>
    w.charAt(0).toLocaleUpperCase('pt-BR') + w.slice(1).toLocaleLowerCase('pt-BR');
  const first = cap(parts[0]);
  return parts.length > 1
    ? `${first} ${parts[parts.length - 1].charAt(0).toLocaleUpperCase('pt-BR')}.`
    : first;
}

import { unitPriceCents, type PublicReview } from '@maos-em-oracao/contracts';
import type { Product } from '@/lib/domain/types';

const siteUrl = () =>
  (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').replace(/\/$/, '');
const absolute = (path: string) =>
  /^https?:\/\//.test(path) ? path : path.startsWith('/') ? siteUrl() + path : undefined;

export function productJsonLd(product: Product, reviews: PublicReview[] = []) {
  const image = absolute(product.image),
    url = `${siteUrl()}/produto/${encodeURIComponent(product.id)}`;
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: product.description,
    sku: product.sku,
    url,
    ...(image ? { image: [image] } : {}),
    offers: {
      '@type': 'Offer',
      url,
      priceCurrency: 'BRL',
      price: (unitPriceCents(product, 0) / 100).toFixed(2),
      availability: 'https://schema.org/InStock',
    },
    ...(product.rating && product.rating.count > 0
      ? {
          aggregateRating: {
            '@type': 'AggregateRating',
            ratingValue: product.rating.average,
            reviewCount: product.rating.count,
          },
          ...(reviews.length > 0
            ? {
                review: reviews.slice(0, 5).map((r) => ({
                  '@type': 'Review',
                  author: { '@type': 'Person', name: r.author },
                  reviewRating: { '@type': 'Rating', ratingValue: r.rating, bestRating: 5 },
                  reviewBody: r.text,
                  datePublished: r.createdAt.slice(0, 10),
                })),
              }
            : {}),
        }
      : {}),
  };
}

/** Serializes for an inline script tag: `<` is escaped so content can never close it. */
export const jsonLdScript = (data: unknown) => JSON.stringify(data).replace(/</g, '\\u003c');

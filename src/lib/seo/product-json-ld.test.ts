import { describe, it, expect } from 'vitest';
import { seedCatalog } from '@/lib/demo/seed';
import { jsonLdScript, productJsonLd } from './product-json-ld';

const base = seedCatalog[0];
const reviews = Array.from({ length: 7 }, (_, i) => ({
  id: 'r' + i,
  rating: 5,
  title: 't',
  text: 'Muito boa </script><b>',
  author: 'Ana P.',
  createdAt: '2026-10-05T12:00:00.000Z',
  variant: '',
  photos: [],
  reply: null,
  repliedAt: null,
}));

describe('productJsonLd', () => {
  it('omits aggregateRating when there are no ratings', () => {
    const ld = productJsonLd({ ...base, rating: undefined });
    expect(ld).not.toHaveProperty('aggregateRating');
    expect(ld).not.toHaveProperty('review');
    expect(ld['@type']).toBe('Product');
  });
  it('includes aggregateRating, offers and at most 5 reviews', () => {
    const ld = productJsonLd({ ...base, rating: { average: 4.7, count: 7 } }, reviews);
    expect(ld.aggregateRating).toEqual({
      '@type': 'AggregateRating',
      ratingValue: 4.7,
      reviewCount: 7,
    });
    expect(ld.review).toHaveLength(5);
    expect(ld.offers).toMatchObject({
      priceCurrency: 'BRL',
      price: (base.priceCents / 100).toFixed(2),
    });
  });
  it('escapes script terminators in the serialized output', () => {
    const out = jsonLdScript(productJsonLd({ ...base, rating: { average: 5, count: 7 } }, reviews));
    expect(out).not.toContain('</script>');
    expect(out).not.toContain('<');
    expect(out).toContain(String.raw`\u003c/script>`);
  });
});

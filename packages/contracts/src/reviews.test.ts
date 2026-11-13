import { describe, it, expect } from 'vitest';
import {
  defaultReviewSettings,
  initialReviewStatus,
  reviewAuthorName,
  reviewInputSchema,
  summarizeRatings,
} from './reviews';

describe('reviews contracts', () => {
  it('summarizes ratings with one decimal and a 5-bucket histogram', () => {
    expect(summarizeRatings([5, 4, 4, 1])).toEqual({
      average: 3.5,
      count: 4,
      histogram: [1, 0, 0, 2, 1],
    });
    expect(summarizeRatings([])).toEqual({ average: 0, count: 0, histogram: [0, 0, 0, 0, 0] });
  });
  it('auto-publishes only at or above the threshold and never with photos', () => {
    const s = { ...defaultReviewSettings, autoPublishMinRating: 4 };
    expect(initialReviewStatus(s, 4, 0)).toBe('Publicado');
    expect(initialReviewStatus(s, 3, 0)).toBe('Em análise');
    expect(initialReviewStatus(s, 5, 1)).toBe('Em análise');
    expect(initialReviewStatus(defaultReviewSettings, 5, 0)).toBe('Em análise');
  });
  it('shows first name and last initial only', () => {
    expect(reviewAuthorName('Maria Aparecida Souza')).toBe('Maria S.');
    expect(reviewAuthorName('  joão ')).toBe('João');
    expect(reviewAuthorName('')).toBe('Cliente');
  });
  it('validates review input bounds', () => {
    const ok = { orderItemId: crypto.randomUUID(), rating: 5, text: 'Ficou linda na sala.' };
    expect(reviewInputSchema.parse(ok)).toMatchObject({ title: '', photoIds: [] });
    expect(() => reviewInputSchema.parse({ ...ok, rating: 6 })).toThrow();
    expect(() => reviewInputSchema.parse({ ...ok, text: 'curto' })).toThrow();
    expect(() =>
      reviewInputSchema.parse({
        ...ok,
        photoIds: [1, 2, 3, 4].map(() => crypto.randomUUID()),
      }),
    ).toThrow();
  });
});

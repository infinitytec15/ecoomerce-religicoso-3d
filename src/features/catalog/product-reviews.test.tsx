import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ProductReviews as ProductReviewsData } from '@maos-em-oracao/contracts';
import { seedCatalog } from '@/lib/demo/seed';
import { ProductReviews } from './product-reviews';
import { ProductCard } from './product-card';

const h = vi.hoisted(() => ({ useProductReviews: vi.fn() }));
vi.mock('@/lib/api/query', () => ({ useProductReviews: h.useProductReviews }));
vi.mock('@/lib/media/use-asset', () => ({ useAssetUrl: (s?: string) => s }));

const review = (id: string, rating: number, extra = {}) => ({
  id,
  rating,
  title: 'Linda',
  text: 'Ficou linda na sala.',
  author: 'Ana P.',
  createdAt: '2026-10-05T12:00:00.000Z',
  variant: 'Madeira · Médio',
  photos: [],
  reply: null,
  repliedAt: null,
  ...extra,
});
const DATA: ProductReviewsData = {
  summary: { average: 4.7, count: 3, histogram: [0, 0, 0, 1, 2] },
  reviews: [
    review('r1', 5, { reply: 'Obrigado pelo carinho!', repliedAt: '2026-10-06T12:00:00.000Z' }),
    review('r2', 5, { photos: [{ url: '/api/media/public/x.jpg' }] }),
    review('r3', 4),
  ],
};

describe('ProductReviews', () => {
  beforeEach(() => {
    h.useProductReviews.mockReset().mockReturnValue({ data: DATA, isPending: false });
  });

  it('shows average, count and the store reply', () => {
    render(<ProductReviews productId="p1" />);
    expect(screen.getByRole('heading', { name: 'Avaliações' })).toBeInTheDocument();
    expect(screen.getByText('4,7')).toBeInTheDocument();
    expect(screen.getByText('3 avaliações')).toBeInTheDocument();
    expect(screen.getByText('Resposta da loja')).toBeInTheDocument();
    expect(screen.getByText('Obrigado pelo carinho!')).toBeInTheDocument();
  });

  it('filters by rating when a histogram bar is clicked', async () => {
    const user = userEvent.setup();
    render(<ProductReviews productId="p1" />);
    expect(h.useProductReviews).toHaveBeenLastCalledWith('p1', undefined);
    await user.click(screen.getByRole('button', { name: 'Só 5 estrelas' }));
    expect(h.useProductReviews).toHaveBeenLastCalledWith('p1', 5);
    await user.click(screen.getByRole('button', { name: 'Todas' }));
    expect(h.useProductReviews).toHaveBeenLastCalledWith('p1', undefined);
  });

  it('opens a photo in a modal', async () => {
    const user = userEvent.setup();
    render(<ProductReviews productId="p1" />);
    await user.click(screen.getByRole('button', { name: 'Ampliar foto de Ana P.' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('shows a message when the star filter has no matches', async () => {
    const user = userEvent.setup();
    render(<ProductReviews productId="p1" />);
    h.useProductReviews.mockReturnValue({
      data: { summary: DATA.summary, reviews: [] },
      isPending: false,
    });
    await user.click(screen.getByRole('button', { name: 'Só 2 estrelas' }));
    expect(screen.getByText('Nenhuma avaliação com essa nota.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Todas' })).toBeInTheDocument();
  });

  it('shows a quiet error line when loading fails', () => {
    h.useProductReviews.mockReturnValue({ data: undefined, isPending: false, isError: true });
    render(<ProductReviews productId="p1" />);
    expect(screen.getByText('Não foi possível carregar as avaliações agora.')).toBeInTheDocument();
  });

  it('shows the empty state', () => {
    h.useProductReviews.mockReturnValue({
      data: { summary: { average: 0, count: 0, histogram: [0, 0, 0, 0, 0] }, reviews: [] },
      isPending: false,
    });
    render(<ProductReviews productId="p1" />);
    expect(screen.getByText('Ainda não há avaliações desta peça.')).toBeInTheDocument();
  });
});

describe('ProductCard rating', () => {
  const base = seedCatalog[0];
  it('renders no rating without data', () => {
    render(<ProductCard product={{ ...base, rating: undefined }} />);
    expect(screen.queryByRole('img', { name: /Nota/ })).not.toBeInTheDocument();
  });
  it('renders stars when rated', () => {
    render(<ProductCard product={{ ...base, rating: { average: 4.5, count: 12 } }} />);
    expect(screen.getByRole('img', { name: 'Nota 4,5 de 5 (12 avaliações)' })).toBeInTheDocument();
  });
});

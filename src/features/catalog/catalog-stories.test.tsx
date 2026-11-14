import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { StoryHighlightPublic } from '@maos-em-oracao/contracts';
import { seedCatalog } from '@/lib/demo/seed';
import { ProductDetail } from './product-detail';
import { CatalogView } from './catalog-view';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/lib/api/query', () => ({
  useCatalog: (initial: unknown) => ({ data: initial }),
  useGateway: () => ({ shipping: vi.fn(), storyEvent: vi.fn(async () => {}) }),
  useProductReviews: () => ({ data: undefined, isPending: true }),
}));
vi.mock('@/lib/media/use-asset', () => ({ useAssetUrl: (s?: string) => s }));
vi.mock('./product-grid', () => ({ ProductGrid: () => null }));
vi.mock('./product-reviews', () => ({ ProductReviews: () => null }));
vi.mock('./product-media', () => ({ ProductGallery: () => null }));

const [first, second] = seedCatalog.filter((p) => !p.kit);
const story: StoryHighlightPublic = {
  id: 'destaque-demo',
  title: 'Bastidores',
  coverUrl: '/assets/stories/bastidores.webp',
  placements: ['home', 'product', 'category'],
  categories: ['Presentes'],
  videos: [
    {
      id: 'video-demo-1',
      caption: 'Da impressora para a sua casa',
      source: { type: 'file', src: '/assets/stories/oficina-1.mp4' },
      products: [
        { id: first.id, name: first.name, priceCents: first.priceCents, image: first.image },
      ],
    },
  ],
};

describe('stories nas páginas', () => {
  it('produto com vídeo mostra "Veja em vídeo"', () => {
    render(<ProductDetail initialProduct={first} initialCatalog={[first]} stories={[story]} />);
    expect(screen.getByRole('region', { name: 'Veja em vídeo' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Abrir destaque Bastidores' })).toBeInTheDocument();
  });

  it('produto sem vídeo não mostra a seção', () => {
    render(<ProductDetail initialProduct={second} initialCatalog={[second]} stories={[story]} />);
    expect(screen.queryByRole('region', { name: 'Veja em vídeo' })).toBeNull();
  });

  it('categoria com destaque mostra a fileira', () => {
    render(
      <CatalogView
        initialProducts={seedCatalog}
        query={{ category: 'Presentes' }}
        stories={[story]}
      />,
    );
    expect(screen.getByRole('region', { name: 'Destaques em vídeo' })).toBeInTheDocument();
  });

  it('sem categoria ou em outra categoria, não mostra', () => {
    const { rerender } = render(
      <CatalogView initialProducts={seedCatalog} query={{}} stories={[story]} />,
    );
    expect(screen.queryByRole('region', { name: 'Destaques em vídeo' })).toBeNull();
    rerender(
      <CatalogView
        initialProducts={seedCatalog}
        query={{ category: 'Católicos' }}
        stories={[story]}
      />,
    );
    expect(screen.queryByRole('region', { name: 'Destaques em vídeo' })).toBeNull();
  });
});

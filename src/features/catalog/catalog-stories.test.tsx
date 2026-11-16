import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import type {
  StoriesFeed,
  StoryHighlightPublic,
  StoryVideoPublic,
} from '@maos-em-oracao/contracts';
import { seedCatalog } from '@/lib/demo/seed';
import { ProductDetail } from './product-detail';
import { CatalogView } from './catalog-view';
import { Home } from './home';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('next/image', () => ({ default: () => null }));
vi.mock('@/lib/api/query', () => ({
  useCatalog: (initial: unknown) => ({ data: initial }),
  useGateway: () => ({ shipping: vi.fn(), storyEvents: vi.fn(async () => {}) }),
  useProductReviews: () => ({ data: undefined, isPending: true }),
}));
vi.mock('@/lib/media/use-asset', () => ({ useAssetUrl: (s?: string) => s }));
vi.mock('./product-grid', () => ({ ProductGrid: () => null }));
vi.mock('./product-reviews', () => ({ ProductReviews: () => null }));
vi.mock('./product-media', () => ({ ProductGallery: () => null }));
vi.mock('@/features/club/home-club-banner', () => ({ HomeClubBanner: () => null }));
vi.mock('@/features/group-buys/home-group-buys', () => ({ HomeGroupBuys: () => null }));

const [first, second] = seedCatalog.filter((p) => !p.kit);
const video: StoryVideoPublic = {
  id: 'video-demo-1',
  caption: 'Da impressora para a sua casa',
  source: { type: 'file', src: '/assets/stories/oficina-1.mp4' },
  products: [{ id: first.id, name: first.name, priceCents: first.priceCents, image: first.image }],
};
const bubbles: StoryHighlightPublic = {
  id: 'destaque-demo',
  title: 'Bastidores',
  coverUrl: '/assets/stories/bastidores.webp',
  format: 'stories',
  placements: ['home_top', 'category'],
  categories: ['Presentes'],
  videos: [video],
};
const carousel: StoryHighlightPublic = {
  ...bubbles,
  id: 'carrossel-demo',
  title: 'Na oficina',
  format: 'carousel',
  placements: ['home_middle', 'category'],
};
const feed = (overrides: Partial<StoriesFeed['productPage']> = {}): StoriesFeed => ({
  collections: [bubbles, carousel],
  productPage: {
    enabled: true,
    position: 'left',
    videos: [video],
    byProduct: { [first.id]: [video.id] },
    ...overrides,
  },
});

describe('vídeos nas páginas', () => {
  beforeEach(() => sessionStorage.clear());

  it('produto com vídeo mostra a bolinha flutuante, sem a antiga seção', () => {
    const { container } = render(
      <ProductDetail initialProduct={first} initialCatalog={[first]} feed={feed()} />,
    );
    expect(screen.getByRole('button', { name: `Ver vídeos de ${first.name}` })).toBeInTheDocument();
    expect(container.querySelector('.product-video-bubble')).toHaveClass('left');
    expect(screen.queryByRole('region', { name: 'Veja em vídeo' })).toBeNull();
  });

  it('produto sem vídeo, ou com a bolinha desligada, não mostra a bolinha', () => {
    const { rerender } = render(
      <ProductDetail initialProduct={second} initialCatalog={[second]} feed={feed()} />,
    );
    expect(screen.queryByRole('button', { name: /Ver vídeos de/ })).toBeNull();
    rerender(
      <ProductDetail
        initialProduct={first}
        initialCatalog={[first]}
        feed={feed({ enabled: false })}
      />,
    );
    expect(screen.queryByRole('button', { name: /Ver vídeos de/ })).toBeNull();
  });

  it('categoria mostra as bolinhas e o carrossel daquela categoria', () => {
    render(
      <CatalogView initialProducts={seedCatalog} query={{ category: 'Presentes' }} feed={feed()} />,
    );
    expect(screen.getByRole('region', { name: 'Destaques em vídeo' })).toBeInTheDocument();
    const row = screen.getByRole('region', { name: 'Na oficina' });
    expect(within(row).getByRole('button', { name: /Assistir/ })).toBeInTheDocument();
  });

  it('sem categoria ou em outra categoria, não mostra', () => {
    const { rerender } = render(
      <CatalogView initialProducts={seedCatalog} query={{}} feed={feed()} />,
    );
    expect(screen.queryByRole('region', { name: 'Destaques em vídeo' })).toBeNull();
    rerender(
      <CatalogView initialProducts={seedCatalog} query={{ category: 'Católicos' }} feed={feed()} />,
    );
    expect(screen.queryByRole('region', { name: 'Destaques em vídeo' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Na oficina' })).toBeNull();
  });

  it('a home desenha cada coleção no seu lugar', () => {
    const { container } = render(
      <Home products={seedCatalog} settings={{} as never} feed={feed()} />,
    );
    const slots = [...container.querySelectorAll('.story-slot')];
    expect(slots.map((slot) => slot.getAttribute('data-place'))).toEqual([
      'home_top',
      'home_middle',
    ]);
    expect(
      within(slots[0] as HTMLElement).getByRole('button', { name: 'Abrir destaque Bastidores' }),
    ).toBeInTheDocument();
    expect(
      within(slots[1] as HTMLElement).getByRole('region', { name: 'Na oficina' }),
    ).toBeInTheDocument();
    // home_top comes before the hero, home_middle after the collections.
    const hero = container.querySelector('.faith-hero')!,
      collections = container.querySelector('.faith-collections')!;
    expect(slots[0].compareDocumentPosition(hero) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(
      collections.compareDocumentPosition(slots[1]) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});

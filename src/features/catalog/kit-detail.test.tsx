import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { seedCatalog } from '@/lib/demo/seed';
import { useCartStore } from '@/lib/store/cart';
import { ProductCard } from './product-card';
import { ProductDetail } from './product-detail';

const h = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: h.push }) }));
vi.mock('@/lib/api/query', () => ({
  useCatalog: (initial: unknown) => ({ data: initial }),
  useGateway: () => ({ shipping: vi.fn() }),
  useProductReviews: () => ({ data: undefined, isPending: true }),
}));
vi.mock('@/lib/media/use-asset', () => ({ useAssetUrl: (s?: string) => s }));
vi.mock('./product-grid', () => ({ ProductGrid: () => null }));
vi.mock('./product-reviews', () => ({ ProductReviews: () => null }));
vi.mock('./product-media', () => ({ ProductGallery: () => null }));

const kit = seedCatalog.find((p) => p.id === 'kit-oracao-familia')!;
const plain = (value: string) => value.replace(/\u00a0/g, ' ');

describe('kit na vitrine', () => {
  beforeEach(() => {
    useCartStore.setState({ items: [] });
  });

  it('card mostra o resumo do kit com a economia', () => {
    const { container } = render(<ProductCard product={kit} />);
    expect(plain(container.textContent ?? '')).toContain('Kit com 3 peças · economize R$ 49,80');
    expect(container.querySelector('.swatches')).toBeNull();
  });

  it('página do kit não tem tamanho nem cor e mostra o preço avulso riscado', () => {
    const { container } = render(<ProductDetail initialProduct={kit} initialCatalog={[kit]} />);
    expect(screen.queryByLabelText('Tamanho')).toBeNull();
    expect(screen.queryByText(/^Cor:/)).toBeNull();
    expect(plain(container.querySelector('.detail-price')?.textContent ?? '')).toContain(
      'De R$ 219,70 por R$ 169,90',
    );
  });

  it('lista "O que vem no kit" com link para cada componente', () => {
    render(<ProductDetail initialProduct={kit} initialCatalog={[kit]} />);
    const section = screen.getByRole('region', { name: 'O que vem no kit' });
    const links = within(section).getAllByRole('link');
    expect(links).toHaveLength(kit.kitSummary!.items.length);
    expect(links).toHaveLength(3);
    kit.kitSummary!.items.forEach((item, i) => {
      expect(links[i]).toHaveAttribute('href', '/produto/' + item.productId);
      expect(
        within(section).getAllByText(new RegExp(`${item.quantity}× ${item.name}`)).length,
      ).toBeGreaterThan(0);
    });
  });

  it('adicionar ao carrinho coloca a linha do kit', async () => {
    const user = userEvent.setup();
    render(<ProductDetail initialProduct={kit} initialCatalog={[kit]} />);
    await user.click(screen.getByRole('button', { name: /Adicionar ao carrinho/ }));
    const items = useCartStore.getState().items;
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ productId: kit.id, color: 'Padrão', sizeIndex: 0 });
  });
});

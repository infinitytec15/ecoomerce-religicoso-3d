import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { seedCatalog } from '@/lib/demo/seed';
import { ProductCard } from './product-card';

vi.mock('@/lib/media/use-asset', () => ({ useAssetUrl: (s?: string) => s }));

const plain = (value: string) => value.replace(/\u00a0/g, ' ');
const plainProduct = seedCatalog.find((p) => !p.kit && !p.groupBuy)!;

describe('ProductCard', () => {
  it('mostra o selo de compra coletiva com o preço do grupo', () => {
    const { container } = render(
      <ProductCard
        product={{
          ...plainProduct,
          groupBuy: {
            id: 'grupo-demo',
            title: 'Natal',
            mode: 'difference',
            sizeIndex: 0,
            size: '15 cm',
            groupPriceCents: 7990,
            normalPriceCents: 9990,
            goal: 10,
            participants: 7,
            remaining: 3,
            maxParticipants: null,
            perPersonLimit: 3,
            endsAt: new Date(Date.now() + 86_400_000).toISOString(),
            goalReached: false,
            status: 'Aberta',
            initials: [],
          },
        }}
      />,
    );
    expect(plain(container.textContent ?? '')).toContain('Compra coletiva · R$ 79,90');
  });

  it('não mostra o selo sem campanha', () => {
    const { container } = render(<ProductCard product={plainProduct} />);
    expect(container.textContent).not.toContain('Compra coletiva');
  });
});

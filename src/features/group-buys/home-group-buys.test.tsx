import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { GroupBuyPublic } from '@maos-em-oracao/contracts';
import { HomeGroupBuys } from './home-group-buys';

const campaign = (id: string): GroupBuyPublic => ({
  id,
  title: 'Campanha ' + id,
  mode: 'difference',
  sizeIndex: 0,
  size: '12 cm',
  groupPriceCents: 1800,
  normalPriceCents: 4990,
  goal: 20,
  participants: 0,
  remaining: 20,
  maxParticipants: 20,
  perPersonLimit: 2,
  endsAt: '2099-11-30T13:17:00.000Z',
  goalReached: false,
  status: 'Aberta',
  initials: [],
  description: 'Descrição',
  productId: 'palavra-fe',
  productName: 'Palavra Fé',
  productImage: '/assets/products/palavra-fe.webp',
  colors: ['Terracota'],
});

describe('HomeGroupBuys', () => {
  it('mostra as campanhas abertas na página inicial com link para todas', () => {
    render(<HomeGroupBuys groupBuys={[campaign('a'), campaign('b')]} />);
    expect(screen.getByRole('region', { name: 'Compras coletivas abertas' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Campanha a' })).toHaveAttribute(
      'href',
      '/compra-coletiva/a',
    );
    expect(screen.getByRole('link', { name: /Ver todas as campanhas/ })).toHaveAttribute(
      'href',
      '/compra-coletiva',
    );
  });

  it('mostra no máximo três campanhas', () => {
    render(<HomeGroupBuys groupBuys={['a', 'b', 'c', 'd'].map(campaign)} />);
    expect(screen.queryByRole('link', { name: 'Campanha d' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Campanha c' })).toBeInTheDocument();
  });

  it('não ocupa espaço quando não há campanha aberta', () => {
    const { container } = render(<HomeGroupBuys groupBuys={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});

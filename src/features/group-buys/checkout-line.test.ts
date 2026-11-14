import { describe, it, expect } from 'vitest';
import type { GroupBuyPublic } from '@maos-em-oracao/contracts';
import { groupBuyCheckoutLine } from './checkout-line';

const gb: GroupBuyPublic = {
  id: 'grupo-demo',
  title: 'Natal',
  mode: 'difference',
  sizeIndex: 1,
  size: '20 cm',
  groupPriceCents: 7990,
  normalPriceCents: 9990,
  goal: 10,
  participants: 7,
  remaining: 3,
  maxParticipants: null,
  perPersonLimit: 3,
  endsAt: '2026-12-01T00:00:00.000Z',
  goalReached: false,
  status: 'Aberta',
  initials: [],
  description: '',
  productId: 'p1',
  productName: 'Sagrada Família',
  productImage: '/p1.jpg',
  colors: ['Marfim', 'Verde'],
};

describe('groupBuyCheckoutLine', () => {
  it('usa o produto, o tamanho e a cor da campanha', () => {
    expect(groupBuyCheckoutLine(gb, 'Verde', 2)).toMatchObject({
      productId: 'p1',
      sizeIndex: 1,
      size: '20 cm',
      color: 'Verde',
      quantity: 2,
      unitCents: 9990,
    });
  });
  it('corrige cor desconhecida e quantidade fora do limite', () => {
    expect(groupBuyCheckoutLine(gb, 'Roxo', 99)).toMatchObject({ color: 'Marfim', quantity: 3 });
    expect(groupBuyCheckoutLine(gb, 'Verde', NaN).quantity).toBe(1);
    expect(groupBuyCheckoutLine(gb, 'Verde', 0).quantity).toBe(1);
  });
  it('mostra o preço de grupo com a meta batida ou no modo hold', () => {
    expect(groupBuyCheckoutLine({ ...gb, goalReached: true }, '', 1).unitCents).toBe(7990);
    expect(groupBuyCheckoutLine({ ...gb, mode: 'hold' }, '', 1).unitCents).toBe(7990);
  });
});

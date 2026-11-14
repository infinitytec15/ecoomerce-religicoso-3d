import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { GroupBuySummary } from '@maos-em-oracao/contracts';
import { GroupBuyBlock } from './group-buy-block';

const now = new Date('2026-11-14T12:00:00Z');
const base: GroupBuySummary = {
  id: 'grupo-demo',
  title: 'Compra coletiva de Natal',
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
  endsAt: new Date(now.getTime() + 49 * 3_600_000).toISOString(),
  goalReached: false,
  status: 'Aberta',
  initials: ['AB', 'CD'],
};
const plain = (value: string) => value.replace(/\u00a0/g, ' ');
const view = (groupBuy: GroupBuySummary) =>
  render(
    <GroupBuyBlock
      groupBuy={groupBuy}
      href="/compra-coletiva/grupo-demo"
      shareUrl="https://loja.test/compra-coletiva/grupo-demo"
      now={now}
    />,
  );

describe('GroupBuyBlock', () => {
  it('mostra o andamento do grupo e o prazo', () => {
    view(base);
    expect(screen.getByText('7 de 10 · faltam 3 · termina em 2 dias')).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Compra coletiva' })).toBeVisible();
  });

  it('expõe a barra de progresso', () => {
    view(base);
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '7');
    expect(bar).toHaveAttribute('aria-valuemax', '10');
  });

  it('modo difference sem meta explica a devolução da diferença', () => {
    const { container } = view(base);
    const text = plain(container.textContent ?? '');
    expect(text).toContain('Pague R$ 99,90 agora e receba de volta R$ 20,00 por peça');
    expect(text).toContain('R$ 79,90 no grupo');
  });

  it('com a meta batida avisa e muda o texto do modo', () => {
    view({ ...base, goalReached: true, participants: 10, remaining: 0 });
    expect(screen.getByText('10 de 10 · meta batida! · termina em 2 dias')).toBeVisible();
    expect(screen.getByText('Meta batida: o preço de grupo já vale para você.')).toBeVisible();
  });

  it('modo hold informa a data e a devolução integral', () => {
    const { container } = view({ ...base, mode: 'hold' });
    expect(plain(container.textContent ?? '')).toMatch(
      /Pague R\$ 79,90\. Se o grupo não fechar até \d{2}\/\d{2}, devolvemos tudo\./,
    );
  });

  it('o botão leva ao href e mostra no máximo 8 iniciais', () => {
    view({ ...base, initials: Array.from({ length: 12 }, (_, i) => 'A' + i) });
    expect(screen.getByRole('link', { name: 'Entrar no grupo' })).toHaveAttribute(
      'href',
      '/compra-coletiva/grupo-demo',
    );
    expect(screen.getAllByRole('listitem')).toHaveLength(8);
  });
});

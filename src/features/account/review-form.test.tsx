import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '@/lib/api/contracts';
import { createSeed } from '@/lib/demo/seed';
import { ReviewForm } from './review-form';
import { AccountView } from './account-view';
import { uploadMedia } from '@/lib/media/upload';

const h = vi.hoisted(() => ({
  createReview: vi.fn(),
  account: { value: null as unknown },
  notify: vi.fn(),
}));
vi.mock('@/lib/api/query', () => ({
  useCommand: (action: (g: unknown, input: unknown) => Promise<unknown>) => ({
    mutateAsync: (input: unknown) => action({ createReview: h.createReview }, input),
  }),
  useAccount: () => ({ isPending: false, isError: false, data: h.account.value }),
}));
vi.mock('@/components/ui/feedback', () => ({ useNotify: () => h.notify }));
vi.mock('@/lib/media/upload', () => ({ uploadMedia: vi.fn() }));

const ITEM = { itemId: 'item-1', name: 'Sagrada Família' };

describe('ReviewForm', () => {
  beforeEach(() => {
    h.createReview.mockReset().mockResolvedValue({});
    h.notify.mockReset();
  });

  it('submits rating, text and empty extras to createReview', async () => {
    const user = userEvent.setup();
    const onDone = vi.fn();
    render(<ReviewForm item={ITEM} onDone={onDone} />);
    await user.click(screen.getByRole('radio', { name: '5 estrelas' }));
    await user.type(screen.getByLabelText('Conte como ficou a peça'), 'Ficou lindíssima na sala.');
    await user.click(screen.getByRole('button', { name: 'Enviar avaliação' }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(h.createReview).toHaveBeenCalledWith(
      {
        orderItemId: 'item-1',
        rating: 5,
        text: 'Ficou lindíssima na sala.',
        title: '',
        photoIds: [],
      },
      expect.any(String),
    );
    expect(h.notify).toHaveBeenCalledWith('Obrigado! Sua avaliação foi enviada.');
  });

  it('blocks a text shorter than 10 characters with an alert', async () => {
    const user = userEvent.setup();
    render(<ReviewForm item={ITEM} onDone={() => {}} />);
    await user.click(screen.getByRole('radio', { name: '4 estrelas' }));
    await user.type(screen.getByLabelText('Conte como ficou a peça'), 'curto');
    await user.click(screen.getByRole('button', { name: 'Enviar avaliação' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('pelo menos 10 caracteres');
    expect(h.createReview).not.toHaveBeenCalled();
  });

  it('uploads photos, sends their ids and disables "Adicionar foto" at 3', async () => {
    const ids = [1, 2, 3].map(() => crypto.randomUUID());
    ids.forEach((id) => vi.mocked(uploadMedia).mockResolvedValueOnce({ id } as never));
    const user = userEvent.setup();
    render(<ReviewForm item={ITEM} onDone={() => {}} />);
    const files = ['a', 'b', 'c'].map((n) => new File(['x'], n + '.jpg', { type: 'image/jpeg' }));
    await user.upload(screen.getByLabelText('Escolher fotos'), files);
    expect(await screen.findAllByText('Pronta')).toHaveLength(3);
    expect(screen.getByRole('button', { name: 'Adicionar foto' })).toBeDisabled();
    await user.click(screen.getByRole('radio', { name: '5 estrelas' }));
    await user.type(screen.getByLabelText('Conte como ficou a peça'), 'Ficou lindíssima na sala.');
    await user.click(screen.getByRole('button', { name: 'Enviar avaliação' }));
    await waitFor(() => expect(h.createReview).toHaveBeenCalled());
    expect(h.createReview.mock.calls[0][0].photoIds).toEqual(ids);
  });

  it('shows the pt-BR message for ALREADY_REVIEWED', async () => {
    h.createReview.mockRejectedValue(new ApiError('ALREADY_REVIEWED', 'x', 409));
    const user = userEvent.setup();
    render(<ReviewForm item={ITEM} onDone={() => {}} />);
    await user.click(screen.getByRole('radio', { name: '3 estrelas' }));
    await user.type(screen.getByLabelText('Conte como ficou a peça'), 'Texto com tamanho certo');
    await user.click(screen.getByRole('button', { name: 'Enviar avaliação' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Esta peça já foi avaliada.');
  });
});

function accountWith(
  status: string,
  reviews: { orderItemId: string; rating: number; status: string }[],
) {
  const seed = createSeed();
  const order = seed.orders[0];
  const orders = [
    {
      ...order,
      status,
      items: order.items.map((item, i) => ({ ...item, itemId: `it-${i}` })),
    },
  ];
  return { ...seed, orders, reviews, charges: [], tickets: [], subscriptions: [] };
}

describe('AccountView order detail reviews', () => {
  it('offers "Avaliar peça" for a delivered item without review', () => {
    const data = accountWith('Entregue', []);
    h.account.value = data;
    render(<AccountView tab="pedido" id={data.orders[0].id} />);
    expect(screen.getAllByRole('button', { name: 'Avaliar peça' }).length).toBeGreaterThan(0);
  });

  it('shows the review state instead of the button', () => {
    const data = accountWith('Entregue', [{ orderItemId: 'it-0', rating: 5, status: 'Oculto' }]);
    h.account.value = data;
    render(<AccountView tab="pedido" id={data.orders[0].id} />);
    expect(screen.getByText('Avaliação em análise')).toBeInTheDocument();
  });

  it('shows "Avaliação publicada" for published reviews', () => {
    const data = accountWith('Entregue', [{ orderItemId: 'it-0', rating: 5, status: 'Publicado' }]);
    h.account.value = data;
    render(<AccountView tab="pedido" id={data.orders[0].id} />);
    expect(screen.getByText('Avaliação publicada')).toBeInTheDocument();
  });

  it('shows no review control for orders that are not delivered', () => {
    const data = accountWith('Em produção', []);
    h.account.value = data;
    render(<AccountView tab="pedido" id={data.orders[0].id} />);
    expect(screen.queryByRole('button', { name: 'Avaliar peça' })).toBeNull();
  });
});

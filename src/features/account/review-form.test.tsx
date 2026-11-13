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

  async function fill(
    user: ReturnType<typeof userEvent.setup>,
    text = 'Ficou lindíssima na sala.',
  ) {
    await user.click(screen.getByRole('radio', { name: '5 estrelas' }));
    await user.type(screen.getByLabelText('Conte como ficou a peça'), text);
  }
  const send = (user: ReturnType<typeof userEvent.setup>) =>
    user.click(screen.getByRole('button', { name: 'Enviar avaliação' }));
  const jpg = (n: string) => new File(['x'], n, { type: 'image/jpeg' });

  it('reuses the idempotency key on retry after a network error', async () => {
    h.createReview.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const user = userEvent.setup();
    render(<ReviewForm item={ITEM} onDone={() => {}} />);
    await fill(user);
    await send(user);
    await screen.findByRole('alert');
    await send(user);
    await waitFor(() => expect(h.createReview).toHaveBeenCalledTimes(2));
    expect(h.createReview.mock.calls[1][1]).toBe(h.createReview.mock.calls[0][1]);
  });

  it('rotates the key after a 4xx and an edited resubmit', async () => {
    h.createReview.mockRejectedValueOnce(new ApiError('INVALID_PHOTO', 'x', 422));
    const user = userEvent.setup();
    render(<ReviewForm item={ITEM} onDone={() => {}} />);
    await fill(user);
    await send(user);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível usar uma das fotos.',
    );
    await user.type(screen.getByLabelText('Conte como ficou a peça'), ' Obrigada!');
    await send(user);
    await waitFor(() => expect(h.createReview).toHaveBeenCalledTimes(2));
    expect(h.createReview.mock.calls[1][1]).not.toBe(h.createReview.mock.calls[0][1]);
  });

  it('disables submit while an upload is in flight', async () => {
    let finish!: (v: unknown) => void;
    vi.mocked(uploadMedia).mockReturnValueOnce(new Promise((r) => (finish = r)) as never);
    const user = userEvent.setup();
    render(<ReviewForm item={ITEM} onDone={() => {}} />);
    await user.upload(screen.getByLabelText('Escolher fotos'), jpg('a.jpg'));
    expect(await screen.findByText('Enviando 0%')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enviar avaliação' })).toBeDisabled();
    finish({ id: crypto.randomUUID() });
    expect(await screen.findByText('Pronta')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enviar avaliação' })).toBeEnabled();
  });

  it('leaves removed photos out of photoIds', async () => {
    const keep = crypto.randomUUID();
    vi.mocked(uploadMedia)
      .mockResolvedValueOnce({ id: crypto.randomUUID() } as never)
      .mockResolvedValueOnce({ id: keep } as never);
    const user = userEvent.setup();
    render(<ReviewForm item={ITEM} onDone={() => {}} />);
    await user.upload(screen.getByLabelText('Escolher fotos'), [jpg('a.jpg'), jpg('b.jpg')]);
    await screen.findAllByText('Pronta');
    await user.click(screen.getByRole('button', { name: 'Remover foto a.jpg' }));
    await fill(user);
    await send(user);
    await waitFor(() => expect(h.createReview).toHaveBeenCalled());
    expect(h.createReview.mock.calls[0][0].photoIds).toEqual([keep]);
  });

  it('removing a photo while it uploads unblocks submit', async () => {
    vi.mocked(uploadMedia).mockReturnValueOnce(new Promise(() => {}) as never);
    const user = userEvent.setup();
    render(<ReviewForm item={ITEM} onDone={() => {}} />);
    await user.upload(screen.getByLabelText('Escolher fotos'), jpg('a.jpg'));
    await user.click(await screen.findByRole('button', { name: 'Remover foto a.jpg' }));
    expect(screen.getByRole('button', { name: 'Enviar avaliação' })).toBeEnabled();
  });

  it('shows upload errors in an alert and blocks submit until the photo is removed', async () => {
    vi.mocked(uploadMedia).mockRejectedValueOnce(new Error('Envie uma foto de até 8 MB.'));
    const user = userEvent.setup();
    render(<ReviewForm item={ITEM} onDone={() => {}} />);
    await user.upload(screen.getByLabelText('Escolher fotos'), jpg('a.jpg'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Envie uma foto de até 8 MB.');
    await fill(user);
    await send(user);
    expect(
      await screen.findByText('Remova as fotos com problema antes de enviar.'),
    ).toBeInTheDocument();
    expect(h.createReview).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Remover foto a.jpg' }));
    await send(user);
    await waitFor(() => expect(h.createReview).toHaveBeenCalled());
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

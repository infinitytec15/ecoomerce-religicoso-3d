import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AdminGroupBuy } from '@maos-em-oracao/contracts';
import { GroupBuyManager } from './group-buy-manager';

const { run } = vi.hoisted(() => ({ run: vi.fn().mockResolvedValue(undefined) }));
vi.mock('./shared', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./shared')>()),
  useAdminAction: () => ({ run }),
}));
const adminData = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
vi.mock('./admin-frame', () => ({ useAdminData: () => adminData.value }));

const product = {
  id: 'p1',
  name: 'Terço de madeira',
  archived: false,
  sizes: ['20 cm', '30 cm'],
  priceCents: 10000,
  costCents: 4000,
  costBreakdown: undefined,
  costBySize: undefined,
  sizePrices: undefined,
};
const group: AdminGroupBuy = {
  id: '11111111-1111-4111-8111-111111111111',
  title: 'Terço em grupo',
  description: '',
  mode: 'difference',
  productId: 'p1',
  productName: 'Terço de madeira',
  productImage: '',
  colors: [],
  sizeIndex: 0,
  size: '20 cm',
  groupPriceCents: 8000,
  normalPriceCents: 10000,
  goal: 10,
  participants: 7,
  remaining: 3,
  maxParticipants: null,
  perPersonLimit: 2,
  endsAt: '2026-12-01T15:00:00.000Z',
  goalReached: false,
  status: 'Aberta',
  initials: [],
  active: true,
  startsAt: '2026-11-01T12:00:00.000Z',
  createdAt: '2026-11-01T12:00:00.000Z',
  costCents: 4000,
  locked: true,
  refundedCents: 4000,
  orders: [
    {
      orderId: 'o1',
      number: 'MEO-000123',
      customerName: 'Maria Souza',
      email: 'maria@example.com',
      quantity: 2,
      paidUnitCents: 10000,
      status: 'Aguardando grupo',
      paymentStatus: 'Pago',
      refund: { amountCents: 4000, status: 'aprovado' },
      createdAt: '2026-11-02T12:00:00.000Z',
    },
  ],
};

describe('group buy manager', () => {
  beforeEach(() => {
    run.mockClear();
    adminData.value = { groupBuys: [group], products: [product], workspace: {} };
  });

  it('lists the campaign with progress and mode label', () => {
    render(<GroupBuyManager />);
    expect(screen.getByText('7/10')).toBeInTheDocument();
    expect(screen.getByText('Devolve a diferença')).toBeInTheDocument();
    expect(screen.getByText('Terço de madeira · 20 cm')).toBeInTheDocument();
  });

  it('locks price and the note explains why', async () => {
    const user = userEvent.setup();
    render(<GroupBuyManager />);
    await user.click(screen.getByRole('button', { name: 'Editar Terço em grupo' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText('Preço de grupo (R$)')).toBeDisabled();
    expect(within(dialog).getByLabelText('Título')).toBeEnabled();
    expect(
      within(dialog).getByText(
        'Já há pedidos nesta campanha: produto, tamanho, preço, meta, modo e datas não mudam mais.',
      ),
    ).toBeInTheDocument();
  });

  it('warns when the group price is below cost', async () => {
    adminData.value = {
      groupBuys: [{ ...group, locked: false }],
      products: [product],
      workspace: {},
    };
    const user = userEvent.setup();
    render(<GroupBuyManager />);
    await user.click(screen.getByRole('button', { name: 'Editar Terço em grupo' }));
    const dialog = await screen.findByRole('dialog');
    const price = within(dialog).getByLabelText('Preço de grupo (R$)');
    await user.clear(price);
    await user.type(price, '10,00');
    expect(within(dialog).getByText(/Preço de grupo abaixo do custo/)).toBeInTheDocument();
  });

  it('closes the campaign after confirmation', async () => {
    const user = userEvent.setup();
    render(<GroupBuyManager />);
    await user.click(screen.getByRole('button', { name: 'Encerrar Terço em grupo agora' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/Encerrar agora\? Sem a meta/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Encerrar agora' }));
    await waitFor(() => expect(run).toHaveBeenCalledTimes(1));
    expect(run.mock.calls[0][0]).toEqual({ type: 'groupbuy.close', id: group.id });
  });

  it('shows participants with their refund', async () => {
    const user = userEvent.setup();
    render(<GroupBuyManager />);
    await user.click(screen.getByRole('button', { name: 'Participantes de Terço em grupo' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('MEO-000123')).toBeInTheDocument();
    expect(within(dialog).getByText('R$ 40,00 · aprovado')).toBeInTheDocument();
  });

  it('extends the deadline', async () => {
    const user = userEvent.setup();
    render(<GroupBuyManager />);
    await user.click(screen.getByRole('button', { name: 'Prorrogar Terço em grupo' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Prorrogar' }));
    await waitFor(() => expect(run).toHaveBeenCalledTimes(1));
    expect(run.mock.calls[0][0]).toMatchObject({ type: 'groupbuy.extend', id: group.id });
  });
});

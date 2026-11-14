import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AdminMarketingCampaign } from '@maos-em-oracao/contracts';
import { CrmManager } from './crm-manager';
import { reaisToCents } from './segment-builder';

const { run, crmPreview } = vi.hoisted(() => ({
  run: vi.fn().mockResolvedValue(undefined),
  crmPreview: vi.fn(),
}));
vi.mock('../shared', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../shared')>()),
  useAdminAction: () => ({ run }),
}));
const adminData = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
vi.mock('../admin-frame', () => ({ useAdminData: () => adminData.value }));
vi.mock('@/lib/api/query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/query')>()),
  useGateway: () => ({ crmPreview }),
}));
vi.mock('@/lib/media/upload', () => ({ uploadMedia: vi.fn() }));
vi.mock('@/lib/media/assets', () => ({ saveAsset: vi.fn() }));
vi.mock('@/lib/media/use-asset', () => ({ useAssetUrl: (source?: string) => source }));
vi.mock('@/lib/api/config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/config')>()),
  IS_DEMO: false,
}));

const metrics = {
  audience: 8,
  sent: 8,
  delivered: 8,
  opened: 1,
  clicked: 2,
  bounced: 0,
  unsubscribed: 1,
  cancelled: 0,
};
const zero = { ...metrics, audience: 0, sent: 0, delivered: 0, opened: 0, clicked: 0 };
const campaign = (over: Partial<AdminMarketingCampaign>): AdminMarketingCampaign => ({
  id: 'c1',
  name: 'Novidades de novembro',
  subject: 'Chegaram peças novas',
  previewText: '',
  segment: { rules: [] },
  blocks: [{ type: 'text', style: 'paragraph', text: 'Olá' }],
  state: 'Rascunho',
  createdAt: '2026-11-10T12:00:00.000Z',
  metrics: zero,
  ...over,
});
const textBlock = (n: number) => ({
  type: 'text' as const,
  style: 'paragraph' as const,
  text: `T${n}`,
});

function setup(campaigns: AdminMarketingCampaign[] = []) {
  adminData.value = {
    products: [{ id: 'p1', name: 'Terço', active: true, archived: false }],
    coupons: [{ id: 'k1', code: 'BEMVINDO', active: true }],
    crm: {
      settings: { hourlyLimit: 100, legitimateInterest: false },
      campaigns,
      tags: [{ tag: 'vip', count: 3 }],
      totals: { contacts: 10, eligible: 8, unsubscribed: 1 },
    },
  };
}

async function addBlock(user: ReturnType<typeof userEvent.setup>, type: string) {
  await user.selectOptions(screen.getByLabelText('Tipo do bloco'), type);
  await user.click(screen.getByRole('button', { name: 'Adicionar bloco' }));
}

describe('crm campaigns', () => {
  beforeEach(() => {
    run.mockClear();
    crmPreview.mockReset();
  });
  afterEach(() => {
    vi.useRealTimers();
    delete (globalThis as { jest?: unknown }).jest;
  });

  it('saves a new draft with the blocks in order', async () => {
    setup();
    const user = userEvent.setup();
    render(<CrmManager />);
    await user.click(screen.getByRole('button', { name: 'Nova campanha' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Nome da campanha'), 'Natal 2026');
    await user.type(within(dialog).getByLabelText('Assunto'), 'Presentes de Natal');
    await addBlock(user, 'Título');
    await addBlock(user, 'Texto');
    await user.type(within(dialog).getByLabelText('Texto do bloco 1'), 'Feliz Natal');
    await user.type(within(dialog).getByLabelText('Texto do bloco 2'), 'Veja as peças');
    await user.click(within(dialog).getByRole('button', { name: 'Salvar rascunho' }));
    await waitFor(() => expect(run).toHaveBeenCalledTimes(1));
    expect(run.mock.calls[0][0]).toEqual({
      type: 'crm.campaign.save',
      campaign: {
        name: 'Natal 2026',
        subject: 'Presentes de Natal',
        previewText: '',
        segment: { rules: [] },
        blocks: [
          { type: 'text', style: 'heading', text: 'Feliz Natal' },
          { type: 'text', style: 'paragraph', text: 'Veja as peças' },
        ],
      },
    });
  });

  it('moving a block up changes the order that is sent', async () => {
    setup();
    const user = userEvent.setup();
    render(<CrmManager />);
    await user.click(screen.getByRole('button', { name: 'Nova campanha' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Nome da campanha'), 'Natal 2026');
    await user.type(within(dialog).getByLabelText('Assunto'), 'Presentes de Natal');
    await addBlock(user, 'Título');
    await addBlock(user, 'Texto');
    await user.type(within(dialog).getByLabelText('Texto do bloco 1'), 'Primeiro');
    await user.type(within(dialog).getByLabelText('Texto do bloco 2'), 'Segundo');
    await user.click(within(dialog).getByRole('button', { name: 'Subir bloco 2' }));
    await user.click(within(dialog).getByRole('button', { name: 'Salvar rascunho' }));
    await waitFor(() => expect(run).toHaveBeenCalledTimes(1));
    const sent = run.mock.calls[0][0].campaign.blocks;
    expect(sent.map((b: { text: string }) => b.text)).toEqual(['Segundo', 'Primeiro']);
  });

  it('previews the audience once, 400 ms after the last change', async () => {
    setup();
    crmPreview.mockResolvedValue({ total: 5, consent: 4, legitimateInterest: 1 });
    render(<CrmManager />);
    await userEvent.click(screen.getByRole('button', { name: 'Nova campanha' }));
    const dialog = await screen.findByRole('dialog');
    vi.useFakeTimers();
    // Testing Library only drains its async wrapper under fake timers when it sees a `jest` global.
    (globalThis as { jest?: unknown }).jest = { advanceTimersByTime: vi.advanceTimersByTime };
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime, delay: null });
    expect(within(dialog).getByText('Todos que podem receber')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Adicionar regra' }));
    await user.selectOptions(within(dialog).getByLabelText('Tipo da regra 1'), 'tag');
    await user.selectOptions(within(dialog).getByLabelText('Etiqueta da regra 1'), 'vip');
    expect(crmPreview).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    expect(crmPreview).toHaveBeenCalledTimes(1);
    expect(crmPreview).toHaveBeenCalledWith({ rules: [{ type: 'tag', tag: 'vip' }] });
    expect(
      within(dialog).getByText(/5 pessoas vão receber \(4 por aceite, 1 por legítimo interesse\)/),
    ).toBeInTheDocument();
    expect(within(dialog).getByText(/menos de 1 hora/)).toBeInTheDocument();
  });

  it('shows the summary and no editor while sending', async () => {
    setup([campaign({ state: 'Enviando', metrics })]);
    const user = userEvent.setup();
    render(<CrmManager />);
    await user.click(screen.getByRole('button', { name: 'Novidades de novembro' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('button', { name: 'Cancelar envio' })).toBeInTheDocument();
    expect(
      within(dialog).queryByRole('button', { name: 'Salvar rascunho' }),
    ).not.toBeInTheDocument();
    expect(within(dialog).queryByLabelText('Nome da campanha')).not.toBeInTheDocument();
  });

  it('shows the open rate of a sent campaign', async () => {
    setup([campaign({ state: 'Enviada', metrics: { ...metrics, opened: 1, delivered: 8 } })]);
    const user = userEvent.setup();
    render(<CrmManager />);
    await user.click(screen.getByRole('button', { name: 'Novidades de novembro' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('12,5%')).toBeInTheDocument();
    expect(
      within(dialog).queryByRole('button', { name: 'Cancelar envio' }),
    ).not.toBeInTheDocument();
  });

  it('disables "Adicionar bloco" at 20 blocks', async () => {
    setup([campaign({ blocks: Array.from({ length: 20 }, (_, i) => textBlock(i + 1)) })]);
    const user = userEvent.setup();
    render(<CrmManager />);
    await user.click(screen.getByRole('button', { name: 'Novidades de novembro' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('button', { name: 'Adicionar bloco' })).toBeDisabled();
  });
  it('keeps each rule value when an earlier rule is removed', async () => {
    setup();
    crmPreview.mockResolvedValue({ total: 2, consent: 2, legitimateInterest: 0 });
    const user = userEvent.setup();
    render(<CrmManager />);
    await user.click(screen.getByRole('button', { name: 'Nova campanha' }));
    const dialog = await screen.findByRole('dialog');
    for (const [n, value] of [
      [1, '10'],
      [2, '20'],
    ] as const) {
      await user.click(within(dialog).getByRole('button', { name: 'Adicionar regra' }));
      await user.selectOptions(within(dialog).getByLabelText(`Tipo da regra ${n}`), 'spentAbove');
      await user.type(within(dialog).getByLabelText(`Valor em reais da regra ${n}`), value);
    }
    await user.click(within(dialog).getByRole('button', { name: 'Remover regra 1' }));
    expect(within(dialog).getByLabelText('Valor em reais da regra 1')).toHaveValue('20');
    await waitFor(() => expect(crmPreview).toHaveBeenCalled());
    expect(crmPreview).toHaveBeenLastCalledWith({ rules: [{ type: 'spentAbove', cents: 2000 }] });
  });

  it('reads reais with comma or dot decimals', () => {
    expect(reaisToCents('10,50')).toBe(1050);
    expect(reaisToCents('10.50')).toBe(1050);
    expect(reaisToCents('1.050,00')).toBe(105000);
    expect(reaisToCents('1.050')).toBe(105000);
    expect(reaisToCents('1050')).toBe(105000);
    expect(reaisToCents('')).toBe(0);
  });

  it('sends now with at: null and repeats the count', async () => {
    setup([campaign({})]);
    crmPreview.mockResolvedValue({ total: 1, consent: 1, legitimateInterest: 0 });
    const user = userEvent.setup();
    render(<CrmManager />);
    await user.click(screen.getByRole('button', { name: 'Novidades de novembro' }));
    await screen.findByRole('dialog');
    await user.click(screen.getByRole('button', { name: 'Agendar' }));
    expect(await screen.findByText(/1 pessoa vai receber/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Confirmar envio' }));
    await waitFor(() => expect(run).toHaveBeenCalledTimes(1));
    expect(run.mock.calls[0][0]).toEqual({ type: 'crm.campaign.schedule', id: 'c1', at: null });
  });

  it('types the coupon code when the admin has no coupons', async () => {
    setup();
    delete (adminData.value as { coupons?: unknown }).coupons;
    const user = userEvent.setup();
    render(<CrmManager />);
    await user.click(screen.getByRole('button', { name: 'Nova campanha' }));
    const dialog = await screen.findByRole('dialog');
    await addBlock(user, 'Cupom');
    await user.type(within(dialog).getByLabelText('Código do cupom do bloco 1'), 'natal10');
    expect(within(dialog).getByLabelText('Código do cupom do bloco 1')).toHaveValue('NATAL10');
  });

  it('keeps an inactive product in a block visible and removable', async () => {
    setup([campaign({ blocks: [{ type: 'products', productIds: ['gone'] }] })]);
    const user = userEvent.setup();
    render(<CrmManager />);
    await user.click(screen.getByRole('button', { name: 'Novidades de novembro' }));
    const dialog = await screen.findByRole('dialog');
    const box = within(dialog).getByLabelText('Produto removido (inativa)');
    expect(box).toBeChecked();
    await user.click(box);
    expect(box).not.toBeChecked();
  });
});

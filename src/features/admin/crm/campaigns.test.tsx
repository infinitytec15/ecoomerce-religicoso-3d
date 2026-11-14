import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AdminMarketingCampaign } from '@maos-em-oracao/contracts';
import { CrmManager } from './crm-manager';

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
});

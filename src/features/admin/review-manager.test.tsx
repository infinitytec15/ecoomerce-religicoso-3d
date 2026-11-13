import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { AdminReview } from '@maos-em-oracao/contracts';
import { defaultWorkspaceSettings } from '@/lib/domain/admin-types';
import { ReviewManager } from './review-manager';
import { WorkspaceSettingsPanel } from './workspace-settings';

const { run } = vi.hoisted(() => ({ run: vi.fn().mockResolvedValue(undefined) }));
vi.mock('./shared', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./shared')>()),
  useAdminAction: () => ({ run }),
}));
const review = (over: Partial<AdminReview>): AdminReview => ({
  id: 'rev-1',
  rating: 5,
  title: 'Linda peça',
  text: 'Chegou perfeita e muito bem embalada.',
  author: 'Maria S.',
  createdAt: '2026-11-01T12:00:00.000Z',
  variant: '20 cm · Marfim',
  photos: [],
  reply: null,
  repliedAt: null,
  status: 'Em análise',
  productId: 'p1',
  productName: 'Terço de madeira',
  orderId: 'o1',
  orderNumber: 'MO-1001',
  customerName: 'Maria Souza',
  customerEmail: 'maria@example.com',
  ...over,
});
const adminData = vi.hoisted(() => ({
  value: {} as Record<string, unknown>,
}));
vi.mock('./admin-frame', () => ({ useAdminData: () => adminData.value }));

describe('review moderation', () => {
  beforeEach(() => {
    run.mockClear();
    adminData.value = {
      reviews: [
        review({ id: 'rev-1' }),
        review({
          id: 'rev-2',
          status: 'Publicado',
          title: 'Chegou rápido',
          rating: 4,
          orderNumber: 'MO-1002',
        }),
      ],
    };
  });

  it('filters the list by status', async () => {
    const user = userEvent.setup();
    render(<ReviewManager />);
    expect(screen.getByText('Linda peça')).toBeInTheDocument();
    expect(screen.getByText('Chegou rápido')).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Filtrar por situação'), 'Em análise');
    expect(screen.getByText('Linda peça')).toBeInTheDocument();
    expect(screen.queryByText('Chegou rápido')).not.toBeInTheDocument();
  });

  it('publishes a review with a public reply', async () => {
    const user = userEvent.setup();
    render(<ReviewManager />);
    await user.click(screen.getAllByRole('button', { name: 'Revisar avaliação' })[0]);
    const dialog = await screen.findByRole('dialog');
    await user.selectOptions(within(dialog).getByLabelText('Status'), 'Publicado');
    await user.type(within(dialog).getByLabelText('Resposta pública da loja'), 'Obrigado!');
    await user.click(within(dialog).getByRole('button', { name: 'Salvar moderação' }));
    await waitFor(() => expect(run).toHaveBeenCalledTimes(1));
    expect(run.mock.calls[0][0]).toEqual({
      type: 'review.moderate',
      id: 'rev-1',
      status: 'Publicado',
      reply: 'Obrigado!',
    });
  });
});

describe('review settings', () => {
  beforeEach(() => {
    run.mockClear();
    adminData.value = {
      workspace: { ...defaultWorkspaceSettings },
      settings: {
        storeName: 'Mãos em Oração',
        email: 'contato@example.com',
        phone: '11999999999',
        clubName: 'Clube',
        priceCents: 9900,
        dispatchDay: 5,
        lowStock: 3,
      },
    };
  });

  it('saves the review request and auto-publish settings into the workspace', async () => {
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <WorkspaceSettingsPanel />
      </QueryClientProvider>,
    );
    await user.click(screen.getByRole('button', { name: 'Comunidade e oração' }));
    await user.click(screen.getByLabelText('Pedir avaliação por e-mail após a entrega'));
    const days = screen.getByLabelText('Dias após a entrega');
    await user.clear(days);
    await user.type(days, '10');
    await user.selectOptions(screen.getByLabelText(/Publicar automaticamente/), 'Notas 4 ou mais');
    expect(
      screen.getByText('Avaliações com fotos sempre passam pela sua aprovação.'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Salvar configurações' }));
    await waitFor(() => expect(run).toHaveBeenCalled());
    const call = run.mock.calls[0][0];
    expect(call.type).toBe('workspace.save');
    expect(call.settings.reviews).toEqual({
      requestEnabled: false,
      requestDelayDays: 10,
      autoPublishMinRating: 4,
    });
    expect(call.settings.legalName).toBe(defaultWorkspaceSettings.legalName);
  });
});

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { MARKETING_CONSENT_TEXT } from '@maos-em-oracao/contracts';
import { ApiError } from '@/lib/api/contracts';
import { AccountView } from './account-view';

const h = vi.hoisted(() => ({
  gateway: { marketingStatus: vi.fn(), setMarketing: vi.fn() },
  data: {
    customer: { name: 'Ana', email: 'ana@example.com' },
    orders: [],
    subscriptions: [],
    charges: [],
  },
}));
// Like the real useCommand, a successful command invalidates every query.
vi.mock('@/lib/api/query', () => ({
  useGateway: () => h.gateway,
  useAccount: () => ({ isPending: false, isError: false, data: h.data }),
  useCommand: <I, R>(action: (g: typeof h.gateway, input: I) => Promise<R>) => {
    const client = useQueryClient();
    return {
      mutateAsync: async (input: I) => {
        const result = await action(h.gateway, input);
        await client.invalidateQueries();
        return result;
      },
      isPending: false,
    };
  },
}));
vi.mock('@/components/ui/feedback', () => ({ useNotify: () => vi.fn() }));

const view = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <AccountView tab="dados" />
    </QueryClientProvider>,
  );

describe('E-mails de novidades na conta', () => {
  it('liga e desliga o interruptor pelo gateway e mostra a mensagem', async () => {
    h.gateway.marketingStatus.mockResolvedValue({ subscribed: true, text: '', version: 'v' });
    h.gateway.setMarketing.mockImplementation(async (subscribed: boolean) => {
      h.gateway.marketingStatus.mockResolvedValue({ subscribed, text: '', version: 'v' });
    });
    render(
      <QueryClientProvider client={new QueryClient()}>
        <AccountView tab="dados" />
      </QueryClientProvider>,
    );
    const toggle = await screen.findByRole('switch', { name: 'E-mails de novidades' });
    await vi.waitFor(() => expect(toggle).toBeChecked());
    await userEvent.click(toggle);
    expect(h.gateway.setMarketing).toHaveBeenCalledWith(false);
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Pronto. Você não vai mais receber nossas novidades.',
    );
    await userEvent.click(toggle);
    expect(h.gateway.setMarketing).toHaveBeenLastCalledWith(true);
    await vi.waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(MARKETING_CONSENT_TEXT),
    );
  });

  it('mostra o aviso de e-mail não confirmado quando o servidor recusa a volta', async () => {
    h.gateway.marketingStatus.mockResolvedValue({ subscribed: false, text: '', version: 'v' });
    h.gateway.setMarketing.mockRejectedValue(
      new ApiError(
        'EMAIL_NOT_VERIFIED',
        'Confirme seu e-mail para voltar a receber novidades.',
        422,
      ),
    );
    view();
    const toggle = await screen.findByRole('switch', { name: 'E-mails de novidades' });
    await vi.waitFor(() => expect(toggle).toBeEnabled());
    await userEvent.click(toggle);
    expect(h.gateway.setMarketing).toHaveBeenCalledWith(true);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Confirme seu e-mail para voltar a receber novidades.',
    );
    expect(toggle).not.toBeChecked();
    expect(toggle).toHaveTextContent('Desligado');
  });

  it('desativa o interruptor e avisa quando a preferência não carrega', async () => {
    h.gateway.marketingStatus.mockRejectedValueOnce(new Error('rede'));
    view();
    expect(
      await screen.findByText('Não foi possível carregar sua preferência. Tente novamente.'),
    ).toBeInTheDocument();
    const toggle = screen.getByRole('switch', { name: 'E-mails de novidades' });
    expect(toggle).toBeDisabled();
    expect(toggle).not.toHaveTextContent('Desligado');
    h.gateway.marketingStatus.mockResolvedValue({ subscribed: true, text: '', version: 'v' });
    await userEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    await vi.waitFor(() => expect(toggle).toBeChecked());
    expect(toggle).toBeEnabled();
  });
});

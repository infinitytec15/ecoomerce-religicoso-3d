import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { MARKETING_CONSENT_TEXT } from '@maos-em-oracao/contracts';
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
});

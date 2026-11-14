import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '@/lib/api/contracts';
import { MarketingUnsubscribe } from './marketing-unsubscribe';

const h = vi.hoisted(() => ({ marketingUnsubscribe: vi.fn() }));
vi.mock('@/lib/api/query', () => ({
  useCommand: <I, R>(action: (g: typeof h, input: I) => Promise<R>) => ({
    mutateAsync: (input: I) => action(h, input),
    isPending: false,
  }),
}));
const token = 'a'.repeat(32);

describe('MarketingUnsubscribe', () => {
  it('não descadastra só por abrir a página', () => {
    render(<MarketingUnsubscribe token={token} campaignId="c1" />);
    expect(screen.getByRole('button', { name: 'Confirmar descadastro' })).toBeVisible();
    expect(h.marketingUnsubscribe).not.toHaveBeenCalled();
  });

  it('descadastra no clique e confirma', async () => {
    h.marketingUnsubscribe.mockResolvedValue(undefined);
    render(<MarketingUnsubscribe token={token} campaignId="c1" />);
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar descadastro' }));
    expect(h.marketingUnsubscribe).toHaveBeenCalledWith({ token, campaignId: 'c1' });
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Você saiu da lista de novidades. Pedidos e avisos da sua conta continuam chegando normalmente.',
    );
  });

  it('sem campanha envia só o token', async () => {
    h.marketingUnsubscribe.mockResolvedValue(undefined);
    render(<MarketingUnsubscribe token={token} />);
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar descadastro' }));
    expect(h.marketingUnsubscribe).toHaveBeenCalledWith({ token });
  });

  it('INVALID_TOKEN mostra a mensagem e o link para a conta', async () => {
    h.marketingUnsubscribe.mockRejectedValue(
      new ApiError('INVALID_TOKEN', 'Este link expirou ou já foi usado.', 400),
    );
    render(<MarketingUnsubscribe token={token} />);
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar descadastro' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Este link expirou ou já foi usado.',
    );
    expect(screen.getByRole('link', { name: 'Ir para minha conta' })).toHaveAttribute(
      'href',
      '/conta',
    );
  });

  it('link sem token válido não oferece o botão', () => {
    render(<MarketingUnsubscribe token="" />);
    expect(screen.queryByRole('button', { name: 'Confirmar descadastro' })).toBeNull();
    expect(screen.getByRole('alert')).toBeVisible();
  });
});

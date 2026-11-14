import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MARKETING_CONSENT_TEXT } from '@maos-em-oracao/contracts';
import { AuthScreen } from './auth-screen';

const h = vi.hoisted(() => ({ login: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }) }));
vi.mock('next/image', () => ({ default: () => null }));
vi.mock('@/components/layout/dev-credit', () => ({ DevCredit: () => null }));
vi.mock('@/lib/api/query', () => ({
  useCommand: <I, R>(action: (g: { login: typeof h.login }, input: I) => Promise<R>) => ({
    mutateAsync: (input: I) => action({ login: h.login }, input),
    isPending: false,
  }),
}));

async function fillAndSubmit(user: ReturnType<typeof userEvent.setup>, submit: RegExp) {
  await user.type(screen.getByLabelText(/E-mail/), 'ana@example.com');
  await user.type(screen.getByLabelText(/Senha/), 'senha-bem-longa-123');
  await user.click(screen.getByRole('button', { name: submit }));
}

describe('AuthScreen', () => {
  it('mostra a caixa de novidades só no cadastro e repassa marketingOptIn', async () => {
    const user = userEvent.setup();
    h.login.mockResolvedValue(undefined);
    render(<AuthScreen />);
    expect(screen.queryByRole('checkbox', { name: MARKETING_CONSENT_TEXT })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Criar conta' }));
    const box = screen.getByRole('checkbox', { name: MARKETING_CONSENT_TEXT });
    expect(box).not.toBeChecked();
    expect(box).not.toBeRequired();
    await user.type(screen.getByLabelText(/Como podemos chamar/), 'Ana Souza');
    await user.click(box);
    await fillAndSubmit(user, /Criar minha conta/);
    await vi.waitFor(() => expect(h.login).toHaveBeenCalled());
    expect(h.login.mock.calls[0][0]).toMatchObject({ register: true, marketingOptIn: true });
  });

  it('cadastro com a caixa desmarcada envia marketingOptIn false', async () => {
    const user = userEvent.setup();
    h.login.mockResolvedValue(undefined);
    render(<AuthScreen />);
    await user.click(screen.getByRole('button', { name: 'Criar conta' }));
    await user.type(screen.getByLabelText(/Como podemos chamar/), 'Ana Souza');
    await fillAndSubmit(user, /Criar minha conta/);
    await vi.waitFor(() => expect(h.login).toHaveBeenCalled());
    expect(h.login.mock.calls[0][0].marketingOptIn).toBe(false);
  });

  it('no login não envia marketingOptIn', async () => {
    const user = userEvent.setup();
    h.login.mockResolvedValue(undefined);
    render(<AuthScreen />);
    await fillAndSubmit(user, /Entrar na minha conta/);
    await vi.waitFor(() => expect(h.login).toHaveBeenCalled());
    expect(h.login.mock.calls[0][0]).not.toHaveProperty('marketingOptIn');
  });
});

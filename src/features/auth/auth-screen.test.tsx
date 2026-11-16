import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MARKETING_CONSENT_TEXT, REGISTER_MESSAGE } from '@maos-em-oracao/contracts';
import { ApiError } from '@/lib/api/contracts';
import { AuthScreen, safeReturnTo } from './auth-screen';

const h = vi.hoisted(() => ({ login: vi.fn(), register: vi.fn(), replace: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: h.replace, refresh: vi.fn() }),
}));
vi.mock('next/image', () => ({ default: () => null }));
// The real store (not the demo), so the inbox guidance is shown.
vi.mock('@/lib/api/config', () => ({ IS_DEMO: false, DATA_MODE: 'http' }));
vi.mock('@/components/layout/dev-credit', () => ({ DevCredit: () => null }));
vi.mock('@/lib/api/query', () => ({
  useCommand: <I, R>(
    action: (g: { login: typeof h.login; register: typeof h.register }, input: I) => Promise<R>,
  ) => ({
    mutateAsync: (input: I) => action({ login: h.login, register: h.register }, input),
    isPending: false,
  }),
}));

beforeEach(() => {
  h.login.mockReset();
  h.register.mockReset();
  h.replace.mockReset();
});

async function openRegister(user: ReturnType<typeof userEvent.setup>) {
  render(<AuthScreen />);
  await user.click(screen.getByRole('button', { name: 'Criar conta' }));
  await user.type(screen.getByLabelText(/Como podemos chamar/), 'Ana Souza');
  await user.type(screen.getByLabelText(/E-mail/), 'ana@example.com');
}

describe('AuthScreen', () => {
  it('cadastro pede só nome e e-mail, envia o link e não entra na conta', async () => {
    const user = userEvent.setup();
    h.register.mockResolvedValue({ message: REGISTER_MESSAGE });
    await openRegister(user);
    expect(screen.queryByLabelText(/Senha/)).toBeNull();
    await user.click(screen.getByRole('button', { name: /Criar minha conta/ }));
    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent(REGISTER_MESSAGE);
    expect(status).toHaveTextContent(/caixa de spam/);
    expect(h.register).toHaveBeenCalledWith({
      name: 'Ana Souza',
      email: 'ana@example.com',
      marketingOptIn: false,
    });
    expect(h.login).not.toHaveBeenCalled();
    expect(h.replace).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /Criar minha conta/ })).toBeDisabled();
  });

  it('não pede consentimento de novidades no cadastro (ele vem no link do e-mail)', async () => {
    const user = userEvent.setup();
    h.register.mockResolvedValue({ message: REGISTER_MESSAGE });
    await openRegister(user);
    expect(screen.queryByRole('checkbox', { name: MARKETING_CONSENT_TEXT })).toBeNull();
    await user.click(screen.getByRole('button', { name: /Criar minha conta/ }));
    await vi.waitFor(() => expect(h.register).toHaveBeenCalled());
    expect(h.register.mock.calls[0][0]).toMatchObject({ marketingOptIn: false });
  });

  it('no login envia só e-mail, senha e tipo de acesso', async () => {
    const user = userEvent.setup();
    h.login.mockResolvedValue(undefined);
    render(<AuthScreen />);
    await user.type(screen.getByLabelText(/E-mail/), 'ana@example.com');
    await user.type(screen.getByLabelText(/Senha/), 'senha-bem-longa-123');
    await user.click(screen.getByRole('button', { name: /Entrar na minha conta/ }));
    await vi.waitFor(() => expect(h.login).toHaveBeenCalled());
    expect(h.login.mock.calls[0][0]).toEqual({
      email: 'ana@example.com',
      password: 'senha-bem-longa-123',
      kind: 'customer',
    });
    await vi.waitFor(() => expect(h.replace).toHaveBeenCalledWith('/conta'));
  });

  it('trata CONFIRM_EMAIL como aviso para abrir o e-mail, sem navegar', async () => {
    const user = userEvent.setup();
    h.login.mockRejectedValue(new ApiError('CONFIRM_EMAIL', REGISTER_MESSAGE, 409));
    render(<AuthScreen />);
    await user.type(screen.getByLabelText(/E-mail/), 'ana@example.com');
    await user.type(screen.getByLabelText(/Senha/), 'senha-bem-longa-123');
    await user.click(screen.getByRole('button', { name: /Entrar na minha conta/ }));
    expect(await screen.findByRole('status')).toHaveTextContent(REGISTER_MESSAGE);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(h.replace).not.toHaveBeenCalled();
  });

  it('depois do login volta ao link de troca de e-mail', () => {
    const link = '/conta/confirmar?purpose=email-change&token=abc';
    expect(safeReturnTo(link, 'customer')).toBe(link);
    expect(safeReturnTo('https://evil.example.com/conta', 'customer')).toBe('/conta');
  });

  it('mostra o erro do cadastro sem a mensagem de sucesso', async () => {
    const user = userEvent.setup();
    h.register.mockRejectedValue(new ApiError('RATE_LIMITED', 'Muitas tentativas.', 429));
    await openRegister(user);
    await user.click(screen.getByRole('button', { name: /Criar minha conta/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Muitas tentativas.');
    expect(screen.queryByRole('status')).toBeNull();
  });
});

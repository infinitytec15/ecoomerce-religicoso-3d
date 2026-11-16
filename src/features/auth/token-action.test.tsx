import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MARKETING_CONSENT_TEXT } from '@maos-em-oracao/contracts';
import { TokenAction } from './token-action';

vi.mock('@/components/layout/logo', () => ({ Logo: () => null }));

const token = 'token-de-confirmacao-com-tamanho-suficiente';
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
let fetcher: ReturnType<typeof vi.fn<typeof fetch>>;

beforeEach(() => {
  fetcher = vi.fn<typeof fetch>();
  vi.stubGlobal('fetch', fetcher);
});
afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '/');
});

function renderAction(props: Parameters<typeof TokenAction>[0]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <TokenAction {...props} />
    </QueryClientProvider>,
  );
}
const sentBody = () => JSON.parse(String(fetcher.mock.calls[0][1]?.body));

describe('TokenAction: confirmação da conta', () => {
  it('pede a senha duas vezes e não envia quando elas diferem', async () => {
    const user = userEvent.setup();
    renderAction({ mode: 'verify', token });
    expect(screen.getByRole('heading', { name: 'Sua conta, quase pronta.' })).toBeInTheDocument();
    const password = screen.getByLabelText('Crie sua senha'),
      confirm = screen.getByLabelText('Confirme a senha');
    expect(password).toHaveAttribute('autocomplete', 'new-password');
    expect(password).toHaveAttribute('minlength', '12');
    expect(confirm).toHaveAttribute('maxlength', '128');
    await user.type(password, 'uma-senha-bem-longa');
    await user.type(confirm, 'outra-senha-bem-longa');
    await user.click(screen.getByRole('button', { name: 'Criar senha e entrar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('As senhas precisam ser iguais.');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('envia token e senha para auth/verify e leva para a conta já conectada', async () => {
    const user = userEvent.setup();
    fetcher.mockResolvedValue(json({ data: { id: 'c1' } }));
    renderAction({ mode: 'verify', token });
    await user.type(screen.getByLabelText('Crie sua senha'), 'uma-senha-bem-longa');
    await user.type(screen.getByLabelText('Confirme a senha'), 'uma-senha-bem-longa');
    await user.click(screen.getByRole('button', { name: 'Criar senha e entrar' }));
    expect(await screen.findByRole('status')).toHaveTextContent(/conta está ativa/);
    expect(String(fetcher.mock.calls[0][0])).toMatch(/\/auth\/verify$/);
    expect(sentBody()).toEqual({ token, password: 'uma-senha-bem-longa', marketingOptIn: false });
    expect(screen.getByRole('link', { name: 'Ir para minha conta' })).toHaveAttribute(
      'href',
      '/conta',
    );
  });

  it('a caixa de novidades começa desmarcada e, marcada, vai no corpo do verify', async () => {
    const user = userEvent.setup();
    fetcher.mockResolvedValue(json({ data: { id: 'c1' } }));
    renderAction({ mode: 'verify', token });
    const box = screen.getByRole('checkbox', { name: MARKETING_CONSENT_TEXT });
    expect(box).not.toBeChecked();
    expect(box).not.toBeRequired();
    await user.type(screen.getByLabelText('Crie sua senha'), 'uma-senha-bem-longa');
    await user.type(screen.getByLabelText('Confirme a senha'), 'uma-senha-bem-longa');
    await user.click(box);
    await user.click(screen.getByRole('button', { name: 'Criar senha e entrar' }));
    await screen.findByRole('status');
    expect(sentBody()).toEqual({ token, password: 'uma-senha-bem-longa', marketingOptIn: true });
  });

  it('mostra o erro do link vencido', async () => {
    const user = userEvent.setup();
    fetcher.mockResolvedValue(
      json({ error: { code: 'INVALID_TOKEN', message: 'Este link expirou.' } }, 400),
    );
    renderAction({ mode: 'verify', token });
    await user.type(screen.getByLabelText('Crie sua senha'), 'uma-senha-bem-longa');
    await user.type(screen.getByLabelText('Confirme a senha'), 'uma-senha-bem-longa');
    await user.click(screen.getByRole('button', { name: 'Criar senha e entrar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Este link expirou.');
  });
});

describe('TokenAction: troca de e-mail', () => {
  it('confirma sem pedir senha', async () => {
    const user = userEvent.setup();
    fetcher.mockResolvedValue(new Response(null, { status: 204 }));
    renderAction({ mode: 'verify', token, purpose: 'email-change' });
    expect(screen.queryByLabelText(/senha/i)).toBeNull();
    expect(screen.queryByRole('checkbox')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Confirmar meu e-mail' }));
    expect(await screen.findByRole('status')).toHaveTextContent(/novo e-mail foi confirmado/);
    expect(String(fetcher.mock.calls[0][0])).toMatch(/\/auth\/email-change$/);
    expect(sentBody()).toEqual({ token });
  });

  it('sem sessão, oferece entrar e voltar a este mesmo link', async () => {
    const user = userEvent.setup();
    const here = `/conta/confirmar?purpose=email-change&token=${token}`;
    window.history.replaceState(null, '', here);
    fetcher.mockResolvedValue(
      json(
        {
          error: {
            code: 'LOGIN_REQUIRED',
            message: 'Entre na sua conta neste navegador e abra o link novamente.',
          },
        },
        401,
      ),
    );
    renderAction({ mode: 'verify', token, purpose: 'email-change' });
    await user.click(screen.getByRole('button', { name: 'Confirmar meu e-mail' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Entre na sua conta neste navegador e abra o link novamente.',
    );
    expect(screen.getByRole('link', { name: 'Entrar e confirmar o e-mail' })).toHaveAttribute(
      'href',
      '/login?retorno=' + encodeURIComponent(here),
    );
  });
});

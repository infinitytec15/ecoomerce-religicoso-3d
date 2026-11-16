'use client';
import { useState } from 'react';
import Link from 'next/link';
import { z } from 'zod';
import { useQueryClient } from '@tanstack/react-query';
import { Logo } from '@/components/layout/logo';
import { Form, text } from '@/components/ui/form';
import { Button } from '@/components/ui/button';
import { HttpClient } from '@/lib/api/http';
import { MARKETING_CONSENT_TEXT } from '@maos-em-oracao/contracts';
import { ApiError } from '@/lib/api/contracts';
const copy = {
  // Sign-up confirmation: the password is created here, so only the inbox owner can set it.
  verify: {
    title: 'Sua conta, quase pronta.',
    intro: 'Crie sua senha para ativar a conta. Use pelo menos 12 caracteres.',
    button: 'Criar senha e entrar',
    success: 'Sua conta está ativa e você já entrou. Que bom ter você por aqui.',
  },
  reset: {
    title: 'Um novo acesso para você.',
    intro: 'Escolha uma senha com pelo menos 12 caracteres.',
    button: 'Criar nova senha',
    success: 'Sua senha foi atualizada. Entre novamente na sua conta.',
  },
  prayer: {
    title: 'Um momento de fé no seu dia.',
    intro: 'Confirme que deseja receber gratuitamente as próximas orações por e-mail.',
    button: 'Confirmar oração diária',
    success: 'Sua inscrição está confirmada. As próximas orações chegam por e-mail.',
  },
  unsubscribe: {
    title: 'Seu recebimento, sua escolha.',
    intro: 'Confirme para deixar de receber a oração diária neste e-mail.',
    button: 'Deixar de receber',
    success: 'Seu descadastro da oração diária foi confirmado.',
  },
  reviewOptOut: {
    title: 'Seu recebimento, sua escolha.',
    intro: 'Confirme para deixar de receber pedidos de avaliação das suas compras.',
    button: 'Deixar de receber',
    success: 'Pronto: você não receberá mais pedidos de avaliação.',
  },
  emailChange: {
    title: 'Seu novo e-mail, confirmado.',
    intro: 'Confirme o novo e-mail da sua conta. Use o mesmo navegador em que você está conectado.',
    button: 'Confirmar meu e-mail',
    success: 'Seu novo e-mail foi confirmado.',
  },
  guest: {
    title: 'Seu pedido, com segurança.',
    intro: 'Confirme para abrir este pedido neste navegador.',
    button: 'Acessar meu pedido',
    success: 'O acesso a este pedido está pronto.',
  },
};
export function TokenAction({
  mode,
  token,
  purpose,
  staff = false,
}: {
  mode: Exclude<keyof typeof copy, 'emailChange'>;
  token: string;
  purpose?: string;
  staff?: boolean;
}) {
  const [complete, setComplete] = useState(false),
    [orderId, setOrderId] = useState(''),
    // Set when an e-mail change link is opened without being signed in to that account.
    [loginRequired, setLoginRequired] = useState<{ message: string; href: string } | null>(null),
    client = useQueryClient(),
    emailChange = mode === 'verify' && purpose === 'email-change',
    // Account confirmation creates the password (min 12, like reset) and asks for marketing
    // consent here, where only the inbox owner can give it.
    confirmsAccount = mode === 'verify' && !emailChange,
    createsPassword = mode === 'reset' || confirmsAccount,
    content = copy[emailChange ? 'emailChange' : mode],
    // Both confirmations end signed in; a reset asks to sign in again.
    signedIn = mode === 'verify' && !staff,
    valid = token.length >= 20 && token.length <= 2048;
  return (
    <main id="main" className="invitation-page">
      <Logo />
      <section className="admin-panel">
        <h1>{content.title}</h1>
        {complete ? (
          <>
            <p role="status">{content.success}</p>
            <Link
              className="btn primary"
              href={
                orderId
                  ? '/conta/pedidos/' + encodeURIComponent(orderId)
                  : signedIn
                    ? '/conta'
                    : mode === 'reset' || mode === 'verify'
                      ? staff
                        ? '/admin/login'
                        : '/login'
                      : mode === 'reviewOptOut'
                        ? '/produtos'
                        : '/cantinho-da-fe'
              }
            >
              {orderId
                ? 'Ver meu pedido'
                : signedIn
                  ? 'Ir para minha conta'
                  : mode === 'reset' || mode === 'verify'
                    ? 'Entrar na minha conta'
                    : mode === 'reviewOptOut'
                      ? 'Voltar à loja'
                      : 'Visitar o Cantinho da Fé'}
            </Link>
          </>
        ) : loginRequired ? (
          <>
            <p role="alert">{loginRequired.message}</p>
            <Link className="btn primary" href={loginRequired.href}>
              Entrar e confirmar o e-mail
            </Link>
          </>
        ) : !valid ? (
          <>
            <p role="alert">Este link está incompleto ou inválido. Solicite um novo link.</p>
            <Link href="/login">Voltar ao acesso</Link>
          </>
        ) : (
          <>
            <p>{content.intro}</p>
            <Form
              onSubmit={async (data) => {
                const password = text(data, 'password');
                if (createsPassword && password !== text(data, 'confirm'))
                  throw new Error('As senhas precisam ser iguais.');
                const api = new HttpClient();
                if (mode === 'guest') {
                  const result = await api.request(
                    'auth/guest-order',
                    z.object({ orderId: z.string() }),
                    { method: 'POST', body: { token } },
                  );
                  setOrderId(result.orderId);
                } else {
                  const path =
                    mode === 'reset'
                      ? 'auth/reset'
                      : mode === 'verify'
                        ? purpose === 'email-change'
                          ? 'auth/email-change'
                          : 'auth/verify'
                        : mode === 'prayer'
                          ? 'newsletter/confirm'
                          : mode === 'reviewOptOut'
                            ? 'reviews/opt-out'
                            : 'newsletter/unsubscribe';
                  try {
                    await api.request(path, z.unknown(), {
                      method: 'POST',
                      body: {
                        token,
                        ...(createsPassword ? { password } : {}),
                        ...(confirmsAccount ? { marketingOptIn: data.has('marketingOptIn') } : {}),
                      },
                    });
                  } catch (error) {
                    if (!(
                      emailChange &&
                      error instanceof ApiError &&
                      error.code === 'LOGIN_REQUIRED'
                    ))
                      throw error;
                    // Sign in here and come back to this same link to finish the change.
                    const here = window.location.pathname + window.location.search;
                    setLoginRequired({
                      message: error.message,
                      href: '/login?retorno=' + encodeURIComponent(here),
                    });
                    return;
                  }
                }
                await client.invalidateQueries();
                setComplete(true);
              }}
            >
              {(pending) => (
                <>
                  {createsPassword && (
                    <>
                      <label>
                        {mode === 'reset' ? 'Nova senha' : 'Crie sua senha'}
                        <input
                          name="password"
                          type="password"
                          autoComplete="new-password"
                          required
                          minLength={12}
                          maxLength={128}
                        />
                      </label>
                      <label>
                        {mode === 'reset' ? 'Confirmar nova senha' : 'Confirme a senha'}
                        <input
                          name="confirm"
                          type="password"
                          autoComplete="new-password"
                          required
                          minLength={12}
                          maxLength={128}
                        />
                      </label>
                    </>
                  )}
                  {confirmsAccount && (
                    <label className="check-line">
                      <input type="checkbox" name="marketingOptIn" />
                      {MARKETING_CONSENT_TEXT}
                    </label>
                  )}
                  <Button loading={pending}>{content.button}</Button>
                </>
              )}
            </Form>
          </>
        )}
      </section>
    </main>
  );
}

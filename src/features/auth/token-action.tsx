'use client';
import { useState } from 'react';
import Link from 'next/link';
import { z } from 'zod';
import { useQueryClient } from '@tanstack/react-query';
import { Logo } from '@/components/layout/logo';
import { Form, text } from '@/components/ui/form';
import { Button } from '@/components/ui/button';
import { HttpClient } from '@/lib/api/http';
const copy = {
  verify: {
    title: 'Seu e-mail, confirmado.',
    intro: 'Confirme seu e-mail para manter os dados da sua conta atualizados.',
    button: 'Confirmar meu e-mail',
    success: 'Seu e-mail foi confirmado.',
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
  mode: keyof typeof copy;
  token: string;
  purpose?: string;
  staff?: boolean;
}) {
  const [complete, setComplete] = useState(false),
    [orderId, setOrderId] = useState(''),
    client = useQueryClient(),
    content = copy[mode],
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
                  : mode === 'reset' || mode === 'verify'
                    ? staff
                      ? '/admin/login'
                      : '/login'
                    : '/cantinho-da-fe'
              }
            >
              {orderId
                ? 'Ver meu pedido'
                : mode === 'reset' || mode === 'verify'
                  ? 'Entrar na minha conta'
                  : 'Visitar o Cantinho da Fé'}
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
                if (mode === 'reset' && password !== text(data, 'confirm'))
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
                          : 'newsletter/unsubscribe';
                  await api.request(path, z.unknown(), {
                    method: 'POST',
                    body: { token, ...(mode === 'reset' ? { password } : {}) },
                  });
                }
                await client.invalidateQueries();
                setComplete(true);
              }}
            >
              {(pending) => (
                <>
                  {mode === 'reset' && (
                    <>
                      <label>
                        Nova senha
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
                        Confirmar nova senha
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

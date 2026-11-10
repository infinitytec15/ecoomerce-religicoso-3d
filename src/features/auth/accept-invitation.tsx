'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useCommand, useGateway } from '@/lib/api/query';
import type { TeamInvitation } from '@/lib/domain/types';
import { Form, text } from '@/components/ui/form';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/layout/logo';
import { useQuery } from '@tanstack/react-query';
import { IS_DEMO } from '@/lib/api/config';
export function AcceptInvitation({ token }: { token: string }) {
  const gateway = useGateway(),
    [accepted, setAccepted] = useState(false),
    invitation = useQuery({
      queryKey: ['invitation', token],
      queryFn: () => gateway.invitation(token),
    }),
    accept = useCommand((g, input: { token: string; name: string; password?: string }) =>
      g.acceptInvitation(input),
    );
  return (
    <main id="main" className="invitation-page">
      <Logo />
      <section className="admin-panel">
        <h1>{accepted ? 'Bem-vindo à equipe.' : 'Cuidar juntos faz a diferença.'}</h1>
        {accepted ? (
          <>
            <p>
              {IS_DEMO
                ? 'Seu acesso de demonstração foi criado neste navegador.'
                : 'Seu convite foi aceito. Entre com o e-mail convidado e a senha que você definiu.'}
            </p>
            <Link className="btn primary" href={IS_DEMO ? '/admin' : '/admin/login'}>
              Abrir gestão
            </Link>
          </>
        ) : invitation.isPending ? (
          <p role="status">Verificando convite…</p>
        ) : invitation.isError ? (
          <p role="alert">Convite inválido, revogado ou expirado. Peça um novo link à equipe.</p>
        ) : (
          <>
            <p>{invitation.data?.name}, você recebeu um convite para a gestão Mãos em Oração.</p>
            <p>
              {invitation.data?.email} · perfil {invitation.data?.role}
            </p>
            <Form
              onSubmit={async (d) => {
                if (!IS_DEMO && text(d, 'password') !== text(d, 'confirm'))
                  throw new Error('As senhas precisam ser iguais.');
                await accept.mutateAsync({
                  token,
                  name: text(d, 'name'),
                  password: IS_DEMO ? undefined : text(d, 'password'),
                });
                setAccepted(true);
              }}
            >
              {(pending) => (
                <>
                  <label>
                    Como quer ser chamado?
                    <input
                      name="name"
                      required
                      minLength={3}
                      defaultValue={(invitation.data as TeamInvitation)?.name}
                    />
                  </label>
                  {!IS_DEMO && (
                    <>
                      <label>
                        Crie sua senha
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
                        Confirme sua senha
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
                  {IS_DEMO && (
                    <p className="notice">
                      Demonstração local: nenhum e-mail é enviado e este acesso não representa
                      autenticação real.
                    </p>
                  )}
                  <Button loading={pending}>Aceitar convite</Button>
                </>
              )}
            </Form>
          </>
        )}
      </section>
    </main>
  );
}

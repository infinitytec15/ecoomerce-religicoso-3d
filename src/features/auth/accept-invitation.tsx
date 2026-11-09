'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useCommand, useGateway } from '@/lib/api/query';
import type { TeamInvitation } from '@/lib/domain/types';
import { Form, text } from '@/components/ui/form';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/layout/logo';
import { useQuery } from '@tanstack/react-query';
export function AcceptInvitation({ token }: { token: string }) {
  const gateway = useGateway(),
    [accepted, setAccepted] = useState(false),
    invitation = useQuery({
      queryKey: ['invitation', token],
      queryFn: () => gateway.invitation(token),
    }),
    accept = useCommand((g, input: { token: string; name: string }) => g.acceptInvitation(input));
  return (
    <main id="main" className="invitation-page">
      <Logo />
      <section className="admin-panel">
        <h1>{accepted ? 'Bem-vindo à equipe.' : 'Cuidar juntos faz a diferença.'}</h1>
        {accepted ? (
          <>
            <p>
              Seu acesso de demonstração foi criado. Entre pelo convite neste navegador para
              explorar a gestão.
            </p>
            <Link className="btn primary" href="/admin">
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
                await accept.mutateAsync({ token, name: text(d, 'name') });
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
                  <p className="notice">
                    Demonstração local: nenhum e-mail é enviado e este acesso não representa
                    autenticação real.
                  </p>
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

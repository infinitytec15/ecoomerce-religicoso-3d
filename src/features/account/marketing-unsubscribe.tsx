'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Logo } from '@/components/layout/logo';
import { Button } from '@/components/ui/button';
import { useCommand } from '@/lib/api/query';
import { ApiError, errorMessage } from '@/lib/api/contracts';

/** Unsubscribes only on click: e-mail link scanners open the page with GET. */
export function MarketingUnsubscribe({
  token,
  campaignId,
}: {
  token: string;
  campaignId?: string;
}) {
  const [done, setDone] = useState(false),
    [error, setError] = useState<{ message: string; invalid: boolean } | null>(null),
    unsubscribe = useCommand((g, input: { token: string; campaignId?: string }) =>
      g.marketingUnsubscribe(input),
    ),
    valid = token.length >= 20 && token.length <= 2048;
  async function confirm() {
    setError(null);
    try {
      await unsubscribe.mutateAsync({ token, ...(campaignId ? { campaignId } : {}) });
      setDone(true);
    } catch (e) {
      setError({
        message: errorMessage(e),
        invalid: e instanceof ApiError && e.code === 'INVALID_TOKEN',
      });
    }
  }
  return (
    <main id="main" className="invitation-page">
      <Logo />
      <section className="admin-panel">
        <h1>Seu recebimento, sua escolha.</h1>
        {done ? (
          <>
            <p role="status">
              Você saiu da lista de novidades. Pedidos e avisos da sua conta continuam chegando
              normalmente.
            </p>
            <Link className="btn primary" href="/">
              Voltar à loja
            </Link>
          </>
        ) : !valid ? (
          <>
            <p role="alert">Este link está incompleto ou inválido.</p>
            <Link href="/conta">Ir para minha conta</Link>
          </>
        ) : (
          <>
            <p>Confirme para deixar de receber novidades, lançamentos e ofertas por e-mail.</p>
            <Button type="button" loading={unsubscribe.isPending} onClick={confirm}>
              Confirmar descadastro
            </Button>
            {error && (
              <>
                <p className="form-error" role="alert">
                  {error.message}
                </p>
                {error.invalid && <Link href="/conta">Ir para minha conta</Link>}
              </>
            )}
          </>
        )}
      </section>
    </main>
  );
}

'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';
import { HttpClient } from '@/lib/api/http';
import { checkoutResultSchema } from '@/lib/api/response-schemas';
import { useAccount, useCommand, useGateway, useSession } from '@/lib/api/query';
import { IS_DEMO } from '@/lib/api/config';
import { money } from '@/lib/domain/format';
import { Button, ButtonLink } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { StatusBadge } from '@/components/ui/status-badge';
import { errorMessage } from '@/lib/api/contracts';
export function SuccessView({ orderId }: { orderId?: string }) {
  const retryKey = useRef<string | null>(null),
    cache = useQueryClient();
  const retry = useMutation({
    mutationFn: async (id: string) => {
      retryKey.current ??= crypto.randomUUID();
      return new HttpClient().request(
        'orders/' + encodeURIComponent(id) + '/payment',
        checkoutResultSchema,
        { method: 'POST', body: {}, idempotencyKey: retryKey.current },
      );
    },
    onSuccess: async () => {
      retryKey.current = null;
      await cache.invalidateQueries();
    },
  });
  const session = useSession(),
    account = useAccount(!IS_DEMO),
    gateway = useGateway(),
    order = account.data?.orders.find((o) => o.id === orderId) || account.data?.orders[0],
    charge = account.data?.charges.find((c) => c.id === order?.chargeId),
    payment = useQuery({
      queryKey: ['payment', order?.id],
      queryFn: () => gateway.payment(order!.id),
      enabled: !!order && !IS_DEMO,
      refetchInterval: 5000,
    }),
    confirm = useCommand((g, id: string) => g.confirmDemoPayment(id));
  if (!session.isPending && session.data?.role !== 'customer')
    return (
      <main id="main" className="container">
        <EmptyState
          title="Acompanhe seu pedido."
          description="Entre na sua conta para ver a confirmação e o pagamento."
          action={<ButtonLink href="/login?retorno=/conta/pedidos">Entrar na conta</ButtonLink>}
        />
      </main>
    );
  if (session.isPending || account.isPending)
    return (
      <main id="main" className="container">
        <LoadingState label="Carregando a confirmação do pedido…" />
      </main>
    );
  if (account.isError)
    return (
      <main id="main" className="container">
        <ErrorState message={errorMessage(account.error)} onRetry={() => void account.refetch()} />
      </main>
    );
  if (!order || !charge)
    return (
      <main id="main" className="container">
        <EmptyState
          title="Encontre seu pedido na sua conta."
          description="Entre com o mesmo e-mail usado no checkout para acompanhar a compra."
          action={<ButtonLink href="/conta/pedidos">Ver meus pedidos</ButtonLink>}
        />
      </main>
    );
  const pending = ['Pendente', 'Recusado'].includes(charge.status),
    action = payment.data?.paymentAction;
  return (
    <main id="main" className="container">
      <section className="success">
        <div className="success-icon">
          <Icon name={pending ? 'pix' : 'check'} />
        </div>
        <h1>
          {pending
            ? 'Acompanhe seu pagamento.'
            : charge.status === 'Cancelada' || charge.status === 'Estornado'
              ? 'Seu pagamento foi encerrado.'
              : 'Sua escolha ganhou forma.'}
        </h1>
        <p>
          {pending
            ? 'Acompanhe o pagamento para iniciar o preparo da sua peça.'
            : 'Obrigada por deixar a fé fazer parte da sua história.'}
        </p>
        <StatusBadge status={order.status} />
        <div className="success-panel">
          <h2>Pedido {order.number}</h2>
          <div className="money-line" style={{ marginTop: 20 }}>
            <span>Total</span>
            <strong>{money(order.totalCents)}</strong>
          </div>
          <p className="demo-text">
            {charge.method === 'split'
              ? `Pix: ${money(charge.pixCents)} + cartão: ${money(charge.cardCents)} em ${charge.installments}×.`
              : charge.method === 'pix'
                ? 'Pagamento com Pix.'
                : `Cartão em ${charge.installments}×.`}
          </p>
          {pending && IS_DEMO && (
            <div className="payment-panel">
              <p className="demo-text">
                Nenhum QR Code ou chave real é criado. O botão confirma somente o pagamento de
                demonstração.
              </p>
              <Button
                className="full"
                loading={confirm.isPending}
                onClick={() => confirm.mutate(charge.id)}
              >
                Simular pagamento do Pix <Icon name="check" />
              </Button>
              {confirm.isError && (
                <p className="form-error" role="alert">
                  {errorMessage(confirm.error)}
                </p>
              )}
            </div>
          )}
          {!IS_DEMO &&
            charge.method === 'pix' &&
            ['Cancelada', 'Recusado'].includes(charge.status) &&
            order.status !== 'Cancelado' && (
              <Button
                className="full"
                loading={retry.isPending}
                onClick={() => retry.mutate(order.id)}
              >
                Gerar um novo Pix
              </Button>
            )}
          {retry.error && (
            <p className="form-error" role="alert">
              {errorMessage(retry.error)}
            </p>
          )}
          {pending && !IS_DEMO && action?.type === 'redirect' && (
            <a className="btn full payment-provider-link" href={action.url}>
              Continuar no provedor de pagamento <Icon name="arrow" />
            </a>
          )}
          {pending && !IS_DEMO && action?.type === 'pix' && (
            <div className="stack payment-panel">
              <label>
                Pix copia e cola
                <textarea readOnly value={action.copyPaste} />
              </label>
              <Button
                variant="secondary"
                onClick={() => navigator.clipboard.writeText(action.copyPaste)}
              >
                Copiar código Pix
              </Button>
              <small>Válido até {new Date(action.expiresAt).toLocaleString('pt-BR')}</small>
            </div>
          )}
          {pending && !IS_DEMO && (
            <Button
              variant="secondary"
              className="full"
              onClick={() => {
                void payment.refetch();
                void account.refetch();
              }}
            >
              Atualizar situação do pagamento
            </Button>
          )}
          <p className="demo-text">
            Entrega para {order.address.city}/{order.address.state}.
            {IS_DEMO ? ' Nenhuma cobrança ou remessa real será feita.' : ''}
          </p>
        </div>
        <div className="row wrap" style={{ justifyContent: 'center', marginTop: 27 }}>
          <ButtonLink href={order.subscriptionId ? '/conta/assinatura' : '/conta/pedidos'}>
            {order.subscriptionId ? 'Acompanhar minha assinatura' : 'Ver meus pedidos'}{' '}
            <Icon name="arrow" />
          </ButtonLink>
          <ButtonLink href="/produtos" variant="secondary">
            Continuar explorando
          </ButtonLink>
        </div>
      </section>
    </main>
  );
}

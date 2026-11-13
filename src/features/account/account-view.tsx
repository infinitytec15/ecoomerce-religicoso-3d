'use client';
import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import type { Address, Order, SubscriptionChange } from '@/lib/domain/types';
import { useAccount, useCommand } from '@/lib/api/query';
import { errorMessage } from '@/lib/api/contracts';
import { IS_DEMO } from '@/lib/api/config';
import { dateLabel, money } from '@/lib/domain/format';
import { Button, ButtonLink } from '@/components/ui/button';
import { Form, text } from '@/components/ui/form';
import { AddressFields } from '@/components/ui/address-fields';
import { Icon } from '@/components/ui/icon';
import { Modal } from '@/components/ui/modal';
import { StatusBadge } from '@/components/ui/status-badge';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { ProductImage } from '@/components/ui/product-image';
import { ShipmentCard, ReceiptButton } from './shipment-card';
import { ClientTickets } from './tickets';
import { ReviewForm } from './review-form';
import { SubscriptionPreferences } from '@/features/club/subscription-preferences';
import { useNotify } from '@/components/ui/feedback';
export function SubscriberTabs({ active }: { active: string }) {
  return (
    <nav className="subscription-tabs" aria-label="Área do assinante">
      {[
        ['assinatura', 'Minha assinatura'],
        ['envios', 'Meus envios'],
        ['cobrancas', 'Cobranças'],
        ['atendimentos', 'Atendimentos'],
      ].map(([id, label]) => (
        <Link
          key={id}
          href={'/conta/' + id}
          className={active === id ? 'active' : ''}
          aria-current={active === id ? 'page' : undefined}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
function OrderList({ orders }: { orders: Order[] }) {
  return orders.length ? (
    <>
      {orders.map((o) => (
        <article className="order-row" key={o.id}>
          <div className="row between wrap">
            <h3>{o.number}</h3>
            <StatusBadge status={o.status} />
          </div>
          <p>
            {dateLabel(o.created)} · {o.items.reduce((a, x) => a + x.quantity, 0)} peça(s) ·{' '}
            {money(o.totalCents)}
          </p>
          <div className="row between wrap">
            <div className="order-preview">
              {o.items.slice(0, 3).map((i) => (
                <ProductImage src={i.image} alt={i.name} sizes="75px" key={i.key} />
              ))}
            </div>
            <Link className="arrow-link" href={'/conta/pedidos/' + o.id}>
              Ver pedido <Icon name="arrow" />
            </Link>
          </div>
        </article>
      ))}
    </>
  ) : (
    <EmptyState
      title="A sua história começa aqui."
      description="Seus pedidos aparecerão aqui depois de uma compra."
      action={<ButtonLink href="/produtos">Explorar produtos</ButtonLink>}
    />
  );
}
export function AccountView({ tab = 'overview', id }: { tab?: string; id?: string }) {
  const account = useAccount(),
    data = account.data,
    change = useCommand((g, input: SubscriptionChange) => g.changeSubscription(input)),
    confirm = useCommand((g, chargeId: string) => g.confirmDemoPayment(chargeId)),
    [dialog, setDialog] = useState<'preferences' | 'cancel' | null>(null),
    [reviewing, setReviewing] = useState<{ itemId: string; name: string } | null>(null),
    notify = useNotify();
  if (account.isPending) return <LoadingState />;
  if (account.isError || !data)
    return (
      <ErrorState message={errorMessage(account.error)} onRetry={() => void account.refetch()} />
    );
  const sub = data.subscriptions.find((s) => s.status !== 'Cancelada') || data.subscriptions[0],
    shipments = data.orders.filter((o) => o.subscriptionId === sub?.id),
    charges = data.charges.filter((c) => c.subscriptionId === sub?.id),
    next = shipments
      .filter((o) => !['Enviado', 'Entregue', 'Cancelado'].includes(o.status))
      .toSorted((a, b) => a.due.localeCompare(b.due))[0];
  async function act(action: SubscriptionChange['action']) {
    if (!sub) return;
    await change.mutateAsync({ id: sub.id, action });
    notify(action === 'skip' ? 'Próxima renovação adiada em um mês.' : 'Assinatura atualizada.');
  }
  if (tab === 'dados' || tab === 'enderecos')
    return <ProfileView customer={data.customer} addressOnly={tab === 'enderecos'} />;
  if (tab === 'atendimentos')
    return (
      <>
        <SubscriberTabs active={tab} />
        <ClientTickets tickets={data.tickets} />
      </>
    );
  if (tab === 'pedido') {
    const order = data.orders.find((o) => o.id === id),
      charge = data.charges.find((c) => c.id === order?.chargeId);
    if (!order)
      return (
        <EmptyState
          title="Pedido não encontrado."
          description="Confira os pedidos disponíveis nesta conta."
          action={<ButtonLink href="/conta/pedidos">Ver meus pedidos</ButtonLink>}
        />
      );
    return (
      <>
        <Link className="arrow-link" href="/conta/pedidos">
          Voltar aos pedidos
        </Link>
        <h1>Pedido {order.number}.</h1>
        <p>Criado em {dateLabel(order.created)}.</p>
        <ShipmentCard order={order} />
        {order.items.map((item) => (
          <div className="cart-item" key={item.key}>
            <ProductImage src={item.image} alt={item.name} sizes="85px" />
            <div>
              <h3>{item.name}</h3>
              <small>
                {item.color} · {item.size} · {item.quantity} un.
              </small>
              {item.dedication && <small>“{item.dedication}”</small>}
              <strong>{money(item.unitCents * item.quantity)}</strong>
              {order.status === 'Entregue' &&
                item.itemId &&
                (() => {
                  const itemId = item.itemId,
                    review = data.reviews.find((r) => r.orderItemId === itemId);
                  return review ? (
                    <small className="review-state">
                      {review.status === 'Publicado'
                        ? 'Avaliação publicada'
                        : 'Avaliação em análise'}
                    </small>
                  ) : (
                    <Button
                      variant="secondary"
                      className="small"
                      onClick={() => setReviewing({ itemId, name: item.name })}
                    >
                      Avaliar peça
                    </Button>
                  );
                })()}
            </div>
          </div>
        ))}
        <Modal
          open={!!reviewing}
          onOpenChange={(open) => !open && setReviewing(null)}
          title="Avaliar peça"
        >
          {reviewing && <ReviewForm item={reviewing} onDone={() => setReviewing(null)} />}
        </Modal>
        <div className="money-line total">
          <span>Total</span>
          <strong>{money(order.totalCents)}</strong>
        </div>
        <div className="row wrap" style={{ marginTop: 24 }}>
          {charge && <ReceiptButton charge={charge} />}
          <ButtonLink href="/conta/atendimentos" variant="secondary">
            Preciso de ajuda
          </ButtonLink>
          {charge && ['Pendente', 'Recusado'].includes(charge.status) && (
            <ButtonLink href={'/checkout/sucesso?pedido=' + order.id}>
              Concluir pagamento
            </ButtonLink>
          )}
        </div>
      </>
    );
  }
  if (tab === 'pedidos')
    return (
      <>
        <h1>Seus pedidos.</h1>
        <p>Acompanhe cada escolha, da impressão até a sua casa.</p>
        <OrderList orders={data.orders} />
      </>
    );
  if (['assinatura', 'envios', 'cobrancas'].includes(tab)) {
    if (!sub)
      return (
        <>
          <h1>Um novo encontro com a fé.</h1>
          <p>Você ainda não tem uma assinatura.</p>
          <div className="account-club-empty">
            <div className="subscription-image">
              <Image
                src="/assets/club-basket.webp"
                alt="Cesta conceitual do clube"
                fill
                sizes="(max-width:600px) 100vw, 250px"
              />
            </div>
            <div>
              <h2>Clube Cesta com Jesus</h2>
              <p>Todo mês, uma seleção de peças cristãs em 3D e uma mensagem para cultivar a fé.</p>
              <ButtonLink href="/clube">
                Conhecer o clube <Icon name="arrow" />
              </ButtonLink>
            </div>
          </div>
        </>
      );
    if (tab === 'envios')
      return (
        <>
          <SubscriberTabs active={tab} />
          <h1>Uma nova cesta, a cada capítulo.</h1>
          <p>Acompanhe o caminho de cada edição até sua casa.</p>
          <div className="shipment-list">
            {shipments.length ? (
              shipments.map((o) => <ShipmentCard key={o.id} order={o} />)
            ) : (
              <EmptyState
                title="Sua primeira cesta está chegando."
                description="Os envios aparecem após a criação do primeiro pedido."
              />
            )}
          </div>
        </>
      );
    if (tab === 'cobrancas')
      return (
        <>
          <SubscriberTabs active={tab} />
          <h1>Suas cobranças, com clareza.</h1>
          <p>
            Mensalidade contratada: {money(sub.priceCents)}.
            {IS_DEMO ? ' Nenhuma cobrança real será feita.' : ''}
          </p>
          <div className="client-billing-list">
            {charges.map((c) => (
              <article key={c.id}>
                <div>
                  <h3>{c.description}</h3>
                  <p>
                    {dateLabel(c.due)} · {c.method === 'card' ? 'Cartão' : 'Pix mensal'}
                  </p>
                </div>
                <strong>{money(c.amountCents)}</strong>
                <StatusBadge status={c.status} />
                {['Pendente', 'Recusado'].includes(c.status) ? (
                  IS_DEMO ? (
                    <Button
                      variant="secondary"
                      className="small"
                      loading={confirm.isPending}
                      onClick={() => confirm.mutate(c.id)}
                    >
                      Simular pagamento
                    </Button>
                  ) : (
                    <ButtonLink href={'/checkout/sucesso?pedido=' + c.orderId}>
                      Concluir pagamento
                    </ButtonLink>
                  )
                ) : (
                  <ReceiptButton charge={c} />
                )}
              </article>
            ))}
          </div>
          {confirm.isError && (
            <p className="form-error" role="alert">
              {errorMessage(confirm.error)}
            </p>
          )}
        </>
      );
    return (
      <>
        <SubscriberTabs active={tab} />
        <h1>Sua fé tem um lugar aqui.</h1>
        <p>Gerencie sua cesta mensal e acompanhe seus próximos momentos.</p>
        <div className="subscription-main">
          <div className="subscription-image">
            <Image
              src="/assets/club-basket.webp"
              alt="Cesta mensal conceitual"
              fill
              sizes="220px"
            />
          </div>
          <div>
            <div className="row between wrap">
              <h2>Clube Cesta com Jesus</h2>
              <StatusBadge status={sub.status} />
            </div>
            <div className="subscription-value">
              {money(sub.priceCents)}
              <small>/ mês · frete incluído</small>
            </div>
            <dl className="subscription-facts">
              <div>
                <dt>Perfil</dt>
                <dd>Cesta {sub.profile.toLowerCase()}</dd>
              </div>
              <div>
                <dt>Renovação</dt>
                <dd>
                  {['Pausada', 'Cancelada'].includes(sub.status)
                    ? 'Interrompida'
                    : dateLabel(sub.nextRenewal)}
                </dd>
              </div>
              <div>
                <dt>Pagamento</dt>
                <dd>
                  {sub.payment === 'card'
                    ? IS_DEMO
                      ? 'Cartão de teste ···· 4242'
                      : 'Cartão'
                    : 'Pix mensal'}
                </dd>
              </div>
              <div>
                <dt>Próxima expedição</dt>
                <dd>
                  {next
                    ? dateLabel(next.due)
                    : ['Pausada', 'Cancelada'].includes(sub.status)
                      ? 'Sem novo envio'
                      : dateLabel(sub.nextShipment)}
                </dd>
              </div>
            </dl>
          </div>
        </div>
        {sub.status === 'Pagamento pendente' && (
          <div className="notice warn">
            Há uma cobrança aguardando confirmação. Confira a aba Cobranças.
          </div>
        )}
        <div className="subscriber-actions">
          <Button variant="secondary" className="small" onClick={() => setDialog('preferences')}>
            Preferências e endereço
          </Button>
          {sub.status === 'Ativa' && (
            <>
              <Button
                variant="secondary"
                className="small"
                loading={change.isPending}
                onClick={() => void act('skip')}
              >
                Pular próxima edição
              </Button>
              <Button
                variant="secondary"
                className="small"
                loading={change.isPending}
                onClick={() => void act('pause')}
              >
                Pausar assinatura
              </Button>
            </>
          )}
          {sub.status === 'Pausada' && (
            <Button className="small" loading={change.isPending} onClick={() => void act('resume')}>
              Retomar assinatura
            </Button>
          )}
          {sub.status !== 'Cancelada' ? (
            <Button variant="text" className="danger-text" onClick={() => setDialog('cancel')}>
              Cancelar assinatura
            </Button>
          ) : (
            <ButtonLink href="/clube/assinar">Criar nova assinatura</ButtonLink>
          )}
        </div>
        {change.isError && (
          <p className="form-error" role="alert">
            {errorMessage(change.error)}
          </p>
        )}
        <div className="subscriber-address">
          <h3>Seu endereço de entrega</h3>
          <p>
            {sub.address.street}, {sub.address.number} {sub.address.extra} · {sub.address.city}/
            {sub.address.state} · CEP {sub.address.cep}
          </p>
          <small>Uma alteração vale para os próximos envios ainda não despachados.</small>
        </div>
        <div className="section-header" style={{ marginTop: 32 }}>
          <h2 style={{ fontSize: 22 }}>Sua próxima cesta</h2>
          <Link href="/conta/envios" className="arrow-link">
            Ver todos os envios <Icon name="arrow" />
          </Link>
        </div>
        {shipments[0] && <ShipmentCard order={next || shipments[0]} />}
        <details className="subscription-history">
          <summary>Histórico da assinatura</summary>
          {sub.history.map((h, i) => (
            <p key={i}>
              <small>{dateLabel(h.date)}</small> {h.label}
            </p>
          ))}
        </details>
        <Modal
          open={dialog === 'preferences'}
          onOpenChange={(open) => !open && setDialog(null)}
          title="Preferências da assinatura"
        >
          <SubscriptionPreferences subscription={sub} onSuccess={() => setDialog(null)} />
        </Modal>
        <Modal
          open={dialog === 'cancel'}
          onOpenChange={(open) => !open && setDialog(null)}
          title="Cancelar assinatura"
        >
          <p>
            As próximas renovações serão interrompidas. Cestas já pagas continuam no histórico de
            envio.
          </p>
          <Form
            onSubmit={async (d) => {
              await change.mutateAsync({ id: sub.id, action: 'cancel', reason: text(d, 'reason') });
              setDialog(null);
              notify('Renovações futuras interrompidas.');
            }}
          >
            {(pending) => (
              <>
                <label>
                  Motivo (opcional)
                  <select name="reason">
                    <option>Prefiro não informar</option>
                    <option>Quero fazer uma pausa maior</option>
                    <option>O valor não cabe neste momento</option>
                    <option>Outro motivo</option>
                  </select>
                </label>
                <Button variant="danger" loading={pending}>
                  Confirmar cancelamento{IS_DEMO ? ' de demonstração' : ''}
                </Button>
                <Button type="button" variant="secondary" onClick={() => setDialog(null)}>
                  Manter minha assinatura
                </Button>
              </>
            )}
          </Form>
        </Modal>
      </>
    );
  }
  return (
    <>
      <h1>Olá, {data.customer.name.split(' ')[0]}.</h1>
      <p>Um cantinho para acompanhar suas escolhas e encontrar novos significados.</p>
      {IS_DEMO && (
        <div className="notice">
          Conta de demonstração · dados e pedidos guardados neste navegador.
        </div>
      )}
      <div className="customer-stats">
        <div>
          <strong>{data.orders.length}</strong>
          <small>pedidos na sua história</small>
        </div>
        <div>
          <strong>{data.subscriptions.filter((s) => s.status === 'Ativa').length}</strong>
          <small>assinatura ativa</small>
        </div>
        <div>
          <strong>{data.tickets.filter((t) => t.status !== 'Resolvido').length}</strong>
          <small>atendimentos em aberto</small>
        </div>
      </div>
      <div className="section-header" style={{ marginTop: 35 }}>
        <h2 style={{ fontSize: 23 }}>Pedidos recentes</h2>
        <Link className="arrow-link" href="/conta/pedidos">
          Ver todos <Icon name="arrow" />
        </Link>
      </div>
      <OrderList orders={data.orders.slice(0, 2)} />
      <ButtonLink href="/clube" variant="secondary">
        Conhecer o clube mensal <Icon name="gift" />
      </ButtonLink>
    </>
  );
}
function ProfileView({ customer, addressOnly }: { customer: Address; addressOnly: boolean }) {
  const [address, setAddress] = useState(customer),
    save = useCommand((g, input: { name: string; email: string; address?: Address }) =>
      g.updateProfile(input),
    ),
    notify = useNotify();
  return (
    <>
      <h1>{addressOnly ? 'Seu lugar no mundo.' : 'Seus dados.'}</h1>
      <p>
        {addressOnly
          ? 'Atualize o endereço para suas próximas escolhas.'
          : 'Cuide do seu perfil de acesso.'}
      </p>
      <Form
        className="stack"
        onSubmit={async (d) => {
          await save.mutateAsync({
            name: addressOnly ? address.name : text(d, 'name'),
            email: addressOnly ? address.email : text(d, 'email'),
            ...(addressOnly ? { address } : {}),
          });
          notify('Dados atualizados.');
        }}
      >
        {(pending) => (
          <>
            {addressOnly ? (
              <AddressFields value={address} onChange={setAddress} showDemo={false} />
            ) : (
              <div className="form-grid">
                <label className="span2">
                  Nome
                  <input name="name" required minLength={2} defaultValue={customer.name} />
                </label>
                <label className="span2">
                  E-mail
                  <input name="email" type="email" required defaultValue={customer.email} />
                </label>
              </div>
            )}
            <Button loading={pending}>Salvar alterações</Button>
          </>
        )}
      </Form>
    </>
  );
}

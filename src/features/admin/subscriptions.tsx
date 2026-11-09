'use client';
import { useState } from 'react';
import Link from 'next/link';
import type { SubscriptionStatus } from '@/lib/domain/types';
import { useAdminData } from './admin-frame';
import {
  AdminHeading,
  AdminError,
  AdminMetrics,
  exportAdmin,
  useAdminAction,
  useAdminFilter,
} from './shared';
import { financialSummary } from '@/lib/domain/commerce';
import { dateLabel, money } from '@/lib/domain/format';
import { Button, ButtonLink } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Modal } from '@/components/ui/modal';
import { Form, text } from '@/components/ui/form';
import { DataTable } from '@/components/ui/data-table';
import { StatusBadge } from '@/components/ui/status-badge';
import { EmptyState } from '@/components/ui/states';
import { SubscriptionPreferences } from '@/features/club/subscription-preferences';
import { IS_DEMO } from '@/lib/api/config';
export function AdminSubscriptions() {
  const data = useAdminData(),
    f = financialSummary(data),
    filter = useAdminFilter(
      data.subscriptions,
      (s) =>
        s.id +
        ' ' +
        s.profile +
        ' ' +
        (data.clients.find((c) => c.id === s.customerId)?.name || ''),
      (s) => s.status,
      ['Todos', 'Ativa', 'Pausada', 'Pagamento pendente', 'Cancelada'],
    );
  return (
    <>
      <AdminHeading
        title="Assinaturas"
        description="Acompanhe o vínculo mensal, as renovações e cada edição."
        actions={
          <>
            <Button
              variant="secondary"
              className="small"
              onClick={() => exportAdmin(data, 'assinaturas')}
            >
              Exportar CSV
            </Button>
            <ButtonLink href="/clube" className="small">
              Ver página do clube <Icon name="arrow" />
            </ButtonLink>
          </>
        }
      />
      <AdminMetrics
        items={[
          { label: 'Ativas', value: data.subscriptions.filter((s) => s.status === 'Ativa').length },
          {
            label: 'Receita mensal projetada',
            value: money(f.mrr),
            note: 'Somente contratos ativos',
          },
          {
            label: 'Pausadas',
            value: data.subscriptions.filter((s) => s.status === 'Pausada').length,
          },
          {
            label: 'Pagamento pendente',
            value: data.subscriptions.filter((s) => s.status === 'Pagamento pendente').length,
          },
        ]}
      />
      {filter.toolbar}
      <DataTable
        rows={filter.rows}
        columns={[
          {
            key: 'id',
            label: 'Assinatura',
            render: (s) => (
              <Link className="admin-link" href={'/admin/assinaturas/' + s.id}>
                {s.id}
              </Link>
            ),
          },
          {
            key: 'customer',
            label: 'Cliente',
            render: (s) => data.clients.find((c) => c.id === s.customerId)?.name,
          },
          { key: 'profile', label: 'Perfil', render: (s) => s.profile },
          { key: 'price', label: 'Mensalidade', render: (s) => money(s.priceCents) },
          {
            key: 'renewal',
            label: 'Próxima renovação',
            render: (s) =>
              ['Pausada', 'Cancelada'].includes(s.status)
                ? 'Interrompida'
                : dateLabel(s.nextRenewal),
          },
          { key: 'status', label: 'Situação', render: (s) => <StatusBadge status={s.status} /> },
          {
            key: 'open',
            label: '',
            render: (s) => (
              <Link className="admin-row-action" href={'/admin/assinaturas/' + s.id}>
                Gerenciar <Icon name="chevron" />
              </Link>
            ),
          },
        ]}
      />
    </>
  );
}
export function AdminSubscriptionDetail({ id }: { id: string }) {
  const data = useAdminData(),
    sub = data.subscriptions.find((s) => s.id === id),
    [dialog, setDialog] = useState<'preferences' | 'renew' | 'cancel' | null>(null),
    action = useAdminAction();
  if (!sub)
    return (
      <EmptyState
        title="Assinatura não encontrada."
        description="Confira a lista de contratos."
        action={<ButtonLink href="/admin/assinaturas">Voltar às assinaturas</ButtonLink>}
      />
    );
  const customer = data.clients.find((c) => c.id === sub.customerId),
    orders = data.orders.filter((o) => o.subscriptionId === id);
  function setStatus(status: SubscriptionStatus) {
    action.execute({ type: 'subscription.state', id, status });
  }
  return (
    <>
      <AdminHeading
        title={sub.id}
        description={`${customer?.name || 'Cliente'} · assinante desde ${dateLabel(sub.created)}`}
        actions={
          <>
            <ButtonLink href="/admin/assinaturas" variant="secondary" className="small">
              Voltar
            </ButtonLink>
            <Button className="small" onClick={() => setDialog('preferences')}>
              Editar preferências
            </Button>
          </>
        }
      />
      <AdminError error={action.error} />
      <div className="admin-detail-grid">
        <section className="admin-panel">
          <div className="row between wrap">
            <h2>{data.settings.clubName}</h2>
            <StatusBadge status={sub.status} />
          </div>
          <dl className="admin-facts">
            <div>
              <dt>Mensalidade contratada</dt>
              <dd>{money(sub.priceCents)} · frete incluído</dd>
            </div>
            <div>
              <dt>Perfil e acabamento</dt>
              <dd>
                {sub.profile} · {sub.finish}
              </dd>
            </div>
            <div>
              <dt>Pagamento</dt>
              <dd>{sub.payment === 'card' ? 'Cartão' : 'Pix mensal'}</dd>
            </div>
            <div>
              <dt>Próxima renovação</dt>
              <dd>
                {['Pausada', 'Cancelada'].includes(sub.status)
                  ? 'Interrompida'
                  : dateLabel(sub.nextRenewal)}
              </dd>
            </div>
          </dl>
          <div className="admin-inline-actions" style={{ marginTop: 22 }}>
            {sub.status === 'Ativa' && (
              <>
                <Button className="small" onClick={() => setDialog('renew')}>
                  {IS_DEMO ? 'Simular próxima renovação' : 'Gerar próximo ciclo'}
                </Button>
                <Button
                  variant="secondary"
                  className="small"
                  loading={action.pending}
                  onClick={() => setStatus('Pausada')}
                >
                  Pausar
                </Button>
              </>
            )}
            {sub.status === 'Pausada' && (
              <Button className="small" loading={action.pending} onClick={() => setStatus('Ativa')}>
                Retomar
              </Button>
            )}
            {sub.status !== 'Cancelada' && (
              <Button variant="text" className="danger-text" onClick={() => setDialog('cancel')}>
                Cancelar
              </Button>
            )}
          </div>
          <h3>Edições e pedidos</h3>
          <DataTable
            rows={orders}
            columns={[
              {
                key: 'id',
                label: 'Pedido',
                render: (o) => (
                  <Link className="admin-link" href={'/admin/pedidos/' + o.id}>
                    {o.number}
                  </Link>
                ),
              },
              { key: 'edition', label: 'Edição', render: (o) => o.edition },
              { key: 'price', label: 'Valor', render: (o) => money(o.totalCents) },
              {
                key: 'status',
                label: 'Situação',
                render: (o) => <StatusBadge status={o.status} />,
              },
            ]}
          />
        </section>
        <aside className="stack">
          <section className="admin-panel">
            <h2>Contato e destino</h2>
            {customer && (
              <Link className="admin-link" href={'/admin/clientes/' + customer.id}>
                {customer.name}
              </Link>
            )}
            <p>{sub.address.email}</p>
            <p>
              {sub.address.street}, {sub.address.number}
              <br />
              {sub.address.city}/{sub.address.state} · {sub.address.cep}
            </p>
          </section>
          <section className="admin-panel">
            <h2>Histórico</h2>
            <div className="admin-history">
              {sub.history.map((h, i) => (
                <p key={i}>
                  <small>{dateLabel(h.date)}</small>
                  {h.label}
                </p>
              ))}
            </div>
          </section>
        </aside>
      </div>
      <Modal
        open={dialog === 'preferences'}
        onOpenChange={(open) => !open && setDialog(null)}
        title="Preferências da assinatura"
      >
        <SubscriptionPreferences subscription={sub} onSuccess={() => setDialog(null)} />
      </Modal>
      <Modal
        open={dialog === 'renew'}
        onOpenChange={(open) => !open && setDialog(null)}
        title="Gerar próximo ciclo"
      >
        <Form
          onSubmit={async (d) => {
            await action.run({
              type: 'subscription.renew',
              id,
              result: text(d, 'result') as 'Pago' | 'Pendente' | 'Recusado',
            });
            setDialog(null);
          }}
        >
          {(pending) => (
            <>
              <p>
                {sub.id} · {dateLabel(sub.nextRenewal)} · {money(sub.priceCents)}
              </p>
              <label>
                Resultado{IS_DEMO ? ' simulado' : ''}
                <select name="result">
                  {(sub.payment === 'pix' ? ['Pendente'] : ['Pago', 'Pendente', 'Recusado']).map(
                    (s) => (
                      <option key={s}>{s}</option>
                    ),
                  )}
                </select>
              </label>
              <div className="notice">
                Será criado um pedido e uma cobrança para o próximo ciclo. Pix exige confirmação de
                cada mensalidade.{IS_DEMO ? ' Nenhuma cobrança real será realizada.' : ''}
              </div>
              <Button loading={pending}>Gerar ciclo</Button>
            </>
          )}
        </Form>
      </Modal>
      <Modal
        open={dialog === 'cancel'}
        onOpenChange={(open) => !open && setDialog(null)}
        title="Cancelar assinatura"
      >
        <Form
          onSubmit={async () => {
            await action.run({ type: 'subscription.state', id, status: 'Cancelada' });
            setDialog(null);
          }}
        >
          {(pending) => (
            <>
              <p>
                Próximas renovações serão interrompidas. Pedidos já criados permanecem no histórico.
              </p>
              <Button variant="danger" loading={pending}>
                Confirmar cancelamento
              </Button>
            </>
          )}
        </Form>
      </Modal>
    </>
  );
}

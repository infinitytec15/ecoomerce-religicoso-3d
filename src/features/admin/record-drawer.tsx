'use client';
import { createContext, useContext, useState, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import type { RecordReference } from '@/lib/domain/types';
import { Modal } from '@/components/ui/modal';
import { ButtonLink } from '@/components/ui/button';
import { useAdminData } from './admin-frame';
import { useAdminAction } from './shared';
import { Form, text, number } from '@/components/ui/form';
import { StatusBadge } from '@/components/ui/status-badge';
import { money, dateLabel } from '@/lib/domain/format';
const OrderDetail = dynamic(() => import('./orders').then((m) => m.AdminOrderDetail));
const SubscriptionDetail = dynamic(() =>
  import('./subscriptions').then((m) => m.AdminSubscriptionDetail),
);
const CustomerDetail = dynamic(() => import('./customers').then((m) => m.AdminCustomerDetail));
const SupportDetail = dynamic(() => import('./service').then((m) => m.AdminSupport));
const DrawerContext = createContext<(record: RecordReference) => void>(() => {});
export function RecordButton({
  record,
  children,
  className = 'admin-link',
}: {
  record: RecordReference;
  children: ReactNode;
  className?: string;
}) {
  const open = useContext(DrawerContext);
  return (
    <button className={className} type="button" onClick={() => open(record)}>
      {children}
    </button>
  );
}
const sections: Record<string, RecordReference['kind']> = {
  pedidos: 'order',
  assinaturas: 'subscription',
  clientes: 'customer',
  suporte: 'ticket',
};
export function RecordWorkspace({ children }: { children: ReactNode }) {
  const [record, setRecord] = useState<RecordReference | null>(null);
  return (
    <DrawerContext.Provider value={setRecord}>
      <div
        onClickCapture={(event) => {
          if (
            event.defaultPrevented ||
            event.ctrlKey ||
            event.metaKey ||
            event.shiftKey ||
            event.altKey ||
            event.button !== 0
          )
            return;
          const anchor = (event.target as HTMLElement).closest('a');
          if (!anchor) return;
          const url = new URL(anchor.href);
          const parts = url.pathname.split('/');
          if (
            url.origin === location.origin &&
            parts[1] === 'admin' &&
            parts[3] &&
            !parts[4] &&
            sections[parts[2]]
          ) {
            event.preventDefault();
            setRecord({ kind: sections[parts[2]], id: decodeURIComponent(parts[3]) });
          }
        }}
      >
        {children}
      </div>
      <Modal
        open={!!record}
        onOpenChange={(open) => !open && setRecord(null)}
        title={
          record
            ? {
                order: 'Detalhes do pedido',
                subscription: 'Detalhes da assinatura',
                customer: 'Histórico do cliente',
                production: 'Ordem de produção',
                shipping: 'Preparação do envio',
                product: 'Produto',
                charge: 'Cobrança',
                ticket: 'Atendimento',
                prayer: 'Pedido de oração',
                campaign: 'Oração diária',
                edition: 'Edição do clube',
                member: 'Integrante',
              }[record.kind]
            : 'Detalhes'
        }
        className="admin-record-drawer"
      >
        {record && <RecordContent key={record.kind + record.id} record={record} />}
      </Modal>
    </DrawerContext.Provider>
  );
}
function RecordContent({ record: r }: { record: RecordReference }) {
  const data = useAdminData(),
    action = useAdminAction();
  if (r.kind === 'order') return <OrderDetail id={r.id} />;
  if (r.kind === 'subscription') return <SubscriptionDetail id={r.id} />;
  if (r.kind === 'customer') return <CustomerDetail id={r.id} />;
  if (r.kind === 'ticket') return <SupportDetail id={r.id} />;
  if (r.kind === 'production') {
    const job = data.jobs.find((j) => j.id === r.id);
    if (!job) return <p>Ordem não encontrada.</p>;
    const order = data.orders.find((o) => o.id === job.orderId);
    return (
      <div className="stack">
        <div className="drawer-record-header">
          <div>
            <h2>{job.id}</h2>
            <p>{order?.items.map((i) => i.name).join(', ')}</p>
          </div>
          <StatusBadge status={job.stage} />
        </div>
        <div className="production-progress" aria-label={`Etapa atual: ${job.stage}`}>
          {['Fila', 'Impressão', 'Acabamento', 'Conferência', 'Pronto'].map((stage, i) => (
            <span
              key={stage}
              className={
                i <= ['Fila', 'Impressão', 'Acabamento', 'Conferência', 'Pronto'].indexOf(job.stage)
                  ? 'complete'
                  : ''
              }
            >
              {i + 1}. {stage}
            </span>
          ))}
        </div>
        <Form
          onSubmit={async (d) => {
            await action.run({
              type: 'production.update',
              id: job.id,
              printer: text(d, 'printer'),
              hours: number(d, 'hours'),
              assignee: text(d, 'assignee'),
              due: text(d, 'due'),
              priority: text(d, 'priority') as 'Normal' | 'Alta',
              notes: text(d, 'notes'),
              material: text(d, 'material'),
              grams: number(d, 'grams'),
            });
          }}
        >
          {(pending) => (
            <>
              <div className="form-grid">
                <label>
                  Impressora
                  <select name="printer" defaultValue={job.printer}>
                    {[...new Set([job.printer, ...data.printers.map((p) => p.name)])].map((p) => (
                      <option key={p}>{p}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Responsável
                  <input name="assignee" required defaultValue={job.assignee} />
                </label>
                <label>
                  Tempo estimado (h)
                  <input
                    name="hours"
                    type="number"
                    min=".1"
                    step=".1"
                    required
                    defaultValue={job.hours}
                  />
                </label>
                <label>
                  Prazo
                  <input name="due" type="date" required defaultValue={job.due} />
                </label>
                <label>
                  Material
                  <input name="material" defaultValue={job.material || 'PLA'} />
                </label>
                <label>
                  Consumo previsto (g)
                  <input name="grams" type="number" min={0} defaultValue={job.grams || 0} />
                </label>
                <label>
                  Prioridade
                  <select name="priority" defaultValue={job.priority}>
                    <option>Normal</option>
                    <option>Alta</option>
                  </select>
                </label>
              </div>
              <label>
                Notas de fabricação
                <textarea name="notes" defaultValue={job.notes} />
              </label>
              <button className="btn primary" disabled={pending}>
                Salvar ordem de produção
              </button>
            </>
          )}
        </Form>
        {job.stage !== 'Pronto' && (
          <button
            className="btn secondary"
            disabled={action.pending}
            onClick={() => action.execute({ type: 'production.advance', id: job.id })}
          >
            Concluir etapa e avançar
          </button>
        )}
        <ButtonLink href={'/admin/pedidos/' + job.orderId} variant="text">
          Abrir pedido completo
        </ButtonLink>
      </div>
    );
  }
  if (r.kind === 'shipping') {
    const order = data.orders.find((o) => o.id === r.id);
    if (!order) return <p>Envio não encontrado.</p>;
    const customer = data.clients.find((c) => c.id === order.customerId);
    return (
      <div className="stack">
        <div className="drawer-record-header">
          <div>
            <h2>{order.number}</h2>
            <p>{customer?.name}</p>
          </div>
          <StatusBadge status={order.status} />
        </div>
        <section className="admin-panel">
          <h3>Destino</h3>
          <p>
            {order.address.street}, {order.address.number} {order.address.extra}
            <br />
            {order.address.district} · {order.address.city}/{order.address.state}
            <br />
            CEP {order.address.cep}
          </p>
        </section>
        <section className="admin-panel">
          <h3>Volumes e conteúdo</h3>
          {order.items.map((i) => (
            <div className="money-line" key={i.key}>
              <span>
                {i.quantity} × {i.name}
              </span>
              <span>{i.size}</span>
            </div>
          ))}
          <p>
            Frete cobrado: {money(order.shippingCents)} · {order.carrier}
          </p>
          <p>Previsão de saída: {dateLabel(order.due)}</p>
        </section>
        <section className="admin-panel stack">
          <div className="row between">
            <h3>Etiqueta Melhor Envio</h3>
            <StatusBadge status={order.labelStatus || 'Não solicitada'} />
          </div>
          <p className="notice">
            Demonstração de preparação e geração. Nenhuma etiqueta é comprada ou válida para
            postagem.
          </p>
          <div className="row wrap">
            <button
              className="btn secondary small"
              disabled={action.pending}
              onClick={() =>
                action.execute({ type: 'shipping.label', id: order.id, action: 'prepare' })
              }
            >
              Conferir e preparar
            </button>
            <button
              className="btn primary small"
              disabled={action.pending || order.labelStatus !== 'Preparada'}
              onClick={() =>
                action.execute(
                  { type: 'shipping.label', id: order.id, action: 'generate' },
                  'Etiqueta simulada gerada. Nenhuma compra realizada.',
                )
              }
            >
              Gerar etiqueta simulada
            </button>
            <button
              className="btn text"
              disabled={action.pending || !order.labelStatus}
              onClick={() =>
                action.execute({ type: 'shipping.label', id: order.id, action: 'cancel' })
              }
            >
              Cancelar etiqueta
            </button>
          </div>
        </section>
        <OrderDetail id={order.id} />
      </div>
    );
  }
  if (r.kind === 'charge') {
    const c = data.charges.find((c) => c.id === r.id);
    if (!c) return <p>Cobrança não encontrada.</p>;
    return (
      <div className="stack">
        <h2>{money(c.amountCents)}</h2>
        <StatusBadge status={c.status} />
        <dl className="detail-list">
          <div>
            <dt>Referência</dt>
            <dd>{c.id}</dd>
          </div>
          <div>
            <dt>Cliente</dt>
            <dd>{data.clients.find((x) => x.id === c.customerId)?.name}</dd>
          </div>
          <div>
            <dt>Método</dt>
            <dd>
              {c.method === 'pix' ? 'Pix' : c.method === 'split' ? 'Pix + cartão' : 'Cartão'} ·
              Mercado Pago
            </dd>
          </div>
          <div>
            <dt>Vencimento</dt>
            <dd>{dateLabel(c.due)}</dd>
          </div>
          <div>
            <dt>Pago em</dt>
            <dd>{c.paidAt ? dateLabel(c.paidAt) : 'Aguardando confirmação'}</dd>
          </div>
        </dl>
        <p>{c.description}</p>
        {c.method === 'split' && (
          <p>
            Pix: {money(c.pixCents)} · Cartão: {money(c.cardCents)}
          </p>
        )}
        {c.refundReason && <p>Motivo do estorno: {c.refundReason}</p>}
        <OrderDetail id={c.orderId} />
      </div>
    );
  }
  return <p>Registro {r.id}</p>;
}

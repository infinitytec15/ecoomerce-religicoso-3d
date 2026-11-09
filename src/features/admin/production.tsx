'use client';
import { useState } from 'react';
import Link from 'next/link';
import { RecordButton } from './record-drawer';
import type { Printer, ProductionStage } from '@/lib/domain/types';
import { useAdminData } from './admin-frame';
import {
  AdminHeading,
  AdminError,
  AdminMetrics,
  exportAdmin,
  useAdminAction,
  useAdminFilter,
} from './shared';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { StatusBadge } from '@/components/ui/status-badge';
import { Form, number, text } from '@/components/ui/form';
import { Modal } from '@/components/ui/modal';
import { DataTable } from '@/components/ui/data-table';
import { dateLabel } from '@/lib/domain/format';
import { IS_DEMO } from '@/lib/api/config';
import { AddressLabel, DispatchForm } from './orders';
export function AdminProduction() {
  const data = useAdminData(),
    action = useAdminAction(),
    [dialog, setDialog] = useState<'job' | Printer | null>(null),
    stages: ProductionStage[] = ['Fila', 'Impressão', 'Acabamento', 'Conferência'],
    available = data.orders.filter(
      (o) => o.status === 'Confirmado' && !data.jobs.some((j) => j.orderId === o.id),
    );
  return (
    <>
      <AdminHeading
        title="Produção"
        description="Da fila de impressão ao cuidado com cada peça."
        actions={
          <>
            <Button
              variant="secondary"
              className="small"
              onClick={() => exportAdmin(data, 'producao')}
            >
              Exportar fila
            </Button>
            <Button className="small" disabled={!available.length} onClick={() => setDialog('job')}>
              <Icon name="plus" />
              Nova ordem de produção
            </Button>
          </>
        }
      />
      <AdminError error={action.error} />
      <div className="admin-printers">
        {data.printers.map((p) => (
          <div key={p.id}>
            <span>
              <Icon name="box" />
              <strong>{p.name}</strong>
            </span>
            <StatusBadge status={p.status} />
            <Button variant="text" onClick={() => setDialog(p)}>
              Alterar situação
            </Button>
          </div>
        ))}
      </div>
      <div className="production-board">
        {stages.map((stage, index) => (
          <section key={stage}>
            <div className="production-column-head">
              <h2>{stage}</h2>
              <span>{data.jobs.filter((j) => j.stage === stage).length}</span>
            </div>
            {data.jobs
              .filter((j) => j.stage === stage)
              .map((j) => {
                const order = data.orders.find((o) => o.id === j.orderId);
                return (
                  <article className="production-job" key={j.id}>
                    <div className="row between">
                      <StatusBadge status={j.priority === 'Alta' ? 'Prioridade alta' : 'Normal'} />
                      <small>{j.id}</small>
                    </div>
                    <RecordButton
                      record={{ kind: 'production', id: j.id }}
                      className="production-card-title"
                    >
                      {order?.items[0]?.name || 'Cesta do clube'}
                    </RecordButton>
                    <Link href={'/admin/pedidos/' + j.orderId}>{order?.number || j.orderId}</Link>
                    <p>
                      {data.clients.find((c) => c.id === order?.customerId)?.name}
                      <br />
                      {j.printer}
                    </p>
                    <div className="row between">
                      <small>
                        {j.hours}h estimadas · {j.assignee}
                      </small>
                      <small>{dateLabel(j.due)}</small>
                    </div>
                    <Button
                      variant="secondary"
                      className="small full"
                      loading={action.pending}
                      onClick={() => action.execute({ type: 'production.advance', id: j.id })}
                    >
                      {index === 3 ? 'Aprovar para expedição' : 'Mover para ' + stages[index + 1]}{' '}
                      <Icon name="arrow" />
                    </Button>
                  </article>
                );
              })}
            {!data.jobs.some((j) => j.stage === stage) && (
              <p className="production-empty">Sem ordens nesta etapa.</p>
            )}
          </section>
        ))}
      </div>
      <section className="admin-panel" style={{ marginTop: 24 }}>
        <h2>Pedidos confirmados aguardando uma ordem</h2>
        <DataTable
          rows={available}
          columns={[
            {
              key: 'order',
              label: 'Pedido',
              render: (o) => (
                <RecordButton record={{ kind: 'order', id: o.id }}>{o.number}</RecordButton>
              ),
            },
            {
              key: 'customer',
              label: 'Cliente',
              render: (o) => data.clients.find((c) => c.id === o.customerId)?.name,
            },
            { key: 'items', label: 'Itens', render: (o) => o.items.map((i) => i.name).join(', ') },
            {
              key: 'action',
              label: '',
              render: (o) => (
                <Button
                  className="small"
                  loading={action.pending}
                  onClick={() =>
                    action.execute({
                      type: 'production.create',
                      orderId: o.id,
                      printer:
                        data.printers.find((p) => p.status !== 'Manutenção')?.name || 'A definir',
                      hours: 6,
                      assignee: 'Pedro',
                    })
                  }
                >
                  Criar ordem
                </Button>
              ),
            },
          ]}
        />
      </section>
      <Modal
        open={!!dialog}
        onOpenChange={(open) => !open && setDialog(null)}
        title={dialog === 'job' ? 'Criar ordem de produção' : 'Situação da máquina'}
      >
        {dialog === 'job' ? (
          <Form
            onSubmit={async (d) => {
              await action.run({
                type: 'production.create',
                orderId: text(d, 'orderId'),
                printer: text(d, 'printer'),
                hours: number(d, 'hours'),
                assignee: text(d, 'assignee'),
              });
              setDialog(null);
            }}
          >
            {(pending) => (
              <>
                <label>
                  Pedido confirmado
                  <select name="orderId" required>
                    {available.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.number} · {data.clients.find((c) => c.id === o.customerId)?.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Máquina
                  <select name="printer">
                    {data.printers
                      .filter((p) => p.status !== 'Manutenção')
                      .map((p) => (
                        <option key={p.id}>{p.name}</option>
                      ))}
                  </select>
                </label>
                <div className="form-grid">
                  <label>
                    Horas estimadas
                    <input
                      name="hours"
                      type="number"
                      required
                      min=".5"
                      max={100}
                      step=".5"
                      defaultValue={6}
                    />
                  </label>
                  <label>
                    Responsável
                    <input name="assignee" required defaultValue="Pedro" />
                  </label>
                </div>
                <Button loading={pending}>Criar ordem</Button>
              </>
            )}
          </Form>
        ) : (
          dialog && (
            <Form
              onSubmit={async (d) => {
                await action.run({
                  type: 'printer.update',
                  id: dialog.id,
                  status: text(d, 'status') as Printer['status'],
                });
                setDialog(null);
              }}
            >
              {(pending) => (
                <>
                  <p>{dialog.name}</p>
                  <label>
                    Situação
                    <select name="status" defaultValue={dialog.status}>
                      {['Disponível', 'Imprimindo', 'Manutenção'].map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                  </label>
                  <Button loading={pending}>Salvar situação</Button>
                </>
              )}
            </Form>
          )
        )}
      </Modal>
    </>
  );
}
export function AdminShipping() {
  const data = useAdminData(),
    action = useAdminAction(),
    [selected, setSelected] = useState<{ id: string; kind: 'dispatch' | 'label' } | null>(null),
    orders = data.orders.filter((o) =>
      ['Pronto para envio', 'Enviado', 'Entregue'].includes(o.status),
    ),
    filter = useAdminFilter(
      orders,
      (o) =>
        o.number +
        ' ' +
        o.tracking +
        ' ' +
        (data.clients.find((c) => c.id === o.customerId)?.name || ''),
      (o) => o.status,
      ['Todos', 'Pronto para envio', 'Enviado', 'Entregue'],
    ),
    order = data.orders.find((o) => o.id === selected?.id);
  return (
    <>
      <AdminHeading
        title="Expedição e envios"
        description="Prepare o endereçamento, registre o despacho e acompanhe a entrega."
        actions={
          <Button variant="secondary" className="small" onClick={() => exportAdmin(data, 'envios')}>
            Exportar envios
          </Button>
        }
      />
      <AdminMetrics
        items={[
          {
            label: 'Prontos para envio',
            value: orders.filter((o) => o.status === 'Pronto para envio').length,
          },
          { label: 'Em trânsito', value: orders.filter((o) => o.status === 'Enviado').length },
          { label: 'Entregues', value: orders.filter((o) => o.status === 'Entregue').length },
          { label: 'Frete do clube', value: 'Incluído', note: 'Regra do plano mensal' },
        ]}
      />
      <AdminError error={action.error} />
      {filter.toolbar}
      <DataTable
        rows={filter.rows}
        columns={[
          {
            key: 'order',
            label: 'Pedido / cliente',
            render: (o) => (
              <>
                <RecordButton record={{ kind: 'shipping', id: o.id }}>{o.number}</RecordButton>
                <small>{data.clients.find((c) => c.id === o.customerId)?.name}</small>
              </>
            ),
          },
          {
            key: 'address',
            label: 'Destino',
            render: (o) => o.address.city + '/' + o.address.state,
          },
          {
            key: 'tracking',
            label: 'Transportadora / rastreio',
            render: (o) => (
              <>
                {o.carrier}
                <small>{o.tracking || 'Sem rastreio'}</small>
              </>
            ),
          },
          { key: 'date', label: 'Previsão', render: (o) => dateLabel(o.due) },
          { key: 'status', label: 'Situação', render: (o) => <StatusBadge status={o.status} /> },
          {
            key: 'action',
            label: 'Ação',
            render: (o) =>
              o.status === 'Pronto para envio' ? (
                <Button
                  className="small"
                  onClick={() => setSelected({ id: o.id, kind: 'dispatch' })}
                >
                  Preparar envio
                </Button>
              ) : o.status === 'Enviado' ? (
                <Button
                  variant="secondary"
                  className="small"
                  loading={action.pending}
                  onClick={() => action.execute({ type: 'shipping.deliver', id: o.id })}
                >
                  {IS_DEMO ? 'Simular entrega' : 'Registrar entrega'}
                </Button>
              ) : (
                <Button variant="text" onClick={() => setSelected({ id: o.id, kind: 'label' })}>
                  Ver etiqueta
                </Button>
              ),
          },
        ]}
      />
      <Modal
        open={!!selected}
        onOpenChange={(open) => !open && setSelected(null)}
        title={selected?.kind === 'dispatch' ? 'Preparar envio' : 'Etiqueta de endereçamento'}
      >
        {order &&
          (selected?.kind === 'dispatch' ? (
            <DispatchForm order={order} onSuccess={() => setSelected(null)} />
          ) : (
            <AddressLabel order={order} />
          ))}
      </Modal>
    </>
  );
}

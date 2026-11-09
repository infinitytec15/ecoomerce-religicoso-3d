'use client';
import { useState } from 'react';
import Link from 'next/link';
import type { Order, OrderStatus } from '@/lib/domain/types';
import { useAdminData } from './admin-frame';
import { AdminHeading, AdminError, exportAdmin, useAdminAction, useAdminFilter } from './shared';
import { Button, ButtonLink } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table';
import { StatusBadge } from '@/components/ui/status-badge';
import { Form, text, number } from '@/components/ui/form';
import { Modal } from '@/components/ui/modal';
import { ProductImage } from '@/components/ui/product-image';
import { EmptyState } from '@/components/ui/states';
import { Icon } from '@/components/ui/icon';
import { centsFromInput, dateLabel, money, today } from '@/lib/domain/format';
import { IS_DEMO } from '@/lib/api/config';
import { ReceiptButton } from '@/features/account/shipment-card';
export const orderStatuses: OrderStatus[] = [
  'Aguardando pagamento',
  'Confirmado',
  'Em produção',
  'Em acabamento',
  'Pronto para envio',
  'Enviado',
  'Entregue',
  'Cancelado',
];
export function NewOrderForm({ onSuccess }: { onSuccess: () => void }) {
  const data = useAdminData(),
    action = useAdminAction();
  return (
    <Form
      onSubmit={async (d) => {
        await action.run(
          {
            type: 'order.create',
            customerId: text(d, 'customerId'),
            productId: text(d, 'productId'),
            quantity: number(d, 'quantity'),
            shippingCents: centsFromInput(text(d, 'shipping')),
            paid: text(d, 'payment') === 'paid',
            due: text(d, 'due'),
          },
          'Pedido criado.',
        );
        onSuccess();
      }}
    >
      {(pending) => (
        <>
          <label>
            Cliente
            <select name="customerId" required>
              {data.clients
                .filter((c) => c.status === 'Ativo')
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} · {c.email}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Produto
            <select name="productId" required>
              {data.products
                .filter((p) => p.active)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} · {money(p.priceCents)}
                  </option>
                ))}
            </select>
          </label>
          <div className="form-grid">
            <label>
              Quantidade
              <input
                name="quantity"
                type="number"
                required
                min={1}
                max={10}
                step={1}
                defaultValue={1}
              />
            </label>
            <label>
              Frete (R$)
              <input
                name="shipping"
                type="number"
                required
                min={0}
                step=".01"
                defaultValue="18.90"
              />
            </label>
            <label>
              Pagamento
              <select name="payment">
                <option value="pending">Pix pendente</option>
                <option value="paid">Cartão pago{IS_DEMO ? ' (simulado)' : ''}</option>
              </select>
            </label>
            <label>
              Expedição prevista
              <input name="due" type="date" required defaultValue={today()} />
            </label>
          </div>
          {IS_DEMO && (
            <div className="notice">
              Pedido avulso de demonstração. Nenhuma cobrança real será criada.
            </div>
          )}
          <Button loading={pending}>Criar pedido{IS_DEMO ? ' de demonstração' : ''}</Button>
        </>
      )}
    </Form>
  );
}
export function AdminOrders({ initialCreate = false }: { initialCreate?: boolean }) {
  const data = useAdminData(),
    [create, setCreate] = useState(initialCreate),
    [selected, setSelected] = useState<string[]>([]),
    [origin, setOrigin] = useState('Todos'),
    [from, setFrom] = useState(''),
    [to, setTo] = useState(''),
    batch = useAdminAction(),
    filter = useAdminFilter(
      data.orders,
      (o) =>
        o.id +
        ' ' +
        o.number +
        ' ' +
        (data.clients.find((c) => c.id === o.customerId)?.name || '') +
        ' ' +
        o.type,
      (o) => o.status,
      ['Todos', ...orderStatuses],
    );
  return (
    <>
      <AdminHeading
        title="Pedidos"
        description="Loja e clube em uma única operação."
        actions={
          <>
            <Button
              variant="secondary"
              className="small"
              onClick={() => exportAdmin(data, 'pedidos')}
            >
              Exportar CSV
            </Button>
            <Button className="small" onClick={() => setCreate(true)}>
              <Icon name="plus" />
              Novo pedido
            </Button>
          </>
        }
      />
      {filter.toolbar}
      <div className="admin-toolbar order-bulk">
        <label>
          Origem
          <select value={origin} onChange={(e) => setOrigin(e.target.value)}>
            <option>Todos</option>
            <option>Loja</option>
            <option>Clube</option>
          </select>
        </label>
        <label>
          De
          <input
            type="date"
            value={from}
            max={to || undefined}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label>
          Até
          <input
            type="date"
            value={to}
            min={from || undefined}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        <span>{selected.length} selecionados</span>
        {selected.length > 0 && (
          <>
            <Button
              variant="secondary"
              className="small"
              disabled={batch.pending}
              onClick={() =>
                batch.execute({ type: 'orders.batch', ids: selected, action: 'priority' })
              }
            >
              Priorizar
            </Button>
            <Button
              variant="secondary"
              className="small"
              disabled={batch.pending}
              onClick={() =>
                batch.execute({ type: 'orders.batch', ids: selected, action: 'production' })
              }
            >
              Enviar à produção
            </Button>
            <Button variant="text" onClick={() => setSelected([])}>
              Limpar seleção
            </Button>
          </>
        )}
      </div>
      <DataTable
        rows={filter.rows.filter(
          (o) =>
            (origin === 'Todos' || o.type === origin) &&
            (!from || o.created.slice(0, 10) >= from) &&
            (!to || o.created.slice(0, 10) <= to),
        )}
        columns={[
          {
            key: 'select',
            label: 'Selecionar',
            render: (o) => (
              <input
                type="checkbox"
                aria-label={'Selecionar ' + o.number}
                checked={selected.includes(o.id)}
                onChange={(e) =>
                  setSelected(
                    e.target.checked ? [...selected, o.id] : selected.filter((id) => id !== o.id),
                  )
                }
              />
            ),
          },
          {
            key: 'id',
            label: 'Pedido / data',
            render: (o) => (
              <>
                <Link className="admin-link" href={'/admin/pedidos/' + o.id}>
                  {o.number}
                </Link>
                <small>{dateLabel(o.created)}</small>
              </>
            ),
          },
          {
            key: 'client',
            label: 'Cliente',
            render: (o) => (
              <Link href={'/admin/clientes/' + o.customerId}>
                {data.clients.find((c) => c.id === o.customerId)?.name || 'Cliente'}
              </Link>
            ),
          },
          { key: 'origin', label: 'Origem', render: (o) => <StatusBadge status={o.type} /> },
          {
            key: 'items',
            label: 'Itens',
            render: (o) => o.items.reduce((a, x) => a + x.quantity, 0),
          },
          { key: 'total', label: 'Total', render: (o) => money(o.totalCents) },
          { key: 'status', label: 'Situação', render: (o) => <StatusBadge status={o.status} /> },
          {
            key: 'open',
            label: '',
            render: (o) => (
              <Link className="admin-row-action" href={'/admin/pedidos/' + o.id}>
                Abrir <Icon name="chevron" />
              </Link>
            ),
          },
        ]}
      />
      <Modal open={create} onOpenChange={setCreate} title="Novo pedido manual">
        <NewOrderForm onSuccess={() => setCreate(false)} />
      </Modal>
    </>
  );
}
export function DispatchForm({ order, onSuccess }: { order: Order; onSuccess: () => void }) {
  const action = useAdminAction();
  return (
    <Form
      onSubmit={async (d) => {
        await action.run(
          {
            type: 'shipping.dispatch',
            id: order.id,
            carrier: text(d, 'carrier'),
            tracking: text(d, 'tracking'),
          },
          'Pedido despachado.',
        );
        onSuccess();
      }}
    >
      {(pending) => (
        <>
          <p>{order.number}</p>
          <label>
            Transportadora
            <select
              name="carrier"
              defaultValue={
                order.carrier.includes('Correios') ? 'Correios' : 'Transportadora parceira'
              }
            >
              <option>Correios</option>
              <option>Transportadora parceira</option>
              <option>Retirada</option>
            </select>
          </label>
          <label>
            Código de rastreio{IS_DEMO ? ' fictício' : ''}
            <input
              name="tracking"
              required
              pattern="[A-Za-z0-9-]{5,40}"
              defaultValue={order.tracking || (IS_DEMO ? 'DEMO-' + order.id.slice(-8) : '')}
            />
          </label>
          {IS_DEMO && (
            <div className="notice">
              Registra uma expedição local. Nenhuma postagem, etiqueta ou remessa real será
              contratada.
            </div>
          )}
          <Button loading={pending}>
            {IS_DEMO ? 'Despachar na demonstração' : 'Registrar expedição'}
          </Button>
        </>
      )}
    </Form>
  );
}
export function AddressLabel({ order }: { order: Order }) {
  return (
    <>
      <div className="print-label">
        <h3>{IS_DEMO ? 'ETIQUETA DE DEMONSTRAÇÃO' : 'Endereço de entrega'}</h3>
        {IS_DEMO && <p>Sem validade para postagem</p>}
        <hr />
        <strong>{order.address.name}</strong>
        <p>
          {order.address.street}, {order.address.number}
          <br />
          {order.address.extra}
          <br />
          {order.address.district}
          <br />
          {order.address.city}/{order.address.state} · {order.address.cep}
        </p>
        <hr />
        <strong>{order.tracking || 'Sem rastreio'}</strong>
        <p>
          {order.number} · {order.carrier}
        </p>
      </div>
      <Button variant="secondary" style={{ marginTop: 20 }} onClick={() => window.print()}>
        Imprimir endereçamento
      </Button>
    </>
  );
}
export function AdminOrderDetail({ id }: { id: string }) {
  const data = useAdminData(),
    order = data.orders.find((o) => o.id === id),
    action = useAdminAction(),
    [dialog, setDialog] = useState<'edit' | 'dispatch' | 'label' | null>(null);
  if (!order)
    return (
      <EmptyState
        title="Pedido não encontrado."
        description="Confira a lista de pedidos da operação."
        action={<ButtonLink href="/admin/pedidos">Voltar aos pedidos</ButtonLink>}
      />
    );
  const customer = data.clients.find((c) => c.id === order.customerId),
    charge = data.charges.find((c) => c.id === order.chargeId),
    job = data.jobs.find((j) => j.orderId === order.id),
    shipped = ['Enviado', 'Entregue'].includes(order.status);
  return (
    <>
      <AdminHeading
        title={order.number}
        description={`Criado em ${dateLabel(order.created)} · ${order.type}`}
        actions={
          <>
            <ButtonLink className="small" variant="secondary" href="/admin/pedidos">
              Voltar aos pedidos
            </ButtonLink>
            <Button className="small" onClick={() => setDialog('edit')}>
              Atualizar pedido
            </Button>
          </>
        }
      />
      <AdminError error={action.error} />
      <div className="admin-detail-grid">
        <section className="admin-panel">
          <div className="row between wrap">
            <h2>Itens do pedido</h2>
            <StatusBadge status={order.status} />
          </div>
          <DataTable
            rows={order.items.map((i) => ({ ...i, id: i.key }))}
            columns={[
              {
                key: 'name',
                label: 'Peça',
                render: (i) => (
                  <div className="admin-product-cell">
                    <ProductImage src={i.image} alt={i.name} sizes="45px" />
                    <span>{i.name}</span>
                  </div>
                ),
              },
              {
                key: 'options',
                label: 'Detalhes',
                render: (i) => (
                  <>
                    {i.color} · {i.size}
                    {i.dedication && <small>“{i.dedication}”</small>}
                  </>
                ),
              },
              { key: 'quantity', label: 'Qtd.', render: (i) => i.quantity },
              { key: 'price', label: 'Valor', render: (i) => money(i.unitCents * i.quantity) },
            ]}
          />
          <div className="admin-order-total">
            <span>Total cobrado {order.type === 'Clube' ? 'no plano mensal' : ''}</span>
            <strong>{money(order.totalCents)}</strong>
          </div>
          <div className="admin-inline-actions">
            {['Confirmado', 'Em produção', 'Em acabamento'].includes(order.status) && (
              <Button
                className="small"
                disabled={!!job || action.pending}
                onClick={() =>
                  action.execute({
                    type: 'production.create',
                    orderId: order.id,
                    printer:
                      data.printers.find((p) => p.status !== 'Manutenção')?.name || 'A definir',
                    hours: 6,
                    assignee: 'Pedro',
                  })
                }
              >
                {job ? 'Já está na produção' : 'Enviar para produção'}
              </Button>
            )}
            {order.status === 'Pronto para envio' && (
              <Button className="small" onClick={() => setDialog('dispatch')}>
                Preparar envio
              </Button>
            )}
            {order.tracking && (
              <Button variant="secondary" className="small" onClick={() => setDialog('label')}>
                Ver etiqueta de endereçamento
              </Button>
            )}
          </div>
          <h3 style={{ marginTop: 25 }}>Observações internas</h3>
          <p className="admin-note">{order.notes || 'Nenhuma observação adicionada.'}</p>
        </section>
        <aside className="stack">
          <section className="admin-panel">
            <h2>Cliente e entrega</h2>
            {customer && (
              <Link className="admin-link" href={'/admin/clientes/' + customer.id}>
                {customer.name}
              </Link>
            )}
            <p>{customer?.email || order.address.email}</p>
            <hr />
            <p>
              {order.address.street}, {order.address.number}
              <br />
              {order.address.city}/{order.address.state} · {order.address.cep}
            </p>
            <small>Expedição prevista: {dateLabel(order.due)}</small>
          </section>
          <section className="admin-panel">
            <h2>Pagamento</h2>
            {charge ? (
              <>
                <StatusBadge status={charge.status} />
                <p>
                  {money(charge.amountCents)} ·{' '}
                  {charge.method === 'split'
                    ? 'Pix + cartão'
                    : charge.method === 'card'
                      ? 'Cartão'
                      : 'Pix'}
                </p>
                {['Pendente', 'Recusado'].includes(charge.status) && (
                  <Button
                    className="small full"
                    loading={action.pending}
                    onClick={() => action.execute({ type: 'charge.pay', id: charge.id })}
                  >
                    {IS_DEMO ? 'Simular recebimento' : 'Registrar recebimento'}
                  </Button>
                )}
                <ReceiptButton charge={charge} />
              </>
            ) : (
              <p>Sem cobrança associada.</p>
            )}
            <Link className="text-btn" href="/admin/financeiro">
              Abrir financeiro
            </Link>
            {order.subscriptionId && (
              <Link className="text-btn" href={'/admin/assinaturas/' + order.subscriptionId}>
                Ver assinatura vinculada
              </Link>
            )}
          </section>
        </aside>
      </div>
      <Modal
        open={dialog === 'edit'}
        onOpenChange={(open) => !open && setDialog(null)}
        title="Atualizar pedido"
      >
        <Form
          onSubmit={async (d) => {
            await action.run({
              type: 'order.update',
              id: order.id,
              status: (text(d, 'status') || order.status) as OrderStatus,
              priority: text(d, 'priority') as 'Normal' | 'Alta',
              due: text(d, 'due'),
              notes: text(d, 'notes'),
            });
            setDialog(null);
          }}
        >
          {(pending) => (
            <>
              <label>
                Situação
                <select name="status" defaultValue={order.status} disabled={shipped}>
                  {orderStatuses.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
              <div className="form-grid">
                <label>
                  Prioridade
                  <select name="priority" defaultValue={order.priority}>
                    <option>Normal</option>
                    <option>Alta</option>
                  </select>
                </label>
                <label>
                  Expedição prevista
                  <input name="due" type="date" required defaultValue={order.due} />
                </label>
              </div>
              <label>
                Observações internas
                <textarea name="notes" maxLength={1000} defaultValue={order.notes} />
              </label>
              <div className="notice">
                Pagamentos e estornos são registrados no Financeiro. Rastreamento e despacho ficam
                na Expedição.
              </div>
              <Button loading={pending}>Salvar pedido</Button>
            </>
          )}
        </Form>
      </Modal>
      <Modal
        open={dialog === 'dispatch'}
        onOpenChange={(open) => !open && setDialog(null)}
        title="Preparar envio"
      >
        <DispatchForm order={order} onSuccess={() => setDialog(null)} />
      </Modal>
      <Modal
        open={dialog === 'label'}
        onOpenChange={(open) => !open && setDialog(null)}
        title="Etiqueta de endereçamento"
      >
        <AddressLabel order={order} />
      </Modal>
    </>
  );
}

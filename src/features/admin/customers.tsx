'use client';
import { DeleteRecordButton } from './delete-record';
import { useState } from 'react';
import Link from 'next/link';
import type { Customer } from '@/lib/domain/types';
import { useAdminData } from './admin-frame';
import { AdminHeading, AdminError, exportAdmin, useAdminAction, useAdminFilter } from './shared';
import { Button, ButtonLink } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table';
import { Form, text } from '@/components/ui/form';
import { Modal } from '@/components/ui/modal';
import { StatusBadge } from '@/components/ui/status-badge';
import { EmptyState } from '@/components/ui/states';
import { Icon } from '@/components/ui/icon';
import { money } from '@/lib/domain/format';
function CustomerForm({ customer, onSuccess }: { customer?: Customer; onSuccess: () => void }) {
  const action = useAdminAction();
  return (
    <Form
      onSubmit={async (d) => {
        await action.run({
          type: 'customer.save',
          customer: {
            id: customer?.id,
            name: text(d, 'name'),
            email: text(d, 'email'),
            phone: text(d, 'phone'),
            cep: text(d, 'cep'),
            street: text(d, 'street'),
            number: text(d, 'number'),
            city: text(d, 'city'),
            state: text(d, 'state'),
            district: text(d, 'district'),
            notes: text(d, 'notes'),
          },
        });
        onSuccess();
      }}
    >
      {(pending) => (
        <>
          <div className="form-grid">
            {(
              [
                ['name', 'Nome', customer?.name || ''],
                ['email', 'E-mail', customer?.email || ''],
                ['phone', 'Telefone', customer?.phone || ''],
                ['cep', 'CEP', customer?.cep || '01001-000'],
                ['street', 'Rua', customer?.street || 'Rua Exemplo'],
                ['number', 'Número', customer?.number || '123'],
                ['district', 'Bairro', customer?.district || 'Centro'],
                ['city', 'Cidade', customer?.city || 'São Paulo'],
                ['state', 'Estado', customer?.state || 'SP'],
              ] as const
            ).map(([name, label, value]) => (
              <label key={name}>
                {label}
                <input
                  name={name}
                  type={name === 'email' ? 'email' : 'text'}
                  required={name !== 'phone'}
                  minLength={name === 'name' ? 2 : undefined}
                  pattern={name === 'cep' ? '[0-9]{5}-?[0-9]{3}' : undefined}
                  maxLength={name === 'state' ? 2 : 200}
                  defaultValue={value}
                />
              </label>
            ))}
          </div>
          <label>
            Observações
            <textarea name="notes" maxLength={1000} defaultValue={customer?.notes || ''} />
          </label>
          <Button loading={pending}>Salvar cliente</Button>
        </>
      )}
    </Form>
  );
}
export function AdminCustomers() {
  const data = useAdminData(),
    [open, setOpen] = useState(false),
    filter = useAdminFilter(
      data.clients,
      (c) => c.name + ' ' + c.email + ' ' + c.id,
      (c) => c.status,
      ['Todos', 'Ativo', 'Inativo'],
    );
  return (
    <>
      <AdminHeading
        title="Clientes"
        description="Histórico de compras, assinaturas e atendimento."
        actions={
          <>
            <Button
              variant="secondary"
              className="small"
              onClick={() => exportAdmin(data, 'clientes')}
            >
              Exportar CSV
            </Button>
            <Button className="small" onClick={() => setOpen(true)}>
              <Icon name="plus" />
              Novo cliente
            </Button>
          </>
        }
      />
      {filter.toolbar}
      <DataTable
        rows={filter.rows}
        columns={[
          {
            key: 'name',
            label: 'Cliente',
            render: (c) => (
              <>
                <Link className="admin-link" href={'/admin/clientes/' + c.id}>
                  {c.name}
                </Link>
                <small>{c.id}</small>
              </>
            ),
          },
          { key: 'contact', label: 'Contato', render: (c) => c.email },
          { key: 'location', label: 'Localização', render: (c) => c.city + '/' + c.state },
          {
            key: 'club',
            label: 'Clube',
            render: (c) => {
              const sub = data.subscriptions.find(
                (s) => s.customerId === c.id && s.status !== 'Cancelada',
              );
              return sub ? <StatusBadge status={sub.status} /> : 'Avulso';
            },
          },
          {
            key: 'total',
            label: 'Compras confirmadas',
            render: (c) =>
              money(
                data.charges
                  .filter((ch) => ch.customerId === c.id && ch.status === 'Pago')
                  .reduce((a, ch) => a + ch.amountCents, 0),
              ),
          },
          { key: 'status', label: 'Situação', render: (c) => <StatusBadge status={c.status} /> },
          {
            key: 'open',
            label: '',
            render: (c) => (
              <Link className="admin-row-action" href={'/admin/clientes/' + c.id}>
                Abrir <Icon name="chevron" />
              </Link>
            ),
          },
        ]}
      />
      <Modal open={open} onOpenChange={setOpen} title="Novo cliente">
        <CustomerForm onSuccess={() => setOpen(false)} />
      </Modal>
    </>
  );
}
export function AdminCustomerDetail({ id }: { id: string }) {
  const data = useAdminData(),
    customer = data.clients.find((c) => c.id === id),
    [dialog, setDialog] = useState<'edit' | 'archive' | null>(null),
    action = useAdminAction();
  if (!customer)
    return (
      <EmptyState
        title="Cliente não encontrado."
        description="Confira os cadastros disponíveis."
        action={<ButtonLink href="/admin/clientes">Voltar aos clientes</ButtonLink>}
      />
    );
  const orders = data.orders.filter((o) => o.customerId === id),
    subs = data.subscriptions.filter((s) => s.customerId === id),
    total = data.charges
      .filter((c) => c.customerId === id && c.status === 'Pago')
      .reduce((a, c) => a + c.amountCents, 0);
  return (
    <>
      <AdminHeading
        title={customer.name}
        description={customer.id + ' · histórico de relacionamento'}
        actions={
          <>
            <ButtonLink className="small" variant="secondary" href="/admin/clientes">
              Voltar
            </ButtonLink>
            <Button className="small" onClick={() => setDialog('edit')}>
              Editar cadastro
            </Button>
            <DeleteRecordButton
              command={{ type: 'customer.delete', id: customer.id }}
              label="Excluir cliente"
              what={customer.name}
              redirectTo="/admin/clientes"
            />
          </>
        }
      />
      <AdminError error={action.error} />
      <div className="admin-detail-grid">
        <section className="admin-panel">
          <h2>Histórico de relacionamento</h2>
          <div className="metrics-inline">
            <div>
              <strong>{orders.length}</strong>
              <small>pedidos</small>
            </div>
            <div>
              <strong>{money(total)}</strong>
              <small>recebimentos confirmados</small>
            </div>
            <div>
              <strong>{subs.length}</strong>
              <small>assinaturas</small>
            </div>
          </div>
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
              { key: 'type', label: 'Origem', render: (o) => o.type },
              { key: 'total', label: 'Total', render: (o) => money(o.totalCents) },
              {
                key: 'status',
                label: 'Situação',
                render: (o) => <StatusBadge status={o.status} />,
              },
            ]}
          />
          <h3>Assinaturas</h3>
          {subs.length ? (
            subs.map((s) => (
              <Link className="admin-client-sub" key={s.id} href={'/admin/assinaturas/' + s.id}>
                {s.id} <StatusBadge status={s.status} />
                <small>
                  {s.profile} · {money(s.priceCents)}/mês
                </small>
              </Link>
            ))
          ) : (
            <p>Cliente sem assinatura.</p>
          )}
        </section>
        <aside className="admin-panel">
          <h2>Cadastro</h2>
          <StatusBadge status={customer.status} />
          <p>
            {customer.email}
            <br />
            {customer.phone || 'Telefone não informado'}
          </p>
          <hr />
          <p>
            {customer.street}, {customer.number}
            <br />
            {customer.city}/{customer.state} · {customer.cep}
          </p>
          <h3>Nota interna</h3>
          <p className="admin-note">{customer.notes || 'Nenhuma anotação.'}</p>
          <Button className="full small" variant="secondary" onClick={() => setDialog('archive')}>
            {customer.status === 'Ativo' ? 'Arquivar cadastro' : 'Reativar cadastro'}
          </Button>
        </aside>
      </div>
      <Modal
        open={dialog === 'edit'}
        onOpenChange={(open) => !open && setDialog(null)}
        title="Editar cadastro"
      >
        <CustomerForm customer={customer} onSuccess={() => setDialog(null)} />
      </Modal>
      <Modal
        open={dialog === 'archive'}
        onOpenChange={(open) => !open && setDialog(null)}
        title={customer.status === 'Ativo' ? 'Arquivar cadastro' : 'Reativar cadastro'}
      >
        <p>
          O cadastro ficará {customer.status === 'Ativo' ? 'inativo' : 'ativo'}. Pedidos,
          assinaturas e atendimentos continuam no histórico.
        </p>
        <Form
          onSubmit={async () => {
            await action.run({ type: 'customer.archive', id: customer.id });
            setDialog(null);
          }}
        >
          {(pending) => <Button loading={pending}>Confirmar alteração</Button>}
        </Form>
      </Modal>
    </>
  );
}

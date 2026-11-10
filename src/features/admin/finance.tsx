'use client';
import { useAdminOverview } from './server-data';
import { useState } from 'react';
import { useAdminData } from './admin-frame';
import { AdminAnalytics } from './analytics';
import { RecordButton } from './record-drawer';
import {
  AdminHeading,
  AdminMetrics,
  AdminError,
  exportAdmin,
  useAdminAction,
  useAdminFilter,
} from './shared';
import { financialSummary } from '@/lib/domain/commerce';
import { centsFromInput, dateLabel, money, today } from '@/lib/domain/format';
import { IS_DEMO } from '@/lib/api/config';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Modal } from '@/components/ui/modal';
import { Form, text } from '@/components/ui/form';
import { DataTable } from '@/components/ui/data-table';
import { StatusBadge } from '@/components/ui/status-badge';
import { ReceiptButton } from '@/features/account/shipment-card';
export function AdminFinance() {
  const totals = useAdminOverview();
  const data = useAdminData(),
    f = financialSummary(data),
    action = useAdminAction(),
    [dialog, setDialog] = useState<{ kind: 'expense' | 'refund'; id?: string } | null>(null),
    filter = useAdminFilter(
      data.charges,
      (c) =>
        c.id +
        ' ' +
        c.description +
        ' ' +
        (data.clients.find((x) => x.id === c.customerId)?.name || ''),
      (c) => c.status,
      ['Todos', 'Pago', 'Pendente', 'Recusado', 'Estornado', 'Cancelada'],
    );
  return (
    <>
      <AdminHeading
        title="Financeiro"
        description="Recebimentos, cobranças, despesas e resultado da operação."
        actions={
          <>
            <Button
              className="small"
              variant="secondary"
              onClick={() => exportAdmin(data, 'financeiro')}
            >
              Exportar transações
            </Button>
            <Button className="small" onClick={() => setDialog({ kind: 'expense' })}>
              <Icon name="plus" />
              Registrar despesa
            </Button>
          </>
        }
      />
      <AdminMetrics
        items={[
          {
            label: 'Recebido',
            value: IS_DEMO ? money(f.paid) : totals.data ? money(totals.data.grossCents) : '—',
            note: 'Recebimentos no mês de Brasília',
          },
          {
            label: 'A receber',
            value: IS_DEMO ? money(f.pending) : totals.data ? money(totals.data.pendingCents) : '—',
            note: 'Cobranças pendentes',
          },
          {
            label: 'Despesas pagas',
            value: IS_DEMO
              ? money(f.expenses)
              : totals.data
                ? money(totals.data.expensesCents)
                : '—',
            note: 'Despesas e taxas no mês',
          },
          {
            label: IS_DEMO ? 'Resultado simulado' : 'Resultado',
            value: IS_DEMO ? money(f.net) : totals.data ? money(totals.data.netCents) : '—',
            note: 'Recebimentos menos saídas e estornos no mês',
          },
        ]}
      />
      <AdminAnalytics finance />
      <AdminError error={action.error} />
      <section className="admin-panel">
        <h2>Cobranças e transações</h2>
        {filter.toolbar}
        <DataTable
          rows={filter.rows}
          columns={[
            {
              key: 'id',
              label: 'Cobrança / descrição',
              render: (c) => (
                <>
                  <RecordButton record={{ kind: 'charge', id: c.id }}>{c.id}</RecordButton>
                  <small>{c.description}</small>
                </>
              ),
            },
            {
              key: 'customer',
              label: 'Cliente',
              render: (c) => data.clients.find((x) => x.id === c.customerId)?.name,
            },
            { key: 'due', label: 'Vencimento', render: (c) => dateLabel(c.due) },
            {
              key: 'method',
              label: 'Método',
              render: (c) =>
                c.method === 'split' ? 'Pix + cartão' : c.method === 'card' ? 'Cartão' : 'Pix',
            },
            { key: 'amount', label: 'Valor', render: (c) => money(c.amountCents) },
            { key: 'status', label: 'Situação', render: (c) => <StatusBadge status={c.status} /> },
            {
              key: 'action',
              label: '',
              render: (c) =>
                ['Pendente', 'Recusado'].includes(c.status) ? (
                  <Button
                    className="small"
                    loading={action.pending}
                    onClick={() => action.execute({ type: 'charge.pay', id: c.id })}
                  >
                    {IS_DEMO ? 'Simular recebimento' : 'Registrar recebimento'}
                  </Button>
                ) : c.status === 'Pago' ? (
                  <Button variant="text" onClick={() => setDialog({ kind: 'refund', id: c.id })}>
                    {IS_DEMO ? 'Simular estorno' : 'Registrar estorno'}
                  </Button>
                ) : (
                  <ReceiptButton charge={c} />
                ),
            },
          ]}
        />
      </section>
      <section className="admin-panel" style={{ marginTop: 24 }}>
        <div className="admin-panel-heading">
          <h2>Despesas e compromissos</h2>
          {IS_DEMO && <small>Sem movimentação bancária real</small>}
        </div>
        <DataTable
          rows={data.expenses}
          columns={[
            { key: 'name', label: 'Descrição', render: (e) => e.name },
            { key: 'category', label: 'Centro de custo', render: (e) => e.category },
            { key: 'date', label: 'Data', render: (e) => dateLabel(e.date) },
            { key: 'amount', label: 'Valor', render: (e) => money(e.amountCents) },
            { key: 'status', label: 'Situação', render: (e) => <StatusBadge status={e.status} /> },
            {
              key: 'action',
              label: '',
              render: (e) =>
                e.status === 'Previsto' ? (
                  <Button
                    variant="text"
                    loading={action.pending}
                    onClick={() => action.execute({ type: 'expense.pay', id: e.id })}
                  >
                    Marcar como paga
                  </Button>
                ) : (
                  '—'
                ),
            },
          ]}
        />
      </section>
      <Modal
        open={!!dialog}
        onOpenChange={(open) => !open && setDialog(null)}
        title={dialog?.kind === 'refund' ? 'Registrar estorno' : 'Lançar despesa'}
      >
        {dialog?.kind === 'refund' ? (
          <Form
            onSubmit={async (d) => {
              await action.run({
                type: 'charge.refund',
                id: dialog.id!,
                reason: text(d, 'reason'),
              });
              setDialog(null);
            }}
          >
            {(pending) => (
              <>
                <p>
                  O registro financeiro ficará como Estornado.
                  {IS_DEMO ? ' Nenhum valor real será movimentado.' : ''}
                </p>
                <label>
                  Motivo
                  <textarea name="reason" required minLength={5} maxLength={500} />
                </label>
                <Button variant="danger" loading={pending}>
                  Confirmar estorno{IS_DEMO ? ' simulado' : ''}
                </Button>
              </>
            )}
          </Form>
        ) : (
          <Form
            onSubmit={async (d) => {
              await action.run({
                type: 'expense.create',
                expense: {
                  name: text(d, 'name'),
                  amountCents: centsFromInput(text(d, 'amount')),
                  category: text(d, 'category'),
                  date: text(d, 'date'),
                  status: text(d, 'status') as 'Previsto' | 'Pago',
                },
              });
              setDialog(null);
            }}
          >
            {(pending) => (
              <>
                <label>
                  Descrição
                  <input name="name" required minLength={3} />
                </label>
                <div className="form-grid">
                  <label>
                    Valor (R$)
                    <input name="amount" type="number" required min=".01" step=".01" />
                  </label>
                  <label>
                    Data
                    <input name="date" type="date" required defaultValue={today()} />
                  </label>
                  <label>
                    Categoria
                    <select name="category">
                      {['Produção', 'Embalagem', 'Frete', 'Operação', 'Outros'].map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Situação
                    <select name="status">
                      <option>Previsto</option>
                      <option>Pago</option>
                    </select>
                  </label>
                </div>
                <Button loading={pending}>Salvar despesa</Button>
              </>
            )}
          </Form>
        )}
      </Modal>
    </>
  );
}

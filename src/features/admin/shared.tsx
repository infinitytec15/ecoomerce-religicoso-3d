'use client';
import { useState, type ReactNode } from 'react';
import { useCommand } from '@/lib/api/query';
import type { AdminCommand, Operations } from '@/lib/domain/types';
import { downloadCsv } from '@/lib/domain/format';
import { errorMessage } from '@/lib/api/contracts';
import { useNotify } from '@/components/ui/feedback';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
export function AdminHeading({
  title,
  description,
  actions,
}: {
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <div className="admin-page-heading">
      <div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <div className="row wrap">{actions}</div>
    </div>
  );
}
export function AdminMetrics({
  items,
}: {
  items: { label: string; value: ReactNode; note?: string }[];
}) {
  return (
    <div className="admin-stats">
      {items.map((item) => (
        <div className="admin-stat" key={item.label}>
          <span>{item.label}</span>
          <strong>{item.value}</strong>
          <small>{item.note || 'Registros da operação'}</small>
        </div>
      ))}
    </div>
  );
}
export function AdminError({ error }: { error: unknown }) {
  return error ? (
    <p className="form-error" role="alert">
      {errorMessage(error)}
    </p>
  ) : null;
}
export function useAdminAction() {
  const mutation = useCommand((g, command: AdminCommand) => g.adminCommand(command)),
    notify = useNotify();
  return {
    pending: mutation.isPending,
    error: mutation.error,
    run: async (command: AdminCommand, message = 'Alteração salva.') => {
      await mutation.mutateAsync(command);
      notify(message);
    },
    execute: (command: AdminCommand, message = 'Alteração salva.') =>
      mutation.mutate(command, {
        onSuccess: () => notify(message),
        onError: (error) => notify(errorMessage(error)),
      }),
  };
}
export function useAdminFilter<T>(
  rows: T[],
  searchable: (row: T) => string,
  statusOf: (row: T) => string = () => '',
  statuses = ['Todos'],
) {
  const [search, setSearch] = useState(''),
    [status, setStatus] = useState('Todos');
  return {
    rows: rows.filter(
      (row) =>
        (status === 'Todos' || statusOf(row) === status) &&
        (!search ||
          searchable(row).toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR'))),
    ),
    toolbar: (
      <form className="admin-toolbar" onSubmit={(e) => e.preventDefault()}>
        <div className="admin-search-box">
          <Icon name="search" />
          <input
            type="search"
            name="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar nesta lista"
            aria-label="Buscar nesta lista"
          />
        </div>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          aria-label="Filtrar por situação"
        >
          {statuses.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <Button variant="secondary" className="small">
          Buscar
        </Button>
        <Button
          type="button"
          variant="text"
          onClick={() => {
            setSearch('');
            setStatus('Todos');
          }}
        >
          Limpar
        </Button>
      </form>
    ),
  };
}
export function AuditList({ entries }: { entries: Operations['audit'] }) {
  return (
    <div className="admin-audit">
      {entries.map((a) => (
        <div key={a.id}>
          <span>
            <Icon name="check" />
          </span>
          <p>
            <strong>{a.action}</strong>
            <small>
              {a.actor} · {a.entity}
            </small>
          </p>
          <time>{new Date(a.date).toLocaleString('pt-BR')}</time>
        </div>
      ))}
    </div>
  );
}
const csvMoney = (cents: number) => (cents / 100).toFixed(2).replace('.', ',');
export function exportAdmin(state: Operations, kind: string) {
  const client = (id: string) => state.clients.find((c) => c.id === id)?.name || 'Cliente';
  let headers: string[], rows: (string | number | undefined)[][];
  switch (kind) {
    case 'clientes':
      headers = ['Cliente', 'Nome', 'E-mail', 'Cidade', 'Situação'];
      rows = state.clients.map((c) => [c.id, c.name, c.email, c.city, c.status]);
      break;
    case 'assinaturas':
      headers = ['Contrato', 'Cliente', 'Perfil', 'Mensalidade (R$)', 'Situação', 'Renovação'];
      rows = state.subscriptions.map((s) => [
        s.id,
        client(s.customerId),
        s.profile,
        csvMoney(s.priceCents),
        s.status,
        s.nextRenewal,
      ]);
      break;
    case 'producao':
      headers = ['Ordem', 'Pedido', 'Etapa', 'Máquina', 'Horas', 'Responsável'];
      rows = state.jobs.map((j) => [j.id, j.orderId, j.stage, j.printer, j.hours, j.assignee]);
      break;
    case 'produtos':
      headers = ['SKU', 'Produto', 'Preço (R$)', 'Estoque', 'Custo (R$)', 'Publicado'];
      rows = state.products.map((p) => [
        p.sku,
        p.name,
        csvMoney(p.priceCents),
        p.stock,
        csvMoney(p.costCents),
        p.active ? 'Sim' : 'Não',
      ]);
      break;
    case 'financeiro':
      headers = [
        'Cobrança',
        'Cliente',
        'Descrição',
        'Valor (R$)',
        'Situação',
        'Vencimento',
        'Método',
      ];
      rows = state.charges.map((c) => [
        c.id,
        client(c.customerId),
        c.description,
        csvMoney(c.amountCents),
        c.status,
        c.due,
        c.method,
      ]);
      break;
    default:
      headers = ['Pedido', 'Cliente', 'Origem', 'Total (R$)', 'Situação', 'Rastreio'];
      rows = state.orders
        .filter(
          (o) =>
            kind !== 'envios' || ['Pronto para envio', 'Enviado', 'Entregue'].includes(o.status),
        )
        .map((o) => [
          o.number,
          client(o.customerId),
          o.type,
          csvMoney(o.totalCents),
          o.status,
          o.tracking,
        ]);
  }
  downloadCsv(kind, headers, rows);
}

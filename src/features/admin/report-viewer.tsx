'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { HttpClient } from '@/lib/api/http';
import { errorMessage } from '@/lib/api/contracts';
import { money } from '@/lib/domain/format';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { StatusBadge } from '@/components/ui/status-badge';

type Row = Record<string, unknown>;
type Column = { label: string; value: (row: Row) => unknown; kind?: 'money' | 'date' | 'status' };

const pageSchema = z.object({
  items: z.array(z.record(z.string(), z.unknown())),
  total: z.number(),
  nextCursor: z.string().nullable(),
  summary: z
    .object({
      metrics: z.array(
        z.object({ label: z.string(), cents: z.number().optional(), value: z.number().optional() }),
      ),
      breakdown: z.array(
        z.object({ label: z.string(), count: z.number(), cents: z.number().optional() }),
      ),
    })
    .optional(),
});

const num = (v: unknown) => (typeof v === 'number' ? v : Number(v) || 0);
const str = (v: unknown) => (v === null || v === undefined ? '' : String(v));
const short = (v: unknown) => str(v).slice(0, 8).toUpperCase();
const place = (r: Row) => {
  const a = (r.address as Row | undefined) || r;
  return [str(a.city), str(a.state)].filter(Boolean).join('/');
};
const qty = (r: Row) =>
  Array.isArray(r.items) ? r.items.reduce((n: number, i) => n + num((i as Row).quantity), 0) : 0;
const margin = (r: Row) => {
  const price = num(r.priceCents),
    cost = num(r.costCents);
  return price ? `${Math.round(((price - cost) / price) * 1000) / 10}%` : '—';
};

/** Columns written for people: names, places, R$ and dates instead of raw fields. */
const columns: Record<string, Column[]> = {
  orders: [
    { label: 'Pedido', value: (r) => r.number },
    { label: 'Data', value: (r) => r.created, kind: 'date' },
    { label: 'Cliente', value: (r) => (r.address as Row | undefined)?.name },
    { label: 'Destino', value: place },
    { label: 'Peças', value: qty },
    { label: 'Total', value: (r) => r.totalCents, kind: 'money' },
    { label: 'Situação', value: (r) => r.status, kind: 'status' },
    { label: 'Transportadora', value: (r) => r.carrier },
    { label: 'Rastreio', value: (r) => r.tracking },
  ],
  subscriptions: [
    { label: 'Contrato', value: (r) => short(r.id) },
    { label: 'Perfil', value: (r) => r.profile },
    { label: 'Acabamento', value: (r) => r.finish },
    { label: 'Mensalidade', value: (r) => r.priceCents, kind: 'money' },
    { label: 'Pagamento', value: (r) => (r.payment === 'card' ? 'Cartão' : 'Pix') },
    { label: 'Situação', value: (r) => r.status, kind: 'status' },
    { label: 'Renovação', value: (r) => r.nextRenewal, kind: 'date' },
    { label: 'Desde', value: (r) => r.created, kind: 'date' },
  ],
  customers: [
    { label: 'Nome', value: (r) => r.name },
    { label: 'E-mail', value: (r) => r.email },
    { label: 'Telefone', value: (r) => r.phone },
    { label: 'Cidade', value: place },
    { label: 'Situação', value: (r) => r.status, kind: 'status' },
    { label: 'Cadastro', value: (r) => r.created, kind: 'date' },
  ],
  products: [
    { label: 'SKU', value: (r) => r.sku },
    { label: 'Produto', value: (r) => r.name },
    { label: 'Coleção', value: (r) => r.category },
    { label: 'Preço', value: (r) => r.priceCents, kind: 'money' },
    { label: 'Custo', value: (r) => r.costCents, kind: 'money' },
    { label: 'Lucro/peça', value: (r) => num(r.priceCents) - num(r.costCents), kind: 'money' },
    { label: 'Margem', value: margin },
    { label: 'Estoque', value: (r) => r.stock },
    { label: 'Publicado', value: (r) => (r.active ? 'Sim' : 'Não') },
  ],
  production: [
    { label: 'Pedido', value: (r) => short(r.orderId) },
    { label: 'Etapa', value: (r) => r.stage, kind: 'status' },
    { label: 'Máquina', value: (r) => r.printer },
    { label: 'Responsável', value: (r) => r.assignee },
    { label: 'Horas', value: (r) => r.hours },
    { label: 'Prazo', value: (r) => r.due, kind: 'date' },
  ],
  shipping: [
    { label: 'Pedido', value: (r) => short(r.orderId) },
    { label: 'Situação', value: (r) => r.status, kind: 'status' },
    { label: 'Transportadora', value: (r) => r.carrier },
    { label: 'Rastreio', value: (r) => r.tracking },
    { label: 'Criado em', value: (r) => r.createdAt, kind: 'date' },
  ],
  finance: [
    { label: 'Data', value: (r) => r.createdAt, kind: 'date' },
    { label: 'Lançamento', value: (r) => r.kind, kind: 'status' },
    { label: 'Valor', value: (r) => r.amountCents, kind: 'money' },
    { label: 'Cobrança', value: (r) => short(r.intentId) },
  ],
  expenses: [
    { label: 'Data', value: (r) => r.date, kind: 'date' },
    { label: 'Despesa', value: (r) => r.name },
    { label: 'Categoria', value: (r) => r.category },
    { label: 'Valor', value: (r) => r.amountCents, kind: 'money' },
    { label: 'Situação', value: (r) => r.status, kind: 'status' },
  ],
  support: [
    { label: 'Abertura', value: (r) => r.created, kind: 'date' },
    { label: 'Assunto', value: (r) => r.subject },
    { label: 'Categoria', value: (r) => r.category },
    { label: 'Situação', value: (r) => r.status, kind: 'status' },
    { label: 'Prioridade', value: (r) => r.priority },
    { label: 'Responsável', value: (r) => r.assignee },
    { label: 'Mensagens', value: (r) => (Array.isArray(r.messages) ? r.messages.length : 0) },
  ],
  prayers: [
    { label: 'Data', value: (r) => r.created, kind: 'date' },
    { label: 'Categoria', value: (r) => r.category },
    { label: 'Situação', value: (r) => r.moderation, kind: 'status' },
    { label: 'Orações', value: (r) => r.reactions },
    { label: 'Sinalizações', value: (r) => (Array.isArray(r.reports) ? r.reports.length : 0) },
  ],
  campaigns: [
    { label: 'Assunto', value: (r) => r.subject },
    { label: 'Situação', value: (r) => r.state, kind: 'status' },
    { label: 'Agendada para', value: (r) => r.scheduledAt, kind: 'date' },
    { label: 'Público', value: (r) => r.audience },
    { label: 'Enviados', value: (r) => r.recipients },
  ],
  editions: [
    { label: 'Edição', value: (r) => r.name },
    { label: 'Mês', value: (r) => r.month },
    { label: 'Situação', value: (r) => r.status, kind: 'status' },
    { label: 'Ativa', value: (r) => (r.active ? 'Sim' : 'Não') },
  ],
  team: [
    { label: 'Nome', value: (r) => r.name },
    { label: 'E-mail', value: (r) => r.email },
    { label: 'Perfil', value: (r) => r.role },
    { label: 'Acesso', value: (r) => (r.enabled ? 'Ativo' : 'Desativado') },
    { label: 'Desde', value: (r) => r.createdAt, kind: 'date' },
  ],
  audit: [
    { label: 'Data', value: (r) => r.createdAt, kind: 'date' },
    { label: 'Ação', value: (r) => r.action },
    { label: 'Registro', value: (r) => short(r.entityId || r.entity) },
    { label: 'Responsável', value: (r) => short(r.actorId || r.actor) },
  ],
};
const searchable = new Set(['orders', 'customers', 'products', 'support', 'expenses', 'campaigns']);
const searchHint: Record<string, string> = {
  orders: 'Número do pedido',
  customers: 'Nome ou e-mail',
  products: 'Nome ou SKU',
  support: 'Assunto',
  expenses: 'Descrição',
  campaigns: 'Assunto',
};

function cell(column: Column, row: Row) {
  const v = column.value(row);
  if (v === null || v === undefined || v === '') return '—';
  if (column.kind === 'money') return money(num(v));
  if (column.kind === 'date') {
    const d = new Date(str(v).length === 10 ? str(v) + 'T12:00:00' : str(v));
    return Number.isNaN(d.getTime()) ? str(v) : d.toLocaleDateString('pt-BR');
  }
  if (column.kind === 'status') return <StatusBadge status={str(v)} />;
  return typeof v === 'object' ? JSON.stringify(v).slice(0, 80) : str(v);
}

export function ReportViewer({
  resource,
  title,
  filters,
  onClose,
}: {
  resource: string;
  title: string;
  filters: Record<string, string>;
  onClose: () => void;
}) {
  const [cursors, setCursors] = useState<string[]>([]),
    [draft, setDraft] = useState(''),
    [search, setSearch] = useState(''),
    cursor = cursors.at(-1),
    limit = 25;
  const page = useQuery({
    queryKey: ['admin', 'report', resource, filters, search, cursor],
    queryFn: () =>
      new HttpClient().request(
        'admin/reports/' +
          resource +
          '?' +
          new URLSearchParams({
            ...filters,
            limit: String(limit),
            ...(search ? { q: search } : {}),
            ...(cursor ? { cursor } : {}),
          }),
        pageSchema,
      ),
    placeholderData: (previous) => previous,
  });
  const cols = columns[resource] || [],
    summary = page.data?.summary,
    first = cursors.length * limit + 1,
    last = cursors.length * limit + (page.data?.items.length || 0);
  return (
    <Modal open onOpenChange={(open) => !open && onClose()} title={title} className="report-viewer">
      {summary && summary.metrics.length > 0 && (
        <div className="report-metrics">
          {summary.metrics.map((m) => (
            <div className="report-metric" key={m.label}>
              <small>{m.label}</small>
              <strong>
                {m.cents !== undefined
                  ? money(m.cents)
                  : m.label.includes('%')
                    ? `${m.value ?? 0}%`
                    : (m.value ?? 0).toLocaleString('pt-BR')}
              </strong>
            </div>
          ))}
        </div>
      )}
      {summary && summary.breakdown.length > 0 && (
        <div className="report-breakdown" aria-label="Distribuição por situação">
          {summary.breakdown.map((b) => (
            <span className="report-chip" key={b.label}>
              <StatusBadge status={b.label} />
              <b>{b.count}</b>
              {b.cents !== undefined && <small>{money(b.cents)}</small>}
            </span>
          ))}
        </div>
      )}
      <div className="row between wrap report-toolbar">
        <p className="muted">
          {page.data
            ? page.data.total
              ? `${first}–${last} de ${page.data.total.toLocaleString('pt-BR')} registros`
              : 'Nenhum registro no período.'
            : 'Consultando…'}
        </p>
        {searchable.has(resource) && (
          <form
            className="row"
            onSubmit={(e) => {
              e.preventDefault();
              setCursors([]);
              setSearch(draft.trim());
            }}
          >
            <input
              aria-label={'Buscar por ' + searchHint[resource]}
              placeholder={searchHint[resource]}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
            <Button variant="secondary" className="small">
              Buscar
            </Button>
          </form>
        )}
      </div>
      {page.error && (
        <p className="form-error" role="alert">
          {errorMessage(page.error)}
        </p>
      )}
      <div className="admin-table-wrap" tabIndex={0}>
        <table className="admin-table">
          <thead>
            <tr>
              {cols.map((c) => (
                <th key={c.label} scope="col">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody aria-busy={page.isFetching}>
            {page.data?.items.map((row, index) => (
              <tr key={str(row.id) || index}>
                {cols.map((c) => (
                  <td key={c.label}>{cell(c, row)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="row between wrap">
        <Button
          variant="text"
          disabled={!cursors.length || page.isFetching}
          onClick={() => setCursors((c) => c.slice(0, -1))}
        >
          Página anterior
        </Button>
        <Button
          variant="secondary"
          disabled={!page.data?.nextCursor || page.isFetching}
          onClick={() => setCursors((c) => [...c, page.data!.nextCursor!])}
        >
          Próxima página
        </Button>
      </div>
    </Modal>
  );
}

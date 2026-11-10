'use client';
import { useMutation, useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { HttpClient } from '@/lib/api/http';
import { IS_DEMO } from '@/lib/api/config';
import { errorMessage } from '@/lib/api/contracts';
import { useState } from 'react';
import { useAdminData } from './admin-frame';
import { AdminHeading } from './shared';
import { AdminAnalytics } from './analytics';
import { downloadCsv } from '@/lib/domain/format';
import { Button } from '@/components/ui/button';
type ReportRow = {
  id: string;
  date: string;
  status: string;
  values: (string | number | undefined)[];
};
export function ReportCenter() {
  const data = useAdminData(),
    [from, setFrom] = useState(''),
    [to, setTo] = useState(''),
    [status, setStatus] = useState('Todas'),
    [preview, setPreview] = useState<string | null>(null);
  const modules: {
    id: string;
    name: string;
    description: string;
    headers: string[];
    rows: ReportRow[];
  }[] = [
    {
      id: 'pedidos',
      name: 'Pedidos e expedição',
      description: 'Origem, valor, situação, transportadora e rastreamento.',
      headers: [
        'Pedido',
        'Data',
        'Cliente',
        'Origem',
        'Total (centavos)',
        'Situação',
        'Transportadora',
        'Rastreio',
      ],
      rows: data.orders.map((o) => ({
        id: o.id,
        date: o.created,
        status: o.status,
        values: [
          o.number,
          o.created,
          data.clients.find((c) => c.id === o.customerId)?.name,
          o.type,
          o.totalCents,
          o.status,
          o.carrier,
          o.tracking,
        ],
      })),
    },
    {
      id: 'assinaturas',
      name: 'Assinaturas e renovações',
      description: 'Perfil, valor contratado e próximo ciclo de cada assinante.',
      headers: [
        'Contrato',
        'Cliente',
        'Perfil',
        'Valor (centavos)',
        'Situação',
        'Próxima renovação',
      ],
      rows: data.subscriptions.map((s) => ({
        id: s.id,
        date: s.created,
        status: s.status,
        values: [
          s.id,
          data.clients.find((c) => c.id === s.customerId)?.name,
          s.profile,
          s.priceCents,
          s.status,
          s.nextRenewal,
        ],
      })),
    },
    {
      id: 'producao',
      name: 'Produção e capacidade',
      description: 'Máquinas, prazos, responsáveis e estimativas de material.',
      headers: [
        'Ordem',
        'Pedido',
        'Etapa',
        'Máquina',
        'Horas',
        'Material (g)',
        'Prazo',
        'Responsável',
      ],
      rows: data.jobs.map((j) => ({
        id: j.id,
        date: j.due,
        status: j.stage,
        values: [j.id, j.orderId, j.stage, j.printer, j.hours, j.grams || 0, j.due, j.assignee],
      })),
    },
    {
      id: 'catalogo',
      name: 'Catálogo e estoque',
      description: 'Disponibilidade, preços, custo, modelo 3D e estoque.',
      headers: [
        'SKU',
        'Produto',
        'Coleção',
        'Preço (centavos)',
        'Custo (centavos)',
        'Estoque',
        'Publicado',
        'Modelo 3D',
      ],
      rows: data.products.map((p) => ({
        id: p.id,
        date: '',
        status: p.active ? 'Ativo' : 'Inativo',
        values: [
          p.sku,
          p.name,
          p.category,
          p.priceCents,
          p.costCents,
          p.stock,
          p.active ? 'Sim' : 'Não',
          p.model?.filename || 'Sem arquivo',
        ],
      })),
    },
    {
      id: 'clientes',
      name: 'Clientes',
      description: 'Cadastros da loja e do clube, cidade e situação.',
      headers: ['Cliente', 'Nome', 'E-mail', 'Cidade', 'UF', 'Situação'],
      rows: data.clients.map((c) => ({
        id: c.id,
        date: c.created,
        status: c.status,
        values: [c.id, c.name, c.email, c.city, c.state, c.status],
      })),
    },
    {
      id: 'financeiro',
      name: 'Cobranças e recebimentos',
      description: 'Situação de cada cobrança, método e confirmação.',
      headers: [
        'Cobrança',
        'Pedido',
        'Vencimento',
        'Método',
        'Valor (centavos)',
        'Situação',
        'Pago em',
      ],
      rows: data.charges.map((c) => ({
        id: c.id,
        date: c.due,
        status: c.status,
        values: [c.id, c.orderId, c.due, c.method, c.amountCents, c.status, c.paidAt],
      })),
    },
    {
      id: 'despesas',
      name: 'Despesas',
      description: 'Saídas pagas e previstas, por categoria e data.',
      headers: ['Despesa', 'Categoria', 'Data', 'Valor (centavos)', 'Situação'],
      rows: data.expenses.map((e) => ({
        id: e.id,
        date: e.date,
        status: e.status,
        values: [e.name, e.category, e.date, e.amountCents, e.status],
      })),
    },
    {
      id: 'suporte',
      name: 'Atendimentos',
      description: 'Volume, prioridade, assunto e distribuição de responsáveis.',
      headers: [
        'Atendimento',
        'Assunto',
        'Categoria',
        'Abertura',
        'Situação',
        'Prioridade',
        'Responsável',
      ],
      rows: data.tickets.map((t) => ({
        id: t.id,
        date: t.created,
        status: t.status,
        values: [t.id, t.subject, t.category, t.created, t.status, t.priority, t.assignee],
      })),
    },
    {
      id: 'comunidade',
      name: 'Mural de orações',
      description: 'Moderação e acolhimento, sem exportar o texto dos pedidos.',
      headers: ['Pedido', 'Categoria', 'Data', 'Visibilidade', 'Orações', 'Sinalizações'],
      rows: data.prayers.map((p) => ({
        id: p.id,
        date: p.created,
        status: p.moderation || (p.hidden ? 'Oculto' : 'Publicado'),
        values: [
          p.id,
          p.category,
          p.created,
          p.moderation || (p.hidden ? 'Oculto' : 'Publicado'),
          p.reactions,
          p.reports?.length || 0,
        ],
      })),
    },
    {
      id: 'oracoes',
      name: 'Oração diária',
      description: 'Rascunhos, agendamentos e total de envios confirmados.',
      headers: ['Mensagem', 'Assunto', 'Data', 'Situação', 'Destinatários'],
      rows: data.campaigns.map((c) => ({
        id: c.id,
        date: c.date,
        status: c.status,
        values: [c.id, c.subject, c.date, c.status, c.recipients],
      })),
    },
    {
      id: 'edicoes',
      name: 'Edições do clube',
      description: 'Curadoria mensal, situação e dia de expedição.',
      headers: ['Edição', 'Mês', 'Dia do envio', 'Situação'],
      rows: data.editions.map((e) => ({
        id: e.id,
        date: e.month + '-01',
        status: e.status,
        values: [e.name, e.month, e.dispatchDay, e.status],
      })),
    },
    {
      id: 'equipe',
      name: 'Equipe e acesso',
      description: 'Integrantes ativos e inativos, sem tokens de convite.',
      headers: ['Nome', 'E-mail', 'Perfil', 'Situação'],
      rows: data.team.map((t) => ({
        id: t.id,
        date: '',
        status: t.status,
        values: [t.name, t.email, t.role, t.status],
      })),
    },
    {
      id: 'atividade',
      name: 'Histórico de alterações',
      description: 'Ações registradas, entidade e pessoa responsável.',
      headers: ['Data', 'Ação', 'Entidade', 'Responsável'],
      rows: data.audit.map((a) => ({
        id: a.id,
        date: a.date,
        status: 'Registrada',
        values: [a.date, a.action, a.entity, a.actor],
      })),
    },
  ];
  const filtered = (rows: ReportRow[]) =>
      rows.filter(
        (r) =>
          (!from || !r.date || r.date.slice(0, 10) >= from) &&
          (!to || !r.date || r.date.slice(0, 10) <= to) &&
          (status === 'Todas' || r.status === status),
      ),
    selected = modules.find((m) => m.id === preview);
  return (
    <>
      <AdminHeading
        title="Relatórios da operação"
        description="Da visão geral ao detalhe. Consulte os registros e exporte exatamente o que precisa."
      />
      <AdminAnalytics finance />
      <div className="admin-toolbar report-filters">
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
        <label>
          Situação
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option>Todas</option>
            {[...new Set(modules.flatMap((m) => m.rows.map((r) => r.status)))].sort().map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <Button
          variant="text"
          onClick={() => {
            setFrom('');
            setTo('');
            setStatus('Todas');
          }}
        >
          Limpar filtros
        </Button>
      </div>
      <p className="demo-text">
        Filtro por data usa criação, vencimento ou prazo conforme o relatório. Catálogo e equipe não
        possuem data e permanecem na seleção. Valores monetários em centavos.
      </p>
      <div className="report-module-list">
        {modules.map((m) => (
          <section className="report-module" key={m.id}>
            <div className="row between">
              <h3>{m.name}</h3>
              <span>{filtered(m.rows).length} registros</span>
            </div>
            <p>{m.description}</p>
            <div className="row wrap">
              {IS_DEMO ? (
                <Button
                  variant="secondary"
                  className="small"
                  onClick={() =>
                    downloadCsv(
                      m.id,
                      m.headers,
                      filtered(m.rows).map((r) => r.values),
                    )
                  }
                >
                  Baixar CSV
                </Button>
              ) : (
                <ServerExportButton
                  resource={resourceNames[m.id]}
                  filters={{
                    ...(from ? { from: from + 'T00:00:00-03:00' } : {}),
                    ...(to ? { to: to + 'T23:59:59.999-03:00' } : {}),
                    ...(status !== 'Todas' ? { status } : {}),
                  }}
                />
              )}
              <Button variant="text" onClick={() => setPreview(m.id)}>
                Consultar dados
              </Button>
            </div>
          </section>
        ))}
      </div>
      {selected && !IS_DEMO && (
        <ServerReportPreview
          key={selected.id + from + to + status}
          resource={resourceNames[selected.id]}
          title={selected.name}
          filters={{
            ...(from ? { from: from + 'T00:00:00-03:00' } : {}),
            ...(to ? { to: to + 'T23:59:59.999-03:00' } : {}),
            ...(status !== 'Todas' ? { status } : {}),
          }}
        />
      )}
      {selected && IS_DEMO && (
        <section className="admin-panel report-preview" style={{ marginTop: 24 }}>
          <div className="admin-panel-heading">
            <h2>{selected.name}</h2>
            <Button variant="text" onClick={() => setPreview(null)}>
              Fechar consulta
            </Button>
          </div>
          <div className="admin-table-wrap" tabIndex={0}>
            <table className="admin-table">
              <thead>
                <tr>
                  {selected.headers.map((h) => (
                    <th key={h} scope="col">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered(selected.rows).map((r) => (
                  <tr key={r.id}>
                    {r.values.map((v, i) => (
                      <td key={i}>{v ?? '—'}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}

const resourceNames: Record<string, string> = {
  pedidos: 'orders',
  assinaturas: 'subscriptions',
  producao: 'production',
  catalogo: 'products',
  clientes: 'customers',
  financeiro: 'finance',
  despesas: 'expenses',
  suporte: 'support',
  comunidade: 'prayers',
  oracoes: 'campaigns',
  edicoes: 'editions',
  equipe: 'team',
  atividade: 'audit',
};
const exportSchema = z.object({
  id: z.string(),
  status: z.string(),
  downloadUrl: z.string().nullable().optional(),
});
function ServerExportButton({
  resource,
  filters,
}: {
  resource: string;
  filters: Record<string, string>;
}) {
  const job = useMutation({
    mutationFn: () =>
      new HttpClient().request('admin/exports', exportSchema, {
        method: 'POST',
        body: { kind: resource, filters },
      }),
  });
  const status = useQuery({
    queryKey: ['admin', 'export', job.data?.id],
    enabled: !!job.data?.id,
    queryFn: () => new HttpClient().request('admin/exports/' + job.data!.id, exportSchema),
    refetchInterval: (q) =>
      q.state.data?.status === 'ready' || q.state.data?.status === 'failed' ? false : 1000,
  });
  return (
    <>
      <Button
        variant="secondary"
        className="small"
        loading={
          job.isPending ||
          (!!job.data && !['ready', 'failed'].includes(status.data?.status || 'pending'))
        }
        onClick={() => job.mutate()}
      >
        Preparar CSV completo
      </Button>
      {status.data?.status === 'ready' && (
        <a className="admin-link" href={'/api/v1/admin/exports/' + status.data.id + '/download'}>
          Baixar arquivo
        </a>
      )}
      {status.data?.status === 'failed' && (
        <span role="alert">A exportação falhou. Reduza o período e tente novamente.</span>
      )}
      {(job.error || status.error) && (
        <span role="alert">{errorMessage(job.error || status.error)}</span>
      )}
    </>
  );
}
const pageSchema = z.object({
  items: z.array(z.record(z.string(), z.unknown())),
  total: z.number(),
  nextCursor: z.string().nullable(),
});
function ServerReportPreview({
  resource,
  title,
  filters,
}: {
  resource: string;
  title: string;
  filters: Record<string, string>;
}) {
  const [cursor, setCursor] = useState<string | undefined>();
  const page = useQuery({
    queryKey: ['admin', 'report', resource, filters, cursor],
    queryFn: () =>
      new HttpClient().request(
        'admin/reports/' +
          resource +
          '?' +
          new URLSearchParams({ ...filters, limit: '25', ...(cursor ? { cursor } : {}) }),
        pageSchema,
      ),
  });
  const columns = Object.keys(page.data?.items[0] || {}).filter(
    (k) => !['items', 'address', 'messages', 'model', 'media', 'history'].includes(k),
  );
  return (
    <section className="admin-panel report-preview" style={{ marginTop: 24 }}>
      <h2>{title}</h2>
      <p>{page.data?.total ?? '…'} registros no servidor</p>
      {page.error && (
        <p className="form-error" role="alert">
          {errorMessage(page.error)}
        </p>
      )}
      <div className="admin-table-wrap" tabIndex={0}>
        <table className="admin-table">
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c} scope="col">
                  {columnLabels[c] || c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {page.data?.items.map((item, index) => (
              <tr key={String(item.id || index)}>
                {columns.map((c) => (
                  <td key={c}>
                    {item[c] === null || item[c] === undefined
                      ? '—'
                      : typeof item[c] === 'object'
                        ? JSON.stringify(item[c]).slice(0, 150)
                        : String(item[c])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="row wrap">
        <Button variant="text" disabled={!cursor} onClick={() => setCursor(undefined)}>
          Primeira página
        </Button>
        <Button
          variant="secondary"
          disabled={!page.data?.nextCursor || page.isFetching}
          onClick={() => setCursor(page.data?.nextCursor || undefined)}
        >
          Próxima página
        </Button>
      </div>
    </section>
  );
}
const columnLabels: Record<string, string> = {
  id: 'Registro',
  number: 'Número',
  name: 'Nome',
  email: 'E-mail',
  phone: 'Telefone',
  document: 'Documento',
  customerId: 'Cliente',
  subscriptionId: 'Assinatura',
  orderId: 'Pedido',
  type: 'Tipo',
  created: 'Criado em',
  createdAt: 'Criado em',
  updatedAt: 'Atualizado em',
  status: 'Situação',
  stage: 'Etapa',
  due: 'Prazo',
  amountCents: 'Valor (centavos)',
  totalCents: 'Total (centavos)',
  subtotalCents: 'Subtotal (centavos)',
  shippingCents: 'Frete (centavos)',
  discountCents: 'Desconto (centavos)',
  priceCents: 'Preço (centavos)',
  costCents: 'Custo (centavos)',
  stock: 'Estoque',
  active: 'Publicado',
  archived: 'Arquivado',
  sku: 'SKU',
  category: 'Categoria',
  date: 'Data',
  method: 'Pagamento',
  payment: 'Pagamento',
  paidAt: 'Pago em',
  profile: 'Perfil',
  finish: 'Acabamento',
  nextRenewal: 'Renovação',
  nextShipment: 'Próximo envio',
  tracking: 'Rastreio',
  carrier: 'Transportadora',
  subject: 'Assunto',
  message: 'Mensagem',
  recipients: 'Destinatários',
  audience: 'Público',
  month: 'Competência',
  role: 'Perfil de acesso',
  permissions: 'Permissões',
  notes: 'Observações',
  action: 'Ação',
  entity: 'Entidade',
  actor: 'Responsável',
  assignee: 'Responsável',
  hours: 'Horas',
  grams: 'Gramas',
  priority: 'Prioridade',
};

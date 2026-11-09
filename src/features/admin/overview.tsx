'use client';
import Link from 'next/link';
import { useAdminData } from './admin-frame';
import { AdminHeading, AdminMetrics, AuditList } from './shared';
import { financialSummary } from '@/lib/domain/commerce';
import { money, monthLabel } from '@/lib/domain/format';
import { ButtonLink } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table';
import { StatusBadge } from '@/components/ui/status-badge';
import { Icon } from '@/components/ui/icon';
import type { OrderStatus } from '@/lib/domain/types';
export function AdminOverview() {
  const data = useAdminData(),
    f = financialSummary(data),
    active = data.subscriptions.filter((s) => s.status === 'Ativa').length;
  const flow: [OrderStatus, string, string][] = [
    ['Aguardando pagamento', 'Pagamento', 'financeiro'],
    ['Confirmado', 'Confirmados', 'pedidos'],
    ['Em produção', 'Produção', 'producao'],
    ['Em acabamento', 'Acabamento', 'producao'],
    ['Pronto para envio', 'Expedição', 'expedicao'],
    ['Enviado', 'A caminho', 'expedicao'],
  ];
  return (
    <>
      <AdminHeading
        title="Tudo pronto para um novo dia."
        description="Acompanhe a loja e o clube, da primeira escolha até a entrega."
        actions={
          <>
            <ButtonLink variant="secondary" className="small" href="/admin/pedidos?novo=1">
              <Icon name="plus" />
              Criar pedido
            </ButtonLink>
            <ButtonLink className="small" href="/admin/edicoes">
              Preparar edição do clube <Icon name="arrow" />
            </ButtonLink>
          </>
        }
      />
      <AdminMetrics
        items={[
          {
            label: 'Pedidos em andamento',
            value: data.orders.filter((o) => !['Entregue', 'Cancelado'].includes(o.status)).length,
            note: 'Loja + clube',
          },
          { label: 'Assinaturas ativas', value: active, note: 'Clientes com plano ativo' },
          {
            label: 'Receita mensal do clube',
            value: money(f.mrr),
            note: 'Projeção das assinaturas ativas',
          },
          { label: 'A receber', value: money(f.pending), note: 'Cobranças pendentes' },
        ]}
      />
      <div className="admin-dashboard-grid">
        <section className="admin-panel">
          <div className="admin-panel-heading">
            <h2>O caminho de cada pedido</h2>
            <Link href="/admin/pedidos">
              Ver todos <Icon name="arrow" />
            </Link>
          </div>
          <div className="admin-flow">
            {flow.map(([status, label, route]) => (
              <Link key={status} href={'/admin/' + route}>
                <strong>{data.orders.filter((o) => o.status === status).length}</strong>
                <span>{label}</span>
              </Link>
            ))}
          </div>
          <div className="admin-panel-subhead">
            <h3>Pedidos recentes</h3>
          </div>
          <DataTable
            rows={data.orders.slice(0, 6)}
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
              {
                key: 'customer',
                label: 'Cliente',
                render: (o) => data.clients.find((c) => c.id === o.customerId)?.name,
              },
              { key: 'type', label: 'Origem', render: (o) => <StatusBadge status={o.type} /> },
              { key: 'total', label: 'Valor', render: (o) => money(o.totalCents) },
              {
                key: 'status',
                label: 'Situação',
                render: (o) => <StatusBadge status={o.status} />,
              },
            ]}
          />
        </section>
        <aside className="admin-panel admin-attention">
          <h2>Seu próximo passo</h2>
          <Link href="/admin/financeiro">
            <Icon name="card" />
            <span>
              <strong>Revisar pagamentos</strong>
              <small>
                {data.charges.filter((c) => ['Pendente', 'Recusado'].includes(c.status)).length}{' '}
                cobranças precisam de atenção.
              </small>
            </span>
            <Icon name="chevron" />
          </Link>
          <Link href="/admin/producao">
            <Icon name="box" />
            <span>
              <strong>Organizar a produção</strong>
              <small>
                {data.jobs.filter((j) => j.stage !== 'Pronto').length} tarefas na fila e nas
                máquinas.
              </small>
            </span>
            <Icon name="chevron" />
          </Link>
          <Link href="/admin/suporte">
            <Icon name="chat" />
            <span>
              <strong>Acolher os clientes</strong>
              <small>
                {data.tickets.filter((t) => t.status !== 'Resolvido').length} atendimentos abertos.
              </small>
            </span>
            <Icon name="chevron" />
          </Link>
          <Link href="/admin/edicoes">
            <Icon name="gift" />
            <span>
              <strong>{data.settings.edition}</strong>
              <small>
                Edição de {monthLabel(data.settings.editionMonth)}, envio no dia{' '}
                {data.settings.dispatchDay}.
              </small>
            </span>
            <Icon name="chevron" />
          </Link>
        </aside>
      </div>
      <section className="admin-panel" style={{ marginTop: 24 }}>
        <div className="admin-panel-heading">
          <h2>Atividade da operação</h2>
          <Link href="/admin/atividade">
            Ver histórico <Icon name="arrow" />
          </Link>
        </div>
        <AuditList entries={data.audit.slice(0, 5)} />
      </section>
    </>
  );
}

'use client';
import { PrayerManager } from './prayer-manager';
import { CampaignManager } from './campaign-manager';
import { ReportCenter } from './report-center';
import Link from 'next/link';
import { useAdminData } from './admin-frame';
import { AdminHeading, AuditList, useAdminAction, useAdminFilter } from './shared';
import { DataTable } from '@/components/ui/data-table';
import { Button, ButtonLink } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/status-badge';
import { Form, text } from '@/components/ui/form';
import { EmptyState } from '@/components/ui/states';
import { TicketMessages } from '@/features/account/tickets';
import { IS_DEMO } from '@/lib/api/config';
import { dateLabel, money } from '@/lib/domain/format';
import type { Ticket } from '@/lib/domain/types';
export function AdminSupport({ id }: { id?: string }) {
  const data = useAdminData(),
    action = useAdminAction(),
    filter = useAdminFilter(
      data.tickets,
      (t) =>
        t.id +
        ' ' +
        t.subject +
        ' ' +
        (data.clients.find((c) => c.id === t.customerId)?.name || ''),
      (t) => t.status,
      ['Todos', 'Aberto', 'Em atendimento', 'Resolvido'],
    );
  if (id) {
    const ticket = data.tickets.find((t) => t.id === id),
      customer = data.clients.find((c) => c.id === ticket?.customerId);
    if (!ticket)
      return (
        <EmptyState
          title="Atendimento não encontrado."
          description="Confira a lista de conversas da operação."
          action={<ButtonLink href="/admin/suporte">Ver atendimentos</ButtonLink>}
        />
      );
    return (
      <>
        <AdminHeading
          title={ticket.subject}
          description={`${ticket.id} · ${ticket.category} · aberto em ${dateLabel(ticket.created)}`}
          actions={
            <ButtonLink href="/admin/suporte" variant="secondary">
              Todos os atendimentos
            </ButtonLink>
          }
        />
        <div className="admin-detail-grid">
          <section className="admin-panel">
            <TicketMessages ticket={ticket} />
            <Form
              onSubmit={async (d, f) => {
                await action.run({
                  type: 'ticket.reply',
                  id: ticket.id,
                  message: text(d, 'message'),
                  status: text(d, 'status') as Ticket['status'],
                  assignee: text(d, 'assignee'),
                  internal: d.has('internal'),
                  priority: text(d, 'priority') as 'Normal' | 'Alta',
                });
                f.reset();
              }}
            >
              {(pending) => (
                <>
                  <label>
                    Resposta rápida
                    <select
                      defaultValue=""
                      onChange={(e) => {
                        const form = e.currentTarget.closest('form');
                        const message = form?.elements.namedItem('message') as HTMLTextAreaElement;
                        if (message) message.value = e.target.value;
                      }}
                    >
                      <option value="">Escolha uma resposta</option>
                      {data.workspace.ticketReplies.map((reply) => (
                        <option key={reply}>{reply}</option>
                      ))}
                    </select>
                  </label>
                  <label className="check-label">
                    <input type="checkbox" name="internal" />
                    Nota interna · não visível para o cliente
                  </label>
                  <label>
                    Prioridade
                    <select name="priority" defaultValue={ticket.priority}>
                      <option>Normal</option>
                      <option>Alta</option>
                    </select>
                  </label>
                  <label>
                    Resposta da equipe
                    <textarea name="message" required minLength={3} maxLength={1500} />
                  </label>
                  <div className="form-grid">
                    <label>
                      Situação
                      <select name="status" defaultValue={ticket.status}>
                        <option>Aberto</option>
                        <option>Em atendimento</option>
                        <option>Resolvido</option>
                      </select>
                    </label>
                    <label>
                      Responsável
                      <select name="assignee" defaultValue={ticket.assignee}>
                        {Array.from(
                          new Set([
                            ticket.assignee,
                            ...data.team.filter((t) => t.status === 'Ativo').map((t) => t.name),
                          ]),
                        ).map((name) => (
                          <option key={name}>{name}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <Button loading={pending}>
                    Salvar resposta{IS_DEMO ? ' na demonstração' : ''}
                  </Button>
                </>
              )}
            </Form>
          </section>
          <aside className="admin-panel">
            <h2>Quem estamos acolhendo</h2>
            <h3>{customer?.name || 'Visitante'}</h3>
            <p>{customer?.email}</p>
            <StatusBadge status={ticket.status} />
            <p>Prioridade: {ticket.priority}</p>
            {customer && (
              <ButtonLink variant="secondary" href={'/admin/clientes/' + customer.id}>
                Ver histórico do cliente
              </ButtonLink>
            )}
            {IS_DEMO && <p>Resposta registrada localmente. Nenhum e-mail é enviado.</p>}
          </aside>
        </div>
      </>
    );
  }
  return (
    <>
      <AdminHeading
        title="Atendimentos"
        description="Converse com os clientes e acompanhe cada solicitação."
      />
      {filter.toolbar}
      <DataTable
        rows={filter.rows}
        columns={[
          {
            key: 'subject',
            label: 'Atendimento',
            render: (t) => (
              <Link href={'/admin/suporte/' + t.id}>
                <strong>{t.subject}</strong>
                <small className="support-record-meta">
                  {t.id} · {t.category}
                </small>
              </Link>
            ),
          },
          {
            key: 'customer',
            label: 'Cliente',
            render: (t) => data.clients.find((c) => c.id === t.customerId)?.name || 'Visitante',
          },
          { key: 'status', label: 'Situação', render: (t) => <StatusBadge status={t.status} /> },
          { key: 'assignee', label: 'Responsável', render: (t) => t.assignee || 'A definir' },
          { key: 'created', label: 'Abertura', render: (t) => dateLabel(t.created) },
          {
            key: 'action',
            label: '',
            render: (t) => (
              <ButtonLink href={'/admin/suporte/' + t.id} variant="secondary" className="small">
                Abrir conversa
              </ButtonLink>
            ),
          },
        ]}
      />
    </>
  );
}
export function AdminCommunity() {
  return <PrayerManager />;
}
export function AdminMarketing() {
  return <CampaignManager />;
}
export function AdminReports() {
  return <ReportCenter />;
}
export function AdminActivity() {
  const data = useAdminData();
  return (
    <>
      <AdminHeading
        title="Atividade da operação"
        description="Histórico das alterações nos registros e configurações."
      />
      {data.audit.length ? (
        <section className="admin-panel">
          <AuditList entries={data.audit} />
        </section>
      ) : (
        <EmptyState
          title="Nenhuma alteração registrada."
          description="As próximas mudanças aparecerão neste histórico."
        />
      )}
    </>
  );
}
export function AdminSearch({ query }: { query: string }) {
  const data = useAdminData(),
    q = query.trim().toLocaleLowerCase('pt-BR'),
    matches = (s: string) => !!q && s.toLocaleLowerCase('pt-BR').includes(q),
    groups = [
      {
        title: 'Clientes',
        items: data.clients
          .filter((c) => matches(c.name + ' ' + c.email + ' ' + c.id))
          .map((c) => ({
            id: c.id,
            label: c.name,
            description: c.email,
            href: '/admin/clientes/' + c.id,
          })),
      },
      {
        title: 'Pedidos',
        items: data.orders
          .filter((o) =>
            matches(
              o.id + ' ' + o.number + ' ' + data.clients.find((c) => c.id === o.customerId)?.name,
            ),
          )
          .map((o) => ({
            id: o.id,
            label: o.number,
            description: `${o.status} · ${money(o.totalCents)}`,
            href: '/admin/pedidos/' + o.id,
          })),
      },
      {
        title: 'Assinaturas',
        items: data.subscriptions
          .filter((s) =>
            matches(
              s.id + ' ' + s.profile + ' ' + data.clients.find((c) => c.id === s.customerId)?.name,
            ),
          )
          .map((s) => ({
            id: s.id,
            label: s.id,
            description: `${s.profile} · ${s.status}`,
            href: '/admin/assinaturas/' + s.id,
          })),
      },
    ];
  return (
    <>
      <AdminHeading
        title="Busca na operação"
        description={
          q
            ? `Resultados para “${query}”.`
            : 'Use o campo no topo para buscar clientes, pedidos ou assinaturas.'
        }
      />
      {groups.map((g) => (
        <section className="admin-panel" key={g.title} style={{ marginBottom: 20 }}>
          <h2>{g.title}</h2>
          {g.items.length ? (
            g.items.map((i) => (
              <Link className="admin-search-result" key={i.id} href={i.href}>
                <strong>{i.label}</strong>
                <span>{i.description}</span>
              </Link>
            ))
          ) : (
            <p>Nenhum resultado nesta categoria.</p>
          )}
        </section>
      ))}
    </>
  );
}

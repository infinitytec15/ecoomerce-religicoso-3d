'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useAdminData } from './admin-frame';
import {
  AdminHeading,
  AdminMetrics,
  AdminError,
  AuditList,
  exportAdmin,
  useAdminAction,
  useAdminFilter,
} from './shared';
import { DataTable } from '@/components/ui/data-table';
import { Button, ButtonLink } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/status-badge';
import { Form, text } from '@/components/ui/form';
import { Modal } from '@/components/ui/modal';
import { EmptyState } from '@/components/ui/states';
import { TicketMessages } from '@/features/account/tickets';
import { NewsletterContent } from '@/components/faith/faith-features';
import { IS_DEMO } from '@/lib/api/config';
import { dateLabel, money, today } from '@/lib/domain/format';
import { financialSummary } from '@/lib/domain/commerce';
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
                });
                f.reset();
              }}
            >
              {(pending) => (
                <>
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
                <small>
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
  const data = useAdminData(),
    action = useAdminAction(),
    filter = useAdminFilter(
      data.prayers,
      (p) => p.title + ' ' + p.message + ' ' + p.name,
      (p) => (p.hidden ? 'Oculto' : 'Publicado'),
      ['Todos', 'Publicado', 'Oculto'],
    );
  return (
    <>
      <AdminHeading
        title="Mural de orações"
        description="Acolha os pedidos e cuide do que fica visível na comunidade."
      />
      <AdminMetrics
        items={[
          { label: 'Pedidos publicados', value: data.prayers.filter((p) => !p.hidden).length },
          { label: 'Pedidos ocultos', value: data.prayers.filter((p) => p.hidden).length },
          {
            label: 'Orações em conjunto',
            value: data.prayers.reduce((n, p) => n + p.reactions, 0),
          },
        ]}
      />
      <AdminError error={action.error} />
      {filter.toolbar}
      <div className="admin-prayer-list">
        {filter.rows.map((p) => (
          <article className="admin-panel" key={p.id}>
            <div className="row between wrap">
              <span>
                {p.anonymous ? 'Pedido anônimo' : p.name} · {p.category}
              </span>
              <StatusBadge status={p.hidden ? 'Oculto' : 'Publicado'} />
            </div>
            <h2>{p.title}</h2>
            <p style={{ whiteSpace: 'pre-wrap' }}>{p.message}</p>
            <div className="row between wrap">
              <small>
                {dateLabel(p.created)} · {p.reactions} pessoas em oração
                {p.example ? ' · Exemplo fictício' : ''}
              </small>
              <Button
                variant="secondary"
                className="small"
                loading={action.pending}
                onClick={() =>
                  action.execute(
                    { type: 'prayer.moderate', id: p.id },
                    p.hidden ? 'Pedido restaurado no mural.' : 'Pedido ocultado do mural.',
                  )
                }
              >
                {p.hidden ? 'Restaurar publicação' : 'Ocultar do mural'}
              </Button>
            </div>
          </article>
        ))}
      </div>
      {!filter.rows.length && (
        <EmptyState
          title="Nenhum pedido nesta seleção."
          description="Altere os filtros para ver outros pedidos de oração."
        />
      )}
    </>
  );
}
export function AdminMarketing() {
  const data = useAdminData(),
    action = useAdminAction(),
    [preview, setPreview] = useState(false);
  return (
    <>
      <AdminHeading
        title="Uma oração para cada manhã"
        description="Prepare as mensagens do convite gratuito de oração diária."
        actions={
          <Button variant="secondary" onClick={() => setPreview(true)}>
            Visualizar convite da loja
          </Button>
        }
      />
      <div className="admin-detail-grid">
        <section className="admin-panel">
          <h2>Preparar uma mensagem</h2>
          <Form
            onSubmit={async (d, f) => {
              await action.run(
                {
                  type: 'campaign.create',
                  campaign: {
                    subject: text(d, 'subject'),
                    message: text(d, 'message'),
                    date: text(d, 'date'),
                  },
                },
                IS_DEMO ? 'Mensagem salva como rascunho demonstrativo.' : 'Mensagem salva.',
              );
              f.reset();
            }}
          >
            {(pending) => (
              <>
                <label>
                  Assunto
                  <input name="subject" required minLength={5} maxLength={150} />
                </label>
                <label>
                  Oração ou mensagem
                  <textarea name="message" required minLength={20} maxLength={3000} rows={7} />
                </label>
                <label>
                  Data desejada
                  <input name="date" type="date" required min={today()} defaultValue={today()} />
                </label>
                {IS_DEMO && (
                  <div className="notice">
                    Rascunho demonstrativo. Não há disparo nem agendamento de e-mails reais.
                  </div>
                )}
                <Button loading={pending}>
                  Salvar mensagem{IS_DEMO ? ' de demonstração' : ''}
                </Button>
              </>
            )}
          </Form>
        </section>
        <aside className="admin-panel">
          <h2>Inscrição neste navegador</h2>
          <p>
            {data.newsletter?.subscribed
              ? `${data.newsletter.name || 'Visitante'} · ${data.newsletter.email}`
              : 'Nenhuma inscrição local ativa.'}
          </p>
          <p>O convite é gratuito e depende do consentimento de quem recebe.</p>
          <ButtonLink variant="secondary" href="/">
            Abrir a loja
          </ButtonLink>
        </aside>
      </div>
      <section className="admin-panel" style={{ marginTop: 24 }}>
        <h2>Mensagens preparadas</h2>
        <DataTable
          rows={data.campaigns}
          columns={[
            {
              key: 'subject',
              label: 'Assunto',
              render: (c) => (
                <details>
                  <summary>{c.subject}</summary>
                  <p style={{ whiteSpace: 'pre-wrap' }}>{c.message}</p>
                </details>
              ),
            },
            { key: 'date', label: 'Data desejada', render: (c) => dateLabel(c.date) },
            { key: 'status', label: 'Situação', render: (c) => <StatusBadge status={c.status} /> },
            { key: 'recipients', label: 'Destinatários', render: (c) => c.recipients },
          ]}
        />
      </section>
      <Modal
        open={preview}
        onOpenChange={setPreview}
        title="Convite gratuito de oração diária"
        className="newsletter-dialog"
      >
        <NewsletterContent onClose={() => setPreview(false)} />
      </Modal>
    </>
  );
}
export function AdminReports() {
  const data = useAdminData(),
    f = financialSummary(data),
    active = data.subscriptions.filter((s) => s.status === 'Ativa'),
    mrr = active.reduce((n, s) => n + s.priceCents, 0),
    byStage = ['Fila', 'Impressão', 'Acabamento', 'Conferência', 'Pronto'].map((stage) => ({
      id: stage,
      stage,
      count: data.jobs.filter((j) => j.stage === stage).length,
    }));
  return (
    <>
      <AdminHeading
        title="Relatórios da operação"
        description="Indicadores calculados a partir dos registros atuais."
      />
      <AdminMetrics
        items={[
          {
            label: 'Receita recorrente mensal',
            value: money(mrr),
            note: `${active.length} assinaturas ativas`,
          },
          {
            label: 'Ticket médio recebido',
            value: money(
              data.charges.filter((c) => c.status === 'Pago').length
                ? Math.round(f.paid / data.charges.filter((c) => c.status === 'Pago').length)
                : 0,
            ),
            note: 'Total recebido / cobranças pagas',
          },
          {
            label: 'Pedidos entregues',
            value: data.orders.filter((o) => o.status === 'Entregue').length,
            note: `De ${data.orders.length} pedidos registrados`,
          },
          {
            label: 'Atendimentos resolvidos',
            value: data.tickets.filter((t) => t.status === 'Resolvido').length,
            note: `De ${data.tickets.length} conversas`,
          },
        ]}
      />
      <div className="admin-report-grid">
        {[
          ['Pedidos e entregas', 'pedidos', 'Quantidades, valores, origem e rastreamento.'],
          [
            'Recorrência do clube',
            'assinaturas',
            'Mensalidade, perfil, próxima renovação e situação.',
          ],
          ['Recebimentos', 'financeiro', 'Cobranças por método, vencimento e situação.'],
          ['Clientes', 'clientes', 'Cadastro e disponibilidade para atendimento.'],
          ['Produção', 'producao', 'Fila, máquina, horas e responsável.'],
          ['Catálogo e estoque', 'produtos', 'Preços, custos e unidades disponíveis.'],
        ].map(([label, kind, description]) => (
          <section className="admin-panel" key={kind}>
            <h2>{label}</h2>
            <p>{description}</p>
            <Button variant="secondary" onClick={() => exportAdmin(data, kind)}>
              Exportar CSV
            </Button>
          </section>
        ))}
      </div>
      <section className="admin-panel" style={{ marginTop: 24 }}>
        <h2>Distribuição da produção</h2>
        <DataTable
          rows={byStage}
          columns={[
            { key: 'stage', label: 'Etapa', render: (j) => j.stage },
            { key: 'count', label: 'Ordens de produção', render: (j) => j.count },
          ]}
        />
      </section>
    </>
  );
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

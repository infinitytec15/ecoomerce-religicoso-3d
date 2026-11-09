'use client';
import { useState } from 'react';
import type { Ticket } from '@/lib/domain/types';
import { useCommand } from '@/lib/api/query';
import { Button } from '@/components/ui/button';
import { Form, text } from '@/components/ui/form';
import { Modal } from '@/components/ui/modal';
import { StatusBadge } from '@/components/ui/status-badge';
import { dateLabel } from '@/lib/domain/format';
import { IS_DEMO } from '@/lib/api/config';
import { useNotify } from '@/components/ui/feedback';
import { EmptyState } from '@/components/ui/states';
export function TicketMessages({ ticket }: { ticket: Ticket }) {
  return (
    <div className="ticket-thread">
      {ticket.messages.map((m, index) => (
        <div
          className={`ticket-message ${m.by === 'equipe' ? 'staff' : ''} ${m.internal ? 'internal-note' : ''}`}
          key={index}
        >
          <strong>
            {m.internal
              ? 'Nota interna da equipe'
              : m.by === 'equipe'
                ? 'Equipe Mãos em Oração'
                : 'Você'}
          </strong>
          <p>{m.text}</p>
          <small>{dateLabel(m.date)}</small>
        </div>
      ))}
    </div>
  );
}
export function NewTicketForm({
  onSuccess,
  guest = false,
}: {
  onSuccess?: () => void;
  guest?: boolean;
}) {
  const create = useCommand(
      (
        g,
        input: {
          subject: string;
          category: string;
          message: string;
          name?: string;
          email?: string;
        },
      ) => g.createTicket(input),
    ),
    notify = useNotify();
  return (
    <Form
      onSubmit={async (d, form) => {
        await create.mutateAsync({
          subject: text(d, 'subject'),
          category: text(d, 'category'),
          message: text(d, 'message'),
          ...(guest ? { name: text(d, 'name'), email: text(d, 'email') } : {}),
        });
        form.reset();
        notify(
          IS_DEMO
            ? 'Atendimento salvo na demonstração local.'
            : 'Atendimento aberto. Acompanhe na sua conta.',
        );
        onSuccess?.();
      }}
    >
      {(pending) => (
        <>
          {guest && (
            <>
              <label>
                Seu nome
                <input name="name" required minLength={2} />
              </label>
              <label>
                E-mail
                <input name="email" type="email" required />
              </label>
            </>
          )}
          <label>
            Assunto
            <input name="subject" required minLength={5} maxLength={100} />
          </label>
          <label>
            Categoria
            <select name="category">
              {['Assinatura', 'Entrega', 'Pagamento', 'Produto', 'Outro assunto'].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
          <label>
            Sua mensagem
            <textarea name="message" required minLength={10} maxLength={1500} />
          </label>
          {IS_DEMO && (
            <div className="notice">
              Atendimento salvo neste navegador e no painel demonstrativo. Nenhuma mensagem externa
              é enviada.
            </div>
          )}
          <Button loading={pending}>Abrir atendimento{IS_DEMO ? ' na demonstração' : ''}</Button>
        </>
      )}
    </Form>
  );
}
export function ClientTickets({ tickets }: { tickets: Ticket[] }) {
  const [open, setOpen] = useState(false),
    reply = useCommand((g, input: { id: string; message: string }) =>
      g.replyTicket(input.id, input.message),
    );
  return (
    <>
      <h1>Estamos aqui para acolher.</h1>
      <p>Acompanhe as conversas e conte com a nossa equipe.</p>
      <Button onClick={() => setOpen(true)}>Abrir atendimento</Button>
      <div className="client-ticket-list">
        {tickets.length ? (
          tickets.map((t) => (
            <article key={t.id}>
              <div className="row between wrap">
                <h3>{t.subject}</h3>
                <StatusBadge status={t.status} />
              </div>
              <small>
                {t.id} · {dateLabel(t.created)}
              </small>
              <TicketMessages ticket={t} />
              <Form
                className="row"
                onSubmit={async (d, f) => {
                  await reply.mutateAsync({ id: t.id, message: text(d, 'message') });
                  f.reset();
                }}
              >
                {(pending) => (
                  <>
                    <input
                      name="message"
                      required
                      minLength={3}
                      maxLength={1500}
                      placeholder="Escreva sua mensagem"
                      aria-label={'Mensagem para ' + t.subject}
                    />
                    <Button className="small" loading={pending}>
                      Enviar{IS_DEMO ? ' na demonstração' : ''}
                    </Button>
                  </>
                )}
              </Form>
            </article>
          ))
        ) : (
          <EmptyState
            title="Nenhuma conversa por aqui."
            description="Abra um atendimento quando precisar de ajuda com uma peça, seu pedido ou assinatura."
          />
        )}
      </div>
      <Modal open={open} onOpenChange={setOpen} title="Abrir atendimento">
        <NewTicketForm onSuccess={() => setOpen(false)} />
      </Modal>
    </>
  );
}

'use client';
import { IS_DEMO } from '@/lib/api/config';
import { useState } from 'react';
import type { Campaign } from '@/lib/domain/types';
import { useAdminData } from './admin-frame';
import { AdminHeading, AdminMetrics, useAdminAction, useAdminFilter } from './shared';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { Form, text } from '@/components/ui/form';
import { StatusBadge } from '@/components/ui/status-badge';
import { dateLabel, today, uid } from '@/lib/domain/format';
export function CampaignManager() {
  const data = useAdminData(),
    action = useAdminAction(),
    [editing, setEditing] = useState<Campaign | 'new' | null>(null),
    [preview, setPreview] = useState(false),
    current = editing === 'new' ? undefined : editing,
    filter = useAdminFilter(
      data.campaigns,
      (c) => c.subject + ' ' + c.message,
      (c) => c.status,
      ['Todos', 'Rascunho', 'Agendada', 'Cancelada'],
    );
  return (
    <>
      <AdminHeading
        title="Uma oração para cada manhã"
        description="Prepare palavras de esperança para quem escolheu caminhar com a gente."
        actions={<Button onClick={() => setEditing('new')}>Escrever oração</Button>}
      />
      <AdminMetrics
        items={[
          {
            label: IS_DEMO ? 'Inscrição local ativa' : 'Mensagens aceitas',
            value: IS_DEMO
              ? data.newsletter?.subscribed
                ? 1
                : 0
              : data.campaigns.reduce((n, c) => n + c.recipients, 0),
            note: IS_DEMO ? 'Somente este navegador' : 'Aceitas pelo provedor de e-mail',
          },
          {
            label: 'Em preparação',
            value: data.campaigns.filter((c) => c.status === 'Rascunho').length,
            note: 'Rascunhos para revisar',
          },
          {
            label: 'Agendadas',
            value: data.campaigns.filter((c) => c.status === 'Agendada').length,
            note: IS_DEMO ? 'Agendamentos demonstrativos' : 'Aguardando o horário de Brasília',
          },
        ]}
      />
      {filter.toolbar}
      <div className="edition-list">
        {filter.rows.map((c) => (
          <article className="edition-card" key={c.id}>
            <div className="row between">
              <span>{dateLabel(c.date)}</span>
              <StatusBadge status={c.status} />
            </div>
            <h2>{c.subject}</h2>
            <p>{c.previewText || c.message.slice(0, 140)}</p>
            <p>
              {c.audience || 'Inscritos em oração'} · {c.recipients} envios realizados
            </p>
            <div className="row wrap">
              <Button variant="secondary" className="small" onClick={() => setEditing(c)}>
                Editar e visualizar
              </Button>
              {c.status !== 'Agendada' ? (
                <Button
                  variant="text"
                  disabled={action.pending}
                  onClick={() =>
                    action.execute(
                      { type: 'campaign.action', id: c.id, action: 'schedule' },
                      IS_DEMO
                        ? 'Agendamento demonstrativo salvo. Nenhum e-mail será enviado.'
                        : 'Oração agendada para os inscritos confirmados.',
                    )
                  }
                >
                  Agendar
                </Button>
              ) : (
                <Button
                  variant="text"
                  disabled={action.pending}
                  onClick={() =>
                    action.execute({ type: 'campaign.action', id: c.id, action: 'cancel' })
                  }
                >
                  Cancelar agendamento
                </Button>
              )}
            </div>
          </article>
        ))}
      </div>
      {!filter.rows.length && (
        <section className="admin-panel">
          <h2>A próxima oração começa aqui.</h2>
          <p>Escreva uma mensagem, confira a prévia e escolha a data de acolher seus leitores.</p>
          <Button variant="secondary" onClick={() => setEditing('new')}>
            Criar primeiro rascunho
          </Button>
        </section>
      )}
      <p className="notice" style={{ marginTop: 24 }}>
        {IS_DEMO
          ? 'Envio demonstrativo. Nenhum e-mail será enviado.'
          : 'Os envios respeitam confirmação de inscrição, descadastro e o horário de Brasília. Aceite pelo provedor e entrega são etapas distintas.'}
      </p>
      <Modal
        open={!!editing}
        onOpenChange={(open) => !open && setEditing(null)}
        title="Preparar oração diária"
        className="product-editor-dialog"
      >
        {editing && (
          <Form
            key={current?.id || 'new'}
            onSubmit={async (d) => {
              await action.run({
                type: 'campaign.save',
                campaign: {
                  id: current?.id || uid('ORA'),
                  subject: text(d, 'subject'),
                  previewText: text(d, 'previewText'),
                  message: text(d, 'message'),
                  date: text(d, 'date'),
                  recipients: current?.recipients || 0,
                  status: 'Rascunho',
                  audience: text(d, 'audience') as Campaign['audience'],
                },
              });
              setEditing(null);
            }}
          >
            {(pending) => (
              <>
                <label>
                  Assunto
                  <input
                    name="subject"
                    minLength={5}
                    maxLength={150}
                    required
                    defaultValue={current?.subject}
                  />
                </label>
                <label>
                  Prévia na caixa de entrada
                  <input name="previewText" maxLength={160} defaultValue={current?.previewText} />
                </label>
                <label>
                  Oração ou mensagem
                  <textarea
                    name="message"
                    rows={9}
                    required
                    minLength={20}
                    maxLength={3000}
                    defaultValue={current?.message}
                  />
                </label>
                <div className="form-grid">
                  <label>
                    Data desejada
                    <input
                      name="date"
                      type="date"
                      required
                      min={today()}
                      defaultValue={current?.date || today()}
                    />
                  </label>
                  <label>
                    Público
                    <select
                      name="audience"
                      defaultValue={current?.audience || 'Inscritos em oração'}
                    >
                      <option>Inscritos em oração</option>
                    </select>
                  </label>
                </div>
                <div className="row wrap">
                  <Button loading={pending}>Salvar rascunho</Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={(e) => {
                      const form = e.currentTarget.closest('form');
                      if (form) {
                        const d = new FormData(form);
                        setPreview(true);
                        const article = document.getElementById('prayer-email-preview');
                        if (article) {
                          article.querySelector('h2')!.textContent = text(d, 'subject');
                          article.querySelector('p')!.textContent = text(d, 'message');
                        }
                      }
                    }}
                  >
                    Prévia do e-mail
                  </Button>
                </div>
                <article id="prayer-email-preview" className="email-preview" hidden={!preview}>
                  <span>Mãos em Oração</span>
                  <h2>{current?.subject}</h2>
                  <p style={{ whiteSpace: 'pre-wrap' }}>{current?.message}</p>
                  <footer>
                    Você escolheu receber uma oração gratuita. Pode cancelar a qualquer momento.
                  </footer>
                </article>
              </>
            )}
          </Form>
        )}
      </Modal>
    </>
  );
}

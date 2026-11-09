'use client';
import { useState } from 'react';
import type { Prayer } from '@/lib/domain/types';
import { useAdminData } from './admin-frame';
import { AdminHeading, AdminMetrics, useAdminFilter, useAdminAction } from './shared';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { Form, text } from '@/components/ui/form';
import { StatusBadge } from '@/components/ui/status-badge';
import { dateLabel } from '@/lib/domain/format';
export function PrayerManager() {
  const data = useAdminData(),
    action = useAdminAction(),
    [id, setId] = useState<string | null>(null),
    current = data.prayers.find((p) => p.id === id),
    status = (p: Prayer) => p.moderation || (p.hidden ? 'Oculto' : 'Publicado'),
    filter = useAdminFilter(
      data.prayers,
      (p) => p.title + ' ' + p.message + ' ' + p.category,
      status,
      ['Todos', 'Em análise', 'Publicado', 'Oculto'],
    );
  return (
    <>
      <AdminHeading
        title="Mural de orações"
        description="Um espaço de acolhimento também precisa de cuidado. Revise, publique e acompanhe cada pedido."
      />
      <AdminMetrics
        items={[
          {
            label: 'Aguardando acolhimento',
            value: data.prayers.filter((p) => status(p) === 'Em análise').length,
            note: 'Pedidos aguardando revisão',
          },
          {
            label: 'No mural',
            value: data.prayers.filter((p) => status(p) === 'Publicado').length,
            note: 'Visíveis para a comunidade',
          },
          {
            label: 'Sinalizações',
            value: data.prayers.reduce((sum, p) => sum + (p.reports?.length || 0), 0),
            note: 'Relatos para revisar',
          },
          {
            label: 'Pessoas em oração',
            value: data.prayers.reduce((sum, p) => sum + p.reactions, 0),
            note: 'Reações registradas',
          },
        ]}
      />
      {filter.toolbar}
      <div className="admin-prayer-list">
        {filter.rows.map((p) => (
          <article key={p.id} className="admin-panel">
            <div className="row between wrap">
              <span>
                {p.category} · {dateLabel(p.created)}
              </span>
              <StatusBadge status={status(p)} />
            </div>
            <h2>{p.title}</h2>
            <p>{p.message}</p>
            <div className="row between wrap">
              <small>
                {p.anonymous ? 'Pedido anônimo' : p.name}
                {p.example ? ' · Exemplo fictício' : ''}
                <br />
                {p.reactions} pessoas em oração · {p.reports?.length || 0} sinalizações
              </small>
              <Button variant="secondary" className="small" onClick={() => setId(p.id)}>
                Acolher e revisar
              </Button>
            </div>
          </article>
        ))}
      </div>
      {!filter.rows.length && <p className="notice">Nenhum pedido nesta seleção.</p>}
      <Modal
        open={!!current}
        onOpenChange={(open) => !open && setId(null)}
        title="Revisão do pedido de oração"
        className="admin-record-drawer"
      >
        {current && (
          <div className="stack">
            <h2>{current.title}</h2>
            <p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.8 }}>{current.message}</p>
            <p>
              {current.anonymous ? 'Pedido anônimo' : current.name} · {current.category} ·{' '}
              {dateLabel(current.created)}
            </p>
            <section className="admin-panel">
              <h3>Sinalizações da comunidade</h3>
              {current.reports?.map((r, i) => (
                <p key={i}>
                  {dateLabel(r.date)} · {r.reason}
                </p>
              ))}
              {!current.reports?.length && <p>Nenhuma sinalização.</p>}
            </section>
            <Form
              onSubmit={async (d) => {
                await action.run({
                  type: 'prayer.review',
                  id: current.id,
                  status: text(d, 'status') as 'Publicado' | 'Em análise' | 'Oculto',
                  note: text(d, 'note'),
                });
                setId(null);
              }}
            >
              {(pending) => (
                <>
                  <label>
                    Visibilidade
                    <select name="status" defaultValue={status(current)}>
                      <option>Em análise</option>
                      <option>Publicado</option>
                      <option>Oculto</option>
                    </select>
                  </label>
                  <label>
                    Nota interna de moderação
                    <textarea
                      name="note"
                      maxLength={1000}
                      defaultValue={current.moderationNote}
                      placeholder="Registre o motivo da decisão, sem expor dados sensíveis."
                    />
                  </label>
                  <p className="notice">
                    Notas de moderação não são exibidas no mural. Evite informações pessoais
                    desnecessárias.
                  </p>
                  <Button loading={pending}>Salvar revisão</Button>
                </>
              )}
            </Form>
          </div>
        )}
      </Modal>
    </>
  );
}

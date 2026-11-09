'use client';
import { useState } from 'react';
import type { ClubEdition, FaithProfile } from '@/lib/domain/types';
import { useAdminData } from './admin-frame';
import { AdminHeading, useAdminAction } from './shared';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { Form, text, number } from '@/components/ui/form';
import { StatusBadge } from '@/components/ui/status-badge';
import { monthLabel, uid } from '@/lib/domain/format';
export function EditionsManager() {
  const data = useAdminData(),
    action = useAdminAction(),
    [editing, setEditing] = useState<ClubEdition | 'new' | null>(null),
    [status, setStatus] = useState('Todas');
  const current = editing === 'new' ? undefined : editing;
  return (
    <>
      <AdminHeading
        title="Edições do clube"
        description="Cada mês, uma nova forma de levar a fé para dentro de casa."
        actions={<Button onClick={() => setEditing('new')}>Preparar nova edição</Button>}
      />
      <div className="admin-toolbar">
        <label>
          Filtrar edições
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            {['Todas', 'Rascunho', 'Programada', 'Em produção', 'Concluída'].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <p>
          Curadoria atual: <strong>{data.settings.edition}</strong> ·{' '}
          {monthLabel(data.settings.editionMonth)}
        </p>
      </div>
      <div className="edition-list">
        {data.editions
          .filter((e) => status === 'Todas' || e.status === status)
          .map((e) => (
            <article className="edition-card" key={e.id}>
              <div className="row between">
                <span>{monthLabel(e.month)}</span>
                <StatusBadge status={e.status} />
              </div>
              <h2>{e.name}</h2>
              <p>Expedição prevista no dia {e.dispatchDay}</p>
              <p>
                {Object.entries(e.profiles)
                  .map(([profile, items]) => `${profile}: ${items.length} peças`)
                  .join(' · ')}
              </p>
              <p>
                {data.subscriptions.filter((s) => s.status === 'Ativa').length} assinaturas ativas
                na operação
              </p>
              <div className="row wrap">
                <Button variant="secondary" className="small" onClick={() => setEditing(e)}>
                  Abrir edição
                </Button>
                <Button
                  variant="text"
                  onClick={() =>
                    setEditing({
                      ...e,
                      id: uid('ED'),
                      name: e.name + ' · cópia',
                      status: 'Rascunho',
                    })
                  }
                >
                  Duplicar
                </Button>
                {e.name !== data.settings.edition && (
                  <Button
                    variant="text"
                    disabled={action.pending}
                    onClick={() =>
                      action.execute(
                        { type: 'edition.activate', id: e.id },
                        'Curadoria aplicada aos próximos ciclos.',
                      )
                    }
                  >
                    Usar nos próximos ciclos
                  </Button>
                )}
              </div>
            </article>
          ))}
      </div>
      {!data.editions.length && (
        <p className="notice">Prepare a primeira edição para organizar a curadoria do clube.</p>
      )}
      <Modal
        open={!!editing}
        onOpenChange={(open) => !open && setEditing(null)}
        title={editing === 'new' ? 'Nova edição do clube' : 'Curadoria e envios da edição'}
        className="product-editor-dialog"
      >
        {editing && (
          <Form
            key={current?.id || 'new'}
            onSubmit={async (d) => {
              const profiles = Object.fromEntries(
                (['Católica', 'Evangélica', 'Cristã'] as FaithProfile[]).map((profile) => [
                  profile,
                  d.getAll('items-' + profile).map(String),
                ]),
              ) as ClubEdition['profiles'];
              await action.run({
                type: 'edition.save',
                edition: {
                  id: current?.id || uid('ED'),
                  name: text(d, 'name'),
                  month: text(d, 'month'),
                  dispatchDay: number(d, 'dispatchDay'),
                  status: text(d, 'status') as ClubEdition['status'],
                  profiles,
                  message: text(d, 'message'),
                  notes: text(d, 'notes'),
                },
              });
              setEditing(null);
            }}
          >
            {(pending) => (
              <>
                <div className="form-grid">
                  <label>
                    Nome da edição
                    <input name="name" minLength={3} required defaultValue={current?.name} />
                  </label>
                  <label>
                    Mês
                    <input
                      name="month"
                      type="month"
                      required
                      defaultValue={current?.month || data.settings.editionMonth}
                    />
                  </label>
                  <label>
                    Dia da expedição
                    <input
                      name="dispatchDay"
                      type="number"
                      min={1}
                      max={28}
                      required
                      defaultValue={current?.dispatchDay || data.settings.dispatchDay}
                    />
                  </label>
                  <label>
                    Situação
                    <select name="status" defaultValue={current?.status || 'Rascunho'}>
                      {['Rascunho', 'Programada', 'Em produção', 'Concluída'].map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                  </label>
                </div>
                {(['Católica', 'Evangélica', 'Cristã'] as const).map((profile) => (
                  <fieldset className="edition-profile" key={profile}>
                    <legend>Cesta {profile.toLowerCase()}</legend>
                    <div>
                      {data.products
                        .filter((p) => p.active && !p.archived)
                        .map((p) => (
                          <label key={p.id}>
                            <input
                              type="checkbox"
                              name={'items-' + profile}
                              value={p.id}
                              defaultChecked={(current?.profiles || data.settings.profiles)[
                                profile
                              ].includes(p.id)}
                            />
                            {p.name}
                          </label>
                        ))}
                    </div>
                  </fieldset>
                ))}
                <label>
                  Mensagem que acompanha a cesta
                  <textarea name="message" maxLength={2000} defaultValue={current?.message} />
                </label>
                <label>
                  Notas internas de preparação
                  <textarea name="notes" maxLength={2000} defaultValue={current?.notes} />
                </label>
                {current && (
                  <section className="admin-panel">
                    <h3>Pedidos desta edição</h3>
                    {data.orders
                      .filter((o) => o.edition === current.name)
                      .map((o) => (
                        <div className="money-line" key={o.id}>
                          <span>{o.number}</span>
                          <StatusBadge status={o.status} />
                        </div>
                      ))}
                    {!data.orders.some((o) => o.edition === current.name) && (
                      <p>Nenhum ciclo gerado para esta edição.</p>
                    )}
                  </section>
                )}
                <p className="notice">
                  Salvar a edição não altera pedidos já criados. Use “Usar nos próximos ciclos” para
                  mudar a curadoria das novas cestas.
                </p>
                <Button loading={pending}>Salvar edição</Button>
              </>
            )}
          </Form>
        )}
      </Modal>
    </>
  );
}

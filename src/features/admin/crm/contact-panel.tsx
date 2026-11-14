'use client';
import { useState } from 'react';
import type { MarketingContactRow } from '@maos-em-oracao/contracts';
import { basisLabel, consentDate, contactStatus, sourceLabel } from './contact-meta';
import { TagEditor } from './tag-editor';
import { useGuardedRun } from './use-guarded-run';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/status-badge';

/** Side panel for one contact. There is deliberately no way to subscribe someone again. */
export function ContactPanel({
  contact,
  onChange,
}: {
  contact: MarketingContactRow;
  onChange: (patch: Partial<MarketingContactRow>) => void;
}) {
  const run = useGuardedRun(),
    [confirming, setConfirming] = useState(false);
  return (
    <div className="stack">
      <p>
        <strong>{contact.email}</strong>
        <br />
        {contact.name || 'Sem nome'}
      </p>
      <StatusBadge status={contactStatus(contact)} />
      <p className="admin-note">
        Base legal: {basisLabel(contact)}
        <br />
        Aceite em {consentDate(contact)} · origem {sourceLabel(contact)}
      </p>
      <h3>Etiquetas</h3>
      <TagEditor email={contact.email} tags={contact.tags} onSaved={(tags) => onChange({ tags })} />
      {!contact.unsubscribedAt &&
        (confirming ? (
          <div className="stack">
            <p>
              {contact.email} deixa de receber e-mails de marketing. Não dá para desfazer por aqui:
              só a própria pessoa pode voltar a aceitar.
            </p>
            <div className="row wrap">
              <Button type="button" variant="secondary" onClick={() => setConfirming(false)}>
                Voltar
              </Button>
              <Button
                type="button"
                loading={run.pending}
                onClick={async () => {
                  if (
                    await run.go(
                      { type: 'crm.contact.unsubscribe', email: contact.email },
                      'Contato descadastrado.',
                    )
                  ) {
                    setConfirming(false);
                    onChange({ unsubscribedAt: new Date().toISOString(), eligible: false });
                  }
                }}
              >
                Sim, descadastrar
              </Button>
            </div>
          </div>
        ) : (
          <Button type="button" variant="secondary" onClick={() => setConfirming(true)}>
            Marcar como descadastrado
          </Button>
        ))}
      {run.error && (
        <p className="form-error" role="alert">
          {run.error}
        </p>
      )}
    </div>
  );
}

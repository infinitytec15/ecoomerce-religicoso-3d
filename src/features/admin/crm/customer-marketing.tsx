'use client';
import { useEffect, useState } from 'react';
import type { MarketingContactRow } from '@maos-em-oracao/contracts';
import { basisLabel, consentDate, contactStatus, normalizeEmail } from './contact-meta';
import { TagEditor } from './tag-editor';
import { StatusBadge } from '@/components/ui/status-badge';
import { errorMessage } from '@/lib/api/contracts';
import { useGateway, useSession } from '@/lib/api/query';

/** "E-mail marketing" card on the customer page; only for staff with the `marketing` permission. */
export function CustomerMarketingCard({ email }: { email: string }) {
  const permitted = !!useSession().data?.permissions.includes('marketing');
  return permitted ? <MarketingBody email={email} /> : null;
}

function MarketingBody({ email }: { email: string }) {
  const gateway = useGateway(),
    address = normalizeEmail(email),
    [loaded, setLoaded] = useState<{
      address: string;
      contact?: MarketingContactRow;
      error?: string;
      tags?: string[];
    }>(),
    state = loaded?.address === address ? loaded : undefined;
  useEffect(() => {
    let live = true;
    gateway.crmContacts({ q: address }).then(
      (page) =>
        live &&
        setLoaded({
          address,
          contact: page.items.find((c) => normalizeEmail(c.email) === address),
        }),
      (e) => live && setLoaded({ address, error: errorMessage(e) }),
    );
    return () => {
      live = false;
    };
  }, [gateway, address]);
  const contact = state?.contact;
  return (
    <section className="admin-panel" aria-labelledby="customer-marketing-title">
      <h2 id="customer-marketing-title">E-mail marketing</h2>
      {!state && <p role="status">Carregando…</p>}
      {state?.error && (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      )}
      {state && !state.error && (
        <>
          {contact ? (
            <>
              <StatusBadge status={contactStatus(contact)} />
              <p className="admin-note">
                Base legal: {basisLabel(contact)}
                <br />
                Aceite em {consentDate(contact)}
              </p>
            </>
          ) : (
            <p className="admin-note">Este e-mail ainda não está na lista de contatos.</p>
          )}
          <h3>Etiquetas</h3>
          <TagEditor
            email={address}
            tags={state.tags ?? contact?.tags ?? []}
            onSaved={(next) => setLoaded({ ...state, tags: next })}
          />
        </>
      )}
    </section>
  );
}

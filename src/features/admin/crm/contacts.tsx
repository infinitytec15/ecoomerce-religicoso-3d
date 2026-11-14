'use client';
import { useEffect, useState } from 'react';
import type { MarketingContactRow } from '@maos-em-oracao/contracts';
import { useAdminData } from '../admin-frame';
import { basisLabel, consentDate, contactStatus } from './contact-meta';
import { ContactPanel } from './contact-panel';
import { ImportDialog } from './import-dialog';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table';
import { Modal } from '@/components/ui/modal';
import { StatusBadge } from '@/components/ui/status-badge';
import { errorMessage } from '@/lib/api/contracts';
import { useGateway } from '@/lib/api/query';

const SEARCH_DELAY_MS = 300;

export function ContactsTab() {
  const gateway = useGateway(),
    { crm } = useAdminData(),
    [search, setSearch] = useState(''),
    [q, setQ] = useState(''),
    [tag, setTag] = useState(''),
    [version, setVersion] = useState(0),
    [loaded, setLoaded] = useState<{
      key: string;
      items: MarketingContactRow[];
      next?: string;
      error?: string;
      moreError?: string;
    }>(),
    [more, setMore] = useState(false),
    [openId, setOpenId] = useState<string | null>(null),
    [importing, setImporting] = useState(false),
    key = JSON.stringify([q, tag, version]),
    current = loaded?.key === key ? loaded : undefined,
    items = current?.items ?? [],
    next = current?.next,
    state = current ? (current.error ? 'error' : 'ready') : 'loading',
    open = items.find((c) => c.id === openId);
  useEffect(() => {
    const timer = setTimeout(() => setQ(search.trim()), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    let live = true;
    gateway.crmContacts({ q: q || undefined, tag: tag || undefined }).then(
      (page) => live && setLoaded({ key, items: page.items, next: page.next }),
      (e) => live && setLoaded({ key, items: [], error: errorMessage(e) }),
    );
    return () => {
      live = false;
    };
  }, [gateway, q, tag, key]);
  async function loadMore() {
    setMore(true);
    try {
      const page = await gateway.crmContacts({
        q: q || undefined,
        tag: tag || undefined,
        cursor: next,
      });
      setLoaded(
        (c) =>
          c && { ...c, items: [...c.items, ...page.items], next: page.next, moreError: undefined },
      );
    } catch (e) {
      setLoaded((c) => c && { ...c, moreError: errorMessage(e) });
    } finally {
      setMore(false);
    }
  }
  return (
    <>
      <div className="row wrap">
        <label>
          Buscar contato
          <input
            type="search"
            value={search}
            placeholder="E-mail ou nome"
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <Button type="button" onClick={() => setImporting(true)}>
          Importar CSV
        </Button>
      </div>
      <div className="row wrap" role="group" aria-label="Filtrar por etiqueta">
        <button
          type="button"
          className={tag ? 'chip' : 'chip active'}
          aria-pressed={!tag}
          onClick={() => setTag('')}
        >
          Todos
        </button>
        {crm.tags.map((t) => (
          <button
            key={t.tag}
            type="button"
            className={tag === t.tag ? 'chip active' : 'chip'}
            aria-pressed={tag === t.tag}
            onClick={() => setTag(t.tag)}
          >
            {t.tag} ({t.count})
          </button>
        ))}
      </div>
      {(current?.error || current?.moreError) && (
        <p className="form-error" role="alert">
          {current?.error || current?.moreError}
        </p>
      )}
      {state === 'loading' ? (
        <p role="status">Carregando contatos…</p>
      ) : (
        <DataTable
          caption="Contatos de e-mail"
          rows={items}
          pageSize={1000}
          columns={[
            {
              key: 'email',
              label: 'E-mail',
              render: (c) => (
                <Button
                  type="button"
                  variant="text"
                  className="small"
                  onClick={() => setOpenId(c.id)}
                >
                  {c.email}
                </Button>
              ),
            },
            { key: 'name', label: 'Nome', render: (c) => c.name || '—' },
            {
              key: 'status',
              label: 'Situação',
              render: (c) => <StatusBadge status={contactStatus(c)} />,
            },
            { key: 'basis', label: 'Base legal', render: basisLabel },
            { key: 'consent', label: 'Aceite em', render: consentDate },
            { key: 'tags', label: 'Etiquetas', render: (c) => c.tags.join(', ') || '—' },
          ]}
        />
      )}
      {next && state === 'ready' && (
        <Button type="button" variant="secondary" loading={more} onClick={() => void loadMore()}>
          Carregar mais
        </Button>
      )}
      <Modal
        open={!!open}
        onOpenChange={(value) => !value && setOpenId(null)}
        title="Contato"
        className="admin-record-drawer"
      >
        {open && (
          <ContactPanel
            key={open.id}
            contact={open}
            onChange={(patch) =>
              setLoaded(
                (c) =>
                  c && {
                    ...c,
                    items: c.items.map((i) => (i.id === open.id ? { ...i, ...patch } : i)),
                  },
              )
            }
          />
        )}
      </Modal>
      <ImportDialog
        open={importing}
        onClose={() => setImporting(false)}
        onImported={() => setVersion((v) => v + 1)}
      />
    </>
  );
}

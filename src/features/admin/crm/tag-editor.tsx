'use client';
import { useState } from 'react';
import { CRM_LIMITS, normalizeTag } from '@maos-em-oracao/contracts';
import { useGuardedRun } from './use-guarded-run';
import { Icon } from '@/components/ui/icon';

/** Chips with add (Enter) and remove (×). Every change is saved at once with `crm.contact.save`. */
export function TagEditor({
  email,
  tags,
  onSaved,
}: {
  email: string;
  tags: string[];
  onSaved?: (tags: string[]) => void;
}) {
  const run = useGuardedRun(),
    [draft, setDraft] = useState(''),
    [notice, setNotice] = useState('');
  async function save(next: string[], message: string) {
    if (await run.go({ type: 'crm.contact.save', email, tags: next }, message)) {
      onSaved?.(next);
      return true;
    }
    return false;
  }
  async function add() {
    const tag = normalizeTag(draft);
    setNotice('');
    if (!tag) return;
    if (tag.length > CRM_LIMITS.tag)
      return setNotice(`A etiqueta pode ter até ${CRM_LIMITS.tag} caracteres.`);
    if (tags.includes(tag)) return setDraft('');
    if (tags.length >= CRM_LIMITS.tags)
      return setNotice(`Use no máximo ${CRM_LIMITS.tags} etiquetas por contato.`);
    if (await save([...tags, tag], 'Etiqueta adicionada.')) setDraft('');
  }
  return (
    <div className="stack">
      <div className="row wrap" aria-label="Etiquetas do contato">
        {tags.length ? (
          tags.map((tag) => (
            <span className="chip" key={tag}>
              {tag}
              <button
                type="button"
                aria-label={`Remover etiqueta ${tag}`}
                disabled={run.pending}
                onClick={() =>
                  void save(
                    tags.filter((t) => t !== tag),
                    'Etiqueta removida.',
                  )
                }
              >
                <Icon name="close" />
              </button>
            </span>
          ))
        ) : (
          <small>Sem etiquetas.</small>
        )}
      </div>
      <label>
        Nova etiqueta
        <input
          value={draft}
          maxLength={CRM_LIMITS.tag * 2}
          disabled={run.pending}
          placeholder="Digite e tecle Enter"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            void add();
          }}
        />
      </label>
      {(notice || run.error) && (
        <p className="form-error" role="alert">
          {notice || run.error}
        </p>
      )}
    </div>
  );
}

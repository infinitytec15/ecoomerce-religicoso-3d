'use client';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CRM_LIMITS, normalizeTag, parseContactsCsv } from '@maos-em-oracao/contracts';
import { useAdminData } from '../admin-frame';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { errorMessage, type CrmImportResult } from '@/lib/api/contracts';
import { useGateway } from '@/lib/api/query';

/** The API and the BFF cap request bodies at 256 KB, so rows go up in sequential chunks. */
export const IMPORT_CHUNK = 1000;

type Parsed = ReturnType<typeof parseContactsCsv>;
type Outcome = { kind: 'done'; result: CrmImportResult } | { kind: 'failed'; message: string };

const n = (value: number) => value.toLocaleString('pt-BR');
const plural = (count: number, one: string, many: string) =>
  `${n(count)} ${count === 1 ? one : many}`;

export const previewSentence = (p: Parsed) =>
  [
    plural(p.rows.length, 'contato válido', 'contatos válidos'),
    plural(p.invalid, 'inválido', 'inválidos'),
    plural(p.duplicates, 'repetido', 'repetidos'),
  ].join(' · ');

function Preview({ parsed, tooMany }: { parsed: Parsed; tooMany: boolean }) {
  return (
    <div className="stack">
      <p role="status">{previewSentence(parsed)}</p>
      {tooMany && (
        <p className="form-error" role="alert">
          Divida o arquivo em partes de até {n(CRM_LIMITS.importRows)} contatos.
        </p>
      )}
      {!parsed.rows.length && !tooMany && (
        <p className="form-error" role="alert">
          Nenhum e-mail válido encontrado no arquivo.
        </p>
      )}
      {parsed.rows.length > 0 && (
        <ul className="admin-note">
          {parsed.rows.slice(0, 5).map((r) => (
            <li key={r.email}>
              {r.email}
              {r.name ? ` · ${r.name}` : ''}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ImportDialog({
  open,
  onClose,
  onImported,
}: {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
}) {
  const gateway = useGateway(),
    client = useQueryClient(),
    { crm } = useAdminData(),
    [parsed, setParsed] = useState<Parsed>(),
    [fileError, setFileError] = useState(''),
    [tag, setTag] = useState(''),
    [consent, setConsent] = useState(false),
    [progress, setProgress] = useState<{ done: number; total: number }>(),
    [outcome, setOutcome] = useState<Outcome>(),
    tooMany = !!parsed && parsed.rows.length > CRM_LIMITS.importRows,
    cleanTag = normalizeTag(tag),
    running = !!progress,
    ready =
      !!parsed &&
      parsed.rows.length > 0 &&
      !tooMany &&
      !!cleanTag &&
      cleanTag.length <= CRM_LIMITS.tag &&
      consent &&
      !running &&
      outcome?.kind !== 'done';
  async function pick(file?: File) {
    setOutcome(undefined);
    setParsed(undefined);
    setFileError('');
    if (!file) return;
    try {
      setParsed(parseContactsCsv(await file.text()));
    } catch {
      setFileError('Não foi possível ler o arquivo.');
    }
  }
  async function submit() {
    if (!parsed || !ready) return;
    const rows = parsed.rows,
      total: CrmImportResult = { created: 0, updated: 0, keptUnsubscribed: 0 };
    let done = 0;
    setOutcome(undefined);
    setProgress({ done, total: rows.length });
    try {
      for (let i = 0; i < rows.length; i += IMPORT_CHUNK) {
        const chunk = rows.slice(i, i + IMPORT_CHUNK),
          result = await gateway.crmImport({ tag: cleanTag, consent: true, rows: chunk });
        total.created += result.created;
        total.updated += result.updated;
        total.keptUnsubscribed += result.keptUnsubscribed;
        done += chunk.length;
        setProgress({ done, total: rows.length });
      }
      setOutcome({ kind: 'done', result: total });
    } catch (e) {
      setOutcome({
        kind: 'failed',
        message:
          `${errorMessage(e)} Foram importados ${n(done)} de ${n(rows.length)} contatos antes do erro. ` +
          'Pode importar o arquivo de novo: quem já entrou só é atualizado, sem duplicar.',
      });
    } finally {
      setProgress(undefined);
      if (done > 0) {
        onImported();
        await client.invalidateQueries();
      }
    }
  }
  return (
    <Modal open={open} onOpenChange={(next) => !next && !running && onClose()} title="Importar CSV">
      <div className="stack">
        <label>
          Arquivo CSV
          <input
            type="file"
            accept=".csv,text/csv"
            disabled={running}
            onChange={(e) => void pick(e.target.files?.[0])}
          />
        </label>
        <small>Colunas: e-mail e nome (opcional), com ou sem cabeçalho.</small>
        {fileError && (
          <p className="form-error" role="alert">
            {fileError}
          </p>
        )}
        {parsed && <Preview parsed={parsed} tooMany={tooMany} />}
        <label>
          Etiqueta do grupo
          <input
            list="crm-import-tags"
            value={tag}
            maxLength={CRM_LIMITS.tag * 2}
            disabled={running}
            onChange={(e) => setTag(e.target.value)}
          />
          <datalist id="crm-import-tags">
            {crm.tags.map((t) => (
              <option key={t.tag} value={t.tag} />
            ))}
          </datalist>
        </label>
        <label className="row">
          <input
            type="checkbox"
            checked={consent}
            disabled={running}
            onChange={(e) => setConsent(e.target.checked)}
          />
          Tenho o consentimento dessas pessoas para enviar e-mails de marketing
        </label>
        {progress && (
          <p role="status">
            Importando {n(progress.done)} de {n(progress.total)}…
          </p>
        )}
        {outcome?.kind === 'done' && (
          <p role="status">
            {n(outcome.result.created)} novos, {n(outcome.result.updated)} atualizados,{' '}
            {n(outcome.result.keptUnsubscribed)} continuam descadastrados
          </p>
        )}
        {outcome?.kind === 'failed' && (
          <p className="form-error" role="alert">
            {outcome.message}
          </p>
        )}
        <div className="row wrap">
          <Button type="button" variant="secondary" disabled={running} onClick={onClose}>
            {outcome?.kind === 'done' ? 'Fechar' : 'Cancelar'}
          </Button>
          <Button type="button" disabled={!ready} loading={running} onClick={() => void submit()}>
            Importar
          </Button>
        </div>
      </div>
    </Modal>
  );
}

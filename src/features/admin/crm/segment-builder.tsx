'use client';
import { useEffect, useState } from 'react';
import {
  CRM_LIMITS,
  collectionSchema,
  estimateDuration,
  segmentRuleSchema,
  type SegmentRule,
} from '@maos-em-oracao/contracts';
import { useAdminData } from '../admin-frame';
import { Button } from '@/components/ui/button';
import { errorMessage, type CrmPreview } from '@/lib/api/contracts';
import { useGateway } from '@/lib/api/query';

const COLLECTIONS = collectionSchema.options;
const PREVIEW_DELAY_MS = 400;
let sequence = 0;
const nextKey = () => `rule-${++sequence}`;
const typeLabels: Record<SegmentRule['type'], string> = {
  product: 'Comprou o produto',
  category: 'Comprou na categoria',
  spentAbove: 'Gastou acima de',
  lastPurchase: 'Última compra',
  club: 'Assinantes do clube',
  prayer: 'Inscritos na oração',
  groupBuy: 'Participou de compra coletiva',
  tag: 'Etiqueta',
};
const TYPES = Object.keys(typeLabels) as SegmentRule['type'][];

/** A rule in the form may still be incomplete (no product chosen yet); only valid ones count. */
export function newRule(type: SegmentRule['type']): SegmentRule {
  switch (type) {
    case 'product':
      return { type, productId: '' };
    case 'category':
      return { type, category: COLLECTIONS[0]! };
    case 'spentAbove':
      return { type, cents: 0 };
    case 'lastPurchase':
      return { type, op: 'moreThan', days: 30 };
    case 'tag':
      return { type, tag: '' };
    default:
      return { type };
  }
}
export const validRules = (rules: SegmentRule[]) =>
  rules.filter((rule) => segmentRuleSchema.safeParse(rule).success);

/** "10,50", "10.50", "1.050,00" and "1050" -> cents. A lone dot with 1-2 digits after it is a decimal point. */
export function reaisToCents(text: string): number {
  const clean = text.replace(/[^\d.,]/g, '');
  let normalized: string;
  if (clean.includes(',')) normalized = clean.replace(/\./g, '').replace(',', '.');
  else if (/^\d*\.\d{1,2}$/.test(clean)) normalized = clean;
  else normalized = clean.replace(/\./g, '');
  const value = Number(normalized);
  return Number.isFinite(value) ? Math.round(value * 100) : 0;
}

function MoneyInput({
  label,
  cents,
  onChange,
}: {
  label: string;
  cents: number;
  onChange: (cents: number) => void;
}) {
  const [text, setText] = useState(cents ? String(cents / 100).replace('.', ',') : '');
  return (
    <label>
      {label}
      <input
        inputMode="decimal"
        placeholder="0,00"
        value={text}
        onChange={(e) => {
          const next = e.target.value.replace(/[^\d.,]/g, '');
          setText(next);
          onChange(reaisToCents(next));
        }}
      />
    </label>
  );
}

function RuleFields({
  rule,
  n,
  onChange,
}: {
  rule: SegmentRule;
  n: number;
  onChange: (rule: SegmentRule) => void;
}) {
  const data = useAdminData(),
    tags = data.crm.tags,
    products = data.products;
  switch (rule.type) {
    case 'product':
      return (
        <label>
          Produto da regra {n}
          <select
            value={rule.productId}
            onChange={(e) => onChange({ type: 'product', productId: e.target.value })}
          >
            <option value="">Escolha o produto</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.archived ? ' (arquivado)' : ''}
              </option>
            ))}
          </select>
        </label>
      );
    case 'category':
      return (
        <label>
          Categoria da regra {n}
          <select
            value={rule.category}
            onChange={(e) =>
              onChange({
                type: 'category',
                category: e.target.value as (typeof COLLECTIONS)[number],
              })
            }
          >
            {COLLECTIONS.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
      );
    case 'spentAbove':
      return (
        <MoneyInput
          label={`Valor em reais da regra ${n}`}
          cents={rule.cents}
          onChange={(cents) => onChange({ type: 'spentAbove', cents })}
        />
      );
    case 'lastPurchase':
      return (
        <>
          <label>
            Comparação da regra {n}
            <select
              value={rule.op}
              onChange={(e) => onChange({ ...rule, op: e.target.value as 'moreThan' | 'lessThan' })}
            >
              <option value="moreThan">Há mais de</option>
              <option value="lessThan">Há menos de</option>
            </select>
          </label>
          <label>
            Dias da regra {n}
            <input
              type="number"
              min={1}
              max={3650}
              value={rule.days || ''}
              onChange={(e) => onChange({ ...rule, days: Math.trunc(Number(e.target.value)) })}
            />
          </label>
        </>
      );
    case 'tag':
      return (
        <label>
          Etiqueta da regra {n}
          <select value={rule.tag} onChange={(e) => onChange({ type: 'tag', tag: e.target.value })}>
            <option value="">Escolha a etiqueta</option>
            {tags.map((t) => (
              <option key={t.tag} value={t.tag}>
                {t.tag} ({t.count})
              </option>
            ))}
          </select>
        </label>
      );
    default:
      return null;
  }
}

export function audienceSentence(preview: CrmPreview, hourlyLimit: number): string {
  const { total, consent, legitimateInterest } = preview;
  return `${total === 1 ? '1 pessoa vai receber' : `${total} pessoas vão receber`} (${consent} por aceite, ${legitimateInterest} por legítimo interesse) · envio em ${estimateDuration(total, hourlyLimit)}`;
}

function AudienceCount({ rules }: { rules: SegmentRule[] }) {
  const gateway = useGateway(),
    { crm } = useAdminData(),
    valid = validRules(rules),
    key = JSON.stringify(valid),
    [result, setResult] = useState<{ key: string; data?: CrmPreview; error?: string }>();
  useEffect(() => {
    const segment = { rules: JSON.parse(key) as SegmentRule[] };
    if (!segment.rules.length) return;
    let live = true;
    const timer = setTimeout(() => {
      gateway.crmPreview(segment).then(
        (data) => live && setResult({ key, data }),
        (e) => live && setResult({ key, error: errorMessage(e) }),
      );
    }, PREVIEW_DELAY_MS);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [key, gateway]);
  if (!valid.length) return <p className="segment-count">Todos que podem receber</p>;
  const current = result?.key === key ? result : undefined;
  if (current?.error)
    return (
      <p className="form-error" role="status">
        Não foi possível calcular o público: {current.error}
      </p>
    );
  if (!current?.data) return <p className="segment-count">Calculando o público…</p>;
  return (
    <p className="segment-count" role="status">
      {audienceSentence(current.data, crm.settings.hourlyLimit)}
    </p>
  );
}

export function SegmentBuilder({
  rules,
  onChange,
}: {
  rules: SegmentRule[];
  onChange: (rules: SegmentRule[]) => void;
}) {
  const incomplete = rules.length - validRules(rules).length,
    // Client-only ids so a row keeps its own input state when another row is removed.
    [keys, setKeys] = useState(() => rules.map(() => nextKey())),
    rowKeys = keys.length === rules.length ? keys : rules.map((_, i) => keys[i] ?? nextKey());
  return (
    <fieldset className="stack">
      <legend>Quem recebe</legend>
      {rules.length > 0 && <p>Todas as regras precisam valer ao mesmo tempo.</p>}
      {rules.map((rule, index) => (
        <div className="row wrap" key={rowKeys[index]}>
          <label>
            Tipo da regra {index + 1}
            <select
              value={rule.type}
              onChange={(e) => {
                const next = [...rules];
                next[index] = newRule(e.target.value as SegmentRule['type']);
                onChange(next);
              }}
            >
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {typeLabels[t]}
                </option>
              ))}
            </select>
          </label>
          <RuleFields
            rule={rule}
            n={index + 1}
            onChange={(next) => onChange(rules.map((r, i) => (i === index ? next : r)))}
          />
          <Button
            type="button"
            variant="text"
            className="small danger-text"
            aria-label={`Remover regra ${index + 1}`}
            onClick={() => {
              setKeys(rowKeys.filter((_, i) => i !== index));
              onChange(rules.filter((_, i) => i !== index));
            }}
          >
            Remover
          </Button>
        </div>
      ))}
      <div className="row wrap">
        <Button
          type="button"
          variant="secondary"
          className="small"
          disabled={rules.length >= CRM_LIMITS.rules}
          onClick={() => {
            setKeys([...rowKeys, nextKey()]);
            onChange([...rules, newRule('product')]);
          }}
        >
          Adicionar regra
        </Button>
      </div>
      {incomplete > 0 && (
        <small>
          Regras incompletas não entram na contagem. Complete ou remova antes de salvar.
        </small>
      )}
      <AudienceCount rules={rules} />
    </fieldset>
  );
}

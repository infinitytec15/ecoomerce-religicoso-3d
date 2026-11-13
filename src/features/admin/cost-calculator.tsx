'use client';
import { useId, useMemo, useState, type ReactNode } from 'react';
import {
  calculatePrintCost,
  defaultCalculatorSettings,
  projectProfit,
  type CalculatorSettings,
  type PrintCostResult,
  type PrintJob,
} from '@maos-em-oracao/contracts';
import { useAdminData } from './admin-frame';
import { useSession } from '@/lib/api/query';
import { AdminHeading } from './shared';
import { CalculatorSettingsEditor } from './cost-calculator-settings';
import { Button } from '@/components/ui/button';
import { centsFromInput, money, parsePercent } from '@/lib/domain/format';

type Technology = PrintJob['technology'];

const techLabel: Record<Technology, string> = { fdm: 'FDM (filamento)', resin: 'Resina' };
const techName: Record<Technology, string> = { fdm: 'FDM', resin: 'resina' };
const partLabels = [
  ['materialCents', 'Material'],
  ['packagingCents', 'Embalagem'],
  ['energyCents', 'Energia e máquina'],
  ['laborCents', 'Mão de obra'],
  ['otherCents', 'Falhas e extras'],
] as const;

const toCents = (v: string) => {
  const n = centsFromInput(v || '0');
  return Number.isFinite(n) && n > 0 ? n : 0;
};
const toNumber = (v: string) => Math.max(0, parsePercent(v));

function Field({ label, children }: { label: string; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <div className="calc-field">
      <label htmlFor={id}>{label}</label>
      {children(id)}
    </div>
  );
}

export function PrintCostForm({
  settings,
  initial,
  onApply,
}: {
  settings: CalculatorSettings;
  initial?: Partial<PrintJob>;
  onApply?: (r: PrintCostResult) => void;
}) {
  const firstOf = (tech: Technology) => ({
    materialId: settings.materials.find((m) => m.technology === tech)?.id ?? '',
    printerId: settings.printers.find((p) => p.technology === tech)?.id ?? '',
  });
  const [technology, setTechnology] = useState<Technology>(initial?.technology ?? 'fdm');
  const [materialId, setMaterialId] = useState(
    initial?.materialId ?? firstOf(technology).materialId,
  );
  const [printerId, setPrinterId] = useState(initial?.printerId ?? firstOf(technology).printerId);
  const [amount, setAmount] = useState(String(initial?.amount ?? ''));
  const [hours, setHours] = useState(String(initial?.printHours ?? ''));
  const [pieces, setPieces] = useState(String(initial?.piecesPerPlate ?? 1));
  const [minutes, setMinutes] = useState(String(initial?.laborMinutes ?? ''));
  const [kitId, setKitId] = useState(
    initial?.packagingKitId ?? settings.packagingKits[0]?.id ?? '',
  );
  const [extra, setExtra] = useState(
    initial?.extraCents ? (initial.extraCents / 100).toFixed(2).replace('.', ',') : '',
  );
  const [price, setPrice] = useState('');
  const [units, setUnits] = useState('');

  const result = useMemo(() => {
    const job: PrintJob = {
      technology,
      materialId,
      amount: toNumber(amount),
      printHours: toNumber(hours),
      printerId,
      piecesPerPlate: Math.max(1, Math.floor(toNumber(pieces))),
      laborMinutes: toNumber(minutes),
      packagingKitId: kitId || undefined,
      extraCents: toCents(extra),
    };
    try {
      return calculatePrintCost(settings, job);
    } catch {
      return null;
    }
  }, [settings, technology, materialId, printerId, amount, hours, pieces, minutes, kitId, extra]);

  const switchTechnology = (tech: Technology) => {
    setTechnology(tech);
    const first = firstOf(tech);
    setMaterialId(first.materialId);
    setPrinterId(first.printerId);
  };

  const priceCents = toCents(price);
  const projection =
    result && priceCents > 0
      ? projectProfit(result, settings, priceCents, Math.floor(toNumber(units)))
      : null;

  return (
    <div className="calc-layout">
      <section className="admin-panel stack">
        <div className="admin-panel-heading">
          <div>
            <h2>Peça</h2>
            <p>Informe os dados da impressão; o custo é calculado a cada alteração.</p>
          </div>
        </div>
        <div className="form-grid">
          <Field label="Tecnologia">
            {(id) => (
              <select
                id={id}
                value={technology}
                onChange={(e) => switchTechnology(e.target.value as Technology)}
              >
                {(Object.keys(techLabel) as Technology[]).map((t) => (
                  <option key={t} value={t}>
                    {techLabel[t]}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Material">
            {(id) => (
              <select id={id} value={materialId} onChange={(e) => setMaterialId(e.target.value)}>
                {settings.materials
                  .filter((m) => m.technology === technology)
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
              </select>
            )}
          </Field>
          <Field label="Impressora">
            {(id) => (
              <select id={id} value={printerId} onChange={(e) => setPrinterId(e.target.value)}>
                {settings.printers
                  .filter((p) => p.technology === technology)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
            )}
          </Field>
          <Field label={technology === 'fdm' ? 'Filamento (g)' : 'Resina (ml)'}>
            {(id) => (
              <input
                id={id}
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            )}
          </Field>
          <Field label="Tempo de impressão (h)">
            {(id) => (
              <input
                id={id}
                inputMode="decimal"
                value={hours}
                onChange={(e) => setHours(e.target.value)}
              />
            )}
          </Field>
          <Field label="Peças por mesa">
            {(id) => (
              <input
                id={id}
                inputMode="numeric"
                value={pieces}
                onChange={(e) => setPieces(e.target.value)}
              />
            )}
          </Field>
          <Field label="Mão de obra (min)">
            {(id) => (
              <input
                id={id}
                inputMode="decimal"
                value={minutes}
                onChange={(e) => setMinutes(e.target.value)}
              />
            )}
          </Field>
          <Field label="Embalagem">
            {(id) => (
              <select id={id} value={kitId} onChange={(e) => setKitId(e.target.value)}>
                <option value="">Sem embalagem</option>
                {settings.packagingKits.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.name}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Custo extra (R$)">
            {(id) => (
              <input
                id={id}
                inputMode="decimal"
                value={extra}
                onChange={(e) => setExtra(e.target.value)}
              />
            )}
          </Field>
        </div>
      </section>

      <section className="admin-panel stack">
        <div className="admin-panel-heading">
          <div>
            <h2>Resultado</h2>
          </div>
        </div>
        {!result ? (
          <p className="calc-hint">
            Cadastre um material e uma impressora de {techName[technology]} na configuração.
          </p>
        ) : (
          <>
            <dl className="calc-parts">
              {partLabels.map(([key, label]) => (
                <div key={key}>
                  <dt>{label}</dt>
                  <dd>{money(result.breakdown[key])}</dd>
                </div>
              ))}
            </dl>
            <div className="calc-totals">
              <div>
                <span>Custo total</span>
                <strong data-testid="total-cost">{money(result.totalCents)}</strong>
              </div>
              <div>
                <span>Preço sugerido ({settings.targetMarginPct}% de margem)</span>
                <strong data-testid="suggested-price">
                  {result.suggestedPriceCents === null ? '—' : money(result.suggestedPriceCents)}
                </strong>
              </div>
            </div>
            {result.error === 'MARGIN_TOO_HIGH' && (
              <p className="form-error" role="alert">
                Margem e taxas somam 100% ou mais
              </p>
            )}
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th scope="col">Margem</th>
                    <th scope="col">Preço de venda</th>
                  </tr>
                </thead>
                <tbody>
                  {result.prices.map((p) => (
                    <tr key={p.marginPct}>
                      <th scope="row">{p.marginPct}%</th>
                      <td>{p.priceCents === null ? '—' : money(p.priceCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="admin-panel-heading">
              <div>
                <h2>Projeção mensal</h2>
              </div>
            </div>
            <div className="form-grid">
              <Field label="Preço praticado (R$)">
                {(id) => (
                  <input
                    id={id}
                    inputMode="decimal"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                  />
                )}
              </Field>
              <Field label="Vendas por mês">
                {(id) => (
                  <input
                    id={id}
                    inputMode="numeric"
                    value={units}
                    onChange={(e) => setUnits(e.target.value)}
                  />
                )}
              </Field>
            </div>
            {projection ? (
              <dl className="calc-parts">
                <div>
                  <dt>Lucro por venda</dt>
                  <dd>{money(projection.unitProfitCents)}</dd>
                </div>
                <div>
                  <dt>Margem real</dt>
                  <dd>{String(projection.marginPct).replace('.', ',')}%</dd>
                </div>
                <div>
                  <dt>Faturamento</dt>
                  <dd data-testid="revenue">{money(projection.revenueCents)}</dd>
                </div>
                <div>
                  <dt>Lucro mensal</dt>
                  <dd data-testid="monthly-profit">{money(projection.monthlyProfitCents)}</dd>
                </div>
                <div>
                  <dt>Ponto de equilíbrio</dt>
                  <dd data-testid="break-even">
                    {projection.breakEvenUnits === null
                      ? 'Sem lucro por venda'
                      : `${projection.breakEvenUnits} vendas`}
                  </dd>
                </div>
              </dl>
            ) : (
              <p className="calc-hint">Informe o preço praticado para ver a projeção.</p>
            )}
            {onApply && (
              <div className="editor-footer">
                <Button type="button" onClick={() => onApply(result)}>
                  Usar este custo
                </Button>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}

export function AdminCostCalculator() {
  const { workspace } = useAdminData(),
    session = useSession();
  const [tab, setTab] = useState<'calc' | 'config'>('calc');
  const settings = workspace.costCalculator ?? defaultCalculatorSettings;
  return (
    <>
      <AdminHeading
        title="Calculadora de custos"
        description="Calcule o custo de impressão, o preço de venda e o lucro de cada peça."
      />
      <div className="admin-editor-tabs" aria-label="Áreas da calculadora">
        {(
          [
            ['calc', 'Calcular'],
            ['config', 'Configuração'],
          ] as const
        ).map(([key, label]) => (
          <button key={key} type="button" aria-pressed={tab === key} onClick={() => setTab(key)}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'calc' ? (
        <PrintCostForm settings={settings} />
      ) : (
        <CalculatorSettingsEditor value={settings} readOnly={session.data?.owner !== true} />
      )}
    </>
  );
}

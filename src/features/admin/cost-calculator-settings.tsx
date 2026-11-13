'use client';
import { useState, type ReactNode } from 'react';
import { calculatorSettingsSchema, type CalculatorSettings } from '@maos-em-oracao/contracts';
import { useAdminData } from './admin-frame';
import { useAdminAction } from './shared';
import { Button } from '@/components/ui/button';
import { useNotify } from '@/components/ui/feedback';
import { centsFromInput, parsePercent } from '@/lib/domain/format';

type Technology = 'fdm' | 'resin';
type Kit = CalculatorSettings['packagingKits'][number];

const toCents = (v: string) => {
  const n = centsFromInput(v);
  return Number.isFinite(n) ? n : 0;
};
const moneyText = (cents: number) => (cents / 100).toFixed(2).replace('.', ',');
const numText = (n: number) => String(n).replace('.', ',');

// Inputs are uncontrolled (defaultValue) so partial typing like "0," is never rewritten;
// rows are keyed by id, so they only remount when an entry is added or removed.
function MoneyField({
  label,
  cents,
  onChange,
}: {
  label: string;
  cents: number;
  onChange: (cents: number) => void;
}) {
  return (
    <label>
      {label}
      <input
        inputMode="decimal"
        defaultValue={moneyText(cents)}
        onChange={(e) => onChange(toCents(e.target.value))}
      />
    </label>
  );
}
function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label>
      {label}
      <input
        inputMode="decimal"
        defaultValue={numText(value)}
        onChange={(e) => onChange(parsePercent(e.target.value))}
      />
    </label>
  );
}
function TextField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label>
      {label}
      <input defaultValue={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}
function TechnologyField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: Technology;
  onChange: (value: Technology) => void;
}) {
  return (
    <label>
      {label}
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value as Technology)}
      >
        <option value="fdm">FDM (filamento)</option>
        <option value="resin">Resina</option>
      </select>
    </label>
  );
}
function Section({
  title,
  addLabel,
  onAdd,
  children,
}: {
  title: string;
  addLabel: string;
  onAdd: () => void;
  children: ReactNode;
}) {
  return (
    <section className="stack">
      <div className="row between">
        <h3>{title}</h3>
        <Button type="button" variant="secondary" onClick={onAdd}>
          {addLabel}
        </Button>
      </div>
      {children}
    </section>
  );
}

export function CalculatorSettingsEditor({
  value,
  onSaved,
}: {
  value: CalculatorSettings;
  onSaved?: () => void;
}) {
  const { workspace } = useAdminData(),
    action = useAdminAction(),
    notify = useNotify(),
    [s, setS] = useState<CalculatorSettings>(value),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const patch = (next: Partial<CalculatorSettings>) => setS((cur) => ({ ...cur, ...next }));
  const updateMaterial = (i: number, change: Partial<CalculatorSettings['materials'][number]>) =>
    setS((cur) => ({
      ...cur,
      materials: cur.materials.map((x, k) => (k === i ? { ...x, ...change } : x)),
    }));
  const updatePrinter = (i: number, change: Partial<CalculatorSettings['printers'][number]>) =>
    setS((cur) => ({
      ...cur,
      printers: cur.printers.map((x, k) => (k === i ? { ...x, ...change } : x)),
    }));
  const updatePackagingItem = (
    i: number,
    change: Partial<CalculatorSettings['packagingItems'][number]>,
  ) =>
    setS((cur) => ({
      ...cur,
      packagingItems: cur.packagingItems.map((x, k) => (k === i ? { ...x, ...change } : x)),
    }));
  const updateKit = (i: number, change: Partial<Kit>) =>
    setS((cur) => ({
      ...cur,
      packagingKits: cur.packagingKits.map((x, k) => (k === i ? { ...x, ...change } : x)),
    }));
  const updateKitItem = (ki: number, ii: number, change: Partial<Kit['items'][number]>) =>
    setS((cur) => ({
      ...cur,
      packagingKits: cur.packagingKits.map((kit, k) =>
        k === ki
          ? { ...kit, items: kit.items.map((x, n) => (n === ii ? { ...x, ...change } : x)) }
          : kit,
      ),
    }));
  const removePackagingItem = (index: number) =>
    setS((cur) => {
      const gone = cur.packagingItems[index].id;
      return {
        ...cur,
        packagingItems: cur.packagingItems.filter((_, i) => i !== index),
        packagingKits: cur.packagingKits.map((kit) => ({
          ...kit,
          items: kit.items.filter((item) => item.itemId !== gone),
        })),
      };
    });
  const save = async () => {
    const parsed = calculatorSettingsSchema.safeParse(s);
    if (!parsed.success) {
      setError(
        'Revise a configuração: preencha todos os nomes, use valores positivos e mantenha as porcentagens entre 0 e 100 (taxa de falha até 90).',
      );
      return;
    }
    setError('');
    setBusy(true);
    try {
      await action.run({
        type: 'workspace.save',
        settings: { ...workspace, costCalculator: parsed.data },
      });
      notify('Configuração da calculadora salva.');
      onSaved?.();
    } finally {
      setBusy(false);
    }
  };
  const itemOptions = s.packagingItems.map((item) => (
    <option key={item.id} value={item.id}>
      {item.name || 'Item sem nome'}
    </option>
  ));
  return (
    <form
      className="stack"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <Section
        title="Materiais"
        addLabel="Adicionar material"
        onAdd={() =>
          patch({
            materials: [
              ...s.materials,
              { id: crypto.randomUUID(), name: '', technology: 'fdm', priceCents: 0 },
            ],
          })
        }
      >
        {s.materials.map((m, i) => (
          <div className="form-grid" key={m.id}>
            <TextField
              label="Nome do material"
              value={m.name}
              onChange={(name) => updateMaterial(i, { name })}
            />
            <TechnologyField
              label="Tecnologia do material"
              value={m.technology}
              onChange={(technology) => updateMaterial(i, { technology })}
            />
            <MoneyField
              label={m.technology === 'resin' ? 'Preço por litro' : 'Preço por kg'}
              cents={m.priceCents}
              onChange={(priceCents) => updateMaterial(i, { priceCents })}
            />
            <Button
              type="button"
              variant="text"
              onClick={() =>
                setS((cur) => ({ ...cur, materials: cur.materials.filter((_, k) => k !== i) }))
              }
            >
              Remover material
            </Button>
          </div>
        ))}
      </Section>
      <Section
        title="Impressoras"
        addLabel="Adicionar impressora"
        onAdd={() =>
          patch({
            printers: [
              ...s.printers,
              {
                id: crypto.randomUUID(),
                name: '',
                technology: 'fdm',
                powerWatts: 0,
                purchaseCents: 0,
                lifetimeHours: 1000,
                maintenancePerHourCents: 0,
              },
            ],
          })
        }
      >
        {s.printers.map((p, i) => (
          <div className="form-grid" key={p.id}>
            <TextField
              label="Nome da impressora"
              value={p.name}
              onChange={(name) => updatePrinter(i, { name })}
            />
            <TechnologyField
              label="Tecnologia da impressora"
              value={p.technology}
              onChange={(technology) => updatePrinter(i, { technology })}
            />
            <NumberField
              label="Potência (W)"
              value={p.powerWatts}
              onChange={(powerWatts) => updatePrinter(i, { powerWatts })}
            />
            <MoneyField
              label="Valor de compra (R$)"
              cents={p.purchaseCents}
              onChange={(purchaseCents) => updatePrinter(i, { purchaseCents })}
            />
            <NumberField
              label="Vida útil (horas)"
              value={p.lifetimeHours}
              onChange={(lifetimeHours) => updatePrinter(i, { lifetimeHours })}
            />
            <MoneyField
              label="Manutenção por hora (R$)"
              cents={p.maintenancePerHourCents}
              onChange={(maintenancePerHourCents) => updatePrinter(i, { maintenancePerHourCents })}
            />
            <Button
              type="button"
              variant="text"
              onClick={() =>
                setS((cur) => ({ ...cur, printers: cur.printers.filter((_, k) => k !== i) }))
              }
            >
              Remover impressora
            </Button>
          </div>
        ))}
      </Section>
      <Section
        title="Itens de embalagem"
        addLabel="Adicionar item de embalagem"
        onAdd={() =>
          patch({
            packagingItems: [
              ...s.packagingItems,
              { id: crypto.randomUUID(), name: '', unitCents: 0 },
            ],
          })
        }
      >
        {s.packagingItems.map((item, i) => (
          <div className="form-grid" key={item.id}>
            <TextField
              label="Nome do item de embalagem"
              value={item.name}
              onChange={(name) => updatePackagingItem(i, { name })}
            />
            <MoneyField
              label="Custo por unidade (R$)"
              cents={item.unitCents}
              onChange={(unitCents) => updatePackagingItem(i, { unitCents })}
            />
            <Button type="button" variant="text" onClick={() => removePackagingItem(i)}>
              Remover item de embalagem
            </Button>
          </div>
        ))}
      </Section>
      <Section
        title="Kits de embalagem"
        addLabel="Adicionar kit de embalagem"
        onAdd={() =>
          patch({
            packagingKits: [...s.packagingKits, { id: crypto.randomUUID(), name: '', items: [] }],
          })
        }
      >
        {s.packagingKits.map((kit, ki) => (
          <div className="stack" key={kit.id}>
            <div className="form-grid">
              <TextField
                label="Nome do kit"
                value={kit.name}
                onChange={(name) => updateKit(ki, { name })}
              />
              <Button
                type="button"
                variant="text"
                onClick={() =>
                  setS((cur) => ({
                    ...cur,
                    packagingKits: cur.packagingKits.filter((_, k) => k !== ki),
                  }))
                }
              >
                Remover kit de embalagem
              </Button>
            </div>
            {kit.items.map((item, ii) => (
              <div className="form-grid" key={`${kit.id}-${ii}`}>
                <label>
                  Item do kit
                  <select
                    aria-label={`Item ${ii + 1} do kit ${kit.name || 'sem nome'}`}
                    value={item.itemId}
                    onChange={(e) => updateKitItem(ki, ii, { itemId: e.target.value })}
                  >
                    {itemOptions}
                  </select>
                </label>
                <NumberField
                  label="Quantidade"
                  value={item.quantity}
                  onChange={(quantity) => updateKitItem(ki, ii, { quantity })}
                />
                <Button
                  type="button"
                  variant="text"
                  onClick={() => updateKit(ki, { items: kit.items.filter((_, n) => n !== ii) })}
                >
                  Remover item do kit
                </Button>
              </div>
            ))}
            <div>
              <Button
                type="button"
                variant="secondary"
                disabled={!s.packagingItems.length}
                onClick={() =>
                  updateKit(ki, {
                    items: [...kit.items, { itemId: s.packagingItems[0].id, quantity: 1 }],
                  })
                }
              >
                Adicionar item ao kit
              </Button>
            </div>
          </div>
        ))}
      </Section>
      <section className="stack">
        <h3>Custos gerais</h3>
        <div className="form-grid">
          <MoneyField
            label="Energia por kWh (R$)"
            cents={s.energyKwhCents}
            onChange={(energyKwhCents) => patch({ energyKwhCents })}
          />
          <MoneyField
            label="Mão de obra por hora (R$)"
            cents={s.laborHourCents}
            onChange={(laborHourCents) => patch({ laborHourCents })}
          />
          <NumberField
            label="Taxa de falha (%, até 90)"
            value={s.failureRatePct}
            onChange={(failureRatePct) => patch({ failureRatePct })}
          />
          <MoneyField
            label="Insumos de resina por impressão (R$)"
            cents={s.resinConsumablesPerPrintCents}
            onChange={(resinConsumablesPerPrintCents) => patch({ resinConsumablesPerPrintCents })}
          />
          <MoneyField
            label="Custo fixo por pedido (R$)"
            cents={s.fixedPerOrderCents}
            onChange={(fixedPerOrderCents) => patch({ fixedPerOrderCents })}
          />
          <MoneyField
            label="Custo fixo mensal (R$)"
            cents={s.fixedMonthlyCents}
            onChange={(fixedMonthlyCents) => patch({ fixedMonthlyCents })}
          />
        </div>
      </section>
      <section className="stack">
        <h3>Taxas e margem</h3>
        <div className="form-grid">
          <NumberField
            label="Taxa Pix (%)"
            value={s.pixFeePct}
            onChange={(pixFeePct) => patch({ pixFeePct })}
          />
          <NumberField
            label="Taxa do cartão (%)"
            value={s.cardFeePct}
            onChange={(cardFeePct) => patch({ cardFeePct })}
          />
          <NumberField
            label="Vendas no cartão (%)"
            value={s.cardSharePct}
            onChange={(cardSharePct) => patch({ cardSharePct })}
          />
          <NumberField
            label="Imposto (%)"
            value={s.taxPct}
            onChange={(taxPct) => patch({ taxPct })}
          />
          <NumberField
            label="Margem-alvo (%)"
            value={s.targetMarginPct}
            onChange={(targetMarginPct) => patch({ targetMarginPct })}
          />
        </div>
      </section>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="editor-footer">
        <Button type="submit" loading={busy}>
          Salvar configuração
        </Button>
      </div>
    </form>
  );
}

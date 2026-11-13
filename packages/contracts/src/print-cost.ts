import { z } from 'zod';
import { costBreakdownSchema } from './schemas';

type CostBreakdown = z.infer<typeof costBreakdownSchema>;

const id = z.string().min(1);
const name = z.string().min(1);
const cents = z.number().int().nonnegative();
const pct = z.number().min(0).max(100);
const technology = z.enum(['fdm', 'resin']);

export const calculatorSettingsSchema = z.object({
  materials: z.array(z.object({ id, name, technology, priceCents: cents })),
  printers: z.array(
    z.object({
      id,
      name,
      technology,
      powerWatts: z.number().nonnegative(),
      purchaseCents: cents,
      lifetimeHours: z.number().min(1),
      maintenancePerHourCents: cents,
    }),
  ),
  packagingItems: z.array(z.object({ id, name, unitCents: cents })),
  packagingKits: z.array(
    z.object({
      id,
      name,
      items: z.array(z.object({ itemId: id, quantity: z.number().nonnegative() })),
    }),
  ),
  energyKwhCents: cents,
  laborHourCents: cents,
  failureRatePct: pct,
  resinConsumablesPerPrintCents: cents,
  pixFeePct: pct,
  cardFeePct: pct,
  cardSharePct: pct,
  taxPct: pct,
  fixedPerOrderCents: cents,
  fixedMonthlyCents: cents,
  targetMarginPct: pct,
});
export type CalculatorSettings = z.infer<typeof calculatorSettingsSchema>;

export const printJobSchema = z.object({
  technology,
  materialId: id,
  amount: z.number().nonnegative(),
  printHours: z.number().nonnegative(),
  printerId: id,
  piecesPerPlate: z.number().int().min(1),
  laborMinutes: z.number().nonnegative(),
  packagingKitId: z.string().optional(),
  extraCents: cents,
});
export type PrintJob = z.infer<typeof printJobSchema>;

export const defaultCalculatorSettings: CalculatorSettings = {
  materials: [
    { id: 'mat-pla', name: 'PLA', technology: 'fdm', priceCents: 12000 },
    { id: 'mat-resina', name: 'Resina padrão', technology: 'resin', priceCents: 18000 },
  ],
  printers: [
    {
      id: 'printer-fdm',
      name: 'Impressora FDM',
      technology: 'fdm',
      powerWatts: 150,
      purchaseCents: 600000,
      lifetimeHours: 5000,
      maintenancePerHourCents: 50,
    },
    {
      id: 'printer-resina',
      name: 'Impressora de resina',
      technology: 'resin',
      powerWatts: 60,
      purchaseCents: 250000,
      lifetimeHours: 3000,
      maintenancePerHourCents: 30,
    },
  ],
  packagingItems: [
    { id: 'item-caixa', name: 'Caixa', unitCents: 250 },
    { id: 'item-bolha', name: 'Plástico bolha', unitCents: 50 },
    { id: 'item-cartao', name: 'Cartão', unitCents: 100 },
  ],
  packagingKits: [
    {
      id: 'kit-padrao',
      name: 'Padrão',
      items: [
        { itemId: 'item-caixa', quantity: 1 },
        { itemId: 'item-bolha', quantity: 1 },
        { itemId: 'item-cartao', quantity: 1 },
      ],
    },
  ],
  energyKwhCents: 95,
  laborHourCents: 3000,
  failureRatePct: 10,
  resinConsumablesPerPrintCents: 150,
  pixFeePct: 0.99,
  cardFeePct: 4.98,
  cardSharePct: 40,
  taxPct: 6,
  fixedPerOrderCents: 0,
  fixedMonthlyCents: 50000,
  targetMarginPct: 30,
};

export const MARGIN_STEPS = [20, 30, 40, 50] as const;

export type PrintCostResult = {
  breakdown: CostBreakdown;
  totalCents: number;
  feeRatePct: number;
  suggestedPriceCents: number | null;
  prices: { marginPct: 20 | 30 | 40 | 50; priceCents: number | null }[];
  error?: 'MARGIN_TOO_HIGH';
};

/** Fee rate as a percentage (4.98 = 4.98 %). */
export function feeRatePct(s: CalculatorSettings): number {
  const card = s.cardSharePct / 100;
  return s.pixFeePct * (1 - card) + s.cardFeePct * card + s.taxPct;
}

export function calculatePrintCost(s: CalculatorSettings, job: PrintJob): PrintCostResult {
  const material = s.materials.find((m) => m.id === job.materialId);
  if (!material) throw new Error('UNKNOWN_MATERIAL');
  const printer = s.printers.find((p) => p.id === job.printerId);
  if (!printer) throw new Error('UNKNOWN_PRINTER');
  const kit = job.packagingKitId ? s.packagingKits.find((k) => k.id === job.packagingKitId) : undefined;

  const pieces = job.piecesPerPlate;
  const materialRaw = ((job.amount / 1000) * material.priceCents) / pieces;
  const energyRaw =
    ((printer.powerWatts / 1000) * job.printHours * s.energyKwhCents +
      (printer.purchaseCents / printer.lifetimeHours + printer.maintenancePerHourCents) * job.printHours) /
    pieces;
  const laborRaw = (job.laborMinutes / 60) * s.laborHourCents;
  const packagingRaw = kit
    ? kit.items.reduce((sum, it) => {
        const item = s.packagingItems.find((p) => p.id === it.itemId);
        return sum + (item ? item.unitCents * it.quantity : 0);
      }, 0)
    : 0;
  const failure = s.failureRatePct / 100;
  const otherRaw =
    (materialRaw + energyRaw) * (failure / (1 - failure)) +
    (job.technology === 'resin' ? s.resinConsumablesPerPrintCents / pieces : 0) +
    job.extraCents;

  const breakdown: CostBreakdown = {
    materialCents: Math.round(materialRaw),
    packagingCents: Math.round(packagingRaw),
    energyCents: Math.round(energyRaw),
    laborCents: Math.round(laborRaw),
    otherCents: Math.round(otherRaw),
  };
  const totalCents =
    breakdown.materialCents + breakdown.packagingCents + breakdown.energyCents + breakdown.laborCents + breakdown.otherCents;

  const fee = feeRatePct(s);
  const priceFor = (marginPct: number): number | null => {
    const denominator = 1 - fee / 100 - marginPct / 100;
    return denominator <= 0 ? null : Math.ceil((totalCents + s.fixedPerOrderCents) / denominator);
  };
  const suggestedPriceCents = priceFor(s.targetMarginPct);
  const result: PrintCostResult = {
    breakdown,
    totalCents,
    feeRatePct: fee,
    suggestedPriceCents,
    prices: MARGIN_STEPS.map((marginPct) => ({ marginPct, priceCents: priceFor(marginPct) })),
  };
  if (suggestedPriceCents === null) result.error = 'MARGIN_TOO_HIGH';
  return result;
}

export function projectProfit(r: PrintCostResult, s: CalculatorSettings, priceCents: number, unitsPerMonth: number) {
  const unitFeesCents = Math.round((priceCents * r.feeRatePct) / 100);
  const unitProfitCents = priceCents - r.totalCents - s.fixedPerOrderCents - unitFeesCents;
  return {
    unitFeesCents,
    unitProfitCents,
    marginPct: priceCents > 0 ? Math.round((unitProfitCents / priceCents) * 1000) / 10 : 0,
    revenueCents: priceCents * unitsPerMonth,
    monthlyProfitCents: unitProfitCents * unitsPerMonth - s.fixedMonthlyCents,
    breakEvenUnits: unitProfitCents > 0 ? Math.ceil(s.fixedMonthlyCents / unitProfitCents) : null,
  };
}

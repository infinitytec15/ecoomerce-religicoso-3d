import { describe, expect, it } from 'vitest';
import {
  calculatePrintCost,
  calculatorSettingsSchema,
  defaultCalculatorSettings,
  projectProfit,
  type PrintJob,
} from './print-cost';

const settings = defaultCalculatorSettings;
const resinSettings = { ...defaultCalculatorSettings, failureRatePct: 15 };
const fdmJob: PrintJob = {
  technology: 'fdm',
  materialId: 'mat-pla',
  amount: 120,
  printHours: 6,
  printerId: 'printer-fdm',
  piecesPerPlate: 1,
  laborMinutes: 20,
  packagingKitId: 'kit-padrao',
  extraCents: 0,
};
const resinJob: PrintJob = {
  technology: 'resin',
  materialId: 'mat-resina',
  amount: 50,
  printHours: 3,
  printerId: 'printer-resina',
  piecesPerPlate: 1,
  laborMinutes: 30,
  packagingKitId: 'kit-padrao',
  extraCents: 0,
};

describe('print cost engine', () => {
  it('defaults parse with the schema', () => {
    expect(calculatorSettingsSchema.safeParse(defaultCalculatorSettings).success).toBe(true);
  });

  it('FDM: 120 g, 6 h, 1 peça, 20 min, kit Padrão', () => {
    const r = calculatePrintCost(settings, fdmJob);
    expect(r.breakdown).toEqual({
      materialCents: 1440,
      energyCents: 1106,
      laborCents: 1000,
      packagingCents: 400,
      otherCents: 283,
    });
    expect(r.totalCents).toBe(4229);
    expect(r.feeRatePct).toBeCloseTo(8.586, 3);
    expect(r.suggestedPriceCents).toBe(6887);
    expect(r.prices.map((p) => p.priceCents)).toEqual([5922, 6887, 8226, 10212]);
  });

  it('resina: 50 ml a R$ 180/l, 3 h, falha 15 %, insumos 150, 30 min', () => {
    expect(calculatePrintCost(resinSettings, resinJob).breakdown).toEqual({
      materialCents: 900,
      energyCents: 357,
      laborCents: 1500,
      packagingCents: 400,
      otherCents: 372,
    });
  });

  it('refuses margin + fees ≥ 100%', () => {
    const r = calculatePrintCost({ ...settings, targetMarginPct: 95 }, fdmJob);
    expect(r.suggestedPriceCents).toBeNull();
    expect(r.error).toBe('MARGIN_TOO_HIGH');
  });

  it('nulls only the margins that are impossible', () => {
    const r = calculatePrintCost({ ...settings, taxPct: 65 }, fdmJob);
    expect(r.prices.map((p) => p.priceCents === null)).toEqual([false, false, true, true]);
    expect(r.error).toBeUndefined();
  });

  it('projects 50 sales a month at R$ 69,90', () => {
    expect(projectProfit(calculatePrintCost(settings, fdmJob), settings, 6990, 50)).toMatchObject({
      unitFeesCents: 600,
      unitProfitCents: 2161,
      revenueCents: 349500,
      monthlyProfitCents: 58050,
      breakEvenUnits: 24,
    });
  });

  it('throws on unknown material/printer, zero packaging on unknown kit', () => {
    expect(() => calculatePrintCost(settings, { ...fdmJob, materialId: 'x' })).toThrow(
      'UNKNOWN_MATERIAL',
    );
    expect(() => calculatePrintCost(settings, { ...fdmJob, printerId: 'x' })).toThrow(
      'UNKNOWN_PRINTER',
    );
    expect(
      calculatePrintCost(settings, { ...fdmJob, packagingKitId: 'x' }).breakdown.packagingCents,
    ).toBe(0);
  });

  it('rejects a failure rate above 90 % (would divide by zero)', () => {
    expect(calculatorSettingsSchema.safeParse({ ...settings, failureRatePct: 95 }).success).toBe(
      false,
    );
    expect(calculatorSettingsSchema.safeParse({ ...settings, failureRatePct: 90 }).success).toBe(
      true,
    );
  });
});

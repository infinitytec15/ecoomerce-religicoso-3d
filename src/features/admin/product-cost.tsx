import type { CostBreakdown } from '@/lib/domain/types';

export const costFields: [keyof CostBreakdown, string, string][] = [
  ['materialCents', 'Matéria-prima', 'Filamento ou resina usados na peça'],
  ['packagingCents', 'Embalagem', 'Caixa, proteção, etiqueta e cartão'],
  ['energyCents', 'Energia e máquina', 'Energia e desgaste da impressora'],
  ['laborCents', 'Mão de obra e acabamento', 'Pintura, lixa, montagem'],
  ['otherCents', 'Outros custos', 'Taxas, brindes ou insumos extras'],
];

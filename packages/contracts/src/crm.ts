import { z } from 'zod';
import { collectionSchema } from './schemas';

/** CRM de e-mail: consentimento, segmentos, campanhas e importação de contatos. */
export const MARKETING_CONSENT_VERSION = '2026-11-14';
export const MARKETING_CONSENT_TEXT =
  'Quero receber novidades, lançamentos e ofertas da Mãos em Oração por e-mail. Posso sair quando quiser.';

export const LEGAL_BASES = ['consent', 'imported-consent', 'legitimate-interest'] as const;
export type LegalBasis = (typeof LEGAL_BASES)[number];
export const legalBasisLabels: Record<LegalBasis, string> = {
  consent: 'Consentimento',
  'imported-consent': 'Consentimento declarado na importação',
  'legitimate-interest': 'Legítimo interesse (comprou na loja)',
};

export const CONSENT_SOURCES = ['register', 'checkout', 'account', 'import'] as const;
export type ConsentSource = (typeof CONSENT_SOURCES)[number];
export const consentSourceLabels: Record<ConsentSource, string> = {
  register: 'Cadastro',
  checkout: 'Checkout',
  account: 'Minha conta',
  import: 'Importação',
};

export const CRM_LIMITS = {
  blocks: 20,
  productsPerBlock: 6,
  rules: 10,
  name: 80,
  subject: 120,
  previewText: 140,
  text: 5000,
  tags: 20,
  tag: 40,
  importRows: 5000,
  testRecipients: 3,
} as const;

export const CAMPAIGN_STATES = [
  'Rascunho',
  'Agendada',
  'Enviando',
  'Enviada',
  'Parcial',
  'Cancelada',
] as const;
export type CampaignState = (typeof CAMPAIGN_STATES)[number];

const crmId = z.string().min(1).max(64);
const unique = (values: string[]) => new Set(values).size === values.length;

/** Mesma regra do renderer de e-mails: https sem credenciais, ou http só em localhost. */
const safeUrl = z
  .string()
  .max(2048)
  .refine((value) => {
    try {
      const url = new URL(value);
      return (
        (url.protocol === 'https:' ||
          (url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname))) &&
        !url.username &&
        !url.password &&
        !/[\r\n]/.test(value)
      );
    } catch {
      return false;
    }
  }, 'Use uma URL HTTPS sem credenciais.');

// ---------------------------------------------------------------- configuração

export const crmSettingsSchema = z.object({
  senderName: z.string().trim().min(1).max(80),
  replyTo: z.union([z.literal(''), z.email().max(254)]),
  footerText: z.string().trim().min(1).max(300),
  hourlyLimit: z.number().int().min(10).max(1800),
  legitimateInterest: z.boolean(),
});
export type CrmSettings = z.infer<typeof crmSettingsSchema>;
export const defaultCrmSettings: CrmSettings = {
  senderName: 'Mãos em Oração',
  replyTo: '',
  footerText: 'Você recebe este e-mail porque autorizou novidades da Mãos em Oração.',
  hourlyLimit: 100,
  legitimateInterest: false,
};

// ------------------------------------------------------------------- etiquetas

export const normalizeTag = (value: string): string => value.trim().replace(/\s+/g, ' ');
export const tagSchema = z
  .string()
  .transform(normalizeTag)
  .pipe(z.string().min(1).max(CRM_LIMITS.tag));

// -------------------------------------------------------------------- segmento

export const segmentRuleSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('product'), productId: z.string().uuid() }),
  z.object({ type: z.literal('category'), category: collectionSchema }),
  z.object({ type: z.literal('spentAbove'), cents: z.number().int().positive() }),
  z.object({
    type: z.literal('lastPurchase'),
    op: z.enum(['moreThan', 'lessThan']),
    days: z.number().int().min(1).max(3650),
  }),
  z.object({ type: z.literal('club') }),
  z.object({ type: z.literal('prayer') }),
  z.object({ type: z.literal('groupBuy') }),
  z.object({ type: z.literal('tag'), tag: tagSchema }),
]);
export type SegmentRule = z.infer<typeof segmentRuleSchema>;

export const segmentSchema = z.object({
  rules: z.array(segmentRuleSchema).max(CRM_LIMITS.rules).default([]),
});
export type Segment = z.infer<typeof segmentSchema>;

const rulesMoney = (cents: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
    .format(cents / 100)
    .replace(/ /g, ' ');

export function describeRule(
  rule: SegmentRule,
  names: { products: Record<string, string> },
): string {
  switch (rule.type) {
    case 'product': {
      const name = names.products[rule.productId];
      return name ? `Comprou ${name}` : 'Comprou uma peça removida';
    }
    case 'category':
      return `Comprou na categoria ${rule.category}`;
    case 'spentAbove':
      return `Gastou acima de ${rulesMoney(rule.cents)}`;
    case 'lastPurchase':
      return `Última compra há ${rule.op === 'moreThan' ? 'mais' : 'menos'} de ${rule.days} dias`;
    case 'club':
      return 'Assinantes do clube';
    case 'prayer':
      return 'Inscritos na oração';
    case 'groupBuy':
      return 'Participou de compra coletiva';
    case 'tag':
      return `Etiqueta: ${rule.tag}`;
  }
}

// ---------------------------------------------------------------------- blocos

export const marketingBlockInputSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('text'),
    style: z.enum(['heading', 'paragraph']),
    text: z.string().trim().min(1).max(CRM_LIMITS.text),
  }),
  z.object({
    type: z.literal('image'),
    assetId: z.string().uuid(),
    alt: z.string().max(120).default(''),
    href: safeUrl.optional(),
  }),
  z.object({
    type: z.literal('products'),
    productIds: z
      .array(z.string().uuid())
      .min(1)
      .max(CRM_LIMITS.productsPerBlock)
      .refine(unique, 'Produtos repetidos'),
  }),
  z.object({
    type: z.literal('button'),
    label: z.string().trim().min(1).max(60),
    href: safeUrl,
  }),
  z.object({
    type: z.literal('coupon'),
    code: z.string().trim().toUpperCase().min(1).max(40),
    text: z.string().max(240).default('Use o cupom na finalização da compra.'),
  }),
]);
export type MarketingBlockInput = z.infer<typeof marketingBlockInputSchema>;

// -------------------------------------------------------------------- campanha

const campaignFields = {
  name: z.string().trim().min(3).max(CRM_LIMITS.name),
  subject: z
    .string()
    .trim()
    .min(3)
    .max(CRM_LIMITS.subject)
    .refine((value) => !/[\r\n]/.test(value), 'O assunto não pode ter quebra de linha.'),
  previewText: z.string().trim().max(CRM_LIMITS.previewText).default(''),
  segment: segmentSchema,
};

export const marketingCampaignInputSchema = z.object({
  id: z.string().uuid().optional(),
  ...campaignFields,
  blocks: z.array(marketingBlockInputSchema).min(1).max(CRM_LIMITS.blocks),
});
export type MarketingCampaignInput = z.infer<typeof marketingCampaignInputSchema>;

export interface ContactEligibility {
  legalBasis: string | null;
  consentAt: Date | string | null;
  unsubscribedAt: Date | string | null;
}

/** Regra única de elegibilidade; o e-mail suprimido (EmailSuppression) é checado pelo worker. */
export function canReceiveMarketing(
  contact: ContactEligibility,
  settings: Pick<CrmSettings, 'legitimateInterest'>,
): boolean {
  if (contact.unsubscribedAt) return false;
  if (contact.legalBasis === 'consent' || contact.legalBasis === 'imported-consent')
    return Boolean(contact.consentAt);
  if (contact.legalBasis === 'legitimate-interest') return settings.legitimateInterest;
  return false;
}

// -------------------------------------------------------------------- métricas

export const campaignMetricsSchema = z.object({
  audience: z.number().int().min(0),
  sent: z.number().int().min(0),
  delivered: z.number().int().min(0),
  opened: z.number().int().min(0),
  clicked: z.number().int().min(0),
  bounced: z.number().int().min(0),
  unsubscribed: z.number().int().min(0),
  cancelled: z.number().int().min(0),
});
export type CampaignMetrics = z.infer<typeof campaignMetricsSchema>;

/** Percentual pt-BR com uma casa; '—' quando não há base. */
export function percent(part: number, whole: number): string {
  if (whole <= 0) return '—';
  const pct = ((part / whole) * 100).toLocaleString('pt-BR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  return `${pct}%`;
}

export function estimateDuration(count: number, hourlyLimit: number): string {
  if (count <= hourlyLimit) return 'menos de 1 hora';
  return `cerca de ${Math.ceil(count / hourlyLimit)} horas`;
}

// ------------------------------------------------------------- tipos do admin
// Ids de leitura soltos (string 1..64), como nos stories, para o snapshot de demonstração.

const adminBlockSchema = z.discriminatedUnion('type', [
  marketingBlockInputSchema.options[0],
  z.object({
    type: z.literal('image'),
    assetId: crmId,
    alt: z.string(),
    href: z.string().optional(),
  }),
  z.object({ type: z.literal('products'), productIds: z.array(crmId) }),
  marketingBlockInputSchema.options[3],
  marketingBlockInputSchema.options[4],
]);

export const adminMarketingCampaignSchema = z.object({
  id: crmId,
  ...campaignFields,
  segment: z.object({ rules: z.array(segmentRuleSchema) }),
  blocks: z.array(adminBlockSchema),
  state: z.enum(CAMPAIGN_STATES),
  scheduledAt: z.string().optional(),
  startedAt: z.string().optional(),
  finishedAt: z.string().optional(),
  createdAt: z.string(),
  metrics: campaignMetricsSchema,
});
export type AdminMarketingCampaign = z.infer<typeof adminMarketingCampaignSchema>;

export const adminCrmSchema = z.object({
  settings: crmSettingsSchema,
  campaigns: z.array(adminMarketingCampaignSchema),
  tags: z.array(z.object({ tag: z.string(), count: z.number().int().min(0) })),
  totals: z.object({
    contacts: z.number().int().min(0),
    eligible: z.number().int().min(0),
    unsubscribed: z.number().int().min(0),
  }),
});
export type AdminCrm = z.infer<typeof adminCrmSchema>;

export const marketingContactRowSchema = z.object({
  id: crmId,
  email: z.string(),
  name: z.string(),
  legalBasis: z.enum(LEGAL_BASES).nullable(),
  consentAt: z.string().nullable(),
  consentSource: z.enum(CONSENT_SOURCES).nullable(),
  unsubscribedAt: z.string().nullable(),
  tags: z.array(z.string()),
  eligible: z.boolean(),
  isCustomer: z.boolean(),
});
export type MarketingContactRow = z.infer<typeof marketingContactRowSchema>;

// ------------------------------------------------------------------ importação

export const contactImportSchema = z.object({
  tag: tagSchema,
  consent: z.literal(true, 'Confirme que você tem o consentimento dessas pessoas.'),
  rows: z
    .array(z.object({ email: z.email(), name: z.string().max(100).default('') }))
    .min(1)
    .max(CRM_LIMITS.importRows),
});
export type ContactImportInput = z.infer<typeof contactImportSchema>;

/** Divide o texto em linhas de células, respeitando aspas (com "" escapado) e quebras dentro delas. */
function splitCsv(text: string, separator: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === separator) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      cell = '';
      rows.push(row);
      row = [];
    } else cell += ch;
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

const emailCheck = z.email();

export function parseContactsCsv(text: string): {
  rows: { email: string; name: string }[];
  invalid: number;
  duplicates: number;
} {
  const clean = text.replace(/^﻿/, '');
  const firstLine = clean.split(/\r\n|\n|\r/, 1)[0] ?? '';
  const semicolons = firstLine.split(';').length - 1;
  const commas = firstLine.split(',').length - 1;
  const lines = splitCsv(clean, semicolons > commas ? ';' : ',');
  let emailCol = 0;
  let nameCol = 1;
  const header = lines[0]?.map((c) => c.trim().toLowerCase());
  if (header && header.some((c) => c === 'email' || c === 'e-mail')) {
    emailCol = header.findIndex((c) => c === 'email' || c === 'e-mail');
    nameCol = header.findIndex((c) => c === 'nome' || c === 'name');
    lines.shift();
  }
  const seen = new Set<string>();
  const rows: { email: string; name: string }[] = [];
  let invalid = 0;
  let duplicates = 0;
  for (const cells of lines) {
    const email = (cells[emailCol] ?? '').trim().toLowerCase();
    if (!emailCheck.safeParse(email).success) {
      invalid++;
      continue;
    }
    if (seen.has(email)) {
      duplicates++;
      continue;
    }
    seen.add(email);
    rows.push({ email, name: nameCol >= 0 ? (cells[nameCol] ?? '').trim() : '' });
  }
  return { rows, invalid, duplicates };
}

// ----------------------------------------------------------------------- conta

export const marketingStatusSchema = z.object({
  subscribed: z.boolean(),
  text: z.string(),
  version: z.string(),
});
export type MarketingStatus = z.infer<typeof marketingStatusSchema>;

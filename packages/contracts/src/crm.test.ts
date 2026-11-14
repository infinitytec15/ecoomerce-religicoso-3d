import { describe, expect, it } from 'vitest';
import {
  canReceiveMarketing,
  contactImportSchema,
  crmSettingsSchema,
  defaultCrmSettings,
  describeRule,
  estimateDuration,
  marketingBlockInputSchema,
  marketingCampaignInputSchema,
  parseContactsCsv,
  percent,
  segmentSchema,
  tagSchema,
} from './crm';

const uuid = '11111111-1111-4111-8111-111111111111';
const text = { type: 'text', style: 'paragraph', text: 'Olá' };
const campaign = {
  name: 'Novidades de novembro',
  subject: 'Chegaram as novas peças',
  blocks: [text],
  segment: {},
};

describe('schemas do CRM', () => {
  it('campanha rejeita 21 blocos, assunto com quebra de linha e 7 produtos', () => {
    expect(marketingCampaignInputSchema.safeParse(campaign).success).toBe(true);
    expect(
      marketingCampaignInputSchema.safeParse({ ...campaign, blocks: Array(21).fill(text) }).success,
    ).toBe(false);
    expect(
      marketingCampaignInputSchema.safeParse({ ...campaign, subject: 'Olá\nBcc: x' }).success,
    ).toBe(false);
    const ids = Array.from({ length: 7 }, (_, i) => `11111111-1111-4111-8111-11111111111${i}`);
    expect(
      marketingCampaignInputSchema.safeParse({
        ...campaign,
        blocks: [{ type: 'products', productIds: ids }],
      }).success,
    ).toBe(false);
  });

  it('blocos exigem https sem credenciais e normalizam o cupom', () => {
    for (const href of ['http://example.com', 'javascript:alert(1)', 'https://u:p@example.com']) {
      expect(
        marketingBlockInputSchema.safeParse({ type: 'button', label: 'Ver', href }).success,
      ).toBe(false);
      expect(
        marketingBlockInputSchema.safeParse({ type: 'image', assetId: uuid, href }).success,
      ).toBe(false);
    }
    expect(
      marketingBlockInputSchema.safeParse({
        type: 'button',
        label: 'Ver',
        href: 'http://localhost:3000/produtos',
      }).success,
    ).toBe(true);
    expect(marketingBlockInputSchema.parse({ type: 'coupon', code: ' natal10 ' })).toEqual({
      type: 'coupon',
      code: 'NATAL10',
      text: 'Use o cupom na finalização da compra.',
    });
    expect(
      marketingBlockInputSchema.safeParse({ type: 'products', productIds: [uuid, uuid] }).success,
    ).toBe(false);
  });

  it('configuração limita o envio por hora', () => {
    expect(crmSettingsSchema.safeParse(defaultCrmSettings).success).toBe(true);
    expect(crmSettingsSchema.safeParse({ ...defaultCrmSettings, hourlyLimit: 5 }).success).toBe(
      false,
    );
    expect(crmSettingsSchema.safeParse({ ...defaultCrmSettings, hourlyLimit: 1801 }).success).toBe(
      false,
    );
    expect(crmSettingsSchema.safeParse({ ...defaultCrmSettings, replyTo: 'x' }).success).toBe(
      false,
    );
  });

  it('segmento vazio por padrão e etiqueta normalizada', () => {
    expect(segmentSchema.parse({})).toEqual({ rules: [] });
    expect(tagSchema.parse('  Paróquia   São  José ')).toBe('Paróquia São José');
    expect(tagSchema.safeParse('   ').success).toBe(false);
    expect(tagSchema.safeParse('a'.repeat(41)).success).toBe(false);
  });

  it('importação exige a confirmação de consentimento', () => {
    const rows = [{ email: 'a@x.com' }];
    expect(contactImportSchema.safeParse({ tag: 'Paróquia', consent: true, rows }).success).toBe(
      true,
    );
    expect(contactImportSchema.safeParse({ tag: 'Paróquia', consent: false, rows }).success).toBe(
      false,
    );
    expect(
      contactImportSchema.safeParse({ tag: 'Paróquia', consent: true, rows: [] }).success,
    ).toBe(false);
  });
});

describe('regras de negócio do CRM', () => {
  const off = { legitimateInterest: false };
  const on = { legitimateInterest: true };
  const at = new Date('2026-11-14T10:00:00Z');

  it('canReceiveMarketing segue base legal, consentimento e descadastro', () => {
    const consent = { legalBasis: 'consent', consentAt: at, unsubscribedAt: null };
    expect(canReceiveMarketing(consent, off)).toBe(true);
    expect(canReceiveMarketing({ ...consent, legalBasis: 'imported-consent' }, off)).toBe(true);
    expect(canReceiveMarketing({ ...consent, consentAt: null }, off)).toBe(false);
    expect(canReceiveMarketing({ ...consent, unsubscribedAt: at }, off)).toBe(false);
    const legit = { legalBasis: 'legitimate-interest', consentAt: null, unsubscribedAt: null };
    expect(canReceiveMarketing(legit, off)).toBe(false);
    expect(canReceiveMarketing(legit, on)).toBe(true);
    expect(canReceiveMarketing({ ...legit, unsubscribedAt: '2026-11-14' }, on)).toBe(false);
    expect(canReceiveMarketing({ legalBasis: null, consentAt: at, unsubscribedAt: null }, on)).toBe(
      false,
    );
  });

  it('describeRule descreve cada regra em pt-BR', () => {
    const names = { products: { [uuid]: 'Terço de Madeira' } };
    expect(describeRule({ type: 'product', productId: uuid }, names)).toBe(
      'Comprou Terço de Madeira',
    );
    expect(
      describeRule({ type: 'product', productId: '22222222-2222-4222-8222-222222222222' }, names),
    ).toBe('Comprou uma peça removida');
    expect(describeRule({ type: 'category', category: 'Presentes' }, names)).toBe(
      'Comprou na categoria Presentes',
    );
    expect(describeRule({ type: 'spentAbove', cents: 15000 }, names)).toBe(
      'Gastou acima de R$ 150,00',
    );
    expect(describeRule({ type: 'lastPurchase', op: 'moreThan', days: 90 }, names)).toBe(
      'Última compra há mais de 90 dias',
    );
    expect(describeRule({ type: 'lastPurchase', op: 'lessThan', days: 30 }, names)).toBe(
      'Última compra há menos de 30 dias',
    );
    expect(describeRule({ type: 'club' }, names)).toBe('Assinantes do clube');
    expect(describeRule({ type: 'prayer' }, names)).toBe('Inscritos na oração');
    expect(describeRule({ type: 'groupBuy' }, names)).toBe('Participou de compra coletiva');
    expect(describeRule({ type: 'tag', tag: 'Paróquia São José' }, names)).toBe(
      'Etiqueta: Paróquia São José',
    );
  });

  it('métricas: percentual e estimativa de duração', () => {
    expect(percent(1, 8)).toBe('12,5%');
    expect(percent(0, 0)).toBe('—');
    expect(estimateDuration(250, 100)).toBe('cerca de 3 horas');
    expect(estimateDuration(80, 100)).toBe('menos de 1 hora');
    expect(estimateDuration(100, 100)).toBe('menos de 1 hora');
  });
});

describe('parseContactsCsv', () => {
  it('lê BOM, separador ; e cabeçalho com colunas trocadas', () => {
    const csv = '﻿Nome;E-mail\r\nAna Souza;ana@x.com\r\nJoão;joao@x.com\r\n';
    expect(parseContactsCsv(csv)).toEqual({
      rows: [
        { email: 'ana@x.com', name: 'Ana Souza' },
        { email: 'joao@x.com', name: 'João' },
      ],
      invalid: 0,
      duplicates: 0,
    });
  });

  it('aceita campos entre aspas com vírgula e aspas escapadas', () => {
    const csv = 'email,name\nana@x.com,"Silva, Ana"\nbia@x.com,"Bia ""B"""';
    expect(parseContactsCsv(csv).rows).toEqual([
      { email: 'ana@x.com', name: 'Silva, Ana' },
      { email: 'bia@x.com', name: 'Bia "B"' },
    ]);
  });

  it('conta repetidos e inválidos', () => {
    const csv = 'ANA@X.COM,Ana\nana@x.com,Ana 2\nnao-e-email,Fulano';
    expect(parseContactsCsv(csv)).toEqual({
      rows: [{ email: 'ana@x.com', name: 'Ana' }],
      invalid: 1,
      duplicates: 1,
    });
  });

  it('sem cabeçalho, a coluna 0 é o e-mail', () => {
    expect(parseContactsCsv('a@x.com\nb@x.com,Bia').rows).toEqual([
      { email: 'a@x.com', name: '' },
      { email: 'b@x.com', name: 'Bia' },
    ]);
  });

  it('corta nomes longos em 100 caracteres para caber no schema de importação', () => {
    const { rows } = parseContactsCsv(`a@x.com,${'N'.repeat(150)}`);
    expect(rows[0]!.name).toHaveLength(100);
    expect(contactImportSchema.safeParse({ tag: 't', consent: true, rows }).success).toBe(true);
  });
});

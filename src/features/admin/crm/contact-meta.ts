import {
  consentSourceLabels,
  legalBasisLabels,
  type MarketingContactRow,
} from '@maos-em-oracao/contracts';

export type ContactStatus = 'Pode receber' | 'Descadastrado' | 'Sem aceite';

export const contactStatus = (c: MarketingContactRow): ContactStatus =>
  c.eligible ? 'Pode receber' : c.unsubscribedAt ? 'Descadastrado' : 'Sem aceite';

export const basisLabel = (c: MarketingContactRow) =>
  c.legalBasis ? legalBasisLabels[c.legalBasis] : '—';

export const sourceLabel = (c: MarketingContactRow) =>
  c.consentSource ? consentSourceLabels[c.consentSource] : '—';

export const consentDate = (c: MarketingContactRow) =>
  c.consentAt
    ? new Date(c.consentAt).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
    : '—';

export const normalizeEmail = (value: string) => value.trim().toLowerCase();

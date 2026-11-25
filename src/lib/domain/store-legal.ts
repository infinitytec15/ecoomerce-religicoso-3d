/**
 * Seller identification shown on the policy pages (Decreto 7.962/2013 asks for name, document
 * and address). Fill `document` with the CNPJ (or CPF) before scaling up sales.
 */
export const STORE_LEGAL = {
  name: 'Mãos em Oração',
  legalName: 'Mãos em Oração',
  document: '',
  address: 'Av. Afonso Camargo, 2491 · Cristo Rei · Curitiba/PR · CEP 80050-370',
  email: 'contato@maosemoracao.com.br',
  /** Store WhatsApp (DDD + number); kept here so store pages stay static. */
  whatsapp: process.env.NEXT_PUBLIC_WHATSAPP || '3121811980',
  supportHours: 'segunda a sexta, das 9h às 18h',
  updatedAt: '25 de novembro de 2026',
} as const;

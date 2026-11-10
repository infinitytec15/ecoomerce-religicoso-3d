import type { EmailContext, EmailMessage } from '@maos-em-oracao/emails';

/** Synthetic preview fixtures. Domains are deliberately non-production. */
export const sampleContext: EmailContext = {
  webUrl: 'https://loja.example',
  supportEmail: 'ajuda@loja.example',
};
const base = { name: 'Mariana', actionUrl: 'https://loja.example/conta' };
const order = { ...base, orderNumber: 'MEO-EXEMPLO-1042', totalCents: 14890 };
export const sampleEmails: EmailMessage[] = [
  {
    kind: 'operation-alert',
    name: 'Equipe',
    actionUrl: 'https://loja.example/admin/produtos',
    title: 'Uma peça precisa de reposição.',
    summary:
      'O estoque disponível da Cruz Essencial atingiu 3 unidades. Revise a reposição no painel.',
  },
  {
    kind: 'verify-email',
    ...base,
    actionUrl: 'https://loja.example/conta/confirmar?token=amostra',
    expiresAtLabel: '10/11/2026 às 14h (Brasília)',
  },
  {
    kind: 'password-reset',
    ...base,
    actionUrl: 'https://loja.example/conta/redefinir?token=amostra',
    expiresAtLabel: '09/11/2026 às 14h30 (Brasília)',
  },
  {
    kind: 'team-invite',
    ...base,
    role: 'Produção e expedição',
    expiresAtLabel: '12/11/2026 às 14h (Brasília)',
  },
  {
    kind: 'order-received',
    ...order,
    items: [{ name: 'Escultura Sagrada Família · Areia', quantity: 1, lineTotalCents: 12900 }],
    shippingCents: 1990,
    discountCents: 0,
  },
  { kind: 'pix-pending', ...order, expiresAtLabel: '09/11/2026 às 15h (Brasília)' },
  { kind: 'payment-approved', ...order },
  { kind: 'production-started', ...base, orderNumber: order.orderNumber },
  {
    kind: 'shipment-posted',
    ...base,
    orderNumber: order.orderNumber,
    carrier: 'Transportadora de exemplo',
    trackingCode: 'BR-EXEMPLO-1042',
    trackingUrl: 'https://transportadora.example/rastreio/1042',
  },
  {
    kind: 'club-welcome',
    ...base,
    planName: 'Cesta com Jesus · plano de exemplo',
    totalCents: 12990,
  },
  {
    kind: 'club-renewed',
    ...base,
    edition: 'Novembro · Gratidão em cada detalhe',
    totalCents: 12990,
  },
  { kind: 'payment-failed', ...base, reference: 'sua mensalidade de novembro' },
  {
    kind: 'club-status',
    ...base,
    status: 'paused',
    effectiveLabel: 'a partir da edição de dezembro de 2026',
  },
  { kind: 'devotional-opt-in', ...base, expiresAtLabel: '10/11/2026 às 14h (Brasília)' },
  {
    kind: 'daily-prayer',
    ...base,
    actionUrl: 'https://loja.example/cantinho-da-fe',
    title: 'Que a paz encontre lugar no seu dia.',
    dateLabel: '9 de novembro',
    prayer:
      'Senhor Jesus, acolhe o que hoje pesa em meu coração.\n\nDá-me serenidade para viver um passo de cada vez, coragem para fazer o bem e sensibilidade para perceber quem precisa de cuidado.\n\nQue minhas palavras levem paz e minhas mãos sejam instrumento do teu amor. Amém.',
    reflection:
      'Hoje, escolha uma pessoa e ofereça alguns minutos de escuta. O cuidado também é uma forma de oração.',
    unsubscribeUrl: 'https://loja.example/oracao/descadastro?token=amostra',
    oneClickUnsubscribeUrl: 'https://loja.example/api/email/unsubscribe?token=amostra',
  },
  {
    kind: 'support-reply',
    ...base,
    ticketNumber: 'AT-EXEMPLO-208',
    visibility: 'public',
    reply:
      'Olá, Mariana! Obrigada por falar com a gente.\n\nJá recebemos sua solicitação de atualização do endereço. Você pode conferir os detalhes e continuar a conversa no atendimento da sua conta.',
  },
  { kind: 'refund-confirmed', ...order, refundedCents: 14890 },
];

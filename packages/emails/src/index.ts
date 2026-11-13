import { z } from 'zod';

export const EMAIL_TEMPLATE_VERSION = '2026-11-13.2';
const line = z
  .string()
  .trim()
  .min(1)
  .max(240)
  .refine((v) => !/[\r\n]/.test(v));
const prose = z.string().trim().min(1).max(5000);
const cents = z.number().int().nonnegative().max(100_000_000);
const https = z
  .url()
  .max(2048)
  .refine((value) => {
    const url = new URL(value);
    return (
      (url.protocol === 'https:' ||
        (url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname))) &&
      !url.username &&
      !url.password &&
      !/[\r\n]/.test(value)
    );
  }, 'Use uma URL HTTPS sem credenciais.');
const base = { name: line, actionUrl: https };
const order = { ...base, orderNumber: line, totalCents: cents };

export const emailMessageSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('operation-alert'), ...base, title: line, summary: prose }),
  z.strictObject({ kind: z.literal('verify-email'), ...base, expiresAtLabel: line }),
  z.strictObject({ kind: z.literal('password-reset'), ...base, expiresAtLabel: line }),
  z.strictObject({ kind: z.literal('team-invite'), ...base, role: line, expiresAtLabel: line }),
  z.strictObject({
    kind: z.literal('order-received'),
    ...order,
    items: z
      .array(
        z.strictObject({
          name: line,
          quantity: z.number().int().positive().max(999),
          lineTotalCents: cents,
        }),
      )
      .min(1)
      .max(100),
    shippingCents: cents,
    discountCents: cents,
  }),
  z.strictObject({ kind: z.literal('pix-pending'), ...order, expiresAtLabel: line }),
  z.strictObject({ kind: z.literal('payment-approved'), ...order }),
  z.strictObject({ kind: z.literal('production-started'), ...base, orderNumber: line }),
  z.strictObject({
    kind: z.literal('shipment-posted'),
    ...base,
    orderNumber: line,
    carrier: line,
    trackingCode: line,
    trackingUrl: https,
  }),
  z.strictObject({
    kind: z.literal('order-delivered'),
    ...base,
    orderNumber: line,
    carrier: line,
    trackingCode: line,
  }),
  z.strictObject({
    kind: z.literal('review-request'),
    ...base,
    orderNumber: line,
    items: z
      .array(z.strictObject({ name: line, variant: z.string().trim().max(240) }))
      .min(1)
      .max(100),
    optOutUrl: https,
  }),
  z.strictObject({ kind: z.literal('club-welcome'), ...base, planName: line, totalCents: cents }),
  z.strictObject({ kind: z.literal('club-renewed'), ...base, edition: line, totalCents: cents }),
  z.strictObject({ kind: z.literal('payment-failed'), ...base, reference: line }),
  z.strictObject({
    kind: z.literal('club-status'),
    ...base,
    status: z.enum(['paused', 'resumed', 'cancelled', 'skipped']),
    effectiveLabel: line,
  }),
  z.strictObject({ kind: z.literal('devotional-opt-in'), ...base, expiresAtLabel: line }),
  z.strictObject({
    kind: z.literal('daily-prayer'),
    ...base,
    title: line,
    prayer: prose,
    reflection: prose,
    dateLabel: line,
    unsubscribeUrl: https,
    oneClickUnsubscribeUrl: https,
  }),
  z.strictObject({
    kind: z.literal('support-reply'),
    ...base,
    ticketNumber: line,
    reply: prose,
    visibility: z.literal('public'),
  }),
  z.strictObject({ kind: z.literal('refund-confirmed'), ...order, refundedCents: cents }),
]);

export type EmailMessage = z.infer<typeof emailMessageSchema>;
export type EmailKind = EmailMessage['kind'];
export const emailContextSchema = z.strictObject({
  allowLocalHttp: z.boolean().optional(),
  webUrl: https,
  supportEmail: z.email().max(254),
});
export type EmailContext = z.infer<typeof emailContextSchema>;
export interface RenderedEmail {
  kind: EmailKind;
  version: string;
  category: 'transactional' | 'devotional';
  subject: string;
  html: string;
  text: string;
  headers: Record<string, string>;
}

export const emailLabels: Record<EmailKind, string> = {
  'operation-alert': 'Alerta da operação',
  'verify-email': 'Confirmar e-mail',
  'password-reset': 'Recuperar acesso',
  'team-invite': 'Convite para a equipe',
  'order-received': 'Pedido recebido',
  'pix-pending': 'Pix pendente',
  'payment-approved': 'Pagamento aprovado',
  'production-started': 'Produção iniciada',
  'shipment-posted': 'Pedido enviado',
  'order-delivered': 'Pedido entregue',
  'review-request': 'Como ficou sua peça?',
  'club-welcome': 'Boas-vindas ao clube',
  'club-renewed': 'Renovação do clube',
  'payment-failed': 'Pagamento não aprovado',
  'club-status': 'Atualização da assinatura',
  'devotional-opt-in': 'Confirmar oração diária',
  'daily-prayer': 'Oração diária',
  'support-reply': 'Resposta do atendimento',
  'refund-confirmed': 'Estorno confirmado',
};

const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!,
  );
const money = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value / 100);
type Detail = [string, string];
interface Content {
  title: string;
  intro: string;
  cta: string;
  details?: Detail[];
  note?: string;
  letter?: string;
  reflection?: string;
}

function content(message: EmailMessage): Content {
  switch (message.kind) {
    case 'operation-alert':
      return {
        title: message.title,
        intro: message.summary,
        cta: 'Abrir a gestão',
        note: 'Alerta da operação Mãos em Oração. Consulte o registro completo no painel.',
      };
    case 'verify-email':
      return {
        title: 'Seu próximo passo começa aqui.',
        intro:
          'Confirme seu e-mail para concluir o cadastro e acompanhar seus pedidos em um só lugar.',
        cta: 'Confirmar meu e-mail',
        note: `Este link é válido até ${message.expiresAtLabel}. Se você não criou uma conta, ignore esta mensagem.`,
      };
    case 'password-reset':
      return {
        title: 'Vamos recuperar seu acesso.',
        intro: 'Recebemos uma solicitação para criar uma nova senha para sua conta.',
        cta: 'Criar uma nova senha',
        note: `O link expira em ${message.expiresAtLabel} e só pode ser usado uma vez. Se não foi você, ignore este e-mail. Sua senha atual permanece válida.`,
      };
    case 'team-invite':
      return {
        title: 'Há um lugar para você na equipe.',
        intro:
          'Você recebeu um convite para colaborar com a Mãos em Oração. Confira o perfil antes de aceitar.',
        cta: 'Conhecer e aceitar convite',
        details: [['Perfil de acesso', message.role]],
        note: `Convite válido até ${message.expiresAtLabel}. Aceitar cria acesso apenas às permissões desse perfil.`,
      };
    case 'order-received':
      return {
        title: 'Recebemos seu pedido com carinho.',
        intro: `Seu pedido ${message.orderNumber} já está registrado. Vamos confirmar o pagamento antes de iniciar a produção.`,
        cta: 'Acompanhar meu pedido',
        details: [
          ...message.items.map((item): Detail => [
            `${item.quantity} × ${item.name}`,
            money(item.lineTotalCents),
          ]),
          ['Frete', money(message.shippingCents)],
          ['Desconto', money(message.discountCents)],
          ['Total do pedido', money(message.totalCents)],
        ],
        note: 'Este aviso confirma o recebimento do pedido. A confirmação do pagamento chega em uma mensagem separada.',
      };
    case 'pix-pending':
      return {
        title: 'Falta um passo para confirmar.',
        intro: `O Pix do pedido ${message.orderNumber} está disponível. Abra a página segura do pedido para acessar o código e conferir os dados.`,
        cta: 'Abrir pagamento Pix',
        details: [
          ['Valor', money(message.totalCents)],
          ['Válido até', message.expiresAtLabel],
        ],
        note: 'Se você já pagou, acompanhe a confirmação no pedido. A produção começa depois da aprovação do valor integral.',
      };
    case 'payment-approved':
      return {
        title: 'Pagamento confirmado. Obrigado!',
        intro: `O pagamento integral do pedido ${message.orderNumber} foi aprovado. Você pode acompanhar os próximos passos pela sua conta.`,
        cta: 'Ver meu pedido',
        details: [
          ['Pedido', message.orderNumber],
          ['Valor aprovado', money(message.totalCents)],
        ],
      };
    case 'production-started':
      return {
        title: 'Sua peça está ganhando forma.',
        intro: `A produção do pedido ${message.orderNumber} começou. Nosso próximo aviso será sobre uma nova etapa do seu pedido.`,
        cta: 'Acompanhar a produção',
        details: [['Pedido', message.orderNumber]],
        note: 'Consulte a previsão atualizada na página do pedido.',
      };
    case 'shipment-posted':
      return {
        title: 'Seu pedido está a caminho.',
        intro: `O pedido ${message.orderNumber} foi postado. O rastreamento pode levar algum tempo para exibir a primeira movimentação.`,
        cta: 'Acompanhar meu pedido',
        details: [
          ['Transportadora', message.carrier],
          ['Código de rastreio', message.trackingCode],
        ],
      };
    case 'order-delivered':
      return {
        title: 'Seu pedido chegou.',
        intro: `O pedido ${message.orderNumber} foi entregue. Que esta peça leve paz e significado ao seu lar.`,
        cta: 'Ver meu pedido',
        details: [
          ['Transportadora', message.carrier],
          ['Código de rastreio', message.trackingCode],
        ],
        note: 'Se algo não chegou como você esperava, responda este e-mail ou fale com nosso atendimento.',
      };
    case 'review-request':
      return {
        title: 'Como ficou sua peça?',
        intro: `O pedido ${message.orderNumber} já chegou há alguns dias. Sua opinião ajuda outras famílias a escolher e nos mostra como cuidar melhor de cada peça.`,
        cta: 'Avaliar minhas peças',
        letter: message.items
          .map((item) => (item.variant ? `${item.name} · ${item.variant}` : item.name))
          .join('\n'),
        note: 'Leva menos de um minuto. Se algo não saiu como esperado, responda este e-mail para falarmos com você.',
      };
    case 'club-welcome':
      return {
        title: 'Bem-vindo ao nosso encontro mensal.',
        intro:
          'Sua assinatura do clube foi autorizada. A preparação da primeira cesta depende da confirmação da primeira mensalidade.',
        cta: 'Conhecer minha assinatura',
        details: [
          ['Plano', message.planName],
          ['Mensalidade', money(message.totalCents)],
        ],
        note: 'Você encontra cobranças, próximos envios e opções de gestão no painel da assinatura.',
      };
    case 'club-renewed':
      return {
        title: 'Mais um mês de fé para sua casa.',
        intro:
          'A mensalidade desta edição foi confirmada. Acompanhe a preparação e o envio da sua cesta pelo painel do clube.',
        cta: 'Ver esta edição',
        details: [
          ['Edição', message.edition],
          ['Mensalidade aprovada', money(message.totalCents)],
        ],
      };
    case 'payment-failed':
      return {
        title: 'Precisamos da sua atenção.',
        intro: `O pagamento de ${message.reference} não foi aprovado. Abra sua conta para conferir a situação e as opções disponíveis.`,
        cta: 'Conferir meu pagamento',
        note: 'Não compartilhe dados do cartão ou senhas por e-mail. A liberação da produção depende da confirmação do pagamento.',
      };
    case 'club-status': {
      const status = {
        paused: ['Sua assinatura está pausada.', 'A pausa da assinatura foi confirmada.'],
        resumed: ['Bom ter você de volta.', 'A retomada da assinatura foi confirmada.'],
        cancelled: [
          'Sua assinatura foi cancelada.',
          'O cancelamento da assinatura foi confirmado.',
        ],
        skipped: [
          'A atualização da edição foi confirmada.',
          'O pedido para pular uma edição foi confirmado.',
        ],
      }[message.status];
      return {
        title: status[0],
        intro: status[1],
        cta: 'Consultar minha assinatura',
        details: [['Vigência', message.effectiveLabel]],
        note: 'Cobranças e pedidos anteriores continuam disponíveis no histórico da sua conta.',
      };
    }
    case 'devotional-opt-in':
      return {
        title: 'Um momento de oração, todos os dias.',
        intro:
          'Você pediu para receber uma oração diária gratuita. Confirme seu e-mail para começar a receber essas mensagens.',
        cta: 'Quero receber minha oração',
        note: `Confirmação válida até ${message.expiresAtLabel}. Você pode sair da lista quando quiser. Se não fez essa solicitação, ignore este e-mail.`,
      };
    case 'daily-prayer':
      return {
        title: message.title,
        intro: `Reserve um instante para estar com Deus neste ${message.dateLabel}.`,
        cta: 'Visitar o Cantinho da Fé',
        letter: message.prayer,
        reflection: message.reflection,
        note: 'Oração e reflexão autorais da Mãos em Oração.',
      };
    case 'support-reply':
      return {
        title: 'Nossa equipe respondeu para você.',
        intro: `Há uma nova resposta no atendimento ${message.ticketNumber}.`,
        cta: 'Abrir meu atendimento',
        letter: message.reply,
        note: 'Continue a conversa pelo atendimento na sua conta, onde todo o histórico fica reunido.',
      };
    case 'refund-confirmed':
      return {
        title: 'Seu estorno foi confirmado.',
        intro: `O estorno do pedido ${message.orderNumber} foi confirmado pelo provedor de pagamento.`,
        cta: 'Consultar meu estorno',
        details: [
          ['Pedido', message.orderNumber],
          ['Valor estornado', money(message.refundedCents)],
        ],
        note: 'O prazo para o valor aparecer depende do meio de pagamento e da instituição financeira. Consulte os detalhes na sua conta.',
      };
  }
}

/** Pure renderer. No API calls, environment reads, tracking pixels or persisted tokens. */
export function renderEmail(input: EmailMessage, configuration: EmailContext): RenderedEmail {
  const message = emailMessageSchema.parse(input);
  const context = emailContextSchema.parse(configuration);
  const origin = new URL(context.webUrl).origin;
  const localLinks = [
    message.actionUrl,
    ...(message.kind === 'daily-prayer'
      ? [message.unsubscribeUrl, message.oneClickUnsubscribeUrl]
      : message.kind === 'review-request'
        ? [message.optOutUrl]
        : []),
  ];
  if (localLinks.some((value) => new URL(value).origin !== origin))
    throw new Error('Links de ação devem pertencer ao domínio público da loja.');
  if (new URL(context.webUrl).protocol !== 'https:' && !context.allowLocalHttp)
    throw new Error('HTTP local exige habilitação explícita no contexto de desenvolvimento.');
  if (message.kind === 'order-received') {
    const subtotal = message.items.reduce((sum, item) => sum + item.lineTotalCents, 0);
    if (subtotal + message.shippingCents - message.discountCents !== message.totalCents)
      throw new Error('Resumo do pedido não confere com o total.');
  }
  if (message.kind === 'refund-confirmed' && message.refundedCents > message.totalCents)
    throw new Error('Estorno maior que o total do pedido.');
  const copy = content(message);
  const preheader = copy.intro;
  const paragraph = (value: string) =>
    `<p style="margin:0 0 20px;line-height:1.7;white-space:pre-line">${escape(value)}</p>`;
  const details = copy.details?.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:28px 0;border-collapse:collapse">${copy.details.map(([label, value], i, entries) => `<tr><td style="padding:13px 12px 13px 0;border-bottom:1px solid #dedfd6;${i === entries.length - 1 ? 'font-weight:700;' : ''}">${escape(label)}</td><td align="right" style="padding:13px 0;border-bottom:1px solid #dedfd6;${value.startsWith('R$') ? 'white-space:nowrap;' : 'white-space:normal;overflow-wrap:anywhere;'}${i === entries.length - 1 ? 'font-weight:700;' : ''}">${escape(value)}</td></tr>`).join('')}</table>`
    : '';
  const unsubscribe =
    message.kind === 'daily-prayer'
      ? `<p style="margin:16px 0 0">Você recebe esta oração porque confirmou sua inscrição.<br><a href="${escape(message.unsubscribeUrl)}" style="display:inline-block;padding:6px 0;color:#89422e;text-decoration:underline">Deixar de receber a oração diária</a></p>`
      : message.kind === 'review-request'
        ? `<p style="margin:16px 0 0">Não quer mais receber pedidos de avaliação?<br><a href="${escape(message.optOutUrl)}" style="display:inline-block;padding:6px 0;color:#89422e;text-decoration:underline">Descadastre-se</a></p>`
        : '';
  const tracking =
    message.kind === 'shipment-posted'
      ? `<p style="margin:20px 0"><a href="${escape(message.trackingUrl)}" style="display:inline-block;padding:6px 0;color:#89422e;text-decoration:underline">Consultar no site da transportadora</a></p>`
      : '';
  const button = `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px 0"><tr><td bgcolor="#3e4934" style="border-radius:8px;mso-padding-alt:16px 24px"><a href="${escape(message.actionUrl)}" style="display:inline-block;padding:16px 24px;border:1px solid #3e4934;border-radius:8px;color:#ffffff;background:#3e4934;text-decoration:none;font-weight:700;line-height:1.35;mso-padding-alt:0">${escape(copy.cta)}</a></td></tr></table>`;
  const site = new URL(origin).host;
  const link = (href: string, label: string) =>
    `<a href="${escape(href)}" style="display:inline-block;padding:6px 8px;color:#89422e;text-decoration:underline">${escape(label)}</a>`;
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>${escape(emailLabels[message.kind])} · Mãos em Oração</title><style>body{margin:0!important}a:focus-visible{outline:3px solid #aa5438;outline-offset:4px}::selection{background:#e9eddf;color:#282c25}@media(max-width:620px){.outer{padding:16px 10px!important}.body-cell{padding:30px 24px!important}.brand-cell{padding:30px 24px 20px!important}.foot-cell{padding:28px 24px!important}h1{font-size:30px!important}}</style></head><body style="margin:0;padding:0;background:#f4f1ea;color:#282c25;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6"><div style="display:none;max-height:0;overflow:hidden;mso-hide:all">${escape(preheader)}</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#f4f1ea"><tr><td class="outer" align="center" style="padding:36px 16px"><!--[if mso]><table role="presentation" width="600"><tr><td><![endif]--><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;border-collapse:separate;background:#fffef8;border:1px solid #e7e3d8;border-radius:18px;overflow:hidden"><tr><td class="brand-cell" align="center" style="padding:36px 40px 22px;background:#fffef8"><a href="${escape(origin)}" style="text-decoration:none;color:#3e4934"><img src="${escape(origin)}/assets/email/logo-mark-128.png" width="64" height="64" alt="Mãos em Oração" style="display:block;margin:0 auto 12px;border:0;outline:none;width:64px;height:64px;border-radius:50%"><span style="display:block;font-family:Georgia,'Times New Roman',serif;font-size:26px;line-height:1.2;color:#3e4934">Mãos em Oração</span></a><span style="display:block;margin-top:8px;font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#aa5438">Fé para viver · Amor para compartilhar</span></td></tr><tr><td align="center" style="padding:0 40px"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td width="56" height="3" bgcolor="#aa5438" style="width:56px;height:3px;line-height:3px;font-size:0;border-radius:3px">&nbsp;</td></tr></table></td></tr><tr><td class="body-cell" style="padding:34px 40px 40px;overflow-wrap:anywhere;word-break:break-word"><h1 style="margin:0 0 24px;font-family:Georgia,'Times New Roman',serif;font-size:36px;line-height:1.16;font-weight:400;letter-spacing:-.02em;color:#282c25">${escape(copy.title)}</h1>${paragraph(`Olá, ${message.name}.`)}${paragraph(copy.intro)}${copy.letter ? `<div style="margin:26px 0;padding:26px 24px;background:#e9eddf;border-radius:12px;line-height:1.85">${paragraph(copy.letter)}</div>` : ''}${copy.reflection ? paragraph(copy.reflection) : ''}${button}${details}${tracking}${copy.note ? `<p style="margin:24px 0 0;font-size:14px;color:#65695f;line-height:1.65">${escape(copy.note)}</p>` : ''}</td></tr><tr><td class="foot-cell" align="center" style="padding:30px 40px;background:#eeeee6;border-top:1px solid #e1ddd2;color:#65695f;font-size:13px;line-height:1.75"><a href="${escape(origin)}" style="display:inline-block;padding:4px 0;font-family:Georgia,'Times New Roman',serif;font-size:20px;color:#3e4934;text-decoration:none">${escape(site)}</a><p style="margin:6px 0 0">${link(origin + '/produtos', 'Loja')}<span aria-hidden="true">·</span>${link(origin + '/conta', 'Minha conta')}<span aria-hidden="true">·</span>${link(origin + '/suporte', 'Atendimento')}</p><p style="margin:10px 0 0">Precisa de ajuda? <a href="mailto:${escape(context.supportEmail)}" style="display:inline-block;padding:6px 0;color:#89422e;text-decoration:underline">${escape(context.supportEmail)}</a></p>${unsubscribe}<p style="margin:14px 0 0;font-size:12px;color:#8a8d83">Mãos em Oração · Peças cristãs em impressão 3D, feitas com cuidado.</p></td></tr></table><!--[if mso]></td></tr></table><![endif]--></td></tr></table></body></html>`;
  const text = [
    'Mãos em Oração',
    copy.title,
    `Olá, ${message.name}.`,
    copy.intro,
    copy.letter,
    copy.reflection,
    `${copy.cta}: ${message.actionUrl}`,
    copy.details?.map(([label, value]) => `${label}: ${value}`).join('\n'),
    message.kind === 'shipment-posted'
      ? `Rastreio da transportadora: ${message.trackingUrl}`
      : undefined,
    copy.note,
    `Ajuda: ${context.supportEmail}`,
    `${new URL(context.webUrl).host} · Loja: ${origin}/produtos · Minha conta: ${origin}/conta`,
    message.kind === 'daily-prayer'
      ? `Você recebe esta oração porque confirmou sua inscrição.\nDeixar de receber: ${message.unsubscribeUrl}`
      : message.kind === 'review-request'
        ? `Não quer mais receber pedidos de avaliação? Descadastre-se: ${message.optOutUrl}`
        : undefined,
  ]
    .filter(Boolean)
    .join('\n\n');
  return {
    kind: message.kind,
    version: EMAIL_TEMPLATE_VERSION,
    category: message.kind === 'daily-prayer' ? 'devotional' : 'transactional',
    subject: `${emailLabels[message.kind]} · Mãos em Oração`,
    html,
    text,
    headers:
      message.kind === 'daily-prayer'
        ? {
            'List-Unsubscribe': `<${message.oneClickUnsubscribeUrl}>`,
            'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
          }
        : {},
  };
}

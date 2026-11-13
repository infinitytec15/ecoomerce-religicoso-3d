// @vitest-environment node
import { createHmac } from 'node:crypto';
import { Resend } from 'resend';
import { describe, expect, it, vi } from 'vitest';
import { emailLabels, renderEmail } from '@maos-em-oracao/emails';
import { sampleContext, sampleEmails } from '@maos-em-oracao/emails/samples';
import {
  classifyEmailEvent,
  createEmailProvider,
  emailIdempotencyKey,
  resendTag,
} from '@maos-em-oracao/emails/resend';

const keyBytes = Buffer.from('local-test-signing-secret-32bytes');
const config = {
  fromEmail: 'pedidos@loja.example',
  replyToEmail: 'ajuda@loja.example',
  webhookSecret: `whsec_${keyBytes.toString('base64')}`,
};
const sample = sampleEmails.find((m) => m.kind === 'payment-approved')!;
const prayer = sampleEmails.find((m) => m.kind === 'daily-prayer')!;

describe('templates de e-mail', () => {
  it('cobre todos os modelos com HTML e texto determinísticos', () => {
    expect(new Set(sampleEmails.map((m) => m.kind)).size).toBe(Object.keys(emailLabels).length);
    for (const message of sampleEmails) {
      const rendered = renderEmail(message, sampleContext);
      expect(renderEmail(message, sampleContext)).toEqual(rendered);
      expect(rendered.html).toContain('lang="pt-BR"');
      expect(rendered.html).toContain('role="presentation"');
      expect(rendered.html).not.toMatch(/<script|<iframe|animation:/i);
      // The only image is the small brand mark served by the store itself, with alt text.
      const images = rendered.html.match(/<img\b[^>]*>/gi) || [];
      expect(images).toHaveLength(1);
      expect(images[0]).toContain(
        `src="${new URL(sampleContext.webUrl).origin}/assets/email/logo-mark-128.png"`,
      );
      expect(images[0]).toContain('alt="Mãos em Oração"');
      // Footer always links back to the store site.
      expect(rendered.html).toContain(`>${new URL(sampleContext.webUrl).host}</a>`);
      expect(rendered.text).toContain(message.actionUrl);
      expect(rendered.subject).not.toMatch(/[\r\n]/);
      expect(Buffer.byteLength(rendered.html)).toBeLessThan(102_400);
    }
  });
  it('escapa conteúdo do cliente e mantém texto simples legível', () => {
    const rendered = renderEmail({ ...sample, name: '<script>alert("x")</script>' }, sampleContext);
    expect(rendered.html).toContain('&lt;script&gt;');
    expect(rendered.html).not.toContain('<script>');
    expect(rendered.text).toContain('<script>');
  });
  it('rejeita ações externas, protocolos inseguros e credenciais', () => {
    for (const actionUrl of [
      'https://phishing.example/reset',
      'javascript:alert(1)',
      'https://user:password@loja.example/conta',
      'http://loja.example/conta',
    ]) {
      expect(() => renderEmail({ ...sample, actionUrl }, sampleContext)).toThrow();
    }
    expect(() => renderEmail({ ...sample, name: 'Nome\r\nBcc: destino' }, sampleContext)).toThrow();
  });
  it('exige descadastro humano e one-click apenas na oração diária', () => {
    const rendered = renderEmail(prayer, sampleContext);
    expect(rendered.headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
    expect(rendered.html).toContain('Deixar de receber');
    expect(rendered.text).toContain('Deixar de receber');
    expect(renderEmail(sample, sampleContext).headers).toEqual({});
    expect(() => renderEmail({ ...prayer, unsubscribeUrl: '' }, sampleContext)).toThrow();
  });
  it('não permite nota interna em resposta de atendimento', () => {
    const support = sampleEmails.find((m) => m.kind === 'support-reply')!;
    expect(() =>
      renderEmail({ ...support, visibility: 'internal' } as never, sampleContext),
    ).toThrow();
    expect(() =>
      renderEmail({ ...support, internalNote: 'privado' } as never, sampleContext),
    ).toThrow();
  });
  it('valida totais antes de exibir recibos ou estornos', () => {
    const order = sampleEmails.find((m) => m.kind === 'order-received')!;
    const refund = sampleEmails.find((m) => m.kind === 'refund-confirmed')!;
    expect(renderEmail(order, sampleContext).text).toContain('148,90');
    expect(renderEmail(order, sampleContext).text).toContain('19,90');
    expect(() => renderEmail({ ...order, totalCents: 1 }, sampleContext)).toThrow('total');
    expect(() => renderEmail({ ...refund, refundedCents: 999999 }, sampleContext)).toThrow(
      'Estorno',
    );
  });
  it('renderiza todas as mudanças da assinatura com vigência explícita', () => {
    const club = sampleEmails.find((m) => m.kind === 'club-status')!;
    for (const status of ['paused', 'resumed', 'cancelled', 'skipped'] as const) {
      expect(renderEmail({ ...club, status }, sampleContext).text).toContain('Vigência:');
    }
  });
});

describe('adaptador Resend sem envio real', () => {
  function setup() {
    const send = vi
      .fn<Resend['emails']['send']>()
      .mockResolvedValue({ data: { id: 'email-example' }, error: null, headers: {} });
    const verify = vi.fn<Resend['webhooks']['verify']>();
    const provider = createEmailProvider({ emails: { send }, webhooks: { verify } }, config);
    return {
      send,
      verify,
      provider,
      input: {
        eventId: 'order.paid/example-1042',
        to: 'Cliente@loja.example',
        message: sample,
        context: sampleContext,
      },
    };
  }
  it('envia HTML e texto com chave estável e retorna aceite, não entrega', async () => {
    const { send, provider, input } = setup();
    const result = await provider.send(input);
    await provider.send(input);
    expect(result.status).toBe('accepted');
    expect(send.mock.calls[0]).toEqual(send.mock.calls[1]);
    expect(send.mock.calls[0][0]).toMatchObject({
      to: ['cliente@loja.example'],
      replyTo: config.replyToEmail,
    });
    expect(result.idempotencyKey).not.toContain('cliente');
    expect(
      emailIdempotencyKey('other-event', input.to, renderEmail(sample, sampleContext)),
    ).not.toBe(result.idempotencyKey);
  });
  it('envia tags no formato aceito pelo Resend (sem ponto da versão)', async () => {
    const { send, provider, input } = setup();
    await provider.send(input);
    // Resend answers 422 for any tag outside ASCII letters, digits, _ and -.
    for (const tag of send.mock.calls[0][0].tags || []) {
      expect(tag.name).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(tag.value).toMatch(/^[A-Za-z0-9_-]+$/);
    }
    expect(renderEmail(sample, sampleContext).version).toContain('.');
    expect(resendTag('version', '2026-11-10.1')).toEqual({
      name: 'version',
      value: '2026-11-10_1',
    });
  });
  it('inclui cabeçalhos de descadastro no envio da oração', async () => {
    const { send, provider, input } = setup();
    await provider.send({ ...input, message: prayer });
    expect(send.mock.calls[0][0].headers).toHaveProperty('List-Unsubscribe');
  });
  it.each([
    [429, true],
    [503, true],
    [422, false],
    [401, false],
    [409, false],
  ])('classifica erro HTTP %i', async (statusCode, retryable) => {
    const { send, provider, input } = setup();
    send.mockResolvedValue({
      data: null,
      error: { name: 'validation_error', message: 'sensitive recipient data', statusCode },
      headers: {},
    });
    await expect(provider.send(input)).rejects.toMatchObject({
      retryable,
      code: 'validation_error',
    });
    await expect(provider.send(input)).rejects.not.toHaveProperty(
      'message',
      'sensitive recipient data',
    );
  });
  it('trata timeout como resultado desconhecido e preserva chave para retry', async () => {
    const { send, provider, input } = setup();
    send.mockRejectedValue(new Error('token=secreto'));
    await expect(provider.send(input)).rejects.toMatchObject({
      retryable: true,
      code: 'network_unknown',
    });
  });
  it('rejeita recipient inválido antes de chamar o SDK', async () => {
    const { send, provider, input } = setup();
    await expect(provider.send({ ...input, to: 'a@b.test\r\nBcc: x@y.test' })).rejects.toThrow();
    expect(send).not.toHaveBeenCalled();
  });
  it('verifica assinatura real pelo SDK e rejeita corpo adulterado', () => {
    const provider = createEmailProvider(new Resend('re_local-test-only'), config);
    const raw = JSON.stringify({
      type: 'email.delivered',
      created_at: '2026-11-09T12:00:00Z',
      data: { email_id: 'example-id' },
    });
    const id = 'msg_local_example';
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = `v1,${createHmac('sha256', keyBytes).update(`${id}.${timestamp}.${raw}`).digest('base64')}`;
    expect(provider.verifyWebhook(raw, { id, timestamp, signature }).type).toBe('email.delivered');
    expect(() => provider.verifyWebhook(`${raw} `, { id, timestamp, signature })).toThrow();
    expect(() => provider.verifyWebhook(raw, { id, timestamp: '1', signature })).toThrow();
  });
  it('separa atraso de bloqueio e ignora abertura/clique', () => {
    expect(classifyEmailEvent('email.delivery_delayed')).toEqual({
      state: 'delayed',
      suppress: false,
    });
    expect(classifyEmailEvent('email.bounced')).toEqual({ state: 'bounced', suppress: true });
    expect(classifyEmailEvent('email.complained')?.suppress).toBe(true);
    expect(classifyEmailEvent('email.opened')).toBeNull();
    expect(classifyEmailEvent('toString')).toBeNull();
  });
});

import { createHash } from 'node:crypto';
import { Resend } from 'resend';
import { z } from 'zod';
import {
  renderEmail,
  type EmailContext,
  type EmailMessage,
  type RenderedEmail,
} from '@maos-em-oracao/emails';

export interface EmailProviderClient {
  emails: Pick<Resend['emails'], 'send'>;
  webhooks: Pick<Resend['webhooks'], 'verify'>;
}
const address = z.email().max(254);
const configSchema = z.strictObject({
  fromEmail: address,
  replyToEmail: address,
  webhookSecret: z.string().startsWith('whsec_').min(10),
});
export type EmailProviderConfig = z.infer<typeof configSchema>;
export class EmailProviderError extends Error {
  readonly retryable: boolean;
  readonly code: string;
  constructor(code: string, retryable: boolean) {
    super(`Falha no provedor de e-mail (${code}).`);
    this.name = 'EmailProviderError';
    this.code = code;
    this.retryable = retryable;
  }
}

/** No PII or tokens in provider idempotency keys. The DB must persist this key beyond Resend's 24 h window. */
/** Resend rejects (422) tag names/values outside ASCII letters, digits, _ and -. */
export function resendTag(name: string, value: string) {
  const clean = (v: string) => v.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 256);
  return { name: clean(name), value: clean(value) };
}
export function emailIdempotencyKey(
  eventId: string,
  recipient: string,
  rendered: Pick<RenderedEmail, 'kind' | 'version'>,
): string {
  z.string().trim().min(1).max(256).parse(eventId);
  const email = address.parse(recipient).toLowerCase();
  return `meo/${createHash('sha256')
    .update(JSON.stringify([eventId, email, rendered.kind, rendered.version]))
    .digest('hex')}`;
}

export function createEmailProvider(client: EmailProviderClient, input: EmailProviderConfig) {
  const config = configSchema.parse(input);
  return {
    /** Call only after outbox commit, authorization, consent and suppression checks in the worker. */
    async send(input: {
      eventId: string;
      to: string;
      message: EmailMessage;
      context: EmailContext;
    }) {
      const to = address.parse(input.to).toLowerCase();
      const rendered = renderEmail(input.message, input.context);
      const idempotencyKey = emailIdempotencyKey(input.eventId, to, rendered);
      let result: Awaited<ReturnType<Resend['emails']['send']>>;
      try {
        result = await client.emails.send(
          {
            from: `Mãos em Oração <${config.fromEmail}>`,
            to: [to],
            replyTo: config.replyToEmail,
            subject: rendered.subject,
            html: rendered.html,
            text: rendered.text,
            headers: rendered.headers,
            tags: [resendTag('template', rendered.kind), resendTag('version', rendered.version)],
          },
          { idempotencyKey },
        );
      } catch {
        // Do not attach the SDK exception: it can contain recipient or token-bearing request data.
        throw new EmailProviderError('network_unknown', true);
      }
      if (result.error) {
        const status = result.error.statusCode;
        const retryable = status === null || status === 429 || (status !== null && status >= 500);
        throw new EmailProviderError(result.error.name, retryable);
      }
      if (!result.data?.id) throw new EmailProviderError('missing_provider_id', true);
      return {
        provider: 'resend' as const,
        providerId: result.data.id,
        status: 'accepted' as const,
        idempotencyKey,
        templateVersion: rendered.version,
      };
    },
    /** Pass the exact raw UTF-8 body, never parsed/re-stringified JSON. Persist inbox before processing. */
    verifyWebhook(rawBody: string, headers: { id: string; timestamp: string; signature: string }) {
      z.string().min(1).max(262144).parse(rawBody);
      z.object({
        id: z.string().min(1).max(256),
        timestamp: z.string().min(1).max(32),
        signature: z.string().min(1).max(4096),
      }).parse(headers);
      return client.webhooks.verify({
        payload: rawBody,
        headers,
        webhookSecret: config.webhookSecret,
      });
    },
  };
}

/** Explicit construction only. No reads from process.env and no automatic send on import. */
export function createResendProvider(apiKey: string, config: EmailProviderConfig) {
  const key = z.string().startsWith('re_').min(10).parse(apiKey);
  return createEmailProvider(new Resend(key), config);
}

const states = {
  'email.sent': 'sent',
  'email.delivered': 'delivered',
  'email.delivery_delayed': 'delayed',
  'email.bounced': 'bounced',
  'email.complained': 'complained',
  'email.failed': 'failed',
  'email.suppressed': 'suppressed',
} as const;
export type EmailDeliveryState = (typeof states)[keyof typeof states];
/** Called after verification. Open/click signals do not establish delivery or alter consent. */
export function classifyEmailEvent(
  type: string,
): { state: EmailDeliveryState; suppress: boolean } | null {
  if (!Object.hasOwn(states, type)) return null;
  return {
    state: states[type as keyof typeof states],
    suppress: ['email.bounced', 'email.complained', 'email.suppressed'].includes(type),
  };
}

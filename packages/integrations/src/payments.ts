import { createHmac, timingSafeEqual, createHash } from 'node:crypto';
import { z } from 'zod';
import { httpsUrlSchema, type PaymentToken, type PaymentAction } from '@maos-em-oracao/contracts';
import { ProviderError, configured, providerJson, toCents, type Fetcher } from './http';
export interface PaymentConfig {
  INTEGRATIONS_MODE: 'mock' | 'live';
  PAYMENTS_ENABLED: 'true' | 'false';
  MP_ACCESS_TOKEN?: string;
  MP_WEBHOOK_SECRET?: string;
  PUBLIC_API_URL: string;
  PUBLIC_WEB_URL: string;
}
export interface PaymentResult {
  id: string;
  status: string;
  amountCents: number;
  reference: string;
  updatedAt: string;
  action: PaymentAction;
  refundedCents: number;
  currency: string;
  feeCents?: number;
}
const paymentResponse = z.object({
  id: z.union([z.string(), z.number()]),
  status: z.string(),
  status_detail: z.string().optional(),
  three_ds_info: z
    .object({
      external_resource_url: httpsUrlSchema,
      creq: z.string().min(1).max(16000),
    })
    .nullable()
    .optional(),
  transaction_amount: z.number(),
  currency_id: z.string(),
  external_reference: z.string().nullable().optional(),
  date_last_updated: z.string().optional(),
  transaction_amount_refunded: z.number().optional(),
  point_of_interaction: z
    .object({
      transaction_data: z
        .object({
          qr_code: z.string().optional(),
          qr_code_base64: z.string().optional(),
          ticket_url: z.string().optional(),
        })
        .optional(),
    })
    .optional(),
  fee_details: z.array(z.object({ amount: z.number().nonnegative() })).optional(),
  date_of_expiration: z.string().nullable().optional(),
});
export function createPayments(config: PaymentConfig, fetcher: Fetcher = fetch) {
  const mock = config.INTEGRATIONS_MODE === 'mock';
  const request = <T>(
    path: string,
    body?: unknown,
    key?: string,
    method = body ? 'POST' : 'GET',
  ) => {
    configured('Mercado Pago', config.MP_ACCESS_TOKEN, config.PAYMENTS_ENABLED === 'true');
    return providerJson<T>(
      'Mercado Pago',
      'https://api.mercadopago.com' + path,
      {
        method,
        headers: {
          Authorization: `Bearer ${config.MP_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
          ...(key ? { 'X-Idempotency-Key': key } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      },
      fetcher,
    );
  };
  function parse(value: unknown): PaymentResult {
    const p = paymentResponse.parse(value),
      pix = p.point_of_interaction?.transaction_data;
    return {
      id: String(p.id),
      status: p.status,
      amountCents: toCents(p.transaction_amount),
      currency: p.currency_id,
      reference: p.external_reference || '',
      updatedAt: p.date_last_updated || new Date().toISOString(),
      refundedCents: toCents(p.transaction_amount_refunded || 0),
      ...(p.fee_details
        ? { feeCents: p.fee_details.reduce((n, fee) => n + toCents(fee.amount), 0) }
        : {}),
      action:
        p.status_detail === 'pending_challenge' && p.three_ds_info
          ? {
              type: 'challenge',
              paymentId: String(p.id),
              externalResourceUrl: p.three_ds_info.external_resource_url,
              creq: p.three_ds_info.creq,
            }
          : pix?.qr_code
            ? {
                type: 'pix',
                qrCode: pix.qr_code_base64 ? `data:image/png;base64,${pix.qr_code_base64}` : '',
                copyPaste: pix.qr_code,
                expiresAt: p.date_of_expiration || new Date(Date.now() + 1800000).toISOString(),
              }
            : { type: 'none' },
    };
  }
  return {
    async create(input: {
      id: string;
      key: string;
      amountCents: number;
      method: 'card' | 'pix';
      email: string;
      description: string;
      card?: PaymentToken;
    }): Promise<PaymentResult> {
      if (input.amountCents <= 0 || !Number.isSafeInteger(input.amountCents))
        throw new ProviderError('Mercado Pago', 'INVALID_AMOUNT', 422);
      if (input.method === 'card' && !input.card?.token)
        throw new ProviderError('Mercado Pago', 'CARD_TOKEN_REQUIRED', 422);
      if (mock)
        return {
          id: 'mock-' + input.id,
          status:
            input.method === 'card'
              ? input.card?.token === 'mock-challenge'
                ? 'pending'
                : input.card?.token === 'mock-declined'
                  ? 'rejected'
                  : 'approved'
              : 'pending',
          amountCents: input.amountCents,
          reference: input.id,
          currency: 'BRL',
          updatedAt: new Date().toISOString(),
          refundedCents: 0,
          action:
            input.card?.token === 'mock-challenge'
              ? {
                  type: 'challenge',
                  paymentId: 'mock-' + input.id,
                  externalResourceUrl: 'https://acs.example.test/challenge',
                  creq: 'fictitious-challenge-for-integration-tests',
                }
              : input.method === 'pix'
                ? {
                    type: 'pix',
                    qrCode: '',
                    copyPaste: 'HOMOLOGACAO-SEM-VALOR-' + input.id,
                    expiresAt: new Date(Date.now() + 1800000).toISOString(),
                  }
                : { type: 'none' },
        };
      const card = input.card;
      return parse(
        await request(
          '/v1/payments',
          {
            transaction_amount: input.amountCents / 100,
            description: input.description.slice(0, 240),
            external_reference: input.id,
            // Mercado Pago rejects non-HTTPS callbacks (e.g. local homologation);
            // the webhook registered in the panel still delivers those events.
            ...(config.PUBLIC_API_URL.startsWith('https://')
              ? { notification_url: config.PUBLIC_API_URL + '/api/v1/webhooks/mercado-pago' }
              : {}),
            payment_method_id: input.method === 'pix' ? 'pix' : card!.paymentMethodId,
            payer: {
              email: input.email,
              ...(card?.payer.identification ? { identification: card.payer.identification } : {}),
            },
            ...(input.method === 'pix'
              ? { date_of_expiration: new Date(Date.now() + 1800000).toISOString() }
              : {
                  token: card!.token,
                  three_d_secure_mode: 'optional',
                  installments: card!.installments,
                  ...(card!.issuerId ? { issuer_id: card!.issuerId } : {}),
                }),
          },
          input.key,
        ),
      );
    },
    async get(id: string): Promise<PaymentResult> {
      if (mock) throw new ProviderError('Mercado Pago', 'MOCK_RESOURCE_REQUIRES_DATABASE');
      return parse(await request('/v1/payments/' + encodeURIComponent(id)));
    },
    async search(reference: string): Promise<PaymentResult[]> {
      if (mock) return [];
      const result = z
        .object({ results: z.array(z.unknown()) })
        .parse(
          await request(
            '/v1/payments/search?' +
              new URLSearchParams({ external_reference: reference, limit: '10' }),
          ),
        );
      return result.results.map(parse).filter((p) => p.reference === reference);
    },
    async cancel(id: string, key: string): Promise<PaymentResult> {
      if (mock) throw new ProviderError('Mercado Pago', 'MOCK_RESOURCE_REQUIRES_DATABASE');
      return parse(
        await request(
          '/v1/payments/' + encodeURIComponent(id),
          { status: 'cancelled' },
          key,
          'PUT',
        ),
      );
    },
    async invoices(preapprovalId: string) {
      if (mock) return [];
      const result = z
        .object({ results: z.array(z.object({ id: z.union([z.string(), z.number()]) })) })
        .parse(
          await request(
            '/authorized_payments/search?' +
              new URLSearchParams({
                preapproval_id: preapprovalId,
                limit: '20',
                sort: 'date_created:desc',
              }),
          ),
        );
      return result.results.map((v) => String(v.id));
    },
    async refund(id: string, amountCents: number, key: string) {
      if (mock)
        return {
          id: 'mock-refund-' + createHash('sha256').update(key).digest('hex').slice(0, 20),
          status: 'approved',
        };
      return z
        .object({ id: z.union([z.string(), z.number()]), status: z.string().optional() })
        .parse(
          await request(
            '/v1/payments/' + encodeURIComponent(id) + '/refunds',
            { amount: amountCents / 100 },
            key,
          ),
        );
    },
    async authorize(input: {
      id: string;
      key: string;
      amountCents: number;
      email: string;
      card: PaymentToken;
    }) {
      if (!input.card.token) throw new ProviderError('Mercado Pago', 'CARD_TOKEN_REQUIRED', 422);
      if (mock) return { id: 'mock-sub-' + input.id, status: 'authorized' };
      return z.object({ id: z.string(), status: z.string() }).parse(
        await request(
          '/preapproval',
          {
            reason: 'Clube Mãos em Oração',
            external_reference: input.id,
            payer_email: input.email,
            card_token_id: input.card.token,
            status: 'authorized',
            auto_recurring: {
              frequency: 1,
              frequency_type: 'months',
              transaction_amount: input.amountCents / 100,
              currency_id: 'BRL',
            },
            back_url: config.PUBLIC_WEB_URL + '/conta/assinatura',
          },
          input.key,
        ),
      );
    },
    async subscription(id: string) {
      if (mock)
        return {
          id,
          status: 'authorized',
          external_reference: id.replace(/^mock-sub-/, ''),
          next_payment_date: undefined as string | undefined,
        };
      return z
        .object({
          id: z.string(),
          status: z.string(),
          external_reference: z.string().optional(),
          payer_email: z.string().optional(),
          next_payment_date: z.string().nullable().optional(),
        })
        .parse(await request('/preapproval/' + encodeURIComponent(id)));
    },
    async authorizedPayment(id: string) {
      if (mock) throw new ProviderError('Mercado Pago', 'MOCK_RESOURCE_REQUIRES_DATABASE');
      return z
        .object({
          id: z.union([z.string(), z.number()]),
          preapproval_id: z.string(),
          payment: z.object({ id: z.union([z.string(), z.number()]) }).optional(),
          date_created: z.string().optional(),
        })
        .parse(await request('/authorized_payments/' + encodeURIComponent(id)));
    },
    async updateSubscription(
      id: string,
      status: 'paused' | 'authorized' | 'cancelled',
      key: string,
    ) {
      if (mock) return { id, status };
      return z
        .object({ id: z.string(), status: z.string() })
        .parse(await request('/preapproval/' + encodeURIComponent(id), { status }, key, 'PUT'));
    },
    verifyWebhook(input: { signature: string; requestId: string; dataId: string; now?: number }) {
      configured('Mercado Pago', config.MP_WEBHOOK_SECRET);
      const fields = Object.fromEntries(input.signature.split(',').map((v) => v.trim().split('='))),
        ts = fields.ts,
        v1 = fields.v1;
      if (
        !ts ||
        !/^\d+$/.test(ts) ||
        !v1 ||
        !/^[a-f0-9]{64}$/i.test(v1) ||
        !input.requestId ||
        !input.dataId
      )
        throw new ProviderError('Mercado Pago', 'INVALID_SIGNATURE', 401);
      const stamp = Number(ts) * (ts.length <= 10 ? 1000 : 1);
      if (Math.abs((input.now ?? Date.now()) - stamp) > 300000)
        throw new ProviderError('Mercado Pago', 'STALE_SIGNATURE', 401);
      const expected = createHmac('sha256', config.MP_WEBHOOK_SECRET!)
        .update(`id:${input.dataId.toLowerCase()};request-id:${input.requestId};ts:${ts};`)
        .digest();
      const actual = Buffer.from(v1, 'hex');
      if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
        throw new ProviderError('Mercado Pago', 'INVALID_SIGNATURE', 401);
    },
  };
}

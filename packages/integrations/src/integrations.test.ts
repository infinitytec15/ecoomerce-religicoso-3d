// @vitest-environment node
import { createHmac } from 'node:crypto';
import { describe, it, expect, vi } from 'vitest';
import { createPayments, createShipping, createMedia, providerJson, toCents } from './index';
const config = {
  INTEGRATIONS_MODE: 'live' as const,
  PAYMENTS_ENABLED: 'true' as const,
  MP_ACCESS_TOKEN: 'TEST-private-key',
  MP_WEBHOOK_SECRET: 'test-signature-secret',
  PUBLIC_API_URL: 'https://api.example.test',
  PUBLIC_WEB_URL: 'https://loja.example.test',
};
const payment = {
  id: 42,
  status: 'approved',
  transaction_amount: 29.9,
  currency_id: 'BRL',
  external_reference: 'part-one',
  date_last_updated: '2026-11-10T12:00:00Z',
};
describe('Mercado Pago por contrato HTTP', () => {
  it('encaminha o desafio 3DS do emissor e habilita autenticação na cobrança', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
        Response.json({
          ...payment,
          status: 'pending',
          status_detail: 'pending_challenge',
          three_ds_info: {
            external_resource_url: 'https://acs.example.test/challenge',
            creq: 'issuer-request',
          },
        }),
      ),
      service = createPayments(config, fetcher);
    const result = await service.create({
      id: 'part-one',
      key: 'challenge-key',
      amountCents: 2990,
      method: 'card',
      email: 'cliente@example.test',
      description: 'Pedido',
      card: {
        token: 'transient-token',
        paymentMethodId: 'visa',
        installments: 1,
        payer: { email: 'cliente@example.test' },
      },
    });
    expect(result.action).toEqual({
      type: 'challenge',
      paymentId: '42',
      externalResourceUrl: 'https://acs.example.test/challenge',
      creq: 'issuer-request',
    });
    expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body))).toHaveProperty(
      'three_d_secure_mode',
      'optional',
    );
  });

  it('envia token transitório, referência e chave idempotente sem PAN', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(payment)),
      p = createPayments(config, fetcher),
      result = await p.create({
        id: 'part-one',
        key: 'stable-key',
        amountCents: 2990,
        method: 'card',
        email: 'cliente@example.test',
        description: 'Pedido de teste',
        card: {
          token: 'transient-token',
          paymentMethodId: 'visa',
          installments: 2,
          payer: { email: 'cliente@example.test' },
        },
      });
    const [url, request] = fetcher.mock.calls[0];
    expect(url).toBe('https://api.mercadopago.com/v1/payments');
    expect(request?.headers).toMatchObject({ 'X-Idempotency-Key': 'stable-key' });
    const body = JSON.parse(String(request?.body));
    expect(body).toMatchObject({
      transaction_amount: 29.9,
      external_reference: 'part-one',
      token: 'transient-token',
      installments: 2,
    });
    expect(body).not.toHaveProperty('card_number');
    expect(body.notification_url).toBe('https://api.example.test/api/v1/webhooks/mercado-pago');
    expect(result.amountCents).toBe(2990);
  });
  it('omite notification_url fora de HTTPS, que o Mercado Pago recusa', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(payment));
    await createPayments({ ...config, PUBLIC_API_URL: 'http://127.0.0.1:4000' }, fetcher).create({
      id: 'part-one',
      key: 'local-key',
      amountCents: 2990,
      method: 'pix',
      email: 'cliente@example.test',
      description: 'Pedido local',
    });
    expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body))).not.toHaveProperty(
      'notification_url',
    );
  });
  it('Pix devolve código, imagem e vencimento reais do provedor', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        ...payment,
        status: 'pending',
        date_of_expiration: '2026-11-10T12:30:00Z',
        point_of_interaction: {
          transaction_data: { qr_code: 'pix-provider-code', qr_code_base64: 'abc' },
        },
      }),
    );
    const result = await createPayments(config, fetcher).create({
      id: 'part-one',
      key: 'stable',
      amountCents: 2990,
      method: 'pix',
      email: 'cliente@example.test',
      description: 'Pedido',
    });
    expect(result.action).toEqual({
      type: 'pix',
      qrCode: 'data:image/png;base64,abc',
      copyPaste: 'pix-provider-code',
      expiresAt: '2026-11-10T12:30:00Z',
    });
  });
  it('assinatura autorizada não é tratada como mensalidade recebida', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ id: 'preapproval-one', status: 'authorized' }));
    const result = await createPayments(config, fetcher).authorize({
      id: 'subscription-one',
      key: 'subscription-key',
      amountCents: 12990,
      email: 'cliente@example.test',
      card: {
        token: 'ephemeral',
        paymentMethodId: 'visa',
        installments: 1,
        payer: { email: 'cliente@example.test' },
      },
    });
    const body = JSON.parse(String(fetcher.mock.calls[0][1]?.body));
    expect(body).toMatchObject({
      auto_recurring: {
        frequency: 1,
        frequency_type: 'months',
        transaction_amount: 129.9,
        currency_id: 'BRL',
      },
      card_token_id: 'ephemeral',
    });
    expect(result).toEqual({ id: 'preapproval-one', status: 'authorized' });
  });
  it('valida assinatura, recurso e janela de replay', () => {
    const p = createPayments(config),
      ts = '1794312000',
      now = Number(ts) * 1000,
      signature = createHmac('sha256', config.MP_WEBHOOK_SECRET)
        .update(`id:abc;request-id:request-one;ts:${ts};`)
        .digest('hex');
    expect(() =>
      p.verifyWebhook({
        signature: `ts=${ts},v1=${signature}`,
        requestId: 'request-one',
        dataId: 'ABC',
        now,
      }),
    ).not.toThrow();
    expect(() =>
      p.verifyWebhook({
        signature: `ts=${ts},v1=${signature}`,
        requestId: 'changed',
        dataId: 'ABC',
        now,
      }),
    ).toThrow();
    expect(() =>
      p.verifyWebhook({
        signature: `ts=${ts},v1=${signature}`,
        requestId: 'request-one',
        dataId: 'ABC',
        now: now + 600000,
      }),
    ).toThrow();
  });
  it('não usa mock quando o live está sem configuração', async () => {
    const fetcher = vi.fn<typeof fetch>();
    await expect(
      createPayments({ ...config, MP_ACCESS_TOKEN: undefined }, fetcher).get('42'),
    ).rejects.toMatchObject({ code: 'NOT_CONFIGURED' });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
describe('Melhor Envio', () => {
  it('pede somente escopos OAuth existentes no Melhor Envio', () => {
    const url = new URL(
      createShipping({
        INTEGRATIONS_MODE: 'live',
        ME_CLIENT_ID: '1',
        ME_REDIRECT_URI: 'https://api.example.test/api/v1/integrations/melhor-envio/callback',
        ME_SANDBOX: 'false',
        EMAIL_REPLY_TO: 'ajuda@example.test',
      }).authorizationUrl('state-value'),
    );
    // An unknown scope (e.g. shipping-services) makes Melhor Envio reject the whole
    // authorization with error=invalid_scope before the owner can approve it.
    expect(url.searchParams.get('scope')?.split(' ').sort()).toEqual(
      [
        'cart-read',
        'cart-write',
        'shipping-calculate',
        'shipping-cancel',
        'shipping-checkout',
        'shipping-companies',
        'shipping-generate',
        'shipping-preview',
        'shipping-print',
        'shipping-tracking',
      ].sort(),
    );
  });
  it('converte gramas/centavos, conserva opções válidas e usa campos custom', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json([
        {
          id: 1,
          name: 'PAC',
          price: '20.00',
          custom_price: '18.90',
          delivery_time: 7,
          custom_delivery_time: 5,
          company: { name: 'Correios' },
          packages: [{ weight: 0.3, height: 10, width: 10, length: 10 }],
        },
        { id: 2, error: 'indisponível' },
      ]),
    );
    const service = createShipping(
        {
          INTEGRATIONS_MODE: 'live',
          ME_ACCESS_TOKEN: 'secret',
          ME_SANDBOX: 'true',
          EMAIL_REPLY_TO: 'ajuda@example.test',
        },
        fetcher,
      ),
      quotes = await service.quotes({
        originCep: '01001-000',
        cep: '20000-000',
        products: [
          {
            id: 'piece',
            quantity: 2,
            weightGrams: 300,
            widthCm: 10,
            heightCm: 10,
            lengthCm: 10,
            insuranceCents: 6990,
          },
        ],
      });
    expect(quotes).toHaveLength(1);
    expect(quotes[0]).toMatchObject({ cents: 1890, days: 5, serviceId: '1' });
    expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body)).products[0]).toMatchObject({
      weight: 0.3,
      insurance_value: 69.9,
      quantity: 2,
    });
  });
  it('mantém compra, geração e impressão em chamadas distintas', async () => {
    const fetcher = vi
        .fn<typeof fetch>()
        .mockImplementation(async (url) =>
          Response.json(
            String(url).endsWith('/print') ? { url: 'https://labels.example.test/one' } : {},
          ),
        ),
      service = createShipping(
        {
          INTEGRATIONS_MODE: 'live',
          ME_ACCESS_TOKEN: 'secret',
          ME_SANDBOX: 'true',
          EMAIL_REPLY_TO: 'ajuda@example.test',
        },
        fetcher,
      );
    await service.checkout('shipment');
    await service.generate('shipment');
    await service.label('shipment');
    expect(fetcher.mock.calls.map((c) => String(c[0]).split('/').at(-1))).toEqual([
      'checkout',
      'generate',
      'print',
    ]);
  });
});
describe('Bunny e transporte', () => {
  it('assina TUS sem devolver a chave da biblioteca', async () => {
    const key = 'bunny-private-secret',
      fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValue(Response.json({ guid: '65664c96-a2f0-47d4-a4e1-6d8483fd30b9' })),
      service = createMedia(
        {
          INTEGRATIONS_MODE: 'live',
          BUNNY_STORAGE_HOST: 'storage.bunnycdn.com',
          BUNNY_STREAM_LIBRARY_ID: '123',
          BUNNY_STREAM_API_KEY: key,
        },
        fetcher,
      ),
      result = await service.createVideo('Produto');
    expect(result.url).toBe('https://video.bunnycdn.com/tusupload');
    expect(Object.keys(result.headers)).toEqual([
      'AuthorizationSignature',
      'AuthorizationExpire',
      'LibraryId',
      'VideoId',
    ]);
    expect(JSON.stringify(result)).not.toContain(key);
    expect(Number(result.headers.AuthorizationExpire)).toBeGreaterThan(Date.now() / 1000);
  });
  it('rejeita traversal e webhook adulterado', async () => {
    const service = createMedia({
      INTEGRATIONS_MODE: 'live',
      BUNNY_STORAGE_HOST: 'storage.bunnycdn.com',
      BUNNY_STORAGE_ZONE: 'zone',
      BUNNY_STORAGE_PASSWORD: 'secret',
      BUNNY_STREAM_READ_KEY: 'read-secret',
    });
    await expect(
      service.put('../outside', new Uint8Array([1]), 'image/webp'),
    ).rejects.toMatchObject({ code: 'INVALID_KEY' });
    const raw = '{"VideoGuid":"one"}',
      signature = createHmac('sha256', 'read-secret').update(raw).digest('hex');
    expect(() => service.verifyWebhook(raw, signature)).not.toThrow();
    expect(() => service.verifyWebhook(raw + ' ', signature)).toThrow();
  });
  it('limita respostas e não expõe o corpo de erro do provedor', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('private-token-in-provider-error', { status: 500 }));
    await expect(
      providerJson('Test', 'https://provider.example', {}, fetcher),
    ).rejects.toMatchObject({ code: 'HTTP_500', unknown: true });
    expect(toCents('18.90')).toBe(1890);
    expect(() => toCents(-1)).toThrow();
  });
});

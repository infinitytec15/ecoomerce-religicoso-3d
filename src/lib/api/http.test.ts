import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { HttpClient, HttpGateway } from './http';
import { ApiError } from './contracts';
import { demoAddress } from '@/lib/domain/schemas';
const response = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
describe('HTTP boundary', () => {
  it('calls the browser fetch API with its global receiver', async () => {
    const original = globalThis.fetch;
    globalThis.fetch = function (this: typeof globalThis) {
      expect(this).toBe(globalThis);
      return Promise.resolve(response({ data: { message: 'OK' } }));
    };
    try {
      expect(
        await new HttpClient('/api').request('health', z.object({ message: z.string() })),
      ).toEqual({ message: 'OK' });
    } finally {
      globalThis.fetch = original;
    }
  });
  it('turns connection failures into a recoverable service error', async () => {
    const client = new HttpClient(
      '/api',
      vi.fn<typeof fetch>().mockRejectedValue(new TypeError('Failed to fetch')),
    );
    await expect(client.request('auth/session', z.unknown())).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
      status: 503,
    });
  });
  it('sends cookie credentials and validates typed response envelopes', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response({ data: { message: 'OK' } }));
    const client = new HttpClient('/api/v1', fetcher);
    expect(await client.request('health', z.object({ message: z.string() }))).toEqual({
      message: 'OK',
    });
    expect(fetcher.mock.calls[0][0]).toBe('/api/v1/health');
    expect(fetcher.mock.calls[0][1]?.credentials).toBe('include');
  });
  it('rejects successful responses that violate the contract', async () => {
    const client = new HttpClient(
      '/api',
      vi.fn<typeof fetch>().mockResolvedValue(response({ data: { total: 'wrong' } })),
    );
    await expect(client.request('orders', z.object({ total: z.number() }))).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
      status: 502,
    });
  });
  it('preserves useful service errors and field details', async () => {
    const client = new HttpClient(
      '/api',
      vi.fn<typeof fetch>().mockResolvedValue(
        response(
          {
            error: {
              code: 'OUT_OF_STOCK',
              message: 'Peça indisponível.',
              details: { quantity: 'Revise a quantidade.' },
            },
          },
          409,
        ),
      ),
    );
    await expect(client.request('orders', z.unknown())).rejects.toMatchObject({
      code: 'OUT_OF_STOCK',
      status: 409,
      details: { quantity: 'Revise a quantidade.' },
    });
  });
  it('adds the same idempotency key to checkout headers and body', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      response({
        data: {
          orderId: 'order-1',
          paymentAction: { type: 'redirect', url: 'https://checkout.example.com/pay' },
        },
      }),
    );
    const g = new HttpGateway(new HttpClient('/api/v1', fetcher)),
      key = crypto.randomUUID();
    await g.checkout({
      items: [
        { productId: 'cruz-essencial', quantity: 1, color: 'Marfim', sizeIndex: 0, dedication: '' },
      ],
      address: demoAddress,
      shipping: 'standard',
      coupon: '',
      payment: 'split',
      pixCents: 5000,
      installments: 2,
      consent: true,
      idempotencyKey: key,
    });
    const options = fetcher.mock.calls[0][1]!;
    expect(new Headers(options.headers).get('Idempotency-Key')).toBe(key);
    expect(JSON.parse(options.body as string).idempotencyKey).toBe(key);
  });
  it('treats an expired authentication cookie as a logged out session', async () => {
    const g = new HttpGateway(
      new HttpClient(
        '/api',
        vi
          .fn<typeof fetch>()
          .mockResolvedValue(
            response({ error: { code: 'UNAUTHENTICATED', message: 'Entre novamente.' } }, 401),
          ),
      ),
    );
    expect(await g.session()).toBeNull();
  });
  it('never provides a frontend confirmation button for real payments', async () => {
    await expect(new HttpGateway().confirmDemoPayment()).rejects.toBeInstanceOf(ApiError);
    await expect(new HttpGateway().confirmDemoPayment()).rejects.toMatchObject({
      code: 'DEMO_ONLY',
      status: 403,
    });
  });
  it('rejects non-HTTPS payment redirects', async () => {
    const g = new HttpGateway(
      new HttpClient(
        '/api',
        vi.fn<typeof fetch>().mockResolvedValue(
          response({
            data: {
              orderId: '1',
              paymentAction: { type: 'redirect', url: 'javascript:alert(1)' },
            },
          }),
        ),
      ),
    );
    await expect(g.payment('1')).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });
});

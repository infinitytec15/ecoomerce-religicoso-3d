import { createHash } from 'node:crypto';
import { describe, it, expect, vi } from 'vitest';
import { metaUserData, normalizePhone, sendMetaPurchase } from './meta';

const sha = (v: string) => createHash('sha256').update(v).digest('hex');
const config = { META_PIXEL_ID: '2024262518270324', META_CAPI_TOKEN: 'token-'.padEnd(30, 'x') };
const purchase = {
  eventId: 'order-1',
  eventTime: new Date('2026-11-25T12:00:00Z'),
  sourceUrl: 'https://maosemoracao.com.br/checkout',
  valueCents: 4990,
  contentIds: ['peca-1'],
  numItems: 1,
  customer: { email: ' Maria@Example.com ', phone: '(41) 99151-7346', firstName: 'Maria' },
};

describe('Meta Conversions API', () => {
  it('adds the Brazilian country code to phones once', () => {
    expect(normalizePhone('(41) 99151-7346')).toBe('5541991517346');
    expect(normalizePhone('+55 41 99151-7346')).toBe('5541991517346');
  });

  it('hashes normalized customer data and keeps browser ids in clear', () => {
    const data = metaUserData({
      email: ' Maria@Example.com ',
      city: 'São José dos Pinhais',
      zip: '80050-370',
      fbp: 'fb.1.1.2',
    });
    expect(data.em).toEqual([sha('maria@example.com')]);
    expect(data.ct).toEqual([sha('saojosedospinhais')]);
    expect(data.zp).toEqual([sha('80050370')]);
    expect(data.country).toEqual([sha('br')]);
    expect(data.fbp).toBe('fb.1.1.2');
    expect(data).not.toHaveProperty('ph');
  });

  it('does nothing without a token', async () => {
    const fetcher = vi.fn();
    await expect(
      sendMetaPurchase({ META_PIXEL_ID: '2024262518270324' }, purchase, fetcher),
    ).resolves.toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('sends one Purchase with the order id as event id and the token outside the URL', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ events_received: 1 })));
    await expect(sendMetaPurchase(config, purchase, fetcher)).resolves.toBe(true);
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://graph.facebook.com/v21.0/2024262518270324/events');
    const body = JSON.parse(String(init.body));
    expect(body.access_token).toBe(config.META_CAPI_TOKEN);
    expect(body.data[0]).toMatchObject({
      event_name: 'Purchase',
      event_id: 'order-1',
      action_source: 'website',
      custom_data: { currency: 'BRL', value: 49.9, order_id: 'order-1' },
    });
  });
});

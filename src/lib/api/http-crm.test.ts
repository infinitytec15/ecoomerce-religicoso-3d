import { describe, it, expect, vi } from 'vitest';
import { HttpClient, HttpGateway } from './http';
const response = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
type Fetcher = ReturnType<typeof vi.fn<typeof fetch>>;
const gateway = (fetcher: Fetcher) => new HttpGateway(new HttpClient('/api/v1', fetcher));
const body = (fetcher: Fetcher) => JSON.parse(String(fetcher.mock.calls[0][1]?.body));
describe('CRM gateway (HTTP)', () => {
  it('reads the marketing status and validates it', async () => {
    const data = { subscribed: true, text: 'Quero receber', version: '2026-11-14' };
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response({ data }));
    expect(await gateway(fetcher).marketingStatus()).toEqual(data);
    expect(fetcher.mock.calls[0][0]).toBe('/api/v1/account/marketing');
    const bad = vi.fn<typeof fetch>().mockResolvedValue(response({ data: { subscribed: 'sim' } }));
    await expect(gateway(bad).marketingStatus()).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    });
  });
  it('sends the marketing choice with PUT', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }));
    await gateway(fetcher).setMarketing(false);
    expect(fetcher.mock.calls[0][0]).toBe('/api/v1/account/marketing');
    expect(fetcher.mock.calls[0][1]).toMatchObject({ method: 'PUT' });
    expect(body(fetcher)).toEqual({ subscribed: false });
  });
  it('unsubscribes with the token and the optional campaign', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }));
    await gateway(fetcher).marketingUnsubscribe({ token: 't'.repeat(30), campaignId: 'c1' });
    expect(fetcher.mock.calls[0][0]).toBe('/api/v1/marketing/unsubscribe');
    expect(fetcher.mock.calls[0][1]).toMatchObject({ method: 'POST' });
    expect(body(fetcher)).toEqual({ token: 't'.repeat(30), campaignId: 'c1' });
  });
  it('previews a segment with POST', async () => {
    const data = { total: 3, consent: 2, legitimateInterest: 1 };
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response({ data }));
    const segment = { rules: [{ type: 'tag' as const, tag: 'Paróquia' }] };
    expect(await gateway(fetcher).crmPreview(segment)).toEqual(data);
    expect(fetcher.mock.calls[0][0]).toBe('/api/v1/admin/crm/preview');
    expect(fetcher.mock.calls[0][1]).toMatchObject({ method: 'POST' });
    expect(body(fetcher)).toEqual({ segment });
  });
  it('lists contacts with the filters in the query string', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response({ data: { items: [] } }));
    expect(
      await gateway(fetcher).crmContacts({ q: 'ana', tag: 'Paróquia', cursor: 'abc' }),
    ).toEqual({ items: [] });
    const url = new URL(String(fetcher.mock.calls[0][0]), 'http://x');
    expect(url.pathname).toBe('/api/v1/admin/crm/contacts');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      q: 'ana',
      tag: 'Paróquia',
      cursor: 'abc',
    });
    const plain = vi.fn<typeof fetch>().mockResolvedValue(response({ data: { items: [] } }));
    await gateway(plain).crmContacts();
    expect(plain.mock.calls[0][0]).toBe('/api/v1/admin/crm/contacts');
  });
  it('imports one chunk and returns the counts', async () => {
    const data = { created: 1, updated: 0, keptUnsubscribed: 0 };
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response({ data }));
    const input = {
      tag: 'Paróquia',
      consent: true as const,
      rows: [{ email: 'a@exemplo.com', name: 'A' }],
    };
    expect(await gateway(fetcher).crmImport(input)).toEqual(data);
    expect(fetcher.mock.calls[0][0]).toBe('/api/v1/admin/crm/contacts/import');
    expect(body(fetcher)).toEqual(input);
  });
  it('forwards marketingOptIn on login', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response({ data: null }));
    await gateway(fetcher)
      .login({
        email: 'a@exemplo.com',
        password: 'senha-1234',
        kind: 'customer',
        register: true,
        marketingOptIn: true,
      })
      .catch(() => undefined);
    expect(body(fetcher).marketingOptIn).toBe(true);
  });
});

// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { revalidateTag } from 'next/cache';
import { GET, POST } from './[[...key]]/route';
vi.mock('next/cache', () => ({ revalidateTag: vi.fn() }));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.mocked(revalidateTag).mockClear();
});
const KEY = 'meo_mcp_' + 'a'.repeat(43);
const context = (key?: string) => ({ params: Promise.resolve(key ? { key: [key] } : {}) });
const rpc = (method: string) =>
  JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method,
    params: method === 'tools/call' ? {} : undefined,
  });
const request = (body: string, headers: Record<string, string> = {}) =>
  new NextRequest('https://loja.example/api/mcp', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body,
  });

describe('public MCP endpoint', () => {
  it('turns the key in the URL into a Bearer header and adds the gateway secret', async () => {
    vi.stubEnv('API_BASE_URL', 'https://api.example.com/api/v1');
    vi.stubEnv('BFF_SHARED_SECRET', 's'.repeat(40));
    const fetcher = vi
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response('{"jsonrpc":"2.0","id":1,"result":{}}'));
    const response = await POST(request(rpc('tools/list')), context(KEY));
    expect(response.status).toBe(200);
    expect(fetcher.mock.calls[0][0]).toBe('https://api.example.com/api/v1/mcp');
    const headers = new Headers(fetcher.mock.calls[0][1]?.headers);
    expect(headers.get('authorization')).toBe('Bearer ' + KEY);
    expect(headers.get('x-bff-secret')).toBe('s'.repeat(40));
    expect(headers.get('origin')).toBeNull();
    expect(revalidateTag).not.toHaveBeenCalled();
  });
  it('relays the Authorization header when the key is not in the URL', async () => {
    vi.stubEnv('API_BASE_URL', 'https://api.example.com/api/v1');
    const fetcher = vi.spyOn(global, 'fetch').mockResolvedValue(new Response('{}'));
    await POST(request(rpc('tools/list'), { authorization: 'Bearer ' + KEY }), context());
    expect(new Headers(fetcher.mock.calls[0][1]?.headers).get('authorization')).toBe(
      'Bearer ' + KEY,
    );
  });
  it('asks for a key before reaching the API', async () => {
    vi.stubEnv('API_BASE_URL', 'https://api.example.com/api/v1');
    const fetcher = vi.spyOn(global, 'fetch');
    const response = await POST(request(rpc('tools/list')), context());
    expect(response.status).toBe(401);
    expect(response.headers.get('www-authenticate')).toContain('Bearer');
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('rejects malformed key paths', async () => {
    vi.stubEnv('API_BASE_URL', 'https://api.example.com/api/v1');
    const fetcher = vi.spyOn(global, 'fetch');
    expect((await POST(request(rpc('tools/list')), context('../admin'))).status).toBe(404);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('refreshes the storefront cache after a successful tool call', async () => {
    vi.stubEnv('API_BASE_URL', 'https://api.example.com/api/v1');
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response('{}'));
    await POST(request(rpc('tools/call')), context(KEY));
    expect(revalidateTag).toHaveBeenCalledWith('catalog', { expire: 0 });
  });
  it('enforces the payload limit', async () => {
    vi.stubEnv('API_BASE_URL', 'https://api.example.com/api/v1');
    const response = await POST(request('x'.repeat(262145)), context(KEY));
    expect(response.status).toBe(413);
  });
  it('answers 405 to GET: the server never streams', async () => {
    const response = GET();
    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('POST');
  });
});

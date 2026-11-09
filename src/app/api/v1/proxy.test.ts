// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, POST } from './[...path]/route';
afterEach(() => vi.unstubAllEnvs());
const context = (path: string) => ({ params: Promise.resolve({ path: path.split('/') }) });
describe('same-origin backend proxy', () => {
  it('rejects paths outside the published contract', async () => {
    const response = await GET(
      new NextRequest('http://localhost/api/v1/private/secrets'),
      context('private/secrets'),
    );
    expect(response.status).toBe(404);
  });
  it('fails closed when no backend is configured', async () => {
    vi.stubEnv('API_BASE_URL', '');
    const response = await GET(
      new NextRequest('http://localhost/api/v1/auth/session'),
      context('auth/session'),
    );
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe('BACKEND_NOT_CONFIGURED');
  });
  it('blocks cross-origin mutations before reaching the upstream', async () => {
    vi.stubEnv('API_BASE_URL', 'https://api.example.com/api/v1');
    const upstream = vi.spyOn(global, 'fetch');
    const response = await POST(
      new NextRequest('http://localhost/api/v1/orders', {
        method: 'POST',
        headers: { origin: 'https://evil.example.com' },
        body: '{}',
      }),
      context('orders'),
    );
    expect(response.status).toBe(403);
    expect(upstream).not.toHaveBeenCalled();
  });
  it('forwards cookies and idempotency without caching a private response', async () => {
    vi.stubEnv('API_BASE_URL', 'https://api.example.com/api/v1');
    const fetcher = vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response('{"data":null}', {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Set-Cookie': 'session=test; Path=/; HttpOnly; Secure; SameSite=Lax',
        },
      }),
    );
    const request = new NextRequest('http://localhost/api/v1/auth/login', {
        method: 'POST',
        headers: {
          origin: 'http://localhost',
          cookie: 'session=old',
          'Content-Type': 'application/json',
          'Idempotency-Key': 'key-1',
        },
        body: '{}',
      }),
      response = await POST(request, context('auth/login'));
    expect(fetcher.mock.calls[0][0]).toBe('https://api.example.com/api/v1/auth/login');
    const forwarded = fetcher.mock.calls[0][1]!;
    expect(new Headers(forwarded.headers).get('cookie')).toBe('session=old');
    expect(new Headers(forwarded.headers).get('idempotency-key')).toBe('key-1');
    expect(forwarded.cache).toBe('no-store');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('set-cookie')).toContain('HttpOnly');
  });
  it('enforces the mutation payload limit', async () => {
    vi.stubEnv('API_BASE_URL', 'https://api.example.com/api/v1');
    const response = await POST(
      new NextRequest('http://localhost/api/v1/orders', {
        method: 'POST',
        headers: { origin: 'http://localhost' },
        body: 'x'.repeat(262145),
      }),
      context('orders'),
    );
    expect(response.status).toBe(413);
  });
});

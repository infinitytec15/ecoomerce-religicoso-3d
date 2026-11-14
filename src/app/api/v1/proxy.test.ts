// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, POST, PUT } from './[...path]/route';
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
  it('validates the canonical public origin behind a reverse proxy', async () => {
    vi.stubEnv('API_BASE_URL', 'http://api.railway.internal:4000/api/v1');
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://shop.example.com');
    const fetcher = vi.spyOn(global, 'fetch').mockResolvedValue(new Response('{}'));
    const response = await POST(
      new NextRequest('http://0.0.0.0:3000/api/v1/auth/login', {
        method: 'POST',
        headers: { origin: 'https://shop.example.com' },
        body: '{}',
      }),
      context('auth/login'),
    );
    expect(response.status).toBe(200);
    expect(fetcher).toHaveBeenCalledOnce();
    const rejected = await POST(
      new NextRequest('http://0.0.0.0:3000/api/v1/auth/login', {
        method: 'POST',
        headers: { origin: 'https://evil.example', 'x-forwarded-host': 'evil.example' },
        body: '{}',
      }),
      context('auth/login'),
    );
    expect(rejected.status).toBe(403);
  });
  it('forwards only the edge-appended client IP, never the spoofable chain', async () => {
    vi.stubEnv('API_BASE_URL', 'https://api.example.com/api/v1');
    const fetcher = vi.spyOn(global, 'fetch').mockResolvedValue(new Response('{}'));
    await POST(
      new NextRequest('http://localhost/api/v1/auth/login', {
        method: 'POST',
        headers: {
          origin: 'http://localhost',
          'x-forwarded-for': '6.6.6.6, 203.0.113.9',
        },
        body: '{}',
      }),
      context('auth/login'),
    );
    const headers = new Headers(fetcher.mock.calls[0][1]?.headers);
    expect(headers.get('x-meo-client-ip')).toBe('203.0.113.9');
    expect(headers.get('x-forwarded-for')).toBeNull();
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
  it('streams only the explicit media upload route and keeps the session cookie', async () => {
    vi.stubEnv('API_BASE_URL', 'https://api.example.com/api/v1');
    const fetcher = vi
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response(null, { status: 204 }));
    const request = new NextRequest('http://localhost/api/v1/admin/media/uploads/asset-1/content', {
      method: 'PUT',
      headers: {
        origin: 'http://localhost',
        cookie: 'session=staff',
        'content-length': '5',
        'content-type': 'model/stl',
      },
      body: 'solid',
    });
    const response = await PUT(request, context('admin/media/uploads/asset-1/content'));
    expect(response.status).toBe(204);
    expect(fetcher.mock.calls[0][0]).toBe(
      'https://api.example.com/api/v1/admin/media/uploads/asset-1/content',
    );
    expect(new Headers(fetcher.mock.calls[0][1]?.headers).get('cookie')).toBe('session=staff');
    expect(await new Response(fetcher.mock.calls[0][1]?.body).text()).toBe('solid');
  });
  it('rejects unknown PUT routes and oversized media before forwarding', async () => {
    vi.stubEnv('API_BASE_URL', 'https://api.example.com/api/v1');
    const fetcher = vi.spyOn(global, 'fetch');
    expect(
      (
        await PUT(
          new NextRequest('http://localhost/api/v1/orders', {
            method: 'PUT',
            headers: { origin: 'http://localhost' },
          }),
          context('orders'),
        )
      ).status,
    ).toBe(405);
    expect(
      (
        await PUT(
          new NextRequest('http://localhost/api/v1/admin/media/uploads/asset-1/content', {
            method: 'PUT',
            headers: { origin: 'http://localhost', 'content-length': String(33 * 1024 * 1024) },
          }),
          context('admin/media/uploads/asset-1/content'),
        )
      ).status,
    ).toBe(413);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('forwards review routes: the public list with its filter and the customer post', async () => {
    vi.stubEnv('API_BASE_URL', 'https://api.example.com/api/v1');
    const fetcher = vi
      .spyOn(global, 'fetch')
      .mockImplementation(async () => new Response('{"data":null}'));
    const list = await GET(
      new NextRequest('http://localhost/api/v1/catalog/products/prod-1/reviews?rating=5'),
      context('catalog/products/prod-1/reviews'),
    );
    expect(list.status).toBe(200);
    expect(fetcher.mock.calls[0][0]).toBe(
      'https://api.example.com/api/v1/catalog/products/prod-1/reviews?rating=5',
    );
    const post = await POST(
      new NextRequest('http://localhost/api/v1/reviews', {
        method: 'POST',
        headers: { origin: 'http://localhost', 'Content-Type': 'application/json' },
        body: '{}',
      }),
      context('reviews'),
    );
    expect(post.status).toBe(200);
    expect(fetcher.mock.calls[1][0]).toBe('https://api.example.com/api/v1/reviews');
    const optOut = await POST(
      new NextRequest('http://localhost/api/v1/reviews/opt-out', {
        method: 'POST',
        headers: { origin: 'http://localhost', 'Content-Type': 'application/json' },
        body: '{"token":"x"}',
      }),
      context('reviews/opt-out'),
    );
    expect(optOut.status).toBe(200);
    expect(fetcher.mock.calls[2][0]).toBe('https://api.example.com/api/v1/reviews/opt-out');
    const blocked = await GET(
      new NextRequest('http://localhost/api/v1/catalog/products/prod-1/reviews/extra'),
      context('catalog/products/prod-1/reviews/extra'),
    );
    expect(blocked.status).toBe(404);
  });
  it('forwards the public group-buy routes and nothing under them', async () => {
    vi.stubEnv('API_BASE_URL', 'https://api.example.com/api/v1');
    const fetcher = vi
      .spyOn(global, 'fetch')
      .mockImplementation(async () => new Response('{"data":null}'));
    const id = '6f0c1b5e-aaaa-4bbb-8ccc-123456789012';
    expect(
      (await GET(new NextRequest('http://localhost/api/v1/group-buys'), context('group-buys')))
        .status,
    ).toBe(200);
    expect(
      (
        await GET(
          new NextRequest('http://localhost/api/v1/group-buys/' + id),
          context('group-buys/' + id),
        )
      ).status,
    ).toBe(200);
    expect(fetcher.mock.calls.map((call) => call[0])).toEqual([
      'https://api.example.com/api/v1/group-buys',
      'https://api.example.com/api/v1/group-buys/' + id,
    ]);
    expect(
      (
        await GET(
          new NextRequest('http://localhost/api/v1/group-buys/' + id + '/orders'),
          context('group-buys/' + id + '/orders'),
        )
      ).status,
    ).toBe(404);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('lets only the review photo content route stream, capped at 8 MB', async () => {
    vi.stubEnv('API_BASE_URL', 'https://api.example.com/api/v1');
    const fetcher = vi
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response(null, { status: 204 }));
    const put = (path: string, length: number) =>
      PUT(
        new NextRequest('http://localhost/api/v1/' + path, {
          method: 'PUT',
          headers: { origin: 'http://localhost', 'content-length': String(length) },
          body: length ? 'x'.repeat(length) : undefined,
        }),
        context(path),
      );
    const ok = await put('reviews/uploads/6f0c1b5e-aaaa-4bbb-8ccc-123456789012/content', 5);
    expect(ok.status).toBe(204);
    expect(fetcher.mock.calls[0][0]).toBe(
      'https://api.example.com/api/v1/reviews/uploads/6f0c1b5e-aaaa-4bbb-8ccc-123456789012/content',
    );
    expect((await put('reviews/uploads/abc/content', 9 * 1024 * 1024)).status).toBe(413);
    expect((await put('reviews/uploads/abc/content', 0)).status).toBe(413);
    expect((await put('reviews', 5)).status).toBe(405);
    expect((await put('reviews/uploads/abc/complete', 5)).status).toBe(405);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

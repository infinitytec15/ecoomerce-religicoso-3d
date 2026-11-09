import { NextRequest, NextResponse } from 'next/server';
const routes =
  /^(catalog\/products(?:\/[a-zA-Z0-9_-]+)?|store\/settings|auth\/(session|login|logout|recover)|account(?:\/profile)?|orders(?:\/[a-zA-Z0-9_-]+\/payment)?|subscriptions(?:\/[a-zA-Z0-9_-]+)?|shipping\/quotes|support\/tickets(?:\/[a-zA-Z0-9_-]+\/messages)?|community\/prayers(?:\/[a-zA-Z0-9_-]+(?:\/reaction)?)?|newsletter(?:\/unsubscribe)?|admin\/(operations|commands))$/;
async function proxy(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params,
    pathname = path.join('/');
  if (!routes.test(pathname))
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Endpoint não encontrado.' } },
      { status: 404 },
    );
  const base = process.env.API_BASE_URL;
  if (!base)
    return NextResponse.json(
      {
        error: {
          code: 'BACKEND_NOT_CONFIGURED',
          message: 'Este serviço ainda não está disponível. Tente novamente mais tarde.',
        },
      },
      { status: 503 },
    );
  const mutation = !['GET', 'HEAD'].includes(request.method);
  if (mutation && request.headers.get('origin') !== request.nextUrl.origin)
    return NextResponse.json(
      { error: { code: 'INVALID_ORIGIN', message: 'Origem da solicitação não permitida.' } },
      { status: 403 },
    );
  const text = mutation ? await request.text() : undefined;
  if (text && new TextEncoder().encode(text).length > 262144)
    return NextResponse.json(
      { error: { code: 'PAYLOAD_TOO_LARGE', message: 'A solicitação excede o limite permitido.' } },
      { status: 413 },
    );
  try {
    const headers = new Headers({ Accept: 'application/json' });
    for (const name of ['cookie', 'content-type', 'idempotency-key', 'x-csrf-token']) {
      const value = request.headers.get(name);
      if (value) headers.set(name, value);
    }
    const upstream = await fetch(
      base.replace(/\/$/, '') + '/' + pathname + request.nextUrl.search,
      {
        method: request.method,
        headers,
        body: text,
        redirect: 'manual',
        cache: 'no-store',
        signal: AbortSignal.timeout(15000),
      },
    );
    const response = new NextResponse(upstream.body, {
      status: upstream.status,
      headers: {
        'Content-Type': upstream.headers.get('content-type') || 'application/json',
        'Cache-Control': 'no-store',
      },
    });
    for (const cookie of upstream.headers.getSetCookie())
      response.headers.append('set-cookie', cookie);
    return response;
  } catch {
    return NextResponse.json(
      {
        error: {
          code: 'BACKEND_UNAVAILABLE',
          message: 'O serviço está temporariamente indisponível. Tente novamente.',
        },
      },
      { status: 502 },
    );
  }
}
export const GET = proxy;
export const POST = proxy;
export const PATCH = proxy;
export const DELETE = proxy;

import { NextRequest, NextResponse } from 'next/server';
const routes =
  /^(checkout\/estimate|catalog\/products(?:\/[a-zA-Z0-9_-]+)?|store\/settings|auth\/(session|login|logout|recover|verify|reset|email-change|guest-order)|account(?:\/profile)?|orders(?:\/[a-zA-Z0-9_-]+\/payment)?|subscriptions(?:\/[a-zA-Z0-9_-]+)?|shipping\/quotes|support\/tickets(?:\/[a-zA-Z0-9_-]+\/messages)?|community\/prayers(?:\/[a-zA-Z0-9_-]+(?:\/(reaction|report))?)?|newsletter(?:\/(unsubscribe|confirm))?|team\/invitations\/[a-zA-Z0-9_-]+(?:\/accept)?|admin\/(operations|commands|overview|integrations|jobs|webhooks|reports\/[a-zA-Z0-9_-]+|exports(?:\/[a-zA-Z0-9_-]+(?:\/download)?)?|resources\/[a-zA-Z0-9_-]+|orders\/[a-zA-Z0-9_-]+\/(fiscal|shipment)|integrations\/melhor-envio\/authorize|media\/[a-zA-Z0-9_-]+\/(status|original)|media\/uploads(?:\/[a-zA-Z0-9_-]+\/(complete|content|renew))?))$/;
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
  const trustedOrigin = process.env.NEXT_PUBLIC_SITE_URL
    ? new URL(process.env.NEXT_PUBLIC_SITE_URL).origin
    : request.nextUrl.origin;
  if (mutation && request.headers.get('origin') !== trustedOrigin)
    return NextResponse.json(
      { error: { code: 'INVALID_ORIGIN', message: 'Origem da solicitação não permitida.' } },
      { status: 403 },
    );
  const binary =
    request.method === 'PUT' && /^admin\/media\/uploads\/[a-zA-Z0-9_-]+\/content$/.test(pathname);
  if (request.method === 'PUT' && !binary)
    return NextResponse.json(
      { error: { code: 'METHOD_NOT_ALLOWED', message: 'Método não permitido.' } },
      { status: 405 },
    );
  const length = Number(request.headers.get('content-length'));
  if (binary && (!length || length > 32 * 1024 * 1024))
    return NextResponse.json(
      {
        error: {
          code: 'PAYLOAD_TOO_LARGE',
          message: 'Arquivo acima do limite ou tamanho não informado.',
        },
      },
      { status: 413 },
    );
  let text: string | undefined;
  if (mutation && !binary && request.body) {
    const reader = request.body.getReader(),
      chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > 262144) {
        await reader.cancel();
        return NextResponse.json(
          {
            error: {
              code: 'PAYLOAD_TOO_LARGE',
              message: 'A solicitação excede o limite permitido.',
            },
          },
          { status: 413 },
        );
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    text = new TextDecoder().decode(bytes);
  }
  let streamed = 0;
  const binaryBody = binary
    ? request.body?.pipeThrough(
        new TransformStream<Uint8Array, Uint8Array>({
          transform(chunk, controller) {
            streamed += chunk.byteLength;
            if (streamed > 32 * 1024 * 1024 || streamed > length)
              throw new Error('Upload excedeu o tamanho declarado.');
            controller.enqueue(chunk);
          },
        }),
      )
    : undefined;
  try {
    const headers = new Headers({ Accept: 'application/json' });
    if (process.env.BFF_SHARED_SECRET) headers.set('x-bff-secret', process.env.BFF_SHARED_SECRET);
    const origin = request.headers.get('origin');
    if (origin) headers.set('origin', origin);
    const forwarded = request.headers.get('x-forwarded-for');
    if (forwarded) headers.set('x-forwarded-for', forwarded);
    for (const name of ['cookie', 'content-type', 'idempotency-key', 'x-csrf-token']) {
      const value = request.headers.get(name);
      if (value) headers.set(name, value);
    }
    const upstream = await fetch(
      base.replace(/\/$/, '') + '/' + pathname + request.nextUrl.search,
      {
        method: request.method,
        headers,
        body: binary ? binaryBody : text,
        ...(binary ? { duplex: 'half' } : {}),
        redirect: 'manual',
        cache: 'no-store',
        signal: AbortSignal.timeout(binary ? 120000 : 15000),
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
    const disposition = upstream.headers.get('content-disposition');
    if (disposition) response.headers.set('content-disposition', disposition);
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
export const PUT = proxy;

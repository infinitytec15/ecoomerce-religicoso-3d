import { NextResponse } from 'next/server';
export async function POST(request: Request) {
  const url = new URL(request.url),
    token = url.searchParams.get('token');
  if (!token || token.length > 2048) return new NextResponse(null, { status: 422 });
  const reader = request.body?.getReader();
  let total = 0,
    text = '';
  if (reader)
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > 4096) {
        await reader.cancel();
        return new NextResponse(null, { status: 413 });
      }
      text += new TextDecoder().decode(value);
    }
  if (new URLSearchParams(text).get('List-Unsubscribe') !== 'One-Click')
    return new NextResponse(null, { status: 422 });
  const base = process.env.API_BASE_URL;
  if (!base) return new NextResponse(null, { status: 503 });
  try {
    const response = await fetch(
      base.replace(/\/$/, '') + '/newsletter/one-click?token=' + encodeURIComponent(token),
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          ...(process.env.BFF_SHARED_SECRET
            ? { 'x-bff-secret': process.env.BFF_SHARED_SECRET }
            : {}),
        },
        body: 'List-Unsubscribe=One-Click',
        redirect: 'error',
        signal: AbortSignal.timeout(10000),
      },
    );
    return new NextResponse(null, {
      status: response.status,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch {
    return new NextResponse(null, { status: 503 });
  }
}

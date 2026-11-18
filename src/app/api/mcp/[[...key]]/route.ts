import { NextRequest, NextResponse } from 'next/server';
import { CLIENT_IP_HEADER, trustedForwardedIp } from '@maos-em-oracao/contracts';
import { expireCatalog } from '@/lib/api/catalog-cache';
/**
 * Public Model Context Protocol endpoint for Claude, ChatGPT and other MCP clients.
 *
 * - `POST /api/mcp` with `Authorization: Bearer <key>` (Claude Code, Claude Desktop, scripts);
 * - `POST /api/mcp/<key>` for connectors that only take a URL (ChatGPT, claude.ai).
 *
 * The key is created in Configurações › Integrações com IA and checked by the API, which this
 * route reaches through the same shared secret as the rest of the store.
 */
const KEY = /^meo_mcp_[A-Za-z0-9_-]{20,100}$/;
const MAX_BODY_BYTES = 262144;
const jsonRpcError = (status: number, message: string, headers?: HeadersInit) =>
  NextResponse.json(
    { jsonrpc: '2.0', error: { code: -32000, message }, id: null },
    {
      status,
      headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', ...headers },
    },
  );

async function readBody(request: NextRequest): Promise<string | null> {
  if (!request.body) return '';
  const reader = request.body.getReader(),
    chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

/** True when the JSON-RPC body (single or batch) calls a tool, which may change the catalog. */
function callsTool(body: string) {
  try {
    const parsed: unknown = JSON.parse(body);
    return (Array.isArray(parsed) ? parsed : [parsed]).some(
      (m) => (m as { method?: unknown } | null)?.method === 'tools/call',
    );
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ key?: string[] }> }) {
  const { key: segments } = await context.params;
  if (segments && (segments.length !== 1 || !KEY.test(segments[0])))
    return jsonRpcError(404, 'Endpoint MCP não encontrado.');
  const authorization = segments ? 'Bearer ' + segments[0] : request.headers.get('authorization');
  if (!authorization)
    return jsonRpcError(401, 'Informe a chave MCP gerada no painel.', {
      'WWW-Authenticate': 'Bearer realm="mcp"',
    });
  const base = process.env.API_BASE_URL;
  if (!base) return jsonRpcError(503, 'O servidor MCP ainda não está disponível.');
  const body = await readBody(request);
  if (body === null) return jsonRpcError(413, 'A solicitação excede o limite permitido.');
  const headers = new Headers({
    Authorization: authorization,
    'Content-Type': request.headers.get('content-type') || 'application/json',
    Accept: request.headers.get('accept') || 'application/json, text/event-stream',
  });
  if (process.env.BFF_SHARED_SECRET) headers.set('x-bff-secret', process.env.BFF_SHARED_SECRET);
  const protocol = request.headers.get('mcp-protocol-version');
  if (protocol) headers.set('mcp-protocol-version', protocol);
  const clientIp = trustedForwardedIp(request.headers.get('x-forwarded-for'));
  if (clientIp) headers.set(CLIENT_IP_HEADER, clientIp);
  try {
    const upstream = await fetch(base.replace(/\/$/, '') + '/mcp', {
      method: 'POST',
      headers,
      body,
      redirect: 'manual',
      cache: 'no-store',
      // Creating a product can download several photos before it answers.
      signal: AbortSignal.timeout(120000),
    });
    if (upstream.ok && callsTool(body)) expireCatalog();
    const response = new NextResponse(upstream.body, {
      status: upstream.status,
      headers: {
        'Content-Type': upstream.headers.get('content-type') || 'application/json',
        'Cache-Control': 'no-store',
        // The key may be in this URL: never pass it on in a Referer.
        'Referrer-Policy': 'no-referrer',
      },
    });
    const challenge = upstream.headers.get('www-authenticate');
    if (challenge) response.headers.set('WWW-Authenticate', challenge);
    return response;
  } catch {
    return jsonRpcError(502, 'O servidor MCP está temporariamente indisponível.');
  }
}

/** Stateless server: there is no server-initiated stream (GET) nor session to close (DELETE). */
function notAllowed() {
  return jsonRpcError(405, 'Use POST neste endpoint MCP.', { Allow: 'POST' });
}
export const GET = notAllowed;
export const DELETE = notAllowed;

import { lookup as dnsLookup, type LookupAddress } from 'node:dns';
import { get } from 'node:https';
import type { IncomingMessage } from 'node:http';
import { BlockList, isIP, type LookupFunction } from 'node:net';
import { DomainError } from '@maos-em-oracao/backend-core/shared';

const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const FETCH_TIMEOUT_MS = 20000;
const extensions: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/avif': '.avif',
};

/** Addresses a server-side fetch must never reach (loopback, private, link-local, metadata…). */
const internal = new BlockList();
for (const [net, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const)
  internal.addSubnet(net, prefix, 'ipv4');
for (const [net, prefix] of [
  // `::ffff:0:0/96` is left out on purpose: BlockList maps every IPv4 check into it, which would
  // block all public IPv4. Mapped addresses are decoded by mappedIpv4 instead.
  ['::', 96],
  ['64:ff9b::', 96],
  ['2002::', 16],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
] as const)
  internal.addSubnet(net, prefix, 'ipv6');

/** `::ffff:a.b.c.d` or `::ffff:XXXX:XXXX` → the IPv4 it carries. */
function mappedIpv4(address: string): string | null {
  const dotted = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address)?.[1];
  if (dotted) return dotted;
  const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(address);
  if (!hex) return null;
  const high = parseInt(hex[1], 16),
    low = parseInt(hex[2], 16);
  return [high >> 8, high & 255, low >> 8, low & 255].join('.');
}

export function isInternalAddress(address: string): boolean {
  const mapped = mappedIpv4(address);
  if (mapped) return internal.check(mapped, 'ipv4');
  const family = isIP(address);
  if (!family) return true;
  return internal.check(address, family === 4 ? 'ipv4' : 'ipv6');
}

const blockedAddress = () =>
  new DomainError('INVALID_IMAGE_URL', 'O link da imagem aponta para uma rede interna.');

/**
 * DNS lookup used by the connection itself, so the address that is checked is the address that
 * is dialed (no gap for a DNS-rebinding answer between a check and the request).
 */
const publicOnlyLookup: LookupFunction = (hostname, options, callback) => {
  dnsLookup(hostname, { ...options, all: true }, (error, addresses: LookupAddress[]) => {
    if (error) return callback(error, '', 4);
    if (!addresses.length || addresses.some((a) => isInternalAddress(a.address)))
      return callback(blockedAddress(), '', 4);
    if (options.all)
      return (callback as unknown as (e: null, a: LookupAddress[]) => void)(null, addresses);
    callback(null, addresses[0].address, addresses[0].family);
  });
};

function request(url: URL): Promise<IncomingMessage> {
  if (url.protocol !== 'https:' || url.username || url.password)
    throw new DomainError('INVALID_IMAGE_URL', 'Use um link HTTPS público para a imagem.');
  const literal = url.hostname.replace(/^\[|\]$/g, '');
  // IP literals never go through `lookup`, so they are checked here.
  if (isIP(literal) && isInternalAddress(literal)) throw blockedAddress();
  return new Promise((resolve, reject) => {
    const req = get(
      url,
      {
        lookup: publicOnlyLookup,
        timeout: FETCH_TIMEOUT_MS,
        headers: { Accept: 'image/avif,image/webp,image/png,image/jpeg;q=0.9' },
      },
      resolve,
    );
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', (error) =>
      reject(
        error instanceof DomainError
          ? error
          : new DomainError('IMAGE_URL_UNREACHABLE', 'Não foi possível baixar a imagem.'),
      ),
    );
  });
}

async function readLimited(response: IncomingMessage): Promise<Buffer> {
  if (Number(response.headers['content-length']) > MAX_IMAGE_BYTES) {
    response.destroy();
    throw new DomainError('FILE_TOO_LARGE', 'A imagem passa de 12 MB.', 413);
  }
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of response) {
    total += (chunk as Buffer).byteLength;
    if (total > MAX_IMAGE_BYTES) {
      response.destroy();
      throw new DomainError('FILE_TOO_LARGE', 'A imagem passa de 12 MB.', 413);
    }
    chunks.push(chunk as Buffer);
  }
  if (!total) throw new DomainError('INVALID_IMAGE', 'A imagem veio vazia.');
  return Buffer.concat(chunks);
}

export interface RemoteImage {
  name: string;
  mime: string;
  bytes: Buffer;
}

/**
 * Downloads an image an assistant pointed at, refusing internal addresses on every hop so the
 * MCP endpoint cannot be used to probe the private network.
 */
export async function fetchRemoteImage(link: string): Promise<RemoteImage> {
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    throw new DomainError('INVALID_IMAGE_URL', 'O link da imagem é inválido.');
  }
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const response = await request(url),
      status = response.statusCode ?? 0;
    if (status >= 300 && status < 400) {
      response.resume();
      const next = response.headers.location;
      if (!next) break;
      url = new URL(next, url);
      continue;
    }
    if (status < 200 || status >= 300) {
      response.resume();
      throw new DomainError('IMAGE_URL_UNREACHABLE', `O servidor da imagem respondeu ${status}.`);
    }
    const mime = (response.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
    if (!extensions[mime]) {
      response.destroy();
      throw new DomainError('INVALID_IMAGE', 'O link não é uma imagem JPG, PNG, WebP ou AVIF.');
    }
    const bytes = await readLimited(response),
      base =
        decodeURIComponent(url.pathname.split('/').pop() || '')
          .replace(/\.[^.]*$/, '')
          .replace(/[^a-zA-Z0-9_-]+/g, '-')
          .slice(0, 80) || 'imagem';
    return { name: base + extensions[mime], mime, bytes };
  }
  throw new DomainError('IMAGE_URL_UNREACHABLE', 'O link da imagem redireciona demais.');
}

import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { configured, providerJson, ProviderError, type Fetcher } from './http';
export interface MediaConfig {
  INTEGRATIONS_MODE: 'mock' | 'live';
  BUNNY_STORAGE_ZONE?: string;
  BUNNY_STORAGE_PASSWORD?: string;
  BUNNY_STORAGE_HOST: string;
  BUNNY_PUBLIC_CDN_URL?: string;
  BUNNY_PRIVATE_STORAGE_ZONE?: string;
  BUNNY_PRIVATE_STORAGE_PASSWORD?: string;
  BUNNY_STREAM_LIBRARY_ID?: string;
  BUNNY_STREAM_API_KEY?: string;
  BUNNY_STREAM_READ_KEY?: string;
  BUNNY_STREAM_CDN_HOST?: string;
}
export function createMedia(config: MediaConfig, fetcher: Fetcher = fetch) {
  function storage(key: string, privateFile: boolean) {
    if (!/^[a-zA-Z0-9_./-]+$/.test(key) || key.includes('..') || key.startsWith('/'))
      throw new ProviderError('Bunny', 'INVALID_KEY', 422);
    const zone = privateFile ? config.BUNNY_PRIVATE_STORAGE_ZONE : config.BUNNY_STORAGE_ZONE,
      password = privateFile
        ? config.BUNNY_PRIVATE_STORAGE_PASSWORD
        : config.BUNNY_STORAGE_PASSWORD;
    configured('Bunny Storage', zone, password);
    if (!/^[a-zA-Z0-9-]+$/.test(zone!)) throw new ProviderError('Bunny', 'INVALID_ZONE');
    return { url: `https://${config.BUNNY_STORAGE_HOST}/${zone}/${key}`, password: password! };
  }
  const videoRequest = <T>(path: string, body?: unknown) => {
    configured('Bunny Stream', config.BUNNY_STREAM_LIBRARY_ID, config.BUNNY_STREAM_API_KEY);
    return providerJson<T>(
      'Bunny Stream',
      `https://video.bunnycdn.com/library/${config.BUNNY_STREAM_LIBRARY_ID}/videos${path}`,
      {
        method: body ? 'POST' : 'GET',
        headers: { AccessKey: config.BUNNY_STREAM_API_KEY!, 'Content-Type': 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {}),
      },
      fetcher,
    );
  };
  function videoAuthorization(id: string) {
    z.uuid().parse(id);
    configured('Bunny Stream', config.BUNNY_STREAM_LIBRARY_ID, config.BUNNY_STREAM_API_KEY);
    const expire = String(Math.floor(Date.now() / 1000) + 300),
      library = config.BUNNY_STREAM_LIBRARY_ID!;
    return {
      id,
      url: 'https://video.bunnycdn.com/tusupload',
      headers: {
        AuthorizationSignature: createHash('sha256')
          .update(library + config.BUNNY_STREAM_API_KEY + expire + id)
          .digest('hex'),
        AuthorizationExpire: expire,
        LibraryId: library,
        VideoId: id,
      },
    };
  }
  return {
    videoAuthorization,
    publicUrl(key: string) {
      configured('Bunny CDN', config.BUNNY_PUBLIC_CDN_URL);
      const base = new URL(config.BUNNY_PUBLIC_CDN_URL!);
      if (base.protocol !== 'https:' || base.username || base.password)
        throw new ProviderError('Bunny', 'INVALID_CDN');
      return (
        base.toString().replace(/\/$/, '') + '/' + key.split('/').map(encodeURIComponent).join('/')
      );
    },
    async put(key: string, bytes: Uint8Array, mime: string, privateFile = false) {
      const endpoint = storage(key, privateFile);
      let r: Response;
      try {
        r = await fetcher(endpoint.url, {
          method: 'PUT',
          headers: {
            AccessKey: endpoint.password,
            'Content-Type': mime,
            Checksum: createHash('sha256').update(bytes).digest('hex').toUpperCase(),
          },
          body: new Uint8Array(bytes),
          redirect: 'error',
          signal: AbortSignal.timeout(120000),
        });
      } catch {
        throw new ProviderError('Bunny Storage', 'UPLOAD_UNKNOWN', 503, true);
      }
      if (!r.ok) throw new ProviderError('Bunny Storage', `HTTP_${r.status}`);
      await r.body?.cancel();
    },
    async get(key: string, privateFile = false) {
      const endpoint = storage(key, privateFile);
      const r = await fetcher(endpoint.url, {
        headers: { AccessKey: endpoint.password },
        redirect: 'error',
        signal: AbortSignal.timeout(60000),
      });
      if (!r.ok) throw new ProviderError('Bunny Storage', `HTTP_${r.status}`);
      return r;
    },
    async remove(key: string, privateFile = false) {
      const endpoint = storage(key, privateFile);
      const r = await fetcher(endpoint.url, {
        method: 'DELETE',
        headers: { AccessKey: endpoint.password },
        redirect: 'error',
        signal: AbortSignal.timeout(15000),
      });
      if (!r.ok && r.status !== 404) throw new ProviderError('Bunny Storage', `HTTP_${r.status}`);
      await r.body?.cancel();
    },
    async createVideo(name: string) {
      const r = z
        .object({ guid: z.string().uuid() })
        .parse(await videoRequest('', { title: name.slice(0, 120) }));
      return videoAuthorization(r.guid);
    },
    async video(id: string) {
      z.uuid().parse(id);
      return z
        .object({
          guid: z.string(),
          status: z.number(),
          length: z.number().optional(),
          storageSize: z.number().optional(),
        })
        .parse(await videoRequest('/' + id));
    },
    videoUrls(id: string) {
      z.uuid().parse(id);
      configured('Bunny Stream', config.BUNNY_STREAM_LIBRARY_ID, config.BUNNY_STREAM_CDN_HOST);
      return {
        url: `https://iframe.mediadelivery.net/embed/${config.BUNNY_STREAM_LIBRARY_ID}/${id}`,
        thumbnailUrl: `https://${config.BUNNY_STREAM_CDN_HOST}/${id}/thumbnail.jpg`,
      };
    },
    verifyWebhook(raw: string, signature: string) {
      configured('Bunny Stream', config.BUNNY_STREAM_READ_KEY);
      if (!/^[a-f0-9]{64}$/i.test(signature))
        throw new ProviderError('Bunny', 'INVALID_SIGNATURE', 401);
      const expected = createHmac('sha256', config.BUNNY_STREAM_READ_KEY!).update(raw).digest(),
        actual = Buffer.from(signature, 'hex');
      if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
        throw new ProviderError('Bunny', 'INVALID_SIGNATURE', 401);
    },
  };
}

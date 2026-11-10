import type { AssetKind, MediaAsset } from '@/lib/domain/types';
import { validateAsset } from './assets';
import { HttpClient } from '@/lib/api/http';
import { mediaAssetSchema, uploadSessionSchema } from '@/lib/domain/admin-schemas';
export async function uploadMedia(
  file: File,
  kind: AssetKind,
  onProgress?: (percentage: number) => void,
): Promise<MediaAsset> {
  validateAsset(file, kind);
  const client = new HttpClient();
  const session = await client.request('admin/media/uploads', uploadSessionSchema, {
    method: 'POST',
    body: { name: file.name, mime: file.type || 'application/octet-stream', size: file.size, kind },
  });
  if (session.transport === 'tus') {
    if (
      session.url !== 'https://video.bunnycdn.com/tusupload' ||
      Object.keys(session.headers || {}).some(
        (key) =>
          !['AuthorizationSignature', 'AuthorizationExpire', 'LibraryId', 'VideoId'].includes(key),
      )
    )
      throw new Error('Autorização de vídeo inválida.');
    const { Upload } = await import('tus-js-client');
    await new Promise<void>((resolve, reject) => {
      const upload = new Upload(file, {
        endpoint: session.url,
        headers: session.headers,
        retryDelays: [0, 1000, 3000, 5000],
        metadata: { filetype: file.type, title: file.name },
        onBeforeRequest: async (request) => {
          if (Number(session.headers?.AuthorizationExpire || 0) * 1000 < Date.now() + 60000) {
            const fresh = await client.request(
              'admin/media/uploads/' + encodeURIComponent(session.id) + '/renew',
              uploadSessionSchema,
              { method: 'POST', body: {} },
            );
            session.headers = fresh.headers;
          }
          for (const [name, value] of Object.entries(session.headers || {}))
            request.setHeader(name, value);
        },
        onProgress: (sent, total) => onProgress?.((sent / total) * 100),
        onError: reject,
        onSuccess: () => resolve(),
      });
      upload.start();
    });
  } else {
    if (!session.url.startsWith('/api/v1/')) throw new Error('Destino de upload não autorizado.');
    const result = await fetch(session.url, {
      method: 'PUT',
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
      body: file,
    });
    if (!result.ok) throw new Error('O envio não foi concluído.');
  }
  return client.request(
    `admin/media/uploads/${encodeURIComponent(session.id)}/complete`,
    mediaAssetSchema,
    { method: 'POST', body: {} },
  );
}

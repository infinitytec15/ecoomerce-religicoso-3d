import type { MediaAsset } from '@/lib/domain/types';

const database = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('meo-media-v1', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('assets', { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('Não foi possível abrir a biblioteca de mídia.'));
  });
export function validateAsset(file: File, kind: MediaAsset['kind']) {
  const limit = kind === 'video' ? 150 : kind === 'model' ? 30 : 12;
  if (!file.size || file.size > limit * 1024 * 1024)
    throw new Error(`Envie um arquivo de até ${limit} MB.`);
  if (kind === 'image' && !['image/jpeg', 'image/png', 'image/webp'].includes(file.type))
    throw new Error('Use JPG, PNG ou WebP.');
  if (kind === 'video' && !['video/mp4', 'video/webm'].includes(file.type))
    throw new Error('Use MP4 ou WebM.');
  if (kind === 'model' && !/\.(stl|3mf)$/i.test(file.name))
    throw new Error('Use um arquivo STL ou 3MF.');
}
export async function saveAsset(file: File, kind: MediaAsset['kind']): Promise<MediaAsset> {
  validateAsset(file, kind);
  const metadata: MediaAsset = {
    id: crypto.randomUUID(),
    name: file.name,
    kind,
    mime: file.type,
    size: file.size,
    storage: 'local',
    status: 'ready',
    created: new Date().toISOString(),
  };
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('assets', 'readwrite');
      tx.objectStore('assets').put({ ...metadata, blob: file });
      tx.oncomplete = () => resolve();
      tx.onerror = () =>
        reject(new Error('Não foi possível salvar. Verifique o espaço do navegador.'));
    });
  } finally {
    db.close();
  }
  return metadata;
}
export async function loadAsset(id: string): Promise<{ blob: Blob } & MediaAsset> {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction('assets').objectStore('assets').get(id);
      request.onsuccess = () =>
        request.result
          ? resolve(request.result)
          : reject(new Error('Arquivo não encontrado neste navegador. Envie-o novamente.'));
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}
export async function removeAsset(id: string) {
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('assets', 'readwrite');
      tx.objectStore('assets').delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

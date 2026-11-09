import 'fake-indexeddb/auto';
import { File } from 'node:buffer';
import { describe, it, expect } from 'vitest';
import { saveAsset, loadAsset, removeAsset } from './assets';
describe('browser media library', () => {
  it('stores bytes separately from the commerce operation and removes assets', async () => {
    const file = new File(['test-image'], 'photo.webp', { type: 'image/webp' });
    const asset = await saveAsset(file as unknown as globalThis.File, 'image');
    expect((await loadAsset(asset.id)).blob.size).toBe(file.size);
    expect(JSON.stringify(asset)).not.toContain('base64');
    await removeAsset(asset.id);
    await expect(loadAsset(asset.id)).rejects.toThrow();
  });
  it('rejects non-image payload types and unsupported model extensions', async () => {
    await expect(
      saveAsset(
        new File(['x'], 'bad.svg', { type: 'image/svg+xml' }) as unknown as globalThis.File,
        'image',
      ),
    ).rejects.toThrow();
    await expect(
      saveAsset(new File(['x'], 'bad.obj') as unknown as globalThis.File, 'model'),
    ).rejects.toThrow();
  });
});

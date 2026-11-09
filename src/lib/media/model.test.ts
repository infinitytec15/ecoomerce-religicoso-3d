import { readFile } from 'node:fs/promises';
import { describe, it, expect } from 'vitest';
import { parseModel, disposeModel } from './model';
async function fixture(name: string) {
  const bytes = await readFile(new URL('./__fixtures__/' + name, import.meta.url));
  return Uint8Array.from(bytes).buffer;
}
describe('manufacturing model validation', () => {
  it('reads geometry from an uploaded STL', async () => {
    const parsed = await parseModel(await fixture('modelo-teste.stl'), 'stl');
    expect(parsed.stats.triangles).toBe(4);
    expect(parsed.stats.dimensions).toEqual([20, 20, 20]);
    disposeModel(parsed.object);
  });
  it('reads the actual 3MF mesh and package relationships', async () => {
    const parsed = await parseModel(await fixture('modelo-teste.3mf'), '3mf');
    expect(parsed.stats.triangles).toBe(4);
    expect(parsed.stats.dimensions).toEqual([20, 20, 20]);
    disposeModel(parsed.object);
  });
  it('rejects invalid STL/3MF and oversized decompression before creating geometry', async () => {
    await expect(
      parseModel(new TextEncoder().encode('not a model').buffer, 'stl'),
    ).rejects.toThrow();
    await expect(parseModel(new ArrayBuffer(12), '3mf')).rejects.toThrow();
    const buffer = await fixture('modelo-teste.3mf'),
      view = new DataView(buffer);
    for (let i = 0; i < view.byteLength - 46; i++)
      if (view.getUint32(i, true) === 0x02014b50) {
        view.setUint32(i + 24, 200 * 1024 * 1024, true);
        break;
      }
    await expect(parseModel(buffer, '3mf')).rejects.toThrow('descompactado');
  });
});

// @vitest-environment node
import { readFile } from 'node:fs/promises';
import { describe, it, expect } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Box3, Vector3 } from 'three';
import { convert } from '../../../apps/worker/src/model-converter';
describe('conversão isolada de fabricação para GLB', () => {
  it.each(['stl', '3mf'])(
    'converte fixture %s e permite leitura por GLTFLoader',
    async (format) => {
      const input = await readFile(
          new URL('../../../src/lib/media/__fixtures__/modelo-teste.' + format, import.meta.url),
        ),
        result = await convert(input, '.' + format),
        binary = new Uint8Array(result.bytes).buffer,
        gltf = await new GLTFLoader().parseAsync(binary, '');
      const size = new Box3().setFromObject(gltf.scene).getSize(new Vector3());
      expect(result.stats.triangles).toBeGreaterThan(0);
      expect(result.stats.unit).toBe('mm');
      expect(size.x * 1000).toBeCloseTo(result.stats.dimensions[0], 1);
      expect(result.bytes.readUInt32LE(0)).toBe(0x46546c67);
    },
  );
  it('aplica unidades e transformações de componentes 3MF', async () => {
    const xml =
        '<model unit="inch"><resources><object id="1"><mesh><vertices><vertex x="0" y="0" z="0"/><vertex x="1" y="0" z="0"/><vertex x="0" y="1" z="0"/></vertices><triangles><triangle v1="0" v2="1" v3="2"/></triangles></mesh></object><object id="2"><components><component objectid="1" transform="1 0 0 0 1 0 0 0 1 2 0 0"/></components></object></resources><build><item objectid="1"/><item objectid="2"/></build></model>',
      result = await convert(zipSync({ '3D/3dmodel.model': strToU8(xml) }), '.3mf');
    expect(result.stats.triangles).toBe(2);
    expect(result.stats.dimensions[0]).toBeCloseTo(76.2);
  });
  it('rejeita STL sem geometria e XML com entidades', async () => {
    await expect(convert(strToU8('solid invalid\nendsolid invalid'), '.stl')).rejects.toThrow();
    const bad = zipSync({
      '3D/3dmodel.model': strToU8(
        '<!DOCTYPE model [<!ENTITY x SYSTEM="https://invalid.example">]><model>&x;</model>',
      ),
    });
    await expect(convert(bad, '.3mf')).rejects.toThrow('XML');
  });
  it('rejeita tamanho expandido de ZIP antes de descompactar', async () => {
    const bytes = Buffer.from(zipSync({ '3D/3dmodel.model': strToU8('<model/>') })),
      central = bytes.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    bytes.writeUInt32LE(80 * 1024 * 1024, central + 24);
    await expect(convert(bytes, '.3mf')).rejects.toThrow('não permitido');
  });
});

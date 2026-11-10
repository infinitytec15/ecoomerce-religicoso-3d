import { readFile, writeFile } from 'node:fs/promises';
import { extname, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync, strFromU8 } from 'fflate';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { Matrix4, Vector3 } from 'three';
import type { ModelStats } from '@maos-em-oracao/contracts';
const MAX_TRIANGLES = 1000000;
type XmlNode = Record<string, unknown>;
const list = (value: unknown): XmlNode[] =>
  value === undefined ? [] : ((Array.isArray(value) ? value : [value]) as XmlNode[]);
const object = (v: unknown): XmlNode => (v && typeof v === 'object' ? (v as XmlNode) : {});
const num = (v: unknown) => {
  const n = Number(v);
  if (!Number.isFinite(n) || Math.abs(n) > 1e8) throw new Error('Coordenada inválida.');
  return n;
};
export async function convert(source: Uint8Array, format: string) {
  let positions: number[] = [];
  let meshes = 0;
  const push = (values: number[]) => {
    if (positions.length + values.length > MAX_TRIANGLES * 9)
      throw new Error('Use até 1 milhão de triângulos.');
    for (const n of values) {
      if (!Number.isFinite(n) || Math.abs(n) > 1e8) throw new Error('Coordenada inválida.');
      positions.push(n);
    }
  };
  if (source.byteLength > 30 * 1024 * 1024) throw new Error('Modelo acima de 30 MB.');
  if (format === '.stl') {
    const view = new DataView(source.buffer, source.byteOffset, source.byteLength),
      faces = source.byteLength >= 84 ? view.getUint32(80, true) : 0;
    if (faces > 0 && 84 + faces * 50 === source.byteLength) {
      if (faces > MAX_TRIANGLES) throw new Error('Use até 1 milhão de triângulos.');
      for (let i = 0; i < faces; i++) {
        const values = [];
        for (let j = 0; j < 9; j++) values.push(view.getFloat32(84 + i * 50 + 12 + j * 4, true));
        push(values);
      }
    } else {
      const text = strFromU8(source);
      if (!/^\s*solid\b/i.test(text)) throw new Error('Arquivo STL inválido.');
      let facets = 0;
      const facet = /facet\s+normal[^\n]*\s+outer\s+loop\s+([\s\S]*?)endloop\s+endfacet/gi;
      for (const f of text.matchAll(facet)) {
        const vertices = [
          ...f[1].matchAll(/vertex\s+([-+0-9.eE]+)\s+([-+0-9.eE]+)\s+([-+0-9.eE]+)/g),
        ];
        if (vertices.length !== 3) throw new Error('Triângulo STL inválido.');
        push(vertices.flatMap((v) => v.slice(1).map(num)));
        facets++;
      }
      if (!facets) throw new Error('Arquivo STL sem triângulos.');
    }
    meshes = 1;
  } else if (format === '.3mf') {
    const view = new DataView(source.buffer, source.byteOffset, source.byteLength);
    let end = -1;
    for (let i = source.length - 22; i >= Math.max(0, source.length - 65557); i--)
      if (view.getUint32(i, true) === 0x06054b50) {
        end = i;
        break;
      }
    if (end < 0 || view.getUint16(end + 4, true) || view.getUint16(end + 6, true))
      throw new Error('Pacote 3MF inválido.');
    const count = view.getUint16(end + 10, true),
      start = view.getUint32(end + 16, true);
    if (!count || count > 200 || count === 65535 || start > source.length - 46)
      throw new Error('Pacote 3MF excede os limites.');
    let cursor = start,
      expanded = 0;
    for (let n = 0; n < count; n++) {
      if (cursor + 46 > source.length || view.getUint32(cursor, true) !== 0x02014b50)
        throw new Error('Diretório ZIP inválido.');
      const flags = view.getUint16(cursor + 8, true),
        size = view.getUint32(cursor + 24, true),
        nl = view.getUint16(cursor + 28, true),
        el = view.getUint16(cursor + 30, true),
        cl = view.getUint16(cursor + 32, true),
        name = strFromU8(source.subarray(cursor + 46, cursor + 46 + nl));
      expanded += size;
      if (
        flags & 1 ||
        expanded > 64 * 1024 * 1024 ||
        name.includes('..') ||
        name.startsWith('/') ||
        name.includes('\\')
      )
        throw new Error('Conteúdo 3MF não permitido.');
      cursor += 46 + nl + el + cl;
    }
    const files = unzipSync(source, { filter: (f) => f.name.toLowerCase().endsWith('.model') }),
      models = new Map<string, { root: XmlNode; scale: number; objects: Map<string, XmlNode> }>();
    const parser = new XMLParser({
      ignoreAttributes: false,
      removeNSPrefix: true,
      processEntities: false,
      parseTagValue: false,
      parseAttributeValue: false,
    });
    for (const [name, bytes] of Object.entries(files)) {
      const xml = strFromU8(bytes);
      if (/<!DOCTYPE|<!ENTITY/i.test(xml) || XMLValidator.validate(xml) !== true)
        throw new Error('XML 3MF inválido.');
      const root = object(object(parser.parse(xml)).model),
        unit = String(root['@_unit'] || 'millimeter'),
        scale = (
          {
            micron: 0.001,
            millimeter: 1,
            centimeter: 10,
            inch: 25.4,
            foot: 304.8,
            meter: 1000,
          } as Record<string, number>
        )[unit];
      if (!scale) throw new Error('Unidade 3MF não reconhecida.');
      const resources = object(root.resources);
      models.set(posix.normalize(name), {
        root,
        scale,
        objects: new Map(list(resources.object).map((o) => [String(o['@_id']), o])),
      });
    }
    const main = models.has('3D/3dmodel.model')
      ? '3D/3dmodel.model'
      : [...models.keys()].find((n) => n.toLowerCase() === '3d/3dmodel.model');
    if (!main) throw new Error('Pacote 3MF sem modelo principal.');
    const matrix = (value: unknown, scale: number) => {
      const m = new Matrix4();
      if (value === undefined) return m;
      const a = String(value).trim().split(/\s+/).map(num);
      if (a.length !== 12) throw new Error('Transformação 3MF inválida.');
      return m.set(
        a[0],
        a[3],
        a[6],
        a[9] * scale,
        a[1],
        a[4],
        a[7],
        a[10] * scale,
        a[2],
        a[5],
        a[8],
        a[11] * scale,
        0,
        0,
        0,
        1,
      );
    };
    function visit(file: string, id: string, world: Matrix4, trail: Set<string>) {
      const key = file + '#' + id;
      if (trail.has(key) || trail.size > 16)
        throw new Error('Componentes 3MF cíclicos ou profundos.');
      const model = models.get(file);
      if (!model) throw new Error('Componente 3MF ausente.');
      const o = model.objects.get(id);
      if (!o) throw new Error('Objeto 3MF ausente.');
      const nested = new Set(trail).add(key),
        mesh = object(o.mesh);
      if (mesh.vertices) {
        const vertices = list(object(mesh.vertices).vertex),
          triangles = list(object(mesh.triangles).triangle);
        for (const t of triangles) {
          const coords: number[] = [];
          for (const k of ['@_v1', '@_v2', '@_v3']) {
            const index = num(t[k]);
            if (!Number.isInteger(index) || index < 0 || index >= vertices.length)
              throw new Error('Índice de triângulo inválido.');
            const v = vertices[index],
              p = new Vector3(
                num(v['@_x']) * model.scale,
                num(v['@_y']) * model.scale,
                num(v['@_z']) * model.scale,
              ).applyMatrix4(world);
            coords.push(p.x, p.y, p.z);
          }
          push(coords);
        }
        meshes++;
      }
      for (const c of list(object(o.components).component)) {
        const path = String(c['@_path'] || '');
        if (/[:\\]/.test(path)) throw new Error('Referência 3MF externa não permitida.');
        const child = path
          ? path.startsWith('/')
            ? posix.normalize(path.slice(1))
            : posix.normalize(posix.join(posix.dirname(file), path))
          : file;
        visit(
          child,
          String(c['@_objectid']),
          world.clone().multiply(matrix(c['@_transform'], model.scale)),
          nested,
        );
      }
    }
    const mainModel = models.get(main)!;
    for (const item of list(object(mainModel.root.build).item)) {
      if (String(item['@_printable'] || '1') === '0') continue;
      visit(
        main,
        String(item['@_objectid']),
        matrix(item['@_transform'], mainModel.scale),
        new Set(),
      );
    }
  } else throw new Error('Formato de modelo não permitido.');
  if (!positions.length || positions.length % 9) throw new Error('Modelo sem triângulos válidos.');
  const min = [Infinity, Infinity, Infinity],
    max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i++) {
    const axis = i % 3;
    min[axis] = Math.min(min[axis], positions[i]);
    max[axis] = Math.max(max[axis], positions[i]);
  }
  const dimensions = max.map((v, i) => v - min[i]),
    span = Math.max(...dimensions) / 2;
  if (!Number.isFinite(span) || span <= 0 || span > 100000)
    throw new Error('Dimensões do modelo inválidas.');
  const vertexCount = positions.length / 3;
  const center = max.map((v, i) => (v + min[i]) / 2),
    pos = new Int16Array(vertexCount * 4),
    norm = new Int8Array(vertexCount * 4),
    qMin = [32767, 32767, 32767],
    qMax = [-32767, -32767, -32767];
  let nondegenerate = false;
  for (let i = 0; i < positions.length; i++) {
    const a = i % 3,
      v = Math.round(((positions[i] - center[a]) / span) * 32767);
    pos[Math.floor(i / 3) * 4 + a] = v;
    qMin[a] = Math.min(qMin[a], v);
    qMax[a] = Math.max(qMax[a], v);
  }
  for (let i = 0; i < positions.length; i += 9) {
    const a = new Vector3(
        positions[i + 3] - positions[i],
        positions[i + 4] - positions[i + 1],
        positions[i + 5] - positions[i + 2],
      ),
      b = new Vector3(
        positions[i + 6] - positions[i],
        positions[i + 7] - positions[i + 1],
        positions[i + 8] - positions[i + 2],
      ),
      normal = a.cross(b);
    if (normal.lengthSq() > 1e-15) nondegenerate = true;
    normal.normalize();
    for (let v = 0; v < 3; v++) {
      norm[(i / 3 + v) * 4] = Math.round(normal.x * 127);
      norm[(i / 3 + v) * 4 + 1] = Math.round(normal.y * 127);
      norm[(i / 3 + v) * 4 + 2] = Math.round(normal.z * 127);
    }
  }
  if (!nondegenerate) throw new Error('Modelo sem superfície válida.');
  positions = [];
  const align = (v: number) => (v + 3) & ~3,
    posBytes = Buffer.from(pos.buffer),
    normOffset = align(posBytes.length),
    bin = Buffer.alloc(align(normOffset + norm.length));
  posBytes.copy(bin);
  Buffer.from(norm.buffer).copy(bin, normOffset);
  const gltf = {
    asset: { version: '2.0', generator: 'Mãos em Oração · conversor de arquivos enviados' },
    extensionsUsed: ['KHR_mesh_quantization'],
    extensionsRequired: ['KHR_mesh_quantization'],
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, scale: [span / 1000, span / 1000, span / 1000] }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, material: 0, mode: 4 }] }],
    materials: [
      {
        pbrMetallicRoughness: {
          baseColorFactor: [0.84, 0.81, 0.74, 1],
          metallicFactor: 0,
          roughnessFactor: 0.75,
        },
        doubleSided: true,
      },
    ],
    buffers: [{ byteLength: bin.length }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: posBytes.length, byteStride: 8, target: 34962 },
      { buffer: 0, byteOffset: normOffset, byteLength: norm.length, byteStride: 4, target: 34962 },
    ],
    accessors: [
      {
        bufferView: 0,
        componentType: 5122,
        normalized: true,
        count: vertexCount,
        type: 'VEC3',
        min: qMin,
        max: qMax,
      },
      {
        bufferView: 1,
        componentType: 5120,
        normalized: true,
        count: vertexCount,
        type: 'VEC3',
      },
    ],
  };
  const encoded = Buffer.from(JSON.stringify(gltf)),
    jsonChunk = Buffer.alloc(align(encoded.length), 32);
  encoded.copy(jsonChunk);
  const output = Buffer.alloc(12 + 8 + jsonChunk.length + 8 + bin.length);
  output.writeUInt32LE(0x46546c67, 0);
  output.writeUInt32LE(2, 4);
  output.writeUInt32LE(output.length, 8);
  output.writeUInt32LE(jsonChunk.length, 12);
  output.writeUInt32LE(0x4e4f534a, 16);
  jsonChunk.copy(output, 20);
  const binStart = 20 + jsonChunk.length;
  output.writeUInt32LE(bin.length, binStart);
  output.writeUInt32LE(0x004e4942, binStart + 4);
  bin.copy(output, binStart + 8);
  return {
    bytes: output,
    stats: {
      triangles: vertexCount / 3,
      meshes,
      dimensions: dimensions.map((v) => Math.round(v * 1000) / 1000) as [number, number, number],
      unit: 'mm',
    } satisfies ModelStats,
  };
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const [source, destination, metadata] = process.argv.slice(2);
  convert(await readFile(source), extname(source).toLowerCase())
    .then(async (result) => {
      await writeFile(destination, result.bytes, { mode: 0o600 });
      await writeFile(metadata, JSON.stringify(result.stats), { mode: 0o600 });
    })
    .catch((error) => {
      console.error('MODEL:' + (error instanceof Error ? error.message : 'Modelo inválido.'));
      process.exitCode = 1;
    });
}

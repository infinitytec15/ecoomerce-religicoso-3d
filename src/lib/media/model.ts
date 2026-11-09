import * as THREE from 'three';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { ThreeMFLoader } from 'three/addons/loaders/3MFLoader.js';
import { unzipSync, strFromU8 } from 'fflate';
import type { ModelStats } from '@/lib/domain/types';

export function disposeModel(root: THREE.Object3D) {
  root.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      object.geometry.dispose();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach((m) => m.dispose());
    }
  });
}
export async function parseModel(buffer: ArrayBuffer, format: 'stl' | '3mf') {
  let unitScale = 1;
  if (buffer.byteLength > 30 * 1024 * 1024) throw new Error('Modelo acima do limite de 30 MB.');
  if (format === 'stl') {
    const bytes = new DataView(buffer);
    const faces = buffer.byteLength >= 84 ? bytes.getUint32(80, true) : 0;
    if (faces && 84 + faces * 50 === buffer.byteLength) {
      if (faces > 1_000_000) throw new Error('Use até 1 milhão de triângulos.');
    } else {
      const source = new TextDecoder().decode(buffer);
      if (!/^\s*solid\b/i.test(source) || !source.match(/facet\s+normal/g)?.length)
        throw new Error('Arquivo STL inválido.');
    }
  }
  if (format === '3mf') {
    // Inspect ZIP central-directory sizes before decompressing untrusted 3MF content.
    const bytes = new DataView(buffer);
    let expanded = 0,
      entries = 0;
    for (let i = 0; i + 46 <= bytes.byteLength; i++)
      if (bytes.getUint32(i, true) === 0x02014b50) {
        expanded += bytes.getUint32(i + 24, true);
        entries++;
        if (expanded > 100 * 1024 * 1024 || entries > 500)
          throw new Error('Arquivo 3MF excede o limite de conteúdo descompactado.');
        i += 45;
      }
    if (!entries) throw new Error('Arquivo 3MF inválido.');
    const models = Object.values(
      unzipSync(new Uint8Array(buffer), {
        filter: (file) => file.name.toLowerCase().endsWith('.model'),
      }),
    );
    const units = models.map((bytes) => {
      const xml = strFromU8(bytes);
      if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('Arquivo 3MF contém XML não permitido.');
      return (
        new DOMParser()
          .parseFromString(xml, 'application/xml')
          .documentElement.getAttribute('unit') || 'millimeter'
      );
    });
    if (new Set(units).size !== 1)
      throw new Error('Use uma unidade consistente nos componentes do arquivo 3MF.');
    unitScale = (
      {
        micron: 0.001,
        millimeter: 1,
        centimeter: 10,
        inch: 25.4,
        foot: 304.8,
        meter: 1000,
      } as Record<string, number>
    )[units[0]];
    if (!unitScale) throw new Error('Unidade do modelo 3MF não reconhecida.');
  }
  const object =
    format === 'stl'
      ? new THREE.Group().add(
          new THREE.Mesh(
            new STLLoader().parse(buffer),
            new THREE.MeshStandardMaterial({ color: '#ddd5bd', roughness: 0.72 }),
          ),
        )
      : new ThreeMFLoader().parse(buffer);
  object.scale.multiplyScalar(unitScale);
  let triangles = 0,
    meshes = 0;
  try {
    object.traverse((node) => {
      if (node instanceof THREE.Mesh) {
        const position = node.geometry.getAttribute('position');
        if (!position) throw new Error('Geometria vazia.');
        triangles += (node.geometry.index?.count || position.count) / 3;
        meshes++;
        for (let i = 0; i < position.count; i++)
          if (
            !Number.isFinite(position.getX(i)) ||
            !Number.isFinite(position.getY(i)) ||
            !Number.isFinite(position.getZ(i))
          )
            throw new Error('Geometria inválida.');
        node.geometry.computeVertexNormals();
      }
    });
    const bounds = new THREE.Box3().setFromObject(object),
      size = bounds.getSize(new THREE.Vector3());
    if (
      !triangles ||
      triangles > 1_000_000 ||
      !meshes ||
      !Number.isFinite(size.length()) ||
      size.length() === 0
    )
      throw new Error('Use um modelo válido com até 1 milhão de triângulos.');
    const stats: ModelStats = {
      triangles: Math.round(triangles),
      meshes,
      dimensions: [size.x, size.y, size.z].map((n) => Math.round(n * 100) / 100) as [
        number,
        number,
        number,
      ],
      unit: 'mm',
    };
    return { object, stats };
  } catch (error) {
    disposeModel(object);
    throw error;
  }
}

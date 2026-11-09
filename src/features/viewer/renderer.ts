import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { FontLoader, type Font, type FontData } from 'three/addons/loaders/FontLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import type { Product } from '@/lib/domain/types';

let fontPromise: Promise<Font> | undefined;
const font = () =>
  fontPromise ||
  (fontPromise = fetch('/assets/helvetiker_regular.typeface.json')
    .then(async (response) => {
      if (!response.ok) throw new Error('Não foi possível carregar a fonte do modelo.');
      return new FontLoader().parse((await response.json()) as FontData);
    })
    .catch((error) => {
      fontPromise = undefined;
      throw error;
    }));
function roundedShape(w: number, h: number, r = 0.1) {
  const s = new THREE.Shape(),
    x = -w / 2,
    y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}
function mesh(
  geo: THREE.BufferGeometry,
  mat: THREE.Material,
  parent: THREE.Object3D,
  pos: [number, number, number] = [0, 0, 0],
  scale: [number, number, number] = [1, 1, 1],
) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(...pos);
  m.scale.set(...scale);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}
function extrude(shape: THREE.Shape, depth = 0.2, bevel = 0.06) {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelSegments: 4,
    steps: 1,
    bevelSize: bevel,
    bevelThickness: bevel,
    curveSegments: 28,
  });
  g.translate(0, 0, -depth / 2);
  return g;
}
function base(parent: THREE.Object3D, mat: THREE.Material, w = 0.78) {
  return mesh(new THREE.CylinderGeometry(w, w, 0.16, 80), mat, parent, [0, 0.08, 0], [1, 1, 0.65]);
}
function buildCross(parent: THREE.Object3D, mat: THREE.Material) {
  base(parent, mat, 0.78);
  const s = new THREE.Shape();
  s.moveTo(-0.18, 0.2);
  s.lineTo(0.18, 0.2);
  s.lineTo(0.18, 1.48);
  s.lineTo(0.9, 1.48);
  s.lineTo(0.9, 1.82);
  s.lineTo(0.18, 1.82);
  s.lineTo(0.18, 2.62);
  s.lineTo(-0.18, 2.62);
  s.lineTo(-0.18, 1.82);
  s.lineTo(-0.9, 1.82);
  s.lineTo(-0.9, 1.48);
  s.lineTo(-0.18, 1.48);
  s.closePath();
  mesh(extrude(s, 0.28, 0.085), mat, parent);
}
function robe(parent: THREE.Object3D, mat: THREE.Material, x: number, height = 1.9, radius = 0.58) {
  const points = [
    [0, 0.08],
    [radius * 0.75, 0.08],
    [radius, 0.13],
    [radius * 0.91, 0.35],
    [radius * 0.7, 0.8],
    [radius * 0.47, 1.35],
    [radius * 0.39, 1.7],
    [radius * 0.24, 1.85],
    [0, 1.87],
  ].map(([r, y]) => new THREE.Vector2(r, (y * height) / 1.9));
  mesh(new THREE.LatheGeometry(points, 72), mat, parent, [x, 0, 0]);
  return height;
}
function buildMary(parent: THREE.Object3D, mat: THREE.Material) {
  base(parent, mat, 0.74);
  robe(parent, mat, 0, 2.0, 0.64);
  mesh(new THREE.SphereGeometry(0.27, 48, 32), mat, parent, [0, 2.22, 0.02], [0.88, 1.1, 0.9]);
  const hood = mesh(
    new THREE.SphereGeometry(0.365, 48, 32, 0, Math.PI * 2, 0, Math.PI * 0.57),
    mat,
    parent,
    [0, 2.3, -0.025],
    [1, 1.08, 0.95],
  );
  hood.rotation.x = -0.2;
  for (const side of [-1, 1]) {
    const hand = mesh(new THREE.CapsuleGeometry(0.065, 0.3, 6, 16), mat, parent, [
      side * 0.055,
      1.48,
      0.37,
    ]);
    hand.rotation.z = side * -0.13;
    const arm = mesh(new THREE.CapsuleGeometry(0.11, 0.48, 6, 20), mat, parent, [
      side * 0.24,
      1.25,
      0.27,
    ]);
    arm.rotation.z = side * -0.55;
  }
}
function buildFamily(parent: THREE.Object3D, mat: THREE.Material) {
  base(parent, mat, 0.95);
  robe(parent, mat, -0.32, 1.9, 0.43);
  robe(parent, mat, 0.35, 2.12, 0.44);
  mesh(new THREE.SphereGeometry(0.24, 40, 26), mat, parent, [-0.32, 2.08, 0.02], [0.9, 1.08, 1]);
  mesh(new THREE.SphereGeometry(0.26, 40, 26), mat, parent, [0.35, 2.33, -0.02], [0.9, 1.1, 1]);
  const baby = mesh(new THREE.CapsuleGeometry(0.18, 0.4, 6, 24), mat, parent, [0, 1.1, 0.4]);
  baby.rotation.z = 1.1;
  mesh(new THREE.SphereGeometry(0.15, 30, 20), mat, parent, [-0.28, 1.25, 0.44]);
  for (const side of [-1, 1]) {
    const arm = mesh(new THREE.CapsuleGeometry(0.12, 0.65, 6, 24), mat, parent, [
      side * 0.34,
      1.1,
      0.32,
    ]);
    arm.rotation.z = side * -0.95;
  }
}
function wing(side: number) {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.bezierCurveTo(0.45 * side, 0.1, 0.95 * side, 0.65, 1.05 * side, 1.65);
  s.bezierCurveTo(0.8 * side, 1.3, 0.52 * side, 1.06, 0.13 * side, 0.85);
  s.bezierCurveTo(0.1 * side, 0.54, 0, 0.22, 0, 0);
  return s;
}
function buildDove(parent: THREE.Object3D, mat: THREE.Material) {
  base(parent, mat, 0.85);
  mesh(new THREE.SphereGeometry(0.34, 48, 32), mat, parent, [0, 0.95, 0], [0.8, 1.7, 1]);
  mesh(new THREE.SphereGeometry(0.23, 40, 28), mat, parent, [0, 1.55, 0.1]);
  const beak = mesh(new THREE.ConeGeometry(0.07, 0.22, 20), mat, parent, [0, 1.57, 0.36]);
  beak.rotation.x = Math.PI / 2;
  for (const side of [-1, 1])
    mesh(extrude(wing(side), 0.12, 0.055), mat, parent, [side * 0.18, 0.83, -0.12]);
  const tail = new THREE.Shape();
  tail.moveTo(-0.16, 0.6);
  tail.lineTo(-0.4, 0.24);
  tail.quadraticCurveTo(0, 0.34, 0.4, 0.24);
  tail.lineTo(0.16, 0.6);
  tail.closePath();
  mesh(extrude(tail, 0.12, 0.03), mat, parent, [0, 0, -0.15]);
}
function buildBible(parent: THREE.Object3D, mat: THREE.Material) {
  const pages = new THREE.MeshStandardMaterial({ color: '#f5efdf', roughness: 0.92 }),
    ink = new THREE.MeshStandardMaterial({ color: '#aa9878', roughness: 0.92 });
  base(parent, mat, 0.9);
  mesh(new THREE.CylinderGeometry(0.12, 0.24, 0.5, 48), mat, parent, [0, 0.38, -0.08]);
  for (const side of [-1, 1]) {
    const half = new THREE.Group();
    half.position.set(side * 0.43, 1.22, 0);
    half.rotation.y = side * -0.22;
    parent.add(half);
    mesh(extrude(roundedShape(0.91, 1.4, 0.05), 0.08, 0.018), mat, half, [0, 0, -0.09]);
    mesh(extrude(roundedShape(0.83, 1.32, 0.025), 0.1, 0.012), pages, half, [0, 0, 0]);
    for (let i = 0; i < 9; i++) {
      if (side === 1 && i >= 3 && i <= 6) continue;
      mesh(extrude(roundedShape(i === 8 ? 0.4 : 0.62, 0.012, 0.005), 0.004, 0.001), ink, half, [
        0,
        -0.45 + i * 0.105,
        0.07,
      ]);
    }
    if (side === 1) {
      mesh(extrude(roundedShape(0.065, 0.34, 0.012), 0.008, 0.002), ink, half, [0, 0.03, 0.074]);
      mesh(extrude(roundedShape(0.25, 0.065, 0.012), 0.008, 0.002), ink, half, [0, 0.08, 0.074]);
    }
  }
  mesh(new THREE.CylinderGeometry(0.065, 0.065, 1.4, 32), mat, parent, [0, 1.22, -0.08]);
}
async function buildWord(parent: THREE.Object3D, mat: THREE.Material) {
  const f = await font(),
    opts = {
      font: f,
      size: 1.7,
      depth: 0.25,
      curveSegments: 12,
      bevelEnabled: true,
      bevelThickness: 0.025,
      bevelSize: 0.02,
      bevelSegments: 3,
    };
  const hasAccent = !!f.data.glyphs['é'],
    g = new TextGeometry(hasAccent ? 'Fé' : 'Fe', opts);
  g.computeBoundingBox();
  const centerX = (g.boundingBox!.max.x + g.boundingBox!.min.x) / 2;
  g.translate(-centerX, 0.12, -0.125);
  mesh(g, mat, parent);
  if (!hasAccent) {
    const eg = new TextGeometry('e', opts);
    eg.computeBoundingBox();
    const top = eg.boundingBox!.max.y + 0.12,
      ex =
        ((f.data.glyphs.F.ha + (f.data.glyphs.e.x_min + f.data.glyphs.e.x_max) / 2) * 1.7) /
          f.data.resolution -
        centerX;
    eg.dispose();
    const accent = mesh(extrude(roundedShape(0.12, 0.36, 0.03), 0.25, 0.018), mat, parent, [
      ex + 0.05,
      top + 0.22,
      0,
    ]);
    accent.rotation.z = -0.55;
  }
  base(parent, mat, 1.05);
}

export async function createViewer(
  container: HTMLDivElement,
  product: Pick<Product, 'id' | 'name'>,
  color: string,
  onAutoChange?: (active: boolean) => void,
) {
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    powerPreference: 'low-power',
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor('#eee7db');
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  const scene = new THREE.Scene(),
    camera = new THREE.PerspectiveCamera(33, 1, 0.05, 100),
    root = new THREE.Group(),
    content = new THREE.Group();
  root.add(content);
  scene.add(root);
  const material = new THREE.MeshStandardMaterial({
    color: color || '#eee8db',
    roughness: 0.78,
    metalness: 0,
  });
  scene.add(new THREE.HemisphereLight('#fff8e8', '#71644e', 2.9));
  const key = new THREE.DirectionalLight('#fff5df', 3.7);
  key.position.set(4, 7, 5);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = -5;
  key.shadow.camera.right = 5;
  key.shadow.camera.top = 5;
  key.shadow.camera.bottom = -5;
  key.shadow.bias = -0.0004;
  scene.add(key);
  const fill = new THREE.DirectionalLight('#fffdf2', 1.2);
  fill.position.set(-5, 3, -3);
  scene.add(fill);
  try {
    switch (product.id) {
      case 'cruz-essencial':
        buildCross(content, material);
        break;
      case 'nossa-senhora':
        buildMary(content, material);
        break;
      case 'espirito-santo':
        buildDove(content, material);
        break;
      case 'palavra-fe':
        await buildWord(content, material);
        break;
      case 'sagrada-familia':
        buildFamily(content, material);
        break;
      case 'biblia-viva':
        buildBible(content, material);
        break;
      default:
        buildCross(content, material);
    }
  } catch (e) {
    renderer.dispose();
    throw e;
  }
  const bounds = new THREE.Box3().setFromObject(content),
    center = bounds.getCenter(new THREE.Vector3()),
    size = bounds.getSize(new THREE.Vector3());
  content.position.sub(center);
  const max = Math.max(size.x, size.y, size.z),
    distance = max * 2.35;
  const start = new THREE.Vector3(0.9, 0.48, 1.65).normalize().multiplyScalar(distance);
  camera.position.copy(start);
  const floor = mesh(
    new THREE.PlaneGeometry(50, 50),
    new THREE.ShadowMaterial({ opacity: 0.14 }),
    scene,
    [0, -size.y / 2 - 0.012, 0],
  );
  floor.rotation.x = -Math.PI / 2;
  floor.castShadow = false;
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.09;
  controls.enablePan = false;
  controls.minDistance = max * 1.05;
  controls.maxDistance = max * 5;
  controls.minPolarAngle = 0.06;
  controls.maxPolarAngle = Math.PI - 0.06;
  controls.autoRotate = false;
  controls.autoRotateSpeed = 1.2;
  controls.target.set(0, 0, 0);
  controls.update();
  const canvas = renderer.domElement;
  canvas.tabIndex = 0;
  canvas.setAttribute('role', 'img');
  canvas.setAttribute(
    'aria-label',
    'Modelo tridimensional ilustrativo de ' +
      product.name +
      '. Arraste para girar, use a roda para zoom. As setas também giram a peça.',
  );
  container.replaceChildren(canvas);
  let disposed = false,
    dirty = true,
    frame = 0;
  function resize() {
    const w = container.clientWidth,
      h = container.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    dirty = true;
  }
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  resize();
  controls.addEventListener('change', () => {
    dirty = true;
  });
  controls.addEventListener('start', () => {
    if (controls.autoRotate) {
      controls.autoRotate = false;
      onAutoChange?.(false);
    }
  });
  function tick() {
    if (disposed) return;
    const moved = controls.update();
    if (dirty || moved) {
      renderer.render(scene, camera);
      dirty = false;
    }
    frame = requestAnimationFrame(tick);
  }
  tick();
  function rotate(x: number, y = 0) {
    root.rotation.y += x;
    root.rotation.x = THREE.MathUtils.clamp(root.rotation.x + y, -1.4, 1.4);
    dirty = true;
  }
  function zoom(factor: number) {
    camera.position.multiplyScalar(factor);
    const len = camera.position.length();
    camera.position.setLength(
      THREE.MathUtils.clamp(len, controls.minDistance, controls.maxDistance),
    );
    controls.update();
    dirty = true;
  }
  const onKey = (e: KeyboardEvent) => {
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '=', '-', '0'].includes(e.key))
      e.preventDefault();
    if (e.key === 'ArrowLeft') rotate(-0.16);
    if (e.key === 'ArrowRight') rotate(0.16);
    if (e.key === 'ArrowUp') rotate(0, -0.12);
    if (e.key === 'ArrowDown') rotate(0, 0.12);
    if (e.key === '+' || e.key === '=') zoom(0.9);
    if (e.key === '-') zoom(1.1);
    if (e.key === '0') reset();
  };
  canvas.addEventListener('keydown', onKey);
  function reset() {
    controls.autoRotate = false;
    onAutoChange?.(false);
    root.rotation.set(0, 0, 0);
    camera.position.copy(start);
    controls.target.set(0, 0, 0);
    controls.update();
    dirty = true;
  }
  return {
    rotate,
    zoom,
    reset,
    setColor(hex: string) {
      material.color.set(hex);
      dirty = true;
    },
    toggleAuto() {
      controls.autoRotate = !controls.autoRotate;
      dirty = true;
      return controls.autoRotate;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();
      canvas.removeEventListener('keydown', onKey);
      scene.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.dispose();
        }
      });
      renderer.dispose();
      canvas.remove();
    },
  };
}

export type ViewerController = Awaited<ReturnType<typeof createViewer>>;

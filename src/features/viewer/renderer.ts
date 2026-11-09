import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { Product } from '@/lib/domain/types';
import { loadAsset } from '@/lib/media/assets';
import { parseModel, disposeModel } from '@/lib/media/model';
export interface ViewerController {
  rotate(angle: number): void;
  zoom(factor: number): void;
  reset(): void;
  toggleAuto(): boolean;
  setColor(color: string): void;
  dispose(): void;
}
export async function createViewer(
  container: HTMLElement,
  product: Product,
  color: string,
  onAuto: (active: boolean) => void,
): Promise<ViewerController> {
  if (!product.model || product.model.status !== 'ready')
    throw new Error('Envie um modelo antes de abrir a visualização.');
  const root = product.model.previewUrl
    ? (await new GLTFLoader().loadAsync(product.model.previewUrl)).scene
    : (
        await parseModel(
          await (await loadAsset(product.model.assetId)).blob.arrayBuffer(),
          product.model.format,
        )
      ).object;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#f0eee5');
  const bounds = new THREE.Box3().setFromObject(root),
    center = bounds.getCenter(new THREE.Vector3()),
    size = bounds.getSize(new THREE.Vector3()),
    scale = 3 / Math.max(size.x, size.y, size.z);
  root.position.sub(center);
  const pivot = new THREE.Group();
  pivot.add(root);
  pivot.scale.setScalar(scale);
  scene.add(pivot);
  root.traverse((node) => {
    if (node instanceof THREE.Mesh) {
      const old = Array.isArray(node.material) ? node.material : [node.material];
      old.forEach((m) => m.dispose());
      node.material = new THREE.MeshStandardMaterial({ color, roughness: 0.68, metalness: 0.02 });
    }
  });
  const camera = new THREE.PerspectiveCamera(38, 1, 0.01, 100);
  camera.position.set(4, 2.3, 5.4);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x778065, 2.5));
  const light = new THREE.DirectionalLight(0xffffff, 3);
  light.position.set(3, 6, 5);
  scene.add(light);
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  } catch (error) {
    disposeModel(root);
    throw error;
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const canvas = renderer.domElement;
  canvas.tabIndex = 0;
  canvas.setAttribute(
    'aria-label',
    `Modelo de ${product.name}. Setas para girar, mais e menos para zoom.`,
  );
  canvas.setAttribute('role', 'img');
  container.appendChild(canvas);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.09;
  controls.minDistance = 2;
  controls.maxDistance = 12;
  controls.autoRotateSpeed = 1;
  controls.enablePan = false;
  let frame = 0,
    disposed = false;
  const resize = () => {
    const w = container.clientWidth,
      h = container.clientHeight || 400;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  resize();
  const rotate = (angle: number) => {
    pivot.rotation.y += angle;
  };
  const zoom = (factor: number) => {
    camera.position.multiplyScalar(factor);
    camera.position.clampLength(2, 12);
  };
  const key = (e: KeyboardEvent) => {
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '-', '='].includes(e.key)) {
      e.preventDefault();
      controls.autoRotate = false;
      onAuto(false);
      if (e.key === 'ArrowLeft') rotate(-0.15);
      else if (e.key === 'ArrowRight') rotate(0.15);
      else zoom(['+', '=', 'ArrowUp'].includes(e.key) ? 0.9 : 1.1);
    }
  };
  canvas.addEventListener('keydown', key);
  const render = () => {
    if (disposed) return;
    controls.update();
    renderer.render(scene, camera);
    frame = requestAnimationFrame(render);
  };
  render();
  return {
    rotate,
    zoom,
    reset() {
      pivot.rotation.set(0, 0, 0);
      camera.position.set(4, 2.3, 5.4);
      controls.target.set(0, 0, 0);
      controls.autoRotate = false;
      onAuto(false);
    },
    toggleAuto() {
      controls.autoRotate = !controls.autoRotate;
      return controls.autoRotate;
    },
    setColor(value) {
      root.traverse((n) => {
        if (n instanceof THREE.Mesh) (n.material as THREE.MeshStandardMaterial).color.set(value);
      });
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();
      canvas.removeEventListener('keydown', key);
      disposeModel(root);
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
}

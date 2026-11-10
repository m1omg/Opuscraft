import * as THREE from 'three';
import { DEFS } from '../data/registry';
import { instantiate, templateFor } from '../render/models';
import { worldUniforms } from '../render/materials';
import { iconURL } from './icons';

/** Renders unit/building thumbnails with a small offscreen WebGL renderer, cached as data URLs. */
class PortraitStudio {
  private renderer: THREE.WebGLRenderer | null = null;
  private scene = new THREE.Scene();
  private cam = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  private cache = new Map<string, string>();
  private failed = false;
  private size = 128;

  private init(): boolean {
    if (this.renderer || this.failed) return !!this.renderer;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = this.size;
      canvas.height = this.size;
      this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
      this.renderer.setSize(this.size, this.size, false);
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.scene.add(new THREE.HemisphereLight(0xdde6ff, 0x4a3a2a, 1.3));
      const sun = new THREE.DirectionalLight(0xfff1d6, 2.4);
      sun.position.set(3, 5, 4);
      this.scene.add(sun);
      const rim = new THREE.DirectionalLight(0x9ab0ff, 1.0);
      rim.position.set(-4, 3, -3);
      this.scene.add(rim);
      return true;
    } catch {
      this.failed = true;
      return false;
    }
  }

  get(defId: string, team: number): string {
    const key = defId + '|' + team;
    const hit = this.cache.get(key);
    if (hit) return hit;
    const def = DEFS[defId];
    if (!def) return iconURL(undefined);
    if (!this.init()) {
      const url = iconURL(def.icon ?? { glyph: def.kind === 'building' ? 'castle' : 'helm', bg: 0x444455 });
      this.cache.set(key, url);
      return url;
    }
    const rig = instantiate(templateFor(def, team));
    const root = rig.root;
    this.scene.add(root);
    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const building = def.kind === 'building' || def.model.kind === 'mine';
    // frame: buildings whole, units slightly toward the upper body
    const target = building ? center : new THREE.Vector3(center.x, box.min.y + size.y * 0.58, center.z);
    const extent = building ? Math.max(size.x, size.y, size.z) * 0.95 : Math.max(size.y * 0.8, size.x * 0.65, size.z * 0.65);
    const dist = extent / (2 * Math.tan((this.cam.fov * Math.PI) / 360)) * 1.12;
    const dir = new THREE.Vector3(1.0, building ? 0.75 : 0.35, 0.75).normalize();
    root.rotation.y = building ? 0 : -0.35;
    this.cam.position.copy(target).addScaledVector(dir, dist);
    this.cam.lookAt(target);
    this.cam.updateProjectionMatrix();
    const fogWas = worldUniforms.uFogEnabled.value;
    worldUniforms.uFogEnabled.value = 0;
    this.renderer!.setClearColor(0x000000, 0);
    this.renderer!.render(this.scene, this.cam);
    worldUniforms.uFogEnabled.value = fogWas;
    const url = this.renderer!.domElement.toDataURL();
    this.scene.remove(root);
    this.cache.set(key, url);
    return url;
  }
}

export const portraits = new PortraitStudio();

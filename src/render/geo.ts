import * as THREE from 'three';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _c = new THREE.Color();
const _v = new THREE.Vector3();

// cache of unit primitives (non-indexed)
const prims = new Map<string, THREE.BufferGeometry>();
function prim(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let g = prims.get(key);
  if (!g) {
    g = make();
    if (g.index) g = g.toNonIndexed();
    g.deleteAttribute('uv');
    g.deleteAttribute('normal');
    prims.set(key, g);
  }
  return g;
}

export interface Xf {
  x?: number;
  y?: number;
  z?: number;
  rx?: number;
  ry?: number;
  rz?: number;
  sx?: number;
  sy?: number;
  sz?: number;
}

/** Accumulates colored low-poly primitives into one BufferGeometry. */
export class Geo {
  pos: number[] = [];
  col: number[] = [];
  /** per-vertex color jitter for a hand-made look */
  jitter = 0.06;
  private seed = 1;

  private rand(): number {
    this.seed = (this.seed * 16807) % 2147483647;
    return this.seed / 2147483647;
  }

  add(g: THREE.BufferGeometry, color: number, t: Xf): this {
    _e.set(t.rx ?? 0, t.ry ?? 0, t.rz ?? 0);
    _q.setFromEuler(_e);
    _s.set(t.sx ?? 1, t.sy ?? 1, t.sz ?? 1);
    _p.set(t.x ?? 0, t.y ?? 0, t.z ?? 0);
    _m.compose(_p, _q, _s);
    const a = g.getAttribute('position') as THREE.BufferAttribute;
    _c.setHex(color);
    for (let i = 0; i < a.count; i += 3) {
      const j = 1 + (this.rand() - 0.5) * this.jitter * 2;
      for (let k = 0; k < 3; k++) {
        _v.fromBufferAttribute(a, i + k).applyMatrix4(_m);
        this.pos.push(_v.x, _v.y, _v.z);
        this.col.push(Math.min(1, _c.r * j), Math.min(1, _c.g * j), Math.min(1, _c.b * j));
      }
    }
    return this;
  }

  box(w: number, h: number, d: number, color: number, t: Xf = {}): this {
    return this.add(prim('box', () => new THREE.BoxGeometry(1, 1, 1)), color, { ...t, sx: w * (t.sx ?? 1), sy: h * (t.sy ?? 1), sz: d * (t.sz ?? 1) });
  }
  /** cylinder with separate top/bottom radius; `seg` sides */
  cyl(rt: number, rb: number, h: number, seg: number, color: number, t: Xf = {}): this {
    const key = `cyl${seg}_${(rt / Math.max(rb, 1e-3)).toFixed(3)}`;
    const ratio = rt / Math.max(rb, 1e-3);
    const g = prim(key, () => new THREE.CylinderGeometry(ratio, 1, 1, seg, 1));
    return this.add(g, color, { ...t, sx: rb * (t.sx ?? 1), sy: h * (t.sy ?? 1), sz: rb * (t.sz ?? 1) });
  }
  cone(r: number, h: number, seg: number, color: number, t: Xf = {}): this {
    const g = prim(`cone${seg}`, () => new THREE.ConeGeometry(1, 1, seg, 1));
    return this.add(g, color, { ...t, sx: r * (t.sx ?? 1), sy: h * (t.sy ?? 1), sz: r * (t.sz ?? 1) });
  }
  sphere(r: number, color: number, t: Xf = {}, detail = 1): this {
    const g = prim(`ico${detail}`, () => new THREE.IcosahedronGeometry(1, detail));
    return this.add(g, color, { ...t, sx: r * (t.sx ?? 1), sy: r * (t.sy ?? 1), sz: r * (t.sz ?? 1) });
  }
  dodeca(r: number, color: number, t: Xf = {}): this {
    const g = prim('dodeca', () => new THREE.DodecahedronGeometry(1, 0));
    return this.add(g, color, { ...t, sx: r * (t.sx ?? 1), sy: r * (t.sy ?? 1), sz: r * (t.sz ?? 1) });
  }
  octa(r: number, color: number, t: Xf = {}): this {
    const g = prim('octa', () => new THREE.OctahedronGeometry(1, 0));
    return this.add(g, color, { ...t, sx: r * (t.sx ?? 1), sy: r * (t.sy ?? 1), sz: r * (t.sz ?? 1) });
  }
  torus(r: number, tube: number, color: number, t: Xf = {}): this {
    const key = `torus${(tube / r).toFixed(2)}`;
    const g = prim(key, () => new THREE.TorusGeometry(1, tube / r, 4, 10));
    return this.add(g, color, { ...t, sx: r * (t.sx ?? 1), sy: r * (t.sy ?? 1), sz: r * (t.sz ?? 1) });
  }
  /** a flat triangle-ish wedge (wings, blades) */
  wedge(w: number, h: number, d: number, color: number, t: Xf = {}): this {
    const g = prim('wedge', () => {
      const s = new THREE.Shape();
      s.moveTo(0, 0);
      s.lineTo(1, 0);
      s.lineTo(0, 1);
      s.lineTo(0, 0);
      return new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false });
    });
    return this.add(g, color, { ...t, sx: w * (t.sx ?? 1), sy: h * (t.sy ?? 1), sz: d * (t.sz ?? 1) });
  }

  get empty(): boolean {
    return this.pos.length === 0;
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }
}

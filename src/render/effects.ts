import * as THREE from 'three';
import type { Projectile } from '../sim/combat';
import type { GameMap } from '../sim/map';
import { worldUniforms } from './materials';
import { projectileGeometry } from './models';

// ---------------------------------------------------------------------------
// particles
// ---------------------------------------------------------------------------
export interface EmitOpts {
  count: number;
  color: number;
  color2?: number;
  speed?: number;
  up?: number; // extra upward velocity
  spread?: number; // positional spread radius
  life?: number;
  size?: number;
  size2?: number;
  gravity?: number;
  drag?: number;
  shape?: 'burst' | 'ring' | 'disc' | 'column' | 'sphere';
  radius?: number;
}

class ParticleSystem {
  readonly points: THREE.Points;
  private max: number;
  private pos: Float32Array;
  private col: Float32Array;
  private size: Float32Array;
  private vel: Float32Array;
  private life: Float32Array;
  private maxLife: Float32Array;
  private grav: Float32Array;
  private drag: Float32Array;
  private s0: Float32Array;
  private s1: Float32Array;
  private c0: Float32Array;
  private c1: Float32Array;
  private alive = 0;
  private geo: THREE.BufferGeometry;

  constructor(max: number, additive: boolean) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 4);
    this.size = new Float32Array(max);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.s0 = new Float32Array(max);
    this.s1 = new Float32Array(max);
    this.c0 = new Float32Array(max * 3);
    this.c1 = new Float32Array(max * 3);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setDrawRange(0, 0);
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: { uScale: { value: 400 }, uFog: worldUniforms.uFog, uMapSize: worldUniforms.uMapSize, uFogEnabled: worldUniforms.uFogEnabled },
      vertexShader: `
        attribute float size;
        attribute vec4 color;
        uniform float uScale;
        uniform sampler2D uFog;
        uniform vec2 uMapSize;
        uniform float uFogEnabled;
        varying vec4 vColor;
        void main() {
          vColor = color;
          if (uFogEnabled > 0.5) {
            float fv = texture2D(uFog, position.xz / uMapSize).r;
            vColor.a *= smoothstep(0.55, 0.9, fv);
          }
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * uScale / -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying vec4 vColor;
        void main() {
          vec2 d = gl_PointCoord - 0.5;
          float r = dot(d, d);
          if (r > 0.25) discard;
          float a = smoothstep(0.25, 0.0, r);
          gl_FragColor = vec4(vColor.rgb, vColor.a * a);
        }`,
    });
    this.points = new THREE.Points(this.geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 5 : 4;
  }

  setScale(s: number): void {
    (this.points.material as THREE.ShaderMaterial).uniforms.uScale.value = s;
  }

  emit(x: number, y: number, z: number, o: EmitOpts): void {
    const c0 = new THREE.Color(o.color);
    const c1 = new THREE.Color(o.color2 ?? o.color);
    for (let n = 0; n < o.count; n++) {
      if (this.alive >= this.max) return;
      const i = this.alive++;
      const sp = o.speed ?? 1;
      let vx = 0;
      let vy = 0;
      let vz = 0;
      let px = x;
      let py = y;
      let pz = z;
      const ang = Math.random() * Math.PI * 2;
      const shape = o.shape ?? 'burst';
      if (shape === 'ring') {
        const r = o.radius ?? 1;
        px += Math.cos(ang) * r;
        pz += Math.sin(ang) * r;
        vx = Math.cos(ang) * sp;
        vz = Math.sin(ang) * sp;
        vy = (o.up ?? 0) * (0.5 + Math.random() * 0.5);
      } else if (shape === 'disc') {
        const r = Math.sqrt(Math.random()) * (o.radius ?? 1);
        px += Math.cos(ang) * r;
        pz += Math.sin(ang) * r;
        vx = (Math.random() - 0.5) * sp;
        vz = (Math.random() - 0.5) * sp;
        vy = (o.up ?? 0) * (0.4 + Math.random() * 0.6);
      } else if (shape === 'column') {
        const r = Math.random() * (o.radius ?? 0.4);
        px += Math.cos(ang) * r;
        pz += Math.sin(ang) * r;
        vy = (o.up ?? 3) * (0.5 + Math.random());
      } else {
        const u = Math.random() * 2 - 1;
        const s = Math.sqrt(1 - u * u);
        vx = Math.cos(ang) * s * sp * (0.4 + Math.random() * 0.6);
        vz = Math.sin(ang) * s * sp * (0.4 + Math.random() * 0.6);
        vy = (shape === 'sphere' ? u * sp : Math.abs(u) * sp * 0.6) + (o.up ?? 0) * (0.5 + Math.random() * 0.5);
        const spr = o.spread ?? 0;
        if (spr > 0) {
          px += (Math.random() - 0.5) * spr * 2;
          py += Math.random() * spr * 0.5;
          pz += (Math.random() - 0.5) * spr * 2;
        }
      }
      this.pos[i * 3] = px;
      this.pos[i * 3 + 1] = py;
      this.pos[i * 3 + 2] = pz;
      this.vel[i * 3] = vx;
      this.vel[i * 3 + 1] = vy;
      this.vel[i * 3 + 2] = vz;
      const life = (o.life ?? 0.8) * (0.7 + Math.random() * 0.6);
      this.life[i] = life;
      this.maxLife[i] = life;
      this.grav[i] = o.gravity ?? 0;
      this.drag[i] = o.drag ?? 1.5;
      this.s0[i] = (o.size ?? 0.3) * (0.7 + Math.random() * 0.6);
      this.s1[i] = o.size2 ?? this.s0[i] * 0.3;
      const t = Math.random();
      this.c0[i * 3] = c0.r + (c1.r - c0.r) * t;
      this.c0[i * 3 + 1] = c0.g + (c1.g - c0.g) * t;
      this.c0[i * 3 + 2] = c0.b + (c1.b - c0.b) * t;
      this.c1[i * 3] = c1.r;
      this.c1[i * 3 + 1] = c1.g;
      this.c1[i * 3 + 2] = c1.b;
    }
  }

  update(dt: number): void {
    let i = 0;
    while (i < this.alive) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.swapRemove(i);
        continue;
      }
      const dr = Math.exp(-this.drag[i] * dt);
      this.vel[i * 3] *= dr;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * dr - this.grav[i] * dt;
      this.vel[i * 3 + 2] *= dr;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      const t = 1 - this.life[i] / this.maxLife[i];
      this.size[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * t;
      this.col[i * 4] = this.c0[i * 3];
      this.col[i * 4 + 1] = this.c0[i * 3 + 1];
      this.col[i * 4 + 2] = this.c0[i * 3 + 2];
      this.col[i * 4 + 3] = t < 0.15 ? t / 0.15 : 1 - (t - 0.15) / 0.85;
      i++;
    }
    this.geo.setDrawRange(0, this.alive);
    (this.geo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.getAttribute('size') as THREE.BufferAttribute).needsUpdate = true;
  }

  private swapRemove(i: number): void {
    const j = --this.alive;
    if (i === j) return;
    const copy3 = (a: Float32Array) => {
      a[i * 3] = a[j * 3];
      a[i * 3 + 1] = a[j * 3 + 1];
      a[i * 3 + 2] = a[j * 3 + 2];
    };
    copy3(this.pos);
    copy3(this.vel);
    copy3(this.c0);
    copy3(this.c1);
    this.col[i * 4] = this.col[j * 4];
    this.col[i * 4 + 1] = this.col[j * 4 + 1];
    this.col[i * 4 + 2] = this.col[j * 4 + 2];
    this.col[i * 4 + 3] = this.col[j * 4 + 3];
    this.life[i] = this.life[j];
    this.maxLife[i] = this.maxLife[j];
    this.grav[i] = this.grav[j];
    this.drag[i] = this.drag[j];
    this.s0[i] = this.s0[j];
    this.s1[i] = this.s1[j];
    this.size[i] = this.size[j];
  }

  clear(): void {
    this.alive = 0;
  }
}

// ---------------------------------------------------------------------------
// transient meshes (shockwave rings, beams, decals)
// ---------------------------------------------------------------------------
interface Transient {
  obj: THREE.Object3D;
  t: number;
  dur: number;
  update: (k: number, dt: number) => void;
  done?: () => void;
}

const ringGeo = new THREE.RingGeometry(0.85, 1, 40);
ringGeo.rotateX(-Math.PI / 2);
const discGeo = new THREE.CircleGeometry(1, 32);
discGeo.rotateX(-Math.PI / 2);

export class Effects {
  readonly group = new THREE.Group();
  readonly glow: ParticleSystem;
  readonly smoke: ParticleSystem;
  private transients: Transient[] = [];
  private projMeshes = new Map<number, THREE.Mesh>();
  private projPool = new Map<string, THREE.Mesh[]>();
  private projGeo = new Map<string, { geo: THREE.BufferGeometry; glow: boolean }>();
  private map: GameMap;
  quality = 1;

  constructor(map: GameMap) {
    this.map = map;
    this.glow = new ParticleSystem(7000, true);
    this.smoke = new ParticleSystem(3000, false);
    this.group.add(this.glow.points, this.smoke.points);
  }

  h(x: number, z: number): number {
    return this.map.heightAt(x, z);
  }

  setViewportScale(px: number): void {
    this.glow.setScale(px);
    this.smoke.setScale(px);
  }

  // --------------------------------------------------------------- basic shapes
  ring(x: number, z: number, r0: number, r1: number, color: number, dur = 0.5, y?: number, opacity = 0.8): void {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const m = new THREE.Mesh(ringGeo, mat);
    const gy = (y ?? this.h(x, z)) + 0.08;
    m.position.set(x, gy, z);
    m.renderOrder = 6;
    this.add({
      obj: m,
      t: 0,
      dur,
      update: (k) => {
        const r = r0 + (r1 - r0) * (1 - Math.pow(1 - k, 2));
        m.scale.set(r, 1, r);
        mat.opacity = opacity * (1 - k);
      },
      done: () => mat.dispose(),
    });
  }

  disc(x: number, z: number, r: number, color: number, dur: number, opacity = 0.35, pulse = false): void {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending });
    const m = new THREE.Mesh(discGeo, mat);
    m.position.set(x, this.h(x, z) + 0.06, z);
    m.scale.set(r, 1, r);
    m.renderOrder = 6;
    this.add({
      obj: m,
      t: 0,
      dur,
      update: (k) => {
        const fade = k < 0.1 ? k / 0.1 : k > 0.85 ? (1 - k) / 0.15 : 1;
        mat.opacity = opacity * fade * (pulse ? 0.75 + 0.25 * Math.sin(k * dur * 6) : 1);
      },
      done: () => mat.dispose(),
    });
  }

  beam(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, color: number, dur = 0.25, jag = 0.5, width = 1): void {
    const pts: THREE.Vector3[] = [];
    const n = Math.max(2, Math.round(Math.hypot(x1 - x0, z1 - z0) * 1.5));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const j = i === 0 || i === n ? 0 : jag;
      pts.push(new THREE.Vector3(x0 + (x1 - x0) * t + (Math.random() - 0.5) * j, y0 + (y1 - y0) * t + (Math.random() - 0.5) * j, z0 + (z1 - z0) * t + (Math.random() - 0.5) * j));
    }
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false, linewidth: width });
    const line = new THREE.Line(geo, mat);
    line.renderOrder = 7;
    this.add({
      obj: line,
      t: 0,
      dur,
      update: (k) => {
        mat.opacity = 1 - k;
      },
      done: () => {
        geo.dispose();
        mat.dispose();
      },
    });
    // glow along the beam
    for (let i = 0; i <= n; i += 2) this.glow.emit(pts[i].x, pts[i].y, pts[i].z, { count: 1, color, life: dur * 1.5, size: 0.35 * width, speed: 0.1 });
  }

  /** a glowing sphere falling from the sky, then calling `land` */
  meteor(x: number, z: number, color: number, delay: number, size: number, land: () => void): void {
    const geo = new THREE.IcosahedronGeometry(size, 1);
    const mat = new THREE.MeshBasicMaterial({ color });
    const m = new THREE.Mesh(geo, mat);
    const gy = this.h(x, z);
    this.add({
      obj: m,
      t: 0,
      dur: Math.max(0.1, delay),
      update: (k) => {
        m.position.set(x - (1 - k) * 4, gy + (1 - k) * 12, z - (1 - k) * 2);
        if (Math.random() < 0.8) this.glow.emit(m.position.x, m.position.y, m.position.z, { count: 1, color, color2: 0x552200, life: 0.4, size: size * 1.6, speed: 0.3 });
      },
      done: () => {
        geo.dispose();
        mat.dispose();
        land();
      },
    });
  }

  private add(t: Transient): void {
    this.group.add(t.obj);
    this.transients.push(t);
  }

  // --------------------------------------------------------------- projectiles
  syncProjectiles(list: Projectile[], alpha: number, visible: (x: number, y: number) => boolean): void {
    const seen = new Set<number>();
    for (const p of list) {
      if (p.done) continue;
      seen.add(p.id);
      let m = this.projMeshes.get(p.id);
      const key = p.def.kind + (p.def.color ?? '');
      if (!m) {
        m = this.takeProj(key, p);
        this.projMeshes.set(p.id, m);
      }
      const x = p.px + (p.x - p.px) * alpha;
      const y = p.py + (p.y - p.py) * alpha;
      const z = p.pz + (p.z - p.pz) * alpha;
      m.visible = visible(x, y);
      m.position.set(x, z, y);
      const dx = p.x - p.px;
      const dy = p.y - p.py;
      const dz = p.z - p.pz;
      if (p.def.kind === 'blade' || p.def.kind === 'boulder' || p.def.kind === 'bone') m.rotation.y += 0.4;
      else if (dx * dx + dy * dy > 1e-6) {
        m.rotation.set(0, -Math.atan2(dy, dx), Math.atan2(dz, Math.hypot(dx, dy)));
        m.rotation.order = 'YZX';
      }
      if (m.visible && (p.def.kind === 'orb' || p.def.kind === 'bolt') && Math.random() < 0.7 * this.quality) {
        this.glow.emit(x, z, y, { count: 1, color: p.def.color ?? 0xffffff, life: 0.35, size: 0.32 * (p.def.size ?? 1), speed: 0.15 });
      }
      if (m.visible && (p.def.kind === 'shell' || p.def.kind === 'boulder') && Math.random() < 0.4 * this.quality) {
        this.smoke.emit(x, z, y, { count: 1, color: 0x9a9a9a, life: 0.6, size: 0.35, size2: 0.7, speed: 0.1 });
      }
    }
    for (const [id, m] of this.projMeshes) {
      if (!seen.has(id)) {
        this.projMeshes.delete(id);
        m.visible = false;
        const key = m.userData.key as string;
        (this.projPool.get(key) ?? this.projPool.set(key, []).get(key)!).push(m);
      }
    }
  }

  private takeProj(key: string, p: Projectile): THREE.Mesh {
    const pool = this.projPool.get(key);
    if (pool && pool.length) {
      const m = pool.pop()!;
      m.visible = true;
      return m;
    }
    let g = this.projGeo.get(key);
    if (!g) {
      g = projectileGeometry(p.def.kind, p.def.color);
      this.projGeo.set(key, g);
    }
    const mat = g.glow ? new THREE.MeshBasicMaterial({ vertexColors: true }) : new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    const m = new THREE.Mesh(g.geo, mat);
    const sz = p.def.size ?? 1;
    m.scale.setScalar(sz);
    m.userData.key = key;
    this.group.add(m);
    return m;
  }

  // --------------------------------------------------------------- update
  update(dt: number): void {
    this.glow.update(dt);
    this.smoke.update(dt);
    const keep: Transient[] = [];
    for (const t of this.transients) {
      t.t += dt;
      const k = Math.min(1, t.t / t.dur);
      t.update(k, dt);
      if (k >= 1) {
        this.group.remove(t.obj);
        t.done?.();
      } else keep.push(t);
    }
    this.transients = keep;
  }

  // --------------------------------------------------------------- named effects
  /** Play a named spell/impact effect at a ground position. */
  play(name: string, x: number, z: number, opts: { r?: number; color?: number; dur?: number; x2?: number; z2?: number; y?: number; y2?: number } = {}): void {
    const gy = this.h(x, z);
    const r = opts.r ?? 1.5;
    const q = this.quality;
    const col = opts.color;
    const N = (n: number) => Math.max(1, Math.round(n * q));
    switch (name) {
      case 'blast':
      case 'explosion':
      case 'splash':
        this.glow.emit(x, gy + 0.3, z, { count: N(name === 'splash' ? 10 : 26), color: col ?? 0xffa040, color2: 0xff3010, speed: r * 2.5, life: 0.45, size: 0.55, up: 1 });
        this.smoke.emit(x, gy + 0.3, z, { count: N(name === 'splash' ? 5 : 14), color: 0x5a5048, speed: r * 1.2, life: 1.2, size: 0.6, size2: 1.4, up: 1.2, drag: 2 });
        this.ring(x, z, 0.2, r, col ?? 0xffa040, 0.45);
        break;
      case 'quake':
      case 'fireRing':
      case 'roar':
      case 'stomp': {
        const c = name === 'fireRing' ? 0xff6a1a : name === 'roar' ? 0xff4040 : 0xc8a070;
        this.ring(x, z, 0.3, r, c, 0.5);
        this.ring(x, z, 0.2, r * 0.7, c, 0.35);
        this.smoke.emit(x, gy + 0.2, z, { count: N(18), color: name === 'fireRing' ? 0x6a3010 : 0x8a7a5a, speed: r * 2.2, life: 0.8, size: 0.5, size2: 1.0, shape: 'ring', radius: 0.4, up: 0.5 });
        if (name === 'fireRing') this.glow.emit(x, gy + 0.3, z, { count: N(30), color: 0xff8a2a, color2: 0xff3010, speed: r * 2, life: 0.5, size: 0.5, shape: 'ring', radius: 0.5 });
        break;
      }
      case 'lightning':
      case 'lightningStrike': {
        const y0 = opts.y ?? gy + 1.2;
        if (opts.x2 !== undefined && opts.z2 !== undefined) {
          const y1 = opts.y2 ?? this.h(opts.x2, opts.z2) + 0.8;
          this.beam(x, y0, z, opts.x2, y1, opts.z2, 0x9ad0ff, 0.3, 0.6, 2);
          this.glow.emit(opts.x2, y1, opts.z2, { count: N(10), color: 0xd0e8ff, speed: 3, life: 0.3, size: 0.35 });
        } else {
          this.beam(x, gy + 9, z, x, gy + 0.6, z, 0x9ad0ff, 0.3, 1.2, 2);
          this.glow.emit(x, gy + 0.6, z, { count: N(14), color: 0xd0e8ff, speed: 3, life: 0.35, size: 0.4 });
        }
        break;
      }
      case 'drain':
        if (opts.x2 !== undefined && opts.z2 !== undefined) {
          const y1 = this.h(opts.x2, opts.z2) + 0.9;
          this.beam(opts.x2, y1, opts.z2, x, gy + 1.0, z, col ?? 0xb04aff, 0.3, 0.25, 2);
        }
        break;
      case 'heal':
      case 'healArea':
      case 'regen':
        this.glow.emit(x, gy + 0.3, z, { count: N(name === 'healArea' ? 40 : 14), color: col ?? 0x7aff9a, color2: 0xe0ffe0, life: 0.9, size: 0.25, shape: name === 'healArea' ? 'disc' : 'column', radius: name === 'healArea' ? r : 0.4, up: 1.6, speed: 0.2 });
        if (name === 'healArea') this.ring(x, z, 0.3, r, 0x7aff9a, 0.6);
        break;
      case 'mana':
        this.glow.emit(x, gy + 0.3, z, { count: N(14), color: 0x7ab0ff, color2: 0xe0f0ff, life: 0.9, size: 0.25, shape: 'column', radius: 0.4, up: 1.6, speed: 0.2 });
        break;
      case 'buff':
      case 'buffArea':
      case 'rally':
      case 'laststand':
        this.glow.emit(x, gy + 0.2, z, { count: N(name === 'buff' ? 12 : 30), color: col ?? 0xffe080, life: 0.8, size: 0.25, shape: name === 'buff' ? 'column' : 'disc', radius: name === 'buff' ? 0.4 : r, up: 1.4, speed: 0.3 });
        this.ring(x, z, 0.3, name === 'buff' ? 0.9 : r, col ?? 0xffe080, 0.5);
        break;
      case 'summon':
      case 'raise':
      case 'unsummon':
      case 'transform':
      case 'tome':
        this.smoke.emit(x, gy + 0.3, z, { count: N(12), color: name === 'raise' ? 0x3a8a5a : 0x8a7aa0, speed: 1.2, life: 0.9, size: 0.5, size2: 1.0, up: 1 });
        this.glow.emit(x, gy + 0.4, z, { count: N(16), color: name === 'raise' ? 0x6dffb0 : col ?? 0xc8a0ff, speed: 1.5, life: 0.6, size: 0.3, up: 1.5 });
        break;
      case 'blinkOut':
      case 'blinkIn':
      case 'teleport':
        this.glow.emit(x, gy + 0.5, z, { count: N(name === 'teleport' ? 50 : 24), color: 0xb08aff, color2: 0x8ad0ff, speed: 2.2, life: 0.5, size: 0.35, shape: 'sphere', spread: name === 'teleport' ? r * 0.5 : 0 });
        if (name === 'teleport') this.glow.emit(x, gy, z, { count: N(40), color: 0x8ad0ff, life: 1, size: 0.3, shape: 'column', radius: r * 0.6, up: 6 });
        break;
      case 'dash':
        if (opts.x2 !== undefined && opts.z2 !== undefined) {
          const n = 10;
          for (let i = 0; i <= n; i++) {
            const t = i / n;
            const px = x + (opts.x2 - x) * t;
            const pz = z + (opts.z2 - z) * t;
            this.glow.emit(px, this.h(px, pz) + 0.7, pz, { count: 1, color: col ?? 0xb08aff, life: 0.4, size: 0.45, speed: 0.2 });
          }
        }
        break;
      case 'line':
      case 'holyline':
      case 'fissure':
      case 'fireline':
      case 'shotgun': {
        if (opts.x2 === undefined || opts.z2 === undefined) break;
        const c = name === 'holyline' ? 0xfff0a0 : name === 'fissure' ? 0xc8a070 : name === 'fireline' ? 0xff7a2a : name === 'shotgun' ? 0xffe0a0 : col ?? 0xffffff;
        const len = Math.hypot(opts.x2 - x, opts.z2 - z);
        const n = Math.round(len * 2.5 * q);
        for (let i = 0; i <= n; i++) {
          const t = i / Math.max(1, n);
          const px = x + (opts.x2 - x) * t + (Math.random() - 0.5) * r;
          const pz = z + (opts.z2 - z) * t + (Math.random() - 0.5) * r;
          const sys = name === 'fissure' ? this.smoke : this.glow;
          sys.emit(px, this.h(px, pz) + 0.3, pz, { count: 2, color: c, life: 0.6, size: name === 'fissure' ? 0.7 : 0.45, speed: 1.0, up: name === 'fissure' ? 2 : 0.6 });
        }
        break;
      }
      case 'warn':
        this.ring(x, z, r, r, col ?? 0xff5030, opts.dur ?? 0.6, undefined, 0.7);
        this.disc(x, z, r, col ?? 0xff5030, opts.dur ?? 0.6, 0.12);
        break;
      case 'meteor':
      case 'shellstrike':
        this.meteor(x, z, name === 'meteor' ? 0xff6a1a : 0x404040, opts.dur ?? 0.35, name === 'meteor' ? 0.35 : 0.2, () => this.play('explosion', x, z, { r }));
        break;
      case 'arrowRain':
        for (let i = 0; i < N(20); i++) {
          const a = Math.random() * Math.PI * 2;
          const d = Math.sqrt(Math.random()) * r;
          this.glow.emit(x + Math.cos(a) * d, gy + 6, z + Math.sin(a) * d, { count: 1, color: 0xcfe3ff, life: 0.55, size: 0.25, gravity: 18, speed: 0 });
        }
        this.ring(x, z, r, r, 0xcfe3ff, 0.6, undefined, 0.5);
        break;
      case 'zone':
      case 'holyzone':
      case 'witherzone':
      case 'plaguezone':
      case 'storm':
      case 'rootzone': {
        const c = name === 'holyzone' ? 0xfff0a0 : name === 'witherzone' ? 0x8a5a9a : name === 'plaguezone' ? 0x7aff5a : name === 'storm' ? 0x8ab0ff : name === 'rootzone' ? 0x5aaa3a : col ?? 0xffffff;
        const dur = opts.dur ?? 6;
        this.disc(x, z, r, c, dur, 0.22, true);
        this.ring(x, z, r, r, c, dur, undefined, 0.5);
        const self = this;
        let acc = 0;
        this.add({
          obj: new THREE.Object3D(),
          t: 0,
          dur,
          update(_k, dt) {
            acc += dt;
            while (acc > 0.12) {
              acc -= 0.12;
              const a = Math.random() * Math.PI * 2;
              const d = Math.sqrt(Math.random()) * r;
              const px = x + Math.cos(a) * d;
              const pz = z + Math.sin(a) * d;
              if (name === 'storm' && Math.random() < 0.25) self.beam(px, gy + 8, pz, px, self.h(px, pz) + 0.3, pz, 0xb0d0ff, 0.2, 1, 2);
              else (name === 'plaguezone' || name === 'witherzone' ? self.smoke : self.glow).emit(px, self.h(px, pz) + 0.2, pz, { count: 1, color: c, life: 1.2, size: name === 'plaguezone' ? 1.0 : 0.35, size2: name === 'plaguezone' ? 1.6 : 0.1, up: 1.0, speed: 0.2 });
            }
          },
        });
        break;
      }
      case 'dispel':
      case 'reveal':
        this.ring(x, z, 0.2, Math.max(1, r), name === 'reveal' ? 0xf0ffe0 : 0xffffff, 0.6);
        this.glow.emit(x, gy + 0.4, z, { count: N(20), color: name === 'reveal' ? 0xf0ffe0 : 0xd0e8ff, speed: 2, life: 0.5, size: 0.3, shape: 'ring', radius: Math.max(0.5, r * 0.6) });
        break;
      case 'bash':
      case 'charge':
      case 'cleave':
      case 'claw':
        this.glow.emit(x, gy + 0.6, z, { count: N(8), color: 0xfff0c0, speed: 3, life: 0.25, size: 0.3 });
        if (name === 'cleave') this.ring(x, z, 0.4, r, 0xffffff, 0.25, undefined, 0.4);
        break;
      case 'spellHit':
      case 'moonbeam':
      case 'chains':
      case 'roots':
      case 'bindMine':
      case 'thorns': {
        const c = name === 'moonbeam' ? 0xcfe3ff : name === 'chains' ? 0x6dffb0 : name === 'roots' || name === 'bindMine' || name === 'thorns' ? 0x6aaa3a : col ?? 0xffe0ff;
        if (name === 'moonbeam') this.beam(x, gy + 10, z, x, gy, z, c, 0.4, 0.05, 3);
        this.glow.emit(x, gy + 0.3, z, { count: N(14), color: c, speed: 1.5, life: 0.6, size: 0.3, up: 1 });
        if (name === 'thorns') this.ring(x, z, 0.3, r, c, 0.5);
        break;
      }
      case 'dawn':
        this.ring(x, z, 0.5, r, 0xfff0a0, 0.9);
        this.ring(x, z, 0.5, r * 0.6, 0xffffff, 0.7);
        this.glow.emit(x, gy + 0.5, z, { count: N(80), color: 0xfff0a0, color2: 0xffffff, speed: r * 1.5, life: 1.0, size: 0.4, shape: 'ring', radius: 0.5, up: 2 });
        break;
      case 'timeField':
      case 'wail':
      case 'dust':
        this.ring(x, z, 0.3, r, name === 'wail' ? 0xb08aff : name === 'dust' ? 0xe0e0ff : 0x8a8aff, 0.6);
        this.glow.emit(x, gy + 0.4, z, { count: N(24), color: name === 'wail' ? 0xb08aff : name === 'dust' ? 0xf0f0ff : 0x9a9aff, life: 1.0, size: 0.25, shape: 'disc', radius: r, up: 0.6, speed: 0.3 });
        break;
      case 'corpseBlast':
        this.smoke.emit(x, gy + 0.3, z, { count: N(16), color: 0x5a2020, speed: r * 2, life: 0.9, size: 0.5, size2: 1.0, up: 1 });
        this.glow.emit(x, gy + 0.3, z, { count: N(16), color: 0x9cff5a, speed: r * 2, life: 0.5, size: 0.4 });
        this.ring(x, z, 0.3, r, 0x9cff5a, 0.5);
        break;
      case 'devour':
      case 'corpseGone':
        this.smoke.emit(x, gy + 0.2, z, { count: N(6), color: 0x4a3030, speed: 0.6, life: 0.8, size: 0.4, up: 0.5 });
        break;
      case 'revive':
      case 'phoenix':
        this.glow.emit(x, gy, z, { count: N(60), color: name === 'phoenix' ? 0xff8a2a : 0xfff0a0, color2: 0xffffff, life: 1.3, size: 0.35, shape: 'column', radius: 1.0, up: 4 });
        this.ring(x, z, 0.3, 2, name === 'phoenix' ? 0xff8a2a : 0xfff0a0, 0.8);
        break;
      case 'summonBuilding':
      case 'consume':
      case 'root':
      case 'uproot':
        this.glow.emit(x, gy + 0.3, z, { count: N(30), color: name === 'summonBuilding' ? 0x6dffb0 : 0xb98cff, life: 1.0, size: 0.3, shape: 'disc', radius: r * 0.5, up: 2.5, speed: 0.4 });
        this.smoke.emit(x, gy + 0.2, z, { count: N(10), color: 0x6a5a4a, life: 1.0, size: 0.6, size2: 1.2, shape: 'disc', radius: r * 0.5, up: 0.8 });
        break;
      case 'hit':
        this.glow.emit(x, opts.y ?? gy + 0.7, z, { count: N(4), color: col ?? 0xfff0c0, speed: 2.4, life: 0.22, size: 0.22 });
        break;
      case 'death':
        this.smoke.emit(x, gy + 0.3, z, { count: N(8), color: 0x7a6a5a, speed: 1.2, life: 0.8, size: 0.4, size2: 0.9, up: 0.6 });
        break;
      case 'collapse':
        this.smoke.emit(x, gy + 0.5, z, { count: N(60), color: 0x8a7a6a, color2: 0x4a4038, speed: r * 1.6, life: 2.2, size: 0.8, size2: 2.0, shape: 'disc', radius: r * 0.6, up: 1.5, drag: 1.2 });
        this.glow.emit(x, gy + 0.5, z, { count: N(30), color: 0xffa040, speed: r * 2, life: 0.6, size: 0.4, up: 2 });
        break;
      case 'treeFell':
        this.smoke.emit(x, gy + 0.6, z, { count: N(10), color: 0x6a8a4a, color2: 0x8a6a42, speed: 1.4, life: 1.0, size: 0.35, up: 1, gravity: 2 });
        break;
      case 'levelUp':
        this.glow.emit(x, gy, z, { count: N(50), color: 0xffe080, color2: 0xffffff, life: 1.2, size: 0.3, shape: 'column', radius: 0.7, up: 4 });
        this.ring(x, z, 0.3, 1.6, 0xffe080, 0.7);
        break;
      case 'buildDone':
        this.glow.emit(x, gy + 0.5, z, { count: N(30), color: 0xffffff, life: 0.8, size: 0.3, shape: 'disc', radius: r * 0.6, up: 2.5 });
        break;
      case 'deposit':
        this.glow.emit(x, gy + 1.0, z, { count: 3, color: col ?? 0xffd040, life: 0.5, size: 0.2, up: 1.5, speed: 0.4 });
        break;
      default:
        this.glow.emit(x, gy + 0.5, z, { count: N(12), color: col ?? 0xffffff, speed: 1.5, life: 0.5, size: 0.3 });
    }
  }

  clear(): void {
    this.glow.clear();
    this.smoke.clear();
    for (const t of this.transients) this.group.remove(t.obj);
    this.transients = [];
  }
}

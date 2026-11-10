import * as THREE from 'three';
import type { GameMap } from '../sim/map';
import { fbm, hash2 } from '../util/rng';
import { damp } from '../util/math';
import { MATS, PALETTES, patchWorld, worldUniforms, mixHex, type BiomePalette } from './materials';
import { rockGeometry, treeGeometry, tuftGeometry } from './models';

export const WATER_LEVEL = -0.3;

/** Terrain surface with vertex colors, slope shading and live blight. */
export class TerrainView {
  readonly mesh: THREE.Mesh;
  readonly water: THREE.Mesh | null = null;
  private map: GameMap;
  private pal: BiomePalette;
  private colors: Float32Array;
  private lastBlight = -1;
  private waterMat: THREE.ShaderMaterial | null = null;

  constructor(map: GameMap) {
    this.map = map;
    this.pal = PALETTES[map.biome];
    const W = map.w + 1;
    const H = map.h + 1;
    const pos = new Float32Array(W * H * 3);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        pos[i * 3] = x;
        pos[i * 3 + 1] = map.heights[i];
        pos[i * 3 + 2] = y;
      }
    const idx: number[] = [];
    for (let y = 0; y < map.h; y++)
      for (let x = 0; x < map.w; x++) {
        const a = y * W + x;
        const b = a + 1;
        const c = a + W;
        const d = c + 1;
        // alternate the split diagonal for a less regular look
        if ((x + y) % 2 === 0) idx.push(a, c, b, b, c, d);
        else idx.push(a, c, d, a, d, b);
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.colors = new Float32Array(W * H * 3);
    g.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    this.recolor(g);
    const mat = patchWorld(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.receiveShadow = true;
    this.mesh.name = 'terrain';

    if (map.water.some((w) => w > 0)) {
      this.water = this.makeWater();
    }
  }

  private recolor(g: THREE.BufferGeometry): void {
    const map = this.map;
    const pal = this.pal;
    const W = map.w + 1;
    const H = map.h + 1;
    const col = new THREE.Color();
    const tmp = new THREE.Color();
    const rock = new THREE.Color(pal.rock);
    const blight = new THREE.Color(pal.blight);
    const seed = map.data.seed;
    for (let vy = 0; vy < H; vy++)
      for (let vx = 0; vx < W; vx++) {
        // average the colors of the (up to) four tiles touching this vertex
        let r = 0;
        let gg = 0;
        let b = 0;
        let n = 0;
        let bl = 0;
        for (let dy = -1; dy <= 0; dy++)
          for (let dx = -1; dx <= 0; dx++) {
            const tx = vx + dx;
            const ty = vy + dy;
            if (tx < 0 || ty < 0 || tx >= map.w || ty >= map.h) continue;
            const i = ty * map.w + tx;
            tmp.setHex(pal.terrain[map.terrain[i]] ?? pal.terrain[0]);
            r += tmp.r;
            gg += tmp.g;
            b += tmp.b;
            n++;
            if (map.blight[i]) bl++;
          }
        col.setRGB(r / n, gg / n, b / n);
        // slope -> rock
        const h = map.heights;
        const hc = h[vy * W + vx];
        let slope = 0;
        if (vx > 0) slope = Math.max(slope, Math.abs(hc - h[vy * W + vx - 1]));
        if (vx < W - 1) slope = Math.max(slope, Math.abs(hc - h[vy * W + vx + 1]));
        if (vy > 0) slope = Math.max(slope, Math.abs(hc - h[(vy - 1) * W + vx]));
        if (vy < H - 1) slope = Math.max(slope, Math.abs(hc - h[(vy + 1) * W + vx]));
        const rk = Math.min(1, Math.max(0, (slope - 0.45) * 1.6));
        if (rk > 0) col.lerp(rock, rk);
        // gentle large and small scale variation
        const nv = fbm(vx * 0.06, vy * 0.06, seed + 11, 3) - 0.5;
        const sv = hash2(vx, vy, seed + 3) - 0.5;
        const f = 1 + nv * 0.22 + sv * 0.07;
        col.multiplyScalar(f);
        if (bl > 0) {
          const t = bl / n;
          col.lerp(blight, Math.min(1, t * 0.9));
          if (sv > 0.3 && t > 0.5) col.lerp(new THREE.Color(0x4a7a5a), 0.25);
        }
        // shallow water beds look sandy/dark
        if (hc < WATER_LEVEL + 0.05) col.multiplyScalar(0.75);
        const k = (vy * W + vx) * 3;
        this.colors[k] = col.r;
        this.colors[k + 1] = col.g;
        this.colors[k + 2] = col.b;
      }
    (g.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
    this.lastBlight = map.visualVersion;
  }

  private makeWater(): THREE.Mesh {
    const map = this.map;
    const W = map.w + 1;
    const H = map.h + 1;
    // depth texture at vertex resolution
    const depth = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) depth[i] = Math.max(0, Math.min(255, Math.round((WATER_LEVEL - map.heights[i]) * 160 + 40)));
    const tex = new THREE.DataTexture(depth, W, H, THREE.RedFormat, THREE.UnsignedByteType);
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    const lava = !!this.pal.lava;
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        uDepth: { value: tex },
        uFog: worldUniforms.uFog,
        uFogEnabled: worldUniforms.uFogEnabled,
        uMapSize: worldUniforms.uMapSize,
        uTime: worldUniforms.uTime,
        uShallow: { value: new THREE.Color(this.pal.water) },
        uDeep: { value: new THREE.Color(this.pal.waterDeep) },
        uLight: { value: 1 },
        uLava: { value: lava ? 1 : 0 },
      },
      vertexShader: `
        varying vec3 vWP;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWP = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: `
        uniform sampler2D uDepth;
        uniform sampler2D uFog;
        uniform float uFogEnabled;
        uniform vec2 uMapSize;
        uniform float uTime;
        uniform vec3 uShallow;
        uniform vec3 uDeep;
        uniform float uLight;
        uniform float uLava;
        varying vec3 vWP;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float noise(vec2 p) {
          vec2 i = floor(p); vec2 f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
        }
        void main() {
          vec2 uv = (vWP.xz + 0.5) / (uMapSize + 1.0);
          float d = (texture2D(uDepth, uv).r * 255.0 - 40.0) / 160.0;
          if (d <= 0.0) discard;
          float t = uTime;
          float n1 = noise(vWP.xz * 0.9 + vec2(t * 0.35, t * 0.22));
          float n2 = noise(vWP.xz * 2.1 - vec2(t * 0.25, -t * 0.3));
          float waves = n1 * 0.6 + n2 * 0.4;
          vec3 col = mix(uShallow, uDeep, smoothstep(0.1, 1.0, d));
          col *= 0.85 + waves * 0.3;
          float foam = smoothstep(0.12, 0.0, d) * (0.6 + 0.4 * sin(t * 2.0 + vWP.x * 3.0 + vWP.z * 2.0));
          col = mix(col, vec3(0.92, 0.96, 1.0), foam * (1.0 - uLava));
          float spark = smoothstep(0.82, 0.95, n2) * 0.35;
          col += spark * (uLava > 0.5 ? vec3(1.0, 0.6, 0.2) : vec3(0.9));
          float alpha = uLava > 0.5 ? 1.0 : clamp(0.45 + d * 0.9, 0.0, 0.92);
          col *= uLava > 0.5 ? 1.0 : uLight;
          if (uFogEnabled > 0.5) {
            float fv = texture2D(uFog, vWP.xz / uMapSize).r;
            float lum = dot(col, vec3(0.299, 0.587, 0.114));
            vec3 dim = mix(vec3(lum), col, 0.45) * 0.42;
            col = fv < 0.5 ? mix(vec3(0.012, 0.014, 0.02), dim, fv * 2.0) : mix(dim, col, (fv - 0.5) * 2.0);
          }
          gl_FragColor = vec4(col, alpha);
        }`,
    });
    this.waterMat = mat;
    const geo = new THREE.PlaneGeometry(map.w, map.h, 1, 1);
    geo.rotateX(-Math.PI / 2);
    geo.translate(map.w / 2, WATER_LEVEL, map.h / 2);
    const m = new THREE.Mesh(geo, mat);
    m.renderOrder = 2;
    m.name = 'water';
    return m;
  }

  setLight(f: number): void {
    if (this.waterMat) this.waterMat.uniforms.uLight.value = f;
  }

  update(): void {
    if (this.map.visualVersion !== this.lastBlight && this.map.blightChanged) {
      this.map.blightChanged = false;
      this.recolor(this.mesh.geometry);
    }
  }
}

/** Fog-of-war texture shared by every world material. */
export class FogTexture {
  readonly tex: THREE.DataTexture;
  private data: Uint8Array;
  private display: Float32Array;
  private w: number;
  private h: number;

  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.data = new Uint8Array(w * h);
    this.display = new Float32Array(w * h);
    this.tex = new THREE.DataTexture(this.data, w, h, THREE.RedFormat, THREE.UnsignedByteType);
    this.tex.magFilter = THREE.LinearFilter;
    this.tex.minFilter = THREE.LinearFilter;
    this.tex.needsUpdate = true;
    worldUniforms.uFog.value = this.tex;
    worldUniforms.uMapSize.value.set(w, h);
  }

  /** Ease the displayed fog toward the current visibility (frame-rate independent). */
  update(visible: Uint8Array, explored: Uint8Array, dt: number, revealAll: boolean): void {
    const k = damp(7, dt);
    const d = this.display;
    const out = this.data;
    for (let i = 0; i < d.length; i++) {
      const target = revealAll || visible[i] ? 1 : explored[i] ? 0.5 : 0;
      d[i] += (target - d[i]) * k;
      out[i] = (d[i] * 255) | 0;
    }
    this.tex.needsUpdate = true;
  }

  snap(visible: Uint8Array, explored: Uint8Array, revealAll: boolean): void {
    for (let i = 0; i < this.display.length; i++) this.display[i] = revealAll || visible[i] ? 1 : explored[i] ? 0.5 : 0;
  }
}

/** Instanced forests plus scattered rocks and grass. */
export class TreeField {
  readonly group = new THREE.Group();
  private meshes = new Map<number, THREE.InstancedMesh>();
  private slot: { variant: number; index: number }[] = [];
  private map: GameMap;
  private matrices: THREE.Matrix4[] = [];

  constructor(map: GameMap) {
    this.map = map;
    const byVariant = new Map<number, number[]>();
    map.trees.forEach((t, id) => {
      const list = byVariant.get(t.variant) ?? [];
      list.push(id);
      byVariant.set(t.variant, list);
    });
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    const c = new THREE.Color();
    for (const [variant, ids] of byVariant) {
      const geo = treeGeometry(variant);
      const im = new THREE.InstancedMesh(geo, MATS.foliage, ids.length);
      im.castShadow = true;
      im.receiveShadow = false;
      ids.forEach((id, k) => {
        const t = map.trees[id];
        const r = hash2(t.tx, t.ty, 91);
        const r2 = hash2(t.tx, t.ty, 92);
        const sc = 0.85 + r * 0.5;
        const ox = (hash2(t.tx, t.ty, 93) - 0.5) * 0.35;
        const oz = (hash2(t.tx, t.ty, 94) - 0.5) * 0.35;
        const x = t.tx + 0.5 + ox;
        const z = t.ty + 0.5 + oz;
        p.set(x, map.heightAt(x, z) - 0.05, z);
        e.set((r2 - 0.5) * 0.12, r * Math.PI * 2, (r - 0.5) * 0.1);
        q.setFromEuler(e);
        s.set(sc, sc * (0.9 + r2 * 0.25), sc);
        m4.compose(p, q, s);
        im.setMatrixAt(k, m4);
        this.matrices[id] = m4.clone();
        c.setHSL(0, 0, 0.82 + r2 * 0.3);
        im.setColorAt(k, c);
        this.slot[id] = { variant, index: k };
      });
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
      im.computeBoundingSphere();
      this.meshes.set(variant, im);
      this.group.add(im);
    }
    this.addDoodads();
  }

  private addDoodads(): void {
    const map = this.map;
    const pal = PALETTES[map.biome];
    const rocks: THREE.Matrix4[] = [];
    const tufts: THREE.Matrix4[] = [];
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    const seed = map.data.seed;
    for (let y = 2; y < map.h - 2; y++)
      for (let x = 2; x < map.w - 2; x++) {
        const i = y * map.w + x;
        if (map.blocked[i] || map.water[i] || map.ramp[i]) continue;
        const r = hash2(x, y, seed + 21);
        if (r < 0.012) {
          const sc = 0.6 + hash2(x, y, seed + 22) * 0.9;
          p.set(x + 0.5, map.heightAt(x + 0.5, y + 0.5), y + 0.5);
          e.set(0, r * 500, 0);
          q.setFromEuler(e);
          s.set(sc, sc, sc);
          rocks.push(m4.compose(p, q, s).clone());
        } else if (r > 0.86 && map.biome !== 'ashen') {
          const n = 1 + Math.floor(hash2(x, y, seed + 23) * 2);
          for (let k = 0; k < n; k++) {
            const ox = hash2(x, y, seed + 24 + k) * 0.9 + 0.05;
            const oz = hash2(x, y, seed + 30 + k) * 0.9 + 0.05;
            const sc = 0.7 + hash2(x, y, seed + 40 + k) * 0.8;
            p.set(x + ox, map.heightAt(x + ox, y + oz), y + oz);
            e.set(0, hash2(x, y, k) * 6, 0);
            q.setFromEuler(e);
            s.set(sc, sc, sc);
            tufts.push(m4.compose(p, q, s).clone());
          }
        }
      }
    // rocks on cliffs make plateaus read better
    for (let y = 1; y < map.h - 1; y++)
      for (let x = 1; x < map.w - 1; x++) {
        const i = y * map.w + x;
        if (!map.cliff[i] || hash2(x, y, seed + 51) > 0.22) continue;
        const sc = 0.7 + hash2(x, y, seed + 52) * 0.8;
        p.set(x + 0.5, map.heightAt(x + 0.5, y + 0.5) - 0.1, y + 0.5);
        e.set(0, hash2(x, y, seed + 53) * 6, 0);
        q.setFromEuler(e);
        s.set(sc, sc * 0.8, sc);
        rocks.push(m4.compose(p, q, s).clone());
      }
    const mk = (geo: THREE.BufferGeometry, list: THREE.Matrix4[], mat: THREE.Material, shadow: boolean) => {
      if (!list.length) return;
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach((mm, k) => im.setMatrixAt(k, mm));
      im.instanceMatrix.needsUpdate = true;
      im.castShadow = shadow;
      im.computeBoundingSphere();
      this.group.add(im);
    };
    mk(rockGeometry(pal.rock), rocks, MATS.solid, true);
    mk(tuftGeometry(pal.grassTuft), tufts, MATS.foliage, false);
    void mixHex;
  }

  /** Hide trees that were cut down. */
  update(): void {
    const map = this.map;
    if (!map.changedTrees.length) return;
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (const id of map.changedTrees) {
      const s = this.slot[id];
      if (!s) continue;
      const im = this.meshes.get(s.variant);
      if (!im) continue;
      im.setMatrixAt(s.index, zero);
      im.instanceMatrix.needsUpdate = true;
    }
    map.changedTrees.length = 0;
  }

  treePosition(id: number): THREE.Vector3 | null {
    const m = this.matrices[id];
    if (!m) return null;
    return new THREE.Vector3().setFromMatrixPosition(m);
  }
}

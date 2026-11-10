import * as THREE from 'three';
import type { EntityDef, ModelSpec } from '../data/types';
import { Geo } from './geo';
import { MATS, mixHex, shade } from './materials';

// ---------------------------------------------------------------------------
// templates & rigs
// ---------------------------------------------------------------------------
interface PartT {
  name: string;
  parent: string;
  pivot: [number, number, number];
  solid: THREE.BufferGeometry | null;
  glow: THREE.BufferGeometry | null;
}
export interface Template {
  parts: PartT[];
  height: number;
  kind: string;
  scale: number;
  radius: number;
}
export interface Rig {
  root: THREE.Group;
  body: THREE.Object3D;
  parts: Record<string, THREE.Object3D>;
  t: Template;
  meshes: THREE.Mesh[];
}

class TB {
  parts = new Map<string, { parent: string; pivot: [number, number, number]; s: Geo; g: Geo }>();
  height = 1.2;
  constructor() {
    this.part('body', 'root');
  }
  part(name: string, parent = 'body', pivot: [number, number, number] = [0, 0, 0]): { s: Geo; g: Geo } {
    let p = this.parts.get(name);
    if (!p) {
      p = { parent, pivot, s: new Geo(), g: new Geo() };
      p.g.jitter = 0;
      this.parts.set(name, p);
    }
    return p;
  }
  get b(): Geo {
    return this.part('body').s;
  }
  get bg(): Geo {
    return this.part('body').g;
  }
  build(kind: string, scale: number, radius: number): Template {
    const parts: PartT[] = [];
    for (const [name, p] of this.parts) {
      parts.push({ name, parent: p.parent, pivot: p.pivot, solid: p.s.empty ? null : p.s.build(), glow: p.g.empty ? null : p.g.build() });
    }
    return { parts, height: this.height, kind, scale, radius };
  }
}

export function instantiate(t: Template): Rig {
  const root = new THREE.Group();
  const objs: Record<string, THREE.Object3D> = { root };
  const meshes: THREE.Mesh[] = [];
  for (const p of t.parts) {
    const o = new THREE.Group();
    o.position.set(p.pivot[0], p.pivot[1], p.pivot[2]);
    if (p.solid) {
      const m = new THREE.Mesh(p.solid, MATS.solid);
      m.castShadow = true;
      m.receiveShadow = false;
      o.add(m);
      meshes.push(m);
    }
    if (p.glow) {
      const m = new THREE.Mesh(p.glow, MATS.glow);
      o.add(m);
      meshes.push(m);
    }
    objs[p.name] = o;
  }
  for (const p of t.parts) (objs[p.parent] ?? root).add(objs[p.name]);
  root.scale.setScalar(t.scale);
  return { root, body: objs.body, parts: objs, t, meshes };
}

const cache = new Map<string, Template>();

export function templateFor(def: EntityDef, team: number): Template {
  const key = def.id + '|' + team.toString(16);
  let t = cache.get(key);
  if (!t) {
    t = buildTemplate(def.model, team, def);
    cache.set(key, t);
  }
  return t;
}

function buildTemplate(m: ModelSpec, team: number, def: EntityDef): Template {
  const tb = new TB();
  const scale = (m.scale as number) ?? 1;
  switch (m.kind) {
    case 'humanoid':
      humanoid(tb, m, team, 0);
      break;
    case 'rider':
      rider(tb, m, team);
      break;
    case 'beast':
      beast(tb, m, team);
      break;
    case 'flyer':
      flyer(tb, m, team);
      break;
    case 'machine':
      machine(tb, m, team);
      break;
    case 'wagon':
      wagon(tb, m, team);
      break;
    case 'spirit':
      spirit(tb, m, team);
      break;
    case 'treant':
      treant(tb, m, team);
      break;
    case 'golem':
      golem(tb, m, team);
      break;
    case 'ward':
      ward(tb, m, team);
      break;
    case 'mine':
      goldMine(tb);
      break;
    case 'building':
      building(tb, m, team, def.size ?? 3);
      break;
    default:
      tb.b.box(0.4, 0.4, 0.4, 0xffffff, { y: 0.2 });
  }
  return tb.build(m.kind, m.kind === 'building' || m.kind === 'mine' ? 1 : scale, def.radius ?? 0.4);
}

// ---------------------------------------------------------------------------
// humanoids
// ---------------------------------------------------------------------------
const C = (v: unknown, d: number): number => (typeof v === 'number' ? v : d);

function humanoid(tb: TB, m: ModelSpec, team: number, baseY: number, seated = false): void {
  const skin = C(m.skin, 0xe0b090);
  const body = C(m.body, 0x6a5a4a);
  const legs = C(m.legs, shade(body, 0.7));
  const armorC = typeof m.armor === 'number' ? (m.armor as number) : null;
  const bulk = C(m.bulk, 1);
  const skeletal = !!m.skeletal;
  const glow = typeof m.glow === 'number' ? (m.glow as number) : null;
  const hunch = m.hunch ? 0.28 : 0;
  const robe = !!m.robe;
  const teamSpot = (m.team as string) ?? (m.cape ? 'cape' : 'tabard');
  const limbW = skeletal ? 0.09 : 0.15;
  const hipY = baseY + 0.5;
  tb.height = baseY + 1.45;
  // legs
  if (!seated) {
    if (robe) {
      tb.b.cyl(0.2 * bulk, 0.3 * bulk, 0.62, 7, body, { y: baseY + 0.31 });
      tb.b.cyl(0.31 * bulk, 0.32 * bulk, 0.06, 7, shade(body, 0.75), { y: baseY + 0.03 });
    } else {
      for (const side of [-1, 1]) {
        const lp = tb.part(side < 0 ? 'legL' : 'legR', 'body', [0, hipY, side * 0.12 * bulk]);
        lp.s.box(limbW + 0.03, 0.5, limbW + 0.03, skeletal ? skin : legs, { y: -0.25 });
        lp.s.box(0.22, 0.08, 0.17, skeletal ? skin : shade(legs, 0.6), { x: 0.04, y: -0.47 });
      }
    }
  }
  // torso (tilted for hunch)
  const torso = tb.part('torso', 'body', [0, hipY, 0]);
  const T = torso.s;
  const tH = 0.52;
  if (skeletal) {
    T.box(0.1, tH, 0.1, skin, { y: tH / 2, rz: -hunch });
    for (let i = 0; i < 4; i++) T.box(0.18, 0.04, 0.34 * bulk, skin, { x: 0.02, y: 0.18 + i * 0.09, rz: -hunch });
  } else {
    T.box(0.32, tH, 0.44 * bulk, body, { y: tH / 2, rz: -hunch });
    T.box(0.34, 0.08, 0.46 * bulk, shade(body, 0.6), { y: 0.06, rz: -hunch });
  }
  if (armorC !== null && !skeletal) {
    T.box(0.34, 0.24, 0.47 * bulk, armorC, { y: 0.38, rz: -hunch });
    for (const s of [-1, 1]) T.sphere(0.13, armorC, { y: 0.5, z: s * 0.27 * bulk, sx: 1.1, sy: 0.75 });
  }
  if (teamSpot === 'tabard' && !skeletal) T.box(0.02, 0.36, 0.2 * bulk, team, { x: 0.17, y: 0.26, rz: -hunch });
  if (teamSpot === 'sash') T.box(0.36, 0.07, 0.48 * bulk, team, { y: 0.1, rz: -hunch });
  if (m.cape || teamSpot === 'cape') {
    const cp = tb.part('cape', 'torso', [-0.17, tH - 0.02, 0]);
    cp.s.box(0.04, 0.62, 0.42 * bulk, team, { y: -0.3, rz: -0.08 });
  }
  if (m.backpack) T.box(0.2, 0.3, 0.3, 0x7a5a3a, { x: -0.24, y: 0.3 });
  // head
  const headY = tH + 0.17 - hunch * 0.25;
  const head = tb.part('head', 'torso', [hunch * 0.35, headY, 0]);
  const H = head.s;
  if (skeletal) {
    H.box(0.24, 0.24, 0.22, skin, { y: 0.03 });
    H.box(0.02, 0.06, 0.16, 0x111111, { x: 0.12, y: 0.06 });
  } else {
    H.box(0.27, 0.28, 0.26, skin, { y: 0.03 });
    if (m.snout) H.box(0.16, 0.12, 0.14, shade(skin, 0.9), { x: 0.18, y: -0.02 });
    if (m.tusks) for (const s of [-1, 1]) H.cone(0.025, 0.1, 4, 0xf0e8d0, { x: 0.13, y: -0.06, z: s * 0.08, rz: -0.3 });
    if (m.ears) for (const s of [-1, 1]) H.cone(0.04, 0.16, 4, skin, { y: 0.08, z: s * 0.15, rx: s * 1.2 });
    if (typeof m.beard === 'number') H.box(0.1, 0.16, 0.22, m.beard as number, { x: 0.12, y: -0.1 });
    if (typeof m.hair === 'number') H.box(0.24, 0.12, 0.28, m.hair as number, { x: -0.04, y: 0.15 });
    if (typeof m.mohawk === 'number') H.box(0.24, 0.12, 0.05, m.mohawk as number, { y: 0.2 });
  }
  const eyes = glow ?? 0x111111;
  const eg = glow ? head.g : H;
  for (const s of [-1, 1]) eg.box(0.03, 0.04, 0.04, eyes, { x: 0.135, y: 0.06, z: s * 0.06 });
  helm(head.s, head.g, (m.helm as string) ?? 'none', C(m.helmColor, 0x7a7a80), team);
  // arms
  const shY = tH - 0.06;
  const armLen = 0.42;
  for (const side of [-1, 1]) {
    const name = side > 0 ? 'armR' : 'armL';
    const ap = tb.part(name, 'torso', [0, shY, side * (0.22 * bulk + 0.07)]);
    ap.s.box(limbW, armLen, limbW, skeletal ? skin : armorC ?? body, { y: -armLen / 2 });
    ap.s.box(limbW + 0.02, 0.1, limbW + 0.02, skin, { y: -armLen - 0.02 });
  }
  const R = tb.part('armR');
  const L = tb.part('armL');
  weapon(R.s, R.g, (m.weapon as string) ?? 'none', C(m.weaponColor, 0xb8bcc4), typeof m.orb === 'number' ? (m.orb as number) : glow ?? 0xfff0a0, -armLen);
  shield(L.s, (m.shield as string) ?? 'none', team, armLen);
  if (m.weapon === 'bow' || m.weapon === 'crossbow' || m.weapon === 'rifle' || m.weapon === 'twinblades' || m.weapon === 'claws') {
    weapon(L.s, L.g, m.weapon === 'twinblades' ? 'dagger' : m.weapon === 'claws' ? 'claws' : 'none', 0xb8bcc4, 0xffffff, -armLen);
  }
}

function helm(H: Geo, G: Geo, kind: string, c: number, team: number): void {
  switch (kind) {
    case 'cap':
      H.cyl(0.16, 0.17, 0.08, 7, c, { y: 0.19 });
      G.sphere(0.035, 0xffe080, { x: 0.12, y: 0.22 });
      break;
    case 'helm':
      H.box(0.3, 0.16, 0.3, c, { y: 0.15 });
      H.box(0.04, 0.16, 0.05, shade(c, 0.8), { x: 0.15, y: 0.05 });
      break;
    case 'horned':
      H.box(0.3, 0.15, 0.3, c, { y: 0.16 });
      for (const s of [-1, 1]) H.cone(0.05, 0.26, 5, 0xe8dcc0, { y: 0.26, z: s * 0.2, rx: s * 0.9 });
      break;
    case 'hood':
      H.cone(0.22, 0.42, 6, c, { y: 0.15, x: -0.02 });
      H.box(0.08, 0.3, 0.3, c, { x: -0.1, y: 0.02 });
      break;
    case 'crown':
      H.cyl(0.17, 0.17, 0.07, 8, c, { y: 0.19 });
      for (let i = 0; i < 6; i++) H.cone(0.03, 0.1, 4, c, { y: 0.27, x: Math.cos(i) * 0.15, z: Math.sin(i) * 0.15 });
      G.sphere(0.03, 0xff4040, { x: 0.16, y: 0.2 });
      break;
    case 'circlet':
      H.cyl(0.155, 0.155, 0.04, 8, c, { y: 0.16 });
      G.sphere(0.03, 0x9fe0ff, { x: 0.15, y: 0.16 });
      break;
    case 'pointed':
      H.cyl(0.26, 0.26, 0.03, 8, c, { y: 0.17 });
      H.cone(0.15, 0.48, 6, c, { y: 0.4, rz: -0.15 });
      break;
    case 'skull':
      H.box(0.28, 0.2, 0.28, c, { y: 0.15 });
      for (const s of [-1, 1]) H.box(0.02, 0.05, 0.06, 0x111111, { x: 0.14, y: 0.15, z: s * 0.07 });
      break;
    case 'antlers':
      H.cyl(0.16, 0.16, 0.05, 6, 0x6a8a4a, { y: 0.17 });
      for (const s of [-1, 1]) {
        H.cyl(0.02, 0.03, 0.34, 4, c, { y: 0.32, z: s * 0.12, rx: s * 0.5 });
        H.cyl(0.015, 0.02, 0.16, 4, c, { y: 0.38, x: 0.05, z: s * 0.22, rx: s * 1.1 });
      }
      break;
    case 'goggles':
      H.box(0.28, 0.14, 0.29, c, { y: 0.14 });
      for (const s of [-1, 1]) G.cyl(0.05, 0.05, 0.03, 8, 0x8ad0ff, { x: 0.14, y: 0.08, z: s * 0.07, rz: Math.PI / 2 });
      break;
    case 'leafhelm':
      H.box(0.3, 0.14, 0.3, c, { y: 0.15 });
      H.cone(0.08, 0.3, 4, mixHex(c, 0xffffff, 0.3), { x: -0.08, y: 0.32, rz: 0.6 });
      break;
    case 'wolfhood':
      H.box(0.32, 0.18, 0.32, c, { y: 0.14 });
      H.box(0.16, 0.1, 0.16, c, { x: 0.16, y: 0.2 });
      for (const s of [-1, 1]) H.cone(0.05, 0.12, 4, c, { y: 0.28, z: s * 0.1 });
      H.box(0.06, 0.5, 0.36, c, { x: -0.16, y: -0.08 });
      break;
    default:
      break;
  }
  void team;
}

function weapon(A: Geo, G: Geo, kind: string, metal: number, orb: number, handY: number): void {
  const wood = 0x6a4a2a;
  const hy = handY - 0.02;
  switch (kind) {
    case 'sword':
      A.box(0.05, 0.08, 0.16, 0xc8a040, { x: 0.05, y: hy });
      A.box(0.6, 0.06, 0.03, metal, { x: 0.38, y: hy });
      break;
    case 'greatsword':
      A.box(0.06, 0.08, 0.22, 0xc8a040, { x: 0.05, y: hy });
      A.box(0.95, 0.09, 0.035, metal, { x: 0.55, y: hy });
      break;
    case 'axe':
      A.box(0.6, 0.05, 0.05, wood, { x: 0.25, y: hy });
      A.box(0.14, 0.24, 0.03, metal, { x: 0.48, y: hy + 0.06 });
      break;
    case 'greataxe':
      A.box(0.9, 0.06, 0.06, wood, { x: 0.35, y: hy });
      A.box(0.2, 0.42, 0.04, metal, { x: 0.7, y: hy + 0.04 });
      break;
    case 'spear':
    case 'lance':
    case 'javelin': {
      const L = kind === 'lance' ? 1.6 : kind === 'spear' ? 1.2 : 0.9;
      A.box(L, 0.04, 0.04, kind === 'lance' ? 0xe8e0d0 : wood, { x: L / 2 - 0.15, y: hy });
      A.cone(0.05, 0.18, 4, metal, { x: L - 0.06, y: hy, rz: -Math.PI / 2 });
      if (kind === 'lance') A.cone(0.09, 0.2, 6, 0xc8a040, { x: 0.15, y: hy, rz: -Math.PI / 2 });
      break;
    }
    case 'bow':
      A.cyl(0.02, 0.02, 0.7, 4, wood, { x: 0.08, y: hy, rz: 0.15 });
      A.box(0.01, 0.66, 0.01, 0xe0e0e0, { x: 0.02, y: hy, rz: 0.15 });
      break;
    case 'crossbow':
      A.box(0.45, 0.06, 0.06, wood, { x: 0.18, y: hy });
      A.box(0.05, 0.05, 0.4, metal, { x: 0.35, y: hy });
      break;
    case 'rifle':
      A.box(0.75, 0.06, 0.06, 0x3a3a3a, { x: 0.3, y: hy });
      A.box(0.25, 0.09, 0.07, wood, { x: 0.0, y: hy - 0.02 });
      break;
    case 'staff':
      A.cyl(0.025, 0.03, 1.1, 5, wood, { x: 0.1, y: hy + 0.25 });
      G.sphere(0.07, orb, { x: 0.1, y: hy + 0.83 });
      break;
    case 'wand':
      A.cyl(0.015, 0.02, 0.35, 4, 0x2a2a2a, { x: 0.12, y: hy, rz: -1.2 });
      G.sphere(0.04, orb, { x: 0.28, y: hy + 0.07 });
      break;
    case 'hammer':
      A.box(0.7, 0.05, 0.05, wood, { x: 0.28, y: hy });
      A.box(0.2, 0.2, 0.28, metal, { x: 0.6, y: hy });
      break;
    case 'club':
      A.cyl(0.09, 0.04, 0.7, 6, 0x7a5a3a, { x: 0.3, y: hy, rz: -Math.PI / 2 });
      break;
    case 'mace':
      A.box(0.5, 0.04, 0.04, wood, { x: 0.2, y: hy });
      A.dodeca(0.09, metal, { x: 0.45, y: hy });
      break;
    case 'dagger':
      A.box(0.3, 0.04, 0.03, metal, { x: 0.18, y: hy });
      break;
    case 'twinblades':
      A.box(0.45, 0.05, 0.03, metal, { x: 0.25, y: hy });
      G.box(0.4, 0.02, 0.02, 0xb08aff, { x: 0.27, y: hy + 0.03 });
      break;
    case 'scythe':
      A.cyl(0.025, 0.025, 1.2, 4, 0x2a2a2a, { x: 0.1, y: hy + 0.3 });
      A.box(0.45, 0.05, 0.03, metal, { x: 0.3, y: hy + 0.85, rz: -0.3 });
      break;
    case 'pick':
      A.box(0.45, 0.04, 0.04, wood, { x: 0.18, y: hy });
      A.box(0.05, 0.3, 0.04, metal, { x: 0.38, y: hy });
      break;
    case 'shovel':
      A.box(0.6, 0.04, 0.04, wood, { x: 0.25, y: hy });
      A.box(0.12, 0.03, 0.14, metal, { x: 0.58, y: hy });
      break;
    case 'glaive':
      A.cyl(0.02, 0.02, 1.0, 4, 0xd8d0c0, { x: 0.15, y: hy, rz: -Math.PI / 2 + 0.3 });
      A.box(0.08, 0.3, 0.02, metal, { x: 0.6, y: hy + 0.2, rz: 0.2 });
      A.box(0.08, 0.3, 0.02, metal, { x: -0.25, y: hy - 0.15, rz: 0.2 });
      break;
    case 'claws':
      for (let i = -1; i <= 1; i++) A.cone(0.02, 0.18, 3, 0xe8e0d0, { x: 0.12, y: hy - 0.04, z: i * 0.04, rz: -Math.PI / 2 });
      break;
    case 'wrench':
      A.box(0.45, 0.05, 0.05, metal, { x: 0.2, y: hy });
      A.torus(0.06, 0.02, metal, { x: 0.45, y: hy });
      break;
    case 'torch':
      A.box(0.35, 0.04, 0.04, wood, { x: 0.15, y: hy + 0.05, rz: 0.5 });
      G.cone(0.05, 0.14, 5, 0xffa040, { x: 0.3, y: hy + 0.2 });
      break;
    default:
      break;
  }
}

function shield(A: Geo, kind: string, team: number, armLen: number): void {
  const y = -armLen * 0.7;
  switch (kind) {
    case 'round':
      A.cyl(0.2, 0.2, 0.04, 8, 0x6a4a2a, { x: 0.06, y, rz: Math.PI / 2 });
      A.cyl(0.13, 0.13, 0.05, 8, team, { x: 0.08, y, rz: Math.PI / 2 });
      break;
    case 'kite':
      A.box(0.05, 0.5, 0.32, 0xd0d0d0, { x: 0.08, y: y - 0.03 });
      A.box(0.06, 0.42, 0.24, team, { x: 0.09, y: y - 0.03 });
      break;
    case 'tower':
      A.box(0.06, 0.7, 0.4, 0x8a8a8a, { x: 0.1, y });
      A.box(0.07, 0.55, 0.3, team, { x: 0.11, y });
      break;
    case 'buckler':
      A.cyl(0.13, 0.13, 0.04, 8, team, { x: 0.06, y, rz: Math.PI / 2 });
      break;
    default:
      break;
  }
}

// ---------------------------------------------------------------------------
// mounts and beasts
// ---------------------------------------------------------------------------
function quadruped(tb: TB, opts: { color: number; len: number; height: number; width: number; head: string; team?: number; barding?: boolean; glow?: number | null; legs?: number }): number {
  const { color, len, height, width } = opts;
  const legH = height * 0.55;
  const bodyY = legH + height * 0.22;
  const b = tb.b;
  b.box(len, height * 0.45, width, color, { y: bodyY });
  b.box(len * 0.5, height * 0.4, width * 1.05, shade(color, 1.1), { x: len * 0.12, y: bodyY + height * 0.08 });
  if (opts.barding && opts.team !== undefined) b.box(len * 0.75, height * 0.32, width * 1.18, opts.team, { y: bodyY - height * 0.02 });
  // legs
  const n = opts.legs ?? 4;
  const lw = Math.max(0.08, width * 0.28);
  for (let i = 0; i < n; i++) {
    const front = i < 2 ? 1 : -1;
    const side = i % 2 === 0 ? 1 : -1;
    const lp = tb.part('leg' + i, 'body', [front * len * 0.36, legH, side * width * 0.32]);
    lp.s.box(lw, legH, lw, shade(color, 0.85), { y: -legH / 2 });
    lp.s.box(lw * 1.1, 0.06, lw * 1.2, 0x2a2a2a, { y: -legH + 0.03 });
  }
  // head
  const hp = tb.part('head', 'body', [len * 0.5, bodyY + height * 0.15, 0]);
  const H = hp.s;
  const eye = opts.glow ?? 0x101010;
  const EG = opts.glow ? hp.g : H;
  switch (opts.head) {
    case 'horse':
    case 'skeletalHorse':
      H.box(0.22, 0.5, 0.18, color, { x: 0.08, y: 0.18, rz: -0.5 });
      H.box(0.36, 0.17, 0.16, color, { x: 0.28, y: 0.38 });
      for (const s of [-1, 1]) H.cone(0.03, 0.1, 4, color, { x: 0.18, y: 0.5, z: s * 0.05 });
      H.box(0.25, 0.1, 0.03, shade(color, 0.5), { x: 0.05, y: 0.36, rz: -0.5 });
      break;
    case 'stag':
      H.box(0.2, 0.45, 0.16, color, { x: 0.08, y: 0.18, rz: -0.4 });
      H.box(0.3, 0.15, 0.14, color, { x: 0.25, y: 0.38 });
      for (const s of [-1, 1]) {
        H.cyl(0.015, 0.025, 0.45, 4, 0xe8dcc0, { x: 0.15, y: 0.62, z: s * 0.12, rx: s * 0.5 });
        H.cyl(0.012, 0.018, 0.2, 4, 0xe8dcc0, { x: 0.22, y: 0.7, z: s * 0.2, rx: s * 0.9, rz: -0.5 });
      }
      break;
    case 'boar':
      H.box(0.32, 0.3, 0.28, color, { x: 0.1, y: -0.02 });
      H.box(0.12, 0.14, 0.16, shade(color, 1.2), { x: 0.3, y: -0.06 });
      for (const s of [-1, 1]) H.cone(0.025, 0.18, 4, 0xf0e8d0, { x: 0.3, y: 0.02, z: s * 0.1, rz: -0.7 });
      break;
    case 'wolf':
      H.box(0.28, 0.24, 0.22, color, { x: 0.1, y: 0.06 });
      H.box(0.2, 0.12, 0.12, shade(color, 0.9), { x: 0.3, y: 0.0 });
      for (const s of [-1, 1]) H.cone(0.04, 0.12, 4, color, { x: 0.04, y: 0.22, z: s * 0.07 });
      break;
    case 'bear':
      H.box(0.32, 0.3, 0.3, color, { x: 0.1, y: 0.05 });
      H.box(0.14, 0.13, 0.15, shade(color, 1.2), { x: 0.3, y: 0.0 });
      for (const s of [-1, 1]) H.sphere(0.06, color, { x: 0.02, y: 0.22, z: s * 0.11 });
      break;
    case 'mammoth':
      H.box(0.4, 0.5, 0.45, color, { x: 0.1, y: 0.0 });
      H.cyl(0.05, 0.1, 0.65, 6, color, { x: 0.32, y: -0.35, rz: 0.2 });
      for (const s of [-1, 1]) H.cyl(0.03, 0.06, 0.6, 5, 0xf0e8d0, { x: 0.35, y: -0.2, z: s * 0.18, rz: -1.0 });
      for (const s of [-1, 1]) H.box(0.05, 0.35, 0.25, shade(color, 0.85), { x: 0.0, y: 0.05, z: s * 0.28 });
      break;
    case 'spider':
      H.box(0.25, 0.2, 0.28, color, { x: 0.05, y: -0.05 });
      for (const s of [-1, 1]) H.cone(0.03, 0.12, 4, 0xd0d0c0, { x: 0.18, y: -0.12, z: s * 0.06, rz: Math.PI });
      break;
    case 'lizard':
      H.box(0.4, 0.18, 0.22, color, { x: 0.15, y: 0.0 });
      break;
    default:
      H.box(0.25, 0.25, 0.25, color, { x: 0.1 });
  }
  for (const s of [-1, 1]) EG.box(0.03, 0.04, 0.04, eye, { x: opts.head === 'horse' ? 0.4 : 0.26, y: opts.head === 'horse' ? 0.43 : 0.1, z: s * 0.08 });
  // tail
  if (opts.head !== 'spider') tb.b.box(0.3, 0.06, 0.06, shade(color, 0.7), { x: -len * 0.55, y: bodyY + 0.05, rz: 0.6 });
  return bodyY + height * 0.22;
}

function rider(tb: TB, m: ModelSpec, team: number): void {
  const mount = (m.mount as string) ?? 'horse';
  const mc = C(m.mountColor, 0x8a6a4a);
  const dims: Record<string, [number, number, number]> = {
    horse: [1.1, 1.0, 0.36],
    skeletalHorse: [1.05, 0.95, 0.3],
    stag: [1.0, 1.0, 0.32],
    boar: [1.0, 0.85, 0.48],
    wolf: [0.95, 0.8, 0.36],
  };
  const [len, h, wd] = dims[mount] ?? dims.horse;
  const head = mount === 'skeletalHorse' ? 'horse' : mount;
  const top = quadruped(tb, { color: mc, len, height: h, width: wd, head, team, barding: !!m.barding || m.team === 'barding', glow: typeof m.glow === 'number' ? (m.glow as number) : null });
  tb.b.box(0.32, 0.08, wd * 1.25, 0x5a3a2a, { y: top - 0.04 });
  // rider (upper body only) sitting on top
  const sub = new TB();
  humanoid(sub, { ...m, kind: 'humanoid', robe: false, cape: m.cape }, team, 0, true);
  for (const [name, p] of sub.parts) {
    if (name === 'body') continue;
    const tgt = tb.part(name === 'torso' ? 'torso' : name, p.parent === 'body' ? 'body' : p.parent, name === 'torso' ? [-0.05, top - 0.02, 0] : p.pivot);
    tgt.s.pos.push(...p.s.pos);
    tgt.s.col.push(...p.s.col);
    tgt.g.pos.push(...p.g.pos);
    tgt.g.col.push(...p.g.col);
  }
  if (m.team === 'banner') {
    const bp = tb.part('flag', 'torso', [-0.2, 0.4, 0]);
    bp.s.box(0.03, 1.0, 0.03, 0x5a3a2a, { y: 0.3 });
    bp.s.box(0.02, 0.3, 0.32, team, { y: 0.65, z: 0.16 });
  }
  tb.height = top + 1.0;
}

function beast(tb: TB, m: ModelSpec, team: number): void {
  const head = (m.head as string) ?? 'wolf';
  const color = C(m.color, 0x7a6a5a);
  const glow = typeof m.glow === 'number' ? (m.glow as number) : null;
  if (head === 'spider') {
    const b = tb.b;
    b.sphere(0.32, color, { x: -0.25, y: 0.38, sx: 1.3, sy: 0.9 });
    b.sphere(0.2, shade(color, 1.1), { x: 0.12, y: 0.32 });
    const hp = tb.part('head', 'body', [0.32, 0.32, 0]);
    hp.s.box(0.16, 0.14, 0.2, color);
    for (const s of [-1, 1]) (glow ? hp.g : hp.s).box(0.03, 0.03, 0.03, glow ?? 0xff3030, { x: 0.08, y: 0.04, z: s * 0.05 });
    for (let i = 0; i < 8; i++) {
      const side = i % 2 === 0 ? 1 : -1;
      const k = Math.floor(i / 2);
      const lp = tb.part('leg' + i, 'body', [0.18 - k * 0.12, 0.38, side * 0.15]);
      lp.s.box(0.05, 0.05, 0.45, shade(color, 0.8), { y: 0.06, z: side * 0.2, rx: side * -0.45 });
      lp.s.box(0.04, 0.42, 0.04, shade(color, 0.8), { y: -0.12, z: side * 0.42 });
    }
    tb.height = 0.9;
    return;
  }
  const dims: Record<string, [number, number, number]> = {
    wolf: [0.95, 0.75, 0.32],
    boar: [0.9, 0.7, 0.42],
    bear: [1.1, 0.95, 0.55],
    mammoth: [1.6, 1.5, 0.9],
    lizard: [1.3, 0.6, 0.45],
  };
  const [len, h, w] = dims[head] ?? dims.wolf;
  const top = quadruped(tb, { color, len, height: h, width: w, head, glow });
  if (m.drums) {
    tb.b.box(0.9, 0.1, 1.0, 0x6a4a2a, { y: top + 0.05 });
    for (const s of [-1, 1]) tb.b.cyl(0.24, 0.24, 0.3, 8, 0xc8a070, { x: -0.1, y: top + 0.3, z: s * 0.28 });
    tb.b.box(0.06, 0.6, 0.06, 0x5a3a2a, { x: -0.35, y: top + 0.4 });
    tb.b.box(0.02, 0.3, 0.4, team, { x: -0.35, y: top + 0.55, z: 0.2 });
    // drummer
    tb.b.box(0.2, 0.32, 0.26, 0x6a9a4a, { x: 0.2, y: top + 0.3 });
    tb.b.box(0.18, 0.18, 0.18, 0x6a9a4a, { x: 0.2, y: top + 0.55 });
  }
  if (glow) for (const s of [-1, 1]) tb.bg.sphere(0.04, glow, { x: -len * 0.1, y: top - 0.1, z: s * w * 0.55 });
  tb.height = top + (m.drums ? 0.8 : 0.3);
}

// ---------------------------------------------------------------------------
// flyers
// ---------------------------------------------------------------------------
function flyer(tb: TB, m: ModelSpec, team: number): void {
  const v = (m.variant as string) ?? 'bat';
  const color = C(m.color, 0x6a6a6a);
  const wing = C(m.wingColor, shade(color, 0.8));
  const glow = typeof m.glow === 'number' ? (m.glow as number) : null;
  const b = tb.b;
  tb.height = 1.0;
  const wings = (span: number, chord: number, kind: 'feather' | 'bat' | 'moth' | 'manta') => {
    for (const side of [-1, 1]) {
      const wp = tb.part(side < 0 ? 'wingL' : 'wingR', 'body', [0, 0.05, side * 0.18]);
      if (kind === 'moth') {
        wp.s.box(chord, 0.03, span, wing, { z: side * span / 2 });
        wp.s.box(chord * 0.7, 0.032, span * 0.6, mixHex(wing, 0xffffff, 0.35), { x: -chord * 0.2, z: side * span * 0.55 });
        if (glow) wp.g.sphere(0.08, glow, { x: 0, y: 0.03, z: side * span * 0.6, sy: 0.3 });
      } else if (kind === 'manta') {
        wp.s.wedge(chord, 0.04, span, wing, { x: -chord * 0.5, ry: side > 0 ? 0 : 0, sz: side, z: 0, rx: Math.PI / 2 });
      } else {
        wp.s.box(chord, 0.04, span * 0.55, wing, { z: side * span * 0.28 });
        wp.s.box(chord * 0.75, 0.035, span * 0.5, shade(wing, kind === 'bat' ? 0.8 : 1.1), { x: -chord * 0.1, z: side * span * 0.75 });
      }
    }
  };
  const riderOn = (y: number) => {
    if (!m.rider) return;
    const rc = C(m.riderColor, 0x6a6a7a);
    b.box(0.22, 0.32, 0.28, rc, { x: 0.05, y: y + 0.16 });
    b.box(0.2, 0.2, 0.2, 0xe0b090, { x: 0.08, y: y + 0.42 });
    b.box(0.04, 0.2, 0.3, team, { x: -0.1, y: y + 0.2 });
    b.box(0.7, 0.03, 0.03, 0xd8d0c0, { x: 0.35, y: y + 0.25, z: 0.18 });
  };
  switch (v) {
    case 'balloon': {
      b.sphere(0.55, color, { y: 0.9, sx: 1.4, sy: 0.85, sz: 0.9 }, 1);
      for (let i = -1; i <= 1; i++) b.box(1.3, 0.04, 0.05, shade(color, 0.7), { y: 0.9 + i * 0.22, sz: 1 });
      b.box(0.04, 0.5, 0.04, 0x4a3a2a, { x: 0.25, y: 0.35 });
      b.box(0.04, 0.5, 0.04, 0x4a3a2a, { x: -0.25, y: 0.35 });
      b.box(0.6, 0.18, 0.32, wing, { y: 0.1 });
      b.box(0.04, 0.12, 0.34, team, { x: 0.3, y: 0.12 });
      b.box(0.15, 0.2, 0.15, 0xe0b090, { x: 0.05, y: 0.28 });
      const pp = tb.part('prop', 'body', [-0.42, 0.12, 0]);
      pp.s.box(0.02, 0.4, 0.06, 0x4a4a4a);
      b.wedge(0.25, 0.3, 0.02, team, { x: -0.8, y: 0.8, ry: Math.PI });
      tb.height = 1.6;
      return;
    }
    case 'manta': {
      b.sphere(0.4, color, { sx: 1.3, sy: 0.3, sz: 0.8 });
      b.cone(0.05, 1.0, 4, shade(color, 0.7), { x: -0.9, rz: Math.PI / 2 });
      if (glow) for (let i = 0; i < 4; i++) tb.bg.sphere(0.05, glow, { x: 0.25 - i * 0.18, y: 0.12, z: (i % 2 ? 1 : -1) * 0.15 });
      for (const side of [-1, 1]) {
        const wp = tb.part(side < 0 ? 'wingL' : 'wingR', 'body', [0, 0, side * 0.35]);
        wp.s.box(0.7, 0.05, 0.9, wing, { x: -0.05, z: side * 0.42 });
        wp.s.box(0.35, 0.04, 0.45, shade(wing, 1.2), { x: -0.25, z: side * 0.95 });
        if (glow) wp.g.box(0.5, 0.06, 0.04, glow, { z: side * 0.7 });
      }
      tb.height = 0.6;
      return;
    }
    case 'moth': {
      b.cyl(0.1, 0.07, 0.6, 6, color, { x: -0.1, rz: Math.PI / 2 });
      b.sphere(0.12, color, { x: 0.25 });
      for (const s of [-1, 1]) b.cyl(0.01, 0.01, 0.3, 3, 0x3a3a3a, { x: 0.35, y: 0.15, z: s * 0.06, rz: -0.6, rx: s * 0.4 });
      wings(1.1, 0.7, 'moth');
      riderOn(0.05);
      tb.height = 0.9;
      return;
    }
    case 'drake': {
      b.box(0.9, 0.38, 0.42, color, { y: 0.05 });
      b.box(0.5, 0.2, 0.2, color, { x: 0.55, y: 0.2, rz: 0.5 });
      const hp = tb.part('head', 'body', [0.82, 0.38, 0]);
      hp.s.box(0.36, 0.2, 0.24, color);
      for (const s of [-1, 1]) hp.s.cone(0.04, 0.22, 4, 0xe8dcc0, { x: -0.12, y: 0.15, z: s * 0.08, rz: 0.9 });
      for (const s of [-1, 1]) (glow ? hp.g : hp.s).box(0.04, 0.04, 0.04, glow ?? 0xffd040, { x: 0.12, y: 0.06, z: s * 0.08 });
      b.cone(0.13, 0.9, 5, shade(color, 0.85), { x: -0.85, y: 0.0, rz: Math.PI / 2 });
      for (let i = 0; i < 4; i++) b.cone(0.05, 0.16, 4, shade(color, 1.3), { x: 0.3 - i * 0.22, y: 0.3 });
      for (const side of [-1, 1]) {
        b.box(0.1, 0.3, 0.1, shade(color, 0.8), { x: 0.25, y: -0.2, z: side * 0.15 });
        b.box(0.1, 0.3, 0.1, shade(color, 0.8), { x: -0.25, y: -0.2, z: side * 0.15 });
      }
      wings(1.7, 0.75, 'bat');
      tb.height = 1.1;
      return;
    }
    case 'harpy': {
      b.box(0.25, 0.4, 0.3, color, { y: 0.1 });
      const hp = tb.part('head', 'body', [0.05, 0.42, 0]);
      hp.s.box(0.22, 0.22, 0.2, 0xd0a080);
      hp.s.box(0.3, 0.15, 0.24, 0x3a2a2a, { x: -0.05, y: 0.1 });
      for (const s of [-1, 1]) b.cone(0.04, 0.2, 4, 0x3a3a3a, { y: -0.22, z: s * 0.08, rz: Math.PI });
      wings(1.1, 0.4, 'feather');
      tb.height = 0.9;
      return;
    }
    default: {
      // birds: roc, vulture, rotwing
      const big = v === 'roc' ? 1.25 : 1.0;
      b.sphere(0.32 * big, color, { sx: 1.5, sy: 0.85, sz: 0.9 });
      const hp = tb.part('head', 'body', [0.42 * big, 0.2 * big, 0]);
      const hc = typeof m.head === 'number' ? (m.head as number) : v === 'roc' ? 0xf0e0c0 : v === 'rotwing' ? 0xc8c0b0 : 0xd09a8a;
      hp.s.box(0.24, 0.2, 0.2, hc);
      hp.s.cone(0.07, 0.22, 4, v === 'roc' ? 0xe0a030 : 0x5a5a5a, { x: 0.18, y: -0.03, rz: -Math.PI / 2 });
      for (const s of [-1, 1]) (glow ? hp.g : hp.s).box(0.03, 0.03, 0.03, glow ?? 0x111111, { x: 0.08, y: 0.06, z: s * 0.08 });
      b.box(0.35, 0.05, 0.4, shade(color, 0.8), { x: -0.5 * big, y: 0.02 });
      if (v === 'rotwing') for (let i = 0; i < 3; i++) b.box(0.04, 0.1, 0.3, 0xd9d2bf, { x: 0.1 - i * 0.15, y: 0.25 });
      wings(1.6 * big, 0.5 * big, v === 'rotwing' ? 'bat' : 'feather');
      riderOn(0.2 * big);
      tb.height = 1.0 * big + (m.rider ? 0.4 : 0);
      return;
    }
  }
}

// ---------------------------------------------------------------------------
// machines, wagons, spirits, treants, golems, wards
// ---------------------------------------------------------------------------
function machine(tb: TB, m: ModelSpec, team: number): void {
  const color = C(m.color, 0x8a6a4a);
  const metal = C(m.metal, 0x6a6a72);
  const glow = C(m.glow, 0xffa040);
  const b = tb.b;
  // steam colossus
  for (const side of [-1, 1]) {
    const lp = tb.part(side < 0 ? 'legL' : 'legR', 'body', [0, 0.9, side * 0.35]);
    lp.s.box(0.3, 0.9, 0.28, metal, { y: -0.45 });
    lp.s.box(0.45, 0.12, 0.36, shade(metal, 0.7), { x: 0.05, y: -0.86 });
  }
  const tp = tb.part('torso', 'body', [0, 0.9, 0]);
  tp.s.box(0.75, 0.8, 0.95, color, { y: 0.4 });
  tp.s.box(0.8, 0.12, 1.0, metal, { y: 0.05 });
  tp.s.box(0.8, 0.12, 1.0, metal, { y: 0.78 });
  tp.g.cyl(0.18, 0.18, 0.05, 8, glow, { x: 0.38, y: 0.42, rz: Math.PI / 2 });
  tp.s.cyl(0.09, 0.12, 0.6, 6, 0x3a3a3a, { x: -0.25, y: 1.1, z: 0.25 });
  tp.s.box(0.05, 0.3, 0.4, team, { x: 0.39, y: 0.65 });
  const hp = tb.part('head', 'torso', [0.1, 0.95, 0]);
  hp.s.box(0.35, 0.25, 0.35, metal);
  hp.g.box(0.04, 0.06, 0.25, glow, { x: 0.18, y: 0.02 });
  for (const side of [-1, 1]) {
    const ap = tb.part(side > 0 ? 'armR' : 'armL', 'torso', [0, 0.7, side * 0.6]);
    ap.s.box(0.22, 0.7, 0.22, metal, { y: -0.35 });
    ap.s.box(0.36, 0.3, 0.32, shade(color, 0.8), { x: 0.05, y: -0.8 });
  }
  tb.height = 2.4;
}

function wagon(tb: TB, m: ModelSpec, team: number): void {
  const v = (m.variant as string) ?? 'cart';
  const color = C(m.color, 0x6a4a2a);
  const metal = C(m.metal, 0x5a5a5a);
  const b = tb.b;
  const wheel = (x: number, z: number, r: number) => {
    const wp = tb.part('wheel' + x.toFixed(1) + z.toFixed(1), 'body', [x, r, z]);
    wp.s.cyl(r, r, 0.08, 8, 0x4a3a2a, { rx: Math.PI / 2 });
    wp.s.box(r * 1.8, 0.05, 0.09, 0x2a2a2a);
  };
  if (v === 'mortar') {
    b.box(0.6, 0.15, 0.5, color, { y: 0.15 });
    const ap = tb.part('arm', 'body', [0.05, 0.3, 0]);
    ap.s.cyl(0.13, 0.16, 0.6, 8, metal, { rz: -0.8, x: 0.1, y: 0.15 });
    wheel(0, 0.3, 0.16);
    wheel(0, -0.3, 0.16);
    // crew
    for (const s of [-1, 1]) {
      b.box(0.16, 0.3, 0.2, 0x5a4a3a, { x: -0.4, y: 0.32, z: s * 0.28 });
      b.box(0.16, 0.16, 0.16, C(m.crew, 0xe0b090), { x: -0.4, y: 0.56, z: s * 0.28 });
      b.box(0.17, 0.08, 0.17, metal, { x: -0.4, y: 0.66, z: s * 0.28 });
      b.box(0.02, 0.18, 0.12, team, { x: -0.31, y: 0.34, z: s * 0.28 });
    }
    tb.height = 0.9;
    return;
  }
  if (v === 'catapult') {
    b.box(1.2, 0.2, 0.6, color, { y: 0.4 });
    for (const s of [-1, 1]) b.box(0.15, 0.6, 0.08, color, { x: 0.15, y: 0.75, z: s * 0.25 });
    const ap = tb.part('arm', 'body', [0.15, 0.95, 0]);
    ap.s.box(1.2, 0.08, 0.1, shade(color, 0.85), { x: -0.45, rz: 0.3 });
    ap.s.cyl(0.14, 0.1, 0.12, 6, 0x3a3a3a, { x: -1.0, y: 0.18 });
    for (const x of [-0.4, 0.4]) {
      wheel(x, 0.34, 0.28);
      wheel(x, -0.34, 0.28);
    }
    b.box(0.04, 0.4, 0.3, team, { x: 0.55, y: 0.7 });
    for (let i = 0; i < 3; i++) b.cone(0.04, 0.18, 4, metal, { x: 0.62, y: 0.35, z: (i - 1) * 0.2, rz: -Math.PI / 2 });
    tb.height = 1.3;
    return;
  }
  // plague cart
  b.box(1.0, 0.35, 0.6, color, { y: 0.5 });
  b.box(1.05, 0.06, 0.65, metal, { y: 0.7 });
  for (const x of [-0.35, 0.35]) {
    wheel(x, 0.34, 0.3);
    wheel(x, -0.34, 0.3);
  }
  const ap = tb.part('arm', 'body', [-0.1, 0.78, 0]);
  ap.s.box(0.9, 0.06, 0.08, metal, { x: -0.3, rz: 0.4 });
  b.cyl(0.25, 0.18, 0.3, 8, 0x2a2a2a, { x: 0.2, y: 0.85 });
  if (typeof m.glow === 'number') tb.bg.cyl(0.22, 0.22, 0.03, 8, m.glow as number, { x: 0.2, y: 1.0 });
  b.box(0.04, 0.3, 0.3, team, { x: 0.52, y: 0.55 });
  for (let i = 0; i < 3; i++) b.box(0.08, 0.08, 0.4, metal, { x: -0.3 + i * 0.25, y: 0.85, rz: 0.4 });
  tb.height = 1.2;
}

function spirit(tb: TB, m: ModelSpec, team: number): void {
  const v = (m.variant as string) ?? 'wisp';
  const color = C(m.color, 0xbfe8ff);
  const glow = C(m.glow, color);
  const b = tb.b;
  const g = tb.bg;
  if (v === 'wisp') {
    g.sphere(0.2, glow, { y: 0.75 });
    b.sphere(0.12, mixHex(glow, 0xffffff, 0.6), { y: 0.75 });
    for (let i = 0; i < 3; i++) {
      const op = tb.part('orb' + i, 'body', [0, 0.75, 0]);
      op.g.sphere(0.05, glow, { x: Math.cos((i * Math.PI * 2) / 3) * 0.3, z: Math.sin((i * Math.PI * 2) / 3) * 0.3 });
    }
    b.box(0.02, 0.02, 0.02, team, { y: 0.4 });
    tb.height = 1.0;
    return;
  }
  if (v === 'wraith') {
    b.cone(0.32, 0.9, 7, color, { y: 0.55, rx: Math.PI });
    b.box(0.25, 0.4, 0.38, color, { y: 1.0 });
    const hp = tb.part('head', 'body', [0, 1.3, 0]);
    hp.s.cone(0.18, 0.4, 6, shade(color, 0.7), { y: 0.05 });
    for (const s of [-1, 1]) hp.g.box(0.03, 0.04, 0.04, glow, { x: 0.12, z: s * 0.06 });
    for (const side of [-1, 1]) {
      const ap = tb.part(side > 0 ? 'armR' : 'armL', 'body', [0, 1.15, side * 0.25]);
      ap.s.cone(0.07, 0.5, 4, color, { y: -0.25, rx: Math.PI });
      ap.g.sphere(0.05, glow, { y: -0.5 });
    }
    b.box(0.3, 0.06, 0.4, team, { y: 0.8 });
    tb.height = 1.6;
    return;
  }
  if (v === 'sylph') {
    b.cone(0.28, 0.85, 7, color, { y: 0.5 });
    b.box(0.2, 0.3, 0.28, color, { y: 0.95 });
    const hp = tb.part('head', 'body', [0, 1.22, 0]);
    hp.s.box(0.2, 0.22, 0.2, 0xb8a8e0);
    hp.s.box(0.24, 0.12, 0.24, 0xe8e8ff, { x: -0.04, y: 0.12 });
    for (const side of [-1, 1]) {
      const wp = tb.part(side < 0 ? 'wingL' : 'wingR', 'body', [-0.1, 1.0, side * 0.12]);
      wp.g.box(0.4, 0.5, 0.03, mixHex(glow, 0xffffff, 0.4), { x: -0.15, z: side * 0.15, ry: side * 0.6 });
    }
    for (const side of [-1, 1]) {
      const ap = tb.part(side > 0 ? 'armR' : 'armL', 'body', [0, 1.05, side * 0.18]);
      ap.s.box(0.07, 0.35, 0.07, 0xb8a8e0, { y: -0.17 });
    }
    b.box(0.22, 0.05, 0.3, team, { y: 0.8 });
    tb.height = 1.5;
    return;
  }
  // djinn
  b.cone(0.3, 1.0, 6, color, { y: 0.45, rx: Math.PI });
  g.cone(0.16, 0.6, 6, glow, { y: 0.25, rx: Math.PI });
  b.box(0.3, 0.45, 0.45, color, { y: 1.05 });
  const hp = tb.part('head', 'body', [0.02, 1.42, 0]);
  hp.s.box(0.26, 0.26, 0.24, shade(color, 0.9));
  hp.g.cone(0.14, 0.35, 5, glow, { y: 0.28 });
  for (const s of [-1, 1]) hp.g.box(0.03, 0.04, 0.05, 0xffffff, { x: 0.13, y: 0.04, z: s * 0.06 });
  for (const side of [-1, 1]) {
    const ap = tb.part(side > 0 ? 'armR' : 'armL', 'body', [0, 1.22, side * 0.3]);
    ap.s.box(0.12, 0.42, 0.12, color, { y: -0.2 });
    ap.g.sphere(0.08, glow, { y: -0.45 });
  }
  b.box(0.32, 0.06, 0.47, team, { y: 0.86 });
  tb.height = 1.9;
}

function treant(tb: TB, m: ModelSpec, team: number): void {
  const bark = C(m.bark, 0x5b4636);
  const leaves = C(m.leaves, 0x2f6b4f);
  const glow = typeof m.glow === 'number' ? (m.glow as number) : null;
  const v = (m.variant as string) ?? '';
  const b = tb.b;
  for (const side of [-1, 1]) {
    const lp = tb.part(side < 0 ? 'legL' : 'legR', 'body', [0, 0.55, side * 0.2]);
    lp.s.cyl(0.1, 0.16, 0.6, 5, bark, { y: -0.27 });
    lp.s.box(0.4, 0.08, 0.2, shade(bark, 0.8), { x: 0.06, y: -0.55 });
  }
  const tp = tb.part('torso', 'body', [0, 0.55, 0]);
  tp.s.cyl(0.22, 0.3, 1.0, 6, bark, { y: 0.5 });
  tp.s.sphere(0.5, leaves, { y: 1.15, sy: 0.75 }, 1);
  tp.s.sphere(0.32, shade(leaves, 1.15), { x: 0.2, y: 1.35, z: 0.2 }, 0);
  tp.s.sphere(0.3, shade(leaves, 0.9), { x: -0.2, y: 1.3, z: -0.25 }, 0);
  for (const s of [-1, 1]) tp.g.box(0.04, 0.05, 0.06, glow ?? 0xc0ff80, { x: 0.27, y: 0.75, z: s * 0.08 });
  tp.s.box(0.02, 0.2, 0.15, team, { x: 0.26, y: 0.45 });
  if (glow) {
    for (let i = 0; i < 3; i++) tp.g.sphere(0.06, glow, { x: Math.cos(i * 2.1) * 0.45, y: 1.0 + (i % 2) * 0.2, z: Math.sin(i * 2.1) * 0.45 });
  }
  for (const side of [-1, 1]) {
    const ap = tb.part(side > 0 ? 'armR' : 'armL', 'torso', [0, 0.85, side * 0.3]);
    ap.s.cyl(0.06, 0.09, 0.6, 5, bark, { y: -0.28, rx: side * 0.2 });
    ap.s.cone(0.05, 0.25, 4, bark, { y: -0.62, x: 0.06 });
    if (v === 'hurler' && side > 0) ap.s.sphere(0.14, 0x8a6aaa, { y: -0.7 });
  }
  tb.height = 2.0;
}

function golem(tb: TB, m: ModelSpec, team: number): void {
  const color = C(m.color, 0x7a7468);
  const crystal = C(m.crystal, 0x6ac0ff);
  const bone = m.variant === 'bone';
  const b = tb.b;
  for (const side of [-1, 1]) {
    const lp = tb.part(side < 0 ? 'legL' : 'legR', 'body', [0, 0.6, side * 0.25]);
    lp.s.box(0.26, 0.62, 0.26, shade(color, 0.85), { y: -0.3 });
  }
  const tp = tb.part('torso', 'body', [0, 0.6, 0]);
  if (bone) {
    tp.s.box(0.4, 0.7, 0.7, shade(color, 0.6), { y: 0.38 });
    for (let i = 0; i < 5; i++) tp.s.box(0.46, 0.06, 0.78, color, { y: 0.12 + i * 0.13 });
    for (let i = 0; i < 6; i++) tp.s.cone(0.04, 0.3, 4, color, { x: -0.2, y: 0.4 + (i % 3) * 0.2, z: (i - 2.5) * 0.12, rz: 1.2 });
  } else {
    tp.s.dodeca(0.5, color, { y: 0.42, sx: 0.8, sz: 1.1 });
    tp.s.dodeca(0.3, shade(color, 1.1), { y: 0.85, x: -0.05 });
  }
  tp.g.octa(0.12, crystal, { x: 0.28, y: 0.45 });
  for (let i = 0; i < 3; i++) tp.g.octa(0.08, crystal, { x: -0.15, y: 0.8 + i * 0.05, z: (i - 1) * 0.25, sy: 2 });
  tp.s.box(0.02, 0.2, 0.25, team, { x: 0.36, y: 0.2 });
  const hp = tb.part('head', 'torso', [0.18, 0.95, 0]);
  hp.s.box(0.26, 0.22, 0.26, bone ? 0xe8e0d0 : shade(color, 1.05));
  for (const s of [-1, 1]) hp.g.box(0.03, 0.04, 0.05, crystal, { x: 0.13, y: 0.02, z: s * 0.07 });
  for (const side of [-1, 1]) {
    const ap = tb.part(side > 0 ? 'armR' : 'armL', 'torso', [0, 0.72, side * 0.48]);
    ap.s.box(0.22, 0.6, 0.22, color, { y: -0.3 });
    ap.s.dodeca(0.18, shade(color, 0.9), { y: -0.66 });
  }
  tb.height = 1.9;
}

function ward(tb: TB, m: ModelSpec, team: number): void {
  const v = (m.variant as string) ?? 'totem';
  const color = C(m.color, 0x8a6a4a);
  const b = tb.b;
  const g = tb.bg;
  switch (v) {
    case 'banner':
      b.box(0.06, 2.0, 0.06, 0x5a3a2a, { y: 1.0 });
      b.box(0.03, 0.8, 0.6, team, { y: 1.5, z: 0.3 });
      b.box(0.035, 0.12, 0.62, 0xd4a843, { y: 1.88, z: 0.3 });
      b.cone(0.07, 0.15, 4, 0xd4a843, { y: 2.08 });
      b.cyl(0.25, 0.3, 0.12, 6, 0x6a6a6a, { y: 0.06 });
      tb.height = 2.2;
      break;
    case 'totem':
      for (let i = 0; i < 3; i++) b.cyl(0.15, 0.18, 0.4, 6, shade(color, 0.8 + i * 0.1), { y: 0.2 + i * 0.4 });
      g.sphere(0.12, color, { y: 1.35 });
      for (const s of [-1, 1]) b.box(0.25, 0.06, 0.06, 0xe8dcc0, { y: 1.0, z: s * 0.18 });
      b.box(0.02, 0.15, 0.2, team, { x: 0.17, y: 0.6 });
      tb.height = 1.5;
      break;
    case 'eye':
      g.sphere(0.12, 0xe8fff0, { y: 0.7 });
      g.sphere(0.06, color, { x: 0.09, y: 0.7 });
      tb.height = 0.9;
      break;
    case 'turret':
      b.cyl(0.3, 0.38, 0.3, 6, 0x5a5a5a, { y: 0.15 });
      b.box(0.36, 0.3, 0.36, color, { y: 0.45 });
      const tp = tb.part('turret', 'body', [0, 0.55, 0]);
      tp.s.cyl(0.06, 0.07, 0.7, 6, 0x2a2a2a, { x: 0.35, rz: Math.PI / 2 });
      tp.s.box(0.04, 0.15, 0.2, team, { y: 0.15 });
      tb.height = 0.9;
      break;
    case 'flame':
      b.cyl(0.25, 0.15, 0.6, 6, 0x3a3a3a, { y: 0.3 });
      g.cone(0.2, 0.55, 6, color, { y: 0.85 });
      g.cone(0.1, 0.35, 5, 0xffe0a0, { y: 0.8 });
      b.box(0.02, 0.12, 0.18, team, { x: 0.22, y: 0.35 });
      tb.height = 1.2;
      break;
  }
}

function goldMine(tb: TB): void {
  const b = tb.b;
  b.dodeca(1.5, 0x7a6e60, { y: 0.4, sy: 0.75, sx: 1.05 });
  b.dodeca(0.9, 0x8a7e70, { x: -0.5, y: 0.9, z: 0.4 });
  b.dodeca(0.7, 0x6a5e50, { x: 0.4, y: 1.0, z: -0.5 });
  // entrance frame
  b.box(0.15, 1.0, 0.15, 0x6a4a2a, { x: 1.25, y: 0.5, z: 0.45 });
  b.box(0.15, 1.0, 0.15, 0x6a4a2a, { x: 1.25, y: 0.5, z: -0.45 });
  b.box(0.18, 0.15, 1.1, 0x6a4a2a, { x: 1.25, y: 1.0 });
  b.box(0.05, 0.85, 0.8, 0x1a1410, { x: 1.18, y: 0.45 });
  for (let i = 0; i < 9; i++) {
    const a = i * 1.7;
    tb.bg.octa(0.12 + (i % 3) * 0.04, 0xffd040, { x: Math.cos(a) * 1.1, y: 0.5 + (i % 4) * 0.25, z: Math.sin(a) * 1.1 });
  }
  b.box(0.5, 0.25, 0.4, 0x6a4a2a, { x: 1.6, y: 0.15, z: 0.8 });
  tb.bg.octa(0.12, 0xffd040, { x: 1.6, y: 0.35, z: 0.8 });
  tb.height = 2.2;
}

// ---------------------------------------------------------------------------
// buildings
// ---------------------------------------------------------------------------
const FAC = {
  crown: { stone: 0xd8d0c0, stone2: 0xb8b0a0, roof: 0x3d5a8a, trim: 0xd4a843, wood: 0x8a6a45 },
  iron: { stone: 0x7a6a5a, stone2: 0x5a4a3a, roof: 0x9a6a4a, trim: 0xe8dcc0, wood: 0x6b4a2f },
  sepulchral: { stone: 0x3a3640, stone2: 0x2a2630, roof: 0x4a4054, trim: 0xd9d2bf, wood: 0x3a3030 },
  twilight: { stone: 0xcfd8e8, stone2: 0x9aa0c0, roof: 0x2f6b4f, trim: 0xb98cff, wood: 0x5b4636 },
  neutral: { stone: 0xb0a490, stone2: 0x8a7e6a, roof: 0x8a4a2a, trim: 0xd4a843, wood: 0x7a5a3a },
};

function building(tb: TB, m: ModelSpec, team: number, size: number): void {
  const f = (m.faction as keyof typeof FAC) ?? 'neutral';
  const v = (m.variant as string) ?? 'hall';
  const s = size;
  const b = tb.b;
  const g = tb.bg;
  const P = FAC[f] ?? FAC.neutral;
  // foundation hides uneven ground
  if (f !== 'twilight') b.box(s * 0.98, 0.7, s * 0.98, shade(P.stone2, 0.8), { y: -0.25 });
  tb.height = s * 0.9;
  const banner = (x: number, y: number, z: number, h = 0.8) => {
    b.box(0.05, h + 0.4, 0.05, 0x3a2a1a, { x, y: y + (h + 0.4) / 2, z });
    b.box(0.03, h * 0.6, 0.35, team, { x, y: y + h * 0.75, z: z + 0.18 });
  };
  if (f === 'crown') crownBuilding(b, g, v, s, P, team, banner, tb);
  else if (f === 'iron') ironBuilding(b, g, v, s, P, team, banner, tb);
  else if (f === 'sepulchral') sepBuilding(b, g, v, s, P, team, tb);
  else if (f === 'twilight') twilightBuilding(b, g, v, s, P, team, tb);
  else neutralBuilding(b, g, v, s, P, team, banner, tb);
}

type Pal = (typeof FAC)['crown'];
type BannerFn = (x: number, y: number, z: number, h?: number) => void;

function crownTower(b: Geo, x: number, z: number, r: number, h: number, P: Pal, team: number, g: Geo): void {
  b.cyl(r, r * 1.08, h, 8, P.stone, { x, y: h / 2, z });
  b.cyl(r * 1.15, r * 1.15, 0.12, 8, P.trim, { x, y: h, z });
  b.cone(r * 1.25, r * 2.2, 8, P.roof, { x, y: h + r * 1.1, z });
  b.box(0.04, 0.25, 0.04, P.trim, { x, y: h + r * 2.3, z });
  b.box(0.02, 0.18, 0.25, team, { x, y: h + r * 2.3, z: z + 0.13 });
  g.box(0.03, 0.18, 0.1, 0xffe0a0, { x: x + r * 0.98, y: h * 0.6, z });
}

function crownBuilding(b: Geo, g: Geo, v: string, s: number, P: Pal, team: number, banner: BannerFn, tb: TB): void {
  const hw = s / 2;
  switch (v) {
    case 'hall':
    case 'keep':
    case 'citadel': {
      const lvl = v === 'hall' ? 0 : v === 'keep' ? 1 : 2;
      b.box(s * 0.8, 1.5 + lvl * 0.3, s * 0.8, P.stone, { y: 0.75 + lvl * 0.15 });
      b.box(s * 0.84, 0.15, s * 0.84, P.trim, { y: 1.5 + lvl * 0.3 });
      // main hall roof
      b.cone(s * 0.55, 1.4 + lvl * 0.2, 4, P.roof, { y: 2.3 + lvl * 0.4, ry: Math.PI / 4 });
      b.box(s * 0.35, 1.0 + lvl * 0.5, s * 0.35, P.stone, { y: 2.4 + lvl * 0.5 });
      b.cone(s * 0.28, 1.0 + lvl * 0.3, 4, P.roof, { y: 3.4 + lvl * 0.9, ry: Math.PI / 4 });
      // door
      b.box(0.1, 0.9, 0.7, 0x4a3020, { x: s * 0.4, y: 0.45 });
      b.box(0.12, 0.12, 0.85, P.trim, { x: s * 0.41, y: 0.95 });
      for (const [x, z] of [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ])
        crownTower(b, x * (hw - 0.55), z * (hw - 0.55), 0.42 + lvl * 0.05, 1.9 + lvl * 0.5, P, team, g);
      banner(s * 0.42, 0, s * 0.25, 1.0);
      banner(s * 0.42, 0, -s * 0.25 - 0.35, 1.0);
      if (lvl >= 1) for (let i = -1; i <= 1; i += 2) b.box(0.2, 0.25, s * 0.82, P.stone2, { x: i * s * 0.4, y: 1.7, sy: 1 });
      if (lvl >= 2) g.sphere(0.18, 0xffe080, { y: 4.7 + lvl * 0.4 });
      tb.height = 4.2 + lvl * 0.8;
      break;
    }
    case 'farm':
      b.box(s * 0.6, 0.8, s * 0.55, P.stone, { x: -0.2, y: 0.4 });
      b.cone(s * 0.5, 0.8, 4, 0xa86a3a, { x: -0.2, y: 1.2, ry: Math.PI / 4, sz: 0.9 });
      for (let i = 0; i < 4; i++) b.box(0.6, 0.12, 0.08, 0xd8b850, { x: 0.45, y: 0.06, z: -0.6 + i * 0.4 });
      b.box(0.08, 0.5, 0.08, P.wood, { x: 0.75, y: 0.25, z: 0.75 });
      b.box(0.02, 0.2, 0.25, team, { x: 0.75, y: 0.45, z: 0.88 });
      tb.height = 1.6;
      break;
    case 'barracks':
      b.box(s * 0.85, 1.4, s * 0.6, P.stone, { y: 0.7 });
      b.cone(s * 0.62, 1.1, 4, P.roof, { y: 1.95, ry: Math.PI / 4, sx: 1.3, sz: 0.75 });
      crownTower(b, hw - 0.5, hw - 0.5, 0.4, 2.0, P, team, g);
      b.box(0.1, 0.8, 0.8, 0x4a3020, { x: s * 0.43, y: 0.4 });
      for (let i = 0; i < 3; i++) b.box(0.05, 0.4, 0.05, 0x9aa4b0, { x: -0.6 + i * 0.3, y: 0.2, z: hw - 0.25 });
      banner(s * 0.44, 0, -0.6, 0.9);
      tb.height = 3.0;
      break;
    case 'mill':
      b.box(s * 0.7, 1.1, s * 0.7, P.wood, { y: 0.55 });
      b.cone(s * 0.55, 0.9, 4, P.roof, { y: 1.55, ry: Math.PI / 4 });
      b.cyl(0.25, 0.25, 0.9, 6, 0x6a4a2a, { x: 0.9, y: 0.45, z: 0.9 });
      for (let i = 0; i < 4; i++) b.cyl(0.12, 0.12, 0.9, 5, 0x8a6a42, { x: -0.6, y: 0.12 + (i % 2) * 0.2, z: -0.9 + i * 0.2, rz: Math.PI / 2 });
      b.cyl(0.35, 0.35, 0.05, 10, 0x9a9aa0, { x: 0.3, y: 1.0, z: s * 0.36, rx: Math.PI / 2 });
      tb.height = 2.1;
      break;
    case 'smith':
      b.box(s * 0.75, 1.1, s * 0.7, P.stone2, { y: 0.55 });
      b.box(s * 0.8, 0.12, s * 0.75, P.roof, { y: 1.15 });
      b.cyl(0.25, 0.3, 1.5, 6, 0x5a5a5a, { x: -0.7, y: 1.5, z: -0.6 });
      g.box(0.1, 0.4, 0.5, 0xff8030, { x: s * 0.38, y: 0.35 });
      b.box(0.4, 0.3, 0.25, 0x3a3a3a, { x: 1.0, y: 0.15, z: 0.8 });
      tb.height = 2.3;
      break;
    case 'altar':
      b.cyl(s * 0.45, s * 0.5, 0.35, 8, P.stone2, { y: 0.17 });
      b.cyl(s * 0.32, s * 0.36, 0.3, 8, P.stone, { y: 0.5 });
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        b.box(0.18, 1.6, 0.18, P.stone, { x: Math.cos(a) * s * 0.36, y: 0.8, z: Math.sin(a) * s * 0.36 });
        g.sphere(0.12, 0xffe080, { x: Math.cos(a) * s * 0.36, y: 1.7, z: Math.sin(a) * s * 0.36 });
      }
      g.octa(0.3, 0x9ad0ff, { y: 1.35 });
      tb.height = 2.0;
      break;
    case 'academy':
      b.cyl(s * 0.38, s * 0.42, 1.6, 8, P.stone, { y: 0.8 });
      b.cone(s * 0.45, 1.6, 8, 0x5a3a8a, { y: 2.4 });
      g.sphere(0.2, 0xc8a0ff, { y: 3.4 });
      for (let i = 0; i < 3; i++) g.box(0.05, 0.3, 0.12, 0xd0b0ff, { x: Math.cos(i * 2.1) * s * 0.39, y: 1.0, z: Math.sin(i * 2.1) * s * 0.39, ry: -i * 2.1 });
      banner(s * 0.4, 0, 0.3, 0.8);
      tb.height = 3.4;
      break;
    case 'workshop':
      b.box(s * 0.85, 1.3, s * 0.75, P.wood, { y: 0.65 });
      b.box(s * 0.9, 0.15, s * 0.8, 0x6a6a6a, { y: 1.35 });
      for (let i = 0; i < 2; i++) b.cyl(0.18, 0.22, 1.2, 6, 0x4a4a4a, { x: -0.8 + i * 0.6, y: 1.8, z: -0.7 });
      b.cyl(0.5, 0.5, 0.15, 10, 0x8a7a4a, { x: s * 0.42, y: 0.9, rz: Math.PI / 2 });
      g.box(0.08, 0.35, 0.9, 0xffa040, { x: s * 0.43, y: 0.35 });
      banner(s * 0.44, 0, 1.0, 0.8);
      tb.height = 2.6;
      break;
    case 'aerie':
      b.cyl(s * 0.4, s * 0.45, 2.2, 8, P.stone, { y: 1.1 });
      b.cyl(s * 0.48, s * 0.48, 0.2, 8, P.trim, { y: 2.2 });
      b.torus(s * 0.35, 0.2, 0x8a6a42, { y: 2.45, rx: Math.PI / 2 });
      b.sphere(0.25, 0xe8d8b0, { y: 2.5, x: 0.3 });
      banner(0, 2.2, 0, 0.9);
      tb.height = 3.4;
      break;
    case 'shop':
      b.box(s * 0.7, 1.0, s * 0.7, P.wood, { y: 0.5 });
      b.cone(s * 0.55, 0.9, 4, P.roof, { y: 1.45, ry: Math.PI / 4 });
      b.box(0.4, 0.06, s * 0.9, team, { x: s * 0.42, y: 0.95, rz: -0.4 });
      for (let i = 0; i < 3; i++) g.sphere(0.09, [0xff4040, 0x4080ff, 0x40ff80][i], { x: s * 0.45, y: 0.35, z: -0.4 + i * 0.4 });
      tb.height = 2.0;
      break;
    case 'tower':
    case 'towerArrow':
    case 'towerCannon':
    case 'towerArcane': {
      b.cyl(0.62, 0.75, 2.4, 8, P.stone, { y: 1.2 });
      b.cyl(0.8, 0.8, 0.2, 8, P.trim, { y: 2.4 });
      for (let i = 0; i < 8; i++) b.box(0.18, 0.25, 0.18, P.stone, { x: Math.cos(i * 0.785) * 0.7, y: 2.6, z: Math.sin(i * 0.785) * 0.7 });
      if (v === 'tower') b.cone(0.8, 1.0, 8, P.roof, { y: 3.1 });
      if (v === 'towerArrow') {
        b.cone(0.8, 1.2, 8, 0x2a6a3a, { y: 3.2 });
        b.box(0.05, 0.5, 0.05, 0x5a3a2a, { y: 4.0 });
      }
      if (v === 'towerCannon') {
        const tp = tb.part('turret', 'body', [0, 2.7, 0]);
        tp.s.cyl(0.18, 0.22, 1.1, 8, 0x3a3a3a, { x: 0.4, y: 0.1, rz: Math.PI / 2 - 0.3 });
        tp.s.box(0.6, 0.35, 0.6, 0x5a5a5a);
      }
      if (v === 'towerArcane') {
        b.cone(0.75, 1.3, 8, 0x5a3a8a, { y: 3.25 });
        g.octa(0.25, 0xc8a0ff, { y: 4.3 });
      }
      g.box(0.06, 0.3, 0.12, 0xffe0a0, { x: 0.66, y: 1.6 });
      b.box(0.02, 0.4, 0.3, team, { x: 0.7, y: 0.9 });
      tb.height = 3.8;
      break;
    }
    default:
      b.box(s * 0.8, 1.2, s * 0.8, P.stone, { y: 0.6 });
      b.cone(s * 0.6, 1.0, 4, P.roof, { y: 1.7, ry: Math.PI / 4 });
  }
}

function hut(b: Geo, x: number, z: number, r: number, h: number, P: Pal): void {
  b.cyl(r, r * 1.05, h * 0.5, 7, P.wood, { x, y: h * 0.25, z });
  b.cone(r * 1.25, h * 0.75, 7, P.roof, { x, y: h * 0.5 + h * 0.37, z });
  for (let i = 0; i < 3; i++) b.cone(0.03, 0.4, 3, P.trim, { x: x + Math.cos(i * 2) * 0.1, y: h * 1.25, z: z + Math.sin(i * 2) * 0.1, rz: (i - 1) * 0.3 });
}

function palisade(b: Geo, s: number, P: Pal, h = 1.0, gap = 0): void {
  const hw = s / 2 - 0.15;
  const n = Math.round(s * 2.2);
  for (let i = 0; i < n; i++) {
    const t = -hw + (i / (n - 1)) * hw * 2;
    for (const [x, z] of [
      [t, -hw],
      [t, hw],
      [-hw, t],
    ])
      b.cyl(0.07, 0.09, h, 4, P.wood, { x, y: h / 2, z });
    if (Math.abs(t) > gap) b.cyl(0.07, 0.09, h, 4, P.wood, { x: hw, y: h / 2, z: t });
    if (i % 2 === 0) b.cone(0.06, 0.2, 4, P.trim, { x: t, y: h + 0.1, z: -hw });
  }
}

function ironBuilding(b: Geo, g: Geo, v: string, s: number, P: Pal, team: number, banner: BannerFn, tb: TB): void {
  switch (v) {
    case 'hall':
    case 'keep':
    case 'citadel': {
      const lvl = v === 'hall' ? 0 : v === 'keep' ? 1 : 2;
      palisade(b, s, P, 1.0 + lvl * 0.2, 1.0);
      b.box(s * 0.62, 1.4 + lvl * 0.2, s * 0.55, P.wood, { y: 0.7 });
      b.cone(s * 0.5, 1.6 + lvl * 0.4, 4, P.roof, { y: 2.2 + lvl * 0.3, ry: Math.PI / 4, sx: 1.3 });
      for (let i = 0; i < 6; i++) b.cone(0.06, 0.6, 4, P.trim, { x: -1.0 + i * 0.4, y: 3.0 + lvl * 0.5, z: 0, rz: (i - 2.5) * 0.15 });
      b.box(0.1, 0.9, 0.8, 0x2a1a10, { x: s * 0.31, y: 0.45 });
      b.sphere(0.25, 0xe8dcc0, { x: s * 0.33, y: 1.25 });
      banner(s * 0.35, 0, 1.1, 1.1);
      banner(s * 0.35, 0, -1.4, 1.1);
      if (lvl >= 1) for (const z of [-1, 1]) b.box(0.3, 1.8 + lvl * 0.3, 0.3, IRON_METAL, { x: -s * 0.3, y: 0.9, z: z * s * 0.3 });
      if (lvl >= 2) g.box(0.2, 0.2, 0.2, 0xff6020, { y: 3.6 });
      tb.height = 3.4 + lvl * 0.6;
      break;
    }
    case 'farm':
      hut(b, 0, 0, s * 0.32, 1.6, P);
      b.box(0.1, 0.7, 0.6, 0x2a1a10, { x: s * 0.3, y: 0.35 });
      for (let i = 0; i < 4; i++) b.cone(0.06, 0.5, 4, P.trim, { x: Math.cos(i * 1.6) * s * 0.42, y: 0.25, z: Math.sin(i * 1.6) * s * 0.42, rz: 0.9 * Math.cos(i * 1.6), rx: -0.9 * Math.sin(i * 1.6) });
      banner(s * 0.3, 0, -0.4, 0.6);
      tb.height = 2.0;
      break;
    case 'barracks':
      palisade(b, s, P, 0.9, 0.8);
      hut(b, -0.5, -0.4, 0.8, 2.0, P);
      hut(b, 0.7, 0.6, 0.6, 1.5, P);
      b.box(0.08, 1.5, 0.08, P.wood, { x: 0.8, y: 0.75, z: -1.0 });
      b.box(0.5, 0.06, 0.06, P.wood, { x: 0.8, y: 1.3, z: -1.0 });
      banner(1.3, 0, 0.2, 0.9);
      tb.height = 2.4;
      break;
    case 'smith':
      b.box(s * 0.7, 1.0, s * 0.6, P.stone, { y: 0.5 });
      b.cone(s * 0.5, 0.7, 4, P.roof, { y: 1.35, ry: Math.PI / 4 });
      g.box(0.12, 0.4, 0.5, 0xff6020, { x: s * 0.35, y: 0.35 });
      b.box(0.35, 0.35, 0.25, IRON_METAL, { x: 1.0, y: 0.18, z: 0.9 });
      for (let i = 0; i < 3; i++) b.cyl(0.12, 0.12, 0.8, 5, P.wood, { x: -1.0, y: 0.1 + i * 0.2, z: -0.5 + i * 0.25, rz: Math.PI / 2 });
      tb.height = 1.9;
      break;
    case 'altar':
      b.cyl(s * 0.4, s * 0.45, 0.3, 7, P.stone2, { y: 0.15 });
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        b.box(0.2, 1.4, 0.25, P.stone, { x: Math.cos(a) * s * 0.35, y: 0.7, z: Math.sin(a) * s * 0.35, ry: -a });
      }
      g.cone(0.3, 0.7, 6, 0xff5020, { y: 0.7 });
      b.sphere(0.28, 0xe8dcc0, { y: 1.3 });
      tb.height = 1.8;
      break;
    case 'beastpen':
      palisade(b, s, P, 0.8, 0.9);
      hut(b, -0.6, -0.6, 0.7, 1.6, P);
      b.box(1.2, 0.08, 1.0, 0x8a7a4a, { x: 0.6, y: 0.04, z: 0.5 });
      b.box(0.6, 0.4, 0.3, 0x7a6a3a, { x: 0.8, y: 0.2, z: -0.8 });
      banner(1.5, 0, -0.2, 0.8);
      tb.height = 2.2;
      break;
    case 'academy':
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        b.cyl(0.12, 0.15, 1.6, 6, P.wood, { x: Math.cos(a) * s * 0.33, y: 0.8, z: Math.sin(a) * s * 0.33 });
        b.sphere(0.13, 0xe8dcc0, { x: Math.cos(a) * s * 0.33, y: 1.7, z: Math.sin(a) * s * 0.33 });
      }
      hut(b, 0, 0, 0.6, 1.8, P);
      g.sphere(0.15, 0x8ab0ff, { y: 2.45 });
      tb.height = 2.5;
      break;
    case 'mound':
      b.sphere(s * 0.45, 0x5a6a3a, { y: 0.2, sy: 0.55 }, 1);
      b.box(0.2, 2.2, 0.35, P.stone, { y: 1.3 });
      b.sphere(0.35, 0xe8dcc0, { y: 2.5 });
      for (const sd of [-1, 1]) b.cone(0.08, 0.6, 4, 0xe8dcc0, { y: 2.7, z: sd * 0.35, rx: sd * 1.0 });
      banner(s * 0.4, 0, 0.4, 1.0);
      tb.height = 2.9;
      break;
    case 'shop':
      hut(b, 0, 0, s * 0.3, 1.5, P);
      b.box(0.6, 0.5, 1.4, P.wood, { x: s * 0.32, y: 0.25 });
      for (let i = 0; i < 3; i++) g.sphere(0.08, [0xff4040, 0x4080ff, 0xffd040][i], { x: s * 0.36, y: 0.6, z: -0.4 + i * 0.4 });
      tb.height = 1.9;
      break;
    case 'tower':
      for (const [x, z] of [
        [-0.5, -0.5],
        [0.5, -0.5],
        [-0.5, 0.5],
        [0.5, 0.5],
      ])
        b.cyl(0.08, 0.1, 2.6, 4, P.wood, { x, y: 1.3, z });
      b.box(1.4, 0.15, 1.4, P.wood, { y: 2.3 });
      b.cone(0.95, 0.8, 4, P.roof, { y: 3.0, ry: Math.PI / 4 });
      for (let i = 0; i < 8; i++) b.cone(0.05, 0.4, 4, P.trim, { x: Math.cos(i * 0.785) * 0.8, y: 2.45, z: Math.sin(i * 0.785) * 0.8, rz: Math.cos(i * 0.785) * -1.2, rx: Math.sin(i * 0.785) * 1.2 });
      b.box(0.02, 0.4, 0.4, team, { x: 0.72, y: 1.6 });
      tb.height = 3.4;
      break;
    default:
      hut(b, 0, 0, s * 0.35, 1.6, P);
  }
}
const IRON_METAL = 0x5a5a60;

function obelisk(b: Geo, g: Geo, x: number, z: number, w: number, h: number, P: Pal, glow = 0x6dffb0): void {
  b.box(w, h, w, P.stone, { x, y: h / 2, z });
  b.cone(w * 0.75, w * 1.4, 4, P.stone2, { x, y: h + w * 0.7, z, ry: Math.PI / 4 });
  g.box(w * 1.02, 0.08, w * 0.3, glow, { x, y: h * 0.7, z });
}

function sepBuilding(b: Geo, g: Geo, v: string, s: number, P: Pal, team: number, tb: TB): void {
  const GL = 0x6dffb0;
  switch (v) {
    case 'hall':
    case 'keep':
    case 'citadel': {
      const lvl = v === 'hall' ? 0 : v === 'keep' ? 1 : 2;
      b.box(s * 0.7, 0.5, s * 0.7, P.stone2, { y: 0.25 });
      b.box(s * 0.45, 2.4 + lvl * 0.6, s * 0.45, P.stone, { y: 1.2 + lvl * 0.3 });
      b.cone(s * 0.33, 2.2 + lvl * 0.6, 4, P.stone2, { y: 3.5 + lvl * 0.9, ry: Math.PI / 4 });
      for (const [x, z] of [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ])
        obelisk(b, g, x * s * 0.33, z * s * 0.33, 0.35, 1.6 + lvl * 0.4, P, GL);
      g.octa(0.35, GL, { y: 4.9 + lvl * 1.1 });
      g.box(0.06, 1.0, 0.5, GL, { x: s * 0.23, y: 1.0 });
      for (let i = 0; i < 6; i++) b.cone(0.05, 0.4, 4, P.trim, { x: s * 0.35 * Math.cos(i), y: 0.6, z: s * 0.35 * Math.sin(i), rz: 0.4 });
      b.box(0.04, 0.6, 0.6, team, { x: s * 0.24, y: 2.2 });
      tb.height = 4.6 + lvl;
      break;
    }
    case 'lode':
      b.dodeca(1.3, 0x4a4450, { y: 0.4, sy: 0.7 });
      for (let i = 0; i < 4; i++) obelisk(b, g, Math.cos(i * 1.57 + 0.78) * 1.1, Math.sin(i * 1.57 + 0.78) * 1.1, 0.25, 1.2, P, GL);
      g.octa(0.3, 0xffd040, { y: 1.5 });
      g.torus(0.6, 0.05, GL, { y: 1.3, rx: Math.PI / 2 });
      b.box(0.03, 0.3, 0.3, team, { x: 1.3, y: 0.8 });
      tb.height = 2.2;
      break;
    case 'farm':
      obelisk(b, g, 0, 0, 0.6, 2.0, P, GL);
      b.cyl(0.7, 0.8, 0.2, 4, P.stone2, { y: 0.1, ry: Math.PI / 4 });
      b.box(0.02, 0.4, 0.3, team, { x: 0.31, y: 1.0 });
      tb.height = 2.6;
      break;
    case 'barracks':
      b.box(s * 0.75, 1.1, s * 0.65, P.stone, { y: 0.55 });
      b.box(s * 0.8, 0.15, s * 0.7, P.stone2, { y: 1.15 });
      for (let i = 0; i < 3; i++) b.cone(0.3, 1.0, 4, P.stone2, { x: -0.8 + i * 0.8, y: 1.7, ry: Math.PI / 4 });
      g.box(0.1, 0.7, 0.9, GL, { x: s * 0.38, y: 0.4 });
      for (let i = 0; i < 4; i++) b.box(0.08, 0.3, 0.08, P.trim, { x: -1.2 + i * 0.8, y: 1.35, z: s * 0.33 });
      b.box(0.03, 0.5, 0.4, team, { x: s * 0.38, y: 1.0, z: 1.0 });
      tb.height = 2.4;
      break;
    case 'smith':
      b.box(s * 0.6, 0.8, s * 0.6, P.stone, { y: 0.4 });
      for (let i = 0; i < 4; i++) b.box(0.1, 1.2, 0.1, P.trim, { x: Math.cos(i * 1.57) * 0.8, y: 1.1, z: Math.sin(i * 1.57) * 0.8, rz: 0.2 });
      b.sphere(0.3, P.trim, { y: 1.1 });
      g.sphere(0.12, GL, { y: 1.5 });
      tb.height = 2.0;
      break;
    case 'altar':
      b.cyl(s * 0.42, s * 0.48, 0.3, 6, P.stone2, { y: 0.15 });
      for (let i = 0; i < 6; i++) obelisk(b, g, Math.cos(i * 1.047) * s * 0.36, Math.sin(i * 1.047) * s * 0.36, 0.18, 1.0, P, GL);
      g.cone(0.25, 0.8, 6, GL, { y: 0.7 });
      b.sphere(0.2, P.trim, { y: 1.3 });
      tb.height = 1.8;
      break;
    case 'academy':
      b.cyl(s * 0.35, s * 0.42, 1.3, 6, P.stone, { y: 0.65 });
      b.cone(s * 0.38, 2.2, 6, P.stone2, { y: 2.4 });
      g.torus(0.6, 0.05, 0xb08aff, { y: 1.6, rx: Math.PI / 2 });
      g.sphere(0.2, 0xb08aff, { y: 3.6 });
      b.box(0.03, 0.4, 0.3, team, { x: s * 0.36, y: 0.8 });
      tb.height = 3.6;
      break;
    case 'workshop':
      b.box(s * 0.8, 1.2, s * 0.7, P.stone, { y: 0.6 });
      b.box(s * 0.5, 0.8, s * 0.4, P.stone2, { y: 1.6 });
      for (let i = 0; i < 2; i++) b.cyl(0.15, 0.2, 1.4, 5, P.trim, { x: -0.8 + i * 1.6, y: 2.0, z: -0.8 });
      g.box(0.1, 0.6, 1.0, 0x9cff5a, { x: s * 0.41, y: 0.5 });
      b.torus(0.4, 0.06, 0x5a5a5a, { x: 0.8, y: 0.5, z: 1.2 });
      tb.height = 2.8;
      break;
    case 'aerie':
      b.cyl(s * 0.45, s * 0.48, 0.4, 7, P.stone2, { y: 0.2 });
      g.cyl(s * 0.35, s * 0.35, 0.05, 12, 0x2a8a8a, { y: 0.42 });
      for (let i = 0; i < 4; i++) obelisk(b, g, Math.cos(i * 1.57) * s * 0.4, Math.sin(i * 1.57) * s * 0.4, 0.3, 2.4, P, 0x7affd0);
      g.torus(s * 0.32, 0.06, 0x7affd0, { y: 1.8, rx: Math.PI / 2 });
      tb.height = 3.0;
      break;
    case 'shop':
      b.box(s * 0.6, 1.0, s * 0.6, P.stone, { y: 0.5 });
      b.cone(s * 0.45, 1.0, 4, P.stone2, { y: 1.5, ry: Math.PI / 4 });
      for (let i = 0; i < 3; i++) g.sphere(0.08, [GL, 0xb08aff, 0xffd040][i], { x: s * 0.31, y: 0.4, z: -0.4 + i * 0.4 });
      tb.height = 2.0;
      break;
    case 'towerArcane':
    case 'towerArrow':
      obelisk(b, g, 0, 0, 0.65, 2.6, P, v === 'towerArcane' ? GL : 0xd9d2bf);
      g.octa(0.25, v === 'towerArcane' ? GL : 0xffffff, { y: 3.6 });
      b.box(0.02, 0.4, 0.3, team, { x: 0.34, y: 1.2 });
      tb.height = 3.8;
      break;
    default:
      obelisk(b, g, 0, 0, s * 0.4, 1.8, P, GL);
  }
}

function canopy(b: Geo, x: number, y: number, z: number, r: number, c: number): void {
  b.sphere(r, c, { x, y, z, sy: 0.7 }, 1);
  b.sphere(r * 0.6, shade(c, 1.15), { x: x + r * 0.4, y: y + r * 0.25, z: z + r * 0.2 }, 0);
  b.sphere(r * 0.55, shade(c, 0.9), { x: x - r * 0.4, y: y + r * 0.15, z: z - r * 0.35 }, 0);
}

function twilightBuilding(b: Geo, g: Geo, v: string, s: number, P: Pal, team: number, tb: TB): void {
  const VI = 0xb98cff;
  const leaf = 0x2f6b4f;
  const leaf2 = 0x4a3a7a;
  b.cyl(s * 0.42, s * 0.48, 0.25, 9, 0x4a5a3a, { y: 0.05 });
  const trunk = (x: number, z: number, r: number, h: number) => {
    b.cyl(r * 0.75, r, h, 7, P.wood, { x, y: h / 2, z });
    for (let i = 0; i < 4; i++) b.cyl(0.04, r * 0.4, r * 1.6, 4, P.wood, { x: x + Math.cos(i * 1.57) * r * 0.9, y: r * 0.35, z: z + Math.sin(i * 1.57) * r * 0.9, rz: Math.cos(i * 1.57) * 1.0, rx: -Math.sin(i * 1.57) * 1.0 });
  };
  switch (v) {
    case 'hall':
    case 'keep':
    case 'citadel': {
      const lvl = v === 'hall' ? 0 : v === 'keep' ? 1 : 2;
      trunk(0, 0, 0.9 + lvl * 0.1, 3.2 + lvl * 0.6);
      canopy(b, 0, 3.6 + lvl * 0.7, 0, 1.9 + lvl * 0.25, lvl === 2 ? leaf2 : leaf);
      canopy(b, 1.0, 2.8 + lvl * 0.5, 0.8, 1.0, leaf);
      for (let i = 0; i < 6 + lvl * 2; i++) g.sphere(0.12, VI, { x: Math.cos(i * 1.1) * 1.8, y: 2.8 + (i % 3) * 0.5, z: Math.sin(i * 1.1) * 1.8 });
      g.box(0.1, 1.0, 0.6, 0xcfe3ff, { x: 0.85, y: 0.6 });
      b.box(0.04, 0.6, 0.4, team, { x: 0.9, y: 1.6 });
      tb.height = 5.0 + lvl;
      break;
    }
    case 'farm':
      b.cyl(1.1, 1.2, 0.3, 10, P.stone2, { y: 0.15 });
      g.cyl(0.95, 0.95, 0.05, 10, 0x8ad0ff, { y: 0.32 });
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        b.box(0.15, 0.8, 0.15, P.stone, { x: Math.cos(a) * 1.15, y: 0.4, z: Math.sin(a) * 1.15 });
        g.sphere(0.08, VI, { x: Math.cos(a) * 1.15, y: 0.9, z: Math.sin(a) * 1.15 });
      }
      b.box(0.03, 0.3, 0.25, team, { x: 1.25, y: 0.3 });
      tb.height = 1.2;
      break;
    case 'barracks':
    case 'academy':
    case 'workshop':
    case 'aerie': {
      const c = v === 'academy' ? leaf2 : v === 'workshop' ? 0x5a7aa0 : v === 'aerie' ? 0x6a3a8a : leaf;
      trunk(0, 0, 0.7, 2.6);
      canopy(b, 0, 3.0, 0, 1.5, c);
      // face
      for (const sd of [-1, 1]) g.box(0.05, 0.08, 0.12, VI, { x: 0.7, y: 1.6, z: sd * 0.22 });
      b.box(0.06, 0.08, 0.5, shade(P.wood, 0.6), { x: 0.72, y: 1.2 });
      for (const sd of [-1, 1]) b.cyl(0.12, 0.18, 1.2, 5, P.wood, { x: 0.2, y: 1.6, z: sd * 0.85, rx: sd * 0.9 });
      b.box(0.04, 0.5, 0.4, team, { x: 0.74, y: 0.7 });
      if (v === 'aerie') g.octa(0.3, VI, { y: 4.3 });
      tb.height = 4.2;
      break;
    }
    case 'smith':
      trunk(-0.4, -0.3, 0.4, 1.6);
      canopy(b, -0.4, 2.0, -0.3, 0.9, leaf);
      b.box(1.2, 0.8, 0.8, 0x7a6a4a, { x: 0.4, y: 0.4, z: 0.5 });
      b.cone(0.9, 0.6, 4, leaf, { x: 0.4, y: 1.1, z: 0.5, ry: Math.PI / 4 });
      for (let i = 0; i < 3; i++) b.box(0.05, 0.6, 0.05, 0xd8d0c0, { x: 1.0, y: 0.3, z: -0.6 + i * 0.25, rz: 0.2 });
      tb.height = 2.6;
      break;
    case 'altar':
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        b.box(0.22, 1.2 + (i % 2) * 0.4, 0.22, P.stone, { x: Math.cos(a) * s * 0.36, y: 0.7, z: Math.sin(a) * s * 0.36 });
      }
      g.octa(0.35, 0xcfe3ff, { y: 1.3 });
      g.torus(0.5, 0.04, VI, { y: 1.3, rx: Math.PI / 2 });
      trunk(0, 0, 0.25, 0.6);
      tb.height = 2.0;
      break;
    case 'shop':
      trunk(0, 0, 0.5, 1.6);
      canopy(b, 0, 2.0, 0, 1.1, 0x6a5a9a);
      for (let i = 0; i < 4; i++) g.sphere(0.1, [VI, 0x8ad0ff, 0xffd040, 0x9affc0][i], { x: Math.cos(i * 1.57) * 0.9, y: 1.2, z: Math.sin(i * 1.57) * 0.9 });
      b.box(0.04, 0.4, 0.3, team, { x: 0.55, y: 0.8 });
      tb.height = 2.8;
      break;
    case 'tower':
      trunk(0, 0, 0.42, 2.0);
      canopy(b, 0, 2.5, 0, 0.9, leaf);
      for (const sd of [-1, 1]) g.box(0.04, 0.07, 0.1, VI, { x: 0.4, y: 1.4, z: sd * 0.14 });
      b.box(0.03, 0.4, 0.3, team, { x: 0.43, y: 0.8 });
      tb.height = 3.2;
      break;
    default:
      trunk(0, 0, 0.5, 2);
      canopy(b, 0, 2.4, 0, 1.2, leaf);
  }
}

function neutralBuilding(b: Geo, g: Geo, v: string, s: number, P: Pal, team: number, banner: BannerFn, tb: TB): void {
  switch (v) {
    case 'tavern':
      b.box(s * 0.75, 1.3, s * 0.6, P.stone, { y: 0.65 });
      b.box(s * 0.78, 1.0, s * 0.63, P.wood, { y: 1.8 });
      b.cone(s * 0.55, 1.2, 4, P.roof, { y: 2.9, ry: Math.PI / 4, sx: 1.25 });
      b.cyl(0.18, 0.2, 1.2, 6, P.stone2, { x: -1.0, y: 3.2, z: -0.6 });
      g.box(0.05, 0.4, 0.3, 0xffd080, { x: s * 0.38, y: 0.7, z: 0.7 });
      g.box(0.05, 0.4, 0.3, 0xffd080, { x: s * 0.38, y: 1.8, z: -0.7 });
      b.box(0.1, 0.9, 0.7, 0x4a3020, { x: s * 0.38, y: 0.45, z: -0.4 });
      b.box(0.05, 0.5, 0.6, 0xd4a843, { x: s * 0.42, y: 1.6, z: 0.6 });
      tb.height = 3.6;
      break;
    case 'merchant':
      b.box(s * 0.6, 0.6, s * 0.4, P.wood, { y: 0.6 });
      b.cyl(0.6, 0.6, s * 0.65, 8, 0xe8d8b0, { y: 1.0, rx: Math.PI / 2, sx: 1, sz: 1 });
      for (const x of [-0.6, 0.6]) {
        b.cyl(0.3, 0.3, 0.08, 8, 0x5a3a2a, { x, y: 0.3, z: s * 0.22, rx: Math.PI / 2 });
        b.cyl(0.3, 0.3, 0.08, 8, 0x5a3a2a, { x, y: 0.3, z: -s * 0.22, rx: Math.PI / 2 });
      }
      for (let i = 0; i < 4; i++) g.sphere(0.09, [0xff4040, 0x4080ff, 0xffd040, 0x40ff80][i], { x: -0.6 + i * 0.4, y: 0.25, z: s * 0.35 });
      b.box(0.5, 0.4, 0.5, 0x8a6a3a, { x: 1.0, y: 0.2, z: 0.9 });
      tb.height = 1.8;
      break;
    case 'mercs':
      for (const [x, z] of [
        [-0.6, -0.5],
        [0.6, 0.5],
      ])
        b.cone(0.8, 1.4, 6, 0x8a6a4a, { x, y: 0.7, z });
      g.cone(0.25, 0.5, 5, 0xff8030, { x: 0.5, y: 0.25, z: -0.7 });
      b.box(0.08, 1.4, 0.08, P.wood, { x: -1.1, y: 0.7, z: 0.9 });
      b.box(0.03, 0.5, 0.5, 0x8a2a2a, { x: -1.1, y: 1.2, z: 1.15 });
      tb.height = 1.8;
      break;
    case 'fountainLife':
    case 'fountainMana': {
      const c = v === 'fountainLife' ? 0x60ff90 : 0x60a0ff;
      b.cyl(s * 0.42, s * 0.45, 0.35, 10, P.stone, { y: 0.17 });
      g.cyl(s * 0.36, s * 0.36, 0.04, 10, c, { y: 0.36 });
      b.cyl(0.2, 0.25, 1.2, 6, P.stone2, { y: 0.8 });
      b.cyl(0.55, 0.3, 0.15, 8, P.stone, { y: 1.4 });
      g.sphere(0.2, c, { y: 1.7 });
      tb.height = 2.0;
      break;
    }
    default:
      b.box(s * 0.7, 1.2, s * 0.7, P.stone, { y: 0.6 });
      b.cone(s * 0.5, 1.0, 4, P.roof, { y: 1.7, ry: Math.PI / 4 });
  }
  void team;
  void banner;
}

// ---------------------------------------------------------------------------
// trees, doodads, items, projectiles
// ---------------------------------------------------------------------------
export function treeGeometry(variant: number): THREE.BufferGeometry {
  const g = new Geo();
  g.jitter = 0.1;
  switch (variant) {
    case 0: // pine
      g.cyl(0.08, 0.12, 0.7, 5, 0x5a3e28, { y: 0.35 });
      g.cone(0.75, 1.1, 7, 0x2f5f3a, { y: 1.0 });
      g.cone(0.6, 0.95, 7, 0x356a40, { y: 1.55 });
      g.cone(0.42, 0.8, 7, 0x3c7546, { y: 2.05 });
      break;
    case 1: // oak
      g.cyl(0.1, 0.16, 1.0, 5, 0x5e4430, { y: 0.5 });
      g.sphere(0.7, 0x4d7a35, { y: 1.5, sy: 0.85 }, 1);
      g.sphere(0.45, 0x5a8a3c, { x: 0.3, y: 1.85, z: 0.15 }, 0);
      g.sphere(0.42, 0x467030, { x: -0.3, y: 1.7, z: -0.25 }, 0);
      break;
    case 2: // snowy pine
      g.cyl(0.08, 0.12, 0.7, 5, 0x5a4232, { y: 0.35 });
      g.cone(0.75, 1.1, 7, 0x3a5a4a, { y: 1.0 });
      g.cone(0.62, 0.3, 7, 0xeef4f8, { y: 1.42 });
      g.cone(0.58, 0.95, 7, 0x41624f, { y: 1.6 });
      g.cone(0.48, 0.25, 7, 0xeef4f8, { y: 1.95 });
      g.cone(0.38, 0.75, 7, 0xf2f6fa, { y: 2.2 });
      break;
    case 3: // dead tree
      g.cyl(0.07, 0.14, 1.4, 5, 0x5a4a3c, { y: 0.7, rz: 0.08 });
      g.cyl(0.03, 0.06, 0.7, 4, 0x5a4a3c, { x: 0.2, y: 1.2, rz: -0.8 });
      g.cyl(0.03, 0.05, 0.6, 4, 0x5a4a3c, { x: -0.2, y: 1.0, z: 0.1, rz: 0.9 });
      g.cyl(0.02, 0.04, 0.4, 4, 0x5a4a3c, { x: 0.05, y: 1.5, z: -0.2, rx: 0.8 });
      break;
    case 4: // palm / desert tree
      g.cyl(0.07, 0.11, 1.6, 5, 0x8a6a4a, { y: 0.8, rz: 0.12 });
      for (let i = 0; i < 6; i++) g.box(0.9, 0.04, 0.22, 0x6a8a3a, { x: Math.cos(i) * 0.4 + 0.2, y: 1.6, z: Math.sin(i) * 0.4, ry: -i, rz: -0.35 });
      break;
    case 5: // swamp willow
      g.cyl(0.1, 0.18, 1.1, 5, 0x4a3a2a, { y: 0.55 });
      g.sphere(0.75, 0x4a6a32, { y: 1.55, sy: 0.6 }, 1);
      for (let i = 0; i < 6; i++) g.box(0.06, 0.9, 0.06, 0x587a3a, { x: Math.cos(i) * 0.6, y: 1.1, z: Math.sin(i) * 0.6 });
      break;
    case 6: // charred
      g.cyl(0.06, 0.14, 1.3, 5, 0x2a2222, { y: 0.65 });
      g.cyl(0.03, 0.05, 0.6, 4, 0x2a2222, { x: 0.18, y: 1.1, rz: -0.9 });
      g.sphere(0.06, 0xff6a1a, { y: 1.3 });
      break;
  }
  return g.build();
}

export function rockGeometry(color: number): THREE.BufferGeometry {
  const g = new Geo();
  g.jitter = 0.12;
  g.dodeca(0.35, color, { y: 0.1, sy: 0.6 });
  g.dodeca(0.2, shade(color, 1.1), { x: 0.3, y: 0.05, z: 0.15, sy: 0.6 });
  return g.build();
}

export function tuftGeometry(color: number): THREE.BufferGeometry {
  const g = new Geo();
  g.jitter = 0.15;
  for (let i = 0; i < 4; i++) g.cone(0.05, 0.3, 3, shade(color, 0.9 + i * 0.07), { x: Math.cos(i * 1.7) * 0.08, y: 0.15, z: Math.sin(i * 1.7) * 0.08, rz: (i - 1.5) * 0.25 });
  return g.build();
}

export function itemGeometry(): { solid: THREE.BufferGeometry; glow: THREE.BufferGeometry } {
  const s = new Geo();
  s.box(0.4, 0.25, 0.3, 0x7a5a3a, { y: 0.13 });
  s.box(0.42, 0.06, 0.32, 0xd4a843, { y: 0.27 });
  const gl = new Geo();
  gl.jitter = 0;
  gl.octa(0.12, 0xffe080, { y: 0.5 });
  return { solid: s.build(), glow: gl.build() };
}

export function projectileGeometry(kind: string, color?: number): { geo: THREE.BufferGeometry; glow: boolean } {
  const g = new Geo();
  g.jitter = 0;
  switch (kind) {
    case 'arrow':
      g.box(0.6, 0.03, 0.03, 0x8a6a4a);
      g.cone(0.04, 0.12, 4, color ?? 0xc0c0c0, { x: 0.33, rz: -Math.PI / 2 });
      g.box(0.1, 0.06, 0.01, 0xf0f0f0, { x: -0.27 });
      return { geo: g.build(), glow: false };
    case 'spear':
      g.box(0.9, 0.04, 0.04, 0x7a5a3a);
      g.cone(0.05, 0.16, 4, 0xc0c0c0, { x: 0.5, rz: -Math.PI / 2 });
      return { geo: g.build(), glow: false };
    case 'bullet':
      g.sphere(0.06, 0xffe0a0, {}, 0);
      g.box(0.3, 0.02, 0.02, 0xfff0c0, { x: -0.15 });
      return { geo: g.build(), glow: true };
    case 'boulder':
      g.dodeca(0.28, 0x6a6058);
      return { geo: g.build(), glow: false };
    case 'shell':
      g.sphere(0.16, 0x2a2a2a, {}, 0);
      return { geo: g.build(), glow: false };
    case 'bone':
      g.box(0.45, 0.07, 0.07, 0xe8e0d0);
      g.sphere(0.07, 0xe8e0d0, { x: 0.22 }, 0);
      g.sphere(0.07, 0xe8e0d0, { x: -0.22 }, 0);
      return { geo: g.build(), glow: false };
    case 'seed':
      g.sphere(0.18, 0x6a4a8a, { sx: 1.3 }, 0);
      g.cone(0.05, 0.2, 4, 0x3a6a2a, { x: -0.2, rz: Math.PI / 2 });
      return { geo: g.build(), glow: false };
    case 'blade':
      for (let i = 0; i < 3; i++) g.box(0.5, 0.02, 0.08, 0xd0d0d0, { ry: (i * Math.PI * 2) / 3 });
      return { geo: g.build(), glow: false };
    case 'bolt':
      g.octa(0.14, color ?? 0xffffff, { sx: 2.5 });
      return { geo: g.build(), glow: true };
    default:
      g.sphere(0.15, color ?? 0xffffff, {}, 1);
      return { geo: g.build(), glow: true };
  }
}

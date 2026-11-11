import { EXPANSION_MINE_GOLD, MAIN_MINE_GOLD } from '../data/rules';
import { fbm, hash2, RNG } from '../util/rng';
import { Terrain, type BiomeId, type CampSpec, type MapData, type RampSpec } from './map';

export interface GenParams {
  name: string;
  description: string;
  size: number;
  players: 2 | 4;
  biome: BiomeId;
  seed: number;
  /** center plateau with ramps (tavern on top) */
  centerPlateau?: boolean;
  /** each base sits on its own plateau with one ramp */
  highBases?: boolean;
  water?: 'none' | 'ponds' | 'river' | 'marsh' | 'lake';
  forest?: number; // 0..1
  boss?: boolean;
}

type Dir = 'n' | 's' | 'e' | 'w';
const DV: Record<Dir, [number, number]> = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] };
function vecToDir(dx: number, dy: number): Dir {
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'e' : 'w';
  return dy >= 0 ? 's' : 'n';
}
const OPP: Record<Dir, Dir> = { n: 's', s: 'n', e: 'w', w: 'e' };

export const BIOME_BASE: Record<BiomeId, number> = {
  temperate: Terrain.Grass,
  winter: Terrain.Snow,
  badlands: Terrain.Sand,
  marsh: Terrain.Moss,
  ashen: Terrain.Ash,
};
export const BIOME_TREES: Record<BiomeId, number[]> = {
  temperate: [0, 0, 1],
  winter: [2, 2, 0],
  badlands: [3, 4, 3],
  marsh: [5, 5, 1],
  ashen: [6, 6, 3],
};

export const CAMPS: Record<CampSpec['difficulty'], { creeps: string[]; drop: number }[]> = {
  green: [
    { creeps: ['kobold_digger', 'kobold_digger', 'kobold_shaman'], drop: 1 },
    { creeps: ['gray_wolf', 'gray_wolf'], drop: 1 },
    { creeps: ['bandit', 'bandit', 'bandit_xbow'], drop: 2 },
    { creeps: ['kobold_digger', 'gnoll_brute'], drop: 1 },
  ],
  orange: [
    { creeps: ['ogre_mauler', 'gnoll_brute', 'gnoll_brute'], drop: 3 },
    { creeps: ['dire_alpha', 'gray_wolf', 'gray_wolf'], drop: 3 },
    { creeps: ['bog_troll', 'bog_troll', 'bog_hexer'], drop: 3 },
    { creeps: ['bandit_captain', 'bandit_xbow', 'bandit'], drop: 3 },
    { creeps: ['giant_spider', 'giant_spider', 'kobold_shaman'], drop: 3 },
  ],
  red: [
    { creeps: ['ogre_warlord', 'ogre_mauler', 'ogre_mauler'], drop: 5 },
    { creeps: ['stone_golem', 'stone_golem', 'bog_hexer'], drop: 5 },
    { creeps: ['forest_drake', 'harpy', 'harpy'], drop: 4 },
    { creeps: ['broodmother', 'giant_spider', 'giant_spider'], drop: 5 },
  ],
  boss: [{ creeps: ['ancient_wyrm', 'forest_drake'], drop: 6 }],
};

export function generateMap(p: GenParams): MapData {
  const S = p.size;
  const n = S * S;
  const rng = new RNG(p.seed);
  const syms = p.players === 4 ? 4 : 2;
  const base = BIOME_BASE[p.biome];
  const terrain = new Uint8Array(n).fill(base);
  const level = new Uint8Array(n);
  const water = new Uint8Array(n);
  const tree = new Uint8Array(n);
  const keepClear = new Uint8Array(n); // tiles that must stay free of trees/water
  const ramps: RampSpec[] = [];
  const idx = (x: number, y: number) => y * S + x;
  const inb = (x: number, y: number) => x >= 0 && y >= 0 && x < S && y < S;

  // --- symmetry helpers ---------------------------------------------------
  const tileT = (x: number, y: number, k: number): [number, number] => {
    if (syms === 2) return k === 0 ? [x, y] : [S - 1 - x, S - 1 - y];
    let a = x;
    let b = y;
    for (let i = 0; i < k; i++) {
      const na = S - 1 - b;
      const nb = a;
      a = na;
      b = nb;
    }
    return [a, b];
  };
  const worldT = (x: number, y: number, k: number): [number, number] => {
    if (syms === 2) return k === 0 ? [x, y] : [S - x, S - y];
    let a = x;
    let b = y;
    for (let i = 0; i < k; i++) {
      const na = S - b;
      const nb = a;
      a = na;
      b = nb;
    }
    return [a, b];
  };
  const dirT = (d: Dir, k: number): Dir => {
    let [dx, dy] = DV[d];
    if (syms === 2) return k === 0 ? d : vecToDir(-dx, -dy);
    for (let i = 0; i < k; i++) {
      const ndx = -dy;
      const ndy = dx;
      dx = ndx;
      dy = ndy;
    }
    return vecToDir(dx, dy);
  };
  const sym = (x: number, y: number, fn: (x: number, y: number) => void) => {
    for (let k = 0; k < syms; k++) {
      const [a, b] = tileT(x, y, k);
      if (inb(a, b)) fn(a, b);
    }
  };
  const symDisc = (cx: number, cy: number, r: number, fn: (i: number, x: number, y: number, d: number) => void) => {
    const R = Math.ceil(r);
    for (let y = Math.floor(cy) - R; y <= Math.floor(cy) + R; y++)
      for (let x = Math.floor(cx) - R; x <= Math.floor(cx) + R; x++) {
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
        if (d > r) continue;
        sym(x, y, (a, b) => fn(idx(a, b), a, b, d));
      }
  };
  const symLine = (x0: number, y0: number, x1: number, y1: number, width: number, fn: (i: number, x: number, y: number) => void) => {
    const len = Math.hypot(x1 - x0, y1 - y0);
    const steps = Math.ceil(len * 2);
    for (let s = 0; s <= steps; s++) {
      const t = s / Math.max(1, steps);
      // gentle meander
      const wob = (fbm(s * 0.05, x0 * 0.1 + y0 * 0.1, p.seed + 33, 2) - 0.5) * 4;
      const nx = -(y1 - y0) / (len || 1);
      const ny = (x1 - x0) / (len || 1);
      const cx = x0 + (x1 - x0) * t + nx * wob * Math.sin(t * Math.PI);
      const cy = y0 + (y1 - y0) * t + ny * wob * Math.sin(t * Math.PI);
      const R = width / 2;
      for (let y = Math.floor(cy - R); y <= Math.ceil(cy + R); y++)
        for (let x = Math.floor(cx - R); x <= Math.ceil(cx + R); x++) {
          if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) > R) continue;
          sym(x, y, (a, b) => fn(idx(a, b), a, b));
        }
    }
  };

  // --- base terrain variation ----------------------------------------------
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      let f = 0;
      let g = 0;
      for (let k = 0; k < syms; k++) {
        const [a, b] = tileT(x, y, k);
        f += fbm(a * 0.045, b * 0.045, p.seed + 1, 4);
        g += fbm(a * 0.09, b * 0.09, p.seed + 2, 3);
      }
      f /= syms;
      g /= syms;
      const i = idx(x, y);
      // forest
      const edge = Math.min(x, y, S - 1 - x, S - 1 - y);
      const border = 4 + Math.floor(hash2(Math.min(x, S - 1 - x), Math.min(y, S - 1 - y), p.seed) * 2);
      const density = p.forest ?? 0.5;
      if (edge < border || f > 0.62 - density * 0.12) tree[i] = 1;
      // ground variation
      if (g > 0.62) terrain[i] = p.biome === 'winter' ? Terrain.Rock : p.biome === 'badlands' ? Terrain.Rock : Terrain.Dirt;
      else if (g < 0.32 && p.biome === 'temperate') terrain[i] = Terrain.Moss;
      else if (g < 0.32 && p.biome === 'winter') terrain[i] = Terrain.Grass;
      else if (g < 0.3 && p.biome === 'badlands') terrain[i] = Terrain.Dirt;
    }

  // --- key positions (canonical sector 0) ----------------------------------
  const P = (fx: number, fy: number): [number, number] => [Math.round(fx * S), Math.round(fy * S)];
  const start0: [number, number] = p.players === 4 ? P(0.16, 0.84) : P(0.19, 0.81);
  const center: [number, number] = [S / 2, S / 2];
  const toCenter = vecToDir(center[0] - start0[0], center[1] - start0[1]);
  // main mine sits toward the corner, away from the center
  const mdx = start0[0] < S / 2 ? -1 : 1;
  const mdy = start0[1] < S / 2 ? -1 : 1;
  const mine0: [number, number] = [start0[0] + mdx * 5.5 + 0.5, start0[1] + mdy * 5.5 + 0.5];
  const natural0: [number, number] = p.players === 4 ? P(0.14, 0.56) : P(0.17, 0.5);
  const mid0: [number, number] = p.players === 4 ? P(0.4, 0.62) : P(0.43, 0.68);
  const corner0: [number, number] = p.players === 4 ? P(0.5, 0.86) : P(0.17, 0.17);

  // --- cliffs ----------------------------------------------------------------
  const plateau = (cx: number, cy: number, r: number, L: number, rampDirs: Dir[]) => {
    symDisc(cx, cy, r + (hash2(cx, cy, p.seed) - 0.5) * 1.5, (i) => {
      level[i] = Math.max(level[i], L);
    });
    for (const outward of rampDirs) {
      const [dx, dy] = DV[outward];
      const px = -dy;
      const py = dx;
      const len = 4;
      const half = 2;
      // bastion so that ramp sides are plateau tiles
      for (let a = -half - 2; a <= half + 1; a++)
        for (let b = -len - 2; b <= 0; b++) {
          const x = Math.floor(cx + dx * r) + px * a + dx * b;
          const y = Math.floor(cy + dy * r) + py * a + dy * b;
          sym(x, y, (sx, sy) => {
            level[idx(sx, sy)] = L;
          });
        }
      // ramp tiles
      const tiles: [number, number][] = [];
      for (let a = -half; a < half; a++)
        for (let b = -len + 1; b <= 0; b++) {
          const x = Math.floor(cx + dx * r) + px * a + dx * b;
          const y = Math.floor(cy + dy * r) + py * a + dy * b;
          tiles.push([x, y]);
        }
      // approach outside must be low and open
      for (let a = -half - 1; a <= half; a++)
        for (let b = 1; b <= 4; b++) {
          const x = Math.floor(cx + dx * r) + px * a + dx * b;
          const y = Math.floor(cy + dy * r) + py * a + dy * b;
          sym(x, y, (sx, sy) => {
            const i = idx(sx, sy);
            level[i] = Math.min(level[i], L - 1);
            keepClear[i] = 1;
          });
        }
      for (let k = 0; k < syms; k++) {
        let x0 = Infinity;
        let y0 = Infinity;
        let x1 = -Infinity;
        let y1 = -Infinity;
        for (const [x, y] of tiles) {
          const [a, b] = tileT(x, y, k);
          x0 = Math.min(x0, a);
          y0 = Math.min(y0, b);
          x1 = Math.max(x1, a);
          y1 = Math.max(y1, b);
          keepClear[idx(a, b)] = 1;
        }
        ramps.push({ x0, y0, x1, y1, dir: dirT(OPP[outward], k), low: L - 1, high: L });
      }
    }
  };
  if (p.centerPlateau) {
    const r = Math.round(S * 0.1);
    const dirs: Dir[] = [toCenter === 'e' || toCenter === 'w' ? OPP[toCenter] : OPP[toCenter]];
    // second ramp toward the natural side for 2p maps
    if (p.players === 2) dirs.push(vecToDir(natural0[0] - center[0], natural0[1] - center[1]) === dirs[0] ? (dirs[0] === 'w' ? 's' : 'w') : vecToDir(natural0[0] - center[0], natural0[1] - center[1]));
    plateau(center[0], center[1], r, 1, dirs);
  }
  if (p.highBases) {
    plateau(start0[0], start0[1], 18, 1, [toCenter]);
  }

  // --- water -----------------------------------------------------------------
  const wmode = p.water ?? 'none';
  const putWater = (i: number, deep: boolean) => {
    if (keepClear[i] || level[i] > 0) return;
    water[i] = deep ? Math.max(water[i], 2) : Math.max(water[i], 1);
    tree[i] = 0;
  };
  if (wmode === 'river') {
    // river across the anti-diagonal, with fords
    const a: [number, number] = p.players === 4 ? [S * 0.5, S * 0.12] : [S * 0.12, S * 0.12];
    const b: [number, number] = [S / 2, S / 2];
    symLine(a[0], a[1], b[0], b[1], 5, (i) => putWater(i, true));
    symLine(a[0], a[1], b[0], b[1], 8, (i) => putWater(i, false));
  } else if (wmode === 'ponds' || wmode === 'lake') {
    const spots: [number, number][] = wmode === 'lake' ? [[S * 0.5, S * 0.5]] : [P(0.33, 0.45), P(0.3, 0.3)];
    for (const [x, y] of spots) {
      const r = wmode === 'lake' ? S * 0.09 : S * 0.045;
      symDisc(x, y, r + 2, (i, _x, _y, d) => putWater(i, d < r - 1));
    }
  } else if (wmode === 'marsh') {
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        let f = 0;
        for (let k = 0; k < syms; k++) {
          const [a, b] = tileT(x, y, k);
          f += fbm(a * 0.07, b * 0.07, p.seed + 9, 3);
        }
        f /= syms;
        if (f > 0.6) putWater(idx(x, y), f > 0.68);
      }
  }

  // --- clearings ---------------------------------------------------------------
  const clear = (cx: number, cy: number, r: number, flatten?: number) => {
    symDisc(cx, cy, r, (i) => {
      tree[i] = 0;
      water[i] = 0;
      keepClear[i] = 1;
      if (flatten !== undefined) level[i] = flatten;
    });
  };
  const baseLevel = p.highBases ? 1 : 0;
  clear(start0[0], start0[1], 12.5, baseLevel);
  clear(natural0[0], natural0[1], 8, 0);
  clear(mid0[0], mid0[1], 5, 0);
  clear(corner0[0], corner0[1], 8, 0);
  if (p.centerPlateau) clear(center[0], center[1], 5.5);
  else clear(center[0], center[1], 7, 0);

  // corridors between key points (trees only)
  const road = (a: [number, number], b: [number, number], w: number) =>
    symLine(a[0], a[1], b[0], b[1], w, (i) => {
      tree[i] = 0;
      keepClear[i] = 1;
      if (water[i] === 2) water[i] = 1; // fords
      if (level[i] === 0 || !p.highBases) {
        if (terrain[i] !== Terrain.Rock) terrain[i] = Terrain.Road;
      }
    });
  // bases on high ground connect through their ramp
  let exit0: [number, number] = start0;
  if (p.highBases) {
    const [dx, dy] = DV[toCenter];
    exit0 = [start0[0] + dx * 23, start0[1] + dy * 23];
    road(start0, exit0, 4);
  }
  road(exit0, natural0, 4);
  road(natural0, mid0, 4);
  road(mid0, center, 4);
  road(exit0, mid0, 4);
  road(natural0, corner0, 3.5);
  if (p.players === 4) road(mid0, worldT(mid0[0], mid0[1], 1) as [number, number], 3.5);
  else road(corner0, mid0, 3.5);

  // lumber lines near each base: guarantee trees behind the base
  symDisc(start0[0], start0[1], 18, (i, x, y, d) => {
    if (d < (p.highBases ? 13.5 : 14.5) || keepClear[i] || water[i] || level[i] !== baseLevel) return;
    const behind = (x + 0.5 - start0[0]) * (start0[0] < S / 2 ? -1 : 1) + (y + 0.5 - start0[1]) * (start0[1] < S / 2 ? -1 : 1);
    if (behind > -6) tree[i] = 1;
  });
  // re-clear key areas (symmetric pass above may overlap)
  clear(start0[0], start0[1], 12.5, baseLevel);

  // --- features ------------------------------------------------------------------
  const mines: MapData['mines'] = [];
  const starts: MapData['starts'] = [];
  const neutrals: MapData['neutrals'] = [];
  const camps: CampSpec[] = [];
  const addSym = (x: number, y: number, fn: (x: number, y: number) => void) => {
    for (let k = 0; k < syms; k++) {
      const [a, b] = worldT(x, y, k);
      fn(a, b);
    }
  };
  addSym(start0[0], start0[1], (x, y) => starts.push({ x, y }));
  addSym(mine0[0], mine0[1], (x, y) => mines.push({ x, y, gold: MAIN_MINE_GOLD }));
  // natural expansion mine pushed toward the map edge
  const nmx = natural0[0] + (natural0[0] < S / 2 ? -3.5 : 3.5) + 0.5;
  const nmy = natural0[1] + 0.5;
  addSym(nmx, nmy, (x, y) => mines.push({ x, y, gold: EXPANSION_MINE_GOLD }));
  const cmx = corner0[0] + (corner0[0] < S / 2 ? -3 : 3) + 0.5;
  const cmy = corner0[1] + (corner0[1] < S / 2 ? -3 : 3) + 0.5;
  addSym(cmx, cmy, (x, y) => mines.push({ x, y, gold: EXPANSION_MINE_GOLD + 3000 }));
  for (const m of [mine0, [nmx, nmy], [cmx, cmy]] as [number, number][]) clear(m[0], m[1], 3);

  // neutral buildings
  if (p.centerPlateau || p.players === 2) neutrals.push({ type: 'wayfarers_inn', x: S / 2, y: S / 2 });
  else neutrals.push({ type: 'wayfarers_inn', x: S / 2, y: S / 2 });
  const shop0: [number, number] = [mid0[0] + (p.players === 4 ? 3 : 0), mid0[1] - (p.players === 4 ? 0 : 3)];
  if (p.players === 2) {
    addSym(shop0[0], shop0[1], (x, y) => neutrals.push({ type: 'peddler_wagon', x, y }));
    addSym(corner0[0] + (corner0[0] < S / 2 ? 4.5 : -4.5), corner0[1] + (corner0[1] < S / 2 ? 4.5 : -4.5), (x, y) => neutrals.push({ type: 'sellsword_camp', x, y }));
    addSym(natural0[0] + 6, natural0[1] - 6, (x, y) => neutrals.push({ type: 'spring_life', x, y }));
  } else {
    addSym(shop0[0], shop0[1], (x, y) => neutrals.push({ type: k4(x, y) ? 'peddler_wagon' : 'sellsword_camp', x, y }));
    addSym(corner0[0], corner0[1] - 5, (x, y) => neutrals.push({ type: 'spring_life', x, y }));
  }
  function k4(x: number, y: number): boolean {
    return (x < S / 2) === (y < S / 2);
  }
  for (const nb of neutrals) {
    const s = nb.type === 'wayfarers_inn' ? 4 : 3;
    for (let y = Math.floor(nb.y - s); y <= Math.ceil(nb.y + s); y++)
      for (let x = Math.floor(nb.x - s); x <= Math.ceil(nb.x + s); x++)
        if (inb(x, y)) {
          tree[idx(x, y)] = 0;
          water[idx(x, y)] = 0;
          keepClear[idx(x, y)] = 1;
        }
  }

  // creep camps
  const pickCamp = (d: CampSpec['difficulty'], salt: number) => CAMPS[d][Math.floor(hash2(salt, p.seed, 77) * CAMPS[d].length)];
  const addCamp = (x: number, y: number, d: CampSpec['difficulty'], salt: number) => {
    const c = pickCamp(d, salt);
    clear(x, y, 2.5);
    addSym(x, y, (cx, cy) => camps.push({ x: cx, y: cy, creeps: [...c.creeps], drop: c.drop, difficulty: d }));
  };
  // greens near home
  const gdx = (S / 2 - start0[0]) > 0 ? 1 : -1;
  const gdy = (S / 2 - start0[1]) > 0 ? 1 : -1;
  addCamp(start0[0] + gdx * 15, start0[1] - gdy * 2, 'green', 1);
  addCamp(start0[0] + gdx * 4, start0[1] + gdy * 16, 'green', 2);
  // oranges guarding the natural & shop
  addCamp(natural0[0] + (natural0[0] < S / 2 ? 1 : -1) * 2, natural0[1] + (gdy > 0 ? 3.5 : -3.5), 'orange', 3);
  addCamp(mid0[0] + gdx * 4, mid0[1] + gdy * 3, 'orange', 4);
  // reds guarding corner gold
  addCamp(corner0[0] + (corner0[0] < S / 2 ? 2.5 : -2.5), corner0[1] + (corner0[1] < S / 2 ? 2.5 : -2.5), 'red', 5);
  if (p.boss) {
    const c = CAMPS.boss[0];
    camps.push({ x: S / 2 + (p.players === 2 ? 0 : 0), y: S / 2 + 6, creeps: [...c.creeps], drop: c.drop, difficulty: 'boss' });
  }

  // terrain dressing: dirt under bases
  symDisc(start0[0], start0[1], 9, (i, _x, _y, d) => {
    if (d < 7 || hash2(i, 3, p.seed) > 0.5) terrain[i] = p.biome === 'winter' ? Terrain.Dirt : p.biome === 'ashen' ? Terrain.Rock : Terrain.Dirt;
  });
  // sand on shores
  for (let y = 1; y < S - 1; y++)
    for (let x = 1; x < S - 1; x++) {
      const i = idx(x, y);
      if (water[i]) continue;
      if (water[i - 1] || water[i + 1] || water[i - S] || water[i + S]) terrain[i] = p.biome === 'winter' ? Terrain.Rock : Terrain.Sand;
    }
  // no trees on cliffs edges of plateaus is fine; no trees on ramps
  for (const r of ramps)
    for (let y = r.y0 - 1; y <= r.y1 + 1; y++) for (let x = r.x0 - 1; x <= r.x1 + 1; x++) if (inb(x, y)) tree[idx(x, y)] = 0;

  // --- connectivity safety net ----------------------------------------------------
  ensureConnected(S, level, water, tree, ramps, starts, mines, neutrals);

  // --- trees list ---------------------------------------------------------------
  const variants = BIOME_TREES[p.biome];
  const trees: [number, number, number][] = [];
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const i = idx(x, y);
      if (!tree[i] || water[i]) continue;
      const v = variants[Math.floor(hash2(x, y, p.seed + 5) * variants.length)];
      trees.push([x, y, v]);
    }
  void rng;
  return {
    name: p.name,
    description: p.description,
    w: S,
    h: S,
    biome: p.biome,
    maxPlayers: p.players,
    terrain: Array.from(terrain),
    level: Array.from(level),
    water: Array.from(water),
    ramps,
    trees,
    mines,
    starts,
    camps,
    neutrals,
    seed: p.seed,
  };
}

/** Make sure every start, mine and neutral building is reachable from start 0, clearing trees if needed. */
function ensureConnected(
  S: number,
  level: Uint8Array,
  water: Uint8Array,
  tree: Uint8Array,
  ramps: RampSpec[],
  starts: { x: number; y: number }[],
  mines: { x: number; y: number }[],
  neutrals: { x: number; y: number }[],
): void {
  const n = S * S;
  const ramp = new Uint8Array(n);
  for (const r of ramps) for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) if (x >= 0 && y >= 0 && x < S && y < S) ramp[y * S + x] = 1;
  // cliff tiles: higher than a neighbouring non-ramp tile
  const cliff = new Uint8Array(n);
  for (let y = 1; y < S - 1; y++)
    for (let x = 1; x < S - 1; x++) {
      const i = y * S + x;
      if (ramp[i]) continue;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const j = (y + dy) * S + x + dx;
          if (level[j] < level[i] && !ramp[j]) cliff[i] = 1;
        }
    }
  const open = (i: number) => water[i] !== 2 && !cliff[i];
  const canStep = (a: number, b: number) => ramp[a] || ramp[b] || level[a] === level[b];
  // 0-1 BFS from start 0: open tiles cost 0, trees cost 1
  const dist = new Int32Array(n).fill(1 << 30);
  const parent = new Int32Array(n).fill(-1);
  const s0 = starts[0];
  const src = Math.floor(s0.y) * S + Math.floor(s0.x);
  const dq = new Int32Array(n * 2 + 4);
  let head = n;
  let tail = n;
  dq[tail++] = src;
  dist[src] = 0;
  while (head < tail) {
    const c = dq[head++];
    const cx = c % S;
    const cy = (c - cx) / S;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 1 || ny < 1 || nx >= S - 1 || ny >= S - 1) continue;
      const ni = ny * S + nx;
      if (!open(ni) || !canStep(c, ni)) continue;
      const w = tree[ni] ? 1 : 0;
      if (dist[c] + w < dist[ni]) {
        dist[ni] = dist[c] + w;
        parent[ni] = c;
        if (w === 0) dq[--head] = ni;
        else dq[tail++] = ni;
      }
    }
  }
  for (const t of [...starts, ...mines, ...neutrals]) {
    // best tile near the target
    let best = -1;
    let bd = 1 << 30;
    for (let dy = -3; dy <= 3; dy++)
      for (let dx = -3; dx <= 3; dx++) {
        const x = Math.floor(t.x) + dx;
        const y = Math.floor(t.y) + dy;
        if (x < 1 || y < 1 || x >= S - 1 || y >= S - 1) continue;
        const i = y * S + x;
        if (dist[i] < bd) {
          bd = dist[i];
          best = i;
        }
      }
    if (best < 0 || bd === 0 || bd >= 1 << 30) continue;
    // walk back, clearing trees in a 3-wide corridor
    let c = best;
    while (c >= 0) {
      const cx = c % S;
      const cy = (c - cx) / S;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const x = cx + dx;
          const y = cy + dy;
          if (x > 0 && y > 0 && x < S - 1 && y < S - 1 && level[y * S + x] === level[c]) tree[y * S + x] = 0;
        }
      c = parent[c];
    }
  }
}

// ---------------------------------------------------------------------------
// map catalogue
// ---------------------------------------------------------------------------
export interface MapPreset extends GenParams {
  id: string;
}

export const MAP_PRESETS: MapPreset[] = [
  {
    id: 'thornvale',
    name: 'Thornvale Crossing',
    description: 'Two kingdoms face each other across a wooded vale. An inn sits atop the central hill.',
    size: 112,
    players: 2,
    biome: 'temperate',
    seed: 1207,
    centerPlateau: true,
    water: 'ponds',
    forest: 0.55,
  },
  {
    id: 'frostfang',
    name: 'Frostfang Pass',
    description: 'Fortified highland bases guard a frozen river valley. Watch the narrow ramps.',
    size: 120,
    players: 2,
    biome: 'winter',
    seed: 4411,
    highBases: true,
    water: 'river',
    forest: 0.5,
  },
  {
    id: 'ashkar',
    name: 'Ashkar Badlands',
    description: 'Sun-scorched canyons with scattered oases. Open ground favors fast armies.',
    size: 112,
    players: 2,
    biome: 'badlands',
    seed: 913,
    centerPlateau: false,
    water: 'ponds',
    forest: 0.3,
    boss: true,
  },
  {
    id: 'fourbanners',
    name: 'Four Banners',
    description: 'Four realms share a rich heartland. Ideal for free-for-all or 2 versus 2.',
    size: 144,
    players: 4,
    biome: 'temperate',
    seed: 2024,
    centerPlateau: true,
    water: 'none',
    forest: 0.5,
  },
  {
    id: 'mirefen',
    name: 'Mirefen Hollows',
    description: 'A misty swamp of shallow pools and twisted trees. A dragon sleeps at its heart.',
    size: 144,
    players: 4,
    biome: 'marsh',
    seed: 77,
    water: 'marsh',
    forest: 0.45,
    boss: true,
  },
  {
    id: 'emberfall',
    name: 'Emberfall',
    description: 'Ash wastes scarred by a fallen star. Highland bases look down on burning rivers.',
    size: 120,
    players: 2,
    biome: 'ashen',
    seed: 666,
    highBases: true,
    water: 'river',
    forest: 0.4,
  },
];

export function presetMap(id: string): MapData {
  const p = MAP_PRESETS.find((m) => m.id === id) ?? MAP_PRESETS[0];
  return generateMap(p);
}

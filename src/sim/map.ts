import { CLIFF_HEIGHT } from '../data/rules';
import { fbm, hash2 } from '../util/rng';

export const enum Terrain {
  Grass = 0,
  Dirt = 1,
  Rock = 2,
  Sand = 3,
  Snow = 4,
  Road = 5,
  Moss = 6,
  Ash = 7,
}

export const BLOCK_TERRAIN = 1;
export const BLOCK_BUILDING = 2;
export const BLOCK_TREE = 4;
export const BLOCK_ANY = BLOCK_TERRAIN | BLOCK_BUILDING | BLOCK_TREE;

export type BiomeId = 'temperate' | 'winter' | 'badlands' | 'marsh' | 'ashen';

export interface RampSpec {
  x0: number;
  y0: number;
  x1: number; // inclusive tile bounds
  y1: number;
  dir: 'n' | 's' | 'e' | 'w'; // direction of ascent (toward high ground)
  low: number;
  high: number;
}

export interface CampSpec {
  x: number;
  y: number;
  creeps: string[];
  drop: number; // item level to drop (0 = none)
  difficulty: 'green' | 'orange' | 'red' | 'boss';
}

export interface MapData {
  name: string;
  description: string;
  w: number;
  h: number;
  biome: BiomeId;
  maxPlayers: number;
  terrain: number[];
  level: number[];
  water: number[];
  ramps: RampSpec[];
  trees: [number, number, number][]; // tx, ty, variant
  mines: { x: number; y: number; gold: number }[]; // center in world coords (mine footprint 3x3)
  starts: { x: number; y: number }[]; // main hall center (world coords)
  camps: CampSpec[];
  neutrals: { type: string; x: number; y: number }[];
  seed: number;
}

export interface Tree {
  tx: number;
  ty: number;
  lumber: number;
  alive: boolean;
  variant: number;
  /** number of harvesters currently working this tree */
  workers: number;
  /** twilight spirits attached (does not deplete) */
  spirits: number;
}

export class GameMap {
  readonly w: number;
  readonly h: number;
  readonly name: string;
  readonly biome: BiomeId;
  readonly data: MapData;
  terrain: Uint8Array;
  level: Uint8Array;
  water: Uint8Array;
  ramp: Uint8Array;
  cliff: Uint8Array;
  blocked: Uint8Array;
  noBuild: Uint8Array;
  passLarge: Uint8Array;
  treeAt: Int32Array;
  trees: Tree[] = [];
  heights: Float32Array;
  blight: Uint8Array;
  /** incremented whenever pathing changes; units use it to validate paths */
  version = 0;
  /** incremented when trees/blight change (renderer refresh) */
  visualVersion = 0;
  changedTrees: number[] = [];
  blightChanged = false;

  constructor(data: MapData) {
    this.data = data;
    this.w = data.w;
    this.h = data.h;
    this.name = data.name;
    this.biome = data.biome;
    const n = this.w * this.h;
    this.terrain = Uint8Array.from(data.terrain);
    this.level = Uint8Array.from(data.level);
    this.water = Uint8Array.from(data.water);
    this.ramp = new Uint8Array(n);
    this.cliff = new Uint8Array(n);
    this.blocked = new Uint8Array(n);
    this.noBuild = new Uint8Array(n);
    this.passLarge = new Uint8Array(n);
    this.treeAt = new Int32Array(n).fill(-1);
    this.blight = new Uint8Array(n);
    this.heights = new Float32Array((this.w + 1) * (this.h + 1));

    for (const r of data.ramps) {
      for (let y = r.y0; y <= r.y1; y++)
        for (let x = r.x0; x <= r.x1; x++) {
          if (!this.inBounds(x, y)) continue;
          const i = this.idx(x, y);
          this.ramp[i] = 1;
          this.level[i] = r.high;
        }
    }
    this.computeCliffs();
    this.computeHeights();
    for (let i = 0; i < n; i++) {
      if (this.cliff[i] || this.water[i] === 2) this.blocked[i] |= BLOCK_TERRAIN;
      if (this.ramp[i] || this.water[i] || this.cliff[i]) this.noBuild[i] = 1;
    }
    // map edge is never passable
    for (let x = 0; x < this.w; x++) {
      this.blocked[this.idx(x, 0)] |= BLOCK_TERRAIN;
      this.blocked[this.idx(x, this.h - 1)] |= BLOCK_TERRAIN;
    }
    for (let y = 0; y < this.h; y++) {
      this.blocked[this.idx(0, y)] |= BLOCK_TERRAIN;
      this.blocked[this.idx(this.w - 1, y)] |= BLOCK_TERRAIN;
    }
    for (const [tx, ty, variant] of data.trees) {
      if (!this.inBounds(tx, ty)) continue;
      const i = this.idx(tx, ty);
      if (this.blocked[i] || this.treeAt[i] >= 0) continue;
      const id = this.trees.length;
      this.trees.push({ tx, ty, lumber: 50, alive: true, variant, workers: 0, spirits: 0 });
      this.treeAt[i] = id;
      this.blocked[i] |= BLOCK_TREE;
    }
    this.recomputeLarge(0, 0, this.w - 1, this.h - 1);
  }

  idx(x: number, y: number): number {
    return y * this.w + x;
  }
  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }
  passable(x: number, y: number, large = false): boolean {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return false;
    const i = y * this.w + x;
    return large ? this.passLarge[i] === 1 : this.blocked[i] === 0;
  }
  passableAt(wx: number, wy: number, large = false): boolean {
    return this.passable(Math.floor(wx), Math.floor(wy), large);
  }
  buildable(x: number, y: number): boolean {
    if (!this.inBounds(x, y)) return false;
    const i = this.idx(x, y);
    return this.blocked[i] === 0 && this.noBuild[i] === 0;
  }
  levelAt(wx: number, wy: number): number {
    const x = Math.min(this.w - 1, Math.max(0, Math.floor(wx)));
    const y = Math.min(this.h - 1, Math.max(0, Math.floor(wy)));
    return this.level[y * this.w + x];
  }

  private computeCliffs(): void {
    const { w, h } = this;
    const rampId = new Int16Array(w * h).fill(-1);
    this.data.ramps.forEach((r, k) => {
      for (let y = r.y0; y <= r.y1; y++)
        for (let x = r.x0; x <= r.x1; x++) if (this.inBounds(x, y)) rampId[this.idx(x, y)] = k;
    });
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = this.idx(x, y);
        if (this.ramp[i]) continue;
        const l = this.level[i];
        let c = 0;
        for (let dy = -1; dy <= 1 && !c; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if (!this.inBounds(nx, ny)) continue;
            const j = this.idx(nx, ny);
            if (this.ramp[j]) {
              const r = this.data.ramps[rampId[j]];
              // only the tiles beyond the top edge of a ramp connect to it smoothly
              const beyondTop =
                (r.dir === 'n' && y < r.y0) || (r.dir === 's' && y > r.y1) || (r.dir === 'e' && x > r.x1) || (r.dir === 'w' && x < r.x0);
              const beyondBottom =
                (r.dir === 'n' && y > r.y1) || (r.dir === 's' && y < r.y0) || (r.dir === 'e' && x < r.x0) || (r.dir === 'w' && x > r.x1);
              if (l >= r.high && !beyondTop) {
                c = 1;
                break;
              }
              if (l < r.high && l > r.low) {
                c = 1;
                break;
              }
              if (l <= r.low && !beyondBottom && dx !== 0 && dy !== 0) continue;
              continue;
            }
            if (this.level[j] < l) {
              c = 1;
              break;
            }
          }
        this.cliff[i] = c;
      }
  }

  private computeHeights(): void {
    const W = this.w + 1;
    const H = this.h + 1;
    const seed = this.data.seed;
    for (let vy = 0; vy < H; vy++)
      for (let vx = 0; vx < W; vx++) {
        let minL = 99;
        let maxL = 0;
        let depth = 0;
        let cnt = 0;
        let cliffAdj = 0;
        for (let dy = -1; dy <= 0; dy++)
          for (let dx = -1; dx <= 0; dx++) {
            const tx = Math.min(this.w - 1, Math.max(0, vx + dx));
            const ty = Math.min(this.h - 1, Math.max(0, vy + dy));
            const i = this.idx(tx, ty);
            const l = this.level[i];
            if (l < minL) minL = l;
            if (l > maxL) maxL = l;
            depth += this.water[i] === 2 ? 1.25 : this.water[i] === 1 ? 0.45 : 0;
            cliffAdj += this.cliff[i];
            cnt++;
          }
        let hgt = minL * CLIFF_HEIGHT;
        const n = fbm(vx * 0.09, vy * 0.09, seed, 3);
        hgt += (n - 0.5) * 0.36;
        if (cliffAdj > 0 && maxL > minL) {
          // rocky jitter on cliff faces
          hgt += (hash2(vx, vy, seed + 7) - 0.5) * 0.35;
        }
        hgt -= depth / cnt;
        this.heights[vy * W + vx] = hgt;
      }
    for (const r of this.data.ramps) {
      for (let vy = r.y0; vy <= r.y1 + 1; vy++)
        for (let vx = r.x0; vx <= r.x1 + 1; vx++) {
          if (vx < 0 || vy < 0 || vx >= W || vy >= H) continue;
          let t = 0;
          const lenX = r.x1 + 1 - r.x0;
          const lenY = r.y1 + 1 - r.y0;
          if (r.dir === 'e') t = (vx - r.x0) / lenX;
          else if (r.dir === 'w') t = (r.x1 + 1 - vx) / lenX;
          else if (r.dir === 's') t = (vy - r.y0) / lenY;
          else t = (r.y1 + 1 - vy) / lenY;
          t = Math.min(1, Math.max(0, t));
          const n = fbm(vx * 0.09, vy * 0.09, seed, 3);
          this.heights[vy * W + vx] = (r.low + (r.high - r.low) * t) * CLIFF_HEIGHT + (n - 0.5) * 0.36;
        }
    }
  }

  /** Bilinear terrain height at world position. */
  heightAt(wx: number, wy: number): number {
    const W = this.w + 1;
    const x = Math.min(this.w - 0.001, Math.max(0, wx));
    const y = Math.min(this.h - 0.001, Math.max(0, wy));
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = x - x0;
    const fy = y - y0;
    const h00 = this.heights[y0 * W + x0];
    const h10 = this.heights[y0 * W + x0 + 1];
    const h01 = this.heights[(y0 + 1) * W + x0];
    const h11 = this.heights[(y0 + 1) * W + x0 + 1];
    return (h00 * (1 - fx) + h10 * fx) * (1 - fy) + (h01 * (1 - fx) + h11 * fx) * fy;
  }

  setBlocked(x0: number, y0: number, sw: number, sh: number, flag: number, on: boolean): void {
    for (let y = y0; y < y0 + sh; y++)
      for (let x = x0; x < x0 + sw; x++) {
        if (!this.inBounds(x, y)) continue;
        const i = this.idx(x, y);
        if (on) this.blocked[i] |= flag;
        else this.blocked[i] &= ~flag;
      }
    this.recomputeLarge(x0 - 1, y0 - 1, x0 + sw, y0 + sh);
    this.version++;
  }

  recomputeLarge(x0: number, y0: number, x1: number, y1: number): void {
    x0 = Math.max(0, x0);
    y0 = Math.max(0, y0);
    x1 = Math.min(this.w - 1, x1);
    y1 = Math.min(this.h - 1, y1);
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        let ok = 1;
        for (let dy = -1; dy <= 1 && ok; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= this.w || ny >= this.h || this.blocked[ny * this.w + nx] !== 0) {
              ok = 0;
              break;
            }
          }
        this.passLarge[y * this.w + x] = ok;
      }
  }

  removeTree(id: number): void {
    const t = this.trees[id];
    if (!t || !t.alive) return;
    t.alive = false;
    t.lumber = 0;
    const i = this.idx(t.tx, t.ty);
    this.treeAt[i] = -1;
    this.blocked[i] &= ~BLOCK_TREE;
    this.recomputeLarge(t.tx - 1, t.ty - 1, t.tx + 1, t.ty + 1);
    this.version++;
    this.visualVersion++;
    this.changedTrees.push(id);
  }

  treeAtTile(x: number, y: number): Tree | null {
    if (!this.inBounds(x, y)) return null;
    const id = this.treeAt[this.idx(x, y)];
    return id >= 0 ? this.trees[id] : null;
  }

  /** Find the nearest living tree to a world position within maxR tiles. */
  nearestTree(wx: number, wy: number, maxR: number, filter?: (t: Tree, id: number) => boolean): number {
    const cx = Math.floor(wx);
    const cy = Math.floor(wy);
    let best = -1;
    let bestD = Infinity;
    for (let r = 0; r <= maxR; r++) {
      // scan ring r
      for (let y = cy - r; y <= cy + r; y++)
        for (let x = cx - r; x <= cx + r; x++) {
          if (Math.max(Math.abs(x - cx), Math.abs(y - cy)) !== r) continue;
          if (!this.inBounds(x, y)) continue;
          const id = this.treeAt[this.idx(x, y)];
          if (id < 0) continue;
          const t = this.trees[id];
          if (!t.alive) continue;
          if (!this.treeHasAccess(t)) continue;
          if (filter && !filter(t, id)) continue;
          const dx = x + 0.5 - wx;
          const dy = y + 0.5 - wy;
          const d = dx * dx + dy * dy + t.workers * 6;
          if (d < bestD) {
            bestD = d;
            best = id;
          }
        }
      if (best >= 0 && r * r > bestD + 4) break;
    }
    return best;
  }

  /** A tree is harvestable if at least one orthogonal/diagonal neighbour is walkable. */
  treeHasAccess(t: Tree): boolean {
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        if (this.passable(t.tx + dx, t.ty + dy)) return true;
      }
    return false;
  }

  addBlight(cx: number, cy: number, r: number): void {
    const r2 = r * r;
    let changed = false;
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        if (!this.inBounds(x, y)) continue;
        const dx = x + 0.5 - cx;
        const dy = y + 0.5 - cy;
        if (dx * dx + dy * dy > r2) continue;
        const i = this.idx(x, y);
        if (this.water[i] === 2) continue;
        if (!this.blight[i]) {
          this.blight[i] = 1;
          changed = true;
        }
      }
    if (changed) {
      this.blightChanged = true;
      this.visualVersion++;
    }
  }

  hasBlight(x: number, y: number): boolean {
    if (!this.inBounds(x, y)) return false;
    return this.blight[this.idx(x, y)] === 1;
  }

  /** Nearest passable tile center to a world point (spiral search). */
  nearestPassable(wx: number, wy: number, large = false, maxR = 12): [number, number] | null {
    const cx = Math.floor(wx);
    const cy = Math.floor(wy);
    if (this.passable(cx, cy, large)) return [cx + 0.5, cy + 0.5];
    let best: [number, number] | null = null;
    let bestD = Infinity;
    for (let r = 1; r <= maxR; r++) {
      for (let y = cy - r; y <= cy + r; y++)
        for (let x = cx - r; x <= cx + r; x++) {
          if (Math.max(Math.abs(x - cx), Math.abs(y - cy)) !== r) continue;
          if (!this.passable(x, y, large)) continue;
          const dx = x + 0.5 - wx;
          const dy = y + 0.5 - wy;
          const d = dx * dx + dy * dy;
          if (d < bestD) {
            bestD = d;
            best = [x + 0.5, y + 0.5];
          }
        }
      if (best) return best;
    }
    return null;
  }
}

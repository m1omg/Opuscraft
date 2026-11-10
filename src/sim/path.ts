import { IdHeap } from '../util/heap';
import type { GameMap } from './map';

const SQRT2 = Math.SQRT2;
const DIRS: [number, number, number][] = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, SQRT2],
  [1, -1, SQRT2],
  [-1, 1, SQRT2],
  [-1, -1, SQRT2],
];

export interface PathResult {
  /** flat list of world-space waypoints [x0, y0, x1, y1, ...] (not including the start) */
  points: number[];
  /** true if the final point is the requested goal */
  complete: boolean;
}

/** Grid A* with octile heuristic, closest-reachable fallback and line-of-sight smoothing. */
export class Pathfinder {
  private map: GameMap;
  private g: Float32Array;
  private parent: Int32Array;
  private open: Uint32Array;
  private closed: Uint32Array;
  private stamp = 1;
  private heap: IdHeap;
  nodesThisTick = 0;

  constructor(map: GameMap) {
    this.map = map;
    const n = map.w * map.h;
    this.g = new Float32Array(n);
    this.parent = new Int32Array(n);
    this.open = new Uint32Array(n);
    this.closed = new Uint32Array(n);
    this.heap = new IdHeap(4096);
  }

  findPath(sx: number, sy: number, gx: number, gy: number, large: boolean, radius: number, maxNodes = 30000): PathResult | null {
    const map = this.map;
    const w = map.w;
    let stx = Math.floor(sx);
    let sty = Math.floor(sy);
    if (!map.passable(stx, sty, large)) {
      const p = map.nearestPassable(sx, sy, large, 6);
      if (!p) return null;
      stx = Math.floor(p[0]);
      sty = Math.floor(p[1]);
    }
    let goalX = gx;
    let goalY = gy;
    let gtx = Math.floor(gx);
    let gty = Math.floor(gy);
    let exactGoal = true;
    if (!map.passable(gtx, gty, large)) {
      const p = map.nearestPassable(gx, gy, large, 10);
      if (!p) return null;
      gtx = Math.floor(p[0]);
      gty = Math.floor(p[1]);
      goalX = p[0];
      goalY = p[1];
      exactGoal = false;
    }
    const start = sty * w + stx;
    const goal = gty * w + gtx;
    if (start === goal) {
      return { points: [goalX, goalY], complete: exactGoal };
    }
    // direct line of sight -> no search required
    if (this.lineClear(sx, sy, goalX, goalY, large, radius)) {
      return { points: [goalX, goalY], complete: exactGoal };
    }

    const stamp = ++this.stamp;
    if (stamp > 0xfffffff0) {
      this.open.fill(0);
      this.closed.fill(0);
      this.stamp = 1;
    }
    const g = this.g;
    const parent = this.parent;
    const open = this.open;
    const closed = this.closed;
    const heap = this.heap;
    heap.clear();
    g[start] = 0;
    parent[start] = -1;
    open[start] = this.stamp;
    heap.push(start, this.h(stx, sty, gtx, gty));
    let best = start;
    let bestH = this.h(stx, sty, gtx, gty);
    let expanded = 0;
    let found = false;
    const pass = large ? map.passLarge : map.blocked;
    const passVal = large ? 1 : 0;

    while (heap.size > 0) {
      const cur = heap.pop();
      if (closed[cur] === this.stamp) continue;
      closed[cur] = this.stamp;
      if (cur === goal) {
        found = true;
        best = cur;
        break;
      }
      if (++expanded > maxNodes) break;
      const cx = cur % w;
      const cy = (cur - cx) / w;
      const hc = this.h(cx, cy, gtx, gty);
      if (hc < bestH) {
        bestH = hc;
        best = cur;
      }
      const gc = g[cur];
      for (let d = 0; d < 8; d++) {
        const dir = DIRS[d];
        const nx = cx + dir[0];
        const ny = cy + dir[1];
        if (nx < 0 || ny < 0 || nx >= w || ny >= map.h) continue;
        const ni = ny * w + nx;
        if (pass[ni] !== passVal) continue;
        if (closed[ni] === this.stamp) continue;
        if (d >= 4) {
          // no corner cutting
          if (pass[cy * w + nx] !== passVal || pass[ny * w + cx] !== passVal) continue;
        }
        const ng = gc + dir[2];
        if (open[ni] !== this.stamp || ng < g[ni]) {
          open[ni] = this.stamp;
          g[ni] = ng;
          parent[ni] = cur;
          heap.push(ni, ng + this.h(nx, ny, gtx, gty) * 1.001);
        }
      }
    }
    this.nodesThisTick += expanded;

    // reconstruct
    const tiles: number[] = [];
    let n = best;
    while (n !== -1 && n !== start) {
      tiles.push(n);
      n = parent[n];
    }
    tiles.reverse();
    if (tiles.length === 0) return { points: [], complete: false };
    const pts: number[] = [];
    for (const t of tiles) {
      const x = t % w;
      const y = (t - x) / w;
      pts.push(x + 0.5, y + 0.5);
    }
    const complete = found && exactGoal;
    if (found) {
      pts[pts.length - 2] = goalX;
      pts[pts.length - 1] = goalY;
    }
    return { points: this.smooth(sx, sy, pts, large, radius), complete };
  }

  private h(x: number, y: number, gx: number, gy: number): number {
    const dx = Math.abs(x - gx);
    const dy = Math.abs(y - gy);
    return dx > dy ? dx + (SQRT2 - 1) * dy : dy + (SQRT2 - 1) * dx;
  }

  private smooth(sx: number, sy: number, pts: number[], large: boolean, radius: number): number[] {
    const out: number[] = [];
    let ax = sx;
    let ay = sy;
    let i = 0;
    const n = pts.length / 2;
    while (i < n) {
      // furthest visible waypoint from anchor
      let j = i;
      while (j + 1 < n && this.lineClear(ax, ay, pts[(j + 1) * 2], pts[(j + 1) * 2 + 1], large, radius)) j++;
      out.push(pts[j * 2], pts[j * 2 + 1]);
      ax = pts[j * 2];
      ay = pts[j * 2 + 1];
      i = j + 1;
    }
    return out;
  }

  /** True if a disc of `radius` can travel straight from a to b. */
  lineClear(ax: number, ay: number, bx: number, by: number, large: boolean, radius: number): boolean {
    const map = this.map;
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1e-4) return map.passableAt(bx, by, large);
    const steps = Math.ceil(len / 0.3);
    const px = (-dy / len) * radius * 0.9;
    const py = (dx / len) * radius * 0.9;
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      const x = ax + dx * t;
      const y = ay + dy * t;
      if (!map.passableAt(x, y, large)) return false;
      if (radius > 0.05) {
        if (!map.passableAt(x + px, y + py, large)) return false;
        if (!map.passableAt(x - px, y - py, large)) return false;
      }
    }
    return true;
  }
}

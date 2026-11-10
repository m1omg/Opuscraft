import type { Entity } from './entity';

/** Uniform grid bucket structure rebuilt every tick for proximity queries. */
export class SpatialHash {
  readonly cell = 4;
  readonly cols: number;
  readonly rows: number;
  private cells: Entity[][];
  private stamp = 1;

  constructor(w: number, h: number) {
    this.cols = Math.ceil(w / this.cell);
    this.rows = Math.ceil(h / this.cell);
    this.cells = new Array(this.cols * this.rows);
    for (let i = 0; i < this.cells.length; i++) this.cells[i] = [];
  }

  rebuild(entities: Entity[]): void {
    for (const c of this.cells) c.length = 0;
    for (const e of entities) {
      if (!e.alive || e.removed || e.inside >= 0) continue;
      if (e.kind === 'building' && e.b) {
        const c0 = Math.max(0, Math.floor(e.b.tx / this.cell));
        const r0 = Math.max(0, Math.floor(e.b.ty / this.cell));
        const c1 = Math.min(this.cols - 1, Math.floor((e.b.tx + e.b.size - 1) / this.cell));
        const r1 = Math.min(this.rows - 1, Math.floor((e.b.ty + e.b.size - 1) / this.cell));
        for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) this.cells[r * this.cols + c].push(e);
      } else {
        const c = Math.min(this.cols - 1, Math.max(0, Math.floor(e.x / this.cell)));
        const r = Math.min(this.rows - 1, Math.max(0, Math.floor(e.y / this.cell)));
        this.cells[r * this.cols + c].push(e);
      }
    }
  }

  /** Entities whose center (or footprint for buildings) may lie within r of (x, y). Caller filters exactly. */
  query(x: number, y: number, r: number, out: Entity[]): Entity[] {
    out.length = 0;
    const st = ++this.stamp;
    const c0 = Math.max(0, Math.floor((x - r - 1) / this.cell));
    const r0 = Math.max(0, Math.floor((y - r - 1) / this.cell));
    const c1 = Math.min(this.cols - 1, Math.floor((x + r + 1) / this.cell));
    const r1 = Math.min(this.rows - 1, Math.floor((y + r + 1) / this.cell));
    for (let rr = r0; rr <= r1; rr++)
      for (let cc = c0; cc <= c1; cc++) {
        const bucket = this.cells[rr * this.cols + cc];
        for (let i = 0; i < bucket.length; i++) {
          const e = bucket[i];
          if (e.qstamp === st) continue;
          e.qstamp = st;
          out.push(e);
        }
      }
    return out;
  }
}

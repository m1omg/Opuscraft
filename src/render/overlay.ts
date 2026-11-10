import * as THREE from 'three';
import type { Entity } from '../sim/entity';
import type { World } from '../sim/world';
import type { EntityViews } from './views';

interface Floater {
  x: number;
  y: number;
  z: number;
  text: string;
  color: string;
  t: number;
  life: number;
  size: number;
}

export interface BarOptions {
  always: boolean;
  alt: boolean;
}

/** HTML canvas layered over the 3D view: health bars, floating text, selection box. */
export class Overlay {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private dpr = 1;
  private floats: Floater[] = [];
  selRect: { x0: number; y0: number; x1: number; y1: number } | null = null;
  opts: BarOptions = { always: false, alt: false };
  private v = new THREE.Vector3();

  constructor(parent: HTMLElement) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'overlay-canvas';
    parent.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d')!;
  }

  resize(w: number, h: number, dpr: number): void {
    this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
  }

  float(x: number, y: number, z: number, text: string, color: number | string, size = 15, life = 1.4): void {
    if (this.floats.length > 80) this.floats.shift();
    this.floats.push({ x, y, z, text, color: typeof color === 'number' ? '#' + color.toString(16).padStart(6, '0') : color, t: 0, life, size });
  }

  private project(cam: THREE.Camera, x: number, y: number, z: number, w: number, h: number): { sx: number; sy: number; ok: boolean } {
    this.v.set(x, y, z).project(cam);
    return { sx: (this.v.x * 0.5 + 0.5) * w, sy: (-this.v.y * 0.5 + 0.5) * h, ok: this.v.z < 1 && this.v.z > -1 };
  }

  draw(world: World, views: EntityViews, cam: THREE.Camera, local: number, dt: number, zoomFactor: number): void {
    const ctx = this.ctx;
    const W = this.canvas.width / this.dpr;
    const H = this.canvas.height / this.dpr;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const scale = Math.max(0.65, Math.min(1.25, zoomFactor));
    // health bars
    for (const [, v] of views.views) {
      const e = v.e;
      if (!v.rig.root.visible || e.dead || e.kind === 'item' || !e.alive) continue;
      const sel = views.selected.has(e.id);
      const hov = views.hover === e.id;
      const damaged = e.hp < e.st.maxHp - 0.5;
      const building = e.kind === 'building';
      const constructing = !!e.b && e.b.constructing;
      const neutralObj = world.players[e.owner]?.passive;
      if (neutralObj && !sel && !hov) continue;
      const show = sel || hov || this.opts.always || this.opts.alt || (damaged && !neutralObj) || constructing;
      if (!show) continue;
      const top = views.topOf(e);
      const p = this.project(cam, v.lastX, top, v.lastY, W, H);
      if (!p.ok || p.sx < -50 || p.sx > W + 50 || p.sy < -20 || p.sy > H + 20) continue;
      const bw = (building ? 64 : e.hero ? 46 : e.radius > 0.6 ? 44 : 34) * scale;
      const bh = (e.hero ? 6 : 5) * scale;
      const x = Math.round(p.sx - bw / 2);
      const y = Math.round(p.sy);
      const f = Math.max(0, Math.min(1, e.hp / e.st.maxHp));
      ctx.fillStyle = 'rgba(0,0,0,0.75)';
      ctx.fillRect(x - 1, y - 1, bw + 2, bh + 2);
      const enemy = world.isEnemy(local, e.owner);
      const col = enemy ? (f > 0.5 ? '#e8473a' : '#c0302a') : f > 0.6 ? '#4fdc4a' : f > 0.3 ? '#e8c43a' : '#e8473a';
      ctx.fillStyle = col;
      ctx.fillRect(x, y, Math.round(bw * f), bh);
      // tick marks every 100 hp for readability
      if (e.st.maxHp > 300 && bw > 30) {
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        const step = (bw * 250) / e.st.maxHp;
        for (let k = step; k < bw * f; k += step) ctx.fillRect(Math.round(x + k), y, 1, bh);
      }
      let yy = y + bh + 1;
      if (e.st.maxMana > 0 && (sel || hov || this.opts.alt || e.hero) && !building) {
        const mf = Math.max(0, Math.min(1, e.mana / e.st.maxMana));
        ctx.fillStyle = 'rgba(0,0,0,0.75)';
        ctx.fillRect(x - 1, yy - 1, bw + 2, 4 * scale + 2);
        ctx.fillStyle = '#4a86ff';
        ctx.fillRect(x, yy, Math.round(bw * mf), 4 * scale);
        yy += 4 * scale + 1;
      }
      if (constructing && e.b) {
        ctx.fillStyle = 'rgba(0,0,0,0.75)';
        ctx.fillRect(x - 1, yy - 1, bw + 2, 4 * scale + 2);
        ctx.fillStyle = '#e8d070';
        ctx.fillRect(x, yy, Math.round(bw * e.b.progress), 4 * scale);
      }
      if (e.hero) {
        ctx.font = `bold ${Math.round(11 * scale)}px system-ui, sans-serif`;
        ctx.fillStyle = 'rgba(0,0,0,0.75)';
        ctx.fillRect(x - 15 * scale, y - 2, 13 * scale, 11 * scale);
        ctx.fillStyle = '#ffd860';
        ctx.textAlign = 'center';
        ctx.fillText(String(e.hero.level), x - 8.5 * scale, y + 7.5 * scale);
      }
      if (e.lifetime > 0 && e.maxLifetime > 0) {
        ctx.fillStyle = 'rgba(160,140,255,0.9)';
        ctx.fillRect(x, y - 3, Math.round(bw * (e.lifetime / e.maxLifetime)), 2);
      }
    }
    // floating texts
    const keep: Floater[] = [];
    ctx.textAlign = 'center';
    for (const f of this.floats) {
      f.t += dt;
      if (f.t >= f.life) continue;
      keep.push(f);
      const k = f.t / f.life;
      const p = this.project(cam, f.x, f.y + k * 1.4, f.z, W, H);
      if (!p.ok) continue;
      ctx.globalAlpha = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
      ctx.font = `bold ${Math.round(f.size * scale)}px system-ui, sans-serif`;
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,0.8)';
      ctx.strokeText(f.text, p.sx, p.sy);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, p.sx, p.sy);
    }
    ctx.globalAlpha = 1;
    this.floats = keep;
    // selection rectangle
    if (this.selRect) {
      const r = this.selRect;
      const x0 = Math.min(r.x0, r.x1);
      const y0 = Math.min(r.y0, r.y1);
      const w = Math.abs(r.x1 - r.x0);
      const h = Math.abs(r.y1 - r.y0);
      ctx.fillStyle = 'rgba(90,255,110,0.08)';
      ctx.fillRect(x0, y0, w, h);
      ctx.strokeStyle = 'rgba(110,255,130,0.9)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x0 + 0.5, y0 + 0.5, w, h);
    }
  }

  clearFloats(): void {
    this.floats.length = 0;
  }
}

export type { Entity };

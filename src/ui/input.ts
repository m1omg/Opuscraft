import { getDef, lv } from '../data/registry';
import type { Entity } from '../sim/entity';
import type { World } from '../sim/world';
import { smartCommands } from '../sim/commands';
import type { GameRenderer } from '../render/renderer';
import { buildCard, type TargetMode } from './commands';
import type { HudHost } from './hud';

export interface InputHost extends HudHost {
  renderer: GameRenderer;
  world: World;
  paused: boolean;
  togglePause(): void;
  setGameSpeed(delta: number): void;
  closeMenus(): boolean;
  menuOpen: boolean;
  setActiveType(t: string): void;
  placementRoot: number;
  settings: { edgeScroll: boolean; scrollSpeed: number; alwaysBars: boolean };
}

export class InputController {
  private host: InputHost;
  private keys = new Set<string>();
  private mouseX = 0;
  private mouseY = 0;
  private mouseIn = false;
  /** edge scrolling only starts once the pointer has really moved (ignores the synthetic event on page load) */
  private firstMove: { x: number; y: number } | null = null;
  private moved = false;
  private down: { x: number; y: number; button: number; shift: boolean; ctrl: boolean } | null = null;
  private middle: { x: number; y: number } | null = null;
  private lastClick = { t: 0, id: -1 };
  private groups: number[][] = Array.from({ length: 10 }, () => []);
  private lastGroupTap = { n: -1, t: 0 };
  private lastHeroTap = { n: -1, t: 0 };
  lastAlert: { x: number; y: number } | null = null;
  private el: HTMLElement;
  private bound: { type: string; fn: (e: Event) => void; target: EventTarget }[] = [];

  constructor(el: HTMLElement, host: InputHost) {
    this.el = el;
    this.host = host;
    const on = <K extends keyof WindowEventMap>(target: EventTarget, type: K | string, fn: (e: never) => void) => {
      target.addEventListener(type, fn as (e: Event) => void, { passive: false });
      this.bound.push({ type, fn: fn as (e: Event) => void, target });
    };
    on(el, 'mousedown', (e: MouseEvent) => this.onDown(e));
    on(window, 'mouseup', (e: MouseEvent) => this.onUp(e));
    on(window, 'mousemove', (e: MouseEvent) => this.onMove(e));
    on(el, 'wheel', (e: WheelEvent) => {
      e.preventDefault();
      const d = e.deltaMode === 1 ? e.deltaY * 30 : e.deltaY;
      this.host.renderer.camera.zoom(d);
    });
    on(el, 'contextmenu', (e: MouseEvent) => e.preventDefault());
    on(window, 'keydown', (e: KeyboardEvent) => this.onKey(e, true));
    on(window, 'keyup', (e: KeyboardEvent) => this.onKey(e, false));
    on(window, 'blur', () => {
      this.keys.clear();
      this.host.renderer.overlay.opts.alt = false;
    });
    on(document, 'mouseleave', () => (this.mouseIn = false));
  }

  dispose(): void {
    for (const b of this.bound) b.target.removeEventListener(b.type, b.fn);
    this.bound = [];
  }

  private rect(): DOMRect {
    return this.el.getBoundingClientRect();
  }

  private local(e: MouseEvent): { x: number; y: number } {
    const r = this.rect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  // ---------------------------------------------------------------------------
  private onDown(e: MouseEvent): void {
    if (this.host.menuOpen) return;
    const p = this.local(e);
    if (e.button === 1) {
      e.preventDefault();
      this.middle = p;
      return;
    }
    const host = this.host;
    if (e.button === 2) {
      if (host.targetMode || host.placing) {
        host.cancelModes();
        return;
      }
      this.rightClick(p.x, p.y, e.shiftKey);
      return;
    }
    if (e.button !== 0) return;
    if (host.placing) {
      this.place(p.x, p.y, e.shiftKey);
      return;
    }
    if (host.targetMode) {
      this.target(p.x, p.y, e.shiftKey);
      return;
    }
    this.down = { x: p.x, y: p.y, button: 0, shift: e.shiftKey, ctrl: e.ctrlKey };
  }

  private onUp(e: MouseEvent): void {
    if (e.button === 1) {
      this.middle = null;
      return;
    }
    const d = this.down;
    if (!d || e.button !== 0) return;
    this.down = null;
    const host = this.host;
    host.renderer.overlay.selRect = null;
    const p = this.local(e);
    const dragged = Math.abs(p.x - d.x) > 6 || Math.abs(p.y - d.y) > 6;
    const local = host.local;
    if (dragged) {
      let units = host.renderer.boxSelect(d.x, d.y, p.x, p.y, local);
      // prefer combat units over workers when mixed
      const nonWorkers = units.filter((u) => !u.isWorker);
      if (nonWorkers.length && nonWorkers.length < units.length && !d.shift) units = nonWorkers;
      if (d.shift) {
        const cur = host.selection.filter((s) => s.owner === local && s.kind === 'unit').map((s) => s.id);
        host.selectIds([...cur, ...units.map((u) => u.id).filter((id) => !cur.includes(id))]);
      } else if (units.length) host.selectIds(units.map((u) => u.id));
      return;
    }
    const ent = host.renderer.pick(p.x, p.y);
    if (!ent) {
      if (!d.shift) host.selectIds([]);
      return;
    }
    const now = performance.now();
    const dbl = now - this.lastClick.t < 320 && this.lastClick.id === ent.id;
    this.lastClick = { t: now, id: ent.id };
    if ((dbl || d.ctrl) && ent.owner === local) {
      const same = host.renderer.sameTypeOnScreen(ent).map((x) => x.id);
      host.selectIds(same);
      return;
    }
    if (d.shift && ent.owner === local && ent.kind === 'unit') {
      const cur = host.selection.filter((s) => s.owner === local && s.kind === 'unit').map((s) => s.id);
      if (cur.includes(ent.id)) host.selectIds(cur.filter((id) => id !== ent.id));
      else host.selectIds([...cur, ent.id]);
      return;
    }
    host.selectIds([ent.id]);
  }

  private onMove(e: MouseEvent): void {
    const p = this.local(e);
    const r = this.rect();
    this.mouseIn = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    if (!this.firstMove) this.firstMove = { x: e.clientX, y: e.clientY };
    else if (!this.moved && Math.abs(e.clientX - this.firstMove.x) + Math.abs(e.clientY - this.firstMove.y) > 3) this.moved = true;
    if (this.middle) {
      const cam = this.host.renderer.camera;
      const f = cam.dist / 600;
      cam.pan(-(p.x - this.middle.x) * f, -(p.y - this.middle.y) * f * 1.3);
      this.middle = p;
    }
    this.mouseX = p.x;
    this.mouseY = p.y;
    if (this.down && !this.host.placing && !this.host.targetMode) {
      if (Math.abs(p.x - this.down.x) > 6 || Math.abs(p.y - this.down.y) > 6) this.host.renderer.overlay.selRect = { x0: this.down.x, y0: this.down.y, x1: p.x, y1: p.y };
    }
  }

  // ---------------------------------------------------------------------------
  private rightClick(px: number, py: number, queued: boolean): void {
    const host = this.host;
    const w = host.world;
    const r = host.renderer;
    const sel = host.selection.filter((e) => e.alive && e.owner === host.local);
    if (!sel.length) return;
    const g = r.screenToWorld(px, py);
    const target = r.pick(px, py, (e) => e.kind === 'item' || !(e.owner === host.local && sel.length === 1 && sel[0].id === e.id && e.b));
    // buildings: set rally point
    const buildings = sel.filter((e) => e.kind === 'building');
    const units = sel.filter((e) => e.kind === 'unit');
    if (!units.length && buildings.length) {
      const tree = this.treeAt(g.x, g.y);
      host.issue({ type: 'rally', player: host.local, buildings: buildings.map((b) => b.id), x: g.x, y: g.y, target: target ? target.id : -1, tree });
      r.fx.play('buff', g.x, g.y, { color: 0x60ff60 });
      return;
    }
    let tree = -1;
    if (!target) tree = this.treeAt(g.x, g.y);
    const cmds = smartCommands(w, host.local, units, g.x, g.y, target && target.alive ? target : null, tree, queued);
    for (const c of cmds) host.issue(c);
    // feedback marker
    const enemyTarget = target && w.isEnemy(host.local, target.owner);
    r.fx.ring(target ? target.x : g.x, target ? target.y : g.y, enemyTarget ? 1.2 : 0.2, enemyTarget ? 0.4 : 0.9, enemyTarget ? 0xff4030 : 0x60ff60, 0.45);
    this.host.renderer.views.hover = -1;
    (this.host as unknown as { voiceOrder?: (attack: boolean) => void }).voiceOrder?.(!!enemyTarget);
  }

  private treeAt(x: number, y: number): number {
    const map = this.host.world.map;
    // look in a small radius because trees are drawn taller than their tile
    let best = -1;
    let bd = 1.3;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const t = map.treeAtTile(Math.floor(x) + dx, Math.floor(y) + dy);
        if (!t || !t.alive) continue;
        const d = Math.hypot(t.tx + 0.5 - x, t.ty + 0.5 - y);
        if (d < bd) {
          bd = d;
          best = map.treeAt[t.ty * map.w + t.tx];
        }
      }
    return best;
  }

  private target(px: number, py: number, queued: boolean): void {
    const host = this.host;
    const tm = host.targetMode!;
    const r = host.renderer;
    const w = host.world;
    const g = r.screenToWorld(px, py);
    const sel = host.selection.filter((e) => e.alive && e.owner === host.local);
    const units = sel.filter((e) => e.kind === 'unit');
    const ent = r.pick(px, py);
    const keep = queued && (tm.kind === 'move' || tm.kind === 'attack' || tm.kind === 'patrol');
    switch (tm.kind) {
      case 'move':
        if (ent && ent.kind === 'unit' && ent.owner !== -1 && !w.isEnemy(host.local, ent.owner)) host.issue({ type: 'order', player: host.local, units: units.map((u) => u.id), order: { type: 'follow', target: ent.id }, queued });
        else host.issue({ type: 'order', player: host.local, units: units.map((u) => u.id), order: { type: 'move', x: g.x, y: g.y }, queued });
        r.fx.ring(g.x, g.y, 0.2, 0.9, 0x60ff60, 0.45);
        break;
      case 'attack':
        if (ent && ent.kind !== 'item' && ent.alive && (w.isEnemy(host.local, ent.owner) || ent.owner === host.local || w.players[ent.owner]?.isNeutral) && !ent.def.goldMine && !w.players[ent.owner]?.passive)
          host.issue({ type: 'order', player: host.local, units: units.map((u) => u.id), order: { type: 'attack', target: ent.id }, queued });
        else host.issue({ type: 'order', player: host.local, units: units.map((u) => u.id), order: { type: 'attackMove', x: g.x, y: g.y }, queued });
        r.fx.ring(g.x, g.y, 1.2, 0.4, 0xff4030, 0.45);
        break;
      case 'patrol':
        host.issue({ type: 'order', player: host.local, units: units.map((u) => u.id), order: { type: 'patrol', x: g.x, y: g.y }, queued });
        break;
      case 'gather': {
        const tree = ent ? -1 : this.treeAt(g.x, g.y);
        if (ent && (ent.def.goldMine || ent.def.onMine)) host.issue({ type: 'order', player: host.local, units: units.map((u) => u.id), order: { type: 'gather', target: ent.id }, queued });
        else if (tree >= 0) host.issue({ type: 'order', player: host.local, units: units.map((u) => u.id), order: { type: 'gather', tree }, queued });
        else host.msg('Must target a gold mine or a tree');
        break;
      }
      case 'repair':
        if (ent && ent.b && (ent.owner === host.local || w.isAlly(host.local, ent.owner))) host.issue({ type: 'order', player: host.local, units: units.map((u) => u.id), order: { type: 'repair', target: ent.id }, queued });
        else host.msg('Must target a friendly building');
        break;
      case 'rally': {
        const tree = ent ? -1 : this.treeAt(g.x, g.y);
        host.issue({ type: 'rally', player: host.local, buildings: sel.filter((e) => e.b).map((e) => e.id), x: g.x, y: g.y, target: ent ? ent.id : -1, tree });
        break;
      }
      case 'cast': {
        const a = tm.ability!;
        const casters = sel.filter((e) => e.abilities.some((x) => x.def.id === a.id));
        const needUnit = a.targeting === 'unit';
        if (needUnit && !ent) {
          host.msg('Must target a unit');
          return;
        }
        if (a.filter?.goldMine && (!ent || !ent.def.goldMine)) {
          host.msg('Must target a gold mine');
          return;
        }
        host.issue({ type: 'cast', player: host.local, units: casters.map((c) => c.id), ability: a.id, target: ent && a.targeting !== 'point' ? ent.id : undefined, x: g.x, y: g.y, queued });
        break;
      }
      case 'useItem':
        host.issue({ type: 'useItem', player: host.local, hero: tm.hero!, slot: tm.slot!, target: ent ? ent.id : undefined, x: g.x, y: g.y });
        break;
      case 'dropItem':
        host.issue({ type: 'dropItem', player: host.local, hero: tm.hero!, slot: tm.slot!, x: g.x, y: g.y, target: ent && ent.hero && ent.id !== tm.hero ? ent.id : undefined });
        break;
    }
    if (!keep) host.cancelModes();
  }

  private place(px: number, py: number, queued: boolean): void {
    const host = this.host;
    const defId = host.placing!;
    const def = getDef(defId);
    const size = def.size ?? 2;
    const g = host.renderer.screenToWorld(px, py);
    let tx = Math.round(g.x - size / 2);
    let ty = Math.round(g.y - size / 2);
    if (def.onMine) {
      const m = host.world.mineAt(g.x, g.y);
      if (m && m.b) {
        tx = m.b.tx;
        ty = m.b.ty;
      }
    }
    if (host.placementRoot >= 0) {
      host.issue({ type: 'cast', player: host.local, units: [host.placementRoot], ability: 'tw_root', x: tx + size / 2, y: ty + size / 2 });
      host.cancelModes();
      return;
    }
    const workers = host.selection.filter((e) => e.alive && e.owner === host.local && e.isWorker);
    host.issue({ type: 'build', player: host.local, units: workers.map((u) => u.id), defId, tx, ty, queued });
    if (!queued) host.cancelModes();
  }

  // ---------------------------------------------------------------------------
  private onKey(e: KeyboardEvent, isDown: boolean): void {
    const host = this.host;
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    const k = e.key.length === 1 ? e.key.toUpperCase() : e.key;
    if (!isDown) {
      this.keys.delete(k);
      if (k === 'Alt') {
        host.renderer.overlay.opts.alt = false;
        e.preventDefault();
      }
      return;
    }
    this.keys.add(k);
    if (k === 'Alt') {
      host.renderer.overlay.opts.alt = true;
      e.preventDefault();
      return;
    }
    if (k === 'F10' || (k === 'Escape' && !host.targetMode && !host.placing && host.cardMode === 'main')) {
      e.preventDefault();
      if (!host.closeMenus()) host.openMenu();
      return;
    }
    if (host.menuOpen) return;
    if (k === 'Pause' || (k === 'P' && e.ctrlKey)) {
      e.preventDefault();
      host.togglePause();
      return;
    }
    if (k === '+' || k === '=') return host.setGameSpeed(1);
    if (k === '-' || k === '_') return host.setGameSpeed(-1);
    // function keys: heroes
    if (k === 'F1' || k === 'F2' || k === 'F3') {
      e.preventDefault();
      const n = Number(k.slice(1)) - 1;
      const now = performance.now();
      const dbl = this.lastHeroTap.n === n && now - this.lastHeroTap.t < 350;
      this.lastHeroTap = { n, t: now };
      host.focusHero(n, dbl);
      return;
    }
    if (k === 'F8' || k === '.') {
      e.preventDefault();
      host.selectIdleWorker();
      return;
    }
    if (k === ' ') {
      e.preventDefault();
      if (this.lastAlert) host.centerOn(this.lastAlert.x, this.lastAlert.y);
      return;
    }
    if (k === 'Backspace') {
      e.preventDefault();
      const hall = host.world.entities.find((x) => x.owner === host.local && x.alive && x.def.mainHall);
      if (hall) {
        host.selectIds([hall.id]);
        host.centerOn(hall.x, hall.y);
      }
      return;
    }
    if (k === 'Tab') {
      e.preventDefault();
      const types: string[] = [];
      for (const s of host.selection) if (!types.includes(s.def.id) && s.owner === host.local) types.push(s.def.id);
      if (types.length > 1) host.setActiveType(types[(types.indexOf(host.activeType) + 1) % types.length]);
      return;
    }
    // control groups
    if (/^[0-9]$/.test(k)) {
      const n = Number(k);
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        this.groups[n] = host.selection.filter((s) => s.owner === host.local).map((s) => s.id);
        host.msg(`Control group ${n} assigned`);
        return;
      }
      if (e.shiftKey) {
        const add = host.selection.filter((s) => s.owner === host.local && s.kind === 'unit').map((s) => s.id);
        this.groups[n] = [...new Set([...this.groups[n], ...add])];
        return;
      }
      const ids = this.groups[n].filter((id) => {
        const x = host.world.get(id);
        return x && x.alive && !x.removed;
      });
      this.groups[n] = ids;
      if (!ids.length) return;
      const now = performance.now();
      if (this.lastGroupTap.n === n && now - this.lastGroupTap.t < 350) {
        const first = host.world.get(ids[0]);
        if (first) host.centerOn(first.x, first.y);
      }
      this.lastGroupTap = { n, t: now };
      host.selectIds(ids);
      return;
    }
    // command card hotkeys
    const card = buildCard(host);
    const btn = card.find((b) => b.key === k);
    if (btn) {
      e.preventDefault();
      if (k === 'Escape' || !btn.passive) btn.action();
      return;
    }
    if (k === 'Escape') {
      host.cancelModes();
      return;
    }
    // hero inventory: Z X C V B N
    const invKeys = ['Z', 'X', 'C', 'V', 'B', 'N'];
    const hero = host.selection.find((s) => s.hero && s.owner === host.local && s.def.id === host.activeType);
    if (hero && invKeys.includes(k)) {
      e.preventDefault();
      host.inventoryUse(invKeys.indexOf(k));
    }
  }

  // ---------------------------------------------------------------------------
  /** Per-frame: camera keys, edge scroll, hover, placement ghost, targeting ring. */
  update(dt: number): void {
    const host = this.host;
    const r = host.renderer;
    const cam = r.camera;
    const speed = cam.dist * 1.15 * host.settings.scrollSpeed;
    let dx = 0;
    let dy = 0;
    if (this.keys.has('ArrowLeft')) dx -= 1;
    if (this.keys.has('ArrowRight')) dx += 1;
    if (this.keys.has('ArrowUp')) dy -= 1;
    if (this.keys.has('ArrowDown')) dy += 1;
    const { w, h } = r.viewport;
    if (host.settings.edgeScroll && this.moved && this.mouseIn && !this.middle && !host.menuOpen && document.hasFocus()) {
      const m = 6;
      if (this.mouseX <= m) dx -= 1;
      if (this.mouseX >= w - m) dx += 1;
      if (this.mouseY <= m) dy -= 1;
      if (this.mouseY >= h - m) dy += 1;
    }
    if (dx || dy) cam.pan(dx * speed * dt, dy * speed * dt);
    // hover highlight
    if (!this.down && this.mouseIn) {
      const ent = r.pick(this.mouseX, this.mouseY);
      r.views.hover = ent ? ent.id : -1;
      this.el.style.cursor = host.targetMode || host.placing ? 'crosshair' : ent && ent.owner !== host.local && host.world.isEnemy(host.local, ent.owner) ? 'crosshair' : ent ? 'pointer' : 'default';
    }
    // placement ghost
    if (host.placing && this.mouseIn) {
      const def = getDef(host.placing);
      const size = def.size ?? 2;
      const g = r.screenToWorld(this.mouseX, this.mouseY);
      let tx = Math.round(g.x - size / 2);
      let ty = Math.round(g.y - size / 2);
      if (def.onMine) {
        const m = host.world.mineAt(g.x, g.y);
        if (m && m.b) {
          tx = m.b.tx;
          ty = m.b.ty;
        }
      }
      const workers = host.selection.filter((s) => s.owner === host.local).map((s) => s.id);
      const err = host.world.placementError(host.placing, tx, ty, host.local, workers);
      const map = host.world.map;
      r.showPlacement(host.placing, tx, ty, (x, y) => (def.onMine ? !err : map.buildable(x, y) && (!def.needsBlight || map.hasBlight(x, y))), !err);
    } else r.showPlacement(null, 0, 0, () => false, false);
    // targeting ring
    if (host.targetMode && this.mouseIn) {
      const g = r.screenToWorld(this.mouseX, this.mouseY);
      const tm = host.targetMode;
      const aoe = tm.aoe ?? (tm.ability ? lv(tm.ability.aoe, 1) : 0);
      if (aoe > 0) r.showAoe(g.x, g.y, aoe, 0x80ff80);
      else r.showAoe(g.x, g.y, 0.6, tm.kind === 'attack' ? 0xff5040 : 0x80ff80);
    } else r.showAoe(null, 0, 0);
  }

  /** remember where the last alert came from (space bar jumps there) */
  noteAlert(x: number, y: number): void {
    this.lastAlert = { x, y };
  }

  groupsFor(): number[][] {
    return this.groups;
  }
}

export type { Entity, TargetMode };

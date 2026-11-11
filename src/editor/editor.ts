import { DEFS, FACTIONS } from '../data/registry';
import { EXPANSION_MINE_GOLD, MAIN_MINE_GOLD } from '../data/rules';
import type { FactionId } from '../data/types';
import { BLOCK_BUILDING, GameMap, type BiomeId, type CampSpec, type MapData, type RampSpec } from '../sim/map';
import { BIOME_BASE, BIOME_TREES, CAMPS, MAP_PRESETS, presetMap } from '../sim/mapgen';
import { Pathfinder } from '../sim/path';
import { PLAYER_COLORS } from '../sim/player';
import { PALETTES } from '../render/materials';
import { decodeMap, deleteSavedMap, encodeMap, listSavedMaps, saveMap } from './mapcodec';

// ---------------------------------------------------------------------------
// Map editor: a top-down painter for terrain, cliffs, ramps, water, forests
// and map objects (gold mines, start locations, creep camps, neutral buildings).
// Maps are kept in this browser's storage or shared as text, and can be
// test-played directly or picked in the Skirmish screen.
// ---------------------------------------------------------------------------

type Dir = RampSpec['dir'];
type Difficulty = CampSpec['difficulty'];
type Tool =
  | { kind: 'texture'; t: number }
  | { kind: 'raise' }
  | { kind: 'lower' }
  | { kind: 'ramp' }
  | { kind: 'water'; depth: 0 | 1 | 2 }
  | { kind: 'trees'; plant: boolean }
  | { kind: 'mine' }
  | { kind: 'start' }
  | { kind: 'camp'; difficulty: Difficulty }
  | { kind: 'neutral'; type: string }
  | { kind: 'erase' };
type Symmetry = 'off' | 'mirror' | 'rot2' | 'rot4';

const MAX_LEVEL = 2;
const MAX_STARTS = 4;
const SIZES = [64, 96, 112, 128, 144, 160];
const BIOMES: { id: BiomeId; name: string }[] = [
  { id: 'temperate', name: 'Temperate forest' },
  { id: 'winter', name: 'Winter highlands' },
  { id: 'badlands', name: 'Badlands' },
  { id: 'marsh', name: 'Marsh' },
  { id: 'ashen', name: 'Ashen wastes (lava)' },
];
const TERRAIN_NAMES = ['Grass', 'Dirt', 'Rock', 'Sand', 'Snow', 'Road', 'Moss', 'Ash'];
const DIFF_COLORS: Record<Difficulty, string> = { green: '#6cc860', orange: '#f0a040', red: '#e8473a', boss: '#c060ff' };
const DIFF_NAMES: Record<Difficulty, string> = { green: 'Weak camp', orange: 'Medium camp', red: 'Strong camp', boss: 'Boss lair' };
const NEUTRAL_TOOLS: { type: string; label: string; letter: string; color: string }[] = [
  { type: 'wayfarers_inn', label: 'Inn', letter: 'I', color: '#d8b070' },
  { type: 'peddler_wagon', label: 'Merchant', letter: 'M', color: '#b890e0' },
  { type: 'sellsword_camp', label: 'Mercenaries', letter: 'S', color: '#e08a6a' },
  { type: 'spring_life', label: 'Health spring', letter: 'H', color: '#70d890' },
  { type: 'spring_mana', label: 'Mana spring', letter: 'A', color: '#70a8f0' },
];
const TREE_COLORS: Record<BiomeId, number> = { temperate: 0x24502c, winter: 0x2e5444, badlands: 0x5c5a2a, marsh: 0x2c4a28, ashen: 0x3a2c26 };
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

interface Snapshot {
  terrain: Uint8Array;
  level: Uint8Array;
  water: Uint8Array;
  trees: Uint8Array;
  rest: string;
}

interface Footprint {
  kind: 'mine' | 'start' | 'camp' | 'neutral';
  index: number;
  x0: number;
  y0: number;
  size: number;
}

export interface EditorCallbacks {
  initial?: MapData;
  onExit(): void;
  onTest(map: MapData, faction: FactionId): void;
}

/** Mutable editor document. Tile layers are typed arrays; objects use world (tile-center) coordinates. */
class Doc {
  name = 'New map';
  description = '';
  biome: BiomeId = 'temperate';
  size = 112;
  seed = 1;
  terrain = new Uint8Array(0);
  level = new Uint8Array(0);
  water = new Uint8Array(0);
  trees = new Uint8Array(0); // 0 = none, otherwise variant + 1
  ramps: RampSpec[] = [];
  mines: { x: number; y: number }[] = [];
  starts: { x: number; y: number }[] = [];
  camps: CampSpec[] = [];
  neutrals: { type: string; x: number; y: number }[] = [];

  static blank(size: number, biome: BiomeId, name: string): Doc {
    const d = new Doc();
    d.size = size;
    d.biome = biome;
    d.name = name;
    d.seed = Math.floor(Math.random() * 1e6);
    const n = size * size;
    d.terrain = new Uint8Array(n).fill(BIOME_BASE[biome]);
    d.level = new Uint8Array(n);
    d.water = new Uint8Array(n);
    d.trees = new Uint8Array(n);
    // a forest frame along the map edge, as on the built-in maps
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const edge = Math.min(x, y, size - 1 - x, size - 1 - y);
        if (edge < 3 && (edge < 2 || (x * 7 + y * 13) % 3 !== 0)) d.trees[y * size + x] = d.treeVariant(x, y) + 1;
      }
    return d;
  }

  static from(m: MapData): Doc {
    const d = new Doc();
    const size = Math.max(m.w, m.h);
    d.size = size;
    d.name = m.name;
    d.description = m.description;
    d.biome = m.biome;
    d.seed = m.seed;
    const n = size * size;
    d.terrain = new Uint8Array(n).fill(BIOME_BASE[m.biome]);
    d.level = new Uint8Array(n);
    d.water = new Uint8Array(n);
    d.trees = new Uint8Array(n);
    for (let y = 0; y < m.h; y++)
      for (let x = 0; x < m.w; x++) {
        const i = y * m.w + x;
        const j = y * size + x;
        d.terrain[j] = m.terrain[i];
        d.level[j] = Math.min(MAX_LEVEL, m.level[i]);
        d.water[j] = m.water[i];
      }
    for (const [x, y, v] of m.trees) if (x >= 0 && y >= 0 && x < size && y < size) d.trees[y * size + x] = v + 1;
    d.ramps = m.ramps.map((r) => ({ ...r, low: Math.min(MAX_LEVEL, r.low), high: Math.min(MAX_LEVEL, r.high) }));
    for (const r of d.ramps) for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) if (d.inside(x, y)) d.level[y * size + x] = r.high;
    d.mines = m.mines.map((x) => ({ x: x.x, y: x.y }));
    d.starts = m.starts.slice(0, MAX_STARTS).map((s) => ({ x: s.x, y: s.y }));
    d.camps = m.camps.map((c) => ({ ...c, creeps: [...c.creeps] }));
    d.neutrals = m.neutrals.map((x) => ({ ...x }));
    return d;
  }

  treeVariant(x: number, y: number): number {
    const vs = BIOME_TREES[this.biome];
    return vs[(x * 31 + y * 17 + this.seed) % vs.length];
  }
  inside(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.size && y < this.size;
  }
  idx(x: number, y: number): number {
    return y * this.size + x;
  }
  rampAt(x: number, y: number): number {
    for (let k = 0; k < this.ramps.length; k++) {
      const r = this.ramps[k];
      if (x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1) return k;
    }
    return -1;
  }

  snapshot(): Snapshot {
    return {
      terrain: this.terrain.slice(),
      level: this.level.slice(),
      water: this.water.slice(),
      trees: this.trees.slice(),
      rest: JSON.stringify({ name: this.name, description: this.description, biome: this.biome, ramps: this.ramps, mines: this.mines, starts: this.starts, camps: this.camps, neutrals: this.neutrals }),
    };
  }
  restore(s: Snapshot): void {
    this.terrain = s.terrain.slice();
    this.level = s.level.slice();
    this.water = s.water.slice();
    this.trees = s.trees.slice();
    const o = JSON.parse(s.rest) as Pick<Doc, 'name' | 'description' | 'biome' | 'ramps' | 'mines' | 'starts' | 'camps' | 'neutrals'>;
    Object.assign(this, o);
  }

  footprints(): Footprint[] {
    const out: Footprint[] = [];
    this.mines.forEach((m, index) => out.push({ kind: 'mine', index, size: 3, x0: Math.round(m.x - 1.5), y0: Math.round(m.y - 1.5) }));
    this.starts.forEach((s, index) => out.push({ kind: 'start', index, size: 5, x0: Math.round(s.x - 2.5), y0: Math.round(s.y - 2.5) }));
    this.camps.forEach((c, index) => out.push({ kind: 'camp', index, size: 3, x0: Math.round(c.x - 1.5), y0: Math.round(c.y - 1.5) }));
    this.neutrals.forEach((n, index) => {
      const s = DEFS[n.type]?.size ?? 3;
      out.push({ kind: 'neutral', index, size: s, x0: Math.round(n.x - s / 2), y0: Math.round(n.y - s / 2) });
    });
    return out;
  }

  /** The finished map in the game's format (main mines get more gold; trees under objects are dropped). */
  toMapData(): MapData {
    const S = this.size;
    const blockedByObject = new Uint8Array(S * S);
    for (const f of this.footprints()) {
      const pad = f.kind === 'start' ? 2 : f.kind === 'camp' ? 1 : 0;
      for (let y = f.y0 - pad; y < f.y0 + f.size + pad; y++) for (let x = f.x0 - pad; x < f.x0 + f.size + pad; x++) if (this.inside(x, y)) blockedByObject[this.idx(x, y)] = 1;
    }
    const trees: [number, number, number][] = [];
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        const i = this.idx(x, y);
        if (this.trees[i] && !blockedByObject[i] && !this.water[i] && this.rampAt(x, y) < 0) trees.push([x, y, this.trees[i] - 1]);
      }
    return {
      name: this.name.trim() || 'Untitled map',
      description: this.description.trim() || 'A custom map.',
      w: S,
      h: S,
      biome: this.biome,
      maxPlayers: this.starts.length,
      terrain: Array.from(this.terrain),
      level: Array.from(this.level),
      water: Array.from(this.water),
      ramps: this.ramps.map((r) => ({ ...r })),
      trees,
      mines: this.mines.map((m) => ({ x: m.x, y: m.y, gold: this.starts.some((s) => Math.hypot(s.x - m.x, s.y - m.y) < 14) ? MAIN_MINE_GOLD : EXPANSION_MINE_GOLD })),
      starts: this.starts.map((s) => ({ ...s })),
      camps: this.camps.map((c) => ({ ...c, creeps: [...c.creeps] })),
      neutrals: this.neutrals.map((n) => ({ ...n })),
      seed: this.seed,
    };
  }
}

/** Problems that stop a map from being played, and softer warnings. */
export function checkMap(m: MapData): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (m.starts.length < 2) errors.push('Place at least two start locations.');
  const gm = new GameMap(m);
  // objects block their footprint, as in the game
  const block = (x0: number, y0: number, s: number) => gm.setBlocked(x0, y0, s, s, BLOCK_BUILDING, true);
  for (const mine of m.mines) block(Math.round(mine.x - 1.5), Math.round(mine.y - 1.5), 3);
  for (const n of m.neutrals) {
    const s = DEFS[n.type]?.size ?? 3;
    block(Math.round(n.x - s / 2), Math.round(n.y - s / 2), s);
  }
  const pf = new Pathfinder(gm);
  const reach = (ax: number, ay: number, bx: number, by: number) => {
    const r = pf.findPath(ax, ay, bx, by, false, 0.35, 400000);
    return !!r && r.complete;
  };
  // walk from just outside each town hall
  const door = (s: { x: number; y: number }) => gm.nearestPassable(s.x, s.y + 3.5, false, 8) ?? [s.x, s.y + 3.5];
  const s0 = m.starts[0];
  for (let i = 1; i < m.starts.length; i++) {
    const a = door(s0);
    const b = door(m.starts[i]);
    if (!reach(a[0], a[1], b[0], b[1])) errors.push(`Start ${i + 1} cannot be reached by land from start 1. Add a ramp or clear a path.`);
  }
  m.starts.forEach((s, i) => {
    const near = m.mines.filter((mi) => Math.hypot(mi.x - s.x, mi.y - s.y) < 14);
    if (!near.length) warnings.push(`Start ${i + 1} has no gold mine within 14 tiles.`);
    let trees = 0;
    for (const [tx, ty] of m.trees) if (Math.hypot(tx + 0.5 - s.x, ty + 0.5 - s.y) < 20) trees++;
    if (trees < 25) warnings.push(`Start ${i + 1} has few trees nearby for lumber.`);
  });
  if (s0) {
    const a = door(s0);
    m.mines.forEach((mi, i) => {
      const p = gm.nearestPassable(mi.x, mi.y + 2.2, false, 6);
      if (p && !reach(a[0], a[1], p[0], p[1])) warnings.push(`Gold mine ${i + 1} cannot be reached from start 1.`);
    });
  }
  if (!m.trees.length) warnings.push('The map has no trees, so no lumber can be gathered.');
  return { errors, warnings };
}

export class MapEditor {
  private root: HTMLElement;
  private cb: EditorCallbacks;
  private doc: Doc;
  private canvas!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;
  private tileCanvas = document.createElement('canvas');
  private tool: Tool = { kind: 'texture', t: 1 };
  private brush = 3;
  private symmetry: Symmetry = 'off';
  private zoom = 6; // pixels per tile
  private ox = 0; // world position at the left/top edge of the view
  private oy = 0;
  private cursor: { x: number; y: number } | null = null;
  private painting = false;
  private strokeTarget = 0;
  private strokeChanged = false;
  private strokeSnap: Snapshot | null = null;
  private rampMask = new Uint8Array(0);
  private lastPaint: { x: number; y: number } | null = null;
  private panning: { x: number; y: number; ox: number; oy: number } | null = null;
  private undoStack: Snapshot[] = [];
  private redoStack: Snapshot[] = [];
  private dirtyTiles = true;
  private needsDraw = true;
  private raf = 0;
  private last = 0;
  private keys = new Set<string>();
  private savedId: string | undefined;
  private unsaved = false;
  private testFaction: FactionId = 'crown';
  private els: Record<string, HTMLElement> = {};
  private checkTimer = 0;
  private overlay: HTMLElement | null = null;
  private alive = true;
  private viewTouched = false;
  private ro: ResizeObserver | null = null;

  constructor(parent: HTMLElement, cb: EditorCallbacks) {
    this.cb = cb;
    this.doc = cb.initial ? Doc.from(cb.initial) : Doc.blank(112, 'temperate', 'New map');
    this.root = document.createElement('div');
    this.root.className = 'ed-root';
    parent.appendChild(this.root);
    this.buildUI();
    this.fitView();
    window.addEventListener('resize', this.onResize);
    if (typeof ResizeObserver !== 'undefined') {
      this.ro = new ResizeObserver(() => this.onResize());
      this.ro.observe(this.els['ed-view']);
    }
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.loop);
    this.scheduleCheck();
  }

  destroy(): void {
    this.alive = false;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.onResize);
    this.ro?.disconnect();
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    clearTimeout(this.checkTimer);
    this.root.remove();
  }

  // -------------------------------------------------------------------------
  // UI construction
  // -------------------------------------------------------------------------
  private buildUI(): void {
    const r = this.root;
    r.innerHTML = `
      <div class="ed-top">
        <div class="ed-brand">Map Editor</div>
        <label class="ed-field">Name <input id="ed-name" type="text" maxlength="40"></label>
        <label class="ed-field">Setting <select id="ed-biome">${BIOMES.map((b) => `<option value="${b.id}">${b.name}</option>`).join('')}</select></label>
        <div class="ed-spacer"></div>
        <button class="btn small" data-act="new">New</button>
        <button class="btn small" data-act="open">Open</button>
        <button class="btn small" data-act="save">Save</button>
        <button class="btn small" data-act="share">Share</button>
        <label class="ed-field">Test as <select id="ed-faction">${(['crown', 'iron', 'sepulchral', 'twilight'] as FactionId[]).map((f) => `<option value="${f}">${FACTIONS[f].name}</option>`).join('')}</select></label>
        <button class="btn small primary" data-act="test">Test Map</button>
        <button class="btn small" data-act="exit">Exit</button>
      </div>
      <div class="ed-tools" id="ed-tools"></div>
      <div class="ed-view" id="ed-view"><canvas id="ed-canvas"></canvas></div>
      <div class="ed-side" id="ed-side">
        <h4>Map</h4><div id="ed-info" class="ed-info"></div>
        <label class="ed-field ed-desc">Description <textarea id="ed-desc" rows="3" maxlength="200" placeholder="Shown in the Skirmish map list"></textarea></label>
        <h4>Map check</h4><div id="ed-check" class="ed-check"></div>
        <h4>Controls</h4>
        <div class="ed-help">
          <div><b>Left drag</b> paint or place</div>
          <div><b>Right or middle drag</b> pan</div>
          <div><b>Wheel</b> zoom</div>
          <div><b>Arrow keys</b> pan</div>
          <div><b>[ ]</b> brush size</div>
          <div><b>Ctrl+Z / Ctrl+Y</b> undo / redo</div>
          <div>Ramps: click the edge of high ground. Water only fills ground at the lowest level.</div>
        </div>
      </div>
      <div class="ed-status"><span id="ed-pos"></span><span id="ed-msg"></span></div>`;
    const q = <T extends HTMLElement>(id: string) => r.querySelector('#' + id) as T;
    for (const id of ['ed-tools', 'ed-view', 'ed-info', 'ed-check', 'ed-pos', 'ed-msg']) this.els[id] = q(id);
    this.canvas = q<HTMLCanvasElement>('ed-canvas');
    this.ctx = this.canvas.getContext('2d')!;
    const name = q<HTMLInputElement>('ed-name');
    name.value = this.doc.name;
    name.oninput = () => {
      this.doc.name = name.value;
      this.unsaved = true;
      this.refreshInfo();
    };
    const desc = q<HTMLTextAreaElement>('ed-desc');
    desc.value = this.doc.description;
    desc.oninput = () => {
      this.doc.description = desc.value;
      this.unsaved = true;
    };
    const biome = q<HTMLSelectElement>('ed-biome');
    biome.value = this.doc.biome;
    biome.onchange = () => {
      this.pushUndo();
      const d = this.doc;
      d.biome = biome.value as BiomeId;
      for (let y = 0; y < d.size; y++) for (let x = 0; x < d.size; x++) if (d.trees[d.idx(x, y)]) d.trees[d.idx(x, y)] = d.treeVariant(x, y) + 1;
      this.afterChange();
    };
    const fac = q<HTMLSelectElement>('ed-faction');
    fac.value = this.testFaction;
    fac.onchange = () => (this.testFaction = fac.value as FactionId);
    r.querySelector('.ed-top')!.addEventListener('click', (ev) => {
      const act = (ev.target as HTMLElement).closest('[data-act]')?.getAttribute('data-act');
      if (act === 'new') this.showNew();
      else if (act === 'open') this.showOpen();
      else if (act === 'save') this.save();
      else if (act === 'share') this.showShare();
      else if (act === 'test') this.test();
      else if (act === 'exit') this.exit();
    });
    this.buildTools();
    this.bindCanvas();
    this.onResize();
    this.refreshInfo();
  }

  private buildTools(): void {
    const pal = PALETTES[this.doc.biome];
    const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');
    const t = this.tool;
    const btn = (label: string, tool: Tool, swatch?: string, title?: string) => {
      const sel = JSON.stringify(tool) === JSON.stringify(t);
      return `<button class="ed-tool${sel ? ' sel' : ''}" data-tool='${JSON.stringify(tool)}'${title ? ` title="${esc(title)}"` : ''}>${swatch ? `<span class="sw" style="background:${swatch}"></span>` : ''}${esc(label)}</button>`;
    };
    const el = this.els['ed-tools'];
    el.innerHTML = `
      <div class="ed-row"><label for="ed-brush">Brush</label><input id="ed-brush" type="range" min="1" max="12" step="1" value="${this.brush}"><span id="ed-brushv">${this.brush}</span></div>
      <div class="ed-row"><label for="ed-sym">Symmetry</label><select id="ed-sym">
        <option value="off">Off</option><option value="mirror">Mirror left/right</option><option value="rot2">2 players (rotate)</option><option value="rot4">4 players (rotate)</option>
      </select></div>
      <div class="ed-group"><h4>Ground</h4><div class="ed-btns c3">${TERRAIN_NAMES.map((n, i) => btn(n, { kind: 'texture', t: i }, hex(pal.terrain[i]))).join('')}</div></div>
      <div class="ed-group"><h4>Cliffs</h4><div class="ed-btns c3">
        ${btn('Raise', { kind: 'raise' }, undefined, 'Paint high ground one level above where the stroke starts')}
        ${btn('Lower', { kind: 'lower' }, undefined, 'Paint ground one level below where the stroke starts')}
        ${btn('Ramp', { kind: 'ramp' }, undefined, 'Click the edge of high ground to cut a ramp down to the lower level')}
      </div></div>
      <div class="ed-group"><h4>Water</h4><div class="ed-btns c3">
        ${btn('Shallow', { kind: 'water', depth: 1 }, hex(pal.water))}
        ${btn('Deep', { kind: 'water', depth: 2 }, hex(pal.waterDeep))}
        ${btn('Dry', { kind: 'water', depth: 0 }, undefined, 'Remove water')}
      </div></div>
      <div class="ed-group"><h4>Forest</h4><div class="ed-btns">
        ${btn('Plant trees', { kind: 'trees', plant: true }, hex(TREE_COLORS[this.doc.biome]))}
        ${btn('Clear trees', { kind: 'trees', plant: false })}
      </div></div>
      <div class="ed-group"><h4>Objects</h4><div class="ed-btns">
        ${btn('Start location', { kind: 'start' }, '#2f6fe0')}
        ${btn('Gold mine', { kind: 'mine' }, '#e0b030')}
        ${(['green', 'orange', 'red', 'boss'] as Difficulty[]).map((d) => btn(DIFF_NAMES[d], { kind: 'camp', difficulty: d }, DIFF_COLORS[d])).join('')}
        ${NEUTRAL_TOOLS.map((n) => btn(n.label, { kind: 'neutral', type: n.type }, n.color)).join('')}
        ${btn('Eraser', { kind: 'erase' }, undefined, 'Remove a placed object')}
      </div></div>`;
    el.onclick = (ev) => {
      const b = (ev.target as HTMLElement).closest('[data-tool]');
      if (!b) return;
      this.tool = JSON.parse(b.getAttribute('data-tool')!) as Tool;
      this.buildTools();
      this.needsDraw = true;
    };
    const brush = el.querySelector('#ed-brush') as HTMLInputElement;
    brush.oninput = () => this.setBrush(Number(brush.value));
    const sym = el.querySelector('#ed-sym') as HTMLSelectElement;
    sym.value = this.symmetry;
    sym.onchange = () => {
      this.symmetry = sym.value as Symmetry;
      this.needsDraw = true;
    };
  }

  private setBrush(n: number): void {
    this.brush = Math.max(1, Math.min(12, Math.round(n)));
    const input = this.els['ed-tools'].querySelector('#ed-brush') as HTMLInputElement | null;
    const v = this.els['ed-tools'].querySelector('#ed-brushv');
    if (input) input.value = String(this.brush);
    if (v) v.textContent = String(this.brush);
    this.needsDraw = true;
  }

  private message(text: string, kind: 'info' | 'error' | 'good' = 'info'): void {
    const m = this.els['ed-msg'];
    m.textContent = text;
    m.className = kind === 'error' ? 'ed-err' : kind === 'good' ? 'ed-ok' : '';
  }

  private refreshInfo(): void {
    const d = this.doc;
    let trees = 0;
    for (let i = 0; i < d.trees.length; i++) if (d.trees[i]) trees++;
    this.els['ed-info'].innerHTML = `
      <div><span>Size</span><b>${d.size} × ${d.size}</b></div>
      <div><span>Players</span><b>${d.starts.length}</b></div>
      <div><span>Gold mines</span><b>${d.mines.length}</b></div>
      <div><span>Creep camps</span><b>${d.camps.length}</b></div>
      <div><span>Buildings</span><b>${d.neutrals.length}</b></div>
      <div><span>Trees</span><b>${trees}</b></div>
      <div><span>Status</span><b>${this.savedId ? (this.unsaved ? 'Unsaved changes' : 'Saved') : 'Not saved yet'}</b></div>`;
  }

  private scheduleCheck(): void {
    clearTimeout(this.checkTimer);
    this.checkTimer = window.setTimeout(() => {
      if (!this.alive) return;
      const { errors, warnings } = checkMap(this.doc.toMapData());
      this.els['ed-check'].innerHTML =
        errors.map((e) => `<div class="ed-err">${esc(e)}</div>`).join('') +
        warnings.map((w) => `<div class="ed-warn">${esc(w)}</div>`).join('') +
        (!errors.length && !warnings.length ? '<div class="ed-ok">Ready to play.</div>' : !errors.length ? '<div class="ed-ok">Playable.</div>' : '');
    }, 350);
  }

  // -------------------------------------------------------------------------
  // view and input
  // -------------------------------------------------------------------------
  private onResize = () => {
    const v = this.els['ed-view'];
    const w = Math.max(1, v.clientWidth);
    const h = Math.max(1, v.clientHeight);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!this.viewTouched) this.fitView();
    this.needsDraw = true;
  };

  private viewSize(): { w: number; h: number } {
    const v = this.els['ed-view'];
    return { w: v.clientWidth, h: v.clientHeight };
  }

  private fitView(): void {
    const { w, h } = this.viewSize();
    this.zoom = Math.max(2, Math.min(w, h) / (this.doc.size + 4));
    this.ox = this.doc.size / 2 - w / 2 / this.zoom;
    this.oy = this.doc.size / 2 - h / 2 / this.zoom;
    this.needsDraw = true;
  }

  private toWorld(ev: { clientX: number; clientY: number }): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
    return { x: this.ox + (ev.clientX - r.left) / this.zoom, y: this.oy + (ev.clientY - r.top) / this.zoom };
  }

  private bindCanvas(): void {
    const c = this.canvas;
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('pointerdown', (ev) => {
      c.setPointerCapture(ev.pointerId);
      const p = this.toWorld(ev);
      if (ev.button === 1 || ev.button === 2) {
        this.viewTouched = true;
        this.panning = { x: ev.clientX, y: ev.clientY, ox: this.ox, oy: this.oy };
        return;
      }
      if (ev.button !== 0) return;
      this.beginStroke(p);
    });
    c.addEventListener('pointermove', (ev) => {
      const p = this.toWorld(ev);
      this.cursor = p;
      this.needsDraw = true;
      this.updatePos(p);
      if (this.panning) {
        this.ox = this.panning.ox - (ev.clientX - this.panning.x) / this.zoom;
        this.oy = this.panning.oy - (ev.clientY - this.panning.y) / this.zoom;
        return;
      }
      if (this.painting) this.continueStroke(p);
    });
    const end = () => {
      this.panning = null;
      if (this.painting) this.endStroke();
    };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
    c.addEventListener('pointerleave', () => {
      this.cursor = null;
      this.needsDraw = true;
    });
    c.addEventListener(
      'wheel',
      (ev) => {
        ev.preventDefault();
        this.viewTouched = true;
        const before = this.toWorld(ev);
        const f = Math.exp(-ev.deltaY * 0.0015);
        this.zoom = Math.max(1.5, Math.min(40, this.zoom * f));
        const after = this.toWorld(ev);
        this.ox += before.x - after.x;
        this.oy += before.y - after.y;
        this.needsDraw = true;
      },
      { passive: false },
    );
  }

  private typing(): boolean {
    const a = document.activeElement;
    return !!a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT') && (a as HTMLInputElement).type !== 'range';
  }

  private onKeyDown = (ev: KeyboardEvent) => {
    if (this.overlay) {
      if (ev.key === 'Escape') this.closeOverlay();
      return;
    }
    if (this.typing()) return;
    const k = ev.key;
    if ((ev.ctrlKey || ev.metaKey) && (k === 'z' || k === 'Z')) {
      ev.preventDefault();
      if (ev.shiftKey) this.redo();
      else this.undo();
      return;
    }
    if ((ev.ctrlKey || ev.metaKey) && (k === 'y' || k === 'Y')) {
      ev.preventDefault();
      this.redo();
      return;
    }
    if ((ev.ctrlKey || ev.metaKey) && (k === 's' || k === 'S')) {
      ev.preventDefault();
      this.save();
      return;
    }
    if (k === '[') this.setBrush(this.brush - 1);
    else if (k === ']') this.setBrush(this.brush + 1);
    else if (k.startsWith('Arrow')) {
      ev.preventDefault();
      this.keys.add(k);
    }
  };

  private onKeyUp = (ev: KeyboardEvent) => {
    this.keys.delete(ev.key);
  };

  private updatePos(p: { x: number; y: number }): void {
    const d = this.doc;
    const tx = Math.floor(p.x);
    const ty = Math.floor(p.y);
    if (!d.inside(tx, ty)) {
      this.els['ed-pos'].textContent = '';
      return;
    }
    const i = d.idx(tx, ty);
    const parts = [`Tile ${tx}, ${ty}`, `Level ${d.level[i]}`, TERRAIN_NAMES[d.terrain[i]]];
    if (d.water[i]) parts.push(d.water[i] === 2 ? 'Deep water' : 'Shallow water');
    if (d.rampAt(tx, ty) >= 0) parts.push('Ramp');
    if (d.trees[i]) parts.push('Tree');
    this.els['ed-pos'].textContent = parts.join(' · ');
  }

  // -------------------------------------------------------------------------
  // symmetry
  // -------------------------------------------------------------------------
  /** world-coordinate images of a point under the current symmetry (first is the point itself) */
  private images(x: number, y: number): { x: number; y: number; rot: number; mirror: boolean }[] {
    const S = this.doc.size;
    const out = [{ x, y, rot: 0, mirror: false }];
    if (this.symmetry === 'mirror') out.push({ x: S - x, y, rot: 0, mirror: true });
    else if (this.symmetry === 'rot2') out.push({ x: S - x, y: S - y, rot: 2, mirror: false });
    else if (this.symmetry === 'rot4') {
      out.push({ x: S - y, y: x, rot: 1, mirror: false });
      out.push({ x: S - x, y: S - y, rot: 2, mirror: false });
      out.push({ x: y, y: S - x, rot: 3, mirror: false });
    }
    // a point on the symmetry axis or centre is its own image
    return out.filter((p, i) => out.findIndex((q) => Math.abs(q.x - p.x) < 0.01 && Math.abs(q.y - p.y) < 0.01) === i);
  }

  // -------------------------------------------------------------------------
  // editing
  // -------------------------------------------------------------------------
  private pushUndo(snap: Snapshot = this.doc.snapshot()): void {
    this.undoStack.push(snap);
    if (this.undoStack.length > 60) this.undoStack.shift();
    this.redoStack.length = 0;
  }
  private undo(): void {
    const s = this.undoStack.pop();
    if (!s) return this.message('Nothing to undo.');
    this.redoStack.push(this.doc.snapshot());
    this.doc.restore(s);
    this.afterChange();
    this.message('Undone.');
  }
  private redo(): void {
    const s = this.redoStack.pop();
    if (!s) return this.message('Nothing to redo.');
    this.undoStack.push(this.doc.snapshot());
    this.doc.restore(s);
    this.afterChange();
    this.message('Redone.');
  }
  private afterChange(): void {
    this.unsaved = true;
    this.dirtyTiles = true;
    this.needsDraw = true;
    (this.root.querySelector('#ed-name') as HTMLInputElement).value = this.doc.name;
    (this.root.querySelector('#ed-biome') as HTMLSelectElement).value = this.doc.biome;
    this.buildTools();
    this.refreshInfo();
    this.scheduleCheck();
  }

  private isBrushTool(): boolean {
    const k = this.tool.kind;
    return k === 'texture' || k === 'raise' || k === 'lower' || k === 'water' || k === 'trees';
  }

  private beginStroke(p: { x: number; y: number }): void {
    const d = this.doc;
    const tx = Math.floor(p.x);
    const ty = Math.floor(p.y);
    if (!d.inside(tx, ty)) return;
    const snap = d.snapshot();
    this.strokeChanged = false;
    if (this.isBrushTool()) {
      const l = d.level[d.idx(tx, ty)];
      this.strokeTarget = this.tool.kind === 'raise' ? Math.min(MAX_LEVEL, l + 1) : this.tool.kind === 'lower' ? Math.max(0, l - 1) : 0;
      if (this.tool.kind === 'raise' && l >= MAX_LEVEL) this.message(`Ground is already at the highest level (${MAX_LEVEL}).`, 'error');
      this.painting = true;
      this.strokeSnap = snap;
      this.lastPaint = p;
      this.paintAt(p);
      return;
    }
    // single-click tools
    if (this.clickTool(p)) {
      this.pushUndo(snap);
      this.afterChange();
    }
  }

  private continueStroke(p: { x: number; y: number }): void {
    const from = this.lastPaint ?? p;
    const dist = Math.hypot(p.x - from.x, p.y - from.y);
    const step = Math.max(0.5, this.brush * 0.5);
    const n = Math.max(1, Math.ceil(dist / step));
    for (let k = 1; k <= n; k++) this.paintAt({ x: from.x + ((p.x - from.x) * k) / n, y: from.y + ((p.y - from.y) * k) / n });
    this.lastPaint = p;
  }

  private endStroke(): void {
    this.painting = false;
    this.lastPaint = null;
    if (this.strokeChanged && this.strokeSnap) {
      this.pushUndo(this.strokeSnap);
      this.afterChange();
    }
    this.strokeSnap = null;
  }

  private paintAt(p: { x: number; y: number }): void {
    const d = this.doc;
    const r = this.brush - 0.5;
    const tool = this.tool;
    for (const img of this.images(p.x, p.y)) {
      const x0 = Math.floor(img.x - r);
      const x1 = Math.floor(img.x + r);
      const y0 = Math.floor(img.y - r);
      const y1 = Math.floor(img.y + r);
      for (let y = y0; y <= y1; y++)
        for (let x = x0; x <= x1; x++) {
          if (!d.inside(x, y)) continue;
          if ((x + 0.5 - img.x) ** 2 + (y + 0.5 - img.y) ** 2 > r * r + 0.25) continue;
          const i = d.idx(x, y);
          switch (tool.kind) {
            case 'texture':
              if (d.terrain[i] !== tool.t) {
                d.terrain[i] = tool.t;
                this.strokeChanged = true;
              }
              break;
            case 'raise':
            case 'lower': {
              if (d.level[i] === this.strokeTarget) break;
              if (tool.kind === 'raise' && d.level[i] > this.strokeTarget) break;
              if (tool.kind === 'lower' && d.level[i] < this.strokeTarget) break;
              const rk = d.rampAt(x, y);
              if (rk >= 0) d.ramps.splice(rk, 1);
              d.level[i] = this.strokeTarget;
              if (this.strokeTarget > 0) d.water[i] = 0;
              this.strokeChanged = true;
              break;
            }
            case 'water':
              if (tool.depth > 0 && (d.level[i] > 0 || d.rampAt(x, y) >= 0)) break;
              if (d.water[i] !== tool.depth) {
                d.water[i] = tool.depth;
                if (tool.depth) d.trees[i] = 0;
                this.strokeChanged = true;
              }
              break;
            case 'trees':
              if (tool.plant) {
                if (d.trees[i] || d.water[i] || d.rampAt(x, y) >= 0) break;
                // natural looking density, stable under repeated strokes
                if (((x * 73856093) ^ (y * 19349663) ^ d.seed) % 100 < 30) break;
                d.trees[i] = d.treeVariant(x, y) + 1;
                this.strokeChanged = true;
              } else if (d.trees[i]) {
                d.trees[i] = 0;
                this.strokeChanged = true;
              }
              break;
          }
        }
    }
    if (this.strokeChanged) {
      this.dirtyTiles = true;
      this.needsDraw = true;
    }
  }

  /** Object placement, ramps and the eraser. Returns true when the document changed. */
  private clickTool(p: { x: number; y: number }): boolean {
    const d = this.doc;
    const tool = this.tool;
    const tx = Math.floor(p.x);
    const ty = Math.floor(p.y);
    if (tool.kind === 'ramp') {
      let made = 0;
      for (const img of this.images(tx + 0.5, ty + 0.5)) if (this.makeRamp(Math.floor(img.x), Math.floor(img.y))) made++;
      if (!made) this.message('Click on the edge of high ground (or on low ground right next to it) to cut a ramp.', 'error');
      else this.message(made > 1 ? `${made} ramps cut.` : 'Ramp cut.', 'good');
      return made > 0;
    }
    if (tool.kind === 'erase') {
      const hits = this.images(tx + 0.5, ty + 0.5).map((img) => this.objectAt(Math.floor(img.x), Math.floor(img.y)));
      const found = hits.filter((h): h is Footprint => !!h);
      if (!found.length) {
        this.message('No object here to remove.', 'error');
        return false;
      }
      // remove from the highest index down so indices stay valid
      const uniq = [...new Map(found.map((f) => [f.kind + f.index, f])).values()].sort((a, b) => b.index - a.index);
      for (const f of uniq) {
        if (f.kind === 'mine') d.mines.splice(f.index, 1);
        else if (f.kind === 'start') d.starts.splice(f.index, 1);
        else if (f.kind === 'camp') d.camps.splice(f.index, 1);
        else d.neutrals.splice(f.index, 1);
      }
      this.message(uniq.length > 1 ? `${uniq.length} objects removed.` : 'Object removed.', 'good');
      return true;
    }
    // objects
    const size = tool.kind === 'start' ? 5 : tool.kind === 'neutral' ? (DEFS[tool.type]?.size ?? 3) : 3;
    const centerOf = (x: number) => (size % 2 ? Math.floor(x) + 0.5 : Math.round(x));
    const places = this.images(centerOf(p.x), centerOf(p.y)).map((img) => ({ x: img.x, y: img.y }));
    if (tool.kind === 'start' && d.starts.length + places.length > MAX_STARTS) {
      this.message(`A map can have at most ${MAX_STARTS} start locations.`, 'error');
      return false;
    }
    const taken: Footprint[] = d.footprints();
    for (const pl of places) {
      const x0 = Math.round(pl.x - size / 2);
      const y0 = Math.round(pl.y - size / 2);
      const err = this.placementError(x0, y0, size, taken);
      if (err) {
        this.message(err, 'error');
        return false;
      }
      taken.push({ kind: 'mine', index: -1, x0, y0, size });
    }
    let campPick: { creeps: string[]; drop: number } | null = null;
    if (tool.kind === 'camp') {
      const list = CAMPS[tool.difficulty];
      campPick = list[Math.floor(Math.random() * list.length)];
    }
    for (const pl of places) {
      if (tool.kind === 'mine') d.mines.push({ x: pl.x, y: pl.y });
      else if (tool.kind === 'start') d.starts.push({ x: pl.x, y: pl.y });
      else if (tool.kind === 'camp' && campPick) d.camps.push({ x: pl.x, y: pl.y, creeps: [...campPick.creeps], drop: campPick.drop, difficulty: tool.difficulty });
      else if (tool.kind === 'neutral') d.neutrals.push({ type: tool.type, x: pl.x, y: pl.y });
      // keep the footprint (and room around town halls) free of trees
      const pad = tool.kind === 'start' ? 3 : 1;
      const x0 = Math.round(pl.x - size / 2) - pad;
      const y0 = Math.round(pl.y - size / 2) - pad;
      for (let y = y0; y < y0 + size + pad * 2; y++) for (let x = x0; x < x0 + size + pad * 2; x++) if (d.inside(x, y)) d.trees[d.idx(x, y)] = 0;
    }
    const what = tool.kind === 'mine' ? 'Gold mine' : tool.kind === 'start' ? 'Start location' : tool.kind === 'camp' ? DIFF_NAMES[tool.difficulty] : NEUTRAL_TOOLS.find((n) => n.type === (tool as { type: string }).type)?.label ?? 'Building';
    this.message(`${what} placed${places.length > 1 ? ` (${places.length} copies)` : ''}.`, 'good');
    return true;
  }

  private placementError(x0: number, y0: number, size: number, taken: Footprint[]): string | null {
    const d = this.doc;
    if (x0 < 2 || y0 < 2 || x0 + size > d.size - 2 || y0 + size > d.size - 2) return 'Too close to the map edge.';
    const l = d.level[d.idx(x0, y0)];
    for (let y = y0; y < y0 + size; y++)
      for (let x = x0; x < x0 + size; x++) {
        const i = d.idx(x, y);
        if (d.level[i] !== l) return 'Objects need flat ground: this spot crosses a cliff.';
        if (d.water[i]) return 'Objects cannot be placed in water.';
        if (d.rampAt(x, y) >= 0) return 'Objects cannot be placed on a ramp.';
      }
    // the cliff edge itself is impassable in game; keep one tile from lower ground
    for (let y = y0 - 1; y <= y0 + size; y++)
      for (let x = x0 - 1; x <= x0 + size; x++) if (d.inside(x, y) && d.level[d.idx(x, y)] < l && d.rampAt(x, y) < 0) return 'Too close to a cliff edge.';
    for (const f of taken) {
      if (x0 < f.x0 + f.size + 1 && x0 + size + 1 > f.x0 && y0 < f.y0 + f.size + 1 && y0 + size + 1 > f.y0) return 'Too close to another object.';
    }
    return null;
  }

  private objectAt(tx: number, ty: number): Footprint | null {
    let best: Footprint | null = null;
    let bd = Infinity;
    for (const f of this.doc.footprints()) {
      const cx = f.x0 + f.size / 2;
      const cy = f.y0 + f.size / 2;
      const dd = Math.hypot(tx + 0.5 - cx, ty + 0.5 - cy);
      if (dd < f.size / 2 + 1 && dd < bd) {
        bd = dd;
        best = f;
      }
    }
    return best;
  }

  /** Cut a 4-wide ramp from the high ground at or next to (tx, ty) down to the level below. */
  private makeRamp(tx: number, ty: number): boolean {
    const d = this.doc;
    if (!d.inside(tx, ty)) return false;
    const DV: Record<Dir, [number, number]> = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] };
    const dirs: Dir[] = ['n', 's', 'e', 'w'];
    const lv = (x: number, y: number) => (d.inside(x, y) ? d.level[d.idx(x, y)] : -1);
    // find an edge tile (high) and the direction toward lower ground
    let ex = tx;
    let ey = ty;
    let out: Dir | null = null;
    const lowerNeighbour = (x: number, y: number): Dir | null => {
      let best: Dir | null = null;
      let bl = lv(x, y);
      for (const dir of dirs) {
        const [dx, dy] = DV[dir];
        const l = lv(x + dx, y + dy);
        if (l >= 0 && l < bl) {
          bl = l;
          best = dir;
        }
      }
      return best;
    };
    out = lv(tx, ty) > 0 ? lowerNeighbour(tx, ty) : null;
    if (!out) {
      // clicked on low ground: look for higher ground next to it
      for (const dir of dirs) {
        const [dx, dy] = DV[dir];
        if (lv(tx + dx, ty + dy) > lv(tx, ty)) {
          ex = tx + dx;
          ey = ty + dy;
          out = (dir === 'n' ? 's' : dir === 's' ? 'n' : dir === 'e' ? 'w' : 'e') as Dir;
          break;
        }
      }
    }
    if (!out) return false;
    const high = lv(ex, ey);
    const low = high - 1;
    if (high < 1) return false;
    const [dx, dy] = DV[out];
    const px = -dy;
    const py = dx;
    const at = (a: number, b: number): [number, number] => [ex + px * a + dx * b, ey + py * a + dy * b];
    // ramp tiles: 4 across, 4 deep into the high ground
    const tiles: [number, number][] = [];
    for (let a = -2; a < 2; a++) for (let b = -3; b <= 0; b++) tiles.push(at(a, b));
    for (const [x, y] of tiles) if (x < 2 || y < 2 || x >= d.size - 2 || y >= d.size - 2) return false;
    // shape the surroundings: walls beside the ramp, open low ground at the foot
    for (let a = -3; a <= 2; a++)
      for (let b = -4; b <= 0; b++) {
        const [x, y] = at(a, b);
        if (d.inside(x, y)) {
          const i = d.idx(x, y);
          d.level[i] = high;
          d.water[i] = 0;
        }
      }
    for (let a = -3; a <= 2; a++)
      for (let b = 1; b <= 3; b++) {
        const [x, y] = at(a, b);
        if (!d.inside(x, y)) continue;
        const i = d.idx(x, y);
        if (d.level[i] > low) d.level[i] = low;
        if (d.water[i] === 2) d.water[i] = 1;
        d.trees[i] = 0;
      }
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const [x, y] of tiles) {
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
      d.trees[d.idx(x, y)] = 0;
    }
    // replace overlapping ramps
    d.ramps = d.ramps.filter((r) => r.x1 < x0 - 1 || r.x0 > x1 + 1 || r.y1 < y0 - 1 || r.y0 > y1 + 1);
    const up: Dir = out === 'n' ? 's' : out === 's' ? 'n' : out === 'e' ? 'w' : 'e';
    d.ramps.push({ x0, y0, x1, y1, dir: up, low, high });
    return true;
  }

  // -------------------------------------------------------------------------
  // drawing
  // -------------------------------------------------------------------------
  private loop = (now: number) => {
    if (!this.alive) return;
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(0.1, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    if (this.keys.size && !this.typing()) {
      this.viewTouched = true;
      const sp = (600 / this.zoom) * dt; // screen-speed panning, independent of frame rate
      if (this.keys.has('ArrowLeft')) this.ox -= sp;
      if (this.keys.has('ArrowRight')) this.ox += sp;
      if (this.keys.has('ArrowUp')) this.oy -= sp;
      if (this.keys.has('ArrowDown')) this.oy += sp;
      this.needsDraw = true;
    }
    if (this.dirtyTiles) {
      this.renderTiles();
      this.dirtyTiles = false;
      this.needsDraw = true;
    }
    if (this.needsDraw) {
      this.needsDraw = false;
      this.draw();
    }
  };

  private renderTiles(): void {
    const d = this.doc;
    const S = d.size;
    const pal = PALETTES[d.biome];
    if (this.tileCanvas.width !== S) {
      this.tileCanvas.width = S;
      this.tileCanvas.height = S;
    }
    const tc = this.tileCanvas.getContext('2d')!;
    const img = tc.createImageData(S, S);
    const rampMask = new Uint8Array(S * S);
    for (const r of d.ramps) for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) if (d.inside(x, y)) rampMask[d.idx(x, y)] = 1;
    this.rampMask = rampMask;
    const treeCol = TREE_COLORS[d.biome];
    for (let i = 0; i < S * S; i++) {
      let col = pal.terrain[d.terrain[i]] ?? pal.terrain[0];
      if (d.water[i]) col = d.water[i] === 2 ? pal.waterDeep : pal.water;
      if (d.trees[i] && !d.water[i]) col = treeCol;
      const f = (0.8 + d.level[i] * 0.17) * (rampMask[i] ? 1.08 : 1);
      img.data[i * 4] = Math.min(255, ((col >> 16) & 255) * f);
      img.data[i * 4 + 1] = Math.min(255, ((col >> 8) & 255) * f);
      img.data[i * 4 + 2] = Math.min(255, (col & 255) * f);
      img.data[i * 4 + 3] = 255;
    }
    tc.putImageData(img, 0, 0);
  }

  private draw(): void {
    const c = this.ctx;
    const d = this.doc;
    const { w, h } = this.viewSize();
    const z = this.zoom;
    const sx = (x: number) => (x - this.ox) * z;
    const sy = (y: number) => (y - this.oy) * z;
    c.fillStyle = '#07080c';
    c.fillRect(0, 0, w, h);
    c.imageSmoothingEnabled = false;
    c.drawImage(this.tileCanvas, sx(0), sy(0), d.size * z, d.size * z);
    // visible tile range
    const tx0 = Math.max(0, Math.floor(this.ox));
    const ty0 = Math.max(0, Math.floor(this.oy));
    const tx1 = Math.min(d.size - 1, Math.ceil(this.ox + w / z));
    const ty1 = Math.min(d.size - 1, Math.ceil(this.oy + h / z));
    // grid when zoomed in
    if (z >= 14) {
      c.strokeStyle = 'rgba(0,0,0,0.12)';
      c.lineWidth = 1;
      c.beginPath();
      for (let x = tx0; x <= tx1 + 1; x++) {
        c.moveTo(Math.round(sx(x)) + 0.5, sy(ty0));
        c.lineTo(Math.round(sx(x)) + 0.5, sy(ty1 + 1));
      }
      for (let y = ty0; y <= ty1 + 1; y++) {
        c.moveTo(sx(tx0), Math.round(sy(y)) + 0.5);
        c.lineTo(sx(tx1 + 1), Math.round(sy(y)) + 0.5);
      }
      c.stroke();
    }
    // cliff edges
    c.strokeStyle = 'rgba(10,8,6,0.75)';
    c.lineWidth = Math.max(1, z * 0.18);
    c.beginPath();
    const rm = this.rampMask;
    for (let y = ty0; y <= ty1; y++)
      for (let x = tx0; x <= tx1; x++) {
        const i = d.idx(x, y);
        const l = d.level[i];
        if (x + 1 < d.size && d.level[i + 1] !== l && !rm[i] && !rm[i + 1]) {
          c.moveTo(sx(x + 1), sy(y));
          c.lineTo(sx(x + 1), sy(y + 1));
        }
        if (y + 1 < d.size && d.level[i + d.size] !== l && !rm[i] && !rm[i + d.size]) {
          c.moveTo(sx(x), sy(y + 1));
          c.lineTo(sx(x + 1), sy(y + 1));
        }
      }
    c.stroke();
    // ramps: outline and an arrow pointing uphill
    for (const r of d.ramps) {
      const x = sx(r.x0);
      const y = sy(r.y0);
      const rw = (r.x1 + 1 - r.x0) * z;
      const rh = (r.y1 + 1 - r.y0) * z;
      c.strokeStyle = 'rgba(255,240,200,0.85)';
      c.lineWidth = Math.max(1, z * 0.12);
      c.setLineDash([Math.max(2, z * 0.4), Math.max(2, z * 0.3)]);
      c.strokeRect(x, y, rw, rh);
      c.setLineDash([]);
      const cx = x + rw / 2;
      const cy = y + rh / 2;
      const [dx, dy] = r.dir === 'n' ? [0, -1] : r.dir === 's' ? [0, 1] : r.dir === 'e' ? [1, 0] : [-1, 0];
      const L = Math.min(rw, rh) * 0.35;
      c.beginPath();
      c.moveTo(cx - dx * L, cy - dy * L);
      c.lineTo(cx + dx * L, cy + dy * L);
      c.moveTo(cx + dx * L, cy + dy * L);
      c.lineTo(cx + dx * L * 0.4 - dy * L * 0.5, cy + dy * L * 0.4 + dx * L * 0.5);
      c.moveTo(cx + dx * L, cy + dy * L);
      c.lineTo(cx + dx * L * 0.4 + dy * L * 0.5, cy + dy * L * 0.4 - dx * L * 0.5);
      c.stroke();
    }
    // objects
    const label = (text: string, x: number, y: number, size: number, color = '#fff') => {
      c.font = `700 ${Math.max(9, size)}px Inter, system-ui, sans-serif`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.lineWidth = 3;
      c.strokeStyle = 'rgba(0,0,0,0.7)';
      c.strokeText(text, x, y);
      c.fillStyle = color;
      c.fillText(text, x, y);
    };
    for (const f of d.footprints()) {
      const x = sx(f.x0);
      const y = sy(f.y0);
      const s = f.size * z;
      if (f.kind === 'mine') {
        c.fillStyle = '#c99a24';
        c.strokeStyle = '#3a2a08';
        c.lineWidth = Math.max(1, z * 0.15);
        c.beginPath();
        if (typeof c.roundRect === 'function') c.roundRect(x + z * 0.15, y + z * 0.15, s - z * 0.3, s - z * 0.3, z * 0.6);
        else c.rect(x + z * 0.15, y + z * 0.15, s - z * 0.3, s - z * 0.3);
        c.fill();
        c.stroke();
        if (z >= 5) label('Gold', x + s / 2, y + s / 2, z * 0.9);
      } else if (f.kind === 'start') {
        const col = '#' + PLAYER_COLORS[[1, 0, 2, 4][f.index] ?? 1].hex.toString(16).padStart(6, '0');
        c.strokeStyle = col;
        c.lineWidth = Math.max(1.5, z * 0.2);
        c.strokeRect(x, y, s, s);
        c.fillStyle = col;
        c.beginPath();
        c.arc(x + s / 2, y + s / 2, Math.max(7, z * 1.6), 0, Math.PI * 2);
        c.fill();
        label(String(f.index + 1), x + s / 2, y + s / 2, Math.max(10, z * 1.6));
      } else if (f.kind === 'camp') {
        const camp = d.camps[f.index];
        c.fillStyle = DIFF_COLORS[camp.difficulty];
        c.strokeStyle = 'rgba(0,0,0,0.7)';
        c.lineWidth = Math.max(1, z * 0.12);
        c.beginPath();
        c.arc(x + s / 2, y + s / 2, Math.max(4, s * 0.42), 0, Math.PI * 2);
        c.fill();
        c.stroke();
        if (z >= 4) label(String(camp.creeps.length), x + s / 2, y + s / 2, z * 1.1);
      } else {
        const n = d.neutrals[f.index];
        const meta = NEUTRAL_TOOLS.find((t) => t.type === n.type);
        c.fillStyle = meta?.color ?? '#c8b8e8';
        c.strokeStyle = 'rgba(0,0,0,0.7)';
        c.lineWidth = Math.max(1, z * 0.12);
        c.fillRect(x + z * 0.1, y + z * 0.1, s - z * 0.2, s - z * 0.2);
        c.strokeRect(x + z * 0.1, y + z * 0.1, s - z * 0.2, s - z * 0.2);
        if (z >= 4) label(meta?.letter ?? '?', x + s / 2, y + s / 2, z * 1.2);
      }
    }
    // map border
    c.strokeStyle = 'rgba(232,197,106,0.5)';
    c.lineWidth = 1;
    c.strokeRect(sx(0), sy(0), d.size * z, d.size * z);
    // symmetry guides
    if (this.symmetry !== 'off') {
      c.strokeStyle = 'rgba(232,197,106,0.35)';
      c.setLineDash([6, 6]);
      c.beginPath();
      const m = d.size / 2;
      if (this.symmetry === 'mirror' || this.symmetry === 'rot4') {
        c.moveTo(sx(m), sy(0));
        c.lineTo(sx(m), sy(d.size));
      }
      if (this.symmetry === 'rot4') {
        c.moveTo(sx(0), sy(m));
        c.lineTo(sx(d.size), sy(m));
      }
      if (this.symmetry === 'rot2') {
        c.moveTo(sx(0), sy(d.size));
        c.lineTo(sx(d.size), sy(0));
      }
      c.stroke();
      c.setLineDash([]);
    }
    // brush / placement preview at every symmetric position
    if (this.cursor) {
      const p = this.cursor;
      c.strokeStyle = 'rgba(255,255,255,0.85)';
      c.lineWidth = 1.5;
      if (this.isBrushTool()) {
        for (const img of this.images(p.x, p.y)) {
          c.beginPath();
          c.arc(sx(img.x), sy(img.y), (this.brush - 0.5) * z, 0, Math.PI * 2);
          c.stroke();
        }
      } else if (this.tool.kind === 'mine' || this.tool.kind === 'start' || this.tool.kind === 'camp' || this.tool.kind === 'neutral') {
        const tool = this.tool;
        const size = tool.kind === 'start' ? 5 : tool.kind === 'neutral' ? (DEFS[tool.type]?.size ?? 3) : 3;
        const centerOf = (v: number) => (size % 2 ? Math.floor(v) + 0.5 : Math.round(v));
        const taken = d.footprints();
        for (const img of this.images(centerOf(p.x), centerOf(p.y))) {
          const x0 = Math.round(img.x - size / 2);
          const y0 = Math.round(img.y - size / 2);
          const ok = !this.placementError(x0, y0, size, taken);
          c.strokeStyle = ok ? 'rgba(120,255,140,0.95)' : 'rgba(255,90,80,0.95)';
          c.strokeRect(sx(x0), sy(y0), size * z, size * z);
        }
      } else {
        for (const img of this.images(Math.floor(p.x) + 0.5, Math.floor(p.y) + 0.5)) c.strokeRect(sx(Math.floor(img.x)), sy(Math.floor(img.y)), z, z);
      }
    }
  }

  // -------------------------------------------------------------------------
  // documents
  // -------------------------------------------------------------------------
  private openOverlay(html: string, wide = false): HTMLElement {
    this.closeOverlay();
    const o = document.createElement('div');
    o.className = 'overlay ed-overlay';
    o.innerHTML = `<div class="panel" style="width:${wide ? 'min(720px,94vw)' : 'min(460px,94vw)'}">${html}</div>`;
    o.addEventListener('pointerdown', (ev) => {
      if (ev.target === o) this.closeOverlay();
    });
    this.root.appendChild(o);
    this.overlay = o;
    return o.firstChild as HTMLElement;
  }
  private closeOverlay(): void {
    this.overlay?.remove();
    this.overlay = null;
  }

  private load(doc: Doc, savedId?: string): void {
    this.doc = doc;
    this.savedId = savedId;
    this.unsaved = false;
    this.undoStack.length = 0;
    this.redoStack.length = 0;
    (this.root.querySelector('#ed-name') as HTMLInputElement).value = doc.name;
    (this.root.querySelector('#ed-desc') as HTMLTextAreaElement).value = doc.description;
    (this.root.querySelector('#ed-biome') as HTMLSelectElement).value = doc.biome;
    this.dirtyTiles = true;
    this.buildTools();
    this.viewTouched = false;
    this.fitView();
    this.refreshInfo();
    this.scheduleCheck();
  }

  private showNew(): void {
    const p = this.openOverlay(`
      <h2>New Map</h2>
      <div class="ed-form">
        <label class="ed-field">Name <input id="ed-new-name" type="text" maxlength="40" value="New map"></label>
        <label class="ed-field">Size <select id="ed-new-size">${SIZES.map((s) => `<option value="${s}"${s === 112 ? ' selected' : ''}>${s} × ${s}</option>`).join('')}</select></label>
        <label class="ed-field">Setting <select id="ed-new-biome">${BIOMES.map((b) => `<option value="${b.id}">${b.name}</option>`).join('')}</select></label>
        <label class="ed-field">Start from <select id="ed-new-from"><option value="">Empty land</option>${MAP_PRESETS.map((m) => `<option value="${m.id}">${esc(m.name)} (copy)</option>`).join('')}</select></label>
        <div class="ed-note">${this.unsaved ? 'Your current map has unsaved changes. Save it first if you want to keep them.' : 'Built-in maps can be copied and changed freely.'}</div>
      </div>
      <div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn small" data-x="cancel">Cancel</button><button class="btn small primary" data-x="create">Create</button></div>`);
    p.querySelector('[data-x="cancel"]')!.addEventListener('click', () => this.closeOverlay());
    p.querySelector('[data-x="create"]')!.addEventListener('click', () => {
      const name = (p.querySelector('#ed-new-name') as HTMLInputElement).value.trim() || 'New map';
      const from = (p.querySelector('#ed-new-from') as HTMLSelectElement).value;
      let doc: Doc;
      if (from) {
        doc = Doc.from(presetMap(from));
        doc.name = name === 'New map' ? `${doc.name} (copy)` : name;
      } else {
        doc = Doc.blank(Number((p.querySelector('#ed-new-size') as HTMLSelectElement).value), (p.querySelector('#ed-new-biome') as HTMLSelectElement).value as BiomeId, name);
      }
      this.closeOverlay();
      this.load(doc);
      this.message('New map created.', 'good');
    });
  }

  private showOpen(): void {
    const list = listSavedMaps();
    const p = this.openOverlay(`
      <h2>Open Map</h2>
      ${list.length ? '' : '<p class="ed-note">No saved maps yet. Maps you save appear here and in the Skirmish map list.</p>'}
      <div class="ed-list">${list
        .map(
          (m) => `<div class="ed-item" data-id="${esc(m.id)}"><div><b>${esc(m.name)}</b><span>${m.size} × ${m.size} · ${m.players} player${m.players === 1 ? '' : 's'} · ${new Date(m.savedAt).toLocaleString()}</span></div><button class="btn small" data-open="${esc(m.id)}">Open</button><button class="btn small" data-del="${esc(m.id)}">Delete</button></div>`,
        )
        .join('')}</div>
      <div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn small" data-x="close">Close</button></div>`, true);
    p.querySelector('[data-x="close"]')!.addEventListener('click', () => this.closeOverlay());
    p.addEventListener('click', (ev) => {
      const t = ev.target as HTMLElement;
      const openId = t.getAttribute('data-open');
      const delId = t.getAttribute('data-del');
      if (openId) {
        const m = listSavedMaps().find((x) => x.id === openId);
        if (!m) return;
        try {
          const doc = Doc.from(decodeMap(m.text));
          this.closeOverlay();
          this.load(doc, m.id);
          this.message(`Opened "${doc.name}".`, 'good');
        } catch (err) {
          this.message((err as Error).message, 'error');
        }
      } else if (delId) {
        const row = t.closest('.ed-item') as HTMLElement;
        if (t.dataset.confirm !== '1') {
          t.dataset.confirm = '1';
          t.textContent = 'Confirm delete';
          return;
        }
        try {
          deleteSavedMap(delId);
          if (this.savedId === delId) this.savedId = undefined;
          row.remove();
          this.refreshInfo();
        } catch (err) {
          this.message((err as Error).message, 'error');
        }
      }
    });
  }

  private save(): void {
    const name = this.doc.name.trim();
    if (!name) {
      this.message('Give the map a name before saving.', 'error');
      return;
    }
    try {
      // a new name saves as a new map; the same name overwrites
      const existing = this.savedId && listSavedMaps().find((m) => m.id === this.savedId);
      const id = existing && existing.name === name ? this.savedId : undefined;
      this.savedId = saveMap(this.doc.toMapData(), id);
      this.unsaved = false;
      this.refreshInfo();
      this.message(`Saved "${name}". It is now listed in Skirmish.`, 'good');
    } catch (err) {
      this.message((err as Error).message, 'error');
    }
  }

  private showShare(): void {
    const text = encodeMap(this.doc.toMapData());
    const p = this.openOverlay(`
      <h2>Export / Import</h2>
      <p class="ed-note">Copy this text to share the map or keep a backup. To import a map, paste its text here and choose Import.</p>
      <textarea id="ed-share" class="ed-share" spellcheck="false"></textarea>
      <div id="ed-share-msg" class="ed-note"></div>
      <div class="row" style="justify-content:flex-end;margin-top:10px;gap:6px"><button class="btn small" data-x="copy">Copy</button><button class="btn small" data-x="import">Import</button><button class="btn small" data-x="close">Close</button></div>`, true);
    const ta = p.querySelector('#ed-share') as HTMLTextAreaElement;
    const msg = p.querySelector('#ed-share-msg') as HTMLElement;
    ta.value = text;
    p.querySelector('[data-x="close"]')!.addEventListener('click', () => this.closeOverlay());
    p.querySelector('[data-x="copy"]')!.addEventListener('click', () => {
      const fallback = () => {
        ta.focus();
        ta.select();
        msg.textContent = 'Press Ctrl+C (or Cmd+C) to copy the selected text.';
      };
      try {
        void navigator.clipboard
          .writeText(ta.value)
          .then(() => (msg.textContent = 'Copied to the clipboard.'))
          .catch(fallback);
      } catch {
        fallback();
      }
    });
    p.querySelector('[data-x="import"]')!.addEventListener('click', () => {
      try {
        const doc = Doc.from(decodeMap(ta.value.trim()));
        this.closeOverlay();
        this.load(doc);
        this.unsaved = true;
        this.refreshInfo();
        this.message(`Imported "${doc.name}". Save it to add it to your maps.`, 'good');
      } catch (err) {
        msg.textContent = (err as Error).message;
        msg.className = 'ed-note ed-err';
      }
    });
  }

  private test(): void {
    const data = this.doc.toMapData();
    const { errors } = checkMap(data);
    if (errors.length) {
      this.scheduleCheck();
      this.message(errors[0], 'error');
      return;
    }
    this.cb.onTest(data, this.testFaction);
  }

  private exit(): void {
    if (this.unsaved) {
      const p = this.openOverlay(`<h2>Leave the Editor?</h2><p class="ed-note">This map has unsaved changes.</p>
        <div class="row" style="justify-content:flex-end;gap:6px"><button class="btn small" data-x="stay">Keep editing</button><button class="btn small" data-x="save">Save and leave</button><button class="btn small" data-x="leave">Leave without saving</button></div>`);
      p.querySelector('[data-x="stay"]')!.addEventListener('click', () => this.closeOverlay());
      p.querySelector('[data-x="save"]')!.addEventListener('click', () => {
        this.closeOverlay();
        this.save();
        if (!this.unsaved) this.cb.onExit();
      });
      p.querySelector('[data-x="leave"]')!.addEventListener('click', () => this.cb.onExit());
      return;
    }
    this.cb.onExit();
  }

  /** Current document as game map data (used to come back after a test game). */
  current(): { map: MapData; savedId?: string; unsaved: boolean } {
    return { map: this.doc.toMapData(), savedId: this.savedId, unsaved: this.unsaved };
  }

  /** Restore the saved-state bookkeeping after returning from a test game. */
  restoreState(savedId: string | undefined, unsaved: boolean): void {
    this.savedId = savedId;
    this.unsaved = unsaved;
    this.refreshInfo();
  }
}

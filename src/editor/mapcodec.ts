import { DEFS } from '../data/registry';
import type { BiomeId, CampSpec, MapData, RampSpec } from '../sim/map';

// Compact, versioned text form of a map for local storage and copy/paste sharing.
// Tile layers are run-length encoded ("value*count,value,...").

const BIOMES: BiomeId[] = ['temperate', 'winter', 'badlands', 'marsh', 'ashen'];
const DIFFS: CampSpec['difficulty'][] = ['green', 'orange', 'red', 'boss'];
const DIRS: RampSpec['dir'][] = ['n', 's', 'e', 'w'];
export const MIN_MAP_SIZE = 48;
export const MAX_MAP_SIZE = 192;

function rle(a: ArrayLike<number>): string {
  const out: string[] = [];
  let i = 0;
  while (i < a.length) {
    const v = a[i];
    let n = 1;
    while (i + n < a.length && a[i + n] === v) n++;
    out.push(n > 1 ? `${v}*${n}` : String(v));
    i += n;
  }
  return out.join(',');
}

function unrle(s: string, n: number, max: number, what: string): number[] {
  const out: number[] = [];
  if (typeof s !== 'string') throw new Error(`The ${what} layer is missing.`);
  for (const part of s.split(',')) {
    if (!part) continue;
    const [v, c] = part.split('*');
    const value = Number(v);
    const count = c === undefined ? 1 : Number(c);
    if (!Number.isInteger(value) || value < 0 || value > max || !Number.isInteger(count) || count < 1 || out.length + count > n) throw new Error(`The ${what} layer is damaged.`);
    for (let k = 0; k < count; k++) out.push(value);
  }
  if (out.length !== n) throw new Error(`The ${what} layer has the wrong size.`);
  return out;
}

export function encodeMap(m: MapData): string {
  return JSON.stringify({
    format: 'opuscraft-map',
    v: 1,
    name: m.name,
    description: m.description,
    w: m.w,
    h: m.h,
    biome: m.biome,
    seed: m.seed,
    terrain: rle(m.terrain),
    level: rle(m.level),
    water: rle(m.water),
    ramps: m.ramps.map((r) => [r.x0, r.y0, r.x1, r.y1, r.dir, r.low, r.high]),
    trees: m.trees.flat(),
    mines: m.mines.map((x) => [x.x, x.y, x.gold]),
    starts: m.starts.map((s) => [s.x, s.y]),
    camps: m.camps.map((c) => [c.x, c.y, c.difficulty, c.drop, c.creeps.join(' ')]),
    neutrals: m.neutrals.map((n) => [n.type, n.x, n.y]),
  });
}

const num = (v: unknown, lo: number, hi: number): number => {
  const n = Number(v);
  if (!Number.isFinite(n) || n < lo || n > hi) throw new Error('The map contains an out-of-range value.');
  return n;
};

/** Parse a map from its text form. Throws an Error with a readable message when the text is not a valid map. */
export function decodeMap(text: string): MapData {
  let o: Record<string, unknown>;
  try {
    o = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error('This text is not an Opuscraft map. Paste the full text exported from the editor.');
  }
  if (!o || o.format !== 'opuscraft-map') throw new Error('This text is not an Opuscraft map. Paste the full text exported from the editor.');
  if (o.v !== 1) throw new Error('This map was saved by a newer version of Opuscraft.');
  const w = num(o.w, MIN_MAP_SIZE, MAX_MAP_SIZE);
  const h = num(o.h, MIN_MAP_SIZE, MAX_MAP_SIZE);
  if (!Number.isInteger(w) || !Number.isInteger(h)) throw new Error('The map size is invalid.');
  const n = w * h;
  const biome = BIOMES.includes(o.biome as BiomeId) ? (o.biome as BiomeId) : 'temperate';
  const arr = (k: string): unknown[] => (Array.isArray(o[k]) ? (o[k] as unknown[]) : []);
  const ramps: RampSpec[] = arr('ramps').map((r) => {
    const a = r as unknown[];
    const dir = DIRS.includes(a[4] as RampSpec['dir']) ? (a[4] as RampSpec['dir']) : 'n';
    return { x0: num(a[0], 0, w - 1), y0: num(a[1], 0, h - 1), x1: num(a[2], 0, w - 1), y1: num(a[3], 0, h - 1), dir, low: num(a[5], 0, 3), high: num(a[6], 0, 3) };
  });
  const flat = arr('trees');
  const trees: [number, number, number][] = [];
  for (let i = 0; i + 2 < flat.length; i += 3) trees.push([num(flat[i], 0, w - 1), num(flat[i + 1], 0, h - 1), num(flat[i + 2], 0, 15)]);
  const mines = arr('mines').map((m) => {
    const a = m as unknown[];
    return { x: num(a[0], 0, w), y: num(a[1], 0, h), gold: num(a[2], 0, 1e6) };
  });
  const starts = arr('starts')
    .slice(0, 4)
    .map((s) => {
      const a = s as unknown[];
      return { x: num(a[0], 0, w), y: num(a[1], 0, h) };
    });
  const camps: CampSpec[] = arr('camps').map((c) => {
    const a = c as unknown[];
    const creeps = String(a[4] ?? '')
      .split(' ')
      .filter((id) => DEFS[id] && DEFS[id].kind === 'unit');
    return { x: num(a[0], 0, w), y: num(a[1], 0, h), difficulty: DIFFS.includes(a[2] as CampSpec['difficulty']) ? (a[2] as CampSpec['difficulty']) : 'green', drop: num(a[3], 0, 6), creeps };
  }).filter((c) => c.creeps.length > 0);
  const neutrals = arr('neutrals')
    .map((x) => {
      const a = x as unknown[];
      return { type: String(a[0]), x: num(a[1], 0, w), y: num(a[2], 0, h) };
    })
    .filter((x) => DEFS[x.type] && DEFS[x.type].kind === 'building' && DEFS[x.type].faction === 'neutral');
  return {
    name: String(o.name ?? 'Untitled map').slice(0, 40) || 'Untitled map',
    description: String(o.description ?? '').slice(0, 200),
    w,
    h,
    biome,
    maxPlayers: starts.length,
    seed: Number.isFinite(Number(o.seed)) ? Number(o.seed) : 1,
    terrain: unrle(o.terrain as string, n, 7, 'terrain'),
    level: unrle(o.level as string, n, 3, 'cliff level'),
    water: unrle(o.water as string, n, 2, 'water'),
    ramps,
    trees,
    mines,
    starts,
    camps,
    neutrals,
  };
}

// ---------------------------------------------------------------------------
// saved maps in this browser
// ---------------------------------------------------------------------------
const KEY = 'opuscraft.maps.v1';

export interface SavedMap {
  id: string;
  name: string;
  players: number;
  size: number;
  savedAt: number;
  text: string;
}

export function listSavedMaps(): SavedMap[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const list = JSON.parse(raw) as SavedMap[];
    return Array.isArray(list) ? list.filter((m) => m && typeof m.text === 'string').sort((a, b) => b.savedAt - a.savedAt) : [];
  } catch {
    return [];
  }
}

function writeList(list: SavedMap[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    throw new Error('The browser did not allow the map to be saved. Free some space by deleting old maps, or export the map as text instead.');
  }
}

/** Save (or overwrite by id) a map; returns its id. */
export function saveMap(m: MapData, id?: string): string {
  const list = listSavedMaps();
  const key = id && list.some((x) => x.id === id) ? id : 'map' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
  const entry: SavedMap = { id: key, name: m.name, players: m.starts.length, size: m.w, savedAt: Date.now(), text: encodeMap(m) };
  writeList([entry, ...list.filter((x) => x.id !== key)]);
  return key;
}

export function deleteSavedMap(id: string): void {
  writeList(listSavedMaps().filter((x) => x.id !== id));
}

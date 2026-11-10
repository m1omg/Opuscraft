import { DEFS, FACTIONS, getDef } from '../data/registry';
import {
  CORPSE_TIME,
  DAY_LENGTH,
  DAY_START,
  DT,
  EXPANSION_MINE_GOLD,
  MAX_FOOD,
  NIGHT_START,
  START_GOLD,
  START_LUMBER,
  START_TIME_OF_DAY,
} from '../data/rules';
import type { EntityDef, FactionId } from '../data/types';
import { dist, distToRect } from '../util/math';
import { RNG } from '../util/rng';
import { applyCommand } from './commands';
import { Entity } from './entity';
import type { Command, GameEvent } from './events';
import { BLOCK_BUILDING, GameMap, type MapData } from './map';
import { Pathfinder } from './path';
import { Player, PLAYER_COLORS, NEUTRAL_COLOR, type Difficulty } from './player';
import { SpatialHash } from './spatial';
import { updateUnit, resolveCollisions } from './orders';
import { updateBuilding } from './economy';
import { updateProjectiles, type Projectile } from './combat';
import { updateBuffsAndRegen, updateAuras, initAbilities, recomputeStats, autocastTick, type Zone, type Reveal, type Timer } from './abilities';
import { updateVision } from './vision';
import { updateCreeps, type Camp } from './creeps';
import { initHero } from './heroes';

export interface PlayerSetup {
  name: string;
  faction: FactionId;
  color: number; // index into PLAYER_COLORS
  team: number;
  ai: boolean;
  difficulty: Difficulty;
  start: number; // start location index
}

export interface WorldScript {
  init?(w: World): void;
  tick?(w: World): void;
  onDeath?(w: World, e: Entity, killer: Entity | undefined): void;
  /** return true if the script fully handles victory/defeat */
  customVictory?: boolean;
}

export interface GameSetup {
  map: MapData;
  players: PlayerSetup[];
  seed: number;
  fog?: boolean;
  startGold?: number;
  startLumber?: number;
  script?: WorldScript;
  /** skip spawning start bases (campaign maps place their own) */
  noStartBases?: boolean;
  noCreeps?: boolean;
}

export class World {
  readonly setup: GameSetup;
  map: GameMap;
  path: Pathfinder;
  spatial: SpatialHash;
  rng: RNG;
  players: Player[] = [];
  entities: Entity[] = [];
  byId = new Map<number, Entity>();
  nextId = 1;
  tick = 0;
  time = 0;
  tod = START_TIME_OF_DAY;
  night = false;
  forcedDay = 0;
  forcedNight = 0;
  projectiles: Projectile[] = [];
  zones: Zone[] = [];
  reveals: Reveal[] = [];
  timers: Timer[] = [];
  events: GameEvent[] = [];
  camps: Camp[] = [];
  pending: Command[] = [];
  hostileId: number;
  passiveId: number;
  groupCounter = 1;
  gameOver = false;
  winners: number[] = [];
  fog: boolean;
  script: WorldScript | null;
  /** last time a player was told about something (throttles messages) */
  private msgThrottle = new Map<string, number>();

  constructor(setup: GameSetup) {
    this.setup = setup;
    this.rng = new RNG(setup.seed);
    this.map = new GameMap(setup.map);
    this.path = new Pathfinder(this.map);
    this.spatial = new SpatialHash(this.map.w, this.map.h);
    this.fog = setup.fog !== false;
    this.script = setup.script ?? null;

    setup.players.forEach((ps, i) => {
      const p = new Player(i, ps.name, ps.faction, PLAYER_COLORS[ps.color % PLAYER_COLORS.length].hex, ps.team, ps.ai, ps.difficulty);
      p.gold = setup.startGold ?? START_GOLD;
      p.lumber = setup.startLumber ?? START_LUMBER;
      this.players.push(p);
    });
    this.hostileId = this.players.length;
    const hostile = new Player(this.hostileId, 'Creeps', 'crown', NEUTRAL_COLOR, 98, true, 'normal');
    hostile.isNeutral = true;
    this.players.push(hostile);
    this.passiveId = this.players.length;
    const passive = new Player(this.passiveId, 'Neutral', 'crown', 0xb0a080, 99, true, 'normal');
    passive.isNeutral = true;
    passive.passive = true;
    this.players.push(passive);

    // shared team vision buffers
    const n = this.map.w * this.map.h;
    const teamBufs = new Map<number, { v: Uint8Array; e: Uint8Array; d: Uint8Array }>();
    for (const p of this.players) {
      let tb = teamBufs.get(p.team);
      if (!tb) {
        tb = { v: new Uint8Array(n), e: new Uint8Array(n), d: new Uint8Array(n) };
        teamBufs.set(p.team, tb);
      }
      p.visible = tb.v;
      p.explored = tb.e;
      p.detect = tb.d;
    }
    this.init();
  }

  private init(): void {
    const data = this.setup.map;
    for (const m of data.mines) {
      const mine = this.spawnBuilding('goldmine', this.passiveId, Math.round(m.x - 1.5), Math.round(m.y - 1.5), true);
      if (mine && mine.b) mine.b.gold = m.gold || EXPANSION_MINE_GOLD;
    }
    for (const nb of data.neutrals) {
      const d = DEFS[nb.type];
      if (!d) continue;
      const s = d.size ?? 2;
      this.spawnBuilding(nb.type, this.passiveId, Math.round(nb.x - s / 2), Math.round(nb.y - s / 2), true);
    }
    if (!this.setup.noCreeps) {
      data.camps.forEach((c) => this.spawnCamp(c.x, c.y, c.creeps, c.drop, c.difficulty));
    }
    if (!this.setup.noStartBases) {
      this.setup.players.forEach((ps, i) => {
        const st = data.starts[ps.start % data.starts.length];
        this.spawnStartBase(this.players[i], st.x, st.y);
      });
    }
    this.updateBookkeeping();
    updateVision(this, true);
    this.script?.init?.(this);
  }

  spawnCamp(x: number, y: number, creeps: string[], drop: number, difficulty: Camp['difficulty']): Camp {
    const camp: Camp = { id: this.camps.length, x, y, members: [], drop, difficulty, cleared: false, aggro: 0, sleeping: false };
    this.camps.push(camp);
    const n = creeps.length;
    creeps.forEach((cid, k) => {
      const ang = (k / Math.max(1, n)) * Math.PI * 2 + 0.6;
      const r = n === 1 ? 0 : 1.1 + (k % 2) * 0.4;
      const p = this.map.nearestPassable(x + Math.cos(ang) * r, y + Math.sin(ang) * r, false, 6) ?? [x, y];
      const e = this.spawnUnit(cid, this.hostileId, p[0], p[1]);
      e.campId = camp.id;
      e.homeX = e.x;
      e.homeY = e.y;
      e.facing = Math.atan2(y - e.y, x - e.x) + Math.PI;
      camp.members.push(e.id);
    });
    return camp;
  }

  spawnStartBase(p: Player, x: number, y: number): void {
    const f = FACTIONS[p.faction];
    p.startX = x;
    p.startY = y;
    const hallDef = getDef(f.hall);
    const s = hallDef.size ?? 4;
    const hall = this.spawnBuilding(f.hall, p.id, Math.round(x - s / 2), Math.round(y - s / 2), true);
    if (!hall) return;
    // nearest mine
    let mine: Entity | null = null;
    let md = Infinity;
    for (const e of this.entities)
      if (e.def.goldMine && e.alive) {
        const d = dist(e.x, e.y, x, y);
        if (d < md) {
          md = d;
          mine = e;
        }
      }
    if (mine && mine.b && md < 16) {
      if (p.faction === 'sepulchral' && f.goldStructure) {
        const lode = this.spawnBuilding(f.goldStructure, p.id, mine.b.tx, mine.b.ty, true, mine);
        void lode;
      } else if (p.faction === 'twilight') {
        mine.b.boundBy = hall.id;
      }
    }
    const towardX = mine ? mine.x : x + 4;
    const towardY = mine ? mine.y : y + 4;
    for (const su of f.startUnits) {
      for (let k = 0; k < su.count; k++) {
        const pos = this.findSpawnPos(hall, towardX, towardY, getDef(su.id).radius ?? 0.35);
        const u = this.spawnUnit(su.id, p.id, pos[0], pos[1]);
        u.facing = Math.atan2(towardY - u.y, towardX - u.x);
        if (u.isWorker && mine && md < 16) {
          const target = p.faction === 'sepulchral' && mine.b && mine.b.cursedBy >= 0 ? mine.b.cursedBy : mine.id;
          if (getDef(su.id).tags?.worker && (p.faction !== 'sepulchral' || su.id === f.worker)) u.order = { type: 'gather', target };
        }
      }
    }
    if (p.faction === 'sepulchral' && f.goldStructure) {
      // blight around the start
      this.map.addBlight(x, y, 9);
    }
  }

  // ---------------------------------------------------------------------------
  // entity management
  // ---------------------------------------------------------------------------
  spawnUnit(defId: string, owner: number, x: number, y: number, facing?: number): Entity {
    const def = getDef(defId);
    const e = new Entity(this.nextId++, def, owner, x, y);
    if (facing !== undefined) e.facing = e.pfacing = facing;
    e.spawnTime = this.time;
    if (def.hero) initHero(this, e);
    initAbilities(this, e);
    recomputeStats(this, e);
    e.hp = e.st.maxHp;
    e.mana = def.hero ? e.st.maxMana : Math.min(e.st.maxMana, (def.mana ?? 0) > 0 ? Math.round(e.st.maxMana * 0.5) : 0);
    if (def.air) e.z = def.flyHeight ?? 2.6;
    this.entities.push(e);
    this.byId.set(e.id, e);
    this.emit({ t: 'spawn', id: e.id });
    return e;
  }

  /** Create a building with its footprint origin at (tx, ty). Returns null if blocked. */
  spawnBuilding(defId: string, owner: number, tx: number, ty: number, constructed: boolean, onMine?: Entity): Entity | null {
    const def = getDef(defId);
    const size = def.size ?? 2;
    const cx = tx + size / 2;
    const cy = ty + size / 2;
    const e = new Entity(this.nextId++, def, owner, cx, cy);
    e.facing = e.pfacing = Math.PI / 2;
    e.spawnTime = this.time;
    e.b = {
      tx,
      ty,
      size,
      constructing: !constructed,
      progress: constructed ? 1 : 0,
      builders: [],
      queue: [],
      rallyX: cx,
      rallyY: cy + size / 2 + 2,
      rallyTarget: -1,
      rallyTree: -1,
      hasRally: false,
      gold: def.goldAmount ?? 0,
      inside: -1,
      miners: [],
      cursedBy: -1,
      boundBy: -1,
      mine: -1,
      garrison: [],
      pool: def.fountain?.pool ?? 0,
      stock: {},
      insideBuilder: -1,
      paidGold: def.cost.gold,
      paidLumber: def.cost.lumber,
    };
    if (def.shopItems) {
      for (const it of def.shopItems) e.b.stock[it] = { count: 2, restock: 0 };
    }
    if (onMine && onMine.b) {
      // lode replaces the mine footprint
      e.b.mine = onMine.id;
      onMine.b.cursedBy = e.id;
      onMine.inside = e.id; // hide the mine under the lode
    } else {
      this.map.setBlocked(tx, ty, size, size, BLOCK_BUILDING, true);
    }
    initAbilities(this, e);
    recomputeStats(this, e);
    e.hp = constructed ? e.st.maxHp : Math.max(1, Math.round(e.st.maxHp * 0.1));
    e.mana = Math.round(e.st.maxMana * 0.5);
    this.entities.push(e);
    this.byId.set(e.id, e);
    if (def.blightRadius && constructed) this.map.addBlight(cx, cy, def.blightRadius);
    this.emit({ t: 'spawn', id: e.id });
    return e;
  }

  /** Remove an entity from the world entirely (no death processing). */
  removeEntity(e: Entity): void {
    if (e.removed) return;
    if (e.b && e.alive) this.releaseFootprint(e);
    e.alive = false;
    e.removed = true;
  }

  releaseFootprint(e: Entity): void {
    if (!e.b) return;
    if (e.b.mine >= 0) {
      const mine = this.byId.get(e.b.mine);
      if (mine && mine.b) {
        mine.b.cursedBy = -1;
        mine.inside = -1;
      }
      return;
    }
    if (e.def.goldMine) {
      // never blocks again
    }
    this.map.setBlocked(e.b.tx, e.b.ty, e.b.size, e.b.size, BLOCK_BUILDING, false);
  }

  get(id: number): Entity | undefined {
    return this.byId.get(id);
  }
  /** Living, on-map entity or null. */
  valid(id: number): Entity | null {
    if (id < 0) return null;
    const e = this.byId.get(id);
    return e && e.alive && !e.removed ? e : null;
  }
  player(id: number): Player {
    return this.players[id];
  }

  isEnemy(a: number, b: number): boolean {
    if (a === b) return false;
    const pa = this.players[a];
    const pb = this.players[b];
    if (!pa || !pb) return false;
    if (pa.passive || pb.passive) return false;
    return pa.team !== pb.team;
  }
  isAlly(a: number, b: number): boolean {
    if (a === b) return true;
    const pa = this.players[a];
    const pb = this.players[b];
    if (!pa || !pb) return false;
    if (pa.isNeutral || pb.isNeutral) return false;
    return pa.team === pb.team;
  }

  emit(ev: GameEvent): void {
    this.events.push(ev);
  }

  msg(owner: number, text: string, kind: 'error' | 'info' | 'good' = 'error'): void {
    const key = owner + '|' + text;
    const last = this.msgThrottle.get(key) ?? -10;
    if (this.time - last < 1.2) return;
    this.msgThrottle.set(key, this.time);
    this.emit({ t: 'msg', owner, text, kind });
  }

  issue(cmd: Command): void {
    this.pending.push(cmd);
  }

  /** Units/buildings near a point (fresh array). */
  query(x: number, y: number, r: number, filter?: (e: Entity) => boolean): Entity[] {
    const tmp: Entity[] = [];
    this.spatial.query(x, y, r, tmp);
    const out: Entity[] = [];
    for (const e of tmp) {
      if (!e.alive || e.removed || e.inside >= 0) continue;
      const d = e.b ? distToRect(x, y, e.b.tx, e.b.ty, e.b.tx + e.b.size, e.b.ty + e.b.size) : dist(x, y, e.x, e.y) - e.radius;
      if (d > r) continue;
      if (filter && !filter(e)) continue;
      out.push(e);
    }
    return out;
  }

  /** Edge-to-edge distance between two entities. */
  gap(a: Entity, b: Entity): number {
    if (b.b) return distToRect(a.x, a.y, b.b.tx, b.b.ty, b.b.tx + b.b.size, b.b.ty + b.b.size) - (a.b ? a.radius : a.radius);
    if (a.b) return distToRect(b.x, b.y, a.b.tx, a.b.ty, a.b.tx + a.b.size, a.b.ty + a.b.size) - b.radius;
    return dist(a.x, a.y, b.x, b.y) - a.radius - b.radius;
  }

  tileVisible(pid: number, x: number, y: number): boolean {
    if (!this.fog) return true;
    const p = this.players[pid];
    if (!p || p.revealAll) return true;
    const tx = Math.floor(x);
    const ty = Math.floor(y);
    if (!this.map.inBounds(tx, ty)) return false;
    return p.visible[ty * this.map.w + tx] > 0;
  }

  /** Can player `pid` currently see entity `e` (fog + invisibility)? */
  canSee(pid: number, e: Entity): boolean {
    if (e.owner === pid) return true;
    const p = this.players[pid];
    if (!p) return false;
    if (this.isAlly(pid, e.owner)) return true;
    if (e.inside >= 0) return false;
    if (e.st.invisible && !e.st.revealed) {
      const tx = Math.floor(e.x);
      const ty = Math.floor(e.y);
      if (!this.map.inBounds(tx, ty) || p.detect[ty * this.map.w + tx] === 0) return false;
    }
    if (!this.fog || p.revealAll) return true;
    if (e.b) {
      // any footprint tile visible
      const b = e.b;
      for (let y = b.ty; y < b.ty + b.size; y++)
        for (let x = b.tx; x < b.tx + b.size; x++) if (this.map.inBounds(x, y) && p.visible[y * this.map.w + x]) return true;
      return false;
    }
    return this.tileVisible(pid, e.x, e.y);
  }

  // ---------------------------------------------------------------------------
  // placement helpers
  // ---------------------------------------------------------------------------
  /** Returns null if the building can be placed, otherwise a reason. */
  placementError(defId: string, tx: number, ty: number, owner: number, ignoreUnits: number[] = []): string | null {
    const def = getDef(defId);
    const size = def.size ?? 2;
    if (def.onMine) {
      const mine = this.mineAt(tx + size / 2, ty + size / 2);
      if (!mine || !mine.b || mine.b.tx !== tx || mine.b.ty !== ty) return 'Must be placed on a gold mine';
      if (mine.b.cursedBy >= 0) return 'This mine is already claimed';
      return null;
    }
    if (tx < 1 || ty < 1 || tx + size > this.map.w - 1 || ty + size > this.map.h - 1) return 'Cannot build there';
    let blighted = 0;
    for (let y = ty; y < ty + size; y++)
      for (let x = tx; x < tx + size; x++) {
        if (!this.map.buildable(x, y)) return 'Cannot build there';
        if (this.map.hasBlight(x, y)) blighted++;
      }
    if (def.needsBlight && blighted < size * size) return 'Must be built on blight';
    if (def.mainHall) {
      // halls may not be crammed against gold mines
      for (const e of this.entities) {
        if (!e.alive || !e.def.goldMine || !e.b) continue;
        const gx = Math.max(0, Math.max(e.b.tx - (tx + size), tx - (e.b.tx + e.b.size)));
        const gy = Math.max(0, Math.max(e.b.ty - (ty + size), ty - (e.b.ty + e.b.size)));
        if (Math.max(gx, gy) < 3) return 'Too close to a gold mine';
      }
    }
    // enemy / immovable units in the way
    const cx = tx + size / 2;
    const cy = ty + size / 2;
    for (const e of this.query(cx, cy, size)) {
      if (!e.isUnit || e.isAir) continue;
      if (ignoreUnits.includes(e.id)) continue;
      const d = distToRect(e.x, e.y, tx, ty, tx + size, ty + size);
      if (d < e.radius * 0.6) {
        if (e.owner !== owner && !this.isAlly(owner, e.owner)) return 'Something is in the way';
      }
    }
    return null;
  }

  mineAt(x: number, y: number): Entity | null {
    for (const e of this.entities) {
      if (!e.alive || !e.def.goldMine || !e.b) continue;
      const b = e.b;
      if (x >= b.tx && x <= b.tx + b.size && y >= b.ty && y <= b.ty + b.size) return e;
    }
    return null;
  }

  /** Find a free spot next to a building's footprint, preferring the side facing (towardX, towardY). */
  findSpawnPos(b: Entity, towardX: number, towardY: number, radius: number): [number, number] {
    const bs = b.b!;
    const large = radius > 0.55;
    let best: [number, number] | null = null;
    let bestD = Infinity;
    for (let ring = 0; ring < 4; ring++) {
      const x0 = bs.tx - 1 - ring;
      const y0 = bs.ty - 1 - ring;
      const x1 = bs.tx + bs.size + ring;
      const y1 = bs.ty + bs.size + ring;
      for (let y = y0; y <= y1; y++)
        for (let x = x0; x <= x1; x++) {
          if (x !== x0 && x !== x1 && y !== y0 && y !== y1) continue;
          if (!this.map.passable(x, y, large)) continue;
          const px = x + 0.5;
          const py = y + 0.5;
          let crowd = 0;
          for (const o of this.entities) {
            if (o.isUnit && o.alive && o.inside < 0 && !o.isAir && Math.abs(o.x - px) < 0.7 && Math.abs(o.y - py) < 0.7) crowd++;
          }
          const d = dist(px, py, towardX, towardY) + crowd * 3;
          if (d < bestD) {
            bestD = d;
            best = [px, py];
          }
        }
      if (best) return best;
    }
    return [b.x, b.y + bs.size / 2 + 0.6];
  }

  // ---------------------------------------------------------------------------
  // main loop
  // ---------------------------------------------------------------------------
  step(): void {
    if (this.gameOver && this.tick % 1 === 0) {
      // keep the world animating after the end, but stop gameplay logic for AI
    }
    this.tick++;
    this.time += DT;
    this.advanceClock();

    for (const e of this.entities) {
      e.px = e.x;
      e.py = e.y;
      e.pfacing = e.facing;
    }

    const cmds = this.pending;
    this.pending = [];
    for (const c of cmds) {
      try {
        applyCommand(this, c);
      } catch (err) {
        console.error('command failed', c, err);
      }
    }

    this.updateBookkeeping();
    this.spatial.rebuild(this.entities);
    this.path.nodesThisTick = 0;

    const list = this.entities;
    const n = list.length;
    // rotate the start index so path budget is shared fairly
    const offset = this.tick % Math.max(1, n);
    for (let k = 0; k < n; k++) {
      const e = list[(k + offset) % n];
      if (!e.alive || e.removed) continue;
      if (e.kind === 'unit') updateUnit(this, e);
      else if (e.kind === 'building') updateBuilding(this, e);
    }
    resolveCollisions(this);
    updateProjectiles(this);
    updateBuffsAndRegen(this);
    if (this.tick % 10 === 0) updateAuras(this);
    if (this.tick % 4 === 0) autocastTick(this);
    if (this.tick % 5 === 0) updateVision(this, false);
    if (this.tick % 5 === 2) updateCreeps(this);
    this.updateCorpses();
    if (this.tick % 20 === 7) this.checkVictory();
    this.script?.tick?.(this);
    if (this.tick % 100 === 0) this.compact();
  }

  private advanceClock(): void {
    if (this.forcedDay > 0) this.forcedDay -= DT;
    if (this.forcedNight > 0) this.forcedNight -= DT;
    this.tod = (this.tod + DT / DAY_LENGTH) % 1;
    const naturalNight = this.tod < DAY_START || this.tod >= NIGHT_START;
    const night = this.forcedDay > 0 ? false : this.forcedNight > 0 ? true : naturalNight;
    if (night !== this.night) {
      this.night = night;
      for (const e of this.entities) e.statsDirty = true;
    }
  }

  private updateCorpses(): void {
    for (const e of this.entities) {
      if (!e.dead || e.removed) continue;
      e.deathTime += DT;
      if (e.corpse) {
        e.corpseTimer -= DT;
        if (e.corpseTimer <= 0) {
          e.corpse = false;
          e.removed = true;
        }
      } else if (e.deathTime > (e.b ? 6 : e.hero ? 4 : 3)) {
        if (!e.hero) e.removed = true;
      }
    }
  }

  /** Make a dead unit leave a corpse that necromancy can use. */
  leaveCorpse(e: Entity): void {
    const t = e.def.tags;
    if (e.b || e.hero || t?.summoned || t?.mechanical || e.isAir) return;
    e.corpse = true;
    e.corpseTimer = CORPSE_TIME;
  }

  private compact(): void {
    if (this.entities.some((e) => e.removed)) {
      const keep: Entity[] = [];
      for (const e of this.entities) {
        if (e.removed && !e.hero) {
          this.byId.delete(e.id);
        } else keep.push(e);
      }
      this.entities = keep;
    }
  }

  updateBookkeeping(): void {
    for (const p of this.players) {
      p.foodUsed = 0;
      p.foodCap = 0;
      p.buildingCounts.clear();
      p.unitCounts.clear();
      p.heroesTrainingCount = 0;
    }
    let maxHall = new Map<number, number>();
    for (const e of this.entities) {
      if (!e.alive || e.removed) continue;
      const p = this.players[e.owner];
      if (!p) continue;
      const def = e.def;
      if (e.kind === 'unit') {
        p.foodUsed += def.cost.food ?? 0;
        p.unitCounts.set(def.id, (p.unitCounts.get(def.id) ?? 0) + 1);
      } else if (e.b) {
        if (!e.b.constructing) {
          p.foodCap += def.foodProvided ?? 0;
          p.buildingCounts.set(def.id, (p.buildingCounts.get(def.id) ?? 0) + 1);
          if (def.mainHall) maxHall.set(p.id, Math.max(maxHall.get(p.id) ?? 0, def.hallTier ?? 1));
        }
        for (const q of e.b.queue) {
          p.foodUsed += q.food;
          if (q.kind === 'unit' && DEFS[q.id]?.hero) p.heroesTrainingCount++;
        }
      }
    }
    // dead heroes waiting for revival still count their food? (no: food is freed while dead)
    for (const p of this.players) {
      p.foodCap = Math.min(MAX_FOOD, p.foodCap);
      p.tier = maxHall.get(p.id) ?? (p.tier > 0 ? 0 : 0);
      if (p.tier === 0 && !p.isNeutral) p.tier = 1;
    }
  }

  /** Count of completed buildings of a def or any of its upgrades (for requirements). */
  hasBuilding(pid: number, defId: string): boolean {
    const p = this.players[pid];
    if (defId === 'tier2') return p.tier >= 2;
    if (defId === 'tier3') return p.tier >= 3;
    if ((p.buildingCounts.get(defId) ?? 0) > 0) return true;
    // upgraded versions satisfy the requirement
    let d: EntityDef | undefined = DEFS[defId];
    let guard = 0;
    while (d && d.upgradesTo && guard++ < 4) {
      if ((p.buildingCounts.get(d.upgradesTo) ?? 0) > 0) return true;
      d = DEFS[d.upgradesTo];
    }
    if (DEFS[defId]?.upgradeOptions) {
      for (const o of DEFS[defId].upgradeOptions!) if ((p.buildingCounts.get(o) ?? 0) > 0) return true;
    }
    return false;
  }

  requirementsMet(pid: number, reqs: string[] | undefined): string | null {
    if (!reqs) return null;
    for (const r of reqs) {
      if (!this.hasBuilding(pid, r)) {
        if (r === 'tier2') return 'Requires ' + tierName(this.players[pid].faction, 2);
        if (r === 'tier3') return 'Requires ' + tierName(this.players[pid].faction, 3);
        return 'Requires ' + (DEFS[r]?.name ?? r);
      }
    }
    return null;
  }

  heroCount(pid: number): number {
    let n = 0;
    for (const e of this.entities) if (e.owner === pid && e.hero && !e.removed) n++;
    return n + this.players[pid].heroesTrainingCount;
  }

  private checkVictory(): void {
    if (this.gameOver) return;
    for (const p of this.players) {
      if (p.isNeutral || p.defeated) continue;
      let hasBuilding = false;
      for (const e of this.entities) {
        if (e.owner === p.id && e.alive && e.b && !e.removed) {
          hasBuilding = true;
          break;
        }
      }
      if (!hasBuilding && !this.script?.customVictory) {
        this.defeatPlayer(p.id);
      }
    }
    if (this.script?.customVictory) return;
    const aliveTeams = new Set<number>();
    for (const p of this.players) if (!p.isNeutral && !p.defeated) aliveTeams.add(p.team);
    if (aliveTeams.size <= 1) {
      const team = [...aliveTeams][0];
      this.endGame(this.players.filter((p) => !p.isNeutral && p.team === team).map((p) => p.id));
    }
  }

  defeatPlayer(pid: number): void {
    const p = this.players[pid];
    if (p.defeated) return;
    p.defeated = true;
    this.emit({ t: 'playerDefeated', owner: pid });
    // remaining units of a defeated player are destroyed
    for (const e of this.entities) {
      if (e.owner === pid && e.alive && e.kind === 'unit') {
        e.alive = false;
        e.dead = true;
        e.deathTime = 0;
        this.emit({ t: 'death', id: e.id, killer: -1 });
      }
    }
  }

  endGame(winners: number[]): void {
    if (this.gameOver) return;
    this.gameOver = true;
    this.winners = winners;
    for (const id of winners) this.players[id].victorious = true;
    this.emit({ t: 'gameOver', winners });
  }

  isNightNow(): boolean {
    return this.night;
  }

  /** Clock in hours 0..24 */
  get hours(): number {
    return this.tod * 24;
  }
}

export function tierName(faction: FactionId, tier: number): string {
  const f = FACTIONS[faction];
  if (!f) return 'Tier ' + tier;
  let d: EntityDef | undefined = DEFS[f.hall];
  let t = 1;
  while (d && t < tier && d.upgradesTo) {
    d = DEFS[d.upgradesTo];
    t++;
  }
  return d ? d.name : 'Tier ' + tier;
}

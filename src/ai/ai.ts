import { DEFS, FACTIONS, ITEMS, UPGRADES, getDef } from '../data/registry';
import type { EntityDef, FactionDef } from '../data/types';
import { dist, distToSegment } from '../util/math';
import { RNG } from '../util/rng';
import type { Entity } from '../sim/entity';
import type { Command } from '../sim/events';
import type { Player, Difficulty } from '../sim/player';
import type { World } from '../sim/world';
import { unitCastAI } from '../sim/tactics';
import { heroCost, heroHireError, learnError, reviveCostFor } from '../sim/heroes';
import { PLANS, type FactionPlan, type Step } from './plans';

interface DiffCfg {
  interval: number; // seconds between AI thinks
  maxWorkers: number;
  firstAttack: number; // seconds
  attackStrength: number; // army value needed for an attack
  creepFactor: number; // how strong a camp may be relative to the army
  expandAt: number; // seconds (Infinity = never)
  castChance: number;
  heroRetreat: number; // hp fraction
  focusFire: boolean;
  buyPotions: boolean;
  towers: number;
}

const CFG: Record<Difficulty, DiffCfg> = {
  easy: { interval: 1.2, maxWorkers: 11, firstAttack: 600, attackStrength: 3600, creepFactor: 0.45, expandAt: Infinity, castChance: 0.25, heroRetreat: 0, focusFire: false, buyPotions: false, towers: 0 },
  normal: { interval: 0.6, maxWorkers: 16, firstAttack: 400, attackStrength: 2600, creepFactor: 0.6, expandAt: 660, castChance: 0.7, heroRetreat: 0.25, focusFire: false, buyPotions: true, towers: 1 },
  hard: { interval: 0.35, maxWorkers: 20, firstAttack: 330, attackStrength: 2300, creepFactor: 0.75, expandAt: 480, castChance: 1, heroRetreat: 0.3, focusFire: true, buyPotions: true, towers: 2 },
};

type Mode = 'build' | 'creep' | 'gather' | 'attack' | 'retreat' | 'defend';

export class AIController {
  readonly w: World;
  readonly pid: number;
  readonly p: Player;
  readonly f: FactionDef;
  readonly plan: FactionPlan;
  readonly cfg: DiffCfg;
  private rng: RNG;
  private next = 0;
  private stepIdx = 0;
  private mode: Mode = 'build';
  private modeSince = 0;
  private target: { x: number; y: number } | null = null;
  private campTarget = -1;
  private lastAttackEnd = 0;
  private heroPrefs: string[];
  private homeX: number;
  private homeY: number;
  private stageX: number;
  private stageY: number;
  private expanding = false;
  private pendingBuilds = new Map<string, number>(); // def id -> time ordered
  private attackWave = 0;
  private thinkCount = 0;
  /** units reserved for lumber duty (sepulchral gravediggers) */
  private lumberCrew = new Set<number>();

  constructor(w: World, pid: number) {
    this.w = w;
    this.pid = pid;
    this.p = w.players[pid];
    this.f = FACTIONS[this.p.faction];
    this.plan = PLANS[this.p.faction];
    this.cfg = CFG[this.p.difficulty];
    this.rng = new RNG(w.setup.seed * 31 + pid * 7919);
    this.heroPrefs = [...this.plan.heroOrder];
    // vary the first hero a bit
    if (this.rng.chance(0.45)) {
      const k = this.rng.int(1, this.heroPrefs.length - 1);
      [this.heroPrefs[0], this.heroPrefs[k]] = [this.heroPrefs[k], this.heroPrefs[0]];
    }
    this.homeX = this.p.startX;
    this.homeY = this.p.startY;
    const cx = w.map.w / 2;
    const cy = w.map.h / 2;
    const d = dist(this.homeX, this.homeY, cx, cy) || 1;
    this.stageX = this.homeX + ((cx - this.homeX) / d) * 11;
    this.stageY = this.homeY + ((cy - this.homeY) / d) * 11;
    this.next = 1 + pid * 0.13;
  }

  private issue(c: Command): void {
    this.w.issue(c);
  }

  update(): void {
    const w = this.w;
    if (this.p.defeated || w.gameOver) return;
    if (w.time < this.next) return;
    this.next = w.time + this.cfg.interval;
    this.thinkCount++;
    try {
      this.think();
    } catch (err) {
      console.error('AI error', err);
    }
  }

  // ---------------------------------------------------------------------------
  private think(): void {
    const w = this.w;
    const mine = this.myEntities();
    const halls = mine.filter((e) => e.def.mainHall && e.b);
    if (halls.length) {
      const h = halls.find((x) => !x.b!.constructing) ?? halls[0];
      if (dist(h.x, h.y, this.homeX, this.homeY) > 30 && !halls.some((x) => dist(x.x, x.y, this.homeX, this.homeY) < 10)) {
        this.homeX = h.x;
        this.homeY = h.y;
      }
    }
    const workers = mine.filter((e) => e.isUnit && e.isWorker && !e.revertDef);
    this.updateLumberCrew(mine);
    const army = mine.filter(
      (e) => e.isUnit && !e.isWorker && !e.def.tags?.summoned && e.def.speed && e.def.speed > 0 && !e.def.rootTo && !this.lumberCrew.has(e.id),
    );
    const heroes = army.filter((e) => e.hero);

    this.manageHeroes(mine, heroes);
    this.manageEconomy(mine, workers, halls);
    this.manageBuildOrder(mine, workers);
    this.manageProduction(mine);
    this.manageArmy(mine, army, heroes);
    this.manageCasting(army);
  }

  private myEntities(): Entity[] {
    return this.w.entities.filter((e) => e.owner === this.pid && e.alive && !e.removed);
  }

  private count(mine: Entity[], defId: string): number {
    let n = 0;
    for (const e of mine) {
      if (e.def.id === defId) n++;
      else if (e.b) {
        // upgraded versions count
        let d: EntityDef | undefined = DEFS[defId];
        let g = 0;
        while (d && d.upgradesTo && g++ < 3) {
          if (e.def.id === d.upgradesTo) n++;
          d = DEFS[d.upgradesTo];
        }
        if (DEFS[defId]?.upgradeOptions?.includes(e.def.id)) n++;
      }
      if (e.b) for (const q of e.b.queue) if (q.id === defId && q.kind === 'unit') n++;
    }
    for (const e of mine) if (e.order?.type === 'build' && e.order.defId === defId && e.order.target === undefined) n++;
    return n;
  }

  // ---------------------------------------------------------------------------
  // economy
  // ---------------------------------------------------------------------------
  private manageEconomy(mine: Entity[], workers: Entity[], halls: Entity[]): void {
    const w = this.w;
    const plan = this.plan;
    const goldSources = this.goldSources(mine);
    const goldTarget = goldSources.length * plan.goldWorkersPerMine;
    const lumberTarget = plan.lumberUnit ? 0 : plan.lumberWorkers + (w.time > 600 ? 2 : 0);
    const wantWorkers = Math.min(this.cfg.maxWorkers, goldTarget + lumberTarget);
    // train workers
    const workerDef = getDef(this.f.worker);
    const queued = halls.reduce((n, h) => n + h.b!.queue.filter((q) => q.id === this.f.worker).length, 0);
    if (workers.length + queued < wantWorkers) {
      for (const h of halls) {
        if (h.b!.constructing || h.b!.queue.length >= 2) continue;
        if (h.b!.queue.some((q) => q.kind === 'upgrade')) continue;
        if (this.p.gold >= workerDef.cost.gold && this.foodFree() >= 1) {
          this.issue({ type: 'train', player: this.pid, building: h.id, unit: this.f.worker });
          break;
        }
      }
    }
    // assign idle workers
    let onGold = 0;
    let onLumber = 0;
    for (const u of workers) {
      const o = u.order;
      if (o?.type === 'gather' || o?.type === 'returnRes') {
        if (o.tree !== undefined && o.tree >= 0) onLumber++;
        else onGold++;
      } else if (u.inside >= 0 && w.get(u.inside)?.def.goldMine) onGold++;
    }
    const idle = workers.filter((u) => !u.order && u.inside < 0);
    for (const u of idle) {
      const canGold = !!u.def.harvest?.gold;
      const canLumber = !!u.def.harvest?.lumber;
      if (canGold && (onGold < goldTarget || !canLumber)) {
        const src = this.bestGoldSource(u, goldSources);
        if (src) {
          this.issue({ type: 'order', player: this.pid, units: [u.id], order: { type: 'gather', target: src.id } });
          onGold++;
          continue;
        }
      }
      if (canLumber) {
        const t = this.nextTree();
        if (t >= 0) {
          this.issue({ type: 'order', player: this.pid, units: [u.id], order: { type: 'gather', tree: t } });
          onLumber++;
        }
      }
    }
    // sepulchral: keep a crew of gravediggers on lumber
    if (plan.lumberUnit) {
      for (const id of this.lumberCrew) {
        const d = w.get(id)!;
        if (!d.order || (d.order.type !== 'gather' && d.order.type !== 'returnRes')) {
          const t = this.nextTree();
          if (t >= 0) this.issue({ type: 'order', player: this.pid, units: [d.id], order: { type: 'gather', tree: t } });
        }
      }
      if (this.lumberCrew.size < plan.lumberWorkers) {
        const barrow = mine.find((e) => e.def.id === 'sep_barrow' && !e.b!.constructing);
        const queued = barrow ? barrow.b!.queue.filter((q) => q.id === plan.lumberUnit).length : 0;
        if (barrow && queued === 0 && barrow.b!.queue.length < 2 && this.p.gold >= 120 && this.foodFree() >= 2) {
          this.issue({ type: 'train', player: this.pid, building: barrow.id, unit: plan.lumberUnit });
        }
      }
    }
    // food
    const free = this.foodFree();
    const farm = this.f.farm;
    const farmDef = getDef(farm);
    const producing = mine.filter((e) => e.b && (e.def.trains?.length ?? 0) > 0 && !e.b.constructing).length;
    const pendingFarms = mine.filter((e) => e.def.id === farm && e.b?.constructing).length + this.pendingCount(farm);
    if (this.p.foodCap < 100 && free < 3 + producing * 2 && pendingFarms === 0 && this.p.gold >= farmDef.cost.gold && this.p.lumber >= farmDef.cost.lumber) {
      this.build(farm, workers);
    }
    // expansion
    if (!this.expanding && w.time > this.cfg.expandAt) {
      const mainMineLow = goldSources.every((m) => this.mineGold(m) < 3000);
      if (mainMineLow || w.time > this.cfg.expandAt) this.tryExpand(mine, workers);
    }
  }

  /** Trees reachable on foot from the base, nearest first (cached for a few seconds). */
  private treeCache: { t: number; list: number[] } = { t: -100, list: [] };
  private nextTree(): number {
    const w = this.w;
    if (w.time - this.treeCache.t > 6 || !this.treeCache.list.length) {
      this.treeCache = { t: w.time, list: this.reachableTrees(this.homeX, this.homeY, 12) };
    }
    const list = this.treeCache.list;
    while (list.length) {
      const id = list[0];
      const tr = w.map.trees[id];
      if (tr && tr.alive) {
        // rotate so consecutive workers spread over several trees
        list.push(list.shift()!);
        return id;
      }
      list.shift();
    }
    return -1;
  }

  private reachableTrees(x: number, y: number, want: number): number[] {
    const map = this.w.map;
    const W = map.w;
    const seen = new Uint8Array(W * map.h);
    const sx = Math.floor(x);
    const sy = Math.floor(y);
    const start = map.nearestPassable(x, y, false, 8);
    const q: number[] = [];
    if (start) q.push(Math.floor(start[1]) * W + Math.floor(start[0]));
    else q.push(sy * W + sx);
    seen[q[0]] = 1;
    const found: number[] = [];
    let head = 0;
    while (head < q.length && found.length < want && head < 9000) {
      const c = q[head++];
      const cx = c % W;
      const cy = (c - cx) / W;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (!map.inBounds(nx, ny)) continue;
        const ni = ny * W + nx;
        if (seen[ni]) continue;
        seen[ni] = 1;
        const tid = map.treeAt[ni];
        if (tid >= 0 && map.trees[tid].alive) {
          found.push(tid);
          continue;
        }
        if (map.passable(nx, ny)) q.push(ni);
      }
    }
    return found;
  }

  private foodFree(): number {
    return this.p.foodCap - this.p.foodUsed;
  }

  private mineGold(m: Entity): number {
    if (m.def.goldMine) return m.b!.gold;
    const under = this.w.get(m.b!.mine);
    return under && under.b ? under.b.gold : 0;
  }

  /** Mines (or lodes) this player can currently harvest, near a completed hall. */
  private goldSources(mine: Entity[]): Entity[] {
    const w = this.w;
    const halls = mine.filter((e) => e.def.mainHall && e.b && !e.b.constructing);
    const out: Entity[] = [];
    if (this.p.faction === 'sepulchral') {
      for (const e of mine) if (e.def.onMine && e.b && !e.b.constructing) out.push(e);
      return out;
    }
    for (const m of w.entities) {
      if (!m.alive || !m.def.goldMine || !m.b || m.b.gold <= 0) continue;
      if (m.b.cursedBy >= 0) continue;
      if (this.p.faction === 'twilight') {
        const hall = w.valid(m.b.boundBy);
        if (!hall || hall.owner !== this.pid) continue;
        out.push(m);
        continue;
      }
      if (m.b.boundBy >= 0) continue;
      if (halls.some((h) => dist(h.x, h.y, m.x, m.y) < 12)) out.push(m);
    }
    return out;
  }

  private bestGoldSource(u: Entity, sources: Entity[]): Entity | null {
    let best: Entity | null = null;
    let bd = Infinity;
    for (const s of sources) {
      const load = s.b!.miners.length;
      if ((this.p.faction === 'sepulchral' || this.p.faction === 'twilight') && load >= 5) continue;
      const d = dist(u.x, u.y, s.x, s.y) + load * 2;
      if (d < bd) {
        bd = d;
        best = s;
      }
    }
    return best;
  }

  private pendingCount(defId: string): number {
    const t = this.pendingBuilds.get(defId);
    if (t === undefined) return 0;
    if (this.w.time - t > 25) {
      this.pendingBuilds.delete(defId);
      return 0;
    }
    return 1;
  }

  private updateLumberCrew(mine: Entity[]): void {
    const lu = this.plan.lumberUnit;
    if (!lu) return;
    for (const id of [...this.lumberCrew]) {
      const e = this.w.get(id);
      if (!e || !e.alive) this.lumberCrew.delete(id);
    }
    if (this.lumberCrew.size >= this.plan.lumberWorkers) return;
    const cands = mine
      .filter((e) => e.def.id === lu && !this.lumberCrew.has(e.id) && dist(e.x, e.y, this.homeX, this.homeY) < 30)
      .sort((a, b) => dist(a.x, a.y, this.homeX, this.homeY) - dist(b.x, b.y, this.homeX, this.homeY));
    for (const c of cands) {
      if (this.lumberCrew.size >= this.plan.lumberWorkers) break;
      this.lumberCrew.add(c.id);
    }
  }

  // ---------------------------------------------------------------------------
  // building placement
  // ---------------------------------------------------------------------------
  private build(defId: string, workers: Entity[], near?: { x: number; y: number }): boolean {
    const def = getDef(defId);
    if (this.w.requirementsMet(this.pid, def.requires)) return false;
    if (this.p.gold < def.cost.gold || this.p.lumber < def.cost.lumber) return false;
    const builder = this.pickBuilder(workers, def);
    if (!builder) return false;
    const spot = this.findSpot(defId, near ?? { x: this.homeX, y: this.homeY }, builder);
    if (!spot) return false;
    this.issue({ type: 'build', player: this.pid, units: [builder.id], defId, tx: spot[0], ty: spot[1] });
    this.pendingBuilds.set(defId, this.w.time);
    return true;
  }

  private pickBuilder(workers: Entity[], def: EntityDef): Entity | null {
    const cands = workers.filter((u) => u.def.faction === def.faction && u.inside < 0 && (!u.order || u.order.type === 'gather' || u.order.type === 'returnRes'));
    if (!cands.length) return null;
    // prefer lumber workers, then idle, then gold
    cands.sort((a, b) => this.builderScore(a) - this.builderScore(b));
    return cands[0];
  }
  private builderScore(u: Entity): number {
    if (!u.order) return 0;
    if (u.order.tree !== undefined) return 1;
    return 2 + (u.carry > 0 ? 1 : 0);
  }

  findSpot(defId: string, near: { x: number; y: number }, builder?: Entity): [number, number] | null {
    const w = this.w;
    const def = getDef(defId);
    const size = def.size ?? 2;
    if (def.onMine) {
      // cursed lode: any free mine near one of our halls
      for (const m of w.entities) {
        if (!m.alive || !m.def.goldMine || !m.b || m.b.cursedBy >= 0 || m.b.gold <= 0) continue;
        if (dist(m.x, m.y, near.x, near.y) > 16) continue;
        if (!w.placementError(defId, m.b.tx, m.b.ty, this.pid)) return [m.b.tx, m.b.ty];
      }
      return null;
    }
    // protect the hall-to-mine corridor
    const lanes: [number, number, number, number][] = [];
    for (const h of w.entities) {
      if (h.owner !== this.pid || !h.def.mainHall || !h.alive) continue;
      for (const m of w.entities) {
        if (!m.alive || !m.b || (!m.def.goldMine && !m.def.onMine)) continue;
        if (dist(h.x, h.y, m.x, m.y) < 14) lanes.push([h.x, h.y, m.x, m.y]);
      }
    }
    const isTower = !!def.weapon || defId === this.plan.tower;
    const minR = isTower ? 5 : def.mainHall ? 0 : 4;
    const ignore = builder ? [builder.id] : [];
    for (let r = minR; r < 24; r++) {
      const cands: [number, number][] = [];
      for (let a = 0; a < Math.max(8, r * 6); a++) {
        const ang = (a / Math.max(8, r * 6)) * Math.PI * 2 + this.rng.next() * 0.3;
        const cx = near.x + Math.cos(ang) * r;
        const cy = near.y + Math.sin(ang) * r;
        cands.push([Math.round(cx - size / 2), Math.round(cy - size / 2)]);
      }
      for (const [tx, ty] of cands) {
        if (w.placementError(defId, tx, ty, this.pid, ignore)) continue;
        const cx = tx + size / 2;
        const cy = ty + size / 2;
        if (lanes.some((l) => distToSegment(cx, cy, l[0], l[1], l[2], l[3]) < size / 2 + 2.2)) continue;
        // keep a one-tile ring free so we don't wall ourselves in
        if (!this.ringFree(tx, ty, size)) continue;
        return [tx, ty];
      }
    }
    return null;
  }

  private ringFree(tx: number, ty: number, size: number): boolean {
    const map = this.w.map;
    let blocked = 0;
    for (let x = tx - 1; x <= tx + size; x++) {
      if (!map.passable(x, ty - 1)) blocked++;
      if (!map.passable(x, ty + size)) blocked++;
    }
    for (let y = ty; y < ty + size; y++) {
      if (!map.passable(tx - 1, y)) blocked++;
      if (!map.passable(tx + size, y)) blocked++;
    }
    return blocked <= 2;
  }

  private tryExpand(mine: Entity[], workers: Entity[]): void {
    const w = this.w;
    let best: Entity | null = null;
    let bd = Infinity;
    for (const m of w.entities) {
      if (!m.alive || !m.def.goldMine || !m.b || m.b.gold < 2000 || m.b.cursedBy >= 0 || m.b.boundBy >= 0) continue;
      if (mine.some((h) => h.def.mainHall && dist(h.x, h.y, m.x, m.y) < 14)) continue;
      // avoid mines still guarded by creeps or near enemies
      const guarded = w.query(m.x, m.y, 7, (e) => e.owner === w.hostileId && e.isUnit).length > 0;
      if (guarded) continue;
      const enemyNear = w.entities.some((e) => e.alive && e.b && w.isEnemy(this.pid, e.owner) && !w.players[e.owner].isNeutral && dist(e.x, e.y, m.x, m.y) < 18);
      if (enemyNear) continue;
      const d = dist(m.x, m.y, this.homeX, this.homeY);
      if (d < bd) {
        bd = d;
        best = m;
      }
    }
    if (!best || bd > 60) return;
    const hallDef = getDef(this.f.hall);
    if (this.p.gold < hallDef.cost.gold || this.p.lumber < hallDef.cost.lumber) return;
    // ring of candidate spots at 3-4 tiles gap from the mine
    const size = hallDef.size ?? 5;
    const mb = best.b!;
    const cands: [number, number, number][] = [];
    for (let ty = mb.ty - size - 5; ty <= mb.ty + mb.size + 5; ty++)
      for (let tx = mb.tx - size - 5; tx <= mb.tx + mb.size + 5; tx++) {
        const gx = Math.max(0, Math.max(mb.tx - (tx + size), tx - (mb.tx + mb.size)));
        const gy = Math.max(0, Math.max(mb.ty - (ty + size), ty - (mb.ty + mb.size)));
        const gap = Math.max(gx, gy);
        if (gap < 3 || gap > 4) continue;
        const d = dist(tx + size / 2, ty + size / 2, w.map.w / 2, w.map.h / 2);
        cands.push([tx, ty, d]);
      }
    cands.sort((a, b) => a[2] - b[2]);
    const builder = this.pickBuilder(workers, hallDef);
    if (!builder) return;
    for (const [tx, ty] of cands) {
      if (w.placementError(hallDef.id, tx, ty, this.pid, [builder.id])) continue;
      this.issue({ type: 'build', player: this.pid, units: [builder.id], defId: hallDef.id, tx, ty });
      this.expanding = true;
      // sepulchral also needs a lode on the new mine
      if (this.f.goldStructure) {
        const lode = getDef(this.f.goldStructure);
        const second = workers.find((u) => u !== builder && u.def.id === this.f.worker);
        if (second && this.p.gold >= hallDef.cost.gold + lode.cost.gold) {
          this.issue({ type: 'build', player: this.pid, units: [second.id], defId: lode.id, tx: mb.tx, ty: mb.ty, queued: false });
        }
      }
      return;
    }
  }

  // ---------------------------------------------------------------------------
  // build order
  // ---------------------------------------------------------------------------
  private manageBuildOrder(mine: Entity[], workers: Entity[]): void {
    const steps = this.plan.steps;
    // re-check completed steps from the start (lost buildings get rebuilt)
    let budgetUsed = false;
    for (let i = 0; i < steps.length && !budgetUsed; i++) {
      const s = steps[i];
      if (this.stepDone(s, mine)) continue;
      budgetUsed = true; // only work on the first unfinished step
      this.stepIdx = i;
      this.doStep(s, mine, workers);
    }
    // sepulchral expansions need lodes on every mine near a hall
    if (this.p.faction === 'sepulchral') {
      for (const h of mine) {
        if (!h.def.mainHall || h.b?.constructing) continue;
        const m = this.w.entities.find((x) => x.alive && x.def.goldMine && x.b && x.b.cursedBy < 0 && x.b.gold > 0 && dist(x.x, x.y, h.x, h.y) < 13);
        if (m && !this.pendingCount('sep_lode')) this.build('sep_lode', workers, { x: m.x, y: m.y });
      }
    }
    // towers
    if (this.cfg.towers > 0 && this.p.tier >= 2 && this.p.gold > 500) {
      const t = this.plan.towerUpgrade;
      const towers = mine.filter((e) => e.def.weapon && e.b).length;
      if (towers < this.cfg.towers) {
        if (t) {
          const base = mine.find((e) => e.def.id === this.plan.tower && e.b && !e.b.constructing && !e.b.queue.length && !e.def.foodProvided);
          if (base && !this.w.requirementsMet(this.pid, getDef(t).requires)) this.issue({ type: 'upgradeBuilding', player: this.pid, building: base.id, to: t });
          else if (!this.pendingCount(this.plan.tower) && this.p.faction === 'crown') this.build(this.plan.tower, workers, { x: this.stageX, y: this.stageY });
          else if (this.p.faction === 'sepulchral') {
            const ob = mine.find((e) => e.def.id === 'sep_obelisk' && !e.b!.constructing && !e.b!.queue.length);
            if (ob) this.issue({ type: 'upgradeBuilding', player: this.pid, building: ob.id, to: t });
          }
        } else if (!this.pendingCount(this.plan.tower)) this.build(this.plan.tower, workers, { x: this.stageX, y: this.stageY });
      }
    }
    // spend floating resources on extra production
    if (this.p.gold > 900 && this.p.lumber > 300 && this.w.time > 420) {
      for (const b of this.plan.extraProduction) {
        const def = DEFS[b];
        if (!def || this.w.requirementsMet(this.pid, def.requires)) continue;
        if (this.count(mine, b) < 2 && !this.pendingCount(b)) {
          this.build(b, workers);
          break;
        }
      }
    }
  }

  private stepDone(s: Step, mine: Entity[]): boolean {
    if ('b' in s) return this.count(mine, s.b) + this.pendingCount(s.b) >= s.n;
    if ('hero' in s) return this.w.heroCount(this.pid) >= s.hero;
    if ('hall' in s) {
      if (this.p.tier >= s.hall) return true;
      return mine.some((e) => e.def.mainHall && e.b!.queue.some((q) => q.kind === 'upgrade'));
    }
    if ('r' in s) {
      const lvl = s.lvl ?? 1;
      return this.p.upgradeLevel(s.r) >= lvl || this.p.researching.has(s.r);
    }
    return true;
  }

  private doStep(s: Step, mine: Entity[], workers: Entity[]): void {
    if ('b' in s) {
      if (!this.pendingCount(s.b)) this.build(s.b, workers);
      return;
    }
    if ('hero' in s) {
      this.hireHero(mine);
      return;
    }
    if ('hall' in s) {
      const hall = mine.find((e) => e.def.mainHall && e.b && !e.b.constructing && e.def.hallTier === s.hall - 1 && e.b.queue.length === 0);
      if (!hall || !hall.def.upgradesTo) return;
      const nd = getDef(hall.def.upgradesTo);
      if (this.w.requirementsMet(this.pid, nd.requires)) return;
      if (this.p.gold >= nd.cost.gold && this.p.lumber >= nd.cost.lumber) this.issue({ type: 'upgradeBuilding', player: this.pid, building: hall.id, to: nd.id });
      return;
    }
    if ('r' in s) {
      const up = UPGRADES[s.r];
      if (!up) return;
      const lvl = this.p.upgradeLevel(s.r) + 1;
      const L = up.levels[lvl - 1];
      if (!L || this.w.requirementsMet(this.pid, L.requires)) {
        this.skipResearch(s);
        return;
      }
      const b = mine.find((e) => e.b && !e.b.constructing && e.def.researches?.includes(s.r) && e.b.queue.length < 2);
      if (!b) return;
      if (this.p.gold >= L.cost.gold && this.p.lumber >= L.cost.lumber) this.issue({ type: 'research', player: this.pid, building: b.id, upgrade: s.r });
    }
  }

  private skipResearch(s: Step): void {
    void s;
  }

  private hireHero(mine: Entity[]): void {
    if (heroHireError(this.w, this.pid)) return;
    const altar = mine.find((e) => e.def.isAltar && e.b && !e.b.constructing && e.b.queue.length === 0);
    if (!altar) return;
    const cost = heroCost(this.w, this.pid);
    if (this.p.gold < cost.gold || this.p.lumber < cost.lumber || this.foodFree() < 5) return;
    const owned = new Set(this.w.entities.filter((e) => e.hero && e.owner === this.pid).map((e) => e.def.id));
    const pick = this.heroPrefs.find((h) => !owned.has(h));
    if (pick) this.issue({ type: 'train', player: this.pid, building: altar.id, unit: pick });
  }

  // ---------------------------------------------------------------------------
  // production
  // ---------------------------------------------------------------------------
  private manageProduction(mine: Entity[]): void {
    const tier = Math.max(1, Math.min(3, this.p.tier));
    const comp = this.plan.comp[tier];
    // reserve for the current build step
    const reserve = this.stepReserve();
    for (const b of mine) {
      if (!b.b || b.b.constructing || !b.def.trains || b.def.mainHall || b.def.isAltar) continue;
      if (b.b.queue.length >= 2) continue;
      const opts = b.def.trains.filter((id) => (comp[id] ?? 0) > 0 && !this.w.requirementsMet(this.pid, DEFS[id].requires));
      if (!opts.length) continue;
      // pick the unit most under-represented vs. its weight
      const counts = new Map<string, number>();
      for (const e of mine) if (e.isUnit) counts.set(e.def.id, (counts.get(e.def.id) ?? 0) + 1);
      let best: string | null = null;
      let bestScore = -Infinity;
      for (const id of opts) {
        const wgt = comp[id];
        const have = counts.get(id) ?? 0;
        const score = wgt / (have + 1) + this.rng.next() * 0.3;
        if (score > bestScore) {
          bestScore = score;
          best = id;
        }
      }
      if (!best) continue;
      const def = DEFS[best];
      if (this.p.gold - def.cost.gold < reserve.gold || this.p.lumber - def.cost.lumber < reserve.lumber) continue;
      if (this.foodFree() < (def.cost.food ?? 0)) continue;
      this.issue({ type: 'train', player: this.pid, building: b.id, unit: best });
      // keep rally points on the staging area
      if (!b.b.hasRally) this.issue({ type: 'rally', player: this.pid, buildings: [b.id], x: this.stageX, y: this.stageY });
    }
  }

  private stepReserve(): { gold: number; lumber: number } {
    const s = this.plan.steps[this.stepIdx];
    if (!s) return { gold: 0, lumber: 0 };
    if (this.w.time < 90) return { gold: 0, lumber: 0 };
    if ('b' in s) {
      const d = DEFS[s.b];
      return d ? { gold: d.cost.gold * 0.8, lumber: d.cost.lumber * 0.8 } : { gold: 0, lumber: 0 };
    }
    if ('hall' in s) return { gold: 300, lumber: 180 };
    if ('hero' in s) return heroCost(this.w, this.pid);
    return { gold: 100, lumber: 50 };
  }

  // ---------------------------------------------------------------------------
  // heroes
  // ---------------------------------------------------------------------------
  private manageHeroes(mine: Entity[], heroes: Entity[]): void {
    const w = this.w;
    for (const h of heroes) {
      // learn skills
      if (h.hero!.skillPoints > 0) {
        const abil = h.def.hero!.abilities;
        const order = [abil[3], abil[0], abil[2], abil[1], abil[0], abil[1], abil[2]];
        for (const id of order) {
          if (!learnError(h, id)) {
            this.issue({ type: 'learn', player: this.pid, hero: h.id, ability: id });
            break;
          }
        }
      }
      // drink potions
      if (h.hp < h.st.maxHp * 0.4) {
        const slot = h.hero!.inventory.findIndex((it) => it && (it.def.id === 'item_heal' || it.def.id === 'item_elixir'));
        if (slot >= 0 && h.hero!.inventory[slot]!.cd <= 0) this.issue({ type: 'useItem', player: this.pid, hero: h.id, slot });
      }
      // pick up nearby items
      if (!h.order || h.order.type === 'attackMove' || h.order.type === 'move') {
        const item = w.entities.find((e) => e.kind === 'item' && !e.removed && dist(e.x, e.y, h.x, h.y) < 9);
        if (item && h.hero!.inventory.some((s) => !s) && !this.enemiesNear(h.x, h.y, 7).length) {
          this.issue({ type: 'order', player: this.pid, units: [h.id], order: { type: 'pickup', target: item.id } });
        }
      }
    }
    // revive dead heroes
    for (const id of this.p.heroIds) {
      const h = w.get(id);
      if (!h || h.alive || !h.hero || h.hero.reviving) continue;
      const altar = mine.find((e) => e.def.isAltar && e.b && !e.b.constructing && e.b.queue.length === 0);
      if (!altar) continue;
      const cost = reviveCostFor(h);
      if (this.p.gold >= cost.gold && this.foodFree() >= 5) this.issue({ type: 'revive', player: this.pid, altar: altar.id, hero: h.id });
    }
    // buy potions
    if (this.cfg.buyPotions && this.p.gold > 600 && this.mode !== 'attack') {
      const shop = mine.find((e) => e.def.shopItems && e.b && !e.b.constructing);
      if (shop) {
        for (const h of heroes) {
          const has = h.hero!.inventory.some((it) => it && it.def.id === 'item_heal');
          if (!has && h.hero!.inventory.some((s) => !s) && dist(h.x, h.y, shop.x, shop.y) < 20 && !h.order) {
            this.issue({ type: 'order', player: this.pid, units: [h.id], order: { type: 'shop', target: shop.id, itemId: 'item_heal' } });
          }
        }
      }
    }
    void ITEMS;
  }

  // ---------------------------------------------------------------------------
  // army
  // ---------------------------------------------------------------------------
  private value(e: Entity): number {
    let v = e.def.cost.gold + e.def.cost.lumber * 1.3;
    if (e.hero) v = 450 + e.hero.level * 160;
    if (!e.def.weapon) v *= 0.6;
    return v * (0.35 + 0.65 * (e.hp / e.st.maxHp));
  }

  private enemiesNear(x: number, y: number, r: number): Entity[] {
    const w = this.w;
    return w.query(x, y, r, (e) => e.kind !== 'item' && w.isEnemy(this.pid, e.owner) && w.canSee(this.pid, e) && !(e.b && !e.def.weapon && e.owner === w.hostileId));
  }

  private manageArmy(mine: Entity[], army: Entity[], heroes: Entity[]): void {
    const w = this.w;
    if (!army.length) return;
    const strength = army.reduce((s, e) => s + this.value(e), 0);
    // base defense
    const threat = this.baseThreat(mine);
    if (threat) {
      if (this.mode !== 'defend') this.setMode('defend');
      const defenders = army.filter((e) => dist(e.x, e.y, threat.x, threat.y) < 45 || this.mode === 'defend');
      this.orderGroup(defenders, 'attackMove', threat.x, threat.y);
      if (this.p.faction === 'crown' && threat.n >= 4) {
        const hall = mine.find((e) => e.def.mainHall && dist(e.x, e.y, threat.x, threat.y) < 15);
        if (hall && hall.ability('cr_calltoarms')?.cd === 0 && army.filter((e) => dist(e.x, e.y, threat.x, threat.y) < 12).length < threat.n) {
          this.issue({ type: 'cast', player: this.pid, units: [hall.id], ability: 'cr_calltoarms' });
        }
      }
      return;
    }
    if (this.mode === 'defend') this.setMode('build');

    // hero retreat
    if (this.cfg.heroRetreat > 0) {
      for (const h of heroes) {
        if (h.hp < h.st.maxHp * this.cfg.heroRetreat && this.enemiesNear(h.x, h.y, 8).length) {
          this.issue({ type: 'order', player: this.pid, units: [h.id], order: { type: 'move', x: this.homeX, y: this.homeY } });
        }
      }
    }

    const fighting = army.filter((e) => e.order?.type === 'attackMove' || e.order?.type === 'attack');
    const center = this.armyCenter(army);
    const time = w.time;

    switch (this.mode) {
      case 'build':
      case 'gather': {
        // decide what to do next
        const readyToAttack = time > this.cfg.firstAttack && strength > this.cfg.attackStrength * (1 + this.attackWave * 0.35) && time - this.lastAttackEnd > 45;
        const food = this.p.foodUsed;
        if (readyToAttack || (food >= 80 && strength > this.cfg.attackStrength)) {
          const t = this.pickAttackTarget();
          if (t) {
            this.target = t;
            this.setMode('attack');
            this.attackWave++;
            this.orderGroup(army, 'attackMove', t.x, t.y);
            return;
          }
        }
        if (heroes.length && army.length >= 3) {
          const camp = this.pickCamp(strength, center);
          if (camp >= 0) {
            this.campTarget = camp;
            this.setMode('creep');
            const c = w.camps[camp];
            this.orderGroup(army, 'attackMove', c.x, c.y);
            return;
          }
        }
        // idle army gathers at the staging point
        const idle = army.filter((e) => !e.order && dist(e.x, e.y, this.stageX, this.stageY) > 6);
        if (idle.length) this.orderGroup(idle, 'move', this.stageX, this.stageY);
        return;
      }
      case 'creep': {
        const c = w.camps[this.campTarget];
        const alive = c && c.members.some((id) => w.get(id)?.alive);
        if (!c || !alive || time - this.modeSince > 75) {
          // loot then go home
          this.campTarget = -1;
          this.setMode('gather');
          const idle = army.filter((e) => !e.order || e.order.type === 'attackMove');
          this.orderGroup(idle, 'move', this.stageX, this.stageY);
          return;
        }
        // retreat if losing
        const local = this.localBalance(center.x, center.y, army);
        if (local < 0.45) this.retreat(army);
        else {
          const idle = army.filter((e) => !e.order);
          if (idle.length) this.orderGroup(idle, 'attackMove', c.x, c.y);
        }
        return;
      }
      case 'attack': {
        if (!this.target) {
          this.setMode('gather');
          return;
        }
        const local = this.localBalance(center.x, center.y, army);
        if (local < 0.5 && this.enemiesNear(center.x, center.y, 14).length > 2) {
          this.retreat(army);
          return;
        }
        // reached target area: find next building to kill
        const atTarget = dist(center.x, center.y, this.target.x, this.target.y) < 10;
        if (atTarget && !this.enemiesNear(center.x, center.y, 12).length) {
          const t = this.pickAttackTarget();
          if (t) {
            this.target = t;
            this.orderGroup(army, 'attackMove', t.x, t.y);
          } else {
            this.setMode('gather');
            this.lastAttackEnd = time;
          }
          return;
        }
        // stragglers and idle units rejoin
        const idle = army.filter((e) => !e.order || (e.order.type === 'move' && dist(e.x, e.y, this.stageX, this.stageY) < 8));
        if (idle.length) this.orderGroup(idle, 'attackMove', this.target.x, this.target.y);
        if (this.cfg.focusFire) this.focusFire(fighting);
        if (time - this.modeSince > 240) {
          this.setMode('gather');
          this.lastAttackEnd = time;
          this.orderGroup(army, 'move', this.stageX, this.stageY);
        }
        return;
      }
      case 'retreat': {
        if (time - this.modeSince > 14) {
          this.setMode('gather');
          this.lastAttackEnd = time;
        }
        return;
      }
      default:
        return;
    }
  }

  private setMode(m: Mode): void {
    this.mode = m;
    this.modeSince = this.w.time;
  }

  private retreat(army: Entity[]): void {
    this.setMode('retreat');
    this.lastAttackEnd = this.w.time;
    this.orderGroup(army, 'move', this.homeX + (this.stageX - this.homeX) * 0.3, this.homeY + (this.stageY - this.homeY) * 0.3);
  }

  private orderGroup(units: Entity[], type: 'move' | 'attackMove', x: number, y: number): void {
    if (!units.length) return;
    this.issue({ type: 'order', player: this.pid, units: units.map((u) => u.id), order: { type, x, y } });
  }

  private armyCenter(army: Entity[]): { x: number; y: number } {
    // median-ish center: average of units close to the hero/army mass
    let x = 0;
    let y = 0;
    for (const e of army) {
      x += e.x;
      y += e.y;
    }
    return { x: x / army.length, y: y / army.length };
  }

  /** ratio of our nearby strength to the enemy's nearby strength */
  private localBalance(x: number, y: number, army: Entity[]): number {
    const ours = army.filter((e) => dist(e.x, e.y, x, y) < 14).reduce((s, e) => s + this.value(e), 0);
    const theirs = this.enemiesNear(x, y, 15)
      .filter((e) => e.isUnit || e.def.weapon)
      .reduce((s, e) => s + (e.isUnit ? this.value(e) : 500), 0);
    if (theirs <= 0) return 10;
    return ours / theirs;
  }

  private baseThreat(mine: Entity[]): { x: number; y: number; n: number } | null {
    const w = this.w;
    for (const b of mine) {
      if (!b.b) continue;
      const foes = w.query(b.x, b.y, 11, (e) => e.isUnit && w.isEnemy(this.pid, e.owner) && e.owner !== w.hostileId && w.canSee(this.pid, e));
      if (foes.length >= 1) {
        const f = foes[0];
        return { x: f.x, y: f.y, n: foes.length };
      }
    }
    return null;
  }

  private pickAttackTarget(): { x: number; y: number } | null {
    const w = this.w;
    let best: { x: number; y: number } | null = null;
    let bd = Infinity;
    // known enemy buildings we can see or have seen
    for (const e of w.entities) {
      if (!e.alive || !e.b || !w.isEnemy(this.pid, e.owner) || w.players[e.owner].isNeutral) continue;
      if (!this.p.explored[Math.floor(e.y) * w.map.w + Math.floor(e.x)]) continue;
      const d = dist(e.x, e.y, this.homeX, this.homeY) - (e.def.mainHall ? 10 : 0);
      if (d < bd) {
        bd = d;
        best = { x: e.x, y: e.y };
      }
    }
    if (best) return best;
    // otherwise go to an enemy start location
    for (const p of w.players) {
      if (p.isNeutral || p.defeated || !w.isEnemy(this.pid, p.id)) continue;
      const d = dist(p.startX, p.startY, this.homeX, this.homeY);
      if (d < bd) {
        bd = d;
        best = { x: p.startX, y: p.startY };
      }
    }
    return best;
  }

  private pickCamp(strength: number, center: { x: number; y: number }): number {
    const w = this.w;
    let best = -1;
    let bd = Infinity;
    for (const c of w.camps) {
      if (c.cleared) continue;
      const members = c.members.map((id) => w.get(id)).filter((e): e is Entity => !!e && e.alive);
      if (!members.length) continue;
      const cs = members.reduce((s, e) => s + (e.def.level ?? 1) * (e.def.level ?? 1) * 22 + e.hp * 0.6, 0);
      if (cs > strength * this.cfg.creepFactor) continue;
      // stay on our side of the map
      let nearEnemy = false;
      for (const p of w.players) {
        if (p.isNeutral || !w.isEnemy(this.pid, p.id)) continue;
        if (dist(c.x, c.y, p.startX, p.startY) < dist(c.x, c.y, this.homeX, this.homeY) * 0.9) nearEnemy = true;
      }
      if (nearEnemy && c.difficulty !== 'red') continue;
      const d = dist(c.x, c.y, center.x, center.y);
      if (d < bd) {
        bd = d;
        best = c.id;
      }
    }
    return bd < 75 ? best : -1;
  }

  private focusFire(units: Entity[]): void {
    const w = this.w;
    for (const u of units) {
      if (!u.def.weapon?.projectile || u.hero) continue;
      const cands = w.query(u.x, u.y, u.st.range + 0.5, (e) => e.isUnit && w.isEnemy(this.pid, e.owner) && w.canSee(this.pid, e));
      let best: Entity | null = null;
      let bs = Infinity;
      for (const c of cands) {
        const s = c.hp - (c.hero ? 300 : 0);
        if (s < bs) {
          bs = s;
          best = c;
        }
      }
      if (best && u.atkTarget !== best.id && this.rng.chance(0.3)) {
        this.issue({ type: 'order', player: this.pid, units: [u.id], order: { type: 'attack', target: best.id } });
      }
    }
  }

  private manageCasting(army: Entity[]): void {
    const w = this.w;
    for (const e of army) {
      if (!e.abilities.length) continue;
      if (this.rng.next() > this.cfg.castChance) continue;
      unitCastAI(w, e, this.p.difficulty);
    }
    // buildings with abilities (bind mine etc.) are handled by game logic
  }
}

export function createAIs(w: World): AIController[] {
  return w.players.filter((p) => p.isAI && !p.isNeutral).map((p) => new AIController(w, p.id));
}

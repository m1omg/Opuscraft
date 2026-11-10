import { DEFS, getDef, UPGRADES } from '../data/registry';
import {
  BUILD_ASSIST_FACTOR,
  CANCEL_REFUND,
  CHANNEL_MINE_INTERVAL,
  CHOP_TIME,
  DT,
  GOLD_PER_TRIP,
  MAX_MINERS,
  MINE_TIME,
  REPAIR_COST_FACTOR,
  SPIRIT_LUMBER_AMOUNT,
  SPIRIT_LUMBER_INTERVAL,
  upkeepFor,
} from '../data/rules';
import type { Resource } from '../data/types';
import { dist, distToRect } from '../util/math';
import type { Entity, Order, QueueItem } from './entity';
import type { World } from './world';
import { completeOrder, moveToward, findTarget, engage } from './orders';
import { kill, heal, canAttack, launchSpellProjectile, dealDamage, fireAttack } from './combat';
import { FACTIONS } from '../data/registry';
import { initAbilities, recomputeStats } from './abilities';
import { reviveHeroAt } from './heroes';

// ---------------------------------------------------------------------------
// claims (which mine/tree a worker is using) — must be released on order change
// ---------------------------------------------------------------------------
export function releaseClaims(w: World, e: Entity, refundBuild: boolean): void {
  if (e.gatherTree >= 0) {
    const t = w.map.trees[e.gatherTree];
    if (t) {
      if (e.def.faction === 'twilight') t.spirits = Math.max(0, t.spirits - 1);
      else t.workers = Math.max(0, t.workers - 1);
    }
    e.gatherTree = -1;
  }
  if (e.gatherMine >= 0) {
    const m = w.get(e.gatherMine);
    if (m && m.b) {
      const i = m.b.miners.indexOf(e.id);
      if (i >= 0) m.b.miners.splice(i, 1);
      if (m.b.inside === e.id) m.b.inside = -1;
    }
    e.gatherMine = -1;
  }
  if (e.inside >= 0) {
    const host = w.get(e.inside);
    // spirits leaving a bound mine
    if (host && host.def.goldMine) exitBuilding(w, e, host);
  }
  e.working = false;
  if (refundBuild) {
    const refund = (o: Order | null) => {
      if (o && o.type === 'build' && o.itemId === 'paid') {
        const d = DEFS[o.defId ?? ''];
        if (d) {
          const p = w.players[e.owner];
          p.gold += d.cost.gold;
          p.lumber += d.cost.lumber;
        }
        o.itemId = 'refunded';
      }
    };
    refund(e.order);
    for (const q of e.queue) refund(q);
  }
}

function exitBuilding(w: World, e: Entity, host: Entity, toward?: Entity | null): void {
  const hb = host.b;
  if (hb) {
    const i = hb.miners.indexOf(e.id);
    if (i >= 0) hb.miners.splice(i, 1);
    if (hb.inside === e.id) hb.inside = -1;
    const g = hb.garrison.indexOf(e.id);
    if (g >= 0) hb.garrison.splice(g, 1);
  }
  e.inside = -1;
  const pos = host.b ? w.findSpawnPos(host, toward ? toward.x : host.x, toward ? toward.y : host.y + 3, e.radius) : [host.x, host.y];
  e.x = e.px = pos[0];
  e.y = e.py = pos[1];
}

// ---------------------------------------------------------------------------
// drop-offs
// ---------------------------------------------------------------------------
export function findDropoff(w: World, e: Entity, res: Resource): Entity | null {
  let best: Entity | null = null;
  let bd = Infinity;
  for (const b of w.entities) {
    if (b.owner !== e.owner || !b.alive || !b.b || b.b.constructing) continue;
    if (!b.def.dropoff || !b.def.dropoff.includes(res)) continue;
    const d = distToRect(e.x, e.y, b.b.tx, b.b.ty, b.b.tx + b.b.size, b.b.ty + b.b.size);
    if (d < bd) {
      bd = d;
      best = b;
    }
  }
  return best;
}

export function deposit(w: World, owner: number, res: Resource, amount: number, srcId: number): void {
  const p = w.players[owner];
  if (!p) return;
  if (res === 'gold') {
    const up = upkeepFor(p.foodUsed);
    const got = Math.floor(amount * up.factor + 1e-6);
    p.gold += got;
    p.stats.goldMined += got;
    p.stats.goldLostToUpkeep += amount - got;
    w.emit({ t: 'deposit', id: srcId, res, amount: got, owner });
  } else {
    p.lumber += amount;
    p.stats.lumberHarvested += amount;
    w.emit({ t: 'deposit', id: srcId, res, amount, owner });
  }
}

function usableMine(w: World, e: Entity, m: Entity): boolean {
  if (!m.alive || !m.b) return false;
  if (m.def.goldMine) {
    if (m.b.gold <= 0) return false;
    if (m.b.cursedBy >= 0) return false;
    if (m.b.boundBy >= 0) {
      const hall = w.valid(m.b.boundBy);
      if (hall && hall.owner !== e.owner) return false;
    }
    return true;
  }
  if (m.def.onMine) return m.owner === e.owner && !m.b.constructing;
  return false;
}

function minerKind(e: Entity): 'standard' | 'channel' | 'spirit' | 'none' {
  return e.def.harvest?.gold ?? 'none';
}
function lumberKind(e: Entity): 'standard' | 'spirit' | 'none' {
  return e.def.harvest?.lumber ?? 'none';
}

function collapseMine(w: World, mine: Entity): void {
  if (!mine.alive) return;
  const lode = mine.b && mine.b.cursedBy >= 0 ? w.valid(mine.b.cursedBy) : null;
  // eject anyone inside
  for (const u of w.entities) {
    if (u.inside === mine.id && u.alive) {
      exitBuilding(w, u, mine);
      u.order = null;
    }
  }
  w.msg(lode ? lode.owner : -1, 'A gold mine has collapsed', 'info');
  if (lode) kill(w, lode, null);
  kill(w, mine, null);
  w.removeEntity(mine);
}

// ---------------------------------------------------------------------------
// gathering
// ---------------------------------------------------------------------------
export function gatherStep(w: World, e: Entity, o: Order): void {
  const kind = minerKind(e);
  // tree gathering
  if (o.tree !== undefined && o.tree >= 0) {
    const lk = lumberKind(e);
    if (lk === 'none') {
      w.msg(e.owner, e.def.name + ' cannot harvest lumber');
      completeOrder(w, e);
      return;
    }
    lumberStep(w, e, o, lk);
    return;
  }
  if (kind === 'none') {
    w.msg(e.owner, e.def.name + ' cannot mine gold');
    completeOrder(w, e);
    return;
  }
  // carrying gold → deliver first
  if (e.carry > 0 && e.carryType === 'gold') {
    returnStep(w, e, o);
    return;
  }
  let m = w.valid(o.target ?? -1);
  if (m && m.def.goldMine && m.b && m.b.cursedBy >= 0 && kind === 'channel') {
    const lode = w.valid(m.b.cursedBy);
    if (lode && lode.owner === e.owner) {
      o.target = lode.id;
      m = lode;
    }
  }
  if (!m || !usableMine(w, e, m)) {
    // try another mine nearby
    const alt = findNearbyMine(w, e, kind);
    if (alt) {
      o.target = alt.id;
      return;
    }
    if (kind === 'channel' && m && m.def.goldMine) w.msg(e.owner, 'Cultists can only harvest from a Cursed Lode');
    completeOrder(w, e);
    return;
  }
  if (kind === 'spirit' && m.def.goldMine && m.b!.boundBy < 0) {
    w.msg(e.owner, 'The mine must first be bound by a Heart of the Forest');
    completeOrder(w, e);
    return;
  }
  const gap = w.gap(e, m);
  if (gap > 0.45) {
    const r = moveToward(w, e, m.x, m.y, 0, m);
    if (r === 'blocked' && gap > 2) completeOrder(w, e);
    return;
  }
  e.hasGoal = false;
  const mb = m.b!;
  if (kind === 'standard') {
    if (mb.inside >= 0 && mb.inside !== e.id) {
      // wait for the miner inside
      e.working = false;
      return;
    }
    mb.inside = e.id;
    e.gatherMine = m.id;
    e.inside = m.id;
    e.workTimer = MINE_TIME;
    return;
  }
  if (kind === 'channel') {
    if (!mb.miners.includes(e.id)) {
      if (mb.miners.length >= MAX_MINERS) {
        w.msg(e.owner, 'This mine already has five cultists');
        completeOrder(w, e);
        return;
      }
      mb.miners.push(e.id);
      e.gatherMine = m.id;
      e.workTimer = 0;
    }
    e.working = true;
    e.facing = Math.atan2(m.y - e.y, m.x - e.x);
    e.workTimer += DT;
    if (e.workTimer >= CHANNEL_MINE_INTERVAL) {
      e.workTimer -= CHANNEL_MINE_INTERVAL;
      const mine = w.valid(mb.mine);
      if (!mine || !mine.b) {
        completeOrder(w, e);
        return;
      }
      const amt = Math.min(GOLD_PER_TRIP, mine.b.gold);
      mine.b.gold -= amt;
      deposit(w, e.owner, 'gold', amt, e.id);
      if (mine.b.gold <= 0) collapseMine(w, mine);
    }
    return;
  }
  // spirit enters the bound mine and stays
  if (mb.miners.length >= MAX_MINERS) {
    w.msg(e.owner, 'This mine already has five spirits');
    completeOrder(w, e);
    return;
  }
  mb.miners.push(e.id);
  e.gatherMine = m.id;
  e.inside = m.id;
  e.workTimer = 0;
}

function findNearbyMine(w: World, e: Entity, kind: string): Entity | null {
  if (kind === 'none') return null;
  let best: Entity | null = null;
  let bd = 18;
  for (const m of w.entities) {
    if (!m.alive || !m.b) continue;
    if (kind === 'channel') {
      if (!m.def.onMine || m.owner !== e.owner || m.b.constructing || m.b.miners.length >= MAX_MINERS) continue;
    } else if (kind === 'spirit') {
      if (!m.def.goldMine || m.b.gold <= 0) continue;
      const hall = w.valid(m.b.boundBy);
      if (!hall || hall.owner !== e.owner || m.b.miners.length >= MAX_MINERS) continue;
    } else {
      if (!usableMine(w, e, m) || !m.def.goldMine) continue;
    }
    const d = dist(e.x, e.y, m.x, m.y);
    if (d < bd) {
      bd = d;
      best = m;
    }
  }
  return best;
}

function lumberStep(w: World, e: Entity, o: Order, kind: string): void {
  const spirit = kind === 'spirit';
  if (!spirit && e.carry > 0 && e.carryType === 'lumber' && e.carry >= e.st.lumberCarry) {
    returnStep(w, e, o);
    return;
  }
  if (!spirit && e.carry > 0 && e.carryType === 'gold') {
    returnStep(w, e, o);
    return;
  }
  let tree = w.map.trees[o.tree!];
  if (!tree || !tree.alive) {
    const near = w.map.nearestTree(tree ? tree.tx + 0.5 : e.x, tree ? tree.ty + 0.5 : e.y, 10);
    if (near < 0) {
      if (e.carry > 0) returnStep(w, e, o);
      else completeOrder(w, e);
      return;
    }
    if (e.gatherTree >= 0) releaseClaims(w, e, false);
    o.tree = near;
    tree = w.map.trees[near];
  }
  const cx = tree.tx + 0.5;
  const cy = tree.ty + 0.5;
  const d = distToRect(e.x, e.y, tree.tx, tree.ty, tree.tx + 1, tree.ty + 1);
  if (d > e.radius + 0.35) {
    if (e.working) {
      e.working = false;
      releaseClaims(w, e, false);
    }
    const r = moveToward(w, e, cx, cy, 0, undefined, { key: 1e7 + o.tree!, x0: tree.tx, y0: tree.ty, x1: tree.tx + 1, y1: tree.ty + 1 });
    if (r === 'blocked') {
      // try a different tree
      const alt = w.map.nearestTree(e.x, e.y, 6, (_t, id) => id !== o.tree);
      if (alt >= 0) {
        o.tree = alt;
        e.hasGoal = false;
      } else completeOrder(w, e);
    }
    return;
  }
  e.hasGoal = false;
  e.facing = Math.atan2(cy - e.y, cx - e.x);
  if (e.gatherTree !== o.tree) {
    releaseClaims(w, e, false);
    e.gatherTree = o.tree!;
    if (spirit) tree.spirits++;
    else tree.workers++;
    e.workTimer = 0;
  }
  e.working = true;
  e.workTimer += DT;
  if (spirit) {
    if (e.workTimer >= SPIRIT_LUMBER_INTERVAL) {
      e.workTimer -= SPIRIT_LUMBER_INTERVAL;
      deposit(w, e.owner, 'lumber', SPIRIT_LUMBER_AMOUNT + (e.st.lumberCarry - 10) / 2, e.id);
    }
    return;
  }
  const cap = e.st.lumberCarry;
  const chopTime = CHOP_TIME * (cap / 10) * 0.8 + CHOP_TIME * 0.2;
  if (e.workTimer >= chopTime / cap * (e.carry + 1) || e.workTimer >= chopTime) {
    if (e.carryType !== 'lumber') {
      e.carryType = 'lumber';
      e.carry = 0;
    }
    e.carry++;
    tree.lumber--;
    if (e.carry % 3 === 0) w.emit({ t: 'chop', id: e.id });
    if (tree.lumber <= 0) {
      w.map.removeTree(o.tree!);
      w.emit({ t: 'treeFell', tree: o.tree! });
      e.gatherTree = -1;
      e.working = false;
      e.workTimer = 0;
      if (e.carry > 0) returnStep(w, e, o);
      return;
    }
    if (e.carry >= cap) {
      e.working = false;
      releaseClaims(w, e, false);
      e.workTimer = 0;
    }
  }
}

/** Carry resources home; when the order is 'gather' the worker resumes afterwards. */
export function returnStep(w: World, e: Entity, o: Order): void {
  if (e.carry <= 0 || !e.carryType) {
    if (o.type === 'returnRes') completeOrder(w, e);
    return;
  }
  const drop = findDropoff(w, e, e.carryType);
  if (!drop) {
    w.msg(e.owner, 'No place to return ' + e.carryType);
    completeOrder(w, e);
    return;
  }
  const gap = w.gap(e, drop);
  if (gap > 0.5) {
    const r = moveToward(w, e, drop.x, drop.y, 0, drop);
    if (r === 'blocked' && gap > 3) completeOrder(w, e);
    return;
  }
  e.hasGoal = false;
  deposit(w, e.owner, e.carryType, e.carry, e.id);
  e.carry = 0;
  e.carryType = null;
  if (o.type === 'returnRes') {
    // resume previous gather
    if (o.target !== undefined || o.tree !== undefined) {
      e.order = { type: 'gather', target: o.target, tree: o.tree };
      e.hasGoal = false;
    } else completeOrder(w, e);
  } else {
    e.hasGoal = false;
  }
}

/** Units hidden inside a mine or a building. */
export function insideStep(w: World, e: Entity): void {
  const host = w.get(e.inside);
  if (!host || !host.alive) {
    e.inside = -1;
    if (host) {
      const p = w.map.nearestPassable(host.x, host.y, false, 10);
      if (p) {
        e.x = e.px = p[0];
        e.y = e.py = p[1];
      }
    }
    e.order = null;
    return;
  }
  const hb = host.b!;
  // standard miner inside a gold mine
  if (host.def.goldMine && hb.inside === e.id) {
    e.workTimer -= DT;
    if (e.workTimer <= 0) {
      const amt = Math.min(e.st.goldCarry, hb.gold);
      hb.gold -= amt;
      e.carry = amt;
      e.carryType = 'gold';
      hb.inside = -1;
      e.gatherMine = -1;
      const drop = findDropoff(w, e, 'gold');
      exitBuilding(w, e, host, drop);
      if (hb.gold <= 0) collapseMine(w, host);
    }
    return;
  }
  // twilight spirit generating gold
  if (host.def.goldMine && hb.miners.includes(e.id)) {
    if (e.order && e.order.type !== 'gather') {
      exitBuilding(w, e, host);
      return;
    }
    const hall = w.valid(hb.boundBy);
    if (!hall) {
      exitBuilding(w, e, host);
      e.order = null;
      return;
    }
    e.workTimer += DT;
    if (e.workTimer >= CHANNEL_MINE_INTERVAL) {
      e.workTimer -= CHANNEL_MINE_INTERVAL;
      const amt = Math.min(GOLD_PER_TRIP, hb.gold);
      hb.gold -= amt;
      deposit(w, e.owner, 'gold', amt, host.id);
      if (hb.gold <= 0) collapseMine(w, host);
    }
    return;
  }
  // builder inside a construction (iron)
  if (hb.insideBuilder === e.id) {
    if (!hb.constructing) {
      hb.insideBuilder = -1;
      exitBuilding(w, e, host);
      completeOrder(w, e);
    }
    return;
  }
  // garrisoned worker
  if (hb.garrison.includes(e.id)) return;
  // unknown → leave
  exitBuilding(w, e, host);
}

// ---------------------------------------------------------------------------
// construction
// ---------------------------------------------------------------------------
export function buildStep(w: World, e: Entity, o: Order): void {
  // phase 2: assisting an existing construction
  if (o.target !== undefined && o.target >= 0) {
    const b = w.valid(o.target);
    if (!b || !b.b || !b.b.constructing) {
      completeOrder(w, e);
      return;
    }
    assistConstruction(w, e, b);
    return;
  }
  const def = getDef(o.defId!);
  const size = def.size ?? 2;
  const tx = o.x!;
  const ty = o.y!;
  const cx = tx + size / 2;
  const cy = ty + size / 2;
  const d = distToRect(e.x, e.y, tx, ty, tx + size, ty + size);
  if (d > e.radius + 0.6) {
    const r = moveToward(w, e, cx, cy, 0);
    if (r === 'blocked' && d > 3) {
      w.msg(e.owner, "Can't reach the building site");
      refundBuildOrder(w, e, o);
      completeOrder(w, e);
    }
    return;
  }
  e.hasGoal = false;
  const err = w.placementError(def.id, tx, ty, e.owner, [e.id]);
  if (err) {
    w.msg(e.owner, err);
    refundBuildOrder(w, e, o);
    completeOrder(w, e);
    return;
  }
  const mine = def.onMine ? w.mineAt(cx, cy) : undefined;
  const b = w.spawnBuilding(def.id, e.owner, tx, ty, false, mine ?? undefined);
  if (!b) {
    refundBuildOrder(w, e, o);
    completeOrder(w, e);
    return;
  }
  o.itemId = 'used';
  w.players[e.owner].stats.buildingsBuilt++;
  w.emit({ t: 'buildStart', id: b.id });
  // push friendly units off the footprint
  for (const u of w.query(cx, cy, size * 0.75)) {
    if (u.isUnit && !u.isAir && u.id !== e.id && distToRect(u.x, u.y, tx, ty, tx + size, ty + size) < u.radius) {
      const p = w.findSpawnPos(b, u.x, u.y, u.radius);
      u.x = p[0];
      u.y = p[1];
    }
  }
  const mode = def.buildMode ?? 'standard';
  if (mode === 'summon') {
    w.emit({ t: 'fx', fx: 'summonBuilding', x: cx, y: cy, r: size });
    completeOrder(w, e);
  } else if (mode === 'inside') {
    b.b!.insideBuilder = e.id;
    e.inside = b.id;
    e.order = { type: 'build', target: b.id };
    e.queue.length = 0;
  } else if (mode === 'consume') {
    b.b!.insideBuilder = -2;
    w.emit({ t: 'fx', fx: 'consume', x: e.x, y: e.y });
    e.alive = false;
    e.removed = true;
    w.emit({ t: 'death', id: e.id, killer: -2 });
  } else {
    b.b!.builders.push(e.id);
    o.target = b.id;
    if (e.x > tx && e.x < tx + size && e.y > ty && e.y < ty + size) {
      const p = w.findSpawnPos(b, e.x, e.y, e.radius);
      e.x = p[0];
      e.y = p[1];
    }
  }
}

export function refundBuildOrder(w: World, e: Entity, o: Order): void {
  if (o.itemId !== 'paid') return;
  const d = DEFS[o.defId ?? ''];
  if (d) {
    const p = w.players[e.owner];
    p.gold += d.cost.gold;
    p.lumber += d.cost.lumber;
  }
  o.itemId = 'refunded';
}

function assistConstruction(w: World, e: Entity, b: Entity): void {
  const bs = b.b!;
  const gap = w.gap(e, b);
  if (gap > 0.6) {
    e.working = false;
    const r = moveToward(w, e, b.x, b.y, 0, b);
    if (r === 'blocked' && gap > 3) completeOrder(w, e);
    return;
  }
  e.hasGoal = false;
  e.working = true;
  e.facing = Math.atan2(b.y - e.y, b.x - e.x);
  if (!bs.builders.includes(e.id)) bs.builders.push(e.id);
}

export function repairStep(w: World, e: Entity, o: Order): void {
  const b = w.valid(o.target ?? -1);
  if (!b || !b.b) {
    completeOrder(w, e);
    return;
  }
  if (b.b.constructing) {
    if (b.def.buildMode && b.def.buildMode !== 'standard') {
      completeOrder(w, e);
      return;
    }
    assistConstruction(w, e, b);
    return;
  }
  if (b.hp >= b.st.maxHp || b.def.noRepair || b.def.goldMine) {
    completeOrder(w, e);
    return;
  }
  const gap = w.gap(e, b);
  if (gap > 0.6) {
    e.working = false;
    const r = moveToward(w, e, b.x, b.y, 0, b);
    if (r === 'blocked' && gap > 3) completeOrder(w, e);
    return;
  }
  e.hasGoal = false;
  e.facing = Math.atan2(b.y - e.y, b.x - e.x);
  const p = w.players[e.owner];
  const rate = b.st.maxHp / Math.max(10, b.def.buildTime * 1.5);
  const hp = rate * DT;
  const goldCost = (b.def.cost.gold * REPAIR_COST_FACTOR * hp) / b.st.maxHp;
  const lumberCost = (b.def.cost.lumber * REPAIR_COST_FACTOR * hp) / b.st.maxHp;
  if (p.gold < goldCost || p.lumber < lumberCost) {
    w.msg(e.owner, 'Not enough resources to repair');
    completeOrder(w, e);
    return;
  }
  p.gold -= goldCost;
  p.lumber -= lumberCost;
  e.working = true;
  heal(w, b, hp);
}

// ---------------------------------------------------------------------------
// garrison (iron longhouse) and rooting (twilight ancients)
// ---------------------------------------------------------------------------
export function garrisonStep(w: World, e: Entity, o: Order): void {
  const b = w.valid(o.target ?? -1);
  if (!b || !b.b || !b.def.garrison || b.owner !== e.owner || b.b.constructing) {
    completeOrder(w, e);
    return;
  }
  if (b.b.garrison.length >= b.def.garrison) {
    w.msg(e.owner, 'The longhouse is full');
    completeOrder(w, e);
    return;
  }
  const gap = w.gap(e, b);
  if (gap > 0.5) {
    const r = moveToward(w, e, b.x, b.y, 0, b);
    if (r === 'blocked' && gap > 3) completeOrder(w, e);
    return;
  }
  releaseClaims(w, e, false);
  b.b.garrison.push(e.id);
  e.inside = b.id;
  e.order = null;
  e.queue.length = 0;
}

export function unloadGarrison(w: World, b: Entity): void {
  if (!b.b) return;
  for (const id of [...b.b.garrison]) {
    const u = w.get(id);
    if (u && u.alive) exitBuilding(w, u, b);
  }
  b.b.garrison.length = 0;
}

export function rootStep(w: World, e: Entity, o: Order): void {
  const bdef = DEFS[e.def.rootTo ?? ''];
  if (!bdef) {
    completeOrder(w, e);
    return;
  }
  const size = bdef.size ?? 3;
  const tx = o.x!;
  const ty = o.y!;
  const cx = tx + size / 2;
  const cy = ty + size / 2;
  if (dist(e.x, e.y, cx, cy) > 0.8) {
    const r = moveToward(w, e, cx, cy, 0.5);
    if (r === 'blocked' && dist(e.x, e.y, cx, cy) > 2.5) {
      w.msg(e.owner, "Can't root there");
      completeOrder(w, e);
    }
    return;
  }
  const err = w.placementError(bdef.id, tx, ty, e.owner, [e.id]);
  if (err) {
    w.msg(e.owner, err);
    completeOrder(w, e);
    return;
  }
  const frac = e.hp / e.st.maxHp;
  e.alive = false;
  e.removed = true;
  const b = w.spawnBuilding(bdef.id, e.owner, tx, ty, true);
  if (b) {
    recomputeStats(w, b);
    b.hp = Math.max(1, b.st.maxHp * frac);
    w.emit({ t: 'fx', fx: 'root', x: cx, y: cy, r: size });
    w.events.push({ t: 'spawn', id: b.id });
    replaced(w, e, b);
  }
}

export function uproot(w: World, b: Entity): Entity | null {
  if (!b.b || !b.def.uprootTo || b.b.constructing) return null;
  if (b.b.queue.length) {
    w.msg(b.owner, 'Finish or cancel training before uprooting');
    return null;
  }
  const frac = b.hp / b.st.maxHp;
  w.releaseFootprint(b);
  b.alive = false;
  b.removed = true;
  const u = w.spawnUnit(b.def.uprootTo, b.owner, b.x, b.y);
  u.hp = Math.max(1, u.st.maxHp * frac);
  w.emit({ t: 'fx', fx: 'uproot', x: b.x, y: b.y, r: b.b.size });
  replaced(w, b, u);
  return u;
}

function replaced(w: World, oldE: Entity, newE: Entity): void {
  w.emit({ t: 'fx', fx: 'replaced', x: newE.x, y: newE.y, src: oldE.id, target: newE.id });
}

// ---------------------------------------------------------------------------
// buildings
// ---------------------------------------------------------------------------
export function updateBuilding(w: World, e: Entity): void {
  const bs = e.b!;
  if (e.statsDirty) recomputeStats(w, e);
  if (bs.constructing) {
    constructTick(w, e);
    return;
  }
  if (e.atkCd > 0) e.atkCd -= DT;
  // production queue
  if (bs.queue.length) {
    const q = bs.queue[0];
    q.time -= DT;
    if (q.time <= 0) {
      bs.queue.shift();
      finishQueueItem(w, e, q);
    }
  }
  // tower attacks
  if (e.def.weapon && canAttack(e)) towerTick(w, e);
  if (bs.garrison.length) garrisonAttack(w, e);
  if (e.def.fountain && w.tick % 10 === 0) fountainTick(w, e);
  if (e.def.shopItems && w.tick % 20 === 0) restockTick(e);
}

function constructTick(w: World, e: Entity): void {
  const bs = e.b!;
  const def = e.def;
  const mode = def.buildMode ?? 'standard';
  let rate = 1 / Math.max(1, def.buildTime);
  if (mode === 'standard') {
    // count active builders
    bs.builders = bs.builders.filter((id) => {
      const u = w.valid(id);
      return !!u && !!u.order && (u.order.type === 'build' || u.order.type === 'repair') && u.order.target === e.id;
    });
    let active = 0;
    for (const id of bs.builders) {
      const u = w.get(id)!;
      if (u.working || w.gap(u, e) < 0.7) active++;
    }
    if (active === 0) return;
    rate *= 1 + (active - 1) * BUILD_ASSIST_FACTOR;
  }
  const dp = rate * DT;
  bs.progress = Math.min(1, bs.progress + dp);
  e.hp = Math.min(e.st.maxHp, e.hp + e.st.maxHp * 0.9 * dp);
  if (bs.progress >= 1) {
    bs.constructing = false;
    if (e.def.blightRadius) w.map.addBlight(e.x, e.y, e.def.blightRadius);
    w.emit({ t: 'buildDone', id: e.id, owner: e.owner });
    for (const id of bs.builders) {
      const u = w.valid(id);
      if (u && u.order && u.order.target === e.id) completeOrder(w, u);
    }
    bs.builders = [];
    if (bs.insideBuilder >= 0) {
      const u = w.get(bs.insideBuilder);
      bs.insideBuilder = -1;
      if (u && u.alive) {
        exitBuilding(w, u, e);
        completeOrder(w, u);
      }
    }
    if (e.def.mainHall) {
      // twilight halls bind the nearest free mine automatically
      if (e.def.faction === 'twilight') autoBindMine(w, e);
    }
    for (const u of w.entities) if (u.owner === e.owner) u.statsDirty = true;
  }
}

export function autoBindMine(w: World, hall: Entity): void {
  let best: Entity | null = null;
  let bd = 14;
  for (const m of w.entities) {
    if (!m.alive || !m.def.goldMine || !m.b || m.b.boundBy >= 0 || m.b.cursedBy >= 0) continue;
    const d = dist(m.x, m.y, hall.x, hall.y);
    if (d < bd) {
      bd = d;
      best = m;
    }
  }
  if (best && best.b) {
    best.b.boundBy = hall.id;
    w.emit({ t: 'fx', fx: 'bindMine', x: best.x, y: best.y, src: hall.id, target: best.id });
  }
}

function towerTick(w: World, e: Entity): void {
  if (e.windup >= 0) {
    e.windup -= DT;
    if (e.windup < 0) {
      const t = w.valid(e.atkTarget);
      if (t && t.alive) {
        fireAttack(w, e, t, t.x, t.y);
      }
    }
    return;
  }
  let t = w.valid(e.atkTarget);
  if (!t || !t.alive || w.gap(e, t) > e.st.range || !w.isEnemy(e.owner, t.owner) || !w.canSee(e.owner, t)) {
    e.acquireTimer -= DT;
    if (e.acquireTimer > 0) return;
    e.acquireTimer = 0.4;
    t = findTarget(w, e, e.st.range);
    e.atkTarget = t ? t.id : -1;
  }
  if (t) engage(w, e, t, true);
}


function garrisonAttack(w: World, e: Entity): void {
  const bs = e.b!;
  e.workTimer -= DT;
  if (e.workTimer > 0) return;
  e.workTimer = 1.7;
  const range = 6;
  const t = w.query(e.x, e.y, range, (o) => w.isEnemy(e.owner, o.owner) && !o.b && w.canSee(e.owner, o) && !o.st.invulnerable)[0];
  if (!t) return;
  for (let k = 0; k < bs.garrison.length; k++) {
    launchSpellProjectile(w, e, t, t.x, t.y, { kind: 'spear', speed: 14, arc: 0.12 }, (ww, _p, tgt) => {
      if (tgt) dealDamage(ww, e, tgt, 9 + ww.rng.int(0, 4), 'pierce');
    });
  }
}

function fountainTick(w: World, e: Entity): void {
  const f = e.def.fountain!;
  const bs = e.b!;
  const neutral = w.players[e.owner].isNeutral;
  // pools refill slowly (this runs twice per second)
  if (f.pool) bs.pool = Math.min(f.pool, bs.pool + 0.75);
  for (const u of w.query(e.x, e.y, f.radius)) {
    if (!u.isUnit || (!neutral && !w.isAlly(e.owner, u.owner))) continue;
    if (u.def.tags?.mechanical) continue;
    if (f.hp && u.hp < u.st.maxHp) {
      let amt = f.hp * 0.5;
      if (f.pool) {
        amt = Math.min(amt * 3, bs.pool, u.st.maxHp - u.hp);
        bs.pool -= amt;
      }
      heal(w, u, amt);
    }
    if (f.mana && u.mana < u.st.maxMana) {
      let amt = f.mana * 0.5;
      if (f.pool) {
        amt = Math.min(amt * 2, bs.pool, u.st.maxMana - u.mana);
        bs.pool -= amt;
      }
      u.mana = Math.min(u.st.maxMana, u.mana + amt);
    }
  }
}

function restockTick(e: Entity): void {
  const bs = e.b!;
  for (const id of Object.keys(bs.stock)) {
    const s = bs.stock[id];
    if (s.count >= 3) continue;
    s.restock += 1;
    if (s.restock >= 40) {
      s.restock = 0;
      s.count++;
    }
  }
}

function finishQueueItem(w: World, b: Entity, q: QueueItem): void {
  const p = w.players[b.owner];
  if (q.kind === 'unit') {
    const def = getDef(q.id);
    const pos = w.findSpawnPos(b, b.b!.rallyX, b.b!.rallyY, def.radius ?? 0.35);
    const u = w.spawnUnit(q.id, b.owner, pos[0], pos[1]);
    u.facing = Math.atan2(b.b!.rallyY - u.y, b.b!.rallyX - u.x);
    p.stats.unitsTrained++;
    w.emit({ t: 'trained', id: u.id, owner: b.owner });
    applyRally(w, b, u);
  } else if (q.kind === 'research') {
    p.upgrades.set(q.id, q.level ?? 1);
    p.researching.delete(q.id);
    for (const u of w.entities) if (u.owner === b.owner) u.statsDirty = true;
    w.emit({ t: 'research', owner: b.owner, upgrade: q.id, level: q.level ?? 1 });
    const up = UPGRADES[q.id];
    if (up?.unlocksAbility) {
      for (const u of w.entities) if (u.owner === b.owner) initAbilities(w, u, true);
    }
  } else if (q.kind === 'upgrade') {
    const nd = getDef(q.id);
    const frac = b.hp / b.st.maxHp;
    b.def = nd;
    initAbilities(w, b, true);
    recomputeStats(w, b);
    b.hp = b.st.maxHp * frac;
    for (const u of w.entities) if (u.owner === b.owner) u.statsDirty = true;
    w.emit({ t: 'upgraded', id: b.id, owner: b.owner });
  } else if (q.kind === 'revive') {
    const hero = w.get(Number(q.id));
    if (hero) reviveHeroAt(w, hero, b);
  }
}

export function applyRally(w: World, b: Entity, u: Entity): void {
  const bs = b.b!;
  if (!bs.hasRally) return;
  if (bs.rallyTree >= 0 && u.isWorker) {
    u.order = { type: 'gather', tree: bs.rallyTree };
    return;
  }
  if (bs.rallyTarget >= 0) {
    const t = w.valid(bs.rallyTarget);
    if (t) {
      if (u.isWorker && (t.def.goldMine || t.def.onMine)) {
        u.order = { type: 'gather', target: t.id };
        return;
      }
      if (t.id !== b.id && t.isUnit) {
        u.order = { type: 'follow', target: t.id };
        return;
      }
    }
  }
  u.order = { type: 'move', x: bs.rallyX, y: bs.rallyY };
}

/** Called from kill() for buildings. */
export function onBuildingDestroyed(w: World, e: Entity): void {
  const bs = e.b!;
  w.releaseFootprint(e);
  // refund nothing; eject workers
  for (const u of w.entities) {
    if (u.inside === e.id && u.alive) {
      exitBuilding(w, u, e);
      u.order = null;
    }
  }
  if (bs.insideBuilder >= 0) {
    const u = w.get(bs.insideBuilder);
    if (u && u.alive) {
      u.inside = -1;
      u.order = null;
    }
  }
  // queued items lost; researching flags cleared
  const p = w.players[e.owner];
  for (const q of bs.queue) {
    if (q.kind === 'research') p.researching.delete(q.id);
    if (q.kind === 'revive') {
      const h = w.get(Number(q.id));
      if (h && h.hero) h.hero.reviving = false;
    }
  }
  bs.queue.length = 0;
  // twilight binding
  if (e.def.mainHall) {
    for (const m of w.entities) {
      if (m.b && m.b.boundBy === e.id) {
        m.b.boundBy = -1;
        for (const id of [...m.b.miners]) {
          const u = w.get(id);
          if (u && u.alive) exitBuilding(w, u, m);
        }
        m.b.miners.length = 0;
      }
    }
  }
}

/** Cancel the last queue item of a building (refund). */
export function cancelQueueItem(w: World, b: Entity, index: number): void {
  const bs = b.b!;
  if (index < 0 || index >= bs.queue.length) return;
  const q = bs.queue.splice(index, 1)[0];
  const p = w.players[b.owner];
  p.gold += q.gold;
  p.lumber += q.lumber;
  if (q.kind === 'research') p.researching.delete(q.id);
  if (q.kind === 'revive') {
    const h = w.get(Number(q.id));
    if (h && h.hero) h.hero.reviving = false;
  }
}

export function cancelConstruction(w: World, b: Entity): void {
  const bs = b.b!;
  if (!bs.constructing) return;
  const p = w.players[b.owner];
  p.gold += Math.floor(bs.paidGold * CANCEL_REFUND);
  p.lumber += Math.floor(bs.paidLumber * CANCEL_REFUND);
  for (const id of bs.builders) {
    const u = w.valid(id);
    if (u) completeOrder(w, u);
  }
  if (bs.insideBuilder >= 0) {
    const u = w.get(bs.insideBuilder);
    if (u) {
      exitBuilding(w, u, b);
      u.order = null;
    }
  }
  if (bs.insideBuilder === -2) {
    // consumed spirit returns
    const f = b.def.faction;
    const fd = FACTIONS[w.players[b.owner].faction];
    if (f === 'twilight' && fd) {
      const pos = w.findSpawnPos(b, b.x, b.y + 3, 0.3);
      w.spawnUnit(fd.worker, b.owner, pos[0], pos[1]);
    }
  }
  w.releaseFootprint(b);
  b.alive = false;
  b.removed = true;
  w.emit({ t: 'death', id: b.id, killer: -1 });
}

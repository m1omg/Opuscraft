import { ACQUIRE_RANGE_BONUS, DT } from '../data/rules';
import { dist, turnToward, wrapAngle } from '../util/math';
import type { Entity, Order } from './entity';
import type { World } from './world';
import { fireAttack, canAttack } from './combat';
import { castOrderStep, updateCast, interruptCast } from './abilities';
import { gatherStep, returnStep, buildStep, repairStep, insideStep, garrisonStep, rootStep, releaseClaims } from './economy';
import { pickupStep, giveItemStep, dropItemStep, shopStep } from './heroes';

const PATH_NODE_BUDGET = 40000;

// ---------------------------------------------------------------------------
// order bookkeeping
// ---------------------------------------------------------------------------
export function setOrder(w: World, e: Entity, o: Order | null, queued = false): void {
  if (queued && (e.order || e.queue.length)) {
    e.queue.push(o!);
    return;
  }
  releaseClaims(w, e, true);
  e.queue.length = 0;
  e.order = o;
  resetAction(w, e);
}

export function resetAction(w: World, e: Entity): void {
  e.windup = -1;
  e.hasGoal = false;
  e.goalKey = -1;
  e.path.length = 0;
  e.pathPending = false;
  e.working = false;
  e.bestDist = Infinity;
  e.noProgress = 0;
  e.repaths = 0;
  if (e.cast) interruptCast(w, e);
}

export function completeOrder(w: World, e: Entity): void {
  releaseClaims(w, e, false);
  e.order = e.queue.shift() ?? null;
  resetAction(w, e);
  if (!e.order) {
    e.idleX = e.x;
    e.idleY = e.y;
  }
}

// ---------------------------------------------------------------------------
// per tick unit update
// ---------------------------------------------------------------------------
export function updateUnit(w: World, e: Entity): void {
  if (e.dead) return;
  if (e.atkCd > 0) e.atkCd -= DT;
  e.moving = false;
  e.speedNow = 0;
  if (e.inside >= 0) {
    insideStep(w, e);
    return;
  }
  const st = e.st;
  if (st.stunned || st.sleeping) {
    e.windup = -1;
    if (e.cast) interruptCast(w, e);
    return;
  }
  if (st.feared) {
    e.windup = -1;
    if (e.cast) interruptCast(w, e);
    const fx = e.x + e.fleeX * 3;
    const fy = e.y + e.fleeY * 3;
    stepToward(w, e, fx, fy, true);
    return;
  }
  if (e.cast) {
    updateCast(w, e);
    if (e.cast) return;
  }
  if (e.windup >= 0) {
    continueWindup(w, e);
    if (e.windup >= 0) return;
  }
  if (e.backswing > 0) e.backswing -= DT;

  const o = e.order;
  if (!o) {
    idle(w, e, false);
    return;
  }
  switch (o.type) {
    case 'move':
      moveOrder(w, e, o);
      break;
    case 'follow':
      followOrder(w, e, o);
      break;
    case 'attackMove':
      attackMoveOrder(w, e, o, false);
      break;
    case 'patrol':
      attackMoveOrder(w, e, o, true);
      break;
    case 'attack':
      attackOrder(w, e, o);
      break;
    case 'attackGround':
      attackGroundOrder(w, e, o);
      break;
    case 'hold':
      idle(w, e, true);
      break;
    case 'gather':
      gatherStep(w, e, o);
      break;
    case 'returnRes':
      returnStep(w, e, o);
      break;
    case 'build':
      buildStep(w, e, o);
      break;
    case 'repair':
      repairStep(w, e, o);
      break;
    case 'cast':
      castOrderStep(w, e, o);
      break;
    case 'pickup':
      pickupStep(w, e, o);
      break;
    case 'giveItem':
      giveItemStep(w, e, o);
      break;
    case 'dropItem':
      dropItemStep(w, e, o);
      break;
    case 'shop':
      shopStep(w, e, o);
      break;
    case 'garrison':
      garrisonStep(w, e, o);
      break;
    case 'root':
      rootStep(w, e, o);
      break;
    default:
      completeOrder(w, e);
  }
}

// ---------------------------------------------------------------------------
// idle / hold
// ---------------------------------------------------------------------------
export function acquireRange(e: Entity): number {
  if (e.b) return e.st.range;
  return Math.max(4.5, e.st.range + ACQUIRE_RANGE_BONUS);
}

function idle(w: World, e: Entity, hold: boolean): void {
  if (!canAttack(e)) return;
  if (e.isWorker && !hold) return;
  // react to being attacked by something we can reach
  if (!hold && e.lastDamagedAt > w.time - 0.6 && e.lastHitBy >= 0) {
    const att = w.valid(e.lastHitBy);
    if (att && w.isEnemy(e.owner, att.owner) && canAttack(e, att) && w.canSee(e.owner, att) && dist(e.x, e.y, att.x, att.y) < 14) {
      e.order = { type: 'attack', target: att.id, auto: true, ox: e.x, oy: e.y };
      e.lastDamagedAt = -100;
      return;
    }
  }
  if (hold && e.atkTarget >= 0) {
    const t = w.valid(e.atkTarget);
    if (t && validAttackTarget(w, e, t) && w.gap(e, t) <= e.st.range + 0.05) {
      engage(w, e, t, true);
      return;
    }
  }
  e.acquireTimer -= DT;
  if (e.acquireTimer > 0) return;
  e.acquireTimer = 0.35 + (e.id % 5) * 0.03;
  const t = findTarget(w, e, hold ? e.st.range + 0.05 : acquireRange(e));
  if (!t) return;
  if (hold) {
    e.atkTarget = t.id;
    engage(w, e, t, true);
  } else {
    e.order = { type: 'attack', target: t.id, auto: true, ox: e.x, oy: e.y };
  }
}

export function validAttackTarget(w: World, e: Entity, t: Entity): boolean {
  if (!t.alive || t.removed || t.inside >= 0) return false;
  if (t.st.invulnerable) return false;
  if (!canAttack(e, t)) return false;
  if (!w.canSee(e.owner, t)) return false;
  return true;
}

export function findTarget(w: World, e: Entity, range: number): Entity | null {
  const cands = w.query(e.x, e.y, range + 1);
  let best: Entity | null = null;
  let bestScore = Infinity;
  for (const c of cands) {
    if (c === e) continue;
    if (!w.isEnemy(e.owner, c.owner)) continue;
    if (c.st.invulnerable || c.st.ethereal) continue;
    if (!canAttack(e, c)) continue;
    if (!w.canSee(e.owner, c)) continue;
    const gap = w.gap(e, c);
    if (gap > range) continue;
    let score = gap;
    if (c.b) score += c.def.weapon ? 3 : 9;
    if (c.isWorker) score += 1.5;
    if (c.atkTarget === e.id) score -= 2;
    if (c.st.polymorph) score += 4;
    if (score < bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// combat orders
// ---------------------------------------------------------------------------
/**
 * Move into range of `t` and attack it. Returns false when the target can no longer be attacked.
 * `noChase` keeps the unit in place (hold position / towers).
 */
export function engage(w: World, e: Entity, t: Entity, noChase = false): boolean {
  if (!validAttackTarget(w, e, t)) return false;
  const gap = w.gap(e, t);
  const range = e.st.range;
  if (gap > range) {
    if (noChase || e.st.rooted || e.st.speed <= 0) return gap <= range + 0.5;
    const r = moveToward(w, e, t.x, t.y, 0, t);
    if (r === 'blocked') {
      e.hasGoal = false;
      e.repaths = 0;
    }
    return true;
  }
  e.hasGoal = false;
  e.atkTarget = t.id;
  // face the target first
  const want = Math.atan2(t.y - e.y, t.x - e.x);
  const tr = (e.def.turnRate ?? 9) * DT;
  e.facing = turnToward(e.facing, want, tr);
  if (Math.abs(wrapAngle(want - e.facing)) > 0.6 && !e.b) return true;
  if (e.atkCd <= 0 && e.windup < 0) startAttack(w, e, t);
  return true;
}

export function startAttack(w: World, e: Entity, t: Entity): void {
  const wpn = e.def.weapon;
  if (!wpn) return;
  e.windup = wpn.damagePoint;
  e.atkCd = e.st.cooldown;
  e.atkTarget = t.id;
  e.animAttack = w.time;
  w.emit({ t: 'attack', src: e.id, tgt: t.id, ranged: !!wpn.projectile });
  if (e.windup <= 0) continueWindup(w, e);
}

function continueWindup(w: World, e: Entity): void {
  e.windup -= DT;
  const ground = e.order?.type === 'attackGround';
  if (ground) {
    if (e.windup <= 0) {
      e.windup = -1;
      fireAttack(w, e, null, e.atkGroundX, e.atkGroundY);
      e.backswing = 0.3;
    }
    return;
  }
  const t = w.valid(e.atkTarget);
  if (!t || !validAttackTarget(w, e, t) || w.gap(e, t) > e.st.range + 1.2) {
    e.windup = -1;
    e.atkCd = Math.min(e.atkCd, 0.2);
    return;
  }
  if (e.windup <= 0) {
    e.windup = -1;
    fireAttack(w, e, t, t.x, t.y);
    e.backswing = 0.3;
    e.chargeDist = 0;
  }
}

function attackOrder(w: World, e: Entity, o: Order): void {
  const t = w.valid(o.target ?? -1);
  if (!t || !validAttackTarget(w, e, t)) {
    if (o.auto) returnFromChase(w, e, o);
    else completeOrder(w, e);
    return;
  }
  if (o.auto && o.ox !== undefined && o.oy !== undefined) {
    const leash = acquireRange(e) + 5;
    if (dist(e.x, e.y, o.ox, o.oy) > leash) {
      returnFromChase(w, e, o);
      return;
    }
  }
  if (!engage(w, e, t)) completeOrder(w, e);
}

function returnFromChase(w: World, e: Entity, o: Order): void {
  // auto engagements return to where the unit was standing
  if (o.ox !== undefined && o.oy !== undefined && dist(e.x, e.y, o.ox, o.oy) > 1.5) {
    const next = findTarget(w, e, acquireRange(e));
    if (next && dist(next.x, next.y, o.ox, o.oy) < acquireRange(e) + 3) {
      o.target = next.id;
      return;
    }
    e.order = { type: 'move', x: o.ox, y: o.oy };
    resetAction(w, e);
    return;
  }
  const next = findTarget(w, e, acquireRange(e));
  if (next) {
    o.target = next.id;
    return;
  }
  completeOrder(w, e);
}

function attackMoveOrder(w: World, e: Entity, o: Order, patrol: boolean): void {
  if (canAttack(e)) {
    if (o.target !== undefined && o.target >= 0) {
      const t = w.valid(o.target);
      if (t && validAttackTarget(w, e, t) && w.gap(e, t) < acquireRange(e) + 4) {
        engage(w, e, t);
        return;
      }
      o.target = -1;
      e.hasGoal = false;
    }
    e.acquireTimer -= DT;
    if (e.acquireTimer <= 0) {
      e.acquireTimer = 0.3 + (e.id % 4) * 0.03;
      const t = findTarget(w, e, acquireRange(e));
      if (t) {
        o.target = t.id;
        e.hasGoal = false;
        engage(w, e, t);
        return;
      }
    }
  }
  const gx = (o.x ?? e.x) + (o.fx ?? 0);
  const gy = (o.y ?? e.y) + (o.fy ?? 0);
  const r = moveToward(w, e, gx, gy, 0.25);
  if (r !== 'moving') {
    if (patrol && o.ox !== undefined && o.oy !== undefined) {
      const nx = o.ox;
      const ny = o.oy;
      o.ox = o.x;
      o.oy = o.y;
      o.x = nx;
      o.y = ny;
      o.fx = 0;
      o.fy = 0;
      e.hasGoal = false;
    } else completeOrder(w, e);
  }
}

function attackGroundOrder(w: World, e: Entity, o: Order): void {
  const x = o.x ?? e.x;
  const y = o.y ?? e.y;
  const d = dist(e.x, e.y, x, y) - e.radius;
  if (d > e.st.range) {
    const r = moveToward(w, e, x, y, e.st.range * 0.9);
    if (r === 'blocked') completeOrder(w, e);
    return;
  }
  e.hasGoal = false;
  const want = Math.atan2(y - e.y, x - e.x);
  e.facing = turnToward(e.facing, want, (e.def.turnRate ?? 9) * DT);
  if (e.atkCd <= 0 && e.windup < 0 && e.def.weapon) {
    e.windup = e.def.weapon.damagePoint;
    e.atkCd = e.st.cooldown;
    e.atkGroundX = x;
    e.atkGroundY = y;
    e.animAttack = w.time;
    w.emit({ t: 'attack', src: e.id, tgt: -1, ranged: true });
  }
}

function moveOrder(w: World, e: Entity, o: Order): void {
  const gx = (o.x ?? e.x) + (o.fx ?? 0);
  const gy = (o.y ?? e.y) + (o.fy ?? 0);
  const r = moveToward(w, e, gx, gy, 0.2);
  if (r === 'moving') {
    // group members stop when crowding near an already-arrived friend at the destination
    if (o.group && dist(e.x, e.y, gx, gy) < 1.6 && e.noProgress > 0.4) completeOrder(w, e);
    return;
  }
  completeOrder(w, e);
}

function followOrder(w: World, e: Entity, o: Order): void {
  const t = w.valid(o.target ?? -1);
  if (!t || t.inside >= 0) {
    completeOrder(w, e);
    return;
  }
  const d = w.gap(e, t);
  if (d > 1.5) moveToward(w, e, t.x, t.y, 0, t);
  else e.hasGoal = false;
}

// ---------------------------------------------------------------------------
// movement
// ---------------------------------------------------------------------------
export type MoveResult = 'arrived' | 'moving' | 'blocked';

/**
 * Advance one tick toward (gx, gy). `stop` is the arrival distance (center to point).
 * When `target` is given the goal follows it.
 */
export interface GoalRect {
  key: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * Advance one tick toward (gx, gy). `stop` is the arrival distance (center to point).
 * Building targets (and `rect` goals such as trees) are approached at the nearest edge.
 */
export function moveToward(w: World, e: Entity, gx: number, gy: number, stop: number, target?: Entity, rect?: GoalRect): MoveResult {
  let key = -1;
  if (target && target.b) {
    const b = target.b;
    rect = { key: target.id, x0: b.tx, y0: b.ty, x1: b.tx + b.size, y1: b.ty + b.size };
  }
  if (rect) {
    key = rect.key;
    if (e.hasGoal && e.goalKey === key) {
      gx = e.goalX;
      gy = e.goalY;
    } else {
      gx = Math.max(rect.x0 - 0.45, Math.min(rect.x1 + 0.45, e.x));
      gy = Math.max(rect.y0 - 0.45, Math.min(rect.y1 + 0.45, e.y));
    }
  }
  const d = dist(e.x, e.y, gx, gy);
  if (d <= stop) {
    e.hasGoal = false;
    return 'arrived';
  }
  if (e.st.rooted || e.st.speed <= 0 || e.b) return 'blocked';

  const goalChanged =
    !e.hasGoal || (key >= 0 ? e.goalKey !== key : e.goalKey >= 0 || Math.abs(gx - e.goalX) + Math.abs(gy - e.goalY) > (target ? 1.2 : 0.4));
  if (goalChanged) {
    e.bestDist = d;
    e.noProgress = 0;
    e.repaths = 0;
    e.goalKey = key;
  }

  if (e.isAir) {
    e.hasGoal = true;
    e.goalX = gx;
    e.goalY = gy;
    stepToward(w, e, gx, gy, false);
    return 'moving';
  }

  const needPath = goalChanged || e.pathPending || (e.pathVersion !== w.map.version && !segmentClear(w, e));
  if (needPath) {
    if (!requestPath(w, e, gx, gy)) return 'moving';
  }
  // track progress
  if (d < e.bestDist - 0.08) {
    e.bestDist = d;
    e.noProgress = 0;
  } else {
    e.noProgress += DT;
    if (e.noProgress > 1.0) {
      e.noProgress = 0;
      e.bestDist = d;
      e.repaths++;
      if (e.repaths > 3) {
        e.repaths = 0;
        e.hasGoal = false;
        return 'blocked';
      }
      if (!requestPath(w, e, gx, gy)) return 'moving';
    }
  }

  let wx: number;
  let wy: number;
  if (e.pathIdx < e.path.length) {
    wx = e.path[e.pathIdx];
    wy = e.path[e.pathIdx + 1];
    if (dist(e.x, e.y, wx, wy) < Math.max(0.25, e.st.speed * DT * 1.5)) {
      e.pathIdx += 2;
      if (e.pathIdx < e.path.length) {
        wx = e.path[e.pathIdx];
        wy = e.path[e.pathIdx + 1];
      } else {
        wx = gx;
        wy = gy;
      }
    }
  } else {
    // path exhausted: steer straight at the goal (collisions keep us outside obstacles)
    wx = gx;
    wy = gy;
    if (e.pathFailed && e.noProgress > 0.6 && d > 1.5) {
      e.hasGoal = false;
      return 'blocked';
    }
  }
  stepToward(w, e, wx, wy, false);
  return 'moving';
}

function requestPath(w: World, e: Entity, gx: number, gy: number): boolean {
  if (w.path.nodesThisTick > PATH_NODE_BUDGET) {
    e.pathPending = true;
    return false;
  }
  e.pathPending = false;
  const res = w.path.findPath(e.x, e.y, gx, gy, e.large, e.radius);
  e.hasGoal = true;
  e.goalX = gx;
  e.goalY = gy;
  e.pathVersion = w.map.version;
  e.pathIdx = 0;
  if (!res) {
    e.path = [];
    e.pathFailed = true;
    return true;
  }
  e.path = res.points;
  e.pathFailed = !res.complete;
  return true;
}

function segmentClear(w: World, e: Entity): boolean {
  e.pathVersion = w.map.version;
  if (e.pathIdx >= e.path.length) return true;
  // check the next couple of segments only
  let ax = e.x;
  let ay = e.y;
  for (let i = e.pathIdx; i < Math.min(e.path.length, e.pathIdx + 6); i += 2) {
    const bx = e.path[i];
    const by = e.path[i + 1];
    if (!w.path.lineClear(ax, ay, bx, by, e.large, e.radius * 0.5)) return false;
    ax = bx;
    ay = by;
  }
  return true;
}

/** Physically move one tick toward a point (no pathing). */
export function stepToward(w: World, e: Entity, tx: number, ty: number, flee: boolean): void {
  const dx = tx - e.x;
  const dy = ty - e.y;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d < 1e-4) return;
  const want = Math.atan2(dy, dx);
  const tr = (e.def.turnRate ?? 9) * DT;
  e.facing = turnToward(e.facing, want, tr);
  // slow down while turning sharply
  const diff = Math.abs(wrapAngle(want - e.facing));
  const turnFactor = diff > 1.6 ? 0.25 : diff > 0.8 ? 0.6 : 1;
  const sp = e.st.speed * turnFactor;
  const step = Math.min(d, sp * DT);
  e.x += (dx / d) * step;
  e.y += (dy / d) * step;
  e.moving = true;
  e.speedNow = sp;
  e.chargeDist += step;
  if (!e.isAir) {
    // keep inside the map
    e.x = Math.max(1, Math.min(w.map.w - 1, e.x));
    e.y = Math.max(1, Math.min(w.map.h - 1, e.y));
  } else {
    e.x = Math.max(0.5, Math.min(w.map.w - 0.5, e.x));
    e.y = Math.max(0.5, Math.min(w.map.h - 0.5, e.y));
  }
  void flee;
}

// ---------------------------------------------------------------------------
// collisions
// ---------------------------------------------------------------------------
function pushWeight(e: Entity): number {
  if (e.order?.type === 'hold') return 12;
  if (e.st.stunned) return 6;
  if (e.windup >= 0 || e.cast) return 6;
  if (e.working) return 8;
  if (e.moving) return 1;
  if (e.order && (e.order.type === 'attack' || e.order.type === 'attackMove') && !e.moving) return 4;
  return 0.6;
}

const tmp: Entity[] = [];
export function resolveCollisions(w: World): void {
  const map = w.map;
  for (const e of w.entities) {
    if (e.kind !== 'unit' || !e.alive || e.dead || e.inside >= 0) continue;
    const air = e.isAir;
    w.spatial.query(e.x, e.y, e.radius + 1.2, tmp);
    for (const o of tmp) {
      if (o.id <= e.id || o.kind !== 'unit' || !o.alive || o.dead || o.inside >= 0) continue;
      if (o.isAir !== air) continue;
      const dx = o.x - e.x;
      const dy = o.y - e.y;
      const min = (e.radius + o.radius) * (air ? 0.8 : 1);
      const d2 = dx * dx + dy * dy;
      if (d2 >= min * min) continue;
      let d = Math.sqrt(d2);
      let nx: number;
      let ny: number;
      if (d < 1e-4) {
        const a = ((e.id * 7919 + o.id * 104729) % 628) / 100;
        nx = Math.cos(a);
        ny = Math.sin(a);
        d = 0;
      } else {
        nx = dx / d;
        ny = dy / d;
      }
      const overlap = (min - d) * (air ? 0.25 : 0.5);
      const we = pushWeight(e);
      const wo = pushWeight(o);
      const fe = wo / (we + wo);
      const fo = we / (we + wo);
      e.x -= nx * overlap * fe;
      e.y -= ny * overlap * fe;
      o.x += nx * overlap * fo;
      o.y += ny * overlap * fo;
    }
    if (!air) pushOutOfTerrain(w, e);
  }
  void map;
}

export function pushOutOfTerrain(w: World, e: Entity): void {
  const map = w.map;
  const r = e.radius * 0.95;
  const x0 = Math.floor(e.x - r);
  const x1 = Math.floor(e.x + r);
  const y0 = Math.floor(e.y - r);
  const y1 = Math.floor(e.y + r);
  for (let ty = y0; ty <= y1; ty++)
    for (let tx = x0; tx <= x1; tx++) {
      if (map.passable(tx, ty)) continue;
      const cx = Math.max(tx, Math.min(tx + 1, e.x));
      const cy = Math.max(ty, Math.min(ty + 1, e.y));
      const dx = e.x - cx;
      const dy = e.y - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 >= r * r) continue;
      if (d2 < 1e-8) {
        // center is inside the blocked tile: jump to the nearest open tile
        const p = map.nearestPassable(e.x, e.y, false, 8);
        if (p) {
          e.x = p[0];
          e.y = p[1];
        }
        return;
      }
      const d = Math.sqrt(d2);
      e.x += (dx / d) * (r - d);
      e.y += (dy / d) * (r - d);
    }
}

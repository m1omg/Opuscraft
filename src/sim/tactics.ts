import { lv } from '../data/registry';
import { dist } from '../util/math';
import type { AbilityState, Entity } from './entity';
import type { World } from './world';
import { abilityUnlocked, castError, castInstant, findCorpses, manaCost } from './abilities';

/** Decide whether a unit should cast one of its abilities right now; issues the cast. */
export function unitCastAI(w: World, e: Entity, difficulty: 'easy' | 'normal' | 'hard'): boolean {
  if (!e.alive || e.cast || e.st.silenced || e.st.stunned || e.inside >= 0) return false;
  if (e.order && e.order.type === 'cast') return false;
  for (const a of e.abilities) {
    if (!abilityUnlocked(w, e, a) || a.cd > 0) continue;
    const tg = a.def.targeting;
    if (tg === 'passive' || tg === 'aura') continue;
    if (a.autocast && a.def.autocast) continue;
    if (e.mana < manaCost(a)) continue;
    const choice = chooseTarget(w, e, a, difficulty);
    if (!choice) continue;
    if (castError(w, e, a, choice.t, choice.x, choice.y)) continue;
    if (a.def.effect.instant) {
      castInstant(w, e, a, choice.t, choice.x, choice.y);
    } else {
      const cur = e.order;
      e.order = { type: 'cast', ability: a.def.id, target: choice.t ? choice.t.id : -1, x: choice.x, y: choice.y };
      if (cur && cur.type !== 'cast') e.queue.unshift(cur);
      e.hasGoal = false;
      e.windup = -1;
    }
    return true;
  }
  return false;
}

interface Choice {
  t: Entity | null;
  x: number;
  y: number;
}

function enemiesNear(w: World, e: Entity, x: number, y: number, r: number): Entity[] {
  return w.query(x, y, r, (o) => o.kind === 'unit' && w.isEnemy(e.owner, o.owner) && w.canSee(e.owner, o) && !o.st.invulnerable);
}

function bestCluster(w: World, e: Entity, range: number, radius: number, min: number): Choice | null {
  const cands = enemiesNear(w, e, e.x, e.y, range + radius);
  let best: Choice | null = null;
  let bestN = min - 1;
  for (const c of cands) {
    if (dist(e.x, e.y, c.x, c.y) > range + 0.5) continue;
    let n = 0;
    let sx = 0;
    let sy = 0;
    for (const o of cands) {
      if (dist(o.x, o.y, c.x, c.y) <= radius) {
        n += o.hero ? 2 : 1;
        sx += o.x;
        sy += o.y;
      }
    }
    if (n > bestN) {
      bestN = n;
      best = { t: null, x: sx / Math.max(1, cands.filter((o) => dist(o.x, o.y, c.x, c.y) <= radius).length), y: sy / Math.max(1, cands.filter((o) => dist(o.x, o.y, c.x, c.y) <= radius).length) };
    }
  }
  return best;
}

function chooseTarget(w: World, e: Entity, a: AbilityState, difficulty: string): Choice | null {
  const kind = a.def.ai ?? 'utility';
  const range = Math.max(lv(a.def.range, a.level), 1);
  const spec = a.def.effect;
  const radius = lv(a.def.aoe ?? (spec.radius as number | number[] | undefined) ?? 2.5, a.level) || 2.5;
  const tg = a.def.targeting;
  const nearby = enemiesNear(w, e, e.x, e.y, Math.max(range, 7) + 2);
  const inCombat = nearby.length > 0;
  const smart = difficulty !== 'easy';

  if (spec.type === 'raiseDead') {
    const c = findCorpses(w, e.x, e.y, range + 1, 1)[0];
    return c ? { t: null, x: c.x, y: c.y } : null;
  }
  if (spec.type === 'corpseExplode') {
    if (!inCombat) return null;
    for (const c of findCorpses(w, e.x, e.y, range, 4)) {
      if (enemiesNear(w, e, c.x, c.y, radius).length >= 2) return { t: null, x: c.x, y: c.y };
    }
    return null;
  }
  switch (kind) {
    case 'never':
    case 'utility':
      return null;
    case 'heal': {
      let best: Entity | null = null;
      let bf = 0.62;
      for (const o of w.query(e.x, e.y, range + 2, (u) => u.kind === 'unit' && w.isAlly(e.owner, u.owner))) {
        const f = o.hp / o.st.maxHp;
        const weight = o.hero ? f - 0.1 : f;
        if (weight < bf) {
          bf = weight;
          best = o;
        }
      }
      if (!best) return null;
      if (tg === 'none') return { t: null, x: e.x, y: e.y };
      if (tg === 'point') return { t: null, x: best.x, y: best.y };
      return { t: best, x: best.x, y: best.y };
    }
    case 'buff': {
      if (!inCombat) return null;
      if (tg === 'none') return { t: null, x: e.x, y: e.y };
      if (tg === 'point') return { t: null, x: e.x, y: e.y };
      // ally in combat without the buff
      for (const o of w.query(e.x, e.y, range + 1, (u) => u.kind === 'unit' && w.isAlly(e.owner, u.owner))) {
        if (spec.buff && o.hasBuff(spec.buff as string)) continue;
        if (o.isWorker) continue;
        return { t: o, x: o.x, y: o.y };
      }
      return null;
    }
    case 'summon': {
      if (!inCombat) return null;
      const t = nearby[0];
      return { t: null, x: tg === 'point' ? (t.x + e.x) / 2 : e.x, y: tg === 'point' ? (t.y + e.y) / 2 : e.y };
    }
    case 'escape': {
      if (e.hp > e.st.maxHp * 0.3 || !inCombat) return null;
      let ax = 0;
      let ay = 0;
      for (const o of nearby) {
        ax += o.x - e.x;
        ay += o.y - e.y;
      }
      const d = Math.sqrt(ax * ax + ay * ay) || 1;
      if (tg === 'none') return { t: null, x: e.x, y: e.y };
      return { t: null, x: e.x - (ax / d) * range, y: e.y - (ay / d) * range };
    }
    case 'aoe':
    case 'ultimate': {
      if (!inCombat) return null;
      const min = kind === 'ultimate' ? (smart ? 4 : 3) : smart ? 3 : 2;
      if (tg === 'none') {
        const n = enemiesNear(w, e, e.x, e.y, radius).length;
        return n >= Math.min(min, 2) ? { t: null, x: e.x, y: e.y } : null;
      }
      if (tg === 'unit') {
        const t = pickNukeTarget(w, e, a, range, nearby);
        return t ? { t, x: t.x, y: t.y } : null;
      }
      return bestCluster(w, e, range, radius, min);
    }
    case 'nuke':
    case 'debuff':
    case 'disable': {
      if (!inCombat) return null;
      if (tg === 'point') {
        const c = bestCluster(w, e, range, radius, 1);
        return c;
      }
      if (tg === 'none') return enemiesNear(w, e, e.x, e.y, radius).length ? { t: null, x: e.x, y: e.y } : null;
      const t = pickNukeTarget(w, e, a, range, nearby);
      return t ? { t, x: t.x, y: t.y } : null;
    }
  }
  return null;
}

function pickNukeTarget(w: World, e: Entity, a: AbilityState, range: number, nearby: Entity[]): Entity | null {
  let best: Entity | null = null;
  let bs = -Infinity;
  for (const o of nearby) {
    if (dist(e.x, e.y, o.x, o.y) > range + 3) continue;
    if (a.def.filter?.nonHero && o.hero) continue;
    if (a.def.filter?.hero && !o.hero) continue;
    if (o.st.magicImmune) continue;
    if (a.def.effect.buff && o.hasBuff(a.def.effect.buff as string)) continue;
    let s = 0;
    if (o.hero) s += 30;
    s += (1 - o.hp / o.st.maxHp) * 20;
    s += (o.def.cost.gold + o.def.cost.lumber) / 40;
    s -= dist(e.x, e.y, o.x, o.y);
    if (s > bs) {
      bs = s;
      best = o;
    }
  }
  return best;
}

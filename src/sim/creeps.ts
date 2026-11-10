import { ITEMS } from '../data/registry';
import { CREEP_LEASH } from '../data/rules';
import { dist } from '../util/math';
import type { Entity } from './entity';
import type { World } from './world';
import { applyBuff, removeBuffsWhere } from './abilities';
import { spawnGroundItem } from './heroes';
import { setOrder } from './orders';
import { unitCastAI } from './tactics';

export interface Camp {
  id: number;
  x: number;
  y: number;
  members: number[];
  drop: number;
  difficulty: 'green' | 'orange' | 'red' | 'boss';
  cleared: boolean;
  aggro: number; // last time a member was hurt
  sleeping: boolean;
}

export function updateCreeps(w: World): void {
  for (const camp of w.camps) {
    if (camp.cleared) continue;
    const members: Entity[] = [];
    for (const id of camp.members) {
      const e = w.get(id);
      if (e && e.alive) members.push(e);
    }
    if (!members.length) continue;
    const recentlyAggro = w.time - camp.aggro < 8;
    // sleep at night when undisturbed
    const shouldSleep = w.night && !recentlyAggro && camp.difficulty !== 'boss';
    if (shouldSleep !== camp.sleeping) {
      camp.sleeping = shouldSleep;
      for (const m of members) {
        if (shouldSleep) {
          if (!m.order && !m.returning) applyBuff(w, m, 'creepsleep', 9999, null);
        } else removeBuffsWhere(w, m, (b) => b.def.id === 'creepsleep');
      }
    }
    if (camp.sleeping && recentlyAggro) {
      camp.sleeping = false;
      for (const m of members) removeBuffsWhere(w, m, (b) => b.def.id === 'creepsleep');
    }
    // the whole camp joins a fight
    let focus: Entity | null = null;
    if (w.time - camp.aggro < 1.0) {
      for (const m of members) {
        const att = w.valid(m.lastHitBy);
        if (att && m.lastDamagedAt > w.time - 1.2 && att.owner !== m.owner) {
          focus = att;
          break;
        }
      }
    }
    for (const m of members) {
      const dHome = dist(m.x, m.y, m.homeX, m.homeY);
      if (m.returning) {
        if (dHome < 0.8 || !m.order) {
          m.returning = false;
          m.order = null;
          m.facing = Math.atan2(camp.y - m.y, camp.x - m.x) + Math.PI;
        }
        continue;
      }
      if (dHome > CREEP_LEASH || (m.order && !recentlyAggro && dHome > 4 && m.order.type === 'attack' && !m.order.auto)) {
        setOrder(w, m, { type: 'move', x: m.homeX, y: m.homeY });
        m.returning = true;
        continue;
      }
      if (focus && (!m.order || m.order.type !== 'attack') && dist(focus.x, focus.y, m.homeX, m.homeY) < CREEP_LEASH) {
        setOrder(w, m, { type: 'attack', target: focus.id, auto: true, ox: m.homeX, oy: m.homeY });
      }
      if (!m.order && dHome > 1.5) {
        setOrder(w, m, { type: 'move', x: m.homeX, y: m.homeY });
        m.returning = true;
      }
      if (m.order && m.order.type === 'attack' && w.tick % 10 === 2) unitCastAI(w, m, 'normal');
    }
  }
}

export function onCreepDeath(w: World, e: Entity): void {
  const camp = w.camps[e.campId];
  if (!camp || camp.cleared) return;
  const alive = camp.members.some((id) => {
    const m = w.get(id);
    return m && m.alive;
  });
  if (alive) return;
  camp.cleared = true;
  if (camp.drop > 0) {
    const pool = Object.values(ITEMS).filter((it) => it.level === camp.drop);
    const any = pool.length ? pool : Object.values(ITEMS).filter((it) => it.level <= camp.drop);
    if (any.length) {
      const it = any[w.rng.int(0, any.length - 1)];
      spawnGroundItem(w, it.id, e.x, e.y);
    }
  }
}

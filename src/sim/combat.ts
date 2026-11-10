import { DAMAGE_TABLE, DT, HERO_KILL_XP, HERO_SPELL_FACTOR, HIGH_GROUND_MISS, UNIT_XP_BY_LEVEL, armorFactor } from '../data/rules';
import type { AttackType, ProjectileDef } from '../data/types';
import { dist } from '../util/math';
import type { Entity } from './entity';
import type { World } from './world';
import { abilityUnlocked, applyBuff, removeBuffsWhere, resolveMods } from './abilities';
import { lv } from '../data/registry';
import { grantXP, onHeroDeath } from './heroes';
import { onCreepDeath } from './creeps';
import { releaseClaims, onBuildingDestroyed } from './economy';

export interface Projectile {
  id: number;
  src: number;
  owner: number;
  tgt: number; // -1 for ground target
  x: number;
  y: number;
  z: number;
  px: number;
  py: number;
  pz: number;
  tx: number;
  ty: number;
  sx: number;
  sy: number;
  sz: number;
  speed: number;
  arc: number;
  def: ProjectileDef;
  damage: number;
  atk: AttackType;
  crit: boolean;
  splash?: { radius: number; factor: number };
  bounce?: { count: number; factor: number; range: number; hit: number[] };
  /** spell projectile callback key */
  onHit?: (w: World, p: Projectile, target: Entity | null) => void;
  done: boolean;
  t: number;
  flight: number;
  miss: boolean;
}

let projId = 1;

/** Can `e` attack at all, or attack target `t` specifically. */
export function canAttack(e: Entity, t?: Entity): boolean {
  const wpn = e.def.weapon;
  if (!wpn || e.st.disarmed || e.st.polymorph) return false;
  if (e.b && e.b.constructing) return false;
  if (!t) return true;
  if (t.isAir) return !!wpn.targets.air;
  if (t.b) return !!(wpn.targets.structure ?? wpn.targets.ground);
  return !!wpn.targets.ground;
}

function rollDamage(w: World, e: Entity): { dmg: number; crit: boolean } {
  const st = e.st;
  let dmg = st.dmgMin + w.rng.next() * (st.dmgMax - st.dmgMin);
  dmg = (dmg + st.dmgBonus) * (1 + st.dmgPct);
  let crit = false;
  if (st.critChance > 0 && w.rng.chance(st.critChance)) {
    dmg *= st.critMult;
    crit = true;
  }
  // fade / ambush bonus
  for (const b of e.buffs) {
    if (b.def.breakOnAction && b.data) {
      dmg += b.data;
      crit = true;
    }
  }
  return { dmg, crit };
}

function breakInvisibility(w: World, e: Entity): void {
  if (e.buffs.some((b) => b.def.breakOnAction)) {
    removeBuffsWhere(w, e, (b) => !!b.def.breakOnAction);
  }
}

/** Called when the attack windup completes. */
export function fireAttack(w: World, e: Entity, t: Entity | null, x: number, y: number): void {
  const wpn = e.def.weapon;
  if (!wpn) return;
  const { dmg, crit } = rollDamage(w, e);
  breakInvisibility(w, e);
  let mult = 1;
  if (t?.b && wpn.vsStructure) mult *= wpn.vsStructure;
  // lancer-style charge bonus
  if (e.def.tags?.cavalry && e.chargeDist > 4 && e.ability('charge')) {
    mult *= 1.75;
    if (t && !t.b) applyBuff(w, t, 'stun', 0.6, e);
    w.emit({ t: 'fx', fx: 'charge', x: t ? t.x : x, y: t ? t.y : y });
  }
  if (wpn.projectile) {
    const z0 = e.z + (e.b ? (e.b.size * 0.9) : 1.0);
    const tz = t ? t.z + 0.6 : 0;
    let miss = false;
    if (t && !e.isAir && !t.isAir && w.map.levelAt(t.x, t.y) > w.map.levelAt(e.x, e.y) && !t.b) {
      miss = w.rng.chance(HIGH_GROUND_MISS);
    }
    const p: Projectile = {
      id: projId++,
      src: e.id,
      owner: e.owner,
      tgt: t ? t.id : -1,
      x: e.x,
      y: e.y,
      z: z0,
      px: e.x,
      py: e.y,
      pz: z0,
      tx: x,
      ty: y,
      sx: e.x,
      sy: e.y,
      sz: z0,
      speed: wpn.projectile.speed,
      arc: wpn.projectile.arc ?? 0,
      def: wpn.projectile,
      damage: dmg * mult,
      atk: wpn.type,
      crit,
      splash: wpn.splash,
      bounce: wpn.bounce ? { ...wpn.bounce, hit: t ? [t.id] : [] } : undefined,
      done: false,
      t: 0,
      flight: Math.max(0.05, dist(e.x, e.y, x, y) / wpn.projectile.speed),
      miss,
    };
    void tz;
    w.projectiles.push(p);
  } else if (t) {
    applyAttackHit(w, e, t, dmg * mult, wpn.type, crit, true);
    if (wpn.cleave) {
      for (const o of w.query(t.x, t.y, wpn.cleave.radius)) {
        if (o === t || !w.isEnemy(e.owner, o.owner) || o.isAir || o.b) continue;
        applyAttackHit(w, e, o, dmg * mult * wpn.cleave.factor, wpn.type, false, false);
      }
      w.emit({ t: 'fx', fx: 'cleave', x: t.x, y: t.y, r: wpn.cleave.radius });
    }
  }
}

/** A weapon hit lands: evasion, on-hit effects, damage. */
export function applyAttackHit(w: World, src: Entity, t: Entity, dmg: number, atk: AttackType, crit: boolean, primary: boolean, melee = true): number {
  if (!t.alive) return 0;
  if (t.st.evasion > 0 && w.rng.chance(t.st.evasion)) {
    w.emit({ t: 'miss', tgt: t.id });
    return 0;
  }
  const st = src.st;
  if (t.isSummoned && st.bonusVsSummoned > 0) dmg += st.bonusVsSummoned;
  if (primary && st.bashChance > 0 && w.rng.chance(st.bashChance)) {
    applyBuff(w, t, 'stun', t.hero ? st.bashDur * 0.5 : st.bashDur, src);
    dmg += st.bashDmg;
    w.emit({ t: 'fx', fx: 'bash', x: t.x, y: t.y });
  }
  if (primary && st.slowOnHit > 0 && !t.b) applyBuff(w, t, 'frostslow', 3, src, { moveSpeedPct: -st.slowOnHit, attackSpeedPct: -st.slowOnHit * 0.5 });
  if (primary && st.manaBurnOnHit > 0 && t.mana > 0) {
    const burn = Math.min(t.mana, st.manaBurnOnHit);
    t.mana -= burn;
    dmg += burn * 0.5;
  }
  const dealt = dealDamage(w, src, t, dmg, atk, { crit, melee: melee && !src.def.weapon?.projectile });
  if (primary && dealt > 0 && t.alive && !t.b) {
    for (const a of src.abilities) {
      if (a.def.effect.type !== 'onHit' || !abilityUnlocked(w, src, a)) continue;
      const s = a.def.effect as Record<string, unknown>;
      applyBuff(w, t, s.buff as string, lv(s.duration, a.level), src, s.mods ? resolveMods(s.mods, a.level) : undefined, { dot: lv(s.dot, a.level) });
    }
  }
  if (dealt > 0 && st.lifesteal > 0 && !t.b && !t.def.tags?.mechanical) {
    src.hp = Math.min(src.st.maxHp, src.hp + dealt * st.lifesteal);
  }
  // thorns / spiked defenses against melee attackers
  if (dealt > 0 && melee && !src.def.weapon?.projectile && t.st.thorns > 0 && src.alive) {
    dealDamage(w, t, src, dealt * t.st.thorns, 'chaos', { spell: false, noThorns: true });
  }
  return dealt;
}

export interface DamageOpts {
  crit?: boolean;
  melee?: boolean;
  spell?: boolean;
  noThorns?: boolean;
  /** ignore hero spell reduction (ultimates, pure damage) */
  pure?: boolean;
  silent?: boolean;
}

/** Core damage routine. Returns the damage actually dealt. */
export function dealDamage(w: World, src: Entity | null, t: Entity, amount: number, atk: AttackType | 'spell', opts: DamageOpts = {}): number {
  if (!t.alive || t.removed || amount <= 0) return 0;
  const st = t.st;
  if (st.invulnerable) return 0;
  const spell = atk === 'spell' || opts.spell;
  if (spell && st.magicImmune) return 0;
  if (st.ethereal && !spell && atk !== 'magic') return 0;
  let dmg = amount;
  if (atk === 'spell') {
    dmg *= DAMAGE_TABLE.spell[t.def.armorType];
    if (t.hero && !opts.pure) dmg *= HERO_SPELL_FACTOR / DAMAGE_TABLE.spell.hero;
    dmg *= st.spellTakenMult;
  } else {
    dmg *= DAMAGE_TABLE[atk][t.def.armorType];
    dmg *= armorFactor(st.armor);
    if (src && src.def.weapon?.projectile) dmg *= st.rangedTakenMult;
  }
  if (st.ethereal && (atk === 'magic' || spell)) dmg *= 1.5;
  dmg *= st.takenMult;
  if (t.b && t.b.constructing) dmg *= 1.0;
  // absorb shields
  for (const b of t.buffs) {
    if (b.absorb > 0 && dmg > 0) {
      const a = Math.min(b.absorb, dmg);
      b.absorb -= a;
      dmg -= a;
      if (b.absorb <= 0) b.remaining = 0;
    }
  }
  if (dmg <= 0) return 0;
  if (st.sleeping) {
    removeBuffsWhere(w, t, (b) => !!b.def.flags?.includes('sleep'));
  }
  let newHp = t.hp - dmg;
  if (st.undying && newHp < 1) newHp = 1;
  const dealt = t.hp - Math.max(0, newHp);
  t.hp = newHp;
  t.animHit = w.time;
  if (src) {
    t.lastHitBy = src.id;
    t.lastDamagedAt = w.time;
    // alerts for the defending player
    const owner = w.players[t.owner];
    if (owner && !owner.isNeutral && w.isEnemy(src.owner, t.owner) && w.time - owner.lastAlertTime > 12) {
      owner.lastAlertTime = w.time;
      w.emit({ t: 'alert', owner: t.owner, x: t.x, y: t.y, kind: t.hero ? 'hero' : t.b ? 'building' : 'attack' });
    }
    if (t.campId >= 0) {
      const camp = w.camps[t.campId];
      if (camp) camp.aggro = w.time;
    }
  }
  if (!opts.silent) w.emit({ t: 'hit', src: src ? src.id : -1, tgt: t.id, amount: dealt, crit: !!opts.crit, atk: spell ? 'spell' : (atk as AttackType) });
  if (t.hp <= 0) kill(w, t, src);
  return dealt;
}

export function heal(w: World, t: Entity, amount: number, showText = false): number {
  if (!t.alive || amount <= 0) return 0;
  if (t.b && t.b.constructing) return 0;
  const before = t.hp;
  t.hp = Math.min(t.st.maxHp, t.hp + amount);
  const h = t.hp - before;
  if (showText && h >= 1) w.emit({ t: 'float', x: t.x, y: t.y, text: '+' + Math.round(h), color: 0x7dff7d });
  return h;
}

export function kill(w: World, e: Entity, killer: Entity | null): void {
  if (!e.alive) return;
  e.alive = false;
  e.hp = 0;
  e.killedBy = killer ? killer.id : -1;
  releaseClaims(w, e, true);
  e.order = null;
  e.queue.length = 0;
  e.cast = null;
  e.windup = -1;
  // drop garrison / inside units
  if (e.b) {
    onBuildingDestroyed(w, e);
  }
  if (e.kind === 'unit') {
    e.dead = true;
    e.deathTime = 0;
    w.leaveCorpse(e);
  } else {
    e.dead = true;
    e.deathTime = 0;
  }
  // buffs vanish
  e.buffs.length = 0;
  w.emit({ t: 'death', id: e.id, killer: killer ? killer.id : -1 });

  const victim = w.players[e.owner];
  const kp = killer ? w.players[killer.owner] : undefined;
  if (victim && !victim.isNeutral) {
    if (e.b) victim.stats.buildingsLost++;
    else if (!e.isSummoned) victim.stats.unitsLost++;
  }
  if (kp && killer && w.isEnemy(killer.owner, e.owner)) {
    if (e.b) kp.stats.buildingsRazed++;
    else kp.stats.unitsKilled++;
    if (e.hero) kp.stats.heroKills++;
    if (e.owner === w.hostileId) kp.stats.creepsKilled++;
  }
  // experience
  if (killer && w.isEnemy(killer.owner, e.owner) && !e.b) {
    const lvl = e.hero ? e.hero.level : e.def.level ?? 1;
    let xp = e.hero ? HERO_KILL_XP[Math.min(HERO_KILL_XP.length - 1, lvl)] : UNIT_XP_BY_LEVEL[Math.min(UNIT_XP_BY_LEVEL.length - 1, lvl)];
    if (e.isSummoned) xp *= 0.5;
    grantXP(w, killer.owner, e.x, e.y, xp, e.owner === w.hostileId);
  }
  // gold bounty for creeps
  if (killer && e.owner === w.hostileId && e.def.bounty && kp && !kp.isNeutral) {
    const g = w.rng.int(e.def.bounty[0], e.def.bounty[1]);
    kp.gold += g;
    w.emit({ t: 'float', x: e.x, y: e.y, text: '+' + g, color: 0xffd34d, owner: kp.id });
  }
  if (e.hero) onHeroDeath(w, e);
  if (e.campId >= 0) onCreepDeath(w, e);
  w.script?.onDeath?.(w, e, killer ?? undefined);
}

// ---------------------------------------------------------------------------
// projectiles
// ---------------------------------------------------------------------------
export function launchSpellProjectile(
  w: World,
  src: Entity,
  target: Entity | null,
  x: number,
  y: number,
  def: ProjectileDef,
  onHit: (w: World, p: Projectile, target: Entity | null) => void,
): Projectile {
  const z0 = src.z + 1.2;
  const p: Projectile = {
    id: projId++,
    src: src.id,
    owner: src.owner,
    tgt: target ? target.id : -1,
    x: src.x,
    y: src.y,
    z: z0,
    px: src.x,
    py: src.y,
    pz: z0,
    tx: target ? target.x : x,
    ty: target ? target.y : y,
    sx: src.x,
    sy: src.y,
    sz: z0,
    speed: def.speed,
    arc: def.arc ?? 0,
    def,
    damage: 0,
    atk: 'magic',
    crit: false,
    onHit,
    done: false,
    t: 0,
    flight: Math.max(0.05, dist(src.x, src.y, target ? target.x : x, target ? target.y : y) / def.speed),
    miss: false,
  };
  w.projectiles.push(p);
  return p;
}

export function updateProjectiles(w: World): void {
  const list = w.projectiles;
  for (const p of list) {
    if (p.done) continue;
    p.px = p.x;
    p.py = p.y;
    p.pz = p.z;
    const t = p.tgt >= 0 ? w.get(p.tgt) : undefined;
    if (t && t.alive && t.inside < 0) {
      p.tx = t.x;
      p.ty = t.y;
    }
    const tz = t ? w.map.heightAt(t.x, t.y) + t.z + 0.7 : w.map.heightAt(p.tx, p.ty) + 0.2;
    const dx = p.tx - p.x;
    const dy = p.ty - p.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    const step = p.speed * DT;
    p.t += DT;
    if (d <= step + 0.05) {
      p.x = p.tx;
      p.y = p.ty;
      p.z = tz;
      p.done = true;
      projectileHit(w, p, t && t.alive ? t : null);
      continue;
    }
    p.x += (dx / d) * step;
    p.y += (dy / d) * step;
    // height: linear blend plus arc
    const total = dist(p.sx, p.sy, p.tx, p.ty) || 1;
    const prog = Math.min(1, 1 - (d - step) / total);
    const baseZ = (w.map.heightAt(p.sx, p.sy) + p.sz) * (1 - prog) + tz * prog;
    p.z = baseZ + p.arc * total * 4 * prog * (1 - prog);
  }
  if (w.tick % 20 === 0) w.projectiles = list.filter((p) => !p.done || p.t < 0);
}

function projectileHit(w: World, p: Projectile, t: Entity | null): void {
  if (p.onHit) {
    p.onHit(w, p, t);
    return;
  }
  const src = w.get(p.src) ?? null;
  if (!src) return;
  if (p.miss && t) {
    w.emit({ t: 'miss', tgt: t.id });
    return;
  }
  if (t && (p.tgt >= 0)) {
    applyAttackHit(w, src, t, p.damage, p.atk, p.crit, true, false);
  }
  if (p.splash) {
    for (const o of w.query(p.x, p.y, p.splash.radius)) {
      if (o === t || !w.isEnemy(p.owner, o.owner) || o.isAir) continue;
      const f = p.tgt < 0 ? 1 : p.splash.factor;
      applyAttackHit(w, src, o, p.damage * f, p.atk, false, false, false);
    }
    w.emit({ t: 'fx', fx: 'splash', x: p.x, y: p.y, r: p.splash.radius });
  }
  if (p.bounce && t && p.bounce.count > 0) {
    // bounce to the nearest new enemy
    let best: Entity | null = null;
    let bd = Infinity;
    for (const o of w.query(t.x, t.y, p.bounce.range)) {
      if (!w.isEnemy(p.owner, o.owner) || p.bounce.hit.includes(o.id) || o.b) continue;
      if (!w.canSee(p.owner, o)) continue;
      const d = dist(o.x, o.y, t.x, t.y);
      if (d < bd) {
        bd = d;
        best = o;
      }
    }
    if (best) {
      const np: Projectile = {
        ...p,
        id: projId++,
        tgt: best.id,
        sx: t.x,
        sy: t.y,
        sz: 1,
        x: t.x,
        y: t.y,
        px: t.x,
        py: t.y,
        tx: best.x,
        ty: best.y,
        damage: p.damage * p.bounce.factor,
        bounce: { ...p.bounce, count: p.bounce.count - 1, hit: [...p.bounce.hit, best.id] },
        done: false,
        t: 0,
        crit: false,
        miss: false,
      };
      w.projectiles.push(np);
    }
  }
}

/** Area spell damage helper. */
export function damageArea(
  w: World,
  src: Entity,
  x: number,
  y: number,
  r: number,
  amount: number,
  filter?: (e: Entity) => boolean,
  opts: DamageOpts = {},
): Entity[] {
  const hit: Entity[] = [];
  for (const o of w.query(x, y, r)) {
    if (!w.isEnemy(src.owner, o.owner)) continue;
    if (filter && !filter(o)) continue;
    dealDamage(w, src, o, amount, 'spell', opts);
    hit.push(o);
  }
  return hit;
}

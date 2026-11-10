import { ABILITIES, BUFFS, DEFS, getBuff, getDef, lv, lvs, UPGRADES } from '../data/registry';
import {
  ARMOR_PER_AGI,
  ATTACK_SPEED_PER_AGI,
  BLIGHT_REGEN,
  DT,
  HP_PER_STR,
  MANA_PER_INT,
  MANA_REGEN_PER_INT,
  NIGHT_REGEN_BONUS,
  REGEN_PER_STR,
} from '../data/rules';
import type { AbilityDef, StatMods, TargetFilter } from '../data/types';
import { dist } from '../util/math';
import type { AbilityState, BuffState, CastState, Entity, Order } from './entity';
import type { World } from './world';
import { completeOrder, moveToward, setOrder } from './orders';
import { damageArea, dealDamage, heal, kill, launchSpellProjectile } from './combat';
import { uproot, unloadGarrison, autoBindMine } from './economy';
import { consumeItemCharge } from './heroes';
import { pushOutOfTerrain } from './orders';

// ---------------------------------------------------------------------------
// world-level spell objects
// ---------------------------------------------------------------------------
export interface Zone {
  x: number;
  y: number;
  r: number;
  until: number;
  next: number;
  interval: number;
  src: number;
  owner: number;
  spec: Record<string, unknown>;
  level: number;
  fx: string;
  channelOf: number;
}
export interface Reveal {
  x: number;
  y: number;
  r: number;
  until: number;
  owner: number;
}
export interface Timer {
  at: number;
  fn: (w: World) => void;
}

// ---------------------------------------------------------------------------
// ability setup
// ---------------------------------------------------------------------------
export function initAbilities(w: World, e: Entity, keep = false): void {
  const old = keep ? e.abilities : [];
  const ids: string[] = [...(e.def.abilities ?? [])];
  if (e.def.hero) for (const id of e.def.hero.abilities) if (!ids.includes(id)) ids.push(id);
  const list: AbilityState[] = [];
  for (const id of ids) {
    const def = ABILITIES[id];
    if (!def) continue;
    const prev = old.find((a) => a.def.id === id) ?? e.abilities.find((a) => a.def.id === id);
    const isHeroSkill = !!e.def.hero && e.def.hero.abilities.includes(id);
    list.push({
      def,
      level: prev ? prev.level : isHeroSkill ? 0 : 1,
      cd: prev ? prev.cd : 0,
      autocast: prev ? prev.autocast : !!def.autocastDefault || (w.players[e.owner]?.isAI ?? false),
    });
  }
  e.abilities = list;
  e.statsDirty = true;
  void getDef;
}

export function abilityUnlocked(w: World, e: Entity, a: AbilityState): boolean {
  if (a.level < 1) return false;
  if (a.def.requiresUpgrade && w.players[e.owner].upgradeLevel(a.def.requiresUpgrade) < 1) return false;
  return true;
}

// ---------------------------------------------------------------------------
// stats
// ---------------------------------------------------------------------------
function addMods(acc: StatMods, m: StatMods | undefined, scale = 1): void {
  if (!m) return;
  for (const k in m) {
    const key = k as keyof StatMods;
    const v = m[key];
    if (typeof v === 'number') acc[key] = ((acc[key] as number | undefined) ?? 0) + v * scale;
  }
}

function resolveMods(spec: unknown, level: number): StatMods {
  const out: StatMods = {};
  if (!spec || typeof spec !== 'object') return out;
  for (const k in spec as Record<string, unknown>) {
    (out as Record<string, number>)[k] = lv((spec as Record<string, unknown>)[k], level);
  }
  return out;
}

function upgradeApplies(w: World, e: Entity, appliesTo: string[]): boolean {
  for (const a of appliesTo) {
    if (a === e.def.id) return true;
    if (e.hero) continue;
    if (a === 'unit' && e.kind === 'unit') return true;
    if (a === 'building' && e.kind === 'building') return true;
    if (a.startsWith('tag:')) {
      const tag = a.slice(4);
      if (tag === 'air' && e.isAir) return true;
      if ((e.def.tags as Record<string, boolean> | undefined)?.[tag]) return true;
    }
  }
  return false;
}

export function recomputeStats(w: World, e: Entity): void {
  const d = e.def;
  const st = e.st;
  const oldMax = st.maxHp;
  const oldMaxMana = st.maxMana;
  const m: StatMods = {};
  const p = w.players[e.owner];

  // upgrades
  if (p && p.upgrades.size) {
    for (const [id, level] of p.upgrades) {
      const up = UPGRADES[id];
      if (!up || !upgradeApplies(w, e, up.appliesTo)) continue;
      if (up.modsPerLevel) addMods(m, up.modsPerLevel[Math.min(up.modsPerLevel.length, level) - 1]);
      else addMods(m, up.mods, level);
    }
  }
  // passives
  for (const a of e.abilities) {
    if (a.level < 1) continue;
    if (a.def.effect.type === 'passive' && abilityUnlocked(w, e, a)) addMods(m, resolveMods(a.def.effect.mods, a.level));
  }
  // items
  if (e.hero) {
    for (const it of e.hero.inventory) if (it) addMods(m, it.def.mods);
  }
  // buffs
  const flags = new Set<string>();
  for (const b of e.buffs) {
    addMods(m, b.mods, b.stacks);
    if (b.def.flags) for (const f of b.def.flags) flags.add(f);
  }
  // faction / environment
  if (d.faction === 'twilight' && w.night && e.kind === 'unit') m.hpRegen = (m.hpRegen ?? 0) + NIGHT_REGEN_BONUS;

  st.str = st.agi = st.int = 0;
  let maxHp = d.hp + (m.maxHp ?? 0);
  let maxMana = (d.mana ?? 0) + (m.maxMana ?? 0);
  let hpRegen = (d.hpRegen ?? (e.kind === 'unit' ? 0.25 : 0)) + (m.hpRegen ?? 0);
  let manaRegen = (d.manaRegen ?? ((d.mana ?? 0) > 0 ? 0.6 : 0)) + (m.manaRegen ?? 0);
  let armor = d.armor + (m.armor ?? 0);
  let atkSpeed = 1 + (m.attackSpeedPct ?? 0);
  let dmgBonus = m.damageFlat ?? 0;
  if (e.hero && d.hero) {
    const lvl = e.hero.level - 1;
    st.str = Math.floor(d.hero.str + d.hero.strGain * lvl + e.hero.bonusStr + (m.str ?? 0));
    st.agi = Math.floor(d.hero.agi + d.hero.agiGain * lvl + e.hero.bonusAgi + (m.agi ?? 0));
    st.int = Math.floor(d.hero.int + d.hero.intGain * lvl + e.hero.bonusInt + (m.int ?? 0));
    maxHp += st.str * HP_PER_STR;
    hpRegen += st.str * REGEN_PER_STR;
    maxMana += st.int * MANA_PER_INT;
    manaRegen += st.int * MANA_REGEN_PER_INT;
    armor += st.agi * ARMOR_PER_AGI;
    atkSpeed += st.agi * ATTACK_SPEED_PER_AGI;
    dmgBonus += d.hero.primary === 'str' ? st.str : d.hero.primary === 'agi' ? st.agi : st.int;
  }
  if (e.kind === 'building' && m.buildingHpPct) maxHp *= 1 + m.buildingHpPct;
  st.maxHp = Math.max(1, Math.round(maxHp));
  st.maxMana = Math.max(0, Math.round(maxMana));
  st.hpRegen = hpRegen + (m.hpRegenPct ?? 0) * st.maxHp;
  st.manaRegen = manaRegen;
  st.armor = armor;
  const baseSpeed = d.speed ?? 0;
  st.speed = baseSpeed > 0 ? Math.max(0.6, Math.min(5.5, baseSpeed * (1 + (m.moveSpeedPct ?? 0)))) : 0;
  const wpn = d.weapon;
  if (wpn) {
    st.dmgMin = wpn.damage[0];
    st.dmgMax = wpn.damage[1];
    st.cooldown = Math.max(0.25, wpn.cooldown / Math.max(0.2, atkSpeed));
    st.range = wpn.range + (m.rangeBonus ?? 0);
  } else {
    st.dmgMin = st.dmgMax = 0;
    st.cooldown = 1;
    st.range = 0;
  }
  st.dmgBonus = dmgBonus;
  st.dmgPct = m.damagePct ?? 0;
  st.sightDay = d.sight[0] + (m.sightBonus ?? 0);
  st.sightNight = d.sight[1] + (m.sightBonus ?? 0);
  st.evasion = Math.min(0.8, m.evasion ?? 0);
  st.lifesteal = m.lifesteal ?? 0;
  st.thorns = m.thorns ?? 0;
  st.critChance = m.critChance ?? 0;
  st.critMult = m.critMult ? m.critMult : 2;
  st.bashChance = m.bashChance ?? 0;
  st.bashDur = m.bashDuration ?? 1;
  st.bashDmg = m.bashDamage ?? 0;
  st.slowOnHit = m.slowOnHit ?? 0;
  st.manaBurnOnHit = m.manaBurnOnHit ?? 0;
  st.bonusVsSummoned = m.bonusVsSummoned ?? 0;
  st.takenMult = Math.max(0.05, 1 + (m.damageTakenPct ?? 0));
  st.spellTakenMult = Math.max(0, 1 + (m.spellDamageTakenPct ?? 0));
  st.rangedTakenMult = Math.max(0.05, 1 + (m.rangedDamageTakenPct ?? 0));
  st.lumberCarry = 10 + (m.lumberCarry ?? 0) + (d.harvest?.lumber === 'standard' && d.faction === 'sepulchral' ? 10 : 0);
  st.goldCarry = 10 + (m.goldCarry ?? 0);
  st.stunned = flags.has('stun');
  st.rooted = flags.has('root') || flags.has('sleep');
  st.silenced = flags.has('silence') || flags.has('polymorph');
  st.disarmed = flags.has('disarm') || flags.has('polymorph') || flags.has('ethereal');
  st.invulnerable = flags.has('invulnerable');
  st.invisible = flags.has('invisible') || e.abilities.some((a) => a.def.effect.type === 'permaInvis');
  st.ethereal = flags.has('ethereal');
  st.polymorph = flags.has('polymorph');
  st.sleeping = flags.has('sleep');
  st.feared = flags.has('fear');
  st.undying = flags.has('undying');
  st.magicImmune = flags.has('magicImmune') || !!d.tags?.magicImmune;
  st.revealed = flags.has('revealed');
  st.taunted = flags.has('taunted');
  if (st.polymorph) {
    st.speed = Math.min(st.speed, 1.6);
  }
  // keep hp/mana proportion when the maximum changes
  if (oldMax > 1 && oldMax !== st.maxHp && e.alive) e.hp = Math.max(1, e.hp * (st.maxHp / oldMax));
  if (oldMaxMana > 0 && oldMaxMana !== st.maxMana) e.mana = e.mana * (st.maxMana / oldMaxMana);
  e.hp = Math.min(e.hp, st.maxHp);
  e.mana = Math.min(e.mana, st.maxMana);
  e.statsDirty = false;
}

// ---------------------------------------------------------------------------
// buffs
// ---------------------------------------------------------------------------
export interface BuffOpts {
  dot?: number;
  hot?: number;
  absorb?: number;
  aura?: boolean;
  level?: number;
  data?: number;
}

export function applyBuff(w: World, t: Entity, buffId: string, duration: number, src: Entity | null, mods?: StatMods, opts: BuffOpts = {}): BuffState | null {
  if (!t.alive) return null;
  const def = BUFFS[buffId] ?? getBuff(buffId);
  if (!def.positive && t.st.magicImmune && !opts.aura && def.id !== 'stun') return null;
  if (t.b && def.flags && def.flags.some((f) => f === 'polymorph' || f === 'sleep' || f === 'fear')) return null;
  const existing = t.buffs.find((b) => b.def.id === buffId);
  const resolvedMods = mods ?? def.mods ?? {};
  if (existing) {
    if (def.maxStacks && existing.stacks < def.maxStacks) existing.stacks++;
    if ((opts.level ?? 1) >= existing.level || existing.remaining < duration * 0.5) {
      existing.mods = resolvedMods;
      existing.level = opts.level ?? 1;
      existing.dot = opts.dot ?? def.dot ?? 0;
      existing.hot = opts.hot ?? def.hot ?? 0;
      if (opts.absorb) existing.absorb = Math.max(existing.absorb, opts.absorb);
      if (opts.data !== undefined) existing.data = opts.data;
      existing.source = src ? src.id : -1;
    }
    existing.remaining = Math.max(existing.remaining, duration);
    existing.duration = Math.max(existing.duration, duration);
    t.statsDirty = true;
    return existing;
  }
  const b: BuffState = {
    def,
    remaining: duration,
    duration,
    source: src ? src.id : -1,
    sourceOwner: src ? src.owner : -1,
    mods: resolvedMods,
    dot: opts.dot ?? def.dot ?? 0,
    hot: opts.hot ?? def.hot ?? 0,
    absorb: opts.absorb ?? def.absorb ?? 0,
    stacks: 1,
    level: opts.level ?? 1,
    aura: !!opts.aura,
    data: opts.data,
  };
  t.buffs.push(b);
  t.statsDirty = true;
  if (def.flags?.includes('stun') || def.flags?.includes('sleep') || def.flags?.includes('polymorph')) {
    t.windup = -1;
  }
  if (def.flags?.includes('fear') && src) {
    const dx = t.x - src.x;
    const dy = t.y - src.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    t.fleeX = dx / d;
    t.fleeY = dy / d;
  }
  return b;
}

export function removeBuffsWhere(w: World, e: Entity, pred: (b: BuffState) => boolean): number {
  const before = e.buffs.length;
  e.buffs = e.buffs.filter((b) => !pred(b));
  if (e.buffs.length !== before) e.statsDirty = true;
  void w;
  return before - e.buffs.length;
}

/** Remove dispellable magic: enemy positive buffs and ally negative buffs. */
export function dispelUnit(w: World, caster: Entity, t: Entity, summonDamage: number): void {
  const enemy = w.isEnemy(caster.owner, t.owner);
  removeBuffsWhere(w, t, (b) => !b.aura && b.def.dispellable !== false && (enemy ? b.def.positive : !b.def.positive));
  if (enemy && t.isSummoned && summonDamage > 0) dealDamage(w, caster, t, summonDamage, 'spell', { pure: true });
}

export function updateBuffsAndRegen(w: World): void {
  for (const e of w.entities) {
    if (!e.alive || e.removed) continue;
    if (e.statsDirty) recomputeStats(w, e);
    // buffs
    if (e.buffs.length) {
      let changed = false;
      for (const b of e.buffs) {
        b.remaining -= DT;
        if (b.dot > 0) {
          const src = w.get(b.source) ?? null;
          dealDamage(w, src && src.alive ? src : null, e, b.dot * DT, 'spell', { silent: true, pure: true });
          if (!e.alive) break;
        }
        if (b.hot > 0) heal(w, e, b.hot * DT);
        if (b.remaining <= 0) changed = true;
      }
      if (!e.alive) continue;
      if (changed) {
        e.buffs = e.buffs.filter((b) => b.remaining > 0);
        e.statsDirty = true;
      }
    }
    const st = e.st;
    // regeneration
    if (!(e.b && e.b.constructing)) {
      let regen = st.hpRegen;
      if (e.def.tags?.undead || (e.def.faction === 'sepulchral' && e.b)) {
        const tx = Math.floor(e.x);
        const ty = Math.floor(e.y);
        if (w.map.hasBlight(tx, ty)) regen += e.b ? 4 : BLIGHT_REGEN;
      }
      if (e.returning) regen += st.maxHp * 0.08;
      if (regen !== 0 && e.hp < st.maxHp) e.hp = Math.min(st.maxHp, e.hp + regen * DT);
      if (st.manaRegen > 0 && e.mana < st.maxMana) e.mana = Math.min(st.maxMana, e.mana + st.manaRegen * DT);
    }
    for (const a of e.abilities) if (a.cd > 0) a.cd -= DT;
    if (e.hero) for (const it of e.hero.inventory) if (it && it.cd > 0) it.cd -= DT;
    if (e.lifetime > 0) {
      e.lifetime -= DT;
      if (e.lifetime <= 0) {
        e.lifetime = 0;
        w.emit({ t: 'fx', fx: 'unsummon', x: e.x, y: e.y });
        kill(w, e, null);
        e.corpse = false;
        continue;
      }
    }
    if (e.revertDef && e.revertTimer > 0) {
      e.revertTimer -= DT;
      if (e.revertTimer <= 0) revertTransform(w, e);
    }
  }
  updateZones(w);
  updateTimers(w);
}

// ---------------------------------------------------------------------------
// auras (refreshed twice per second)
// ---------------------------------------------------------------------------
export function updateAuras(w: World): void {
  for (const e of w.entities) {
    if (!e.alive || e.removed || e.inside >= 0) continue;
    if (e.b && e.b.constructing) continue;
    for (const a of e.abilities) {
      if (a.level < 1) continue;
      const t = a.def.effect.type;
      if (t !== 'aura' && t !== 'lowHpBuff' && t !== 'nightVeil') continue;
      if (!abilityUnlocked(w, e, a)) continue;
      const spec = a.def.effect as Record<string, unknown>;
      if (t === 'aura') emitAura(w, e, spec, a.level);
      else if (t === 'lowHpBuff') {
        if (e.hp < e.st.maxHp * lv(spec.threshold, a.level)) applyBuff(w, e, spec.buff as string, 1.1, e, resolveMods(spec.mods, a.level), { aura: true });
      } else if (t === 'nightVeil') {
        const still = !e.moving && e.windup < 0 && !e.cast && w.time - e.animAttack > 2 && w.time - e.lastDamagedAt > 2;
        if (w.night && still) applyBuff(w, e, 'nightveil', 1.2, e, undefined, { aura: true });
        else if (e.hasBuff('nightveil')) removeBuffsWhere(w, e, (b) => b.def.id === 'nightveil');
      }
    }
    if (e.hero) {
      for (const it of e.hero.inventory) {
        if (it?.def.aura) {
          const buff = getBuff(it.def.aura.buff);
          for (const t of w.query(e.x, e.y, it.def.aura.radius)) {
            if (t.kind !== 'unit' || !w.isAlly(e.owner, t.owner)) continue;
            applyBuff(w, t, buff.id, 1.1, e, buff.mods, { aura: true, level: 1 });
          }
        }
      }
    }
  }
}

function emitAura(w: World, e: Entity, spec: Record<string, unknown>, level: number): void {
  const r = lv(spec.radius, level);
  const enemies = spec.targets === 'enemies';
  const mods = resolveMods(spec.mods, level);
  const dot = lv(spec.dot, level);
  const hot = lv(spec.hot, level);
  for (const t of w.query(e.x, e.y, r)) {
    if (t.kind !== 'unit' && !spec.structures) continue;
    if (enemies ? !w.isEnemy(e.owner, t.owner) : !w.isAlly(e.owner, t.owner)) continue;
    if (spec.excludeSelf && t === e) continue;
    if (spec.organicOnly && t.def.tags?.mechanical) continue;
    if (spec.meleeOnly && t.def.weapon?.projectile) continue;
    if (spec.rangedOnly && !t.def.weapon?.projectile) continue;
    applyBuff(w, t, spec.buff as string, 1.1, e, mods, { aura: true, level, dot, hot });
  }
}

// ---------------------------------------------------------------------------
// zones, reveals, timers
// ---------------------------------------------------------------------------
function updateZones(w: World): void {
  if (!w.zones.length) return;
  for (const z of w.zones) {
    if (w.time >= z.until) continue;
    if (z.channelOf >= 0) {
      const c = w.get(z.channelOf);
      if (!c || !c.alive || !c.cast) {
        z.until = w.time;
        continue;
      }
    }
    if (w.time < z.next) continue;
    z.next += z.interval;
    const src = w.get(z.src) ?? null;
    if (!src) continue;
    const s = z.spec;
    const dmg = lv(s.damage, z.level);
    const healAmt = lv(s.heal, z.level);
    const mods = s.mods ? resolveMods(s.mods, z.level) : undefined;
    for (const t of w.query(z.x, z.y, z.r)) {
      const enemy = w.isEnemy(z.owner, t.owner);
      const ally = w.isAlly(z.owner, t.owner);
      if (t.b && !s.structures && enemy) continue;
      if (enemy && dmg > 0) {
        const m = t.b ? lv(s.structureMult ?? 1, z.level) : 1;
        dealDamage(w, src, t, dmg * m, 'spell', { silent: false });
      }
      if (ally && healAmt > 0 && !t.b && !t.def.tags?.mechanical) heal(w, t, healAmt);
      if (s.buff && ((s.buffAllies && ally) || (!s.buffAllies && enemy)) && !t.b) {
        applyBuff(w, t, s.buff as string, z.interval + 0.2, src, mods, { level: z.level });
      }
    }
  }
  if (w.tick % 20 === 0) w.zones = w.zones.filter((z) => w.time < z.until);
}

function updateTimers(w: World): void {
  if (!w.timers.length) return;
  const due = w.timers.filter((t) => t.at <= w.time);
  if (!due.length) return;
  w.timers = w.timers.filter((t) => t.at > w.time);
  for (const t of due) t.fn(w);
}

// ---------------------------------------------------------------------------
// casting
// ---------------------------------------------------------------------------
export function filterOk(w: World, c: Entity, t: Entity, f: TargetFilter | undefined, ability?: AbilityDef): string | null {
  if (!t.alive || t.removed) return 'Invalid target';
  const filter = f ?? { enemy: true };
  const self = t === c;
  const ally = !self && w.isAlly(c.owner, t.owner);
  const enemy = w.isEnemy(c.owner, t.owner);
  const neutral = !ally && !enemy && !self;
  let rel = false;
  if (filter.self && self) rel = true;
  if (filter.ally && (ally || (self && !filter.notSelf))) rel = true;
  if (filter.enemy && enemy) rel = true;
  if (filter.neutral && neutral) rel = true;
  if (filter.goldMine && t.def.goldMine) return null;
  if (!rel) return filter.enemy && !filter.ally ? 'Must target an enemy' : filter.ally && !filter.enemy ? 'Must target an ally' : 'Invalid target';
  if (filter.notSelf && self) return 'Cannot target self';
  if (t.b && !filter.structure) return 'Cannot target buildings';
  if (!t.b && filter.structure && !filter.ground && !filter.air) return 'Must target a building';
  if (filter.ground === false && !t.isAir && !t.b) return 'Must target air units';
  if (filter.air === false && t.isAir) return 'Cannot target air units';
  if (filter.nonHero && t.hero) return 'Cannot target heroes';
  if (filter.hero && !t.hero) return 'Must target a hero';
  if (filter.organic && t.def.tags?.mechanical) return 'Cannot target mechanical units';
  if (filter.undead === true && !t.def.tags?.undead) return 'Must target undead';
  if (filter.undead === false && t.def.tags?.undead) return 'Cannot target undead';
  if (filter.summoned && !t.isSummoned) return 'Must target a summoned unit';
  if (filter.worker && !t.isWorker) return 'Must target a worker';
  if (t.st.magicImmune && !(ability?.ultimate)) return 'Target is immune to magic';
  if (t.st.invulnerable && enemy) return 'Target is invulnerable';
  if (enemy && !w.canSee(c.owner, t)) return 'Target is not visible';
  return null;
}

export function manaCost(a: AbilityState): number {
  return lv(a.def.mana, Math.max(1, a.level));
}

export function castError(w: World, e: Entity, a: AbilityState, target: Entity | null, x?: number, y?: number): string | null {
  if (a.itemSlot === undefined && !abilityUnlocked(w, e, a)) {
    if (a.level < 1) return 'Ability not learned';
    const up = UPGRADES[a.def.requiresUpgrade!];
    return 'Requires ' + (up ? up.name : 'research');
  }
  if (a.def.targeting === 'passive' || a.def.targeting === 'aura') return 'This ability is passive';
  if (a.cd > 0) return 'Ability is not ready yet';
  if (e.mana < manaCost(a)) return 'Not enough mana';
  if (e.st.silenced) return 'Unable to cast while silenced';
  if (e.st.stunned) return 'Unable to act';
  if (e.b && e.b.constructing) return 'Building is under construction';
  const tg = a.def.targeting;
  if (tg === 'unit' || (tg === 'unitOrPoint' && target)) {
    if (!target) return 'Must target a unit';
    const err = filterOk(w, e, target, a.def.filter, a.def);
    if (err) return err;
  }
  if ((tg === 'point' || tg === 'unitOrPoint') && x === undefined && !target) return 'Must target a location';
  // effect specific checks
  const spec = a.def.effect;
  if (spec.type === 'raiseDead' || spec.type === 'corpseExplode') {
    const px = target ? target.x : x ?? e.x;
    const py = target ? target.y : y ?? e.y;
    if (!findCorpses(w, px, py, spec.type === 'raiseDead' ? lv(a.def.range, a.level) + 1 : 2.5, 1).length) return 'No usable corpses nearby';
  }
  if (spec.type === 'devour' && !findCorpses(w, e.x, e.y, 3, 1).length) return 'No corpse nearby';
  if (spec.type === 'uproot' && (!e.b || !e.def.uprootTo)) return 'Cannot uproot';
  return null;
}

/** Begin executing a cast order. */
export function castOrderStep(w: World, e: Entity, o: Order): void {
  const a = findAbilityForOrder(e, o);
  if (!a) {
    completeOrder(w, e);
    return;
  }
  const t = o.target !== undefined && o.target >= 0 ? w.valid(o.target) : null;
  if (o.target !== undefined && o.target >= 0 && !t) {
    completeOrder(w, e);
    return;
  }
  const err = castError(w, e, a, t, o.x, o.y);
  if (err) {
    if (!w.players[e.owner].isAI) w.msg(e.owner, err);
    completeOrder(w, e);
    return;
  }
  const range = lv(a.def.range, a.level);
  const tg = a.def.targeting;
  if (tg !== 'none' && range > 0) {
    const tx = t ? t.x : o.x!;
    const ty = t ? t.y : o.y!;
    const d = t ? w.gap(e, t) : dist(e.x, e.y, tx, ty);
    if (d > range) {
      const r = moveToward(w, e, tx, ty, t ? 0 : range * 0.95, t ?? undefined);
      if (r === 'blocked') completeOrder(w, e);
      return;
    }
    if (t !== e) e.facing = Math.atan2(ty - e.y, tx - e.x);
  }
  e.hasGoal = false;
  e.cast = {
    ability: a,
    target: t ? t.id : -1,
    x: t ? t.x : o.x ?? e.x,
    y: t ? t.y : o.y ?? e.y,
    timer: a.def.castPoint ?? 0.3,
    channel: -1,
    tickAcc: 0,
    started: false,
    data: {},
  };
  e.animCast = w.time;
  updateCast(w, e);
}

function findAbilityForOrder(e: Entity, o: Order): AbilityState | null {
  if (o.slot !== undefined && e.hero) {
    const it = e.hero.inventory[o.slot];
    if (!it || !it.def.ability) return null;
    const def = ABILITIES[it.def.ability];
    if (!def) return null;
    return { def, level: 1, cd: it.cd, autocast: false, itemSlot: o.slot };
  }
  return e.abilities.find((a) => a.def.id === o.ability) ?? null;
}

export function updateCast(w: World, e: Entity): void {
  const c = e.cast!;
  const a = c.ability;
  if (!c.started) {
    c.timer -= DT;
    if (c.timer > 0) return;
    const t = c.target >= 0 ? w.valid(c.target) : null;
    if (c.target >= 0 && !t) {
      e.cast = null;
      finishCastOrder(w, e);
      return;
    }
    if (t) {
      c.x = t.x;
      c.y = t.y;
    }
    // final validation
    const err = castError(w, e, a, t, c.x, c.y);
    if (err) {
      e.cast = null;
      finishCastOrder(w, e);
      return;
    }
    e.mana -= manaCost(a);
    const cd = lv(a.def.cooldown, a.level);
    if (a.itemSlot !== undefined) {
      consumeItemCharge(w, e, a.itemSlot, cd);
    } else {
      const real = e.abilities.find((x) => x.def.id === a.def.id);
      if (real) real.cd = cd;
      a.cd = cd;
    }
    c.started = true;
    w.emit({ t: 'cast', id: e.id, ability: a.def.id, x: c.x, y: c.y, target: c.target });
    const h = EFFECTS[a.def.effect.type];
    if (h) h.cast(w, e, a, a.level, t, c.x, c.y, c);
    const ch = lv(a.def.channel, a.level);
    if (ch > 0 && e.alive && e.cast === c) {
      c.channel = ch;
      return;
    }
    if (e.cast === c) e.cast = null;
    finishCastOrder(w, e);
    return;
  }
  // channelling
  c.channel -= DT;
  const h = EFFECTS[a.def.effect.type];
  const t = c.target >= 0 ? w.valid(c.target) : null;
  if (h?.tick) h.tick(w, e, a, a.level, t, c.x, c.y, c);
  if (c.channel <= 0 && e.cast === c) {
    h?.end?.(w, e, a, a.level, false, c);
    e.cast = null;
    finishCastOrder(w, e);
  }
}

function finishCastOrder(w: World, e: Entity): void {
  if (e.order && e.order.type === 'cast') completeOrder(w, e);
}

export function interruptCast(w: World, e: Entity): void {
  const c = e.cast;
  if (!c) return;
  e.cast = null;
  if (c.started) {
    const h = EFFECTS[c.ability.def.effect.type];
    h?.end?.(w, e, c.ability, c.ability.level, true, c);
  }
}

/** Instant abilities (toggles, building powers, self buffs) skip the cast order. */
export function castInstant(w: World, e: Entity, a: AbilityState, target: Entity | null, x: number, y: number): boolean {
  const err = castError(w, e, a, target, x, y);
  if (err) {
    w.msg(e.owner, err);
    return false;
  }
  e.mana -= manaCost(a);
  a.cd = lv(a.def.cooldown, a.level);
  w.emit({ t: 'cast', id: e.id, ability: a.def.id, x, y, target: target ? target.id : -1 });
  EFFECTS[a.def.effect.type]?.cast(w, e, a, a.level, target, x, y, null);
  return true;
}

// ---------------------------------------------------------------------------
// autocast
// ---------------------------------------------------------------------------
export function autocastTick(w: World): void {
  for (const e of w.entities) {
    if (!e.alive || e.kind !== 'unit' || e.dead || e.inside >= 0 || e.cast) continue;
    if (e.st.stunned || e.st.silenced) continue;
    const o = e.order;
    if (o && (o.type === 'cast' || o.type === 'move' || o.type === 'build' || o.type === 'gather')) continue;
    for (const a of e.abilities) {
      if (!a.autocast || !a.def.autocast || a.cd > 0 || !abilityUnlocked(w, e, a)) continue;
      if (e.mana < manaCost(a)) continue;
      const tgt = autocastTarget(w, e, a);
      if (!tgt) continue;
      if (a.def.effect.instant) {
        castInstant(w, e, a, tgt.t, tgt.x, tgt.y);
      } else {
        const cur = e.order;
        e.order = { type: 'cast', ability: a.def.id, target: tgt.t ? tgt.t.id : -1, x: tgt.x, y: tgt.y };
        if (cur) e.queue.unshift(cur);
        e.hasGoal = false;
      }
      break;
    }
  }
}

function autocastTarget(w: World, e: Entity, a: AbilityState): { t: Entity | null; x: number; y: number } | null {
  const spec = a.def.effect;
  const range = lv(a.def.range, a.level) + 1;
  const kind = a.def.ai ?? 'utility';
  if (spec.type === 'raiseDead') {
    const c = findCorpses(w, e.x, e.y, range, 1)[0];
    return c ? { t: null, x: c.x, y: c.y } : null;
  }
  if (spec.type === 'devour') {
    if (e.hp > e.st.maxHp * 0.65) return null;
    const c = findCorpses(w, e.x, e.y, 3, 1)[0];
    return c ? { t: null, x: c.x, y: c.y } : null;
  }
  if (kind === 'heal') {
    let best: Entity | null = null;
    let bf = 0.85;
    const amount = lv(spec.amount ?? spec.hot ?? 0, a.level);
    for (const t of w.query(e.x, e.y, range)) {
      if (t.kind !== 'unit' || !w.isAlly(e.owner, t.owner)) continue;
      if (filterOk(w, e, t, a.def.filter, a.def)) continue;
      if (t.st.maxHp - t.hp < Math.min(amount * 0.5, t.st.maxHp * 0.3)) continue;
      if (spec.buff && t.hasBuff(spec.buff as string)) continue;
      const f = t.hp / t.st.maxHp;
      if (f < bf) {
        bf = f;
        best = t;
      }
    }
    return best ? { t: best, x: best.x, y: best.y } : null;
  }
  if (kind === 'buff') {
    for (const t of w.query(e.x, e.y, range)) {
      if (t.kind !== 'unit' || !w.isAlly(e.owner, t.owner)) continue;
      if (filterOk(w, e, t, a.def.filter, a.def)) continue;
      if (spec.buff && t.hasBuff(spec.buff as string)) continue;
      const fighting = t.lastDamagedAt > w.time - 3 || (t.atkTarget >= 0 && w.time - t.animAttack < 3);
      if (!fighting) continue;
      return { t, x: t.x, y: t.y };
    }
    return null;
  }
  if (kind === 'debuff' || kind === 'nuke' || kind === 'disable') {
    if (!(e.lastDamagedAt > w.time - 4 || w.time - e.animAttack < 3)) return null;
    for (const t of w.query(e.x, e.y, range)) {
      if (!w.isEnemy(e.owner, t.owner)) continue;
      if (filterOk(w, e, t, a.def.filter, a.def)) continue;
      if (spec.buff && t.hasBuff(spec.buff as string)) continue;
      return { t, x: t.x, y: t.y };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// corpses
// ---------------------------------------------------------------------------
export function findCorpses(w: World, x: number, y: number, r: number, n: number): Entity[] {
  const out: Entity[] = [];
  for (const e of w.entities) {
    if (!e.corpse || e.removed) continue;
    if (dist(e.x, e.y, x, y) > r) continue;
    out.push(e);
  }
  out.sort((a, b) => dist(a.x, a.y, x, y) - dist(b.x, b.y, x, y));
  return out.slice(0, n);
}

function consumeCorpse(w: World, c: Entity): void {
  c.corpse = false;
  c.removed = true;
  w.emit({ t: 'fx', fx: 'corpseGone', x: c.x, y: c.y });
}

// ---------------------------------------------------------------------------
// transformation helpers
// ---------------------------------------------------------------------------
export function transformInto(w: World, e: Entity, defId: string, duration: number): void {
  const nd = DEFS[defId];
  if (!nd) return;
  const frac = e.hp / e.st.maxHp;
  if (duration > 0) {
    e.revertDef = e.def;
    e.revertTimer = duration;
  } else {
    e.revertDef = null;
    e.revertTimer = 0;
  }
  e.def = nd;
  e.radius = nd.radius ?? e.radius;
  initAbilities(w, e, true);
  recomputeStats(w, e);
  e.hp = Math.max(1, e.st.maxHp * frac);
  if (nd.air) e.z = nd.flyHeight ?? 2.6;
  else e.z = 0;
  w.emit({ t: 'fx', fx: 'transform', x: e.x, y: e.y, target: e.id });
}

export function revertTransform(w: World, e: Entity): void {
  const back = e.revertDef;
  if (!back) return;
  e.revertDef = null;
  e.revertTimer = 0;
  const frac = e.hp / e.st.maxHp;
  e.def = back;
  e.radius = back.radius ?? e.radius;
  initAbilities(w, e, true);
  recomputeStats(w, e);
  e.hp = Math.max(1, e.st.maxHp * frac);
  e.z = back.air ? back.flyHeight ?? 2.6 : 0;
  w.emit({ t: 'fx', fx: 'transform', x: e.x, y: e.y, target: e.id });
  if (e.isWorker) e.order = null;
}

// ---------------------------------------------------------------------------
// effect implementations
// ---------------------------------------------------------------------------
type Handler = {
  cast(w: World, c: Entity, a: AbilityState, lvl: number, t: Entity | null, x: number, y: number, cs: CastState | null): void;
  tick?(w: World, c: Entity, a: AbilityState, lvl: number, t: Entity | null, x: number, y: number, cs: CastState): void;
  end?(w: World, c: Entity, a: AbilityState, lvl: number, interrupted: boolean, cs: CastState): void;
};

function S(a: AbilityState): Record<string, unknown> {
  return a.def.effect as Record<string, unknown>;
}

/** apply the 'payload' of a damage-type spell to one target */
function payload(w: World, c: Entity, a: AbilityState, lvl: number, t: Entity, scale = 1): void {
  const s = S(a);
  const enemy = w.isEnemy(c.owner, t.owner);
  const dmg = lv(s.damage, lvl) * scale;
  if (enemy) {
    let d = dmg;
    if (t.isSummoned && s.bonusSummoned) d += lv(s.bonusSummoned, lvl);
    if (s.undeadDouble && t.def.tags?.undead) d *= 2;
    if (d > 0) dealDamage(w, c, t, d, 'spell', { pure: !!a.def.ultimate });
    if (!t.alive) return;
    const stun = t.hero ? lv(s.stunHero ?? s.stun, lvl) : lv(s.stun, lvl);
    if (stun > 0) applyBuff(w, t, 'stun', stun, c);
    if (s.buff && !s.buffAllies) {
      const dur = t.hero && s.durationHero !== undefined ? lv(s.durationHero, lvl) : lv(s.duration, lvl);
      applyBuff(w, t, s.buff as string, dur, c, s.mods ? resolveMods(s.mods, lvl) : undefined, {
        dot: lv(s.dot, lvl),
        level: lvl,
      });
    }
    if (s.purge && t.alive) dispelUnit(w, c, t, lv(s.summonDamage, lvl));
    if (s.manaBurn) {
      const burn = Math.min(t.mana, lv(s.manaBurn, lvl));
      t.mana -= burn;
      dealDamage(w, c, t, burn, 'spell');
    }
  } else if (w.isAlly(c.owner, t.owner)) {
    if (s.healAllies && dmg > 0) heal(w, t, dmg * (s.healFactor !== undefined ? lv(s.healFactor, lvl) : 1), true);
    if (s.heal) heal(w, t, lv(s.heal, lvl) * scale, true);
    if (s.buff && s.buffAllies) {
      applyBuff(w, t, s.buff as string, lv(s.duration, lvl), c, s.mods ? resolveMods(s.mods, lvl) : undefined, {
        hot: lv(s.hot, lvl),
        absorb: lv(s.absorb, lvl),
        level: lvl,
      });
    }
  }
}

function areaTargets(w: World, c: Entity, x: number, y: number, r: number, s: Record<string, unknown>): Entity[] {
  const who = (s.affects as string) ?? 'enemies';
  return w.query(x, y, r, (t) => {
    if (t.kind === 'building' && !s.structures) return false;
    if (t.kind === 'item') return false;
    if (s.groundOnly && t.isAir) return false;
    const enemy = w.isEnemy(c.owner, t.owner);
    const ally = w.isAlly(c.owner, t.owner);
    if (who === 'enemies' && !enemy) return false;
    if (who === 'allies' && !ally) return false;
    if (who === 'all' && !enemy && !ally) return false;
    if (t === c && s.excludeSelf) return false;
    if (enemy && t.st.magicImmune && !s.ignoreImmunity) return false;
    if (enemy && !w.canSee(c.owner, t) && t.st.invisible) return false;
    return true;
  });
}

export const EFFECTS: Record<string, Handler> = {
  // single-target damage / heal / buff
  damage: {
    cast(w, c, a, lvl, t) {
      if (!t) return;
      const s = S(a);
      if (s.projectile) {
        launchSpellProjectile(w, c, t, t.x, t.y, s.projectile as never, (ww, _p, tgt) => {
          if (tgt && tgt.alive) payload(ww, c, a, lvl, tgt);
        });
      } else {
        payload(w, c, a, lvl, t);
        w.emit({ t: 'fx', fx: (s.fx as string) ?? 'spellHit', x: t.x, y: t.y, target: t.id, src: c.id });
      }
    },
  },
  heal: {
    cast(w, c, a, lvl, t) {
      const target = t ?? c;
      const s = S(a);
      if (s.amount) heal(w, target, lv(s.amount, lvl), true);
      if (s.mana) target.mana = Math.min(target.st.maxMana, target.mana + lv(s.mana, lvl));
      if (s.buff) applyBuff(w, target, s.buff as string, lv(s.duration, lvl), c, s.mods ? resolveMods(s.mods, lvl) : undefined, { hot: lv(s.hot, lvl), level: lvl });
      w.emit({ t: 'fx', fx: (s.fx as string) ?? 'heal', x: target.x, y: target.y, target: target.id });
    },
  },
  buff: {
    cast(w, c, a, lvl, t, x, y) {
      const s = S(a);
      const who = (s.targets as string) ?? 'target';
      const mods = s.mods ? resolveMods(s.mods, lvl) : undefined;
      const opts: BuffOpts = { hot: lv(s.hot, lvl), dot: lv(s.dot, lvl), absorb: lv(s.absorb, lvl), level: lvl, data: s.bonusDamage ? lv(s.bonusDamage, lvl) : undefined };
      let dur = lv(s.duration, lvl);
      if (who === 'self') {
        applyBuff(w, c, s.buff as string, dur, c, mods, opts);
        w.emit({ t: 'fx', fx: (s.fx as string) ?? 'buff', x: c.x, y: c.y, target: c.id });
      } else if (who === 'target' && t) {
        if (t.hero && s.durationHero !== undefined) dur = lv(s.durationHero, lvl);
        applyBuff(w, t, s.buff as string, dur, c, mods, opts);
        w.emit({ t: 'fx', fx: (s.fx as string) ?? 'buff', x: t.x, y: t.y, target: t.id });
      } else {
        const r = lv(s.radius, lvl);
        const cx = who === 'aroundSelf' ? c.x : x;
        const cy = who === 'aroundSelf' ? c.y : y;
        for (const u of areaTargets(w, c, cx, cy, r, s)) {
          const d = u.hero && s.durationHero !== undefined ? lv(s.durationHero, lvl) : dur;
          applyBuff(w, u, s.buff as string, d, c, mods, opts);
        }
        w.emit({ t: 'fx', fx: (s.fx as string) ?? 'buffArea', x: cx, y: cy, r });
      }
      if (s.dispelSelf) dispelUnit(w, c, c, 0);
    },
  },
  area: {
    cast(w, c, a, lvl, t, x, y) {
      const s = S(a);
      const r = lv(s.radius, lvl);
      const cx = s.center === 'self' ? c.x : x;
      const cy = s.center === 'self' ? c.y : y;
      const delay = lv(s.delay, lvl);
      const run = (ww: World) => {
        if (!c.alive && !s.persistAfterDeath) return;
        ww.emit({ t: 'fx', fx: (s.fx as string) ?? 'blast', x: cx, y: cy, r, color: s.color as number | undefined });
        for (const u of areaTargets(ww, c, cx, cy, r, s)) payload(ww, c, a, lvl, u);
        if (s.forceDay) {
          ww.forcedDay = Math.max(ww.forcedDay, lv(s.forceDay, lvl));
          ww.forcedNight = 0;
        }
      };
      if (delay > 0) {
        w.emit({ t: 'fx', fx: (s.warnFx as string) ?? 'warn', x: cx, y: cy, r, dur: delay });
        w.timers.push({ at: w.time + delay, fn: run });
      } else run(w);
      void t;
    },
  },
  zone: {
    cast(w, c, a, lvl, t, x, y) {
      const s = S(a);
      const r = lv(s.radius, lvl);
      const dur = lv(s.duration, lvl) || lv(a.def.channel, lvl);
      const cx = s.center === 'self' ? c.x : x;
      const cy = s.center === 'self' ? c.y : y;
      w.zones.push({
        x: cx,
        y: cy,
        r,
        until: w.time + dur,
        next: w.time + (lv(s.firstDelay, lvl) || 0.05),
        interval: lv(s.interval, lvl) || 1,
        src: c.id,
        owner: c.owner,
        spec: s,
        level: lvl,
        fx: (s.fx as string) ?? 'zone',
        channelOf: lv(a.def.channel, lvl) > 0 ? c.id : -1,
      });
      w.emit({ t: 'fx', fx: (s.fx as string) ?? 'zone', x: cx, y: cy, r, dur, color: s.color as number | undefined });
      void t;
    },
  },
  chain: {
    cast(w, c, a, lvl, t) {
      if (!t) return;
      const s = S(a);
      const bounces = lv(s.bounces, lvl);
      const falloff = lv(s.falloff, lvl) || 0.85;
      const range = lv(s.bounceRange, lvl) || 5;
      let cur: Entity = t;
      let prev: Entity = c;
      const hit = new Set<number>();
      let scale = 1;
      for (let i = 0; i <= bounces; i++) {
        w.emit({ t: 'fx', fx: (s.fx as string) ?? 'lightning', x: prev.x, y: prev.y, x2: cur.x, y2: cur.y, src: prev.id, target: cur.id });
        payload(w, c, a, lvl, cur, scale);
        hit.add(cur.id);
        scale *= falloff;
        let next: Entity | null = null;
        let bd = Infinity;
        for (const o of w.query(cur.x, cur.y, range)) {
          if (hit.has(o.id) || !w.isEnemy(c.owner, o.owner) || o.b || o.st.magicImmune) continue;
          if (!w.canSee(c.owner, o)) continue;
          const d = dist(o.x, o.y, cur.x, cur.y);
          if (d < bd) {
            bd = d;
            next = o;
          }
        }
        if (!next) break;
        prev = cur;
        cur = next;
      }
    },
  },
  line: {
    cast(w, c, a, lvl, t, x, y) {
      const s = S(a);
      const len = lv(s.length, lvl);
      const width = lv(s.width, lvl) || 1.2;
      let dx = x - c.x;
      let dy = y - c.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      dx /= d;
      dy /= d;
      const ex = c.x + dx * len;
      const ey = c.y + dy * len;
      w.emit({ t: 'fx', fx: (s.fx as string) ?? 'line', x: c.x, y: c.y, x2: ex, y2: ey, r: width });
      const cands = w.query((c.x + ex) / 2, (c.y + ey) / 2, len / 2 + width);
      for (const u of cands) {
        if (!w.isEnemy(c.owner, u.owner) || u.b || u.st.magicImmune) continue;
        // distance from segment
        const px = u.x - c.x;
        const py = u.y - c.y;
        const along = px * dx + py * dy;
        if (along < 0 || along > len) continue;
        const perp = Math.abs(px * dy - py * dx);
        if (perp > width + u.radius) continue;
        payload(w, c, a, lvl, u);
      }
      void t;
    },
  },
  summon: {
    cast(w, c, a, lvl, t, x, y) {
      const s = S(a);
      const unit = lvs(s.unit, lvl);
      const n = lv(s.count, lvl) || 1;
      const dur = lv(s.duration, lvl);
      const atTarget = s.at === 'target';
      const cx = atTarget ? x : c.x + Math.cos(c.facing) * 1.5;
      const cy = atTarget ? y : c.y + Math.sin(c.facing) * 1.5;
      for (let i = 0; i < n; i++) {
        const ang = (i / n) * Math.PI * 2;
        const off = n > 1 ? 0.9 : 0;
        const p = DEFS[unit]?.air ? [cx + Math.cos(ang) * off, cy + Math.sin(ang) * off] : w.map.nearestPassable(cx + Math.cos(ang) * off, cy + Math.sin(ang) * off, false, 6) ?? [cx, cy];
        const u = w.spawnUnit(unit, c.owner, p[0], p[1], c.facing);
        if (dur > 0) {
          u.lifetime = dur;
          u.maxLifetime = dur;
        }
        w.emit({ t: 'fx', fx: (s.fx as string) ?? 'summon', x: u.x, y: u.y, target: u.id });
      }
      void t;
    },
  },
  blink: {
    cast(w, c, a, lvl, t, x, y) {
      const range = lv(a.def.range, lvl);
      let dx = x - c.x;
      let dy = y - c.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > range) {
        dx = (dx / d) * range;
        dy = (dy / d) * range;
      }
      const dest = c.isAir ? [c.x + dx, c.y + dy] : w.map.nearestPassable(c.x + dx, c.y + dy, c.large, 6);
      if (!dest) return;
      w.emit({ t: 'fx', fx: 'blinkOut', x: c.x, y: c.y });
      c.x = c.px = dest[0];
      c.y = c.py = dest[1];
      c.hasGoal = false;
      w.emit({ t: 'fx', fx: 'blinkIn', x: c.x, y: c.y });
      void t;
    },
  },
  /** dash to a target, then strike (damage + stun) */
  strike: {
    cast(w, c, a, lvl, t) {
      if (!t) return;
      const s = S(a);
      const ang = Math.atan2(c.y - t.y, c.x - t.x);
      const behind = s.behind ? Math.PI : 0;
      const nx = t.x + Math.cos(ang + behind) * (t.radius + c.radius + 0.1);
      const ny = t.y + Math.sin(ang + behind) * (t.radius + c.radius + 0.1);
      w.emit({ t: 'fx', fx: 'dash', x: c.x, y: c.y, x2: nx, y2: ny });
      c.x = c.px = nx;
      c.y = c.py = ny;
      pushOutOfTerrain(w, c);
      c.facing = Math.atan2(t.y - c.y, t.x - c.x);
      payload(w, c, a, lvl, t);
      c.animAttack = w.time;
      if (s.thenAttack && c.order) c.queue.unshift({ type: 'attack', target: t.id });
    },
  },
  transform: {
    cast(w, c, a, lvl) {
      const s = S(a);
      const into = lvs(s.into, lvl);
      if (c.revertDef && s.toggle) {
        revertTransform(w, c);
        return;
      }
      transformInto(w, c, into, lv(s.duration, lvl));
    },
  },
  revert: {
    cast(w, c) {
      revertTransform(w, c);
    },
  },
  dispel: {
    cast(w, c, a, lvl, t, x, y) {
      const s = S(a);
      const r = lv(s.radius, lvl);
      const sd = lv(s.summonDamage, lvl);
      if (r <= 0 && t) {
        dispelUnit(w, c, t, sd);
        w.emit({ t: 'fx', fx: 'dispel', x: t.x, y: t.y, r: 1 });
        return;
      }
      for (const u of w.query(x, y, r)) {
        if (u.kind !== 'unit') continue;
        dispelUnit(w, c, u, sd);
      }
      w.emit({ t: 'fx', fx: 'dispel', x, y, r });
    },
  },
  reveal: {
    cast(w, c, a, lvl, t, x, y) {
      const s = S(a);
      const r = lv(s.radius, lvl);
      w.reveals.push({ x, y, r, until: w.time + lv(s.duration, lvl), owner: c.owner });
      w.emit({ t: 'fx', fx: 'reveal', x, y, r });
      void t;
    },
  },
  raiseDead: {
    cast(w, c, a, lvl, t, x, y) {
      const s = S(a);
      const n = lv(s.corpses, lvl) || 1;
      const corpses = findCorpses(w, t ? t.x : x, t ? t.y : y, lv(a.def.range, lvl) + 1, n);
      for (const corpse of corpses) {
        const per = lv(s.perCorpse, lvl) || 1;
        for (let i = 0; i < per; i++) {
          const unit = i === 0 ? lvs(s.unit, lvl) : lvs(s.unit2 ?? s.unit, lvl);
          const u = w.spawnUnit(unit, c.owner, corpse.x + (i ? 0.5 : 0), corpse.y, c.facing);
          const dur = lv(s.duration, lvl);
          if (dur > 0) {
            u.lifetime = dur;
            u.maxLifetime = dur;
          }
        }
        w.emit({ t: 'fx', fx: 'raise', x: corpse.x, y: corpse.y });
        consumeCorpse(w, corpse);
      }
    },
  },
  devour: {
    cast(w, c, a, lvl) {
      const s = S(a);
      const corpse = findCorpses(w, c.x, c.y, 3, 1)[0];
      if (!corpse) return;
      consumeCorpse(w, corpse);
      applyBuff(w, c, 'devouring', lv(s.duration, lvl), c, undefined, { hot: lv(s.hot, lvl), level: lvl });
      w.emit({ t: 'fx', fx: 'devour', x: c.x, y: c.y });
    },
  },
  corpseExplode: {
    cast(w, c, a, lvl, t, x, y) {
      const s = S(a);
      const corpses = findCorpses(w, x, y, 2.5, lv(s.corpses, lvl) || 1);
      for (const corpse of corpses) {
        const r = lv(s.radius, lvl);
        w.emit({ t: 'fx', fx: 'corpseBlast', x: corpse.x, y: corpse.y, r });
        for (const u of areaTargets(w, c, corpse.x, corpse.y, r, s)) payload(w, c, a, lvl, u);
        consumeCorpse(w, corpse);
      }
      void t;
    },
  },
  barrage: {
    cast(w, c, a, lvl, t, x, y, cs) {
      if (cs) {
        cs.data.x = x;
        cs.data.y = y;
        cs.data.acc = 0;
      }
      void t;
      void lvl;
    },
    tick(w, c, a, lvl, _t, x, y, cs) {
      const s = S(a);
      cs.data.acc = (cs.data.acc ?? 0) + DT;
      const interval = lv(s.interval, lvl) || 0.4;
      while (cs.data.acc >= interval) {
        cs.data.acc -= interval;
        const r = lv(s.radius, lvl);
        const ang = w.rng.next() * Math.PI * 2;
        const rr = Math.sqrt(w.rng.next()) * r;
        const px = x + Math.cos(ang) * rr;
        const py = y + Math.sin(ang) * rr;
        const sr = lv(s.strikeRadius, lvl) || 1.3;
        const delay = lv(s.strikeDelay, lvl) || 0.35;
        w.emit({ t: 'fx', fx: (s.fx as string) ?? 'meteor', x: px, y: py, r: sr, dur: delay });
        w.timers.push({
          at: w.time + delay,
          fn: (ww) => {
            for (const u of areaTargets(ww, c, px, py, sr, { ...s, structures: true })) {
              const m = u.b ? lv(s.structureMult ?? 1, lvl) : 1;
              dealDamage(ww, c, u, lv(s.damage, lvl) * m, 'spell', { pure: !!a.def.ultimate });
              if (s.stun && !u.b) applyBuff(ww, u, 'stun', lv(s.stun, lvl), c);
            }
          },
        });
      }
    },
  },
  drain: {
    cast(w, c, a, lvl, t, _x, _y, cs) {
      if (cs && t) cs.data.tgt = t.id;
      void w;
      void a;
      void lvl;
    },
    tick(w, c, a, lvl, t, _x, _y, cs) {
      const s = S(a);
      if (!t || !t.alive || w.gap(c, t) > lv(a.def.range, lvl) * 1.6 + 1) {
        cs.channel = 0;
        return;
      }
      const dmg = lv(s.dps, lvl) * DT;
      const dealt = dealDamage(w, c, t, dmg, 'spell', { silent: true });
      heal(w, c, dealt * (lv(s.healFactor, lvl) || 1));
      if (s.manaFactor) c.mana = Math.min(c.st.maxMana, c.mana + dealt * lv(s.manaFactor, lvl));
      if (w.tick % 5 === 0) w.emit({ t: 'fx', fx: (s.fx as string) ?? 'drain', x: c.x, y: c.y, x2: t.x, y2: t.y, src: c.id, target: t.id });
    },
  },
  fear: {
    cast(w, c, a, lvl) {
      const s = S(a);
      const r = lv(s.radius, lvl);
      for (const u of areaTargets(w, c, c.x, c.y, r, s)) {
        const d = u.hero ? lv(s.durationHero ?? s.duration, lvl) : lv(s.duration, lvl);
        applyBuff(w, u, 'fear', d, c);
      }
      if (s.allyBuff) {
        const mods = s.allyMods ? resolveMods(s.allyMods, lvl) : undefined;
        for (const u of w.query(c.x, c.y, r, (o) => o.kind === 'unit' && w.isAlly(c.owner, o.owner))) {
          applyBuff(w, u, s.allyBuff as string, lv(s.allyDuration, lvl), c, mods, { level: lvl });
        }
      }
      w.emit({ t: 'fx', fx: (s.fx as string) ?? 'roar', x: c.x, y: c.y, r });
    },
  },
  taunt: {
    cast(w, c, a, lvl) {
      const s = S(a);
      const r = lv(s.radius, lvl);
      for (const u of areaTargets(w, c, c.x, c.y, r, s)) {
        if (u.owner === w.passiveId || !u.def.weapon) continue;
        applyBuff(w, u, 'taunted', lv(s.duration, lvl), c);
        setOrder(w, u, { type: 'attack', target: c.id });
      }
      if (s.selfBuff) applyBuff(w, c, s.selfBuff as string, lv(s.duration, lvl), c, s.selfMods ? resolveMods(s.selfMods, lvl) : undefined, { level: lvl });
      w.emit({ t: 'fx', fx: 'taunt', x: c.x, y: c.y, r });
    },
  },
  multiStrike: {
    cast(w, c, a, lvl, _t, _x, _y, cs) {
      applyBuff(w, c, 'phased', lv(a.def.channel, lvl) + 0.2, c);
      if (cs) {
        cs.data.ox = c.x;
        cs.data.oy = c.y;
        cs.data.acc = 0;
      }
    },
    tick(w, c, a, lvl, _t, _x, _y, cs) {
      const s = S(a);
      cs.data.acc = (cs.data.acc ?? 0) + DT;
      const interval = lv(s.interval, lvl) || 0.35;
      if (cs.data.acc < interval) return;
      cs.data.acc -= interval;
      const r = lv(s.radius, lvl);
      const cands = areaTargets(w, c, cs.data.ox, cs.data.oy, r, s).filter((u) => !u.b);
      if (!cands.length) {
        cs.channel = 0;
        return;
      }
      const u = cands[w.rng.int(0, cands.length - 1)];
      w.emit({ t: 'fx', fx: 'dash', x: c.x, y: c.y, x2: u.x, y2: u.y });
      c.x = c.px = u.x + 0.4;
      c.y = c.py = u.y;
      c.animAttack = w.time;
      dealDamage(w, c, u, lv(s.damage, lvl), 'hero', { crit: true });
    },
    end(w, c) {
      removeBuffsWhere(w, c, (b) => b.def.id === 'phased');
      pushOutOfTerrain(w, c);
    },
  },
  callToArms: {
    cast(w, c, a, lvl) {
      const s = S(a);
      const r = lv(s.radius, lvl);
      let n = 0;
      for (const u of w.entities) {
        if (u.owner !== c.owner || !u.alive || u.kind !== 'unit' || !u.isWorker || u.revertDef) continue;
        if (dist(u.x, u.y, c.x, c.y) > r) continue;
        if (u.inside >= 0) {
          const host = w.get(u.inside);
          if (host && host.b && host.b.insideBuilder === u.id) continue;
        }
        setOrder(w, u, null);
        if (u.inside >= 0) continue;
        transformInto(w, u, s.into as string, lv(s.duration, lvl));
        n++;
      }
      w.msg(c.owner, n + ' workers take up arms', 'info');
    },
  },
  bindMine: {
    cast(w, c, a, lvl, t) {
      if (!t || !t.b || !t.def.goldMine) return;
      if (t.b.boundBy >= 0 && w.valid(t.b.boundBy)) {
        w.msg(c.owner, 'That mine is already bound');
        return;
      }
      if (t.b.cursedBy >= 0) return;
      // unbind previous mine of this hall
      for (const m of w.entities) if (m.b && m.b.boundBy === c.id) m.b.boundBy = -1;
      t.b.boundBy = c.id;
      w.emit({ t: 'fx', fx: 'bindMine', x: t.x, y: t.y, src: c.id, target: t.id });
      void a;
      void lvl;
    },
  },
  autoBind: {
    cast(w, c) {
      autoBindMine(w, c);
    },
  },
  uproot: {
    cast(w, c) {
      uproot(w, c);
    },
  },
  root: {
    cast(w, c, _a, _lvl, _t, x, y) {
      const bdef = DEFS[c.def.rootTo ?? ''];
      if (!bdef) return;
      const size = bdef.size ?? 3;
      setOrder(w, c, { type: 'root', x: Math.round(x - size / 2), y: Math.round(y - size / 2) });
    },
  },
  unload: {
    cast(w, c) {
      unloadGarrison(w, c);
    },
  },
  teleportHome: {
    cast(w, c) {
      const p = w.players[c.owner];
      let hall: Entity | null = null;
      let bd = Infinity;
      for (const e of w.entities) {
        if (e.owner !== c.owner || !e.alive || !e.def.mainHall || e.b?.constructing) continue;
        const d = dist(e.x, e.y, p.startX, p.startY);
        if (d < bd) {
          bd = d;
          hall = e;
        }
      }
      if (!hall) {
        w.msg(c.owner, 'You have no town hall to return to');
        return;
      }
      const group = w.query(c.x, c.y, 5, (u) => u.kind === 'unit' && u.owner === c.owner && u.inside < 0);
      w.emit({ t: 'fx', fx: 'teleport', x: c.x, y: c.y, r: 5 });
      for (const u of group) {
        const pos = w.findSpawnPos(hall, hall.x, hall.y + 6, u.radius);
        u.x = u.px = pos[0] + (w.rng.next() - 0.5);
        u.y = u.py = pos[1] + (w.rng.next() - 0.5);
        setOrder(w, u, null);
      }
      w.emit({ t: 'fx', fx: 'teleport', x: hall.x, y: hall.y + 3, r: 5 });
    },
  },
  passive: { cast() {} },
  aura: { cast() {} },
  lowHpBuff: { cast() {} },
  nightVeil: { cast() {} },
  onHit: { cast() {} },
  permaInvis: { cast() {} },
  toggleBuff: {
    cast(w, c, a, lvl) {
      const s = S(a);
      const id = s.buff as string;
      if (c.hasBuff(id)) removeBuffsWhere(w, c, (b) => b.def.id === id);
      else applyBuff(w, c, id, 1e9, c, resolveMods(s.mods, lvl), { level: lvl });
    },
  },
  forceTime: {
    cast(w, c, a, lvl) {
      const s = S(a);
      if (s.night) {
        w.forcedNight = lv(s.duration, lvl);
        w.forcedDay = 0;
      } else {
        w.forcedDay = lv(s.duration, lvl);
        w.forcedNight = 0;
      }
      void c;
    },
  },
  restore: {
    cast(w, c, a, lvl, t) {
      const s = S(a);
      const r = lv(s.radius, lvl);
      const targets = r > 0 ? w.query(c.x, c.y, r, (u) => u.kind === 'unit' && w.isAlly(c.owner, u.owner)) : [t ?? c];
      for (const u of targets) {
        if (s.hp) heal(w, u, lv(s.hp, lvl), true);
        if (s.mana) u.mana = Math.min(u.st.maxMana, u.mana + lv(s.mana, lvl));
        if (s.hot) applyBuff(w, u, 'regenerating', lv(s.duration, lvl) || 8, c, undefined, { hot: lv(s.hot, lvl) });
      }
      w.emit({ t: 'fx', fx: (s.fx as string) ?? 'heal', x: c.x, y: c.y, r: r || 1 });
    },
  },
  ward: {
    cast(w, c, a, lvl, t, x, y, cs) {
      EFFECTS.summon.cast(w, c, a, lvl, t, x, y, cs);
    },
  },
};

export { resolveMods };

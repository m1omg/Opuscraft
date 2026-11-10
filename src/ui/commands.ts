import { ABILITIES, DEFS, FACTIONS, ITEMS, UPGRADES, lv } from '../data/registry';
import { ARMOR_TYPE_NAMES, ATTACK_TYPE_NAMES, SKILL_LEVEL_REQ, ULTIMATE_LEVEL } from '../data/rules';
import type { AbilityDef, EntityDef, IconSpec } from '../data/types';
import type { Entity } from '../sim/entity';
import type { Command } from '../sim/events';
import type { World } from '../sim/world';
import { abilityUnlocked, manaCost } from '../sim/abilities';
import { heroCost, heroHireError, learnError, reviveCostFor } from '../sim/heroes';
import { iconURL } from './icons';
import { portraits } from './portraits';

export const GRID_KEYS = 'QWERASDFZXCV';

export interface CmdButton {
  slot: number;
  key: string; // KeyboardEvent.key (upper case letter) or 'Escape'
  label: string; // key shown on the button
  icon: string;
  tip: string; // HTML
  action: () => void;
  right?: () => void;
  disabled?: boolean;
  passive?: boolean;
  unlearned?: boolean;
  autocast?: boolean;
  cd?: number; // 0..1 remaining fraction
  cdText?: string;
  level?: string;
  cost?: string;
  active?: boolean;
  learn?: boolean;
}

export type TargetKind = 'move' | 'attack' | 'patrol' | 'rally' | 'cast' | 'useItem' | 'dropItem' | 'gather' | 'repair';
export interface TargetMode {
  kind: TargetKind;
  ability?: AbilityDef;
  slot?: number;
  hero?: number;
  aoe?: number;
}

/** What the command card needs from the game session. */
export interface UICtx {
  world: World;
  local: number;
  selection: Entity[];
  activeType: string;
  cardMode: 'main' | 'build' | 'build2' | 'learn';
  targetMode: TargetMode | null;
  placing: string | null;
  issue(c: Command): void;
  startTarget(t: TargetMode): void;
  startPlacement(defId: string, rootUnit?: number): void;
  setCardMode(m: 'main' | 'build' | 'build2' | 'learn'): void;
  cancelModes(): void;
  msg(text: string): void;
}

// ---------------------------------------------------------------------------
// tooltips
// ---------------------------------------------------------------------------
function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
}

export function costHTML(gold: number, lumber: number, food?: number, mana?: number): string {
  const parts: string[] = [];
  if (gold) parts.push(`<span class="g">${gold} gold</span>`);
  if (lumber) parts.push(`<span class="l">${lumber} lumber</span>`);
  if (food) parts.push(`<span class="f">${food} food</span>`);
  if (mana) parts.push(`<span class="m">${mana} mana</span>`);
  return parts.length ? `<div class="costs">${parts.join('')}</div>` : '';
}

export function unitTip(d: EntityDef, extra = '', costOverride?: { gold: number; lumber: number }): string {
  const cost = costOverride ?? d.cost;
  let stats = '';
  if (d.kind === 'unit' && !d.hero) {
    const w = d.weapon;
    stats = `<div class="lv">${d.hp} health${d.mana ? ' · ' + d.mana + ' mana' : ''} · ${d.armor} ${ARMOR_TYPE_NAMES[d.armorType]} armor</div>`;
    if (w) stats += `<div class="lv">${w.damage[0]}-${w.damage[1]} ${ATTACK_TYPE_NAMES[w.type]} damage · ${w.projectile ? 'range ' + w.range : 'melee'}${w.targets.air ? ' · hits air' : ''}</div>`;
    if (d.air) stats += `<div class="lv">Flying unit</div>`;
  } else if (d.kind === 'building') {
    stats = `<div class="lv">${d.hp} health${d.foodProvided ? ' · provides ' + d.foodProvided + ' food' : ''}</div>`;
  }
  return `<h4>${esc(d.name)}</h4>${costHTML(cost.gold, cost.lumber, d.cost.food)}<div>${esc(d.description)}</div>${stats}${extra}`;
}

export function abilityTip(a: AbilityDef, level: number, e?: Entity): string {
  const mana = lv(a.mana, Math.max(1, level));
  const cd = lv(a.cooldown, Math.max(1, level));
  let s = `<h4>${esc(a.name)}${a.ultimate ? ' <span style="color:#ffd040">(Ultimate)</span>' : ''}</h4>`;
  const bits: string[] = [];
  if (mana) bits.push(`<span class="m">${mana} mana</span>`);
  if (cd) bits.push(`<span>${cd}s cooldown</span>`);
  if (a.targeting === 'passive' || a.targeting === 'aura') bits.push('<span>Passive</span>');
  if (bits.length) s += `<div class="costs">${bits.join('')}</div>`;
  s += `<div>${esc(a.description)}</div>`;
  if (a.levelText) {
    s += a.levelText.map((t, i) => `<div class="lv${i + 1 === level ? ' cur' : ''}">Level ${i + 1}: ${esc(t)}</div>`).join('');
  }
  if (a.autocast) s += `<div class="lv">Right-click to toggle autocast.</div>`;
  if (a.requiresUpgrade && e) {
    const up = UPGRADES[a.requiresUpgrade];
    if (up) s += `<div class="lv">Requires research: ${esc(up.name)}</div>`;
  }
  return s;
}

function icon(spec: IconSpec | undefined): string {
  return iconURL(spec);
}

// ---------------------------------------------------------------------------
// card builders
// ---------------------------------------------------------------------------
const CMD = {
  move: { glyph: 'move', bg: 0x3a5a3a },
  stop: { glyph: 'stop', bg: 0x7a2a2a },
  hold: { glyph: 'hold', bg: 0x3a4a6a },
  attack: { glyph: 'attack', bg: 0x7a3a2a },
  patrol: { glyph: 'patrol', bg: 0x5a4a2a },
  gather: { glyph: 'gather', bg: 0x6a5a2a },
  repair: { glyph: 'repair', bg: 0x4a4a5a },
  return: { glyph: 'return', bg: 0x5a4a3a },
  build: { glyph: 'build', bg: 0x5a4a2a },
  build2: { glyph: 'build2', bg: 0x4a3a6a },
  cancel: { glyph: 'cancel', bg: 0x6a1a1a },
  rally: { glyph: 'rally', bg: 0x2a5a2a },
  learn: { glyph: 'learn', bg: 0x6a5a1a },
};

export function buildCard(ctx: UICtx): CmdButton[] {
  const w = ctx.world;
  const sel = ctx.selection.filter((e) => e.alive && !e.dead);
  const out: CmdButton[] = [];
  if (ctx.targetMode || ctx.placing) {
    out.push({ slot: 11, key: 'Escape', label: 'Esc', icon: icon(CMD.cancel), tip: '<h4>Cancel</h4>', action: () => ctx.cancelModes() });
    return out;
  }
  if (!sel.length) return out;
  const first = sel.find((e) => e.def.id === ctx.activeType) ?? sel[0];
  if (first.owner !== ctx.local) return neutralCard(ctx, first);
  if (first.kind === 'building') return buildingCard(ctx, first);
  const group = sel.filter((e) => e.def.id === first.def.id);
  const ids = sel.filter((e) => e.kind === 'unit').map((e) => e.id);
  if (ctx.cardMode === 'build' || ctx.cardMode === 'build2') return buildMenu(ctx, first, ctx.cardMode === 'build2');
  if (ctx.cardMode === 'learn' && first.hero) return learnCard(ctx, first);

  const mobile = (first.def.speed ?? 0) > 0;
  if (mobile) {
    out.push({ slot: 0, key: 'M', label: 'M', icon: icon(CMD.move), tip: '<h4>Move</h4><div>Move to a location or follow a unit. Units ignore enemies on the way.</div>', action: () => ctx.startTarget({ kind: 'move' }) });
  }
  out.push({ slot: 1, key: 'S', label: 'S', icon: icon(CMD.stop), tip: '<h4>Stop</h4><div>Halt all orders.</div>', action: () => ctx.issue({ type: 'stop', player: ctx.local, units: ids }) });
  out.push({ slot: 2, key: 'H', label: 'H', icon: icon(CMD.hold), tip: '<h4>Hold Position</h4><div>Stand ground and attack only enemies in range.</div>', action: () => ctx.issue({ type: 'order', player: ctx.local, units: ids, order: { type: 'hold' } }) });
  if (first.def.weapon) {
    out.push({ slot: 3, key: 'A', label: 'A', icon: icon(CMD.attack), tip: '<h4>Attack</h4><div>Attack a target, or attack-move: advance and fight any enemy encountered.</div>', action: () => ctx.startTarget({ kind: 'attack' }) });
  }
  if (mobile) out.push({ slot: 4, key: 'P', label: 'P', icon: icon(CMD.patrol), tip: '<h4>Patrol</h4><div>Walk back and forth, engaging enemies.</div>', action: () => ctx.startTarget({ kind: 'patrol' }) });

  if (first.isWorker || first.def.harvest) {
    const f = FACTIONS[w.players[ctx.local].faction];
    if (first.def.harvest) out.push({ slot: 5, key: 'G', label: 'G', icon: icon(CMD.gather), tip: '<h4>Gather</h4><div>Harvest gold from a mine or lumber from trees.</div>', action: () => ctx.startTarget({ kind: 'gather' }) });
    if (first.isWorker) {
      const canRepair = f.id !== 'sepulchral';
      if (canRepair) out.push({ slot: 6, key: 'R', label: 'R', icon: icon(CMD.repair), tip: '<h4>Repair</h4><div>Repair a damaged building or help construct one. Costs a fraction of the building price.</div>', action: () => ctx.startTarget({ kind: 'repair' }) });
      if (first.def.harvest?.gold === 'standard' || first.def.harvest?.lumber === 'standard')
        out.push({ slot: 7, key: 'T', label: 'T', icon: icon(CMD.return), tip: '<h4>Return Resources</h4><div>Bring carried resources back.</div>', action: () => ctx.issue({ type: 'order', player: ctx.local, units: group.map((u) => u.id), order: { type: 'returnRes' } }) });
      out.push({ slot: 8, key: 'B', label: 'B', icon: icon(CMD.build), tip: '<h4>Build Structure</h4><div>Basic structures.</div>', action: () => ctx.setCardMode('build') });
      out.push({ slot: 9, key: 'V', label: 'V', icon: icon(CMD.build2), tip: '<h4>Build Advanced Structure</h4><div>Advanced structures.</div>', action: () => ctx.setCardMode('build2') });
      return out;
    }
  }
  // abilities
  const keys = ['Q', 'W', 'E', 'R'];
  const abil = first.abilities;
  let k = 0;
  for (const a of abil) {
    if (k >= 4) break;
    const slot = 8 + k;
    const key = keys[k];
    k++;
    const def = a.def;
    const passive = def.targeting === 'passive' || def.targeting === 'aura';
    const unlocked = abilityUnlocked(w, first, a);
    const ready = group.find((u) => {
      const s = u.abilities.find((x) => x.def.id === def.id);
      return s && s.cd <= 0;
    });
    const best = group.reduce((m, u) => Math.min(m, u.abilities.find((x) => x.def.id === def.id)?.cd ?? 0), Infinity);
    const total = lv(def.cooldown, Math.max(1, a.level));
    const btn: CmdButton = {
      slot,
      key,
      label: key,
      icon: icon(def.icon),
      tip: abilityTip(def, a.level, first),
      passive,
      unlearned: a.level < 1 || !unlocked,
      autocast: def.autocast && a.autocast,
      level: first.hero ? (a.level > 0 ? String(a.level) : '') : undefined,
      cd: !ready && best > 0 && total > 0 ? Math.min(1, best / total) : 0,
      cdText: !ready && best > 0 ? String(Math.ceil(best)) : undefined,
      action: () => {
        if (passive) return;
        if (a.level < 1) {
          ctx.msg('Ability not learned yet');
          return;
        }
        if (!unlocked) {
          const up = UPGRADES[def.requiresUpgrade!];
          ctx.msg('Requires ' + (up ? up.name : 'research'));
          return;
        }
        if (def.effect.type === 'root') {
          ctx.startPlacement(first.def.rootTo!, first.id);
          return;
        }
        if (def.targeting === 'none' || def.targeting === 'toggle') {
          ctx.issue({ type: 'cast', player: ctx.local, units: group.map((u) => u.id), ability: def.id });
          return;
        }
        ctx.startTarget({ kind: 'cast', ability: def, aoe: lv(def.aoe, Math.max(1, a.level)) || undefined });
      },
      right: def.autocast
        ? () =>
            ctx.issue({ type: 'autocast', player: ctx.local, units: group.map((u) => u.id), ability: def.id, on: !a.autocast })
        : undefined,
    };
    if (!passive && manaCost(a) > first.mana && a.level > 0) btn.disabled = true;
    out.push(btn);
  }
  if (first.hero) {
    const pts = first.hero.skillPoints;
    if (pts > 0) {
      out.push({ slot: 7, key: 'L', label: 'L', icon: icon(CMD.learn), learn: true, tip: `<h4>Learn Skill</h4><div>${pts} unspent skill point${pts > 1 ? 's' : ''}.</div>`, action: () => ctx.setCardMode('learn') });
    }
  }
  return out;
}

function learnCard(ctx: UICtx, h: Entity): CmdButton[] {
  const out: CmdButton[] = [];
  const keys = ['Q', 'W', 'E', 'R'];
  h.def.hero!.abilities.forEach((id, i) => {
    const a = h.abilities.find((x) => x.def.id === id);
    if (!a) return;
    const err = learnError(h, id);
    const max = a.def.maxLevel ?? (a.def.ultimate ? 1 : 3);
    const req = a.def.ultimate ? ULTIMATE_LEVEL : SKILL_LEVEL_REQ[a.level] ?? 99;
    out.push({
      slot: 8 + i,
      key: keys[i],
      label: keys[i],
      icon: iconURL(a.def.icon),
      tip: abilityTip(a.def, a.level + 1) + (err ? `<div class="req">${esc(err)}</div>` : '') + (a.level < max ? `<div class="lv">Learn rank ${a.level + 1} (hero level ${req})</div>` : ''),
      disabled: !!err,
      level: `${a.level}/${max}`,
      action: () => {
        ctx.issue({ type: 'learn', player: ctx.local, hero: h.id, ability: id });
        if (h.hero!.skillPoints <= 1) ctx.setCardMode('main');
      },
    });
  });
  out.push({ slot: 11, key: 'Escape', label: 'Esc', icon: iconURL(CMD.cancel), tip: '<h4>Back</h4>', action: () => ctx.setCardMode('main') });
  return out;
}

function buildMenu(ctx: UICtx, worker: Entity, advanced: boolean): CmdButton[] {
  const w = ctx.world;
  const p = w.players[ctx.local];
  const faction = worker.def.faction;
  const rank = (d: EntityDef) => (d.foodProvided && !d.mainHall ? 0 : d.mainHall ? 9 : d.isAltar ? 3 : d.weapon || d.upgradeOptions ? 5 : d.trains?.length ? 1 : d.dropoff ? 2 : 4);
  const list = Object.values(DEFS)
    .filter((d) => d.kind === 'building' && d.faction === faction && d.buildable !== false && !!d.advanced === advanced)
    .sort((a, b) => rank(a) - rank(b));
  const out: CmdButton[] = [];
  list.slice(0, 11).forEach((d, i) => {
    const req = w.requirementsMet(ctx.local, d.requires);
    const afford = p.gold >= d.cost.gold && p.lumber >= d.cost.lumber;
    out.push({
      slot: i,
      key: GRID_KEYS[i],
      label: GRID_KEYS[i],
      icon: portraits.get(d.id, p.color),
      tip: unitTip(d) + (req ? `<div class="req">${esc(req)}</div>` : ''),
      disabled: !!req || !afford,
      cost: `${d.cost.gold}`,
      action: () => {
        if (req) return ctx.msg(req);
        if (p.gold < d.cost.gold) return ctx.msg('Not enough gold');
        if (p.lumber < d.cost.lumber) return ctx.msg('Not enough lumber');
        ctx.startPlacement(d.id);
      },
    });
  });
  out.push({ slot: 11, key: 'Escape', label: 'Esc', icon: iconURL(CMD.cancel), tip: '<h4>Back</h4>', action: () => ctx.setCardMode('main') });
  return out;
}

function buildingCard(ctx: UICtx, b: Entity): CmdButton[] {
  const w = ctx.world;
  const p = w.players[ctx.local];
  const bs = b.b!;
  const out: CmdButton[] = [];
  if (bs.constructing) {
    out.push({ slot: 11, key: 'Escape', label: 'Esc', icon: iconURL(CMD.cancel), tip: '<h4>Cancel Construction</h4><div>Refunds 75% of the cost.</div>', action: () => ctx.issue({ type: 'cancelConstruction', player: ctx.local, building: b.id }) });
    return out;
  }
  let slot = 0;
  const add = (btn: Omit<CmdButton, 'slot' | 'key' | 'label'>) => {
    if (slot >= 11) return;
    out.push({ ...btn, slot, key: GRID_KEYS[slot], label: GRID_KEYS[slot] });
    slot++;
  };
  const upgrading = bs.queue.some((q) => q.kind === 'upgrade');
  for (const id of b.def.trains ?? []) {
    const d = DEFS[id];
    if (!d) continue;
    let gold = d.cost.gold;
    let lumber = d.cost.lumber;
    let extra = '';
    let blocked: string | null = w.requirementsMet(ctx.local, d.requires);
    if (d.hero) {
      const hc = heroCost(w, ctx.local);
      gold = hc.gold;
      lumber = hc.lumber;
      if (gold === 0) extra += '<div class="lv" style="color:#8aff8a">Your first hero is free.</div>';
      blocked = blocked ?? heroHireError(w, ctx.local);
      if (w.entities.some((e) => e.hero && e.def.id === d.id && e.owner === ctx.local && !e.removed)) blocked = 'Already summoned';
      if (d.hero) extra += `<div class="lv">${esc(d.hero.title)} · primary attribute ${d.hero.primary.toUpperCase()}</div>`;
      extra += d.hero.abilities.map((a) => `<div class="lv">• ${esc(ABILITIES[a]?.name ?? a)}</div>`).join('');
    }
    add({
      icon: portraits.get(d.id, p.color),
      tip: unitTip(d, extra + (blocked ? `<div class="req">${esc(blocked)}</div>` : ''), { gold, lumber }),
      disabled: !!blocked || upgrading || p.gold < gold || p.lumber < lumber,
      cost: String(gold),
      action: () => (blocked ? ctx.msg(blocked) : ctx.issue({ type: 'train', player: ctx.local, building: b.id, unit: d.id })),
    });
  }
  // dead heroes can be revived at an altar
  if (b.def.isAltar) {
    for (const hid of p.heroIds) {
      const h = w.get(hid);
      if (!h || h.alive || !h.hero || h.hero.reviving) continue;
      const c = reviveCostFor(h);
      add({
        icon: portraits.get(h.def.id, p.color),
        tip: `<h4>Revive ${esc(h.def.name)}</h4>${costHTML(c.gold, 0, 5)}<div>Returns the level ${h.hero.level} hero to life with full health and mana. Takes ${c.time} seconds.</div>`,
        disabled: p.gold < c.gold,
        cost: String(c.gold),
        action: () => ctx.issue({ type: 'revive', player: ctx.local, altar: b.id, hero: h.id }),
      });
    }
  }
  for (const id of b.def.researches ?? []) {
    const up = UPGRADES[id];
    if (!up) continue;
    const have = p.upgradeLevel(id);
    if (have >= up.levels.length) continue;
    const L = up.levels[have];
    const req = w.requirementsMet(ctx.local, L.requires);
    const busy = p.researching.has(id);
    add({
      icon: iconURL(up.icon),
      tip: `<h4>${esc(up.name)}${up.levels.length > 1 ? ` (level ${have + 1})` : ''}</h4>${costHTML(L.cost.gold, L.cost.lumber)}<div>${esc(up.description)}</div><div class="lv">Research time ${L.time}s</div>${req ? `<div class="req">${esc(req)}</div>` : ''}${busy ? '<div class="req">Already researching</div>' : ''}`,
      disabled: !!req || busy || upgrading || p.gold < L.cost.gold || p.lumber < L.cost.lumber,
      cost: String(L.cost.gold),
      level: up.levels.length > 1 ? String(have + 1) : undefined,
      action: () => (req ? ctx.msg(req) : ctx.issue({ type: 'research', player: ctx.local, building: b.id, upgrade: id })),
    });
  }
  const upTargets = [...(b.def.upgradesTo ? [b.def.upgradesTo] : []), ...(b.def.upgradeOptions ?? [])];
  for (const to of upTargets) {
    const d = DEFS[to];
    if (!d) continue;
    const req = w.requirementsMet(ctx.local, d.requires);
    add({
      icon: portraits.get(d.id, p.color),
      tip: `<h4>Upgrade to ${esc(d.name)}</h4>${costHTML(d.cost.gold, d.cost.lumber)}<div>${esc(d.description)}</div><div class="lv">Upgrade time ${d.buildTime}s</div>${req ? `<div class="req">${esc(req)}</div>` : ''}`,
      disabled: !!req || bs.queue.length > 0 || p.gold < d.cost.gold || p.lumber < d.cost.lumber,
      cost: String(d.cost.gold),
      action: () => (req ? ctx.msg(req) : ctx.issue({ type: 'upgradeBuilding', player: ctx.local, building: b.id, to })),
    });
  }
  for (const a of b.abilities) {
    const def = a.def;
    if (def.targeting === 'passive' || def.targeting === 'aura') continue;
    const cdTotal = lv(def.cooldown, 1);
    add({
      icon: iconURL(def.icon),
      tip: abilityTip(def, 1, b),
      cd: a.cd > 0 && cdTotal > 0 ? a.cd / cdTotal : 0,
      cdText: a.cd > 0 ? String(Math.ceil(a.cd)) : undefined,
      action: () => {
        if (def.targeting === 'none') ctx.issue({ type: 'cast', player: ctx.local, units: [b.id], ability: def.id });
        else ctx.startTarget({ kind: 'cast', ability: def });
      },
    });
  }
  if (b.def.shopItems && !b.def.mercenaries) shopButtons(ctx, b, add);
  if ((b.def.trains?.length ?? 0) > 0) {
    out.push({ slot: 10, key: 'Y', label: 'Y', icon: iconURL(CMD.rally), tip: '<h4>Set Rally Point</h4><div>Trained units walk here. Right-click on the map with the building selected also sets it. Rally on a gold mine or tree sends new workers to gather.</div>', action: () => ctx.startTarget({ kind: 'rally' }) });
  }
  if (bs.queue.length) {
    out.push({ slot: 11, key: 'Escape', label: 'Esc', icon: iconURL(CMD.cancel), tip: '<h4>Cancel</h4><div>Cancel the last queued item for a full refund.</div>', action: () => ctx.issue({ type: 'cancelQueue', player: ctx.local, building: b.id, index: -1 }) });
  }
  return out;
}

function shopButtons(ctx: UICtx, shop: Entity, add: (b: Omit<CmdButton, 'slot' | 'key' | 'label'>) => void): void {
  const w = ctx.world;
  const p = w.players[ctx.local];
  for (const id of shop.def.shopItems ?? []) {
    const it = ITEMS[id];
    if (!it) continue;
    const stock = shop.b!.stock[id];
    add({
      icon: iconURL(it.icon),
      tip: `<h4>${esc(it.name)}</h4>${costHTML(it.cost, 0)}<div>${esc(it.description)}</div><div class="lv">In stock: ${stock ? stock.count : '∞'} · A hero must stand near the shop.</div>`,
      disabled: p.gold < it.cost || (stock !== undefined && stock.count <= 0),
      cost: String(it.cost),
      action: () => ctx.issue({ type: 'buyItem', player: ctx.local, shop: shop.id, item: id, hero: ctx.selection.find((e) => e.hero && e.owner === ctx.local)?.id }),
    });
  }
}

/** Neutral services (inn, merchant, mercenaries) and enemy units: view or buy. */
function neutralCard(ctx: UICtx, e: Entity): CmdButton[] {
  const w = ctx.world;
  const p = w.players[ctx.local];
  const out: CmdButton[] = [];
  if (!w.players[e.owner]?.passive || !e.b) return out;
  let slot = 0;
  const add = (btn: Omit<CmdButton, 'slot' | 'key' | 'label'>) => {
    if (slot >= 12) return;
    out.push({ ...btn, slot, key: GRID_KEYS[slot], label: GRID_KEYS[slot] });
    slot++;
  };
  for (const hid of e.def.heroesForHire ?? []) {
    const d = DEFS[hid];
    const taken = w.entities.some((x) => x.hero && x.def.id === hid && !x.removed);
    const hc = heroCost(w, ctx.local);
    const err = heroHireError(w, ctx.local);
    add({
      icon: portraits.get(hid, p.color),
      tip: unitTip(d, `<div class="lv">${esc(d.hero!.title)}</div>` + d.hero!.abilities.map((a) => `<div class="lv">• ${esc(ABILITIES[a]?.name ?? a)}</div>`).join('') + (taken ? '<div class="req">Already hired</div>' : err ? `<div class="req">${esc(err)}</div>` : '') + '<div class="lv">Requires one of your units near the inn.</div>', hc),
      disabled: taken || !!err || p.gold < hc.gold || p.lumber < hc.lumber,
      cost: String(hc.gold),
      action: () => ctx.issue({ type: 'hireHero', player: ctx.local, tavern: e.id, hero: hid }),
    });
  }
  if (e.def.heroesForHire) {
    for (const hid of p.heroIds) {
      const h = w.get(hid);
      if (!h || h.alive || !h.hero || h.hero.reviving) continue;
      const c = reviveCostFor(h);
      add({
        icon: portraits.get(h.def.id, p.color),
        tip: `<h4>Revive ${esc(h.def.name)}</h4>${costHTML(c.gold, 0, 5)}<div>Revive your fallen hero at the inn.</div>`,
        disabled: p.gold < c.gold,
        cost: String(c.gold),
        action: () => ctx.issue({ type: 'revive', player: ctx.local, altar: e.id, hero: h.id }),
      });
    }
  }
  for (const mid of e.def.mercenaries ?? []) {
    const d = DEFS[mid];
    const stock = e.b.stock[mid];
    add({
      icon: portraits.get(mid, p.color),
      tip: unitTip(d, `<div class="lv">Available: ${stock ? stock.count : 0} · Requires one of your units near the camp.</div>`),
      disabled: p.gold < d.cost.gold || p.lumber < d.cost.lumber || (stock !== undefined && stock.count <= 0),
      cost: String(d.cost.gold),
      action: () => ctx.issue({ type: 'hireMerc', player: ctx.local, camp: e.id, unit: mid }),
    });
  }
  if (e.def.shopItems && !e.def.mercenaries) shopButtons(ctx, e, add);
  return out;
}

export function describeSelectionKey(e: Entity): string {
  return e.def.id;
}

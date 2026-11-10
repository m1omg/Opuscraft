import { ABILITIES, DEFS, getDef, ITEMS } from '../data/registry';
import {
  CREEP_XP_FACTOR,
  HERO_MAX_LEVEL,
  HERO_XP_TABLE,
  INVENTORY_SLOTS,
  SHOP_RANGE,
  SKILL_LEVEL_REQ,
  ULTIMATE_LEVEL,
  XP_SHARE_RANGE,
} from '../data/rules';
import type { EntityDef, ItemDef } from '../data/types';
import { dist } from '../util/math';
import { Entity, type ItemInstance, type Order } from './entity';
import type { World } from './world';
import { completeOrder, moveToward } from './orders';
import { recomputeStats, initAbilities, applyBuff } from './abilities';

export const ITEM_ENTITY_DEF: EntityDef = {
  id: 'item_drop',
  name: 'Item',
  kind: 'unit',
  faction: 'neutral',
  description: '',
  hp: 1,
  armor: 0,
  armorType: 'unarmored',
  sight: [0, 0],
  cost: { gold: 0, lumber: 0 },
  buildTime: 0,
  radius: 0.3,
  model: { kind: 'critter' },
};

export function initHero(w: World, e: Entity): void {
  if (e.hero) return;
  e.hero = {
    level: 1,
    xp: 0,
    skillPoints: 1,
    inventory: new Array(INVENTORY_SLOTS).fill(null),
    bonusStr: 0,
    bonusAgi: 0,
    bonusInt: 0,
    deaths: 0,
    kills: 0,
    reviving: false,
  };
  const p = w.players[e.owner];
  if (p && !p.heroIds.includes(e.id)) p.heroIds.push(e.id);
  e.statsDirty = true;
}

export function xpForLevel(level: number): number {
  return HERO_XP_TABLE[Math.min(HERO_XP_TABLE.length - 1, Math.max(0, level - 1))];
}

export function grantXP(w: World, owner: number, x: number, y: number, xp: number, creep: boolean): void {
  const heroes: Entity[] = [];
  for (const e of w.entities) {
    if (!e.hero || !e.alive || e.removed) continue;
    if (e.owner !== owner && !w.isAlly(owner, e.owner)) continue;
    if (w.players[e.owner].isNeutral) continue;
    if (dist(e.x, e.y, x, y) > XP_SHARE_RANGE) continue;
    heroes.push(e);
  }
  if (!heroes.length) return;
  const share = xp / heroes.length;
  for (const h of heroes) {
    const f = creep ? CREEP_XP_FACTOR[Math.min(CREEP_XP_FACTOR.length - 1, h.hero!.level)] : 1;
    addXP(w, h, share * f);
  }
}

export function addXP(w: World, h: Entity, amount: number): void {
  const hs = h.hero!;
  if (hs.level >= HERO_MAX_LEVEL || amount <= 0) return;
  hs.xp += amount;
  while (hs.level < HERO_MAX_LEVEL && hs.xp >= xpForLevel(hs.level + 1)) {
    const oldMax = h.st.maxHp;
    const oldMana = h.st.maxMana;
    hs.level++;
    hs.skillPoints++;
    recomputeStats(w, h);
    h.hp = Math.min(h.st.maxHp, h.hp + (h.st.maxHp - oldMax));
    h.mana = Math.min(h.st.maxMana, h.mana + (h.st.maxMana - oldMana));
    w.emit({ t: 'levelUp', id: h.id });
  }
  if (hs.level >= HERO_MAX_LEVEL) hs.xp = xpForLevel(HERO_MAX_LEVEL);
}

/** Can the hero put a point into this ability? Returns an error message or null. */
export function learnError(e: Entity, abilityId: string): string | null {
  if (!e.hero) return 'Not a hero';
  if (e.hero.skillPoints <= 0) return 'No skill points available';
  const a = e.abilities.find((x) => x.def.id === abilityId);
  if (!a || !e.def.hero?.abilities.includes(abilityId)) return 'Unknown ability';
  const max = a.def.maxLevel ?? (a.def.ultimate ? 1 : 3);
  if (a.level >= max) return 'Ability is already at maximum rank';
  if (a.def.ultimate) {
    if (e.hero.level < ULTIMATE_LEVEL) return 'Requires hero level ' + ULTIMATE_LEVEL;
  } else {
    const req = SKILL_LEVEL_REQ[a.level] ?? 99;
    if (e.hero.level < req) return 'Requires hero level ' + req;
  }
  return null;
}

export function learnAbility(w: World, e: Entity, abilityId: string): boolean {
  const err = learnError(e, abilityId);
  if (err) {
    w.msg(e.owner, err);
    return false;
  }
  const a = e.abilities.find((x) => x.def.id === abilityId)!;
  a.level++;
  e.hero!.skillPoints--;
  e.statsDirty = true;
  return true;
}

export function onHeroDeath(w: World, e: Entity): void {
  const hs = e.hero!;
  hs.deaths++;
  hs.reviving = false;
  w.emit({ t: 'heroDied', id: e.id, owner: e.owner });
  // phoenix ember: rise again
  const slot = hs.inventory.findIndex((it) => it && it.def.id === 'item_phoenix');
  if (slot >= 0) {
    hs.inventory[slot] = null;
    const x = e.x;
    const y = e.y;
    w.timers.push({
      at: w.time + 2.5,
      fn: (ww) => {
        if (e.alive) return;
        reviveHero(ww, e, x, y, 0.5);
        ww.emit({ t: 'fx', fx: 'phoenix', x, y, r: 2 });
      },
    });
  }
}

export function reviveHero(w: World, e: Entity, x: number, y: number, frac = 1): void {
  e.alive = true;
  e.dead = false;
  e.removed = false;
  e.corpse = false;
  e.deathTime = 0;
  e.hero!.reviving = false;
  e.x = e.px = x;
  e.y = e.py = y;
  e.buffs.length = 0;
  e.order = null;
  e.queue.length = 0;
  e.inside = -1;
  recomputeStats(w, e);
  e.hp = e.st.maxHp * frac;
  e.mana = e.st.maxMana * frac;
  if (!w.byId.has(e.id)) w.byId.set(e.id, e);
  if (!w.entities.includes(e)) w.entities.push(e);
  w.emit({ t: 'spawn', id: e.id });
  w.emit({ t: 'fx', fx: 'revive', x, y, r: 1.5 });
}

export function reviveHeroAt(w: World, e: Entity, b: Entity): void {
  const pos = w.findSpawnPos(b, b.b ? b.b.rallyX : b.x, b.b ? b.b.rallyY : b.y + 3, e.radius);
  reviveHero(w, e, pos[0], pos[1], 1);
  w.emit({ t: 'trained', id: e.id, owner: e.owner });
}

// ---------------------------------------------------------------------------
// items
// ---------------------------------------------------------------------------
export function makeItem(def: ItemDef): ItemInstance {
  return { def, charges: def.charges ?? (def.consumable ? 1 : 0), cd: 0 };
}

export function spawnGroundItem(w: World, itemId: string, x: number, y: number): Entity | null {
  const def = ITEMS[itemId];
  if (!def) return null;
  const e = new Entity(w.nextId++, ITEM_ENTITY_DEF, w.passiveId, x, y);
  e.kind = 'item';
  e.item = makeItem(def);
  e.spawnTime = w.time;
  w.entities.push(e);
  w.byId.set(e.id, e);
  w.emit({ t: 'spawn', id: e.id });
  return e;
}

/** Put an item into a hero's inventory; returns false if full. */
export function giveItem(w: World, h: Entity, inst: ItemInstance): boolean {
  const hs = h.hero;
  if (!hs) return false;
  if (inst.def.usedOnPickup) {
    useTome(w, h, inst.def);
    return true;
  }
  // stack consumables of the same kind
  if (inst.def.consumable) {
    const same = hs.inventory.find((it) => it && it.def.id === inst.def.id);
    if (same) {
      same.charges += inst.charges;
      return true;
    }
  }
  const slot = hs.inventory.findIndex((it) => !it);
  if (slot < 0) return false;
  hs.inventory[slot] = inst;
  h.statsDirty = true;
  return true;
}

function useTome(w: World, h: Entity, def: ItemDef): void {
  const hs = h.hero!;
  const m = def.mods ?? {};
  hs.bonusStr += m.str ?? 0;
  hs.bonusAgi += m.agi ?? 0;
  hs.bonusInt += m.int ?? 0;
  if (def.id === 'item_tome_xp') addXP(w, h, 220);
  if (def.id === 'item_tome_power') addXP(w, h, xpForLevel(Math.min(10, hs.level + 1)) - hs.xp + 1);
  h.statsDirty = true;
  w.emit({ t: 'fx', fx: 'tome', x: h.x, y: h.y, target: h.id });
}

export function consumeItemCharge(w: World, h: Entity, slot: number, cd: number): void {
  const it = h.hero?.inventory[slot];
  if (!it) return;
  it.cd = cd;
  if (it.def.consumable || it.def.charges) {
    it.charges--;
    if (it.charges <= 0) {
      h.hero!.inventory[slot] = null;
      h.statsDirty = true;
    }
  }
  void w;
}

export function pickupStep(w: World, e: Entity, o: Order): void {
  const it = w.get(o.target ?? -1);
  if (!it || it.kind !== 'item' || it.removed || !it.item || !e.hero) {
    completeOrder(w, e);
    return;
  }
  const d = dist(e.x, e.y, it.x, it.y);
  if (d > e.radius + 0.6) {
    const r = moveToward(w, e, it.x, it.y, e.radius + 0.4);
    if (r === 'blocked') completeOrder(w, e);
    return;
  }
  if (!giveItem(w, e, it.item)) {
    w.msg(e.owner, 'Inventory is full');
    completeOrder(w, e);
    return;
  }
  w.players[e.owner].stats.itemsFound++;
  w.emit({ t: 'item', id: e.id, owner: e.owner, text: it.item.def.name });
  it.removed = true;
  it.alive = false;
  completeOrder(w, e);
}

export function dropItemStep(w: World, e: Entity, o: Order): void {
  if (!e.hero) {
    completeOrder(w, e);
    return;
  }
  const x = o.x ?? e.x;
  const y = o.y ?? e.y;
  if (dist(e.x, e.y, x, y) > 1.5) {
    const r = moveToward(w, e, x, y, 1.2);
    if (r === 'blocked') completeOrder(w, e);
    return;
  }
  const slot = o.slot ?? -1;
  const inst = e.hero.inventory[slot];
  if (inst) {
    e.hero.inventory[slot] = null;
    e.statsDirty = true;
    const g = spawnGroundItem(w, inst.def.id, x, y);
    if (g && g.item) {
      g.item.charges = inst.charges;
      g.item.cd = inst.cd;
    }
  }
  completeOrder(w, e);
}

export function giveItemStep(w: World, e: Entity, o: Order): void {
  const t = w.valid(o.target ?? -1);
  if (!t || !t.hero || !e.hero || !w.isAlly(e.owner, t.owner)) {
    completeOrder(w, e);
    return;
  }
  if (w.gap(e, t) > 1.2) {
    const r = moveToward(w, e, t.x, t.y, 0, t);
    if (r === 'blocked') completeOrder(w, e);
    return;
  }
  const slot = o.slot ?? -1;
  const inst = e.hero.inventory[slot];
  if (inst) {
    e.hero.inventory[slot] = null;
    if (!giveItem(w, t, inst)) {
      e.hero.inventory[slot] = inst;
      w.msg(e.owner, "Target's inventory is full");
    }
    e.statsDirty = true;
  }
  completeOrder(w, e);
}

/** Walk to a shop and buy an item (used by AI). */
export function shopStep(w: World, e: Entity, o: Order): void {
  const shop = w.valid(o.target ?? -1);
  if (!shop || !shop.b || !e.hero) {
    completeOrder(w, e);
    return;
  }
  if (w.gap(e, shop) > SHOP_RANGE - 1) {
    const r = moveToward(w, e, shop.x, shop.y, 0, shop);
    if (r === 'blocked') completeOrder(w, e);
    return;
  }
  if (o.itemId) buyItem(w, e.owner, shop, o.itemId, e);
  completeOrder(w, e);
}

export function heroNearShop(w: World, owner: number, shop: Entity): Entity | null {
  let best: Entity | null = null;
  let bd = Infinity;
  for (const e of w.entities) {
    if (!e.hero || !e.alive || e.owner !== owner || e.inside >= 0) continue;
    const d = w.gap(e, shop);
    if (d <= SHOP_RANGE && d < bd) {
      bd = d;
      best = e;
    }
  }
  return best;
}

export function unitNearShop(w: World, owner: number, shop: Entity): boolean {
  for (const e of w.entities) {
    if (e.kind !== 'unit' || !e.alive || e.owner !== owner || e.inside >= 0) continue;
    if (w.gap(e, shop) <= SHOP_RANGE) return true;
  }
  return false;
}

export function buyItem(w: World, owner: number, shop: Entity, itemId: string, heroHint?: Entity | null): boolean {
  const def = ITEMS[itemId];
  if (!def || !shop.b || !shop.def.shopItems?.includes(itemId)) return false;
  const p = w.players[owner];
  if (shop.owner !== owner && !w.players[shop.owner].passive) {
    w.msg(owner, 'You cannot shop here');
    return false;
  }
  if (shop.b.constructing) return false;
  const stock = shop.b.stock[itemId];
  if (stock && stock.count <= 0) {
    w.msg(owner, 'Out of stock');
    return false;
  }
  const hero = heroHint && heroHint.alive && w.gap(heroHint, shop) <= SHOP_RANGE ? heroHint : heroNearShop(w, owner, shop);
  if (!hero) {
    w.msg(owner, 'A hero must be near the shop to buy items');
    return false;
  }
  if (p.gold < def.cost) {
    w.msg(owner, 'Not enough gold');
    return false;
  }
  const inst = makeItem(def);
  const full = !def.usedOnPickup && hero.hero!.inventory.every((it) => it) && !(def.consumable && hero.hero!.inventory.some((it) => it && it.def.id === def.id));
  if (full) {
    w.msg(owner, 'Inventory is full');
    return false;
  }
  p.gold -= def.cost;
  if (stock) stock.count--;
  giveItem(w, hero, inst);
  w.emit({ t: 'item', id: hero.id, owner, text: def.name });
  return true;
}

export function sellItem(w: World, owner: number, shop: Entity, hero: Entity, slot: number): boolean {
  if (!hero.hero || hero.owner !== owner) return false;
  const inst = hero.hero.inventory[slot];
  if (!inst) return false;
  if (w.gap(hero, shop) > SHOP_RANGE) {
    w.msg(owner, 'Move closer to the shop to sell');
    return false;
  }
  hero.hero.inventory[slot] = null;
  hero.statsDirty = true;
  w.players[owner].gold += Math.floor(inst.def.cost * 0.5);
  return true;
}

export function hireHero(w: World, owner: number, tavern: Entity, heroId: string): boolean {
  const def = DEFS[heroId];
  if (!def || !tavern.def.heroesForHire?.includes(heroId)) return false;
  const p = w.players[owner];
  if (!unitNearShop(w, owner, tavern)) {
    w.msg(owner, 'You need a unit near the inn to hire heroes');
    return false;
  }
  for (const e of w.entities) {
    if (e.hero && e.def.id === heroId && !e.removed) {
      w.msg(owner, 'That hero has already been hired');
      return false;
    }
  }
  const err = heroHireError(w, owner);
  if (err) {
    w.msg(owner, err);
    return false;
  }
  const cost = heroCost(w, owner);
  if (p.gold < cost.gold || p.lumber < cost.lumber) {
    w.msg(owner, p.gold < cost.gold ? 'Not enough gold' : 'Not enough lumber');
    return false;
  }
  if (p.foodUsed + 5 > p.foodCap) {
    w.msg(owner, 'Not enough food — build more farms');
    return false;
  }
  p.gold -= cost.gold;
  p.lumber -= cost.lumber;
  const pos = w.findSpawnPos(tavern, tavern.x, tavern.y + 4, def.radius ?? 0.4);
  const h = w.spawnUnit(heroId, owner, pos[0], pos[1]);
  initAbilities(w, h);
  w.emit({ t: 'trained', id: h.id, owner });
  return true;
}

export function hireMerc(w: World, owner: number, camp: Entity, unitId: string): boolean {
  const def = DEFS[unitId];
  if (!def || !camp.def.mercenaries?.includes(unitId)) return false;
  const p = w.players[owner];
  if (!unitNearShop(w, owner, camp)) {
    w.msg(owner, 'You need a unit near the camp to hire mercenaries');
    return false;
  }
  const stock = camp.b!.stock[unitId];
  if (stock && stock.count <= 0) {
    w.msg(owner, 'No mercenaries available — check back later');
    return false;
  }
  if (p.gold < def.cost.gold || p.lumber < def.cost.lumber) {
    w.msg(owner, p.gold < def.cost.gold ? 'Not enough gold' : 'Not enough lumber');
    return false;
  }
  if (p.foodUsed + (def.cost.food ?? 0) > p.foodCap) {
    w.msg(owner, 'Not enough food — build more farms');
    return false;
  }
  p.gold -= def.cost.gold;
  p.lumber -= def.cost.lumber;
  if (stock) stock.count--;
  const pos = w.findSpawnPos(camp, camp.x, camp.y + 4, def.radius ?? 0.4);
  const u = w.spawnUnit(unitId, owner, pos[0], pos[1]);
  w.emit({ t: 'trained', id: u.id, owner });
  return true;
}

export function heroCost(w: World, owner: number): { gold: number; lumber: number } {
  const count = w.heroCount(owner);
  if (count === 0) return { gold: 0, lumber: 0 };
  return { gold: 425, lumber: 100 };
}

export function heroHireError(w: World, owner: number): string | null {
  const p = w.players[owner];
  const count = w.heroCount(owner);
  if (count >= 3) return 'You already command three heroes';
  if (count === 1 && p.tier < 2) return 'A second hero requires tier 2';
  if (count === 2 && p.tier < 3) return 'A third hero requires tier 3';
  return null;
}

export function itemAbility(it: ItemInstance) {
  return it.def.ability ? ABILITIES[it.def.ability] : undefined;
}

export function reviveCostFor(h: Entity): { gold: number; lumber: number; time: number } {
  const lvl = h.hero?.level ?? 1;
  return { gold: Math.round(150 + 45 * lvl), lumber: 0, time: Math.round(22 + 6 * lvl) };
}

export function startRevive(w: World, owner: number, altar: Entity, heroId: number): boolean {
  const h = w.get(heroId);
  if (!h || !h.hero || h.owner !== owner || h.alive || h.hero.reviving) return false;
  if (!altar.b || altar.b.constructing) return false;
  if (!(altar.def.isAltar || altar.def.heroesForHire)) return false;
  const p = w.players[owner];
  const cost = reviveCostFor(h);
  if (p.gold < cost.gold) {
    w.msg(owner, 'Not enough gold');
    return false;
  }
  if (p.foodUsed + 5 > p.foodCap) {
    w.msg(owner, 'Not enough food');
    return false;
  }
  p.gold -= cost.gold;
  h.hero.reviving = true;
  altar.b.queue.push({ kind: 'revive', id: String(h.id), time: cost.time, total: cost.time, gold: cost.gold, lumber: 0, food: 5 });
  return true;
}

export function slotFree(h: Entity): boolean {
  return !!h.hero && h.hero.inventory.some((s) => !s);
}

export function applyItemOnHit(w: World, h: Entity): void {
  void w;
  void h;
  void applyBuff;
  void getDef;
}

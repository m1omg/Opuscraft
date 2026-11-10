import type { AbilityDef, BuffDef, EntityDef, FactionDef, FactionId, ItemDef, UpgradeDef } from './types';

export const DEFS: Record<string, EntityDef> = {};
export const ABILITIES: Record<string, AbilityDef> = {};
export const BUFFS: Record<string, BuffDef> = {};
export const UPGRADES: Record<string, UpgradeDef> = {};
export const ITEMS: Record<string, ItemDef> = {};
export const FACTIONS = {} as Record<FactionId, FactionDef>;

export function regDefs(list: EntityDef[]): void {
  for (const d of list) {
    if (DEFS[d.id]) throw new Error('duplicate def ' + d.id);
    DEFS[d.id] = d;
  }
}
export function regAbilities(list: AbilityDef[]): void {
  for (const a of list) {
    if (ABILITIES[a.id]) throw new Error('duplicate ability ' + a.id);
    ABILITIES[a.id] = a;
  }
}
export function regBuffs(list: BuffDef[]): void {
  for (const b of list) {
    if (BUFFS[b.id]) throw new Error('duplicate buff ' + b.id);
    BUFFS[b.id] = b;
  }
}
export function regUpgrades(list: UpgradeDef[]): void {
  for (const u of list) {
    if (UPGRADES[u.id]) throw new Error('duplicate upgrade ' + u.id);
    UPGRADES[u.id] = u;
  }
}
export function regItems(list: ItemDef[]): void {
  for (const i of list) {
    if (ITEMS[i.id]) throw new Error('duplicate item ' + i.id);
    ITEMS[i.id] = i;
  }
}
export function regFaction(f: FactionDef): void {
  FACTIONS[f.id] = f;
}

export function getDef(id: string): EntityDef {
  const d = DEFS[id];
  if (!d) throw new Error('unknown entity def ' + id);
  return d;
}
export function getAbility(id: string): AbilityDef {
  const a = ABILITIES[id];
  if (!a) throw new Error('unknown ability ' + id);
  return a;
}
export function getBuff(id: string): BuffDef {
  const b = BUFFS[id];
  if (!b) throw new Error('unknown buff ' + id);
  return b;
}

/** Resolve a per-level value. */
export function lv(v: unknown, level: number): number {
  if (Array.isArray(v)) return v[Math.max(0, Math.min(v.length - 1, level - 1))] as number;
  if (typeof v === 'number') return v;
  return 0;
}
export function lvs(v: unknown, level: number): string {
  if (Array.isArray(v)) return v[Math.max(0, Math.min(v.length - 1, level - 1))] as string;
  return v as string;
}

import type { AbilityDef, AttackType, EntityDef, FactionId, IconSpec, ProjectileDef, StatMods, UpgradeDef, WeaponDef } from './types';

type Req<T, K extends keyof T> = Partial<T> & Pick<T, K>;

export function building(p: Req<EntityDef, 'id' | 'name' | 'faction' | 'hp' | 'size' | 'cost' | 'buildTime' | 'model'>): EntityDef {
  return {
    kind: 'building',
    description: '',
    armor: 5,
    armorType: 'fortified',
    sight: [9, 7],
    buildable: true,
    ...p,
  } as EntityDef;
}

export function unit(p: Req<EntityDef, 'id' | 'name' | 'faction' | 'hp' | 'cost' | 'buildTime' | 'model'>): EntityDef {
  return {
    kind: 'unit',
    description: '',
    armor: 0,
    armorType: 'medium',
    sight: [9, 7],
    speed: 2.5,
    radius: 0.36,
    level: 2,
    ...p,
  } as EntityDef;
}

export function melee(dmg: [number, number], cooldown = 1.5, extra: Partial<WeaponDef> = {}): WeaponDef {
  return { damage: dmg, cooldown, range: 0.35, damagePoint: 0.4, type: 'normal', targets: { ground: true, structure: true }, ...extra };
}

export function missile(
  dmg: [number, number],
  range: number,
  type: AttackType,
  proj: ProjectileDef,
  cooldown = 1.6,
  extra: Partial<WeaponDef> = {},
): WeaponDef {
  return { damage: dmg, cooldown, range, damagePoint: 0.35, type, targets: { ground: true, air: true, structure: true }, projectile: proj, ...extra };
}

export const ARROW: ProjectileDef = { kind: 'arrow', speed: 18, arc: 0.12 };
export const BULLET: ProjectileDef = { kind: 'bullet', speed: 26 };
export const SPEAR: ProjectileDef = { kind: 'spear', speed: 15, arc: 0.15 };
export const BOULDER: ProjectileDef = { kind: 'boulder', speed: 10, arc: 0.45, size: 1.4 };
export const SHELL: ProjectileDef = { kind: 'shell', speed: 11, arc: 0.5 };
export const orb = (color: number, speed = 12, size = 1): ProjectileDef => ({ kind: 'orb', speed, color, size });
export const bolt = (color: number, speed = 14): ProjectileDef => ({ kind: 'bolt', speed, color });

const STD_COSTS = [
  { gold: 100, lumber: 50, time: 40 },
  { gold: 175, lumber: 175, time: 55, requires: ['tier2'] },
  { gold: 250, lumber: 300, time: 70, requires: ['tier3'] },
];

export function tieredUpgrade(
  id: string,
  name: string,
  faction: FactionId,
  icon: IconSpec,
  appliesTo: string[],
  mods: StatMods,
  description: string,
  costs = STD_COSTS,
): UpgradeDef {
  return {
    id,
    name,
    faction,
    icon,
    description,
    appliesTo,
    mods,
    levels: costs.map((c) => ({ cost: { gold: c.gold, lumber: c.lumber }, time: c.time, requires: c.requires })),
  };
}

export function singleUpgrade(
  id: string,
  name: string,
  faction: FactionId,
  icon: IconSpec,
  appliesTo: string[],
  cost: { gold: number; lumber: number },
  time: number,
  description: string,
  opts: { mods?: StatMods; unlocksAbility?: string; requires?: string[]; special?: string } = {},
): UpgradeDef {
  return {
    id,
    name,
    faction,
    icon,
    description,
    appliesTo,
    mods: opts.mods,
    unlocksAbility: opts.unlocksAbility,
    special: opts.special,
    levels: [{ cost, time, requires: opts.requires }],
  };
}

export function heroDef(p: Req<EntityDef, 'id' | 'name' | 'faction' | 'hero' | 'weapon' | 'model'>): EntityDef {
  return {
    kind: 'unit',
    description: '',
    hp: 100,
    mana: 0,
    hpRegen: 0.25,
    manaRegen: 0.2,
    armor: 1,
    armorType: 'hero',
    sight: [11, 8],
    speed: 2.75,
    radius: 0.45,
    cost: { gold: 425, lumber: 100, food: 5 },
    buildTime: 55,
    priority: 10,
    tags: { organic: true },
    ...p,
  } as EntityDef;
}

export function ab(a: AbilityDef): AbilityDef {
  return a;
}

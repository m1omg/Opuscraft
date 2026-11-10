import type { ArmorType, AttackType } from './types';

/** Simulation ticks per second. */
export const TICK_RATE = 20;
export const DT = 1 / TICK_RATE;

/** Attack type vs. armor type damage multipliers. */
export const DAMAGE_TABLE: Record<AttackType, Record<ArmorType, number>> = {
  normal: { unarmored: 1.0, light: 1.1, medium: 1.5, heavy: 0.9, fortified: 0.6, hero: 1.0 },
  pierce: { unarmored: 1.4, light: 1.75, medium: 0.8, heavy: 0.9, fortified: 0.4, hero: 0.6 },
  siege: { unarmored: 1.25, light: 0.9, medium: 0.6, heavy: 0.9, fortified: 1.5, hero: 0.5 },
  magic: { unarmored: 1.1, light: 1.25, medium: 0.8, heavy: 2.0, fortified: 0.4, hero: 0.6 },
  hero: { unarmored: 1.0, light: 1.0, medium: 1.0, heavy: 1.0, fortified: 0.6, hero: 1.0 },
  chaos: { unarmored: 1.0, light: 1.0, medium: 1.0, heavy: 1.0, fortified: 1.0, hero: 1.0 },
  spell: { unarmored: 1.0, light: 1.0, medium: 1.0, heavy: 1.0, fortified: 0.5, hero: 0.75 },
};

export const ATTACK_TYPE_NAMES: Record<AttackType, string> = {
  normal: 'Normal',
  pierce: 'Piercing',
  siege: 'Siege',
  magic: 'Magic',
  hero: 'Hero',
  chaos: 'Chaos',
  spell: 'Spell',
};
export const ARMOR_TYPE_NAMES: Record<ArmorType, string> = {
  unarmored: 'Unarmored',
  light: 'Light',
  medium: 'Medium',
  heavy: 'Heavy',
  fortified: 'Fortified',
  hero: 'Hero',
};

/** Fraction of damage that gets through `armor` points. */
export function armorFactor(armor: number): number {
  if (armor >= 0) return 1 - (0.055 * armor) / (1 + 0.055 * armor);
  return 2 - Math.pow(0.945, -armor);
}

// ---------------- Economy ----------------
export const START_GOLD = 500;
export const START_LUMBER = 150;
export const MAX_FOOD = 100;
export const UPKEEP_TIERS = [
  { maxFood: 50, factor: 1.0, name: 'No Upkeep' },
  { maxFood: 80, factor: 0.7, name: 'Low Upkeep' },
  { maxFood: 100, factor: 0.4, name: 'High Upkeep' },
];
export function upkeepFor(food: number): { factor: number; name: string; tier: number } {
  for (let i = 0; i < UPKEEP_TIERS.length; i++) {
    if (food <= UPKEEP_TIERS[i].maxFood) return { factor: UPKEEP_TIERS[i].factor, name: UPKEEP_TIERS[i].name, tier: i };
  }
  const last = UPKEEP_TIERS[UPKEEP_TIERS.length - 1];
  return { factor: last.factor, name: last.name, tier: UPKEEP_TIERS.length - 1 };
}
export const GOLD_PER_TRIP = 10;
export const LUMBER_PER_TRIP = 10;
export const MINE_TIME = 1.0; // seconds inside the mine
export const CHOP_TIME = 5.5; // seconds to chop a full load
export const TREE_LUMBER = 50;
export const MAIN_MINE_GOLD = 13500;
export const EXPANSION_MINE_GOLD = 9000;
/** Sepulchral cultist and twilight spirit passive mining. */
export const CHANNEL_MINE_INTERVAL = 4.6;
export const MAX_MINERS = 5;
export const SPIRIT_LUMBER_INTERVAL = 6.5;
export const SPIRIT_LUMBER_AMOUNT = 5;
export const BUILD_ASSIST_FACTOR = 0.65;
export const REPAIR_COST_FACTOR = 0.35;
export const CANCEL_REFUND = 0.75;

// ---------------- Heroes ----------------
export const MAX_HEROES = 3;
export const HERO_MAX_LEVEL = 10;
export const HERO_XP_TABLE = [0, 180, 460, 850, 1350, 1950, 2650, 3450, 4350, 5350];
/** XP granted for killing a unit of a given level (index = level). */
export const UNIT_XP_BY_LEVEL = [10, 25, 40, 60, 85, 110, 140, 175, 215, 260, 310, 365];
/** XP granted for killing a hero of a given level. */
export const HERO_KILL_XP = [0, 100, 140, 190, 250, 320, 400, 490, 590, 700, 820];
/** Creep XP multiplier by the receiving hero's level (diminishing returns). */
export const CREEP_XP_FACTOR = [1, 1, 1, 0.9, 0.75, 0.6, 0.45, 0.3, 0.2, 0.1, 0];
export const XP_SHARE_RANGE = 12;
export const HP_PER_STR = 22;
export const REGEN_PER_STR = 0.04;
export const MANA_PER_INT = 14;
export const MANA_REGEN_PER_INT = 0.045;
export const ARMOR_PER_AGI = 0.3;
export const ATTACK_SPEED_PER_AGI = 0.015;
export const HERO_BASE_COST = { gold: 425, lumber: 100, food: 5 };
export const HERO_BUILD_TIME = 55;
export function heroReviveCost(level: number): { gold: number; lumber: number; time: number } {
  return {
    gold: Math.round(180 + 40 * level),
    lumber: 0,
    time: Math.round(25 + 6 * level),
  };
}
export const HERO_SPELL_FACTOR = 0.75; // heroes take reduced damage from spells
export const SKILL_LEVEL_REQ = [1, 3, 5]; // hero level needed for rank 1/2/3 of a basic ability
export const ULTIMATE_LEVEL = 6;
export const INVENTORY_SLOTS = 6;

// ---------------- World ----------------
export const DAY_LENGTH = 480; // seconds for a full day/night cycle
export const DAY_START = 6 / 24; // dawn at 06:00
export const NIGHT_START = 18 / 24; // dusk at 18:00
export const START_TIME_OF_DAY = 8 / 24;
export const CORPSE_TIME = 70;
export const BLIGHT_REGEN = 2.5;
export const NIGHT_REGEN_BONUS = 1.0; // twilight wardens
export const MAX_SELECTION = 12;
export const CLIFF_HEIGHT = 1.4;
export const FLY_HEIGHT = 2.6;
export const ACQUIRE_RANGE_BONUS = 2.0; // acquisition beyond attack range
export const CREEP_LEASH = 9;
export const CREEP_ACQUIRE = 5.0;
export const SHOP_RANGE = 7;
export const MELEE_RANGE = 0.35;
export const HIGH_GROUND_MISS = 0.25;

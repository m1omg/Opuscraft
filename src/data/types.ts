// Core data definitions shared by the simulation, AI, renderer and UI.

export type AttackType = 'normal' | 'pierce' | 'siege' | 'magic' | 'hero' | 'chaos' | 'spell';
export type ArmorType = 'unarmored' | 'light' | 'medium' | 'heavy' | 'fortified' | 'hero';
export type FactionId = 'crown' | 'iron' | 'sepulchral' | 'twilight';
export type Attribute = 'str' | 'agi' | 'int';
export type Resource = 'gold' | 'lumber';

export interface Cost {
  gold: number;
  lumber: number;
  food?: number;
}

/** What a weapon or ability may target. */
export interface TargetFlags {
  ground?: boolean;
  air?: boolean;
  structure?: boolean;
}

export interface ProjectileDef {
  /** visual style */
  kind: 'arrow' | 'bullet' | 'bolt' | 'boulder' | 'spear' | 'orb' | 'blade' | 'shell' | 'bone' | 'seed' | 'beam';
  speed: number; // tiles per second
  arc?: number; // 0 = straight, 0.3 = lobbed
  color?: number;
  size?: number;
}

export interface WeaponDef {
  damage: [number, number];
  cooldown: number; // seconds between attacks
  range: number; // tiles, edge to edge
  damagePoint: number; // windup before the hit lands (seconds)
  type: AttackType;
  targets: TargetFlags;
  projectile?: ProjectileDef;
  splash?: { radius: number; factor: number };
  cleave?: { radius: number; factor: number };
  minRange?: number;
  /** extra multiplier against structures (e.g. torches) */
  vsStructure?: number;
  /** bounces to additional targets (glaive-like) */
  bounce?: { count: number; factor: number; range: number };
}

/** Additive stat modifiers used by buffs, auras, items and upgrades. */
export interface StatMods {
  armor?: number;
  damageFlat?: number;
  damagePct?: number;
  attackSpeedPct?: number;
  moveSpeedPct?: number;
  hpRegen?: number;
  manaRegen?: number;
  hpRegenPct?: number; // % of max hp per second
  maxHp?: number;
  maxMana?: number;
  rangeBonus?: number;
  sightBonus?: number;
  damageTakenPct?: number; // + takes more, - takes less
  spellDamageTakenPct?: number;
  rangedDamageTakenPct?: number;
  evasion?: number; // 0..1
  lifesteal?: number; // fraction of damage dealt
  thorns?: number; // fraction of melee damage returned
  str?: number;
  agi?: number;
  int?: number;
  critChance?: number;
  critMult?: number;
  bashChance?: number;
  bashDuration?: number;
  bashDamage?: number;
  slowOnHit?: number; // move speed slow fraction applied on hit
  lumberCarry?: number;
  goldCarry?: number;
  buildingHpPct?: number;
  manaBurnOnHit?: number;
  bonusVsSummoned?: number;
  attackDamageAura?: number;
}

export type BuffFlag =
  | 'stun'
  | 'root'
  | 'silence'
  | 'disarm'
  | 'invulnerable'
  | 'invisible'
  | 'sleep'
  | 'polymorph'
  | 'ethereal'
  | 'fear'
  | 'undying'
  | 'magicImmune'
  | 'revealed'
  | 'taunted';

export interface BuffDef {
  id: string;
  name: string;
  positive: boolean;
  dispellable?: boolean;
  mods?: StatMods;
  flags?: BuffFlag[];
  dot?: number; // damage per second (spell damage)
  hot?: number; // heal per second
  manaPerSec?: number;
  /** visual hint for renderer */
  fx?: string;
  tint?: number;
  /** invisibility broken when the unit attacks or casts */
  breakOnAction?: boolean;
  /** damage absorbed by a shield buff */
  absorb?: number;
  /** stacks up to N times, each stack applies mods */
  maxStacks?: number;
  icon?: IconSpec;
}

export interface IconSpec {
  glyph: string; // see ui/icons.ts glyph library
  bg: number; // background color
  fg?: number; // glyph color
}

export type Targeting = 'none' | 'unit' | 'point' | 'unitOrPoint' | 'passive' | 'aura' | 'toggle';

export interface TargetFilter {
  enemy?: boolean;
  ally?: boolean;
  self?: boolean;
  neutral?: boolean;
  ground?: boolean;
  air?: boolean;
  structure?: boolean;
  hero?: boolean;
  nonHero?: boolean;
  organic?: boolean;
  undead?: boolean;
  mechanical?: boolean;
  summoned?: boolean;
  notSelf?: boolean;
  corpse?: boolean;
  worker?: boolean;
  tree?: boolean;
  goldMine?: boolean;
}

/** Per-level value: a single number applies to all levels. */
export type LV = number | number[];

export interface EffectSpec {
  type: string;
  [k: string]: unknown;
}

export interface AbilityDef {
  id: string;
  name: string;
  icon: IconSpec;
  hotkey?: string;
  targeting: Targeting;
  filter?: TargetFilter;
  maxLevel?: number; // 1 for unit abilities; heroes 3, ultimates 1
  ultimate?: boolean;
  mana?: LV;
  cooldown?: LV;
  range?: LV;
  aoe?: LV; // radius for targeting indicator
  castPoint?: number;
  channel?: LV; // channel duration
  autocast?: boolean;
  autocastDefault?: boolean;
  effect: EffectSpec;
  requiresUpgrade?: string;
  description: string;
  /** describes per-level details for tooltip */
  levelText?: string[];
  /** AI hint: what situations it's good for */
  ai?: 'nuke' | 'aoe' | 'heal' | 'buff' | 'debuff' | 'summon' | 'disable' | 'escape' | 'ultimate' | 'utility' | 'never';
  /** marks spells that are allowed while the caster is a building */
  building?: boolean;
  /** item ability: consumed on use */
  sound?: string;
  fx?: string;
}

export type ModelKind =
  | 'humanoid'
  | 'rider'
  | 'beast'
  | 'flyer'
  | 'machine'
  | 'wagon'
  | 'spirit'
  | 'treant'
  | 'drake'
  | 'golem'
  | 'building'
  | 'ward'
  | 'mine'
  | 'critter';

/** Free-form parameters consumed by render/models.ts */
export interface ModelSpec {
  kind: ModelKind;
  scale?: number;
  [k: string]: unknown;
}

export interface UnitTags {
  organic?: boolean;
  undead?: boolean;
  mechanical?: boolean;
  summoned?: boolean;
  worker?: boolean;
  ancient?: boolean; // twilight living buildings that can uproot
  magicImmune?: boolean;
  detector?: boolean;
  caster?: boolean;
  melee?: boolean;
  ranged?: boolean;
  siege?: boolean;
  cavalry?: boolean;
  critter?: boolean;
}

export interface HeroInfo {
  primary: Attribute;
  str: number;
  agi: number;
  int: number;
  strGain: number;
  agiGain: number;
  intGain: number;
  abilities: string[]; // 3 regular + 1 ultimate
  title: string;
}

export type DefKind = 'unit' | 'building';

export interface EntityDef {
  id: string;
  name: string;
  kind: DefKind;
  faction: FactionId | 'neutral';
  description: string;
  hp: number;
  mana?: number;
  hpRegen?: number;
  manaRegen?: number;
  armor: number;
  armorType: ArmorType;
  sight: [number, number]; // day, night
  speed?: number; // tiles / sec
  turnRate?: number;
  radius?: number;
  air?: boolean;
  flyHeight?: number;
  weapon?: WeaponDef;
  cost: Cost;
  buildTime: number;
  tier?: number;
  requires?: string[];
  abilities?: string[];
  tags?: UnitTags;
  level?: number; // used for xp & bounty
  bounty?: [number, number];
  hero?: HeroInfo;
  model: ModelSpec;
  icon?: IconSpec;
  hotkey?: string;
  voice?: string;
  /** selection priority, larger first in mixed groups */
  priority?: number;
  /** how this unit harvests resources */
  harvest?: { gold?: 'standard' | 'channel' | 'spirit'; lumber?: 'standard' | 'spirit' };

  // ---- buildings ----
  size?: number; // footprint in tiles (square)
  trains?: string[];
  researches?: string[];
  upgradesTo?: string;
  foodProvided?: number;
  dropoff?: Resource[];
  mainHall?: boolean;
  hallTier?: number;
  isAltar?: boolean;
  shopItems?: string[];
  heroesForHire?: string[];
  mercenaries?: string[];
  goldMine?: boolean;
  goldAmount?: number;
  /** sepulchral: building summoned on top of a gold mine */
  onMine?: boolean;
  /** sepulchral: requires blight underfoot */
  needsBlight?: boolean;
  blightRadius?: number;
  /** how this building gets built */
  buildMode?: 'standard' | 'inside' | 'summon' | 'consume';
  /** twilight: building can uproot into this unit */
  uprootTo?: string;
  /** twilight: unit can root into this building */
  rootTo?: string;
  /** building can garrison workers (iron longhouse) */
  garrison?: number;
  /** auto heals allies (twilight glimmer pool / fountains) */
  fountain?: { hp?: number; mana?: number; radius: number; pool?: number };
  noRepair?: boolean;
  /** neutral building that anyone may use */
  neutralService?: boolean;
  /** building can transform into others (tower upgrades) */
  upgradeOptions?: string[];
  buildable?: boolean; // appears in worker build menu
  advanced?: boolean; // appears in advanced build menu
}

export interface UpgradeLevel {
  cost: Cost;
  time: number;
  requires?: string[];
}

export interface UpgradeDef {
  id: string;
  name: string;
  faction: FactionId;
  icon: IconSpec;
  hotkey?: string;
  description: string;
  levels: UpgradeLevel[];
  /** applies to units matching any of these unit ids or tag names (e.g. 'tag:melee') */
  appliesTo: string[];
  mods?: StatMods; // per level, multiplied by level
  modsPerLevel?: StatMods[];
  unlocksAbility?: string;
  special?: string;
}

export interface ItemDef {
  id: string;
  name: string;
  icon: IconSpec;
  description: string;
  cost: number;
  level: number; // drop tier 1..6
  mods?: StatMods;
  aura?: { buff: string; radius: number };
  ability?: string; // active ability id
  charges?: number;
  consumable?: boolean;
  /** used immediately on pickup (tomes) */
  usedOnPickup?: boolean;
  stock?: number;
  restock?: number;
  sellable?: boolean;
}

export interface FactionDef {
  id: FactionId;
  name: string;
  adjective: string;
  description: string;
  color: number;
  worker: string;
  hall: string;
  startUnits: { id: string; count: number }[];
  heroes: string[];
  altar: string;
  farm: string;
  goldStructure?: string; // sepulchral: cursed lode
  shop: string;
  tower: string;
  barracks: string;
  lumberDropoff?: string;
  traits: string[];
}

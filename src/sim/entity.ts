import type { AbilityDef, BuffDef, EntityDef, ItemDef, Resource, StatMods } from '../data/types';

export type EntityKind = 'unit' | 'building' | 'item';

export type OrderType =
  | 'move'
  | 'follow'
  | 'attackMove'
  | 'attack'
  | 'attackGround'
  | 'hold'
  | 'patrol'
  | 'gather'
  | 'returnRes'
  | 'build'
  | 'repair'
  | 'cast'
  | 'pickup'
  | 'giveItem'
  | 'dropItem'
  | 'garrison'
  | 'root'
  | 'shop';

export interface Order {
  type: OrderType;
  x?: number;
  y?: number;
  target?: number; // entity id
  tree?: number; // tree id
  ability?: string;
  defId?: string;
  slot?: number;
  /** auto-acquired attack (returns to origin when the chase gets too long) */
  auto?: boolean;
  ox?: number; // origin for patrol / auto return
  oy?: number;
  group?: number; // move group id
  /** offset assigned by formation logic */
  fx?: number;
  fy?: number;
  /** remembered resource target for return trips */
  resume?: boolean;
  /** item id (shop purchase, building placement) */
  itemId?: string;
}

export interface AbilityState {
  def: AbilityDef;
  level: number;
  cd: number;
  autocast: boolean;
  /** inventory slot when the ability comes from an item */
  itemSlot?: number;
}

export interface BuffState {
  def: BuffDef;
  remaining: number;
  duration: number;
  source: number;
  sourceOwner: number;
  mods: StatMods;
  dot: number;
  hot: number;
  absorb: number;
  stacks: number;
  level: number;
  /** aura buffs are refreshed continuously and not dispellable */
  aura: boolean;
  /** extra payload (e.g. fade bonus damage) */
  data?: number;
}

export interface ItemInstance {
  def: ItemDef;
  charges: number;
  cd: number;
}

export interface HeroState {
  level: number;
  xp: number;
  skillPoints: number;
  inventory: (ItemInstance | null)[];
  bonusStr: number; // from tomes
  bonusAgi: number;
  bonusInt: number;
  deaths: number;
  kills: number;
  /** id of the altar or tavern reviving this hero (-1 none) */
  reviving: boolean;
}

export interface QueueItem {
  kind: 'unit' | 'research' | 'upgrade' | 'revive';
  id: string; // unit def id, upgrade id, building def id; for revive: hero entity id as string
  time: number; // seconds remaining
  total: number;
  gold: number;
  lumber: number;
  food: number;
  level?: number; // research level
}

export interface BuildingState {
  tx: number;
  ty: number;
  size: number;
  constructing: boolean;
  progress: number; // 0..1
  builders: number[];
  queue: QueueItem[];
  rallyX: number;
  rallyY: number;
  rallyTarget: number; // entity id or -1
  rallyTree: number;
  hasRally: boolean;
  // gold mines
  gold: number;
  inside: number; // standard: worker currently inside (-1 none)
  miners: number[]; // channelling cultists / spirits inside
  cursedBy: number; // sepulchral lode covering this mine
  boundBy: number; // twilight hall binding this mine
  mine: number; // for lode: underlying mine id
  // iron longhouse
  garrison: number[];
  // fountains / pools
  pool: number;
  // shops: remaining stock per item id
  stock: Record<string, { count: number; restock: number }>;
  /** builder hidden inside (iron) or consumed (twilight) */
  insideBuilder: number;
  /** remaining build cost for refund */
  paidGold: number;
  paidLumber: number;
  /** remembered for uproot/root */
  rootedFrom?: string;
}

export interface DerivedStats {
  maxHp: number;
  maxMana: number;
  hpRegen: number;
  manaRegen: number;
  armor: number;
  speed: number;
  dmgMin: number;
  dmgMax: number;
  dmgBonus: number; // flat bonus shown as +X
  dmgPct: number;
  cooldown: number;
  range: number;
  sightDay: number;
  sightNight: number;
  evasion: number;
  lifesteal: number;
  thorns: number;
  critChance: number;
  critMult: number;
  bashChance: number;
  bashDur: number;
  bashDmg: number;
  slowOnHit: number;
  manaBurnOnHit: number;
  bonusVsSummoned: number;
  takenMult: number;
  spellTakenMult: number;
  rangedTakenMult: number;
  str: number;
  agi: number;
  int: number;
  lumberCarry: number;
  goldCarry: number;
  stunned: boolean;
  rooted: boolean;
  silenced: boolean;
  disarmed: boolean;
  invulnerable: boolean;
  invisible: boolean;
  ethereal: boolean;
  polymorph: boolean;
  sleeping: boolean;
  feared: boolean;
  undying: boolean;
  magicImmune: boolean;
  revealed: boolean;
  taunted: boolean;
}

export function emptyStats(): DerivedStats {
  return {
    maxHp: 1,
    maxMana: 0,
    hpRegen: 0,
    manaRegen: 0,
    armor: 0,
    speed: 0,
    dmgMin: 0,
    dmgMax: 0,
    dmgBonus: 0,
    dmgPct: 0,
    cooldown: 1,
    range: 0,
    sightDay: 8,
    sightNight: 6,
    evasion: 0,
    lifesteal: 0,
    thorns: 0,
    critChance: 0,
    critMult: 2,
    bashChance: 0,
    bashDur: 0,
    bashDmg: 0,
    slowOnHit: 0,
    manaBurnOnHit: 0,
    bonusVsSummoned: 0,
    takenMult: 1,
    spellTakenMult: 1,
    rangedTakenMult: 1,
    str: 0,
    agi: 0,
    int: 0,
    lumberCarry: 10,
    goldCarry: 10,
    stunned: false,
    rooted: false,
    silenced: false,
    disarmed: false,
    invulnerable: false,
    invisible: false,
    ethereal: false,
    polymorph: false,
    sleeping: false,
    feared: false,
    undying: false,
    magicImmune: false,
    revealed: false,
    taunted: false,
  };
}

export interface CastState {
  ability: AbilityState;
  target: number;
  x: number;
  y: number;
  timer: number; // cast point remaining
  channel: number; // channel time remaining (-1 = not channelling yet)
  tickAcc: number;
  started: boolean;
  data: Record<string, number>;
}

export class Entity {
  id: number;
  def: EntityDef;
  owner: number;
  kind: EntityKind;
  x: number;
  y: number;
  px: number;
  py: number;
  z = 0;
  facing: number;
  pfacing: number;
  radius: number;
  hp: number;
  mana: number;
  alive = true;
  /** dying / corpse state for units */
  dead = false;
  removed = false;
  deathTime = 0;
  corpse = false;
  corpseTimer = 0;
  st: DerivedStats = emptyStats();
  statsDirty = true;

  order: Order | null = null;
  queue: Order[] = [];

  // --- movement ---
  path: number[] = [];
  pathIdx = 0;
  goalX = 0;
  goalY = 0;
  goalStop = 0;
  goalKey = -1;
  hasGoal = false;
  pathPending = false;
  pathVersion = -1;
  pathFailed = false;
  bestDist = Infinity;
  noProgress = 0;
  repaths = 0;
  moving = false;
  speedNow = 0;

  // --- combat ---
  atkCd = 0;
  windup = -1;
  backswing = 0;
  atkTarget = -1;
  atkGroundX = 0;
  atkGroundY = 0;
  acquireTimer = 0;
  lastHitBy = -1;
  lastDamagedAt = -100;
  chargeDist = 0; // distance travelled since last attack (lancer charge)

  // --- abilities & buffs ---
  abilities: AbilityState[] = [];
  buffs: BuffState[] = [];
  cast: CastState | null = null;
  autocastTimer = 0;

  hero: HeroState | null = null;

  // --- workers ---
  carryType: Resource | null = null;
  carry = 0;
  gatherMine = -1;
  gatherTree = -1;
  inside = -1; // id of building/mine this unit is hidden in
  workTimer = 0;
  working = false; // chopping / building animation flag

  b: BuildingState | null = null;

  /** summoned units expire */
  lifetime = 0;
  maxLifetime = 0;
  /** transform: revert to this def after duration */
  revertDef: EntityDef | null = null;
  revertTimer = 0;

  // creeps
  campId = -1;
  homeX = 0;
  homeY = 0;
  returning = false;

  // items lying on the ground
  item: ItemInstance | null = null;

  /** bitmask of players that currently see this entity */
  seenBy = 0;
  /** render hints */
  animAttack = 0; // time of last attack start (world.time)
  animCast = 0;
  animHit = 0;
  spawnTime = 0;
  /** group selection helpers */
  controlGroupMask = 0;
  /** whether a militia transformation came from a worker */
  formationGroup = 0;
  killedBy = -1;
  /** temporary flag for spatial queries */
  qstamp = 0;
  /** remembered order before being auto-engaged (creeps & idle units) */
  idleX = 0;
  idleY = 0;
  /** fear / flee direction */
  fleeX = 0;
  fleeY = 0;

  constructor(id: number, def: EntityDef, owner: number, x: number, y: number) {
    this.id = id;
    this.def = def;
    this.owner = owner;
    this.kind = def.kind === 'building' ? 'building' : 'unit';
    this.x = this.px = x;
    this.y = this.py = y;
    this.facing = this.pfacing = -Math.PI / 2;
    this.radius = def.radius ?? (def.kind === 'building' ? (def.size ?? 2) * 0.5 : 0.35);
    this.hp = def.hp;
    this.mana = def.mana ?? 0;
    this.idleX = x;
    this.idleY = y;
  }

  get isUnit(): boolean {
    return this.kind === 'unit';
  }
  get isBuilding(): boolean {
    return this.kind === 'building';
  }
  get isHero(): boolean {
    return this.hero !== null;
  }
  get isAir(): boolean {
    return !!this.def.air;
  }
  get isWorker(): boolean {
    return !!this.def.tags?.worker;
  }
  get isSummoned(): boolean {
    return !!this.def.tags?.summoned;
  }
  get hidden(): boolean {
    return this.inside >= 0;
  }
  get large(): boolean {
    return this.radius > 0.55 && !this.isAir;
  }
  get constructing(): boolean {
    return !!this.b && this.b.constructing;
  }
  get hpFrac(): number {
    return this.st.maxHp > 0 ? this.hp / this.st.maxHp : 0;
  }
  /** Sim-side attackable entity (alive, on the map). */
  get targetable(): boolean {
    return this.alive && !this.removed && this.inside < 0 && this.kind !== 'item';
  }
  ability(id: string): AbilityState | undefined {
    for (const a of this.abilities) if (a.def.id === id) return a;
    return undefined;
  }
  hasBuff(id: string): BuffState | undefined {
    for (const b of this.buffs) if (b.def.id === id) return b;
    return undefined;
  }
}

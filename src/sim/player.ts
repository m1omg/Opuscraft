import type { FactionId } from '../data/types';

export const PLAYER_COLORS: { name: string; hex: number }[] = [
  { name: 'Crimson', hex: 0xd2382f },
  { name: 'Azure', hex: 0x2f6fe0 },
  { name: 'Teal', hex: 0x1fb5a2 },
  { name: 'Violet', hex: 0x8a49d6 },
  { name: 'Amber', hex: 0xe8b62c },
  { name: 'Orange', hex: 0xe67a22 },
  { name: 'Emerald', hex: 0x3cae4a },
  { name: 'Rose', hex: 0xe36aa8 },
];
export const NEUTRAL_COLOR = 0x5a5a5a;

export type Difficulty = 'easy' | 'normal' | 'hard';

export interface PlayerStats {
  unitsTrained: number;
  unitsKilled: number;
  unitsLost: number;
  buildingsBuilt: number;
  buildingsRazed: number;
  buildingsLost: number;
  goldMined: number;
  lumberHarvested: number;
  goldLostToUpkeep: number;
  heroKills: number;
  creepsKilled: number;
  itemsFound: number;
}

export class Player {
  id: number;
  name: string;
  faction: FactionId;
  color: number;
  team: number;
  isAI: boolean;
  difficulty: Difficulty;
  isNeutral: boolean;
  passive: boolean;
  gold = 0;
  lumber = 0;
  foodUsed = 0;
  foodCap = 0;
  tier = 1;
  upgrades = new Map<string, number>();
  researching = new Set<string>();
  /** hero def ids owned (alive or dead) */
  heroIds: number[] = [];
  heroesTrainingCount = 0;
  defeated = false;
  victorious = false;
  /** visible tiles for this player's team (shared array between allies) */
  visible!: Uint8Array;
  explored!: Uint8Array;
  detect!: Uint8Array;
  /** last positions where this player was attacked (alerts) */
  lastAlertTime = -100;
  stats: PlayerStats = {
    unitsTrained: 0,
    unitsKilled: 0,
    unitsLost: 0,
    buildingsBuilt: 0,
    buildingsRazed: 0,
    buildingsLost: 0,
    goldMined: 0,
    lumberHarvested: 0,
    goldLostToUpkeep: 0,
    heroKills: 0,
    creepsKilled: 0,
    itemsFound: 0,
  };
  startX = 0;
  startY = 0;
  /** forces day time when > 0 (seconds) */
  shareVisionWith = 0;
  /** cached counts of completed buildings by def id (updated each second) */
  buildingCounts = new Map<string, number>();
  unitCounts = new Map<string, number>();
  /** global revealed flag (campaign / debug) */
  revealAll = false;
  /** defeat timer used when the player has no hall */
  messages: { text: string; time: number }[] = [];

  constructor(id: number, name: string, faction: FactionId, color: number, team: number, isAI: boolean, difficulty: Difficulty) {
    this.id = id;
    this.name = name;
    this.faction = faction;
    this.color = color;
    this.team = team;
    this.isAI = isAI;
    this.difficulty = difficulty;
    this.isNeutral = false;
    this.passive = false;
  }

  upgradeLevel(id: string): number {
    return this.upgrades.get(id) ?? 0;
  }
  count(defId: string): number {
    return (this.buildingCounts.get(defId) ?? 0) + (this.unitCounts.get(defId) ?? 0);
  }
}

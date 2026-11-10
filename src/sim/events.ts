import type { AttackType, Resource } from '../data/types';
import type { Order } from './entity';

export type GameEvent =
  | { t: 'attack'; src: number; tgt: number; ranged: boolean }
  | { t: 'hit'; src: number; tgt: number; amount: number; crit: boolean; atk: AttackType | 'spell' }
  | { t: 'miss'; tgt: number }
  | { t: 'death'; id: number; killer: number }
  | { t: 'spawn'; id: number }
  | { t: 'buildStart'; id: number }
  | { t: 'buildDone'; id: number; owner: number }
  | { t: 'trained'; id: number; owner: number }
  | { t: 'research'; owner: number; upgrade: string; level: number }
  | { t: 'upgraded'; id: number; owner: number }
  | { t: 'levelUp'; id: number }
  | { t: 'cast'; id: number; ability: string; x: number; y: number; target: number }
  | { t: 'fx'; fx: string; x: number; y: number; r?: number; color?: number; dur?: number; target?: number; x2?: number; y2?: number; src?: number }
  | { t: 'float'; x: number; y: number; text: string; color: number; owner?: number }
  | { t: 'alert'; owner: number; x: number; y: number; kind: 'attack' | 'hero' | 'building' | 'ally' }
  | { t: 'msg'; owner: number; text: string; kind?: 'error' | 'info' | 'good' }
  | { t: 'deposit'; id: number; res: Resource; amount: number; owner: number }
  | { t: 'treeFell'; tree: number }
  | { t: 'chop'; id: number }
  | { t: 'item'; id: number; owner: number; text: string }
  | { t: 'heroDied'; id: number; owner: number }
  | { t: 'gameOver'; winners: number[] }
  | { t: 'playerDefeated'; owner: number }
  | { t: 'dialogue'; speaker: string; text: string; portrait?: string; duration?: number }
  | { t: 'objective'; text: string; done?: boolean; failed?: boolean; id: string };

export type Command =
  | { type: 'order'; player: number; units: number[]; order: Order; queued?: boolean }
  | { type: 'stop'; player: number; units: number[] }
  | { type: 'train'; player: number; building: number; unit: string }
  | { type: 'research'; player: number; building: number; upgrade: string }
  | { type: 'upgradeBuilding'; player: number; building: number; to: string }
  | { type: 'cancelQueue'; player: number; building: number; index: number }
  | { type: 'cancelConstruction'; player: number; building: number }
  | { type: 'build'; player: number; units: number[]; defId: string; tx: number; ty: number; queued?: boolean }
  | { type: 'rally'; player: number; buildings: number[]; x: number; y: number; target?: number; tree?: number }
  | { type: 'cast'; player: number; units: number[]; ability: string; target?: number; x?: number; y?: number; queued?: boolean }
  | { type: 'autocast'; player: number; units: number[]; ability: string; on: boolean }
  | { type: 'learn'; player: number; hero: number; ability: string }
  | { type: 'useItem'; player: number; hero: number; slot: number; target?: number; x?: number; y?: number }
  | { type: 'swapItem'; player: number; hero: number; from: number; to: number }
  | { type: 'dropItem'; player: number; hero: number; slot: number; x: number; y: number; target?: number }
  | { type: 'buyItem'; player: number; shop: number; item: string; hero?: number }
  | { type: 'sellItem'; player: number; shop: number; hero: number; slot: number }
  | { type: 'hireHero'; player: number; tavern: number; hero: string }
  | { type: 'hireMerc'; player: number; camp: number; unit: string }
  | { type: 'revive'; player: number; altar: number; hero: number }
  | { type: 'unload'; player: number; building: number }
  | { type: 'transfer'; player: number; to: number; gold: number; lumber: number }
  | { type: 'cheat'; player: number; code: string };

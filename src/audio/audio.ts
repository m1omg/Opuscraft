import type { FactionId } from '../data/types';
import type { Entity } from '../sim/entity';
import type { GameEvent } from '../sim/events';
import type { World } from '../sim/world';
import type { Settings } from '../settings';

/** Placeholder audio engine; replaced by the full synthesizer. */
export class AudioEngine {
  constructor(public settings: Settings) {}
  unlock(): void {}
  startGame(_f: FactionId): void {}
  menuMusic(): void {}
  stopMusic(): void {}
  update(_dt: number, _x: number, _y: number, _dist: number, _night: boolean): void {}
  handleEvents(_w: World, _ev: GameEvent[], _local: number): void {}
  voiceSelect(_e: Entity): void {}
  voiceOrder(_e: Entity, _attack: boolean): void {}
  ui(_k: string): void {}
  setVolumes(_s: Settings): void {}
  stinger(_k: 'victory' | 'defeat'): void {}
}

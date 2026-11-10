import { validateData } from './data/index';
import { GameSession } from './game';
import { presetMap } from './sim/mapgen';
import { loadSettings } from './settings';
import { AudioEngine } from './audio/audio';
import type { FactionId } from './data/types';

const errs = validateData();
if (errs.length) console.error('Data errors', errs);
const app = document.getElementById('app')!;
const settings = loadSettings();
const audio = new AudioEngine(settings);
const params = new URLSearchParams(location.search);
const faction = (params.get('f') as FactionId) || 'crown';
const enemy = (params.get('e') as FactionId) || 'iron';
const spectate = params.has('spectate');
const s = new GameSession(app, {
  setup: {
    map: presetMap(params.get('map') || 'thornvale'),
    seed: Number(params.get('seed') || 7),
    players: [
      { name: 'You', faction, color: 1, team: 0, ai: spectate, difficulty: 'normal', start: 0 },
      { name: 'Computer', faction: enemy, color: 0, team: 1, ai: true, difficulty: 'normal', start: 1 },
    ],
  },
  local: 0,
  settings,
  audio,
  title: 'Skirmish',
  onExit: () => location.reload(),
});
// debug: fast-forward the simulation
const ff = Number(params.get('t') || 0);
if (ff > 0) {
  const w = s.world;
  const ais = (s as unknown as { ais: { update(): void }[] }).ais;
  for (let i = 0; i < ff * 20; i++) {
    for (const ai of ais) ai.update();
    w.step();
    w.events.length = 0;
  }
}
if (params.has('reveal')) s.world.players[0].revealAll = true;
s.start();
(window as unknown as { game: GameSession }).game = s;

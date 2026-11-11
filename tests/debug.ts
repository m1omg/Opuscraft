declare const process: { argv: string[] };
declare function require(m: string): { readFileSync(p: string, e: string): string };
import '../src/data/index';
import { World } from '../src/sim/world';
import { createAIs } from '../src/ai/ai';
import { decodeMap } from '../src/editor/mapcodec';
const text = require('node:fs').readFileSync(process.argv[2], 'utf8');
const map = decodeMap(text);
for (const [a, b] of [['crown', 'iron'], ['sepulchral', 'twilight']] as const) {
  const w = new World({ map, seed: 5, players: [
    { name: a, faction: a, color: 1, team: 0, ai: true, difficulty: 'normal', start: 0 },
    { name: b, faction: b, color: 0, team: 1, ai: true, difficulty: 'normal', start: 1 }] });
  const ais = createAIs(w);
  while (!w.gameOver && w.time < 40 * 60) { for (const ai of ais) ai.update(); w.step(); w.events.length = 0; }
  const p = w.players.filter((x) => !x.isNeutral).map((x) => `${x.name}: kills ${x.stats.unitsKilled} trained ${x.stats.unitsTrained ?? '?'} gold ${Math.round(x.stats.goldMined ?? 0)}`);
  console.log(`${a} vs ${b} on ${map.name}: winner ${w.winners.map((i) => w.players[i].name).join(',') || 'none'} at ${Math.round(w.time / 60)}m | ${p.join(' | ')}`);
}

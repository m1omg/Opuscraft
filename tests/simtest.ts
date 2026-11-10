declare const process: { exit(code: number): never; argv: string[] };
import { validateData } from '../src/data/index';
import { World } from '../src/sim/world';
import { presetMap } from '../src/sim/mapgen';
import { createAIs } from '../src/ai/ai';
import type { FactionId } from '../src/data/types';
import type { Difficulty } from '../src/sim/player';

const errs = validateData();
if (errs.length) {
  console.error('DATA ERRORS:\n' + errs.join('\n'));
  process.exit(1);
}

function run(mapId: string, factions: FactionId[], diffs: Difficulty[], seed: number, maxMin: number, verbose: boolean) {
  const map = presetMap(mapId);
  const teams = factions.length === 4 && process.argv.includes('--teams') ? [0, 0, 1, 1] : factions.map((_, i) => i);
  const w = new World({
    map,
    seed,
    players: factions.map((f, i) => ({ name: f + i, faction: f, color: i, team: teams[i], ai: true, difficulty: diffs[i % diffs.length], start: i })),
  });
  const ais = createAIs(w);
  const t0 = Date.now();
  let lastLog = 0;
  const maxTicks = maxMin * 60 * 20;
  while (!w.gameOver && w.tick < maxTicks) {
    for (const ai of ais) ai.update();
    w.step();
    w.events.length = 0;
    if (verbose && w.time - lastLog >= 120) {
      lastLog = w.time;
      const line = w.players.filter((p) => !p.isNeutral).map((p) => {
        const units = w.entities.filter((e) => e.owner === p.id && e.alive && e.isUnit);
        const workers = units.filter((e) => e.isWorker).length;
        const heroes = units.filter((e) => e.hero).map((e) => e.def.id.split('_h_')[1] + e.hero!.level).join(',');
        const bld = w.entities.filter((e) => e.owner === p.id && e.alive && e.b).length;
        return `${p.name}: t${p.tier} g${Math.round(p.gold)} l${Math.round(p.lumber)} f${p.foodUsed}/${p.foodCap} w${workers} a${units.length - workers} b${bld} [${heroes}] k${p.stats.unitsKilled}`;
      });
      console.log(`${Math.round(w.time / 60)}m | ` + line.join(' | '));
    }
  }
  const ms = Date.now() - t0;
  const winners = w.winners.map((i) => w.players[i].name).join('+') || 'none';
  console.log(`== ${factions.join(' vs ')} on ${mapId}: winner ${winners} at ${Math.round(w.time / 60)}m (${ms}ms, ${w.entities.length} entities)`);
  return w;
}

const args = process.argv.slice(2);
if (args[0] === 'all') {
  const fs: FactionId[] = ['crown', 'iron', 'sepulchral', 'twilight'];
  let s = 1;
  for (const a of fs) for (const b of fs) if (a < b) run('thornvale', [a, b], ['normal'], s++, 45, false);
} else if (args[0] === 'ffa') {
  run('fourbanners', ['crown', 'iron', 'sepulchral', 'twilight'], ['normal'], 5, 50, true);
} else {
  const a = (args[0] as FactionId) || 'crown';
  const b = (args[1] as FactionId) || 'iron';
  const map = args[2] || 'thornvale';
  run(map, [a, b], [(args[3] as Difficulty) || 'normal', (args[4] as Difficulty) || 'normal'], Number(args[5] || 1), 45, true);
}

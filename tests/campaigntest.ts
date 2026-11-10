declare const process: { exit(code: number): never; argv: string[] };
import '../src/data/index';
import { World } from '../src/sim/world';
import { createAIs } from '../src/ai/ai';
import { MISSIONS } from '../src/campaign/missions';

for (const m of MISSIONS) {
  if (process.argv[2] && process.argv[2] !== m.id) continue;
  const { setup, local } = m.build();
  setup.players[local].ai = true; // let the AI play the player's side for the test
  const w = new World(setup);
  const ais = createAIs(w);
  const log: string[] = [];
  const t0 = Date.now();
  let err: unknown = null;
  try {
    while (!w.gameOver && w.time < 60 * 25) {
      for (const a of ais) a.update();
      w.step();
      for (const ev of w.events) {
        if (ev.t === 'objective') log.push(`${Math.round(w.time)}s OBJ ${ev.text}${ev.done ? ' [done]' : ''}${ev.failed ? ' [failed]' : ''}`);
        if (ev.t === 'dialogue') log.push(`${Math.round(w.time)}s ${ev.speaker}: ${ev.text.slice(0, 60)}`);
      }
      w.events.length = 0;
    }
  } catch (e) {
    err = e;
  }
  console.log(`== ${m.id} ${m.title}: ${err ? 'ERROR ' + (err as Error).stack : w.gameOver ? 'winners ' + w.winners.join(',') : 'no result'} at ${Math.round(w.time)}s (${Date.now() - t0}ms)`);
  for (const l of log.slice(0, 40)) console.log('   ' + l);
}

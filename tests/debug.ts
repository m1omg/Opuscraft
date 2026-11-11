import '../src/data/index';
import { World } from '../src/sim/world';
import { MISSIONS } from '../src/campaign/missions';
import { kill } from '../src/sim/combat';
import type { Entity } from '../src/sim/entity';
function tp(w: World, e: Entity, x: number, y: number) {
  const d = w.map.nearestPassable(x, y, e.large, 8)!;
  e.x = e.px = d[0]; e.y = e.py = d[1]; e.hasGoal = false; e.order = null as any;
}
function run(id: string, plan: (w: World, t: number) => void) {
  const m = MISSIONS.find((x) => x.id === id)!;
  const { setup } = m.build();
  const w = new World(setup);
  const objs: string[] = [];
  while (!w.gameOver && w.time < 200) {
    plan(w, w.time);
    w.step();
    for (const ev of w.events) if (ev.t === 'objective') objs.push(`${Math.round(w.time)}s ${ev.text}${ev.done ? ' [done]' : ''}${ev.failed ? ' [failed]' : ''}`);
    w.events.length = 0;
  }
  console.log(`== ${id}: gameOver=${w.gameOver} winners=${JSON.stringify(w.winners)} at ${Math.round(w.time)}s`);
  for (const o of objs) console.log('   ' + o);
}
const heroes = (w: World) => w.entities.filter((e) => e.owner === 0 && e.hero && e.alive);
// m2: walk heroes to the crater, then slay the guardian
run('m2', (w, t) => {
  const s1 = w.map.data.starts[1];
  if (Math.abs(t - 15) < 0.03) for (const h of heroes(w)) { tp(w, h, s1.x - 10, s1.y); h.hp = h.st.maxHp; }
  if (Math.abs(t - 20) < 0.03) { const g = w.entities.find((e) => e.alive && e.def.name === 'Shard Colossus'); if (g) kill(w, g, heroes(w)[0]); }
  for (const h of heroes(w)) h.hp = h.st.maxHp; // keep heroes alive for the scripted check
});
// m4: break the cages, then bring the heroes home
run('m4', (w, t) => {
  if (Math.abs(t - 15) < 0.03) for (const c of w.entities.filter((e) => e.alive && e.def.id === 'soul_cage')) kill(w, c, heroes(w)[0]);
  if (Math.abs(t - 20) < 0.03) { const s1 = w.map.data.starts[1]; for (const h of heroes(w)) tp(w, h, s1.x, s1.y + 4); }
  for (const h of heroes(w)) h.hp = h.st.maxHp;
});
// m5: destroy the shard heart
run('m5', (w, t) => {
  if (Math.abs(t - 20) < 0.03) { const hrt = w.entities.find((e) => e.alive && e.def.id === 'shard_heart'); if (hrt) kill(w, hrt, heroes(w)[0]); }
});

import '../src/data/index';
import { World } from '../src/sim/world';
import { presetMap } from '../src/sim/mapgen';
const map = presetMap('ashkar');
const w = new World({ map, seed: 1, fog: false, noStartBases: true, noCreeps: true, script: { customVictory: true }, players: [
  { name: 'A', faction: 'iron', color: 1, team: 0, ai: false, difficulty: 'normal', start: 0 },
  { name: 'B', faction: 'iron', color: 0, team: 1, ai: false, difficulty: 'normal', start: 1 }] } as any);
for (const e of w.entities) if (e.owner !== 0 && Math.abs(e.x - map.w / 2) < 22 && Math.abs(e.y - map.h / 2) < 16 && !e.def.goldMine) w.removeEntity(e);
const ids = ['ir_htotem1', 'ir_healward_u', 'cr_banner1', 'ir_clanhand'];
const us = ids.map((id, i) => { const u = w.spawnUnit(id, 0, map.w / 2 + i * 3, map.h / 2, 0); u.lifetime = 0; return u; });
for (let t = 0; t < 400; t++) {
  w.step();
  for (const ev of w.events) if (ev.t === 'death') { const e = w.byId.get((ev as any).id); console.log('tick', t, 'death', e?.def.id, 'killer', (ev as any).killer); }
  w.events.length = 0;
}
for (const u of us) console.log(u.def.id, 'alive', u.alive, 'hp', u.hp, 'lifetime', u.lifetime, 'order', u.order?.type);

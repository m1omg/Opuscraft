import '../src/data/index';
import { GameMap } from '../src/sim/map';
import { Pathfinder } from '../src/sim/path';
import { presetMap, MAP_PRESETS } from '../src/sim/mapgen';
for (const pr of MAP_PRESETS) {
  const data = presetMap(pr.id);
  const m = new GameMap(data);
  const pf = new Pathfinder(m);
  const res: string[] = [];
  const pts = [...data.starts.map(s => ({ x: s.x + 3.5, y: s.y + 3.5 })), ...data.mines.map(mm => ({ x: mm.x + 2.5, y: mm.y })), ...data.neutrals.map(n => ({ x: n.x, y: n.y + 3.5 }))];
  for (let i = 1; i < pts.length; i++) {
    const r = pf.findPath(pts[0].x, pts[0].y, pts[i].x, pts[i].y, false, 0.35, 300000);
    if (!r || !r.complete) res.push(`#${i} (${pts[i].x.toFixed(0)},${pts[i].y.toFixed(0)}) ${r ? 'PARTIAL' : 'NULL'}`);
  }
  console.log(pr.id, res.length ? res.join('  ') : 'all reachable', 'trees', data.trees.length);
}

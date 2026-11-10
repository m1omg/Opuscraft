import type { World } from './world';

const circleCache = new Map<number, Int16Array>();
function circle(r: number): Int16Array {
  const key = Math.round(r * 2);
  let c = circleCache.get(key);
  if (c) return c;
  const rr = key / 2;
  const out: number[] = [];
  const R = Math.ceil(rr);
  for (let dy = -R; dy <= R; dy++)
    for (let dx = -R; dx <= R; dx++) {
      if (dx * dx + dy * dy <= rr * rr + 0.25) out.push(dx, dy);
    }
  c = Int16Array.from(out);
  circleCache.set(key, c);
  return c;
}

/** Recompute visible/explored/detection grids for every team. */
export function updateVision(w: World, _full: boolean): void {
  const map = w.map;
  const W = map.w;
  const H = map.h;
  const seenTeams = new Set<Uint8Array>();
  for (const p of w.players) {
    if (p.passive) continue;
    if (!seenTeams.has(p.visible)) {
      p.visible.fill(0);
      p.detect.fill(0);
      seenTeams.add(p.visible);
    }
  }
  const night = w.night;
  for (const e of w.entities) {
    if (!e.alive || e.removed || e.inside >= 0 || e.kind === 'item') continue;
    const p = w.players[e.owner];
    if (!p || p.passive) continue;
    let sight = night ? e.st.sightNight : e.st.sightDay;
    if (e.b && e.b.constructing) sight = Math.min(sight, 3);
    if (sight <= 0) continue;
    const ex = Math.floor(e.x);
    const ey = Math.floor(e.y);
    const air = e.isAir;
    const lvl = air ? 99 : map.levelAt(e.x, e.y);
    const vis = p.visible;
    const offs = circle(sight);
    for (let i = 0; i < offs.length; i += 2) {
      const x = ex + offs[i];
      const y = ey + offs[i + 1];
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const idx = y * W + x;
      if (map.level[idx] > lvl && !map.ramp[idx]) continue;
      vis[idx] = 1;
    }
    if (e.def.tags?.detector || e.def.weapon && e.b) {
      const det = p.detect;
      const doffs = circle(e.b ? Math.min(sight, 9) : sight);
      for (let i = 0; i < doffs.length; i += 2) {
        const x = ex + doffs[i];
        const y = ey + doffs[i + 1];
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        det[y * W + x] = 1;
      }
    }
  }
  // spell reveals (also detect)
  if (w.reveals.length) {
    for (const r of w.reveals) {
      if (r.until < w.time) continue;
      const p = w.players[r.owner];
      if (!p) continue;
      const offs = circle(r.r);
      const cx = Math.floor(r.x);
      const cy = Math.floor(r.y);
      for (let i = 0; i < offs.length; i += 2) {
        const x = cx + offs[i];
        const y = cy + offs[i + 1];
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        p.visible[y * W + x] = 1;
        p.detect[y * W + x] = 1;
      }
    }
    if (w.tick % 40 === 0) w.reveals = w.reveals.filter((r) => r.until >= w.time);
  }
  for (const p of w.players) {
    if (p.passive) continue;
    const v = p.visible;
    const ex = p.explored;
    for (let i = 0; i < v.length; i++) if (v[i]) ex[i] = 1;
  }
  // entity "seen by" masks used by the renderer for remembered buildings
  for (const e of w.entities) {
    if (!e.alive || e.removed) continue;
    let mask = 0;
    for (const p of w.players) {
      if (p.isNeutral || p.id > 30) continue;
      if (w.canSee(p.id, e)) mask |= 1 << p.id;
    }
    e.seenBy = mask;
  }
}

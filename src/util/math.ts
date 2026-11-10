export const TAU = Math.PI * 2;

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
export function dist(ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  return Math.sqrt(dx * dx + dy * dy);
}
export function dist2(ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  return dx * dx + dy * dy;
}
/** Wrap angle into (-PI, PI]. */
export function wrapAngle(a: number): number {
  while (a > Math.PI) a -= TAU;
  while (a <= -Math.PI) a += TAU;
  return a;
}
export function angleTo(ax: number, ay: number, bx: number, by: number): number {
  return Math.atan2(by - ay, bx - ax);
}
/** Rotate angle `a` toward `b` by at most `step` radians. */
export function turnToward(a: number, b: number, step: number): number {
  const d = wrapAngle(b - a);
  if (Math.abs(d) <= step) return b;
  return wrapAngle(a + Math.sign(d) * step);
}
export function lerpAngle(a: number, b: number, t: number): number {
  return a + wrapAngle(b - a) * t;
}
/** Exponential smoothing factor that is independent of frame rate. */
export function damp(rate: number, dt: number): number {
  return 1 - Math.exp(-rate * dt);
}
/** Distance from a point to an axis-aligned rectangle (0 if inside). */
export function distToRect(px: number, py: number, x0: number, y0: number, x1: number, y1: number): number {
  const dx = px < x0 ? x0 - px : px > x1 ? px - x1 : 0;
  const dy = py < y0 ? y0 - py : py > y1 ? py - y1 : 0;
  return Math.sqrt(dx * dx + dy * dy);
}
export function closestPointOnRect(px: number, py: number, x0: number, y0: number, x1: number, y1: number): [number, number] {
  return [clamp(px, x0, x1), clamp(py, y0, y1)];
}
/** Distance from point to segment ab. */
export function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const vx = bx - ax;
  const vy = by - ay;
  const l2 = vx * vx + vy * vy;
  let t = l2 > 0 ? ((px - ax) * vx + (py - ay) * vy) / l2 : 0;
  t = clamp(t, 0, 1);
  return dist(px, py, ax + vx * t, ay + vy * t);
}
export function fmtTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r < 10 ? '0' : ''}${r}`;
}

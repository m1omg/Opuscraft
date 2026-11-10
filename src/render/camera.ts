import * as THREE from 'three';
import type { GameMap } from '../sim/map';
import { clamp, damp } from '../util/math';

/** Angled RTS camera that orbits a ground target. All motion is time-based. */
export class RTSCamera {
  readonly cam: THREE.PerspectiveCamera;
  tx: number;
  ty: number;
  dist = 27;
  private goalDist = 27;
  minDist = 13;
  maxDist = 46;
  pitch = 0.98; // radians above horizon
  yaw = 0;
  private map: GameMap;
  private groundY = 0;
  private shakeT = 0;
  private shakeAmp = 0;

  constructor(map: GameMap, aspect: number) {
    this.map = map;
    this.cam = new THREE.PerspectiveCamera(40, aspect, 0.5, 400);
    this.tx = map.w / 2;
    this.ty = map.h / 2;
  }

  lookAt(x: number, y: number): void {
    this.tx = x;
    this.ty = y;
    this.clampTarget();
  }

  zoom(delta: number): void {
    this.goalDist = clamp(this.goalDist * Math.pow(1.0015, delta), this.minDist, this.maxDist);
  }

  setZoom(d: number): void {
    this.goalDist = clamp(d, this.minDist, this.maxDist);
    this.dist = this.goalDist;
  }

  pan(dx: number, dy: number): void {
    this.tx += dx;
    this.ty += dy;
    this.clampTarget();
  }

  shake(amp: number): void {
    this.shakeAmp = Math.max(this.shakeAmp, amp);
    this.shakeT = 0.4;
  }

  private clampTarget(): void {
    const m = 4;
    this.tx = clamp(this.tx, m, this.map.w - m);
    this.ty = clamp(this.ty, m + 2, this.map.h - m + 4);
  }

  update(dt: number): void {
    this.dist += (this.goalDist - this.dist) * damp(10, dt);
    const gh = this.map.heightAt(clamp(this.tx, 0, this.map.w - 1), clamp(this.ty, 0, this.map.h - 1));
    this.groundY += (gh - this.groundY) * damp(4, dt);
    const horiz = Math.cos(this.pitch) * this.dist;
    let sx = 0;
    let sy = 0;
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      sx = (Math.random() - 0.5) * this.shakeAmp;
      sy = (Math.random() - 0.5) * this.shakeAmp;
      if (this.shakeT <= 0) this.shakeAmp = 0;
    }
    this.cam.position.set(this.tx + Math.sin(this.yaw) * horiz + sx, this.groundY + Math.sin(this.pitch) * this.dist + sy, this.ty + Math.cos(this.yaw) * horiz);
    this.cam.lookAt(this.tx + sx, this.groundY, this.ty);
  }

  /** Intersect a screen ray (NDC) with the terrain heightfield. Returns sim coordinates. */
  groundPoint(ndcX: number, ndcY: number): { x: number; y: number } {
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.cam);
    const o = ray.ray.origin;
    const d = ray.ray.direction;
    let h = this.groundY;
    let x = o.x;
    let z = o.z;
    for (let i = 0; i < 5; i++) {
      if (Math.abs(d.y) < 1e-4) break;
      const t = (h - o.y) / d.y;
      x = o.x + d.x * t;
      z = o.z + d.z * t;
      h = this.map.heightAt(clamp(x, 0, this.map.w - 0.01), clamp(z, 0, this.map.h - 0.01));
    }
    return { x, y: z };
  }

  /** Corners of the visible ground area (for the minimap frustum). */
  footprint(): { x: number; y: number }[] {
    return [this.groundPoint(-1, 1), this.groundPoint(1, 1), this.groundPoint(1, -1), this.groundPoint(-1, -1)];
  }
}

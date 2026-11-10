import * as THREE from 'three';
import { DEFS, getDef } from '../data/registry';
import { DT } from '../data/rules';
import type { Entity } from '../sim/entity';
import type { GameEvent } from '../sim/events';
import type { World } from '../sim/world';
import { clamp, damp } from '../util/math';
import { RTSCamera } from './camera';
import { Effects } from './effects';
import { MATS, PALETTES, worldUniforms } from './materials';
import { instantiate, templateFor } from './models';
import { Overlay } from './overlay';
import { FogTexture, TerrainView, TreeField } from './terrain';
import { EntityViews } from './views';

export interface RenderSettings {
  shadows: boolean;
  quality: number; // 0.5 .. 1
  pixelRatio: number;
  alwaysBars: boolean;
}

const ATK_COLOR: Record<string, number> = {
  normal: 0xfff0c0,
  pierce: 0xfff0c0,
  siege: 0xffa040,
  magic: 0xc8a0ff,
  hero: 0xffe080,
  chaos: 0xff4040,
  spell: 0xc8e0ff,
};

export class GameRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: RTSCamera;
  readonly overlay: Overlay;
  readonly views: EntityViews;
  readonly fx: Effects;
  private terrain: TerrainView;
  private trees: TreeField;
  private fog: FogTexture;
  private sun: THREE.DirectionalLight;
  private hemi: THREE.HemisphereLight;
  private world: World;
  local: number;
  private container: HTMLElement;
  private nightness = 0;
  private time = 0;
  private placement: THREE.Group | null = null;
  private placementDef = '';
  private tiles: THREE.Mesh[] = [];
  private aoe: THREE.Mesh;
  private width = 1;
  private height = 1;
  settings: RenderSettings;
  private pal;
  private ground: THREE.Mesh;

  constructor(container: HTMLElement, world: World, local: number, settings: RenderSettings) {
    this.container = container;
    this.world = world;
    this.local = local;
    this.settings = settings;
    this.pal = PALETTES[world.map.biome];
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, settings.pixelRatio));
    this.renderer.shadowMap.enabled = settings.shadows;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.domElement.className = 'game-canvas';
    container.appendChild(this.renderer.domElement);
    this.overlay = new Overlay(container);
    this.camera = new RTSCamera(world.map, 1);

    const map = world.map;
    this.fog = new FogTexture(map.w, map.h);
    this.terrain = new TerrainView(map);
    this.scene.add(this.terrain.mesh);
    if (this.terrain.water) this.scene.add(this.terrain.water);
    this.trees = new TreeField(map);
    this.scene.add(this.trees.group);
    // dark skirt beyond the map edges
    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(map.w * 3, map.h * 3), new THREE.MeshBasicMaterial({ color: 0x050608 }));
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.set(map.w / 2, -2.5, map.h / 2);
    this.scene.add(this.ground);

    this.fx = new Effects(map);
    this.fx.quality = settings.quality;
    this.scene.add(this.fx.group);
    this.views = new EntityViews(world, local, this.fx);
    this.views.setShadows(settings.shadows);
    this.scene.add(this.views.group);

    this.hemi = new THREE.HemisphereLight(this.pal.ambient, this.pal.ground, 1.1);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(this.pal.sun, 2.2);
    this.sun.castShadow = settings.shadows;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.04;
    const sc = this.sun.shadow.camera as THREE.OrthographicCamera;
    sc.left = -34;
    sc.right = 34;
    sc.top = 34;
    sc.bottom = -34;
    sc.near = 1;
    sc.far = 140;
    this.scene.add(this.sun, this.sun.target);
    this.scene.fog = new THREE.Fog(this.pal.sky, 60, 140);

    // targeting indicator
    const ringG = new THREE.RingGeometry(0.92, 1, 48);
    ringG.rotateX(-Math.PI / 2);
    this.aoe = new THREE.Mesh(ringG, new THREE.MeshBasicMaterial({ color: 0x80ff80, transparent: true, opacity: 0.85, depthWrite: false }));
    this.aoe.visible = false;
    this.aoe.renderOrder = 8;
    this.scene.add(this.aoe);

    const p = world.players[local];
    if (p) this.camera.lookAt(p.startX, p.startY + 4);
    this.fog.snap(p?.visible ?? new Uint8Array(map.w * map.h), p?.explored ?? new Uint8Array(map.w * map.h), !world.fog);
    this.resize();
  }

  applySettings(s: RenderSettings): void {
    this.settings = s;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, s.pixelRatio));
    this.renderer.shadowMap.enabled = s.shadows;
    this.sun.castShadow = s.shadows;
    this.views.setShadows(s.shadows);
    this.fx.quality = s.quality;
    // materials must recompile when shadow support toggles
    this.scene.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | undefined;
      if (m) m.needsUpdate = true;
    });
    this.resize();
  }

  resize(): void {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.width = w;
    this.height = h;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = w + 'px';
    this.renderer.domElement.style.height = h + 'px';
    this.camera.cam.aspect = w / h;
    this.camera.cam.updateProjectionMatrix();
    this.overlay.resize(w, h, this.renderer.getPixelRatio());
    this.fx.setViewportScale(h * this.renderer.getPixelRatio() * 0.9);
  }

  get viewport(): { w: number; h: number } {
    return { w: this.width, h: this.height };
  }

  /** Render one frame. `dt` is real seconds since the previous frame; `alpha` the sim interpolation factor. */
  frame(dt: number, alpha: number): void {
    const w = this.world;
    this.time += dt;
    worldUniforms.uTime.value = this.time;
    const p = w.players[this.local];
    const reveal = !w.fog || !!p?.revealAll;
    worldUniforms.uFogEnabled.value = reveal ? 0 : 1;
    this.views.revealAll = reveal;
    if (p) this.fog.update(p.visible, p.explored, dt, reveal);
    this.terrain.update();
    this.trees.update();
    this.camera.update(dt);
    this.updateLighting(dt);
    const renderTime = w.time + alpha * DT;
    this.views.sync(alpha, dt, renderTime);
    this.fx.syncProjectiles(w.projectiles, alpha, (x, y) => reveal || w.tileVisible(this.local, x, y));
    this.fx.update(dt);
    this.renderer.render(this.scene, this.camera.cam);
    this.overlay.draw(w, this.views, this.camera.cam, this.local, dt, 27 / this.camera.dist);
  }

  private updateLighting(dt: number): void {
    const w = this.world;
    const tod = w.tod;
    const naturalNight = w.night ? 1 : 0;
    // smooth dawn/dusk transitions around 6:00 and 18:00 based on the clock
    const hours = tod * 24;
    let target = naturalNight;
    if (w.forcedDay <= 0 && w.forcedNight <= 0) {
      if (hours > 5 && hours < 7) target = 1 - (hours - 5) / 2;
      else if (hours > 17 && hours < 19) target = (hours - 17) / 2;
    }
    this.nightness += (target - this.nightness) * damp(1.5, dt);
    const n = this.nightness;
    // sun arcs from east to west
    const ang = (tod - 0.25) * Math.PI * 2;
    const elev = Math.max(0.35, Math.abs(Math.sin(ang)));
    const dir = new THREE.Vector3(Math.cos(ang) * 0.8, elev * 1.4, 0.55).normalize();
    const cx = this.camera.tx;
    const cy = this.camera.ty;
    this.sun.position.set(cx + dir.x * 50, dir.y * 50, cy + dir.z * 50);
    this.sun.target.position.set(cx, 0, cy);
    const sunCol = new THREE.Color(this.pal.sun);
    const dusk = new THREE.Color(0xffa36a);
    const moon = new THREE.Color(0x8aa8ff);
    const twilight = 1 - Math.abs(n - 0.5) * 2; // peaks mid-transition
    const c = sunCol.clone().lerp(dusk, Math.max(0, twilight) * 0.7).lerp(moon, n);
    this.sun.color.copy(c);
    this.sun.intensity = 2.3 * (1 - n) + 1.05 * n;
    this.hemi.intensity = 1.15 * (1 - n) + 0.85 * n;
    this.hemi.color.set(this.pal.ambient).lerp(new THREE.Color(0x6a7ac0), n * 0.8);
    const sky = new THREE.Color(this.pal.sky).lerp(new THREE.Color(this.pal.skyNight), n);
    this.scene.background = sky;
    const fog = this.scene.fog as THREE.Fog;
    fog.color.copy(sky);
    fog.near = this.camera.dist * 1.6;
    fog.far = this.camera.dist * 4.2;
    this.terrain.setLight(1 - n * 0.45);
  }

  // ---------------------------------------------------------------------------
  // events -> visuals
  // ---------------------------------------------------------------------------
  handleEvents(events: GameEvent[]): void {
    const w = this.world;
    const vis = (x: number, y: number) => !w.fog || w.players[this.local]?.revealAll || w.tileVisible(this.local, x, y);
    for (const ev of events) {
      switch (ev.t) {
        case 'hit': {
          const t = w.get(ev.tgt);
          if (!t || !vis(t.x, t.y)) break;
          const h = w.map.heightAt(t.x, t.y) + t.z + 0.7;
          if (ev.atk !== 'spell' || Math.random() < 0.3) this.fx.play('hit', t.x, t.y, { y: h, color: ATK_COLOR[ev.atk] });
          if (ev.crit && ev.amount >= 1) this.overlay.float(t.x, h + 0.6, t.y, Math.round(ev.amount) + '!', 0xff5030, 17, 1.2);
          break;
        }
        case 'miss': {
          const t = w.get(ev.tgt);
          if (t && vis(t.x, t.y) && (t.owner === this.local || Math.random() < 0.5)) this.overlay.float(t.x, w.map.heightAt(t.x, t.y) + 1.6, t.y, 'miss', 0xd0d0d0, 12, 0.9);
          break;
        }
        case 'death': {
          const e = w.get(ev.id);
          if (e && e.kind === 'unit' && vis(e.x, e.y) && ev.killer !== -2) this.fx.play('death', e.x, e.y);
          break;
        }
        case 'fx': {
          if (!vis(ev.x, ev.y) && !(ev.x2 !== undefined && vis(ev.x2, ev.y2 ?? ev.y))) break;
          if (ev.fx === 'replaced') break;
          if (ev.fx === 'lightning' || ev.fx === 'drain') {
            const s = ev.src !== undefined ? w.get(ev.src) : undefined;
            const t = ev.target !== undefined ? w.get(ev.target) : undefined;
            const y0 = s ? w.map.heightAt(s.x, s.y) + s.z + 1.0 : undefined;
            const y1 = t ? w.map.heightAt(t.x, t.y) + t.z + 0.8 : undefined;
            this.fx.play(ev.fx, ev.x, ev.y, { x2: ev.x2, z2: ev.y2, y: y0, y2: y1, color: ev.color });
            break;
          }
          this.fx.play(ev.fx, ev.x, ev.y, { r: ev.r, color: ev.color, dur: ev.dur, x2: ev.x2, z2: ev.y2 });
          if (ev.fx === 'explosion' && ev.r && ev.r > 2) this.camera.shake(0.12);
          break;
        }
        case 'cast': {
          const e = w.get(ev.id);
          if (e && vis(e.x, e.y)) this.fx.glow.emit(e.x, w.map.heightAt(e.x, e.y) + 1.4, e.y, { count: 8, color: 0xd8c8ff, life: 0.5, size: 0.25, speed: 1.2 });
          break;
        }
        case 'float':
          if (ev.owner !== undefined && ev.owner !== this.local) break;
          if (vis(ev.x, ev.y)) this.overlay.float(ev.x, this.world.map.heightAt(ev.x, ev.y) + 1.8, ev.y, ev.text, ev.color, 14);
          break;
        case 'levelUp': {
          const e = w.get(ev.id);
          if (e && vis(e.x, e.y)) {
            this.fx.play('levelUp', e.x, e.y);
            this.overlay.float(e.x, w.map.heightAt(e.x, e.y) + 2.4, e.y, 'Level ' + (e.hero?.level ?? ''), 0xffd860, 16, 1.8);
          }
          break;
        }
        case 'buildDone': {
          const e = w.get(ev.id);
          if (e && e.b && vis(e.x, e.y)) this.fx.play('buildDone', e.x, e.y, { r: e.b.size });
          break;
        }
        case 'treeFell': {
          const t = w.map.trees[ev.tree];
          if (t && vis(t.tx, t.ty)) this.fx.play('treeFell', t.tx + 0.5, t.ty + 0.5);
          break;
        }
        case 'deposit': {
          if (ev.owner !== this.local || ev.res !== 'gold') break;
          const e = w.get(ev.id);
          if (e && vis(e.x, e.y) && ev.amount > 0) this.overlay.float(e.x, w.map.heightAt(e.x, e.y) + 1.6, e.y, '+' + ev.amount, 0xffd34d, 11, 0.9);
          break;
        }
        case 'item': {
          const e = w.get(ev.id);
          if (e && ev.owner === this.local) this.overlay.float(e.x, w.map.heightAt(e.x, e.y) + 2.2, e.y, ev.text, 0x9ad0ff, 13, 1.6);
          break;
        }
        default:
          break;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // picking
  // ---------------------------------------------------------------------------
  screenToNdc(px: number, py: number): { x: number; y: number } {
    return { x: (px / this.width) * 2 - 1, y: -(py / this.height) * 2 + 1 };
  }

  screenToWorld(px: number, py: number): { x: number; y: number } {
    const n = this.screenToNdc(px, py);
    return this.camera.groundPoint(n.x, n.y);
  }

  worldToScreen(x: number, y: number, z: number): { x: number; y: number; ok: boolean } {
    const v = new THREE.Vector3(x, z, y).project(this.camera.cam);
    return { x: (v.x * 0.5 + 0.5) * this.width, y: (-v.y * 0.5 + 0.5) * this.height, ok: v.z > -1 && v.z < 1 };
  }

  /** The entity under the cursor (units preferred over buildings). */
  pick(px: number, py: number, filter?: (e: Entity) => boolean): Entity | null {
    const w = this.world;
    let best: Entity | null = null;
    let bestD = Infinity;
    const zoomF = 27 / this.camera.dist;
    for (const [, v] of this.views.views) {
      const e = v.e;
      if (!v.rig.root.visible || e.removed || (e.dead && !e.corpse)) continue;
      if (e.dead) continue;
      if (filter && !filter(e)) continue;
      const base = v.rig.root.position;
      if (e.b) {
        // test against the projected footprint box
        const s = e.b.size / 2;
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        for (const [ox, oz, oy] of [
          [-s, -s, 0],
          [s, -s, 0],
          [-s, s, 0],
          [s, s, 0],
          [-s, -s, v.rig.t.height * 0.8],
          [s, s, v.rig.t.height * 0.8],
          [-s, s, v.rig.t.height * 0.8],
          [s, -s, v.rig.t.height * 0.8],
        ]) {
          const p = this.worldToScreen(e.x + ox, e.y + oz, base.y + oy);
          minX = Math.min(minX, p.x);
          maxX = Math.max(maxX, p.x);
          minY = Math.min(minY, p.y);
          maxY = Math.max(maxY, p.y);
        }
        if (px >= minX && px <= maxX && py >= minY && py <= maxY) {
          const d = 40 + Math.hypot(px - (minX + maxX) / 2, py - (minY + maxY) / 2) * 0.2;
          if (d < bestD) {
            bestD = d;
            best = e;
          }
        }
        continue;
      }
      const hgt = (v.rig.t.height * v.rig.t.scale) * 0.55;
      const p = this.worldToScreen(base.x, base.z, base.y + hgt);
      const r = Math.max(14, (e.kind === 'item' ? 0.5 : e.radius + 0.25) * 42 * zoomF);
      const d = Math.hypot(px - p.x, (py - p.y) * 0.8);
      if (d < r && d < bestD) {
        bestD = d;
        best = e;
      }
    }
    void w;
    return best;
  }

  /** Units of `owner` inside a screen rectangle. */
  boxSelect(x0: number, y0: number, x1: number, y1: number, owner: number): Entity[] {
    const minX = Math.min(x0, x1);
    const maxX = Math.max(x0, x1);
    const minY = Math.min(y0, y1);
    const maxY = Math.max(y0, y1);
    const out: Entity[] = [];
    for (const [, v] of this.views.views) {
      const e = v.e;
      if (e.owner !== owner || e.dead || !e.alive || !v.rig.root.visible || e.kind !== 'unit') continue;
      const b = v.rig.root.position;
      const p = this.worldToScreen(b.x, b.z, b.y + 0.5);
      if (p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY) out.push(e);
    }
    return out;
  }

  /** Visible entities of the same type on screen (double-click selection). */
  sameTypeOnScreen(e: Entity): Entity[] {
    const out: Entity[] = [];
    for (const [, v] of this.views.views) {
      const o = v.e;
      if (o.owner !== e.owner || o.def.id !== e.def.id || o.dead || !o.alive || !v.rig.root.visible) continue;
      const b = v.rig.root.position;
      const p = this.worldToScreen(b.x, b.z, b.y);
      if (p.x >= 0 && p.x <= this.width && p.y >= 0 && p.y <= this.height) out.push(o);
    }
    return out;
  }

  // ---------------------------------------------------------------------------
  // building placement and targeting indicators
  // ---------------------------------------------------------------------------
  showPlacement(defId: string | null, tx: number, ty: number, valid: (x: number, y: number) => boolean, ok: boolean): void {
    if (!defId) {
      if (this.placement) this.placement.visible = false;
      for (const t of this.tiles) t.visible = false;
      return;
    }
    const def = getDef(defId);
    const size = def.size ?? 2;
    if (this.placementDef !== defId) {
      if (this.placement) this.scene.remove(this.placement);
      const rig = instantiate(templateFor(def, this.world.players[this.local].color));
      for (const m of rig.meshes) {
        m.material = MATS.ghost;
        m.castShadow = false;
      }
      this.placement = rig.root;
      this.placementDef = defId;
      this.scene.add(this.placement);
    }
    const cx = tx + size / 2;
    const cy = ty + size / 2;
    this.placement!.visible = true;
    this.placement!.position.set(cx, this.world.map.heightAt(cx, cy), cy);
    while (this.tiles.length < size * size) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.92, 0.92).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.45, depthWrite: false }));
      m.renderOrder = 9;
      this.scene.add(m);
      this.tiles.push(m);
    }
    let k = 0;
    for (let y = ty; y < ty + size; y++)
      for (let x = tx; x < tx + size; x++) {
        const m = this.tiles[k++];
        m.visible = true;
        m.position.set(x + 0.5, this.world.map.heightAt(x + 0.5, y + 0.5) + 0.06, y + 0.5);
        (m.material as THREE.MeshBasicMaterial).color.set(valid(x, y) && ok ? 0x40ff60 : 0xff3030);
      }
    for (; k < this.tiles.length; k++) this.tiles[k].visible = false;
  }

  showAoe(x: number | null, y: number, r: number, color = 0x80ff80): void {
    if (x === null) {
      this.aoe.visible = false;
      return;
    }
    this.aoe.visible = true;
    this.aoe.position.set(x, this.world.map.heightAt(clamp(x, 0, this.world.map.w - 1), clamp(y, 0, this.world.map.h - 1)) + 0.1, y);
    this.aoe.scale.set(r, 1, r);
    (this.aoe.material as THREE.MeshBasicMaterial).color.set(color);
  }

  dispose(): void {
    this.views.clear();
    this.fx.clear();
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.overlay.canvas.remove();
  }
}

export { DEFS };

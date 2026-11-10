import * as THREE from 'three';
import { DT } from '../data/rules';
import type { Entity } from '../sim/entity';
import type { World } from '../sim/world';
import { lerpAngle, damp } from '../util/math';
import { instantiate, itemGeometry, templateFor, type Rig } from './models';
import { MATS } from './materials';
import type { Effects } from './effects';

export interface View {
  id: number;
  e: Entity;
  rig: Rig;
  defId: string;
  team: number;
  walk: number;
  walkAmp: number;
  ghost: boolean;
  seen: boolean; // ever seen by the local player
  ring: THREE.Mesh | null;
  ringColor: number;
  lastX: number;
  lastY: number;
  deathStart: number;
  invis: boolean;
  bigForm: number;
  status: number;
  wheelRot: number;
}

const RING = new THREE.RingGeometry(0.9, 1.05, 36);
RING.rotateX(-Math.PI / 2);
const SQUARE = (() => {
  const g = new THREE.EdgesGeometry(new THREE.PlaneGeometry(2, 2));
  g.rotateX(-Math.PI / 2);
  return g;
})();

const ringMats = new Map<number, THREE.MeshBasicMaterial>();
function ringMat(color: number): THREE.MeshBasicMaterial {
  let m = ringMats.get(color);
  if (!m) {
    m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false });
    ringMats.set(color, m);
  }
  return m;
}

const item = itemGeometry();

export class EntityViews {
  readonly group = new THREE.Group();
  readonly views = new Map<number, View>();
  private world: World;
  local: number;
  selected = new Set<number>();
  hover = -1;
  revealAll = false;
  fx: Effects;
  private shadowsOn = true;
  private rallyFlag: THREE.Group;
  private rallyLine: THREE.Line;

  constructor(world: World, local: number, fx: Effects) {
    this.world = world;
    this.local = local;
    this.fx = fx;
    // rally flag
    this.rallyFlag = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.4, 5), new THREE.MeshBasicMaterial({ color: 0x3a2a1a }));
    pole.position.y = 0.7;
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.32), new THREE.MeshBasicMaterial({ color: 0x40ff60, side: THREE.DoubleSide }));
    flag.position.set(0.25, 1.22, 0);
    this.rallyFlag.add(pole, flag);
    this.rallyFlag.visible = false;
    this.rallyLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineDashedMaterial({ color: 0x80ff80, dashSize: 0.4, gapSize: 0.3, transparent: true, opacity: 0.7 }));
    this.rallyLine.visible = false;
    this.group.add(this.rallyFlag, this.rallyLine);
  }

  setShadows(on: boolean): void {
    this.shadowsOn = on;
  }

  teamColor(owner: number): number {
    const p = this.world.players[owner];
    if (!p) return 0x888888;
    if (p.id === this.world.hostileId) return 0x7a3a2a;
    if (p.passive) return 0xb0a080;
    return p.color;
  }

  private create(e: Entity): View {
    let rig: Rig;
    const team = this.teamColor(e.owner);
    if (e.kind === 'item') {
      const root = new THREE.Group();
      const body = new THREE.Group();
      body.add(new THREE.Mesh(item.solid, MATS.solid), new THREE.Mesh(item.glow, MATS.glow));
      root.add(body);
      rig = { root, body, parts: { root, body }, t: { parts: [], height: 0.7, kind: 'item', scale: 1, radius: 0.3 }, meshes: [] };
    } else {
      rig = instantiate(templateFor(e.def, team));
      for (const m of rig.meshes) m.castShadow = this.shadowsOn && m.material === MATS.solid;
    }
    rig.root.userData.id = e.id;
    this.group.add(rig.root);
    const v: View = {
      id: e.id,
      e,
      rig,
      defId: e.def.id,
      team,
      walk: Math.random() * 6,
      walkAmp: 0,
      ghost: false,
      seen: false,
      ring: null,
      ringColor: -1,
      lastX: e.x,
      lastY: e.y,
      deathStart: -1,
      invis: false,
      bigForm: 1,
      status: 0,
      wheelRot: 0,
    };
    this.views.set(e.id, v);
    return v;
  }

  private destroy(v: View): void {
    this.group.remove(v.rig.root);
    if (v.ring) this.group.remove(v.ring);
    this.views.delete(v.id);
  }

  /** Is the entity currently visible to the local player? */
  visibleNow(e: Entity): boolean {
    if (this.revealAll) return e.inside < 0;
    if (e.inside >= 0) return false;
    const w = this.world;
    if (e.owner === this.local || w.isAlly(this.local, e.owner)) return true;
    if (e.kind === 'item' || e.corpse || e.dead) return w.tileVisible(this.local, e.x, e.y);
    return (e.seenBy & (1 << this.local)) !== 0;
  }

  sync(alpha: number, dt: number, renderTime: number): void {
    const w = this.world;
    const live = new Set<number>();
    for (const e of w.entities) {
      if (e.removed && !this.views.has(e.id)) continue;
      let v = this.views.get(e.id);
      if (e.removed) {
        if (v && !this.keepGhost(v, e)) this.destroy(v);
        if (v && this.views.has(e.id)) live.add(e.id);
        continue;
      }
      if (e.dead && e.hero && e.deathTime > 4) {
        if (v) this.destroy(v);
        continue;
      }
      if (!v) v = this.create(e);
      // model changed (transform / upgrade)
      if (v.defId !== e.def.id && e.kind !== 'item') {
        this.destroy(v);
        v = this.create(e);
      }
      live.add(e.id);
      this.updateView(v, e, alpha, dt, renderTime);
    }
    for (const [id, v] of this.views) if (!live.has(id) && !v.ghost) this.destroy(v);
    // ghosts of buildings destroyed out of sight
    for (const [, v] of this.views) {
      if (!v.ghost) continue;
      if (w.tileVisible(this.local, v.lastX, v.lastY)) this.destroy(v);
    }
    this.updateRally();
  }

  private keepGhost(v: View, e: Entity): boolean {
    if (e.kind !== 'building' || e.owner === this.local || this.revealAll) return false;
    if (!v.seen) return false;
    if (this.world.tileVisible(this.local, v.lastX, v.lastY)) return false;
    v.ghost = true;
    return true;
  }

  private updateView(v: View, e: Entity, alpha: number, dt: number, now: number): void {
    const w = this.world;
    const root = v.rig.root;
    const vis = this.visibleNow(e);
    if (vis) v.seen = true;
    // buildings remembered in fog
    let show = vis;
    if (!vis && e.kind === 'building' && v.seen && e.owner !== this.local) show = !e.dead || !w.tileVisible(this.local, e.x, e.y);
    root.visible = show;
    if (v.ring) v.ring.visible = false;
    if (!show) return;

    const x = e.px + (e.x - e.px) * alpha;
    const y = e.py + (e.y - e.py) * alpha;
    const gh = w.map.heightAt(x, y);
    v.lastX = x;
    v.lastY = y;
    const kind = v.rig.t.kind;

    if (e.kind === 'building') {
      root.position.set(x, gh, y);
      this.animBuilding(v, e, now, dt);
    } else if (e.kind === 'item') {
      root.position.set(x, gh, y);
      v.rig.body.rotation.y += dt * 1.5;
      v.rig.body.position.y = 0.1 + Math.sin(now * 3) * 0.06;
    } else {
      const fac = lerpAngle(e.pfacing, e.facing, alpha);
      root.position.set(x, gh + e.z, y);
      root.rotation.y = -fac;
      this.animUnit(v, e, kind, now, dt);
    }
    // invisibility (own invisible units appear translucent)
    const invis = e.st.invisible && !e.dead;
    if (invis !== v.invis) {
      v.invis = invis;
      for (const m of v.rig.meshes) if (m.material === MATS.solid || m.material === MATS.ghost) m.material = invis ? MATS.ghost : MATS.solid;
    }
    // giant forms
    const big = e.buffs.some((b) => b.def.fx === 'bigform') ? 1.35 : e.st.polymorph ? 0.5 : 1;
    v.bigForm += (big - v.bigForm) * damp(6, dt);
    if (e.kind === 'unit') root.scale.setScalar(v.rig.t.scale * v.bigForm);

    // selection / hover rings
    const sel = this.selected.has(e.id);
    const hov = this.hover === e.id;
    if ((sel || hov) && !e.dead && e.kind !== 'item') {
      const color = e.owner === this.local ? 0x50ff60 : w.isAlly(this.local, e.owner) ? 0x60c0ff : w.isEnemy(this.local, e.owner) ? 0xff4030 : 0xffe040;
      if (!v.ring || v.ringColor !== color) {
        if (v.ring) this.group.remove(v.ring);
        v.ring = e.b ? new THREE.LineSegments(SQUARE, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 })) as unknown as THREE.Mesh : new THREE.Mesh(RING, ringMat(color));
        v.ring.renderOrder = 3;
        v.ringColor = color;
        this.group.add(v.ring);
      }
      const r = e.b ? e.b.size * 0.52 : e.radius * 1.35 * v.bigForm;
      v.ring.visible = true;
      v.ring.position.set(x, gh + (e.isAir ? 0.06 : 0.07), y);
      v.ring.scale.set(r, 1, r);
      const mat = v.ring.material as THREE.MeshBasicMaterial;
      mat.opacity = sel ? 0.95 : 0.45 + 0.2 * Math.sin(now * 8);
    }
  }

  private animBuilding(v: View, e: Entity, now: number, dt: number): void {
    const root = v.rig.root;
    const bs = e.b!;
    if (e.dead) {
      if (v.deathStart < 0) {
        v.deathStart = now;
        this.fx.play('collapse', e.x, e.y, { r: bs.size * 0.6 });
      }
      const k = Math.min(1, (now - v.deathStart) / 3.5);
      root.position.y -= k * bs.size * 0.7;
      root.rotation.z = k * 0.12;
      return;
    }
    if (bs.constructing) {
      const p = Math.max(0.12, bs.progress);
      if (e.def.faction === 'twilight') root.scale.setScalar(0.25 + 0.75 * p);
      else root.scale.set(1, p, 1);
      if (Math.random() < dt * 4) this.fx.play(e.def.faction === 'sepulchral' ? 'summonBuilding' : 'death', e.x + (Math.random() - 0.5) * bs.size, e.y + (Math.random() - 0.5) * bs.size, { r: 1 });
    } else root.scale.set(1, 1, 1);
    const turret = v.rig.parts.turret;
    if (turret) turret.rotation.y = -e.facing;
    // production sparkle
    if (bs.queue.length && bs.queue[0].kind === 'upgrade' && Math.random() < dt * 3) this.fx.play('buildDone', e.x, e.y, { r: bs.size * 0.5 });
    void now;
  }

  private animUnit(v: View, e: Entity, kind: string, now: number, dt: number): void {
    const P = v.rig.parts;
    const body = v.rig.body;
    // death
    if (e.dead) {
      if (v.deathStart < 0) {
        v.deathStart = now;
        if (e.isAir) this.fx.play('death', e.x, e.y);
      }
      const k = Math.min(1, (now - v.deathStart) / 0.55);
      if (e.isAir) {
        v.rig.root.position.y = this.world.map.heightAt(e.x, e.y) + e.z * (1 - k);
        body.rotation.x = k * 1.2;
      } else {
        body.rotation.z = k * 1.45;
        body.position.y = -k * 0.1;
      }
      // corpses sink at the end
      if (e.corpse && e.corpseTimer < 4) v.rig.root.position.y -= (1 - e.corpseTimer / 4) * 0.8;
      if (!e.corpse && e.deathTime > 1.5) v.rig.root.position.y -= (e.deathTime - 1.5) * 0.8;
      return;
    }
    v.deathStart = -1;
    body.rotation.z = 0;
    const moving = e.moving || e.speedNow > 0;
    const target = moving ? 1 : 0;
    v.walkAmp += (target - v.walkAmp) * damp(10, dt);
    const speed = Math.max(1.6, e.st.speed);
    v.walk += dt * speed * (kind === 'rider' || kind === 'beast' ? 3.2 : 4.6) * (moving ? 1 : 0.2);
    const sw = Math.sin(v.walk) * v.walkAmp;
    const atkDur = Math.max(0.35, (e.def.weapon?.damagePoint ?? 0.35) * 2.0);
    const at = (now - e.animAttack) / atkDur;
    const attacking = at >= 0 && at < 1;
    const ct = (now - e.animCast) / 0.6;
    const casting = (ct >= 0 && ct < 1) || !!e.cast;
    const ranged = !!e.def.weapon?.projectile;

    switch (kind) {
      case 'humanoid':
      case 'rider':
      case 'golem':
      case 'machine':
      case 'treant': {
        if (P.legL) P.legL.rotation.z = sw * 0.75;
        if (P.legR) P.legR.rotation.z = -sw * 0.75;
        for (let i = 0; i < 4; i++) {
          const l = P['leg' + i];
          if (l) l.rotation.z = Math.sin(v.walk + (i === 0 || i === 3 ? 0 : Math.PI)) * 0.65 * v.walkAmp;
        }
        let armR = -sw * 0.5;
        let armL = sw * 0.5;
        if (attacking) {
          if (ranged) armR = 1.45 - Math.sin(at * Math.PI) * 0.2;
          else armR = at < 0.4 ? (at / 0.4) * 2.5 : 2.5 - ((at - 0.4) / 0.6) * 2.9;
          if (ranged && (e.def.model.weapon === 'bow' || e.def.model.weapon === 'rifle' || e.def.model.weapon === 'crossbow')) armL = 1.4;
        } else if (casting) {
          armR = 2.3 + Math.sin(now * 10) * 0.1;
          armL = 2.3 + Math.cos(now * 10) * 0.1;
        } else if (e.working) {
          armR = 1.2 + Math.sin(now * 9) * 0.9;
        } else if (!moving) {
          armR = 0.15 + Math.sin(now * 1.7 + v.id) * 0.04;
          armL = 0.1;
        }
        if (P.armR) P.armR.rotation.z = armR;
        if (P.armL) P.armL.rotation.z = armL;
        if (P.torso) P.torso.rotation.y = attacking && !ranged ? Math.sin(at * Math.PI) * 0.25 : 0;
        if (P.cape) P.cape.rotation.z = -0.1 - v.walkAmp * 0.35 - Math.sin(now * 3 + v.id) * 0.05;
        if (P.head && kind === 'rider') P.head.rotation.z = Math.sin(v.walk) * 0.08 * v.walkAmp;
        body.position.y = Math.abs(Math.cos(v.walk)) * 0.06 * v.walkAmp + (moving ? 0 : Math.sin(now * 2 + v.id) * 0.008);
        if (e.isWorker && e.carry > 0 && moving) body.rotation.x = 0;
        break;
      }
      case 'beast': {
        for (let i = 0; i < 8; i++) {
          const l = P['leg' + i];
          if (l) l.rotation.z = Math.sin(v.walk + (i % 2 === 0 ? 0 : Math.PI) + (i >= 2 ? Math.PI / 2 : 0)) * 0.6 * v.walkAmp;
        }
        if (P.head) {
          P.head.position.x = (P.head.userData.bx ??= P.head.position.x) + (attacking ? Math.sin(at * Math.PI) * 0.22 : 0);
          P.head.rotation.z = attacking ? -Math.sin(at * Math.PI) * 0.35 : Math.sin(now * 2 + v.id) * 0.05;
        }
        body.position.y = Math.abs(Math.sin(v.walk)) * 0.05 * v.walkAmp;
        break;
      }
      case 'flyer': {
        const rate = moving ? 9 : 5;
        const flap = Math.sin(now * rate + v.id) * (moving ? 0.55 : 0.35);
        if (P.wingL) P.wingL.rotation.x = -flap;
        if (P.wingR) P.wingR.rotation.x = flap;
        if (P.prop) P.prop.rotation.x += dt * 25;
        body.position.y = Math.sin(now * 2.2 + v.id) * 0.12;
        body.rotation.z = attacking ? -Math.sin(at * Math.PI) * 0.35 : moving ? -0.08 : 0;
        if (P.head && attacking) P.head.rotation.z = -Math.sin(at * Math.PI) * 0.4;
        break;
      }
      case 'spirit': {
        body.position.y = Math.sin(now * 2.4 + v.id) * 0.1;
        for (let i = 0; i < 3; i++) {
          const o = P['orb' + i];
          if (o) o.rotation.y = now * 2.5 + i;
        }
        if (P.armR) P.armR.rotation.z = attacking || casting ? 1.5 : 0.2 + Math.sin(now * 2) * 0.1;
        if (P.armL) P.armL.rotation.z = casting ? 1.5 : 0.2 + Math.cos(now * 2) * 0.1;
        if (P.wingL) P.wingL.rotation.y = Math.sin(now * 6) * 0.3;
        if (P.wingR) P.wingR.rotation.y = -Math.sin(now * 6) * 0.3;
        break;
      }
      case 'wagon': {
        const d = Math.hypot(e.x - v.lastX, e.y - v.lastY);
        v.wheelRot -= (e.moving ? e.st.speed * dt : 0) * 3;
        for (const name in P) if (name.startsWith('wheel')) P[name].rotation.z = v.wheelRot;
        if (P.arm) P.arm.rotation.z = attacking ? Math.sin(at * Math.PI) * -1.2 : 0;
        void d;
        break;
      }
      case 'ward': {
        if (P.turret) P.turret.rotation.y = 0;
        body.position.y = 0;
        break;
      }
      default:
        break;
    }
    // ambient status particles
    v.status += dt;
    if (v.status > 0.2) {
      v.status = 0;
      for (const b of e.buffs) {
        const fx = b.def.fx;
        if (!fx || b.aura) continue;
        const hy = this.world.map.heightAt(e.x, e.y) + e.z + v.rig.t.height * v.rig.t.scale;
        if (fx === 'stun' || fx === 'shackle') this.fx.glow.emit(e.x, hy + 0.15, e.y, { count: 2, color: fx === 'shackle' ? 0xb08aff : 0xffe040, life: 0.4, size: 0.18, shape: 'ring', radius: 0.25, speed: 0.6 });
        else if (fx === 'burn') this.fx.glow.emit(e.x, hy * 0.6, e.y, { count: 2, color: 0xff7a2a, color2: 0xff3010, life: 0.5, size: 0.3, up: 1.5, speed: 0.3 });
        else if (fx === 'poison' || fx === 'plague') this.fx.glow.emit(e.x, hy * 0.7, e.y, { count: 1, color: 0x8aff5a, life: 0.6, size: 0.2, up: 0.8, speed: 0.3 });
        else if (fx === 'frost' || fx === 'slow') this.fx.glow.emit(e.x, hy * 0.6, e.y, { count: 1, color: 0x9fd8ff, life: 0.6, size: 0.2, up: 0.4, speed: 0.4 });
        else if (fx === 'regen' || fx === 'devour') this.fx.glow.emit(e.x, hy * 0.5, e.y, { count: 1, color: 0x7aff9a, life: 0.7, size: 0.18, up: 1.2, speed: 0.3 });
        else if (fx === 'sleep') this.fx.glow.emit(e.x + 0.2, hy + 0.2, e.y, { count: 1, color: 0xd0d8ff, life: 1.0, size: 0.22, up: 0.8, speed: 0.1 });
        else if (fx === 'roots') this.fx.glow.emit(e.x, this.world.map.heightAt(e.x, e.y) + 0.1, e.y, { count: 2, color: 0x6aaa3a, life: 0.5, size: 0.22, shape: 'ring', radius: 0.4, up: 0.6 });
        else if (fx === 'holyshield' || fx === 'bonearmor' || fx === 'laststand') this.fx.glow.emit(e.x, hy * 0.5, e.y, { count: 1, color: fx === 'bonearmor' ? 0xe8e0d0 : 0xfff0a0, life: 0.5, size: 0.3, shape: 'ring', radius: 0.45, speed: 0.1 });
        else if (fx === 'frenzy' || fx === 'warpaint') this.fx.glow.emit(e.x, hy * 0.6, e.y, { count: 1, color: 0xff4020, life: 0.4, size: 0.2, up: 0.8, speed: 0.4 });
        else if (fx === 'silence' || fx === 'cowed' || fx === 'fear') this.fx.glow.emit(e.x, hy + 0.1, e.y, { count: 1, color: 0xb08aff, life: 0.5, size: 0.2, speed: 0.3 });
        else if (fx === 'marked' || fx === 'revealed') this.fx.glow.emit(e.x, hy + 0.15, e.y, { count: 1, color: 0xff5050, life: 0.4, size: 0.25, speed: 0.05 });
      }
      if (e.def.tags?.undead && this.world.map.hasBlight(Math.floor(e.x), Math.floor(e.y)) && e.hp < e.st.maxHp && Math.random() < 0.3) {
        this.fx.glow.emit(e.x, this.world.map.heightAt(e.x, e.y) + 0.3, e.y, { count: 1, color: 0x6dffb0, life: 0.6, size: 0.15, up: 0.8 });
      }
    }
  }

  private updateRally(): void {
    const w = this.world;
    let shown = false;
    for (const id of this.selected) {
      const e = w.get(id);
      if (!e || !e.b || e.owner !== this.local || !e.b.hasRally || !e.alive) continue;
      const bs = e.b;
      const h = w.map.heightAt(bs.rallyX, bs.rallyY);
      this.rallyFlag.position.set(bs.rallyX, h, bs.rallyY);
      const geo = this.rallyLine.geometry as THREE.BufferGeometry;
      const pts = [new THREE.Vector3(e.x, w.map.heightAt(e.x, e.y) + 0.3, e.y), new THREE.Vector3(bs.rallyX, h + 0.3, bs.rallyY)];
      geo.setFromPoints(pts);
      this.rallyLine.computeLineDistances();
      shown = true;
      break;
    }
    this.rallyFlag.visible = shown;
    this.rallyLine.visible = shown;
  }

  /** world-space height of the top of an entity (for health bars) */
  topOf(e: Entity): number {
    const v = this.views.get(e.id);
    const h = v ? v.rig.t.height * (e.kind === 'unit' ? v.rig.t.scale * v.bigForm : 1) : 1.5;
    const base = v ? v.rig.root.position.y : this.world.map.heightAt(e.x, e.y);
    if (e.b && e.b.constructing) return base + Math.max(1.2, h * Math.max(0.2, e.b.progress)) + 0.3;
    return base + h + 0.25;
  }

  clear(): void {
    for (const v of [...this.views.values()]) this.destroy(v);
  }
}

export { DT };

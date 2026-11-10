import type { FactionId } from '../data/types';
import { regDefs } from '../data/registry';
import { building } from '../data/helpers';
import type { Entity } from '../sim/entity';
import { generateMap, MAP_PRESETS } from '../sim/mapgen';
import type { MapData } from '../sim/map';
import { World, type GameSetup, type WorldScript } from '../sim/world';
import { dist } from '../util/math';
import { addXP } from '../sim/heroes';
import { setOrder } from '../sim/orders';
import { kill } from '../sim/combat';

export interface Mission {
  id: string;
  title: string;
  faction: FactionId;
  summary: string;
  briefing: string;
  build(): { setup: GameSetup; local: number };
}

// special campaign structures
regDefs([
  building({
    id: 'soul_cage',
    name: 'Soul Cage',
    faction: 'sepulchral',
    description: 'A cage of black iron and bone that binds a living spirit.',
    hp: 900,
    armor: 4,
    size: 2,
    cost: { gold: 0, lumber: 0 },
    buildTime: 1,
    buildable: false,
    noRepair: true,
    model: { kind: 'building', faction: 'sepulchral', variant: 'towerArcane' },
  }),
  building({
    id: 'shard_heart',
    name: 'Shard Heart',
    faction: 'sepulchral',
    description: 'The pulsing core of the fallen star, bound by the Conclave. Its death would end the war.',
    hp: 6000,
    armor: 8,
    size: 4,
    cost: { gold: 0, lumber: 0 },
    buildTime: 1,
    buildable: false,
    noRepair: true,
    blightRadius: 8,
    sight: [12, 12],
    model: { kind: 'building', faction: 'sepulchral', variant: 'aerie' },
  }),
]);

// ---------------------------------------------------------------------------
// scripting helpers
// ---------------------------------------------------------------------------
class Script implements WorldScript {
  customVictory = true;
  w!: World;
  private waits: { at: number; fn: () => void }[] = [];
  private objectives = new Map<string, { text: string; done: boolean; failed: boolean }>();
  over = false;
  local = 0;

  init(w: World): void {
    this.w = w;
    this.start();
  }
  start(): void {}
  update(): void {}
  death(_e: Entity, _k: Entity | undefined): void {}

  tick(w: World): void {
    if (this.over) return;
    const due = this.waits.filter((x) => x.at <= w.time);
    if (due.length) {
      this.waits = this.waits.filter((x) => x.at > w.time);
      for (const d of due) d.fn();
    }
    if (w.tick % 10 === 0 && !this.ending) this.update();
  }
  onDeath(_w: World, e: Entity, k: Entity | undefined): void {
    if (!this.over) this.death(e, k);
  }

  after(sec: number, fn: () => void): void {
    this.waits.push({ at: this.w.time + sec, fn });
  }
  say(speaker: string, text: string, duration = 7): void {
    this.w.emit({ t: 'dialogue', speaker, text, duration });
  }
  objective(id: string, text: string): void {
    this.objectives.set(id, { text, done: false, failed: false });
    this.w.emit({ t: 'objective', id, text });
  }
  complete(id: string): void {
    const o = this.objectives.get(id);
    if (!o || o.done) return;
    o.done = true;
    this.w.emit({ t: 'objective', id, text: o.text, done: true });
  }
  fail(id: string): void {
    const o = this.objectives.get(id);
    if (!o) return;
    o.failed = true;
    this.w.emit({ t: 'objective', id, text: o.text, failed: true });
  }
  isDone(id: string): boolean {
    return !!this.objectives.get(id)?.done;
  }
  ending = false;
  win(): void {
    if (this.over) return;
    this.over = true;
    this.w.endGame([this.local]);
  }
  /** play out a closing line, then win after `delay` seconds */
  finish(delay: number): void {
    if (this.ending) return;
    this.ending = true;
    this.after(delay, () => this.win());
  }
  lose(): void {
    if (this.over) return;
    this.over = true;
    const others = this.w.players.filter((p) => !p.isNeutral && p.id !== this.local).map((p) => p.id);
    this.w.players[this.local].defeated = true;
    this.w.endGame(others);
  }
  units(owner: number, pred?: (e: Entity) => boolean): Entity[] {
    return this.w.entities.filter((e) => e.owner === owner && e.alive && !e.removed && e.kind === 'unit' && (!pred || pred(e)));
  }
  buildings(owner: number, pred?: (e: Entity) => boolean): Entity[] {
    return this.w.entities.filter((e) => e.owner === owner && e.alive && !e.removed && e.kind === 'building' && (!pred || pred(e)));
  }
  spawn(defId: string, owner: number, x: number, y: number, n = 1): Entity[] {
    const out: Entity[] = [];
    for (let i = 0; i < n; i++) {
      const a = (i / Math.max(1, n)) * Math.PI * 2;
      const r = n > 1 ? 1.2 + (i % 3) * 0.5 : 0;
      const p = this.w.map.nearestPassable(x + Math.cos(a) * r, y + Math.sin(a) * r, false, 8) ?? [x, y];
      out.push(this.w.spawnUnit(defId, owner, p[0], p[1]));
    }
    return out;
  }
  attackMove(units: Entity[], x: number, y: number): void {
    for (const u of units) setOrder(this.w, u, { type: 'attackMove', x, y });
  }
  place(defId: string, owner: number, cx: number, cy: number, size: number): Entity | null {
    const w = this.w;
    for (let r = 0; r < 14; r++)
      for (let a = 0; a < Math.max(1, r * 8); a++) {
        const ang = (a / Math.max(1, r * 8)) * Math.PI * 2;
        const tx = Math.round(cx + Math.cos(ang) * r - size / 2);
        const ty = Math.round(cy + Math.sin(ang) * r - size / 2);
        let ok = true;
        for (let y = ty - 1; y < ty + size + 1 && ok; y++)
          for (let x = tx - 1; x < tx + size + 1; x++) {
            if (!w.map.inBounds(x, y)) {
              ok = false;
              break;
            }
            const i = w.map.idx(x, y);
            if ((w.map.blocked[i] & 3) !== 0 || w.map.noBuild[i]) {
              ok = false;
              break;
            }
          }
        if (!ok) continue;
        for (let y = ty; y < ty + size; y++)
          for (let x = tx; x < tx + size; x++) {
            const t = w.map.treeAt[w.map.idx(x, y)];
            if (t >= 0) w.map.removeTree(t);
          }
        return w.spawnBuilding(defId, owner, tx, ty, true);
      }
    return null;
  }
  heroLevel(h: Entity, level: number): void {
    const xp = [0, 0, 180, 460, 850, 1350, 1950, 2650, 3450, 4350, 5350][level];
    addXP(this.w, h, xp + 1);
  }
}

function presetData(id: string, tweak?: (p: (typeof MAP_PRESETS)[number]) => void): MapData {
  const p = { ...MAP_PRESETS.find((m) => m.id === id)! };
  tweak?.(p);
  return generateMap(p);
}

// ---------------------------------------------------------------------------
// 1. Embers on the Border
// ---------------------------------------------------------------------------
class EmbersScript extends Script {
  private trainedGoal = false;
  start(): void {
    const w = this.w;
    const p = w.players[0];
    const h = this.spawn('cr_h_marshal', 0, p.startX + 3, p.startY - 5)[0];
    this.heroLevel(h, 2);
    this.after(1, () => this.say('Marshal Elinor Vance', 'Ash on the wind again. The raiders of the Ashfang clan have crossed the river and torched three of our farmsteads.'));
    this.after(8, () => this.say('Marshal Elinor Vance', 'We rebuild, then we answer. Put the peasants to work — gold from the mine, lumber from the woods.'));
    this.after(15, () => {
      this.objective('army', 'Build a Barracks and train six soldiers');
      this.say('Steward Aldric', 'A Farm feeds seven mouths, my lady. Without food, the Barracks cannot muster anyone.');
    });
    this.after(16, () => this.objective('raze', 'Destroy the Ashfang war camp to the north-east'));
    this.after(26, () => this.say('Steward Aldric', 'Tip: right-click the gold mine with peasants selected to mine it. Press B with a peasant to see what it can build.', 9));
  }
  update(): void {
    const w = this.w;
    if (!this.trainedGoal) {
      const soldiers = this.units(0, (e) => !e.isWorker && !e.hero && !e.isSummoned).length;
      if (soldiers >= 6) {
        this.trainedGoal = true;
        this.complete('army');
        this.say('Marshal Elinor Vance', 'Good. Now we march. Their war camp lies across the vale to the north-east.');
      }
    }
    if (!this.buildings(1).length) {
      this.complete('raze');
      this.say('Marshal Elinor Vance', 'The Ashfang flee. But look at this — a splinter of black glass, humming in their chieftain\'s tent. Where did it come from?');
      this.finish(7);
      return;
    }
    if (!this.buildings(0).length && !this.units(0).length) this.lose();
  }
}

// ---------------------------------------------------------------------------
// 2. The Shard Road (hero adventure)
// ---------------------------------------------------------------------------
class ShardRoadScript extends Script {
  private heroes: Entity[] = [];
  private guardian: Entity | null = null;
  private goal = { x: 0, y: 0 };
  private reached = false;
  start(): void {
    const w = this.w;
    const s0 = w.map.data.starts[0];
    const s1 = w.map.data.starts[1];
    this.goal = { x: s1.x, y: s1.y };
    const a = this.spawn('cr_h_marshal', 0, s0.x, s0.y)[0];
    const b = this.spawn('cr_h_lightwarden', 0, s0.x + 1.5, s0.y + 1)[0];
    this.heroLevel(a, 3);
    this.heroLevel(b, 3);
    this.heroes = [a, b];
    this.spawn('cr_shieldbearer', 0, s0.x + 2, s0.y - 2, 3);
    this.spawn('cr_rifleman', 0, s0.x - 2, s0.y - 1, 2);
    this.spawn('cr_cleric', 0, s0.x - 1, s0.y + 2, 1);
    w.players[0].gold = 600;
    w.players[0].lumber = 0;
    // the guardian of the crater
    const g = this.spawn('stone_golem', w.hostileId, s1.x, s1.y)[0];
    g.def = { ...g.def, name: 'Shard Colossus', hp: 3200, level: 9 } as typeof g.def;
    g.statsDirty = true;
    g.hp = 3200;
    g.homeX = g.x;
    g.homeY = g.y;
    this.guardian = g;
    this.spawn('stone_golem', w.hostileId, s1.x + 3, s1.y + 2).forEach((e) => {
      e.homeX = e.x;
      e.homeY = e.y;
    });
    this.after(1, () => this.say('Marshal Elinor Vance', 'The scholars traced the black glass to a crater beyond the old shard road. We go quietly, and we go now.'));
    this.after(8, () => this.say('Lightwarden Osric', 'The road is overrun with beasts drawn to the star\'s whisper. Clear what you must; the inn and the peddler may help us along the way.'));
    this.after(10, () => {
      this.objective('reach', 'Travel to the star crater on the far side of the map');
      this.objective('live', 'Both heroes must survive');
    });
    this.after(20, () => this.say('Lightwarden Osric', 'Tip: heroes grow stronger with each victory. Spend skill points with L, pick up items by right-clicking them, and use items with Z, X, C...', 9));
  }
  update(): void {
    if (this.heroes.some((h) => !h.alive)) {
      this.fail('live');
      this.say('Lightwarden Osric', 'We cannot go on without our captain...');
      this.lose();
      return;
    }
    if (!this.reached && this.heroes.some((h) => dist(h.x, h.y, this.goal.x, this.goal.y) < 14)) {
      this.reached = true;
      this.complete('reach');
      this.say('Marshal Elinor Vance', 'There — something stirs in the crater. It is made of the same black glass!');
      this.objective('guardian', 'Destroy the Shard Colossus');
    }
    if (this.guardian && !this.guardian.alive) {
      this.complete('guardian');
      this.say('Lightwarden Osric', 'The shard is ours. But it was already cracked... someone took a piece before us. The Conclave of the dead has been here.');
      this.guardian = null;
      this.finish(7);
    }
  }
}

// ---------------------------------------------------------------------------
// 3. Hunger of the Clans (survival)
// ---------------------------------------------------------------------------
class HungerScript extends Script {
  private readonly length = 660;
  private wave = 0;
  private nextWave = 75;
  private startT = 0;
  start(): void {
    const w = this.w;
    this.startT = w.time;
    const p = w.players[0];
    const h = this.spawn('ir_h_warlord', 0, p.startX + 3, p.startY - 5)[0];
    this.heroLevel(h, 2);
    // the enemy keeps a fortress in the north
    this.after(1, () => this.say('Warchief Korga Ironmaw', 'The dead walk out of the northern barrows and our hunters find only bones. The Conclave wants this valley.'));
    this.after(8, () => this.say('Warchief Korga Ironmaw', 'Then they will choke on it. Raise palisades, sharpen spears. We hold until the war host arrives from the south!'));
    this.after(12, () => {
      this.objective('hold', 'Survive the undead assault for 11 minutes');
      this.objective('lode', 'Optional: destroy the Conclave fortress in the north');
    });
    this.after(20, () => this.say('Shaman Ruuk', 'Tip: Clanhands can shelter in a Longhouse and throw spears at attackers. Spiked Palisades make walls bite back.', 9));
  }
  update(): void {
    const w = this.w;
    const t = w.time - this.startT;
    const left = Math.max(0, this.length - t);
    if (Math.floor(left) % 60 === 0 && Math.floor(left) > 0 && w.tick % 20 === 0) this.say('Shaman Ruuk', `${Math.floor(left / 60)} minute${left >= 120 ? 's' : ''} until the war host arrives.`, 4);
    if (t >= this.nextWave && left > 20) {
      this.wave++;
      this.nextWave = t + Math.max(45, 80 - this.wave * 4);
      this.launchWave();
    }
    if (left <= 0) {
      this.complete('hold');
      this.say('Warchief Korga Ironmaw', 'Horns in the south! The war host is here. The dead break and flee — this valley is ours!');
      for (const u of this.units(1)) kill(this.w, u, null);
      this.finish(6);
      return;
    }
    if (!this.isDone('lode') && !this.buildings(1).length) {
      this.complete('lode');
      this.say('Warchief Korga Ironmaw', 'Their fortress burns! No more dead will rise from it.');
      this.nextWave = 1e9;
    }
    if (!this.buildings(0).length) this.lose();
  }
  private launchWave(): void {
    const w = this.w;
    const s1 = w.map.data.starts[1];
    const p0 = w.players[0];
    const n = this.wave;
    const comp: [string, number][] = [
      ['sep_skeleton', 2 + n],
      ['sep_gravedigger', 1 + Math.floor(n / 2)],
      ['sep_archer', Math.floor(n / 2)],
    ];
    if (n >= 4) comp.push(['sep_rider', Math.floor((n - 2) / 2)]);
    if (n >= 5) comp.push(['sep_necro', 1]);
    if (n >= 6) comp.push(['sep_colossus', Math.floor((n - 4) / 2)]);
    if (n >= 7) comp.push(['sep_rotwing', 2]);
    const all: Entity[] = [];
    for (const [id, c] of comp) all.push(...this.spawn(id, 1, s1.x, s1.y + 8, c));
    for (const u of all) if (u.def.id === 'sep_skeleton') u.lifetime = 0;
    this.attackMove(all, p0.startX, p0.startY);
    this.say('Shaman Ruuk', n === 1 ? 'The first of the dead approach from the north!' : `Another wave of the dead — wave ${n}!`, 4);
    w.emit({ t: 'alert', owner: 0, x: p0.startX + (s1.x - p0.startX) * 0.4, y: p0.startY + (s1.y - p0.startY) * 0.4, kind: 'attack' });
  }
}

// ---------------------------------------------------------------------------
// 4. Roots of Night (night raid)
// ---------------------------------------------------------------------------
class RootsScript extends Script {
  private cages: Entity[] = [];
  private captives: Entity[] = [];
  private heroes: Entity[] = [];
  private grove = { x: 0, y: 0 };
  private freed = 0;
  start(): void {
    const w = this.w;
    w.forcedNight = 1e9;
    w.night = true;
    const s0 = w.map.data.starts[0];
    const s1 = w.map.data.starts[1];
    this.grove = { x: s1.x, y: s1.y };
    const r = this.spawn('tw_h_ranger', 0, s0.x, s0.y)[0];
    const k = this.spawn('tw_h_keeper', 0, s0.x + 1.5, s0.y)[0];
    this.heroLevel(r, 4);
    this.heroLevel(k, 3);
    this.heroes = [r, k];
    this.spawn('tw_archer', 0, s0.x, s0.y + 2, 4);
    this.spawn('tw_sentinel', 0, s0.x + 2, s0.y - 1, 2);
    w.players[0].gold = 300;
    // cages with captive treants scattered across the map
    const spots = [
      [0.3, 0.3],
      [0.7, 0.5],
      [0.45, 0.72],
    ];
    for (const [fx, fy] of spots) {
      const p = w.map.nearestPassable(w.map.w * fx, w.map.h * fy, true, 12) ?? [w.map.w * fx, w.map.h * fy];
      const cage = this.place('soul_cage', 1, p[0], p[1], 2);
      if (!cage) continue;
      this.cages.push(cage);
      const c = this.spawn('tw_treant', w.passiveId, p[0] + 2.5, p[1] + 0.5)[0];
      this.captives.push(c);
      // guards
      const guards = [...this.spawn('sep_gravedigger', 1, p[0] - 2, p[1] + 2, 2), ...this.spawn('sep_archer', 1, p[0] + 1, p[1] - 2.5, 2)];
      if (this.cages.length === 3) guards.push(...this.spawn('sep_hexwraith', 1, p[0], p[1] - 3, 1));
      for (const gd of guards) setOrder(w, gd, { type: 'hold' });
    }
    // patrols
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const x = w.map.w / 2 + Math.cos(a) * 18;
      const y = w.map.h / 2 + Math.sin(a) * 18;
      const pat = this.spawn('sep_rider', 1, x, y, 2);
      for (const u of pat) setOrder(w, u, { type: 'patrol', x: w.map.w / 2 - Math.cos(a) * 18, y: w.map.h / 2 - Math.sin(a) * 18, ox: x, oy: y });
    }
    this.after(1, () => this.say('Ranger Sylvaine', 'The Conclave has caged the elder treants of Moonhollow and is draining their spirits to feed the black shard.'));
    this.after(8, () => this.say('Keeper Thalor', 'The night is our ally. Archers vanish when they stand still in the dark. Strike the cages, free the ancients, and lead them home to the Great Grove.'));
    this.after(12, () => {
      this.objective('cages', 'Destroy the three Soul Cages (0/3)');
      this.objective('grove', 'Bring the heroes to the Great Grove in the far corner');
      this.objective('live', 'The Ranger must survive');
    });
  }
  update(): void {
    const w = this.w;
    if (!this.heroes[0].alive) {
      this.fail('live');
      this.lose();
      return;
    }
    let freed = 0;
    this.cages.forEach((c, i) => {
      if (!c.alive) {
        freed++;
        const t = this.captives[i];
        if (t && t.alive && t.owner !== 0) {
          t.owner = 0;
          t.statsDirty = true;
          w.emit({ t: 'fx', fx: 'root', x: t.x, y: t.y, r: 2 });
          this.say('Elder Treant', 'Free... the forest remembers its friends. I will walk with you.', 5);
        }
      }
    });
    if (freed !== this.freed) {
      this.freed = freed;
      w.emit({ t: 'objective', id: 'cages', text: `Destroy the three Soul Cages (${freed}/3)`, done: freed >= 3 });
      if (freed >= 3) this.complete('cages');
    }
    if (this.isDone('cages') && !this.isDone('grove') && this.heroes.some((h) => h.alive && dist(h.x, h.y, this.grove.x, this.grove.y) < 10)) {
      this.complete('grove');
      w.forcedNight = 0;
      this.say('Keeper Thalor', 'The ancients are home. And with their strength returned, the Wardens will answer the Crown League\'s call. The shard must be destroyed.');
      this.finish(7);
    }
  }
}

// ---------------------------------------------------------------------------
// 5. Dawn of Four Banners (final battle)
// ---------------------------------------------------------------------------
class DawnScript extends Script {
  private heart: Entity | null = null;
  start(): void {
    const w = this.w;
    const p = w.players[0];
    this.spawn('cr_h_marshal', 0, p.startX + 3, p.startY - 5).forEach((h) => this.heroLevel(h, 5));
    this.spawn('cr_h_lightwarden', 0, p.startX + 4, p.startY - 4).forEach((h) => this.heroLevel(h, 4));
    p.gold = 1200;
    p.lumber = 600;
    w.players[1].gold = 1200;
    w.players[1].lumber = 600;
    const c = w.map.w / 2;
    this.heart = this.place('shard_heart', 2, c, c - 9, 4);
    this.after(1, () => this.say('Marshal Elinor Vance', 'Every banner that still flies has gathered here. The Conclave has raised the Shard Heart in the old heartland.'));
    this.after(8, () => this.say('Ranger Sylvaine', 'The Wardens hold the eastern woods. Strike when we strike, Marshal — and do not let them corrupt the whole vale.'));
    this.after(14, () => {
      this.objective('heart', 'Destroy the Shard Heart at the center of the map');
      this.objective('ally', 'Optional: keep the Twilight Wardens alive');
    });
    this.after(30, () => this.say('Lightwarden Osric', 'Tip: the second hero needs a Stone Keep, the third a Grand Citadel. The Dawnbreak ultimate burns the dead twice as hard.', 9));
  }
  update(): void {
    const w = this.w;
    if (this.heart && !this.heart.alive) {
      this.complete('heart');
      this.heart = null;
      w.forcedDay = 120;
      this.say('Marshal Elinor Vance', 'The heart is broken! Look — the sun rises over all four banners. Whatever whispered in that glass is silent now.');
      for (const e of w.entities) if (e.owner === 2 || e.owner === 3) if (e.alive && e.kind === 'unit' && e.isSummoned) kill(w, e, null);
      this.finish(8);
    }
    if (!this.isDone('ally') && w.players[1].defeated) this.fail('ally');
    if (!this.buildings(0).length) this.lose();
  }
}

// ---------------------------------------------------------------------------
export const MISSIONS: Mission[] = [
  {
    id: 'm1',
    title: 'Embers on the Border',
    faction: 'crown',
    summary: 'Rebuild a burned frontier town and drive the Ashfang raiders from the vale.',
    briefing: 'Marshal Elinor Vance guards the eastern march of the Crown League. Raiders from the Ashfang clan have burned the border farms. Rebuild, raise an army and destroy their war camp.',
    build: () => ({
      local: 0,
      setup: {
        map: presetData('thornvale'),
        seed: 101,
        players: [
          { name: 'Crown League', faction: 'crown', color: 1, team: 0, ai: false, difficulty: 'normal', start: 0 },
          { name: 'Ashfang Raiders', faction: 'iron', color: 0, team: 1, ai: true, difficulty: 'easy', start: 1 },
        ],
        script: new EmbersScript(),
      },
    }),
  },
  {
    id: 'm2',
    title: 'The Shard Road',
    faction: 'crown',
    summary: 'Lead two heroes and a small escort along a monster-infested road to the star crater.',
    briefing: 'A splinter of black glass hums with an unnatural voice. The Marshal and the Lightwarden must follow the old shard road to the crater where it fell, gathering strength and treasure along the way.',
    build: () => ({
      local: 0,
      setup: {
        map: presetData('ashkar', (p) => {
          p.seed = 515;
          p.boss = false;
        }),
        seed: 202,
        noStartBases: true,
        players: [
          { name: 'Crown League', faction: 'crown', color: 1, team: 0, ai: false, difficulty: 'normal', start: 0 },
          { name: 'Wilds', faction: 'iron', color: 7, team: 1, ai: false, difficulty: 'normal', start: 1 },
        ],
        script: new ShardRoadScript(),
      },
    }),
  },
  {
    id: 'm3',
    title: 'Hunger of the Clans',
    faction: 'iron',
    summary: 'Hold the valley against eleven minutes of undead assaults until the war host arrives.',
    briefing: 'Warchief Korga Ironmaw has led the Iron Clans into a fertile valley, but the dead are rising from northern barrows. Fortify, gather and survive the waves — or strike their fortress and end it early.',
    build: () => ({
      local: 0,
      setup: {
        map: presetData('frostfang'),
        seed: 303,
        players: [
          { name: 'Iron Clans', faction: 'iron', color: 0, team: 0, ai: false, difficulty: 'normal', start: 0 },
          { name: 'Sepulchral Conclave', faction: 'sepulchral', color: 2, team: 1, ai: false, difficulty: 'normal', start: 1 },
        ],
        script: new HungerScript(),
      },
    }),
  },
  {
    id: 'm4',
    title: 'Roots of Night',
    faction: 'twilight',
    summary: 'Under eternal night, free the caged elder treants and bring the heroes home.',
    briefing: 'The Conclave has caged the elder treants of Moonhollow to feed their shard. Ranger Sylvaine and Keeper Thalor slip through the dark woods to break the cages.',
    build: () => ({
      local: 0,
      setup: {
        map: presetData('mirefen', (p) => {
          p.size = 120;
          p.players = 2;
          p.boss = false;
        }),
        seed: 404,
        noStartBases: true,
        players: [
          { name: 'Twilight Wardens', faction: 'twilight', color: 3, team: 0, ai: false, difficulty: 'normal', start: 0 },
          { name: 'Sepulchral Conclave', faction: 'sepulchral', color: 2, team: 1, ai: false, difficulty: 'normal', start: 1 },
        ],
        script: new RootsScript(),
      },
    }),
  },
  {
    id: 'm5',
    title: 'Dawn of Four Banners',
    faction: 'crown',
    summary: 'With the Twilight Wardens at your side, break the Shard Heart and end the war.',
    briefing: 'The Crown League and the Twilight Wardens stand together against the Sepulchral Conclave and the clans it has bent to its will. Destroy the Shard Heart at the center of the heartland.',
    build: () => ({
      local: 0,
      setup: {
        map: presetData('fourbanners'),
        seed: 505,
        players: [
          { name: 'Crown League', faction: 'crown', color: 1, team: 0, ai: false, difficulty: 'normal', start: 0 },
          { name: 'Twilight Wardens', faction: 'twilight', color: 3, team: 0, ai: true, difficulty: 'normal', start: 1 },
          { name: 'Sepulchral Conclave', faction: 'sepulchral', color: 2, team: 1, ai: true, difficulty: 'normal', start: 2 },
          { name: 'Bound Clans', faction: 'iron', color: 0, team: 1, ai: true, difficulty: 'easy', start: 3 },
        ],
        script: new DawnScript(),
      },
    }),
  },
];

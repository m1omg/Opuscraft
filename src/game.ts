import { ABILITIES, FACTIONS } from './data/registry';
import { DT, MAX_SELECTION } from './data/rules';
import { AIController, createAIs } from './ai/ai';
import type { Entity } from './sim/entity';
import type { Command, GameEvent } from './sim/events';
import { World, type GameSetup } from './sim/world';
import { GameRenderer } from './render/renderer';
import { Hud } from './ui/hud';
import { InputController, type InputHost } from './ui/input';
import type { TargetMode } from './ui/commands';
import { saveSettings, type Settings } from './settings';
import { optionsPanel } from './ui/options';
import { fmtTime } from './util/math';
import type { AudioEngine } from './audio/audio';

export interface SessionConfig {
  setup: GameSetup;
  local: number;
  settings: Settings;
  audio: AudioEngine | null;
  title: string;
  onExit: (result: { victory: boolean | null }) => void;
  onRestart?: () => void;
  campaign?: boolean;
}

export class GameSession implements InputHost {
  readonly world: World;
  readonly renderer: GameRenderer;
  readonly hud: Hud;
  readonly input: InputController;
  readonly root: HTMLElement;
  readonly local: number;
  readonly settings: Settings;
  private ais: AIController[];
  private cfg: SessionConfig;
  private audio: AudioEngine | null;
  private selIds: number[] = [];
  activeType = '';
  cardMode: 'main' | 'build' | 'build2' | 'learn' = 'main';
  targetMode: TargetMode | null = null;
  placing: string | null = null;
  placementRoot = -1;
  paused = false;
  menuOpen = false;
  private menuEl: HTMLElement | null = null;
  private raf = 0;
  private last = 0;
  private acc = 0;
  private running = false;
  private endShown = false;
  private idleIdx = 0;
  private footprintCache: { x: number; y: number }[] = [];
  private footTimer = 0;
  readonly isTeamGame: boolean;
  private defeatedShown = false;
  private lastVoiceSel = { id: -1, t: 0, n: 0 };

  constructor(parent: HTMLElement, cfg: SessionConfig) {
    this.cfg = cfg;
    this.settings = cfg.settings;
    this.local = cfg.local;
    this.audio = cfg.audio;
    this.root = document.createElement('div');
    this.root.className = 'game-root';
    parent.appendChild(this.root);
    this.world = new World(cfg.setup);
    this.ais = createAIs(this.world);
    this.renderer = new GameRenderer(this.root, this.world, this.local, {
      shadows: cfg.settings.shadows,
      quality: cfg.settings.quality,
      pixelRatio: cfg.settings.pixelRatio,
      alwaysBars: cfg.settings.alwaysBars,
    });
    this.renderer.overlay.opts.always = cfg.settings.alwaysBars;
    const me = this.world.players[this.local];
    this.isTeamGame = this.world.players.some((p) => !p.isNeutral && p.id !== this.local && p.team === me.team);
    this.hud = new Hud(this.root, this);
    this.input = new InputController(this.renderer.renderer.domElement, this);
    window.addEventListener('resize', this.onResize);
    // start with the town hall selected and the camera on the base
    const hall = this.world.entities.find((e) => e.owner === this.local && e.def.mainHall);
    if (hall) this.renderer.camera.lookAt(hall.x, hall.y + 3);
    this.audio?.startGame(me.faction);
    this.hud.message(`${cfg.title}`, 'info');
  }

  start(): void {
    this.running = true;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.loop);
  }

  destroy(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.onResize);
    this.input.dispose();
    this.renderer.dispose();
    this.audio?.stopMusic();
    this.root.remove();
  }

  private onResize = () => this.renderer.resize();

  // ---------------------------------------------------------------------------
  // main loop: fixed simulation step, interpolated rendering
  // ---------------------------------------------------------------------------
  private loop = (now: number) => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.loop);
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (!(dt > 0)) dt = 0;
    dt = Math.min(dt, 0.25);
    if (!this.paused && !this.menuOpen) {
      this.acc += dt * this.settings.gameSpeed;
      let steps = 0;
      while (this.acc >= DT && steps < 10) {
        for (const ai of this.ais) ai.update();
        this.world.step();
        this.processEvents(this.world.events);
        this.world.events.length = 0;
        this.acc -= DT;
        steps++;
      }
      if (steps >= 10) this.acc = 0;
    }
    const alpha = this.paused || this.menuOpen ? 1 : Math.min(1, this.acc / DT);
    this.input.update(dt);
    this.renderer.frame(dt, alpha);
    this.footTimer -= dt;
    if (this.footTimer <= 0) {
      this.footTimer = 0.1;
      this.footprintCache = this.renderer.camera.footprint();
    }
    this.hud.update(dt);
    this.audio?.update(dt, this.renderer.camera.tx, this.renderer.camera.ty, this.renderer.camera.dist, this.world.night);
    if (this.world.gameOver && !this.endShown) this.showEnd();
    const me = this.world.players[this.local];
    if (me?.defeated && !this.world.gameOver && !this.defeatedShown) {
      this.defeatedShown = true;
      this.showEnd();
    }
  };

  private processEvents(events: GameEvent[]): void {
    this.renderer.handleEvents(events);
    this.hud.handleEvents(events);
    this.audio?.handleEvents(this.world, events, this.local);
    for (const ev of events) {
      if (ev.t === 'alert' && ev.owner === this.local) this.input.noteAlert(ev.x, ev.y);
      if (ev.t === 'fx' && ev.fx === 'replaced' && ev.src !== undefined && ev.target !== undefined) {
        if (this.selIds.includes(ev.src)) this.selectIds(this.selIds.map((id) => (id === ev.src ? ev.target! : id)));
      }
      if (ev.t === 'trained' && ev.owner === this.local) this.input.noteAlert(this.world.get(ev.id)?.x ?? 0, this.world.get(ev.id)?.y ?? 0);
    }
  }

  // ---------------------------------------------------------------------------
  // selection
  // ---------------------------------------------------------------------------
  get selection(): Entity[] {
    const out: Entity[] = [];
    for (const id of this.selIds) {
      const e = this.world.get(id);
      if (!e || e.removed) continue;
      if (!e.alive && !(e.hero && e.owner === this.local)) continue;
      if (e.dead && !e.hero) continue;
      out.push(e);
    }
    return out;
  }

  selectIds(ids: number[]): void {
    const w = this.world;
    let ents = ids.map((id) => w.get(id)).filter((e): e is Entity => !!e && e.alive && !e.removed && e.kind !== 'item');
    const ownUnits = ents.filter((e) => e.owner === this.local && e.kind === 'unit');
    if (ownUnits.length) ents = ownUnits.slice(0, MAX_SELECTION);
    else if (ents.length > 1) {
      const ownB = ents.filter((e) => e.owner === this.local);
      ents = ownB.length ? ownB.slice(0, MAX_SELECTION) : ents.slice(0, 1);
      // multiple buildings of the same type are allowed, otherwise a single one
      if (ents.length > 1 && ents.some((e) => e.def.id !== ents[0].def.id)) ents = ents.slice(0, 1);
    }
    ents.sort((a, b) => (b.def.priority ?? 0) - (a.def.priority ?? 0) || (a.def.id < b.def.id ? -1 : a.def.id > b.def.id ? 1 : 0));
    this.selIds = ents.map((e) => e.id);
    this.renderer.views.selected = new Set(this.selIds);
    this.activeType = ents[0]?.def.id ?? '';
    this.cardMode = 'main';
    this.targetMode = null;
    this.placing = null;
    this.placementRoot = -1;
    if (ents[0] && ents[0].owner === this.local) {
      // count quick re-clicks on the same single unit
      const now = performance.now();
      const same = ents.length === 1 && this.lastVoiceSel.id === ents[0].id && now - this.lastVoiceSel.t < 1500;
      this.lastVoiceSel = { id: ents.length === 1 ? ents[0].id : -1, t: now, n: same ? this.lastVoiceSel.n + 1 : 0 };
      this.audio?.voiceSelect(ents[0], this.lastVoiceSel.n);
      if (this.lastVoiceSel.n >= 4) this.lastVoiceSel.n = 0;
    }
  }

  setActiveType(t: string): void {
    this.activeType = t;
    this.cardMode = 'main';
  }

  // ---------------------------------------------------------------------------
  // UICtx
  // ---------------------------------------------------------------------------
  issue(c: Command): void {
    if (this.world.players[this.local]?.defeated) return;
    this.world.issue(c);
    if (c.type === 'order' || c.type === 'cast') {
      const first = this.world.get(c.units[0]);
      if (first && first.owner === this.local && first.kind === 'unit') {
        const attack = c.type === 'order' && (c.order.type === 'attack' || c.order.type === 'attackMove');
        this.audio?.voiceOrder(first, attack);
      }
    }
  }

  voiceOrder(attack: boolean): void {
    const first = this.selection[0];
    if (first && first.owner === this.local) this.audio?.voiceOrder(first, attack);
  }

  startTarget(t: TargetMode): void {
    this.targetMode = t;
    this.placing = null;
  }

  startPlacement(defId: string, rootUnit = -1): void {
    this.placing = defId;
    this.placementRoot = rootUnit;
    this.targetMode = null;
  }

  setCardMode(m: 'main' | 'build' | 'build2' | 'learn'): void {
    this.cardMode = m;
  }

  cancelModes(): void {
    if (this.targetMode || this.placing) {
      this.targetMode = null;
      this.placing = null;
      this.placementRoot = -1;
      return;
    }
    this.cardMode = 'main';
  }

  msg(text: string): void {
    this.hud.message(text, 'error');
    this.audio?.ui('error');
  }

  // ---------------------------------------------------------------------------
  // HudHost
  // ---------------------------------------------------------------------------
  centerOn(x: number, y: number): void {
    this.renderer.camera.lookAt(x, y + 2);
  }

  minimapOrder(x: number, y: number, queued: boolean): void {
    const units = this.selection.filter((e) => e.owner === this.local && e.kind === 'unit').map((e) => e.id);
    const tm = this.targetMode;
    if (tm && (tm.kind === 'attack' || tm.kind === 'patrol' || tm.kind === 'move')) {
      const type = tm.kind === 'attack' ? 'attackMove' : tm.kind;
      this.issue({ type: 'order', player: this.local, units, order: { type, x, y }, queued });
      this.targetMode = null;
      return;
    }
    const buildings = this.selection.filter((e) => e.owner === this.local && e.b);
    if (!units.length && buildings.length) {
      this.issue({ type: 'rally', player: this.local, buildings: buildings.map((b) => b.id), x, y });
      return;
    }
    if (units.length) this.issue({ type: 'order', player: this.local, units, order: { type: 'move', x, y }, queued });
  }

  get cameraFootprint(): { x: number; y: number }[] {
    return this.footprintCache;
  }

  idleWorkers(): Entity[] {
    return this.world.entities.filter((e) => e.owner === this.local && e.alive && e.isWorker && !e.order && e.inside < 0 && !e.dead);
  }

  selectIdleWorker(): void {
    const idle = this.idleWorkers();
    if (!idle.length) return;
    this.idleIdx = (this.idleIdx + 1) % idle.length;
    const e = idle[this.idleIdx];
    this.selectIds([e.id]);
    this.centerOn(e.x, e.y);
  }

  heroes(): Entity[] {
    const p = this.world.players[this.local];
    return p.heroIds.map((id) => this.world.get(id)).filter((e): e is Entity => !!e && !e.removed);
  }

  focusHero(i: number, center: boolean): void {
    const h = this.heroes()[i];
    if (!h) return;
    if (h.alive) {
      this.selectIds([h.id]);
      if (center) this.centerOn(h.x, h.y);
    } else {
      this.selIds = [h.id];
      this.activeType = h.def.id;
      this.renderer.views.selected = new Set();
    }
  }

  private activeHero(): Entity | undefined {
    return this.selection.find((e) => e.hero && e.owner === this.local && e.alive);
  }

  inventoryUse(slot: number): void {
    const h = this.activeHero();
    if (!h || !h.hero) return;
    const it = h.hero.inventory[slot];
    if (!it) return;
    if (!it.def.ability) {
      this.msg('This item works passively');
      return;
    }
    const a = ABILITIES[it.def.ability];
    if (!a) return;
    if (a.targeting === 'none') this.issue({ type: 'useItem', player: this.local, hero: h.id, slot });
    else this.startTarget({ kind: 'useItem', slot, hero: h.id, ability: a });
  }

  inventoryRight(slot: number): void {
    const h = this.activeHero();
    if (!h || !h.hero || !h.hero.inventory[slot]) return;
    this.startTarget({ kind: 'dropItem', slot, hero: h.id });
  }

  inventorySwap(from: number, to: number): void {
    const h = this.activeHero();
    if (h) this.issue({ type: 'swapItem', player: this.local, hero: h.id, from, to });
  }

  cancelQueue(index: number): void {
    const b = this.selection.find((e) => e.b && e.owner === this.local);
    if (b) this.issue({ type: 'cancelQueue', player: this.local, building: b.id, index });
  }

  togglePause(): void {
    this.paused = !this.paused;
    this.hud.setSpeed(this.settings.gameSpeed, this.paused);
  }

  setGameSpeed(delta: number): void {
    const speeds = [0.5, 1, 1.5, 2, 3];
    let i = speeds.indexOf(this.settings.gameSpeed);
    if (i < 0) i = 1;
    i = Math.max(0, Math.min(speeds.length - 1, i + delta));
    this.settings.gameSpeed = speeds[i];
    this.hud.setSpeed(this.settings.gameSpeed, this.paused);
  }

  // ---------------------------------------------------------------------------
  // menus
  // ---------------------------------------------------------------------------
  closeMenus(): boolean {
    if (this.menuEl) {
      this.menuEl.remove();
      this.menuEl = null;
      this.menuOpen = false;
      return true;
    }
    return false;
  }

  openMenu(): void {
    this.closeMenus();
    this.menuOpen = true;
    const o = document.createElement('div');
    o.className = 'overlay';
    const p = document.createElement('div');
    p.className = 'panel';
    p.style.width = '340px';
    p.innerHTML = `<h2>Game Menu</h2><div style="text-align:center;color:#a39d8e;font-size:12px;margin-bottom:8px">${this.cfg.title} · ${fmtTime(this.world.time)}</div>`;
    const btn = (label: string, fn: () => void, cls = 'btn') => {
      const b = document.createElement('button');
      b.className = cls;
      b.textContent = label;
      b.onclick = fn;
      p.appendChild(b);
      return b;
    };
    btn('Return to Game', () => this.closeMenus(), 'btn primary');
    btn('Options', () => this.openOptions());
    btn('How to Play', () => this.openHelp());
    if (this.cfg.onRestart) btn('Restart', () => this.confirm('Restart this game?', () => this.cfg.onRestart!()));
    btn(this.world.fog ? 'Toggle Fullscreen' : 'Toggle Fullscreen', () => toggleFullscreen());
    btn('Quit to Main Menu', () => this.confirm('Leave this game?', () => this.cfg.onExit({ victory: null })));
    o.appendChild(p);
    this.root.appendChild(o);
    this.menuEl = o;
  }

  private confirm(text: string, yes: () => void): void {
    this.closeMenus();
    this.menuOpen = true;
    const o = document.createElement('div');
    o.className = 'overlay';
    o.innerHTML = `<div class="panel" style="width:340px;text-align:center"><h3>${text}</h3></div>`;
    const p = o.firstChild as HTMLElement;
    const b1 = document.createElement('button');
    b1.className = 'btn primary';
    b1.textContent = 'Yes';
    b1.onclick = yes;
    const b2 = document.createElement('button');
    b2.className = 'btn';
    b2.textContent = 'Cancel';
    b2.onclick = () => this.openMenu();
    p.append(b1, b2);
    this.root.appendChild(o);
    this.menuEl = o;
  }

  private openOptions(): void {
    this.closeMenus();
    this.menuOpen = true;
    const o = document.createElement('div');
    o.className = 'overlay';
    const panel = optionsPanel(this.settings, (s) => {
      saveSettings(s);
      this.audio?.setVolumes(s);
      this.renderer.applySettings({ shadows: s.shadows, quality: s.quality, pixelRatio: s.pixelRatio, alwaysBars: s.alwaysBars });
      this.renderer.overlay.opts.always = s.alwaysBars;
    }, () => this.openMenu());
    o.appendChild(panel);
    this.root.appendChild(o);
    this.menuEl = o;
  }

  private openHelp(): void {
    this.closeMenus();
    this.menuOpen = true;
    const o = document.createElement('div');
    o.className = 'overlay';
    o.innerHTML = `<div class="panel help">${HELP_HTML}</div>`;
    const b = document.createElement('button');
    b.className = 'btn primary';
    b.textContent = 'Back';
    b.onclick = () => this.openMenu();
    o.firstChild!.appendChild(b);
    this.root.appendChild(o);
    this.menuEl = o;
  }

  openAllies(): void {
    this.closeMenus();
    this.menuOpen = true;
    const w = this.world;
    const me = w.players[this.local];
    const allies = w.players.filter((p) => !p.isNeutral && p.id !== this.local && p.team === me.team);
    const o = document.createElement('div');
    o.className = 'overlay';
    const panel = document.createElement('div');
    panel.className = 'panel allies-panel';
    panel.style.width = '460px';
    panel.innerHTML = '<h2>Allies</h2><div style="font-size:12px;color:#a39d8e;margin-bottom:8px">Send resources to an ally.</div>';
    for (const a of allies) {
      const row = document.createElement('div');
      row.className = 'ally';
      row.innerHTML = `<span style="color:#${a.color.toString(16).padStart(6, '0')};font-weight:700">${a.name}${a.defeated ? ' (defeated)' : ''}</span>`;
      for (const [label, g, l] of [
        ['+100 gold', 100, 0],
        ['+100 lumber', 0, 100],
      ] as [string, number, number][]) {
        const b = document.createElement('button');
        b.className = 'btn small';
        b.textContent = label;
        b.onclick = () => this.issue({ type: 'transfer', player: this.local, to: a.id, gold: g, lumber: l });
        row.appendChild(b);
      }
      panel.appendChild(row);
    }
    const close = document.createElement('button');
    close.className = 'btn primary';
    close.textContent = 'Close';
    close.onclick = () => this.closeMenus();
    panel.appendChild(close);
    o.appendChild(panel);
    this.root.appendChild(o);
    this.menuEl = o;
  }

  private showEnd(): void {
    this.endShown = this.world.gameOver;
    const w = this.world;
    const me = w.players[this.local];
    const won = w.gameOver && w.winners.includes(this.local);
    const lost = me.defeated || (w.gameOver && !won);
    this.audio?.stinger(won ? 'victory' : 'defeat');
    const rows = w.players
      .filter((p) => !p.isNeutral)
      .map(
        (p) =>
          `<tr><td style="color:#${p.color.toString(16).padStart(6, '0')};font-weight:700">${p.name}</td><td>${FACTIONS[p.faction].name}</td><td>${p.stats.unitsTrained}</td><td>${p.stats.unitsKilled}</td><td>${p.stats.unitsLost}</td><td>${p.stats.buildingsRazed}</td><td>${p.stats.goldMined}</td><td>${p.stats.lumberHarvested}</td><td>${p.stats.heroKills}</td><td>${p.stats.creepsKilled}</td></tr>`,
      )
      .join('');
    const o = document.createElement('div');
    o.className = 'overlay endscreen';
    o.innerHTML = `<div class="panel" style="min-width:720px"><h1 class="${won ? 'win' : 'lose'}">${won ? 'Victory' : lost ? 'Defeat' : 'Game Over'}</h1>
      <div style="text-align:center;color:#a39d8e">Game time ${fmtTime(w.time)}</div>
      <table class="stat-table"><tr><th>Player</th><th>Faction</th><th>Trained</th><th>Kills</th><th>Losses</th><th>Razed</th><th>Gold</th><th>Lumber</th><th>Hero kills</th><th>Creeps</th></tr>${rows}</table></div>`;
    const p = o.firstChild as HTMLElement;
    const mk = (label: string, fn: () => void, cls = 'btn') => {
      const b = document.createElement('button');
      b.className = cls;
      b.textContent = label;
      b.onclick = fn;
      p.appendChild(b);
    };
    if (!w.gameOver) {
      mk('Keep Watching', () => {
        o.remove();
        me.revealAll = true;
      });
    } else mk('Continue Watching', () => o.remove());
    if (this.cfg.onRestart) mk('Play Again', () => this.cfg.onRestart!());
    mk(won ? 'Continue' : 'Quit to Main Menu', () => this.cfg.onExit({ victory: won ? true : lost ? false : null }), 'btn primary');
    this.root.appendChild(o);
  }
}

export function toggleFullscreen(): void {
  const d = document as Document & { webkitFullscreenElement?: Element };
  if (d.fullscreenElement || d.webkitFullscreenElement) {
    void document.exitFullscreen?.();
    return;
  }
  const el = document.documentElement;
  const req = el.requestFullscreen?.bind(el);
  if (req)
    void req()
      .then(() => {
        const nav = navigator as Navigator & { keyboard?: { lock?: (keys?: string[]) => Promise<void> } };
        void nav.keyboard?.lock?.().catch(() => undefined);
      })
      .catch(() => undefined);
}

export const HELP_HTML = `
<h2>How to Play</h2>
<p>Build an economy, raise an army, recruit heroes and destroy every enemy building. Gold comes from mines, lumber from trees. Food structures raise your army limit; larger armies pay <b>upkeep</b>, reducing the gold your workers deliver.</p>
<h3>Mouse</h3>
<table>
<tr><td>Left click / drag</td><td>Select a unit or box-select up to 12 units. Shift adds or removes. Double-click or Ctrl+click selects all units of that type on screen.</td></tr>
<tr><td>Right click</td><td>Smart order: move, attack, follow, gather from mines and trees, repair, pick up items. Shift+right click queues orders. With a building selected it sets the rally point.</td></tr>
<tr><td>Middle drag / wheel</td><td>Pan / zoom the camera. Edge scrolling and arrow keys also pan.</td></tr>
<tr><td>Minimap</td><td>Left click moves the camera, right click orders selected units there.</td></tr>
</table>
<h3>Keyboard</h3>
<table>
<tr><td>M S H A P</td><td>Move, Stop, Hold position, Attack (attack-move), Patrol.</td></tr>
<tr><td>G R T B V</td><td>Workers: Gather, Repair, Return resources, Build, Build advanced.</td></tr>
<tr><td>Q W E R</td><td>Abilities. Heroes learn skills with L (when a point is available).</td></tr>
<tr><td>Command card grid</td><td>Buildings and build menus use the grid keys Q W E R / A S D F / Z X C V. Y sets a rally point. Esc cancels.</td></tr>
<tr><td>Z X C V B N</td><td>Use hero inventory items 1–6. Right-click an item to drop or give it; drag to rearrange.</td></tr>
<tr><td>Ctrl+1…0 / 1…0</td><td>Assign / select control groups (double tap centers). If your browser captures Ctrl+number, use fullscreen from the menu.</td></tr>
<tr><td>F1 F2 F3</td><td>Select your heroes (double tap centers the camera).</td></tr>
<tr><td>Tab</td><td>Cycle the active unit type in a mixed selection.</td></tr>
<tr><td>F8 or .</td><td>Select an idle worker.</td></tr>
<tr><td>Space / Backspace</td><td>Jump to the last alert / your town hall.</td></tr>
<tr><td>Alt</td><td>Show all health bars.</td></tr>
<tr><td>+ / − / Pause</td><td>Game speed / pause (single player).</td></tr>
<tr><td>F10 / Esc</td><td>Game menu.</td></tr>
</table>
<h3>Factions</h3>
<p><b>Crown League</b>: several Peasants can build together; Call to Arms turns Peasants into Militia; towers specialize. <b>Iron Clans</b>: Clanhands build from inside structures and can shelter in Longhouses to throw spears; tough melee warriors. <b>Sepulchral Conclave</b>: Cultists summon buildings that rise by themselves, must build on blight, gather gold from a Cursed Lode summoned on a mine; Gravediggers chop lumber; corpses fuel necromancy. <b>Twilight Wardens</b>: Forest Spirits gather lumber without felling trees and draw gold from mines bound by the Heart of the Forest; Ancients absorb the spirit that plants them and can uproot to walk; units heal faster at night and Archers hide when standing still at night.</p>
<h3>Heroes</h3>
<p>Your first hero is free. Heroes gain experience from kills, reach level 10, learn three abilities with three ranks and an ultimate at level 6, and carry six items. A second hero needs tier 2, a third needs tier 3. Fallen heroes can be revived at an altar or an inn. Neutral creep camps guard gold mines and treasure; they sleep at night.</p>`;

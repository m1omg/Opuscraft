import { FACTIONS } from '../data/registry';
import type { FactionId } from '../data/types';
import { DT } from '../data/rules';
import { MAP_PRESETS, generateMap } from '../sim/mapgen';
import type { MapData } from '../sim/map';
import { PLAYER_COLORS, type Difficulty } from '../sim/player';
import { World, type PlayerSetup } from '../sim/world';
import { createAIs, type AIController } from '../ai/ai';
import { GameRenderer } from '../render/renderer';
import { PALETTES } from '../render/materials';
import type { Settings } from '../settings';
import { optionsPanel } from './options';
import { HELP_HTML } from '../game';

export interface SkirmishConfig {
  map: MapData;
  mapId: string;
  players: PlayerSetup[];
  startGold: number;
  startLumber: number;
  fog: boolean;
  speed: number;
}

export interface MissionInfo {
  id: string;
  title: string;
  faction: FactionId;
  summary: string;
}

const FACTION_IDS: FactionId[] = ['crown', 'iron', 'sepulchral', 'twilight'];
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

/** Live AI-vs-AI battle drifting behind the title screen. */
class Backdrop {
  private world: World;
  private ais: AIController[];
  private renderer: GameRenderer;
  private raf = 0;
  private last = 0;
  private acc = 0;
  private t = 0;
  private alive = true;

  constructor(parent: HTMLElement) {
    const preset = MAP_PRESETS[Math.floor(Math.random() * 3)];
    const factions = [...FACTION_IDS].sort(() => Math.random() - 0.5);
    this.world = new World({
      map: generateMap(preset),
      seed: Math.floor(Math.random() * 1e6),
      fog: false,
      players: [
        { name: 'A', faction: factions[0], color: 1, team: 0, ai: true, difficulty: 'hard', start: 0 },
        { name: 'B', faction: factions[1], color: 0, team: 1, ai: true, difficulty: 'hard', start: 1 },
      ],
    });
    this.ais = createAIs(this.world);
    // let the armies develop a little
    for (let i = 0; i < 20 * 150; i++) {
      for (const a of this.ais) a.update();
      this.world.step();
      this.world.events.length = 0;
    }
    this.renderer = new GameRenderer(parent, this.world, 0, { shadows: true, quality: 0.8, pixelRatio: 1.25, alwaysBars: false });
    this.renderer.camera.setZoom(38);
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.loop);
  }

  private loop = (now: number) => {
    if (!this.alive) return;
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.acc += dt;
    while (this.acc >= DT) {
      for (const a of this.ais) a.update();
      this.world.step();
      this.renderer.handleEvents(this.world.events);
      this.world.events.length = 0;
      this.acc -= DT;
    }
    this.t += dt;
    const map = this.world.map;
    // slow orbit over the battlefield
    const a = this.t * 0.03;
    this.renderer.camera.lookAt(map.w / 2 + Math.cos(a) * map.w * 0.28, map.h / 2 + Math.sin(a * 1.3) * map.h * 0.28);
    this.renderer.frame(dt, Math.min(1, this.acc / DT));
  };

  resize(): void {
    this.renderer.resize();
  }

  destroy(): void {
    this.alive = false;
    cancelAnimationFrame(this.raf);
    this.renderer.dispose();
  }
}

export interface MenuCallbacks {
  startSkirmish(cfg: SkirmishConfig): void;
  startMission(id: string): void;
  settings: Settings;
  onSettings(s: Settings): void;
  missions: MissionInfo[];
  progress: Record<string, boolean>;
  unlock(): void;
}

export class MainMenu {
  readonly root: HTMLElement;
  private bg: Backdrop | null = null;
  private cb: MenuCallbacks;
  private layer: HTMLElement;
  private onResize = () => this.bg?.resize();

  constructor(parent: HTMLElement, cb: MenuCallbacks) {
    this.cb = cb;
    this.root = document.createElement('div');
    this.root.className = 'menu-root';
    parent.appendChild(this.root);
    const bgEl = document.createElement('div');
    bgEl.className = 'menu-bg game-root';
    this.root.appendChild(bgEl);
    try {
      this.bg = new Backdrop(bgEl);
    } catch (err) {
      console.error('menu backdrop failed', err);
      bgEl.style.background = 'radial-gradient(circle at 40% 40%, #2a3448, #07080c)';
    }
    const shade = document.createElement('div');
    shade.className = 'menu-shade';
    this.root.appendChild(shade);
    this.layer = document.createElement('div');
    this.layer.style.position = 'absolute';
    this.layer.style.inset = '0';
    this.root.appendChild(this.layer);
    window.addEventListener('resize', this.onResize);
    this.showMain();
  }

  destroy(): void {
    window.removeEventListener('resize', this.onResize);
    this.bg?.destroy();
    this.root.remove();
  }

  private clear(): void {
    this.layer.innerHTML = '';
  }

  private button(parent: HTMLElement, label: string, fn: () => void, cls = 'btn'): HTMLButtonElement {
    const b = document.createElement('button');
    b.className = cls;
    b.innerHTML = label;
    b.onclick = () => {
      this.cb.unlock();
      fn();
    };
    parent.appendChild(b);
    return b;
  }

  showMain(): void {
    this.clear();
    const m = document.createElement('div');
    m.className = 'menu-main';
    m.innerHTML = '<h1 class="logo">OPUSCRAFT</h1><div class="tagline">War of the Four Banners</div>';
    this.button(m, 'Campaign', () => this.showCampaign(), 'btn primary');
    this.button(m, 'Skirmish', () => this.showSkirmish());
    this.button(m, 'How to Play', () => this.showHelp());
    this.button(m, 'Options', () => this.showOptions());
    this.button(m, 'About', () => this.showAbout());
    this.layer.appendChild(m);
    const f = document.createElement('div');
    f.className = 'footer';
    f.textContent = 'Opuscraft · an original fantasy real-time strategy game · built with Three.js';
    this.layer.appendChild(f);
  }

  private centered(inner: HTMLElement): void {
    const o = document.createElement('div');
    o.className = 'overlay';
    o.style.background = 'rgba(4,5,8,0.55)';
    o.appendChild(inner);
    this.layer.appendChild(o);
  }

  showOptions(): void {
    this.clear();
    this.centered(optionsPanel(this.cb.settings, (s) => this.cb.onSettings(s), () => this.showMain()));
  }

  showHelp(): void {
    this.clear();
    const p = document.createElement('div');
    p.className = 'panel help';
    p.innerHTML = HELP_HTML;
    this.button(p, 'Back', () => this.showMain(), 'btn primary');
    this.centered(p);
  }

  showAbout(): void {
    this.clear();
    const p = document.createElement('div');
    p.className = 'panel';
    p.style.width = '560px';
    p.innerHTML = `<h2>About Opuscraft</h2>
      <p style="font-size:14px;line-height:1.6">Opuscraft is a fantasy real-time strategy game with role-playing heroes. Four rival civilizations — the <b>Crown League</b>, the <b>Iron Clans</b>, the <b>Sepulchral Conclave</b> and the <b>Twilight Wardens</b> — fight over gold and lumber across living maps full of monsters, merchants and treasure.</p>
      <p style="font-size:14px;line-height:1.6">Everything you see and hear is generated in code: the low-poly models, terrain, effects, icons, music and sound. The simulation runs at a fixed 20 ticks per second, independent of your display's refresh rate.</p>
      <div class="faction-cards">${FACTION_IDS.map((f) => `<div class="fcard"><b>${esc(FACTIONS[f].name)}</b>${esc(FACTIONS[f].description)}</div>`).join('')}</div>`;
    this.button(p, 'Back', () => this.showMain(), 'btn primary');
    this.centered(p);
  }

  showCampaign(): void {
    this.clear();
    const p = document.createElement('div');
    p.className = 'panel';
    p.innerHTML = '<h2>Campaign: The Shattered Star</h2><div style="text-align:center;color:#a39d8e;font-size:13px;margin:-6px 0 14px">A star fell on the northern peaks. Its splinters whisper to the ambitious, and four peoples are drawn into a war none of them chose.</div>';
    const list = document.createElement('div');
    list.className = 'camp-list';
    const missions = this.cb.missions;
    missions.forEach((ms, i) => {
      const unlocked = i === 0 || this.cb.progress[missions[i - 1].id];
      const done = this.cb.progress[ms.id];
      const row = document.createElement('div');
      row.className = 'camp-item' + (unlocked ? '' : ' locked');
      row.innerHTML = `<div class="num">${i + 1}</div><div><div class="t">${esc(ms.title)} <span style="color:#a39d8e;font-weight:400;font-size:12px">— ${esc(FACTIONS[ms.faction].name)}</span></div><div class="d">${esc(ms.summary)}</div>${done ? '<div class="done">✓ Completed</div>' : ''}</div>`;
      const b = document.createElement('button');
      b.className = 'btn small' + (unlocked ? ' primary' : '');
      b.textContent = unlocked ? (done ? 'Replay' : 'Play') : 'Locked';
      b.disabled = !unlocked;
      b.onclick = () => {
        this.cb.unlock();
        if (unlocked) this.cb.startMission(ms.id);
      };
      row.appendChild(b);
      list.appendChild(row);
    });
    p.appendChild(list);
    this.button(p, 'Back', () => this.showMain());
    this.centered(p);
  }

  // ---------------------------------------------------------------------------
  showSkirmish(): void {
    this.clear();
    const p = document.createElement('div');
    p.className = 'panel skirmish';
    p.innerHTML = '<h2>Skirmish</h2>';
    const grid = document.createElement('div');
    grid.className = 'sk-grid';
    p.appendChild(grid);
    const left = document.createElement('div');
    const right = document.createElement('div');
    grid.append(left, right);
    left.innerHTML = '<h3 style="margin-top:0">Map</h3>';
    const maplist = document.createElement('div');
    maplist.className = 'maplist';
    left.appendChild(maplist);
    const preview = document.createElement('canvas');
    preview.className = 'mappreview';
    preview.width = 260;
    preview.height = 260;
    preview.style.width = '260px';
    preview.style.height = '260px';
    left.appendChild(preview);

    let mapIdx = 0;
    let mapData: MapData = generateMap(MAP_PRESETS[0]);
    type Slot = { type: 'you' | 'easy' | 'normal' | 'hard' | 'closed'; faction: FactionId | 'random'; team: number; color: number };
    let slots: Slot[] = [];
    const resetSlots = () => {
      const n = MAP_PRESETS[mapIdx].players;
      slots = [];
      for (let i = 0; i < 4; i++) {
        slots.push({ type: i === 0 ? 'you' : i < n ? (i === 1 ? 'normal' : 'normal') : 'closed', faction: i === 0 ? 'crown' : 'random', team: i, color: [1, 0, 2, 4][i] });
      }
      if (n === 2) {
        slots[2].type = 'closed';
        slots[3].type = 'closed';
      }
    };
    resetSlots();
    let startGold = 500;
    let startLumber = 150;
    let fog = true;

    const drawPreview = () => {
      drawMapPreview(preview, mapData, slots.map((s) => (s.type === 'closed' ? -1 : PLAYER_COLORS[s.color].hex)));
    };
    const renderMaps = () => {
      maplist.innerHTML = '';
      MAP_PRESETS.forEach((m, i) => {
        const d = document.createElement('div');
        d.className = 'mapitem' + (i === mapIdx ? ' sel' : '');
        d.innerHTML = `<div class="mn">${esc(m.name)} <span style="color:#a39d8e;font-weight:400">(${m.players})</span></div><div class="md">${esc(m.description)}</div>`;
        d.onclick = () => {
          mapIdx = i;
          mapData = generateMap(MAP_PRESETS[i]);
          resetSlots();
          renderMaps();
          renderSlots();
          drawPreview();
        };
        maplist.appendChild(d);
      });
    };

    right.innerHTML = '<h3 style="margin-top:0">Players</h3>';
    const table = document.createElement('table');
    table.className = 'slots';
    right.appendChild(table);
    const renderSlots = () => {
      const n = MAP_PRESETS[mapIdx].players;
      table.innerHTML = '<tr><th>#</th><th>Player</th><th>Faction</th><th>Team</th><th>Color</th></tr>';
      for (let i = 0; i < n; i++) {
        const s = slots[i];
        const tr = document.createElement('tr');
        const td = (html = '') => {
          const c = document.createElement('td');
          c.innerHTML = html;
          tr.appendChild(c);
          return c;
        };
        td(String(i + 1));
        const typeTd = td();
        if (i === 0) typeTd.innerHTML = '<b>You</b>';
        else {
          const sel = document.createElement('select');
          for (const [v, l] of [
            ['easy', 'Computer (Easy)'],
            ['normal', 'Computer (Normal)'],
            ['hard', 'Computer (Hard)'],
            ['closed', 'Closed'],
          ])
            sel.add(new Option(l, v, false, s.type === v));
          sel.onchange = () => {
            s.type = sel.value as Slot['type'];
            drawPreview();
          };
          typeTd.appendChild(sel);
        }
        const fsel = document.createElement('select');
        fsel.add(new Option('Random', 'random', false, s.faction === 'random'));
        for (const f of FACTION_IDS) fsel.add(new Option(FACTIONS[f].name, f, false, s.faction === f));
        fsel.onchange = () => (s.faction = fsel.value as Slot['faction']);
        td().appendChild(fsel);
        const tsel = document.createElement('select');
        for (let t = 0; t < 4; t++) tsel.add(new Option('Team ' + (t + 1), String(t), false, s.team === t));
        tsel.onchange = () => (s.team = Number(tsel.value));
        td().appendChild(tsel);
        const sw = document.createElement('span');
        sw.className = 'swatch';
        sw.style.background = '#' + PLAYER_COLORS[s.color].hex.toString(16).padStart(6, '0');
        sw.title = 'Click to change color';
        sw.onclick = () => {
          let c = s.color;
          for (let k = 0; k < PLAYER_COLORS.length; k++) {
            c = (c + 1) % PLAYER_COLORS.length;
            if (!slots.some((o, j) => j !== i && o.type !== 'closed' && o.color === c)) break;
          }
          s.color = c;
          renderSlots();
          drawPreview();
        };
        td().appendChild(sw);
        table.appendChild(tr);
      }
    };

    const opts = document.createElement('div');
    opts.innerHTML = '<h3>Options</h3>';
    const optRow = (label: string, options: [string, string][], val: string, onc: (v: string) => void) => {
      const r = document.createElement('div');
      r.className = 'row';
      r.style.margin = '6px 0';
      const l = document.createElement('label');
      l.style.width = '150px';
      l.textContent = label;
      const sel = document.createElement('select');
      for (const [v, t] of options) sel.add(new Option(t, v, false, v === val));
      sel.onchange = () => onc(sel.value);
      r.append(l, sel);
      opts.appendChild(r);
    };
    optRow('Starting resources', [['std', 'Standard (500 gold, 150 lumber)'], ['high', 'High (2000 gold, 1000 lumber)']], 'std', (v) => {
      startGold = v === 'high' ? 2000 : 500;
      startLumber = v === 'high' ? 1000 : 150;
    });
    optRow('Map visibility', [['fog', 'Fog of war'], ['revealed', 'Revealed']], 'fog', (v) => (fog = v === 'fog'));
    right.appendChild(opts);
    const cards = document.createElement('div');
    cards.className = 'faction-cards';
    cards.innerHTML = FACTION_IDS.map((f) => `<div class="fcard"><b>${esc(FACTIONS[f].name)}</b>${esc(FACTIONS[f].traits.join(' · '))}</div>`).join('');
    right.appendChild(cards);

    const btns = document.createElement('div');
    btns.className = 'row';
    btns.style.marginTop = '16px';
    btns.style.justifyContent = 'flex-end';
    right.appendChild(btns);
    this.button(btns, 'Back', () => this.showMain()).style.width = '160px';
    const start = this.button(
      btns,
      'Start Game',
      () => {
        const n = MAP_PRESETS[mapIdx].players;
        const active = slots.slice(0, n).map((s, i) => ({ s, i })).filter((x) => x.s.type !== 'closed');
        if (active.length < 2) return alert('At least two players are needed.');
        const teams = new Set(active.map((x) => x.s.team));
        if (teams.size < 2) return alert('Players must be on at least two different teams.');
        const players: PlayerSetup[] = active.map(({ s, i }, k) => ({
          name: s.type === 'you' ? 'You' : `Computer ${k}`,
          faction: s.faction === 'random' ? FACTION_IDS[Math.floor(Math.random() * 4)] : s.faction,
          color: s.color,
          team: s.team,
          ai: s.type !== 'you',
          difficulty: (s.type === 'you' ? 'normal' : s.type) as Difficulty,
          start: i,
        }));
        // shuffle AI start positions for variety on 4 player maps
        this.cb.startSkirmish({ map: mapData, mapId: MAP_PRESETS[mapIdx].id, players, startGold, startLumber, fog, speed: 1 });
      },
      'btn primary',
    );
    start.style.width = '220px';
    renderMaps();
    renderSlots();
    drawPreview();
    this.centered(p);
  }
}

/** Draw a small overview image of a map for menus. */
export function drawMapPreview(cv: HTMLCanvasElement, map: MapData, starts: number[]): void {
  const c = cv.getContext('2d')!;
  const pal = PALETTES[map.biome];
  const img = c.createImageData(map.w, map.h);
  const treeSet = new Set(map.trees.map((t) => t[1] * map.w + t[0]));
  for (let y = 0; y < map.h; y++)
    for (let x = 0; x < map.w; x++) {
      const i = y * map.w + x;
      let col = pal.terrain[map.terrain[i]] ?? pal.terrain[0];
      if (map.water[i]) col = map.water[i] === 2 ? pal.waterDeep : pal.water;
      const f = 0.85 + map.level[i] * 0.15;
      let r = ((col >> 16) & 255) * f;
      let g = ((col >> 8) & 255) * f;
      let b = (col & 255) * f;
      if (treeSet.has(i)) {
        r = 28;
        g = 64;
        b = 36;
      }
      img.data[i * 4] = r;
      img.data[i * 4 + 1] = g;
      img.data[i * 4 + 2] = b;
      img.data[i * 4 + 3] = 255;
    }
  const tmp = document.createElement('canvas');
  tmp.width = map.w;
  tmp.height = map.h;
  tmp.getContext('2d')!.putImageData(img, 0, 0);
  c.imageSmoothingEnabled = true;
  c.drawImage(tmp, 0, 0, cv.width, cv.height);
  const sx = cv.width / map.w;
  const sy = cv.height / map.h;
  for (const m of map.mines) {
    c.fillStyle = '#ffd040';
    c.fillRect(m.x * sx - 4, m.y * sy - 4, 8, 8);
  }
  for (const n of map.neutrals) {
    c.fillStyle = '#e8d8a0';
    c.beginPath();
    c.arc(n.x * sx, n.y * sy, 4, 0, Math.PI * 2);
    c.fill();
  }
  for (const cp of map.camps) {
    c.fillStyle = cp.difficulty === 'green' ? '#7ad070' : cp.difficulty === 'orange' ? '#f0a040' : '#f04a3a';
    c.beginPath();
    c.arc(cp.x * sx, cp.y * sy, 3, 0, Math.PI * 2);
    c.fill();
  }
  map.starts.forEach((s, i) => {
    const col = starts[i];
    c.fillStyle = col === undefined || col < 0 ? 'rgba(255,255,255,0.5)' : '#' + col.toString(16).padStart(6, '0');
    c.strokeStyle = '#000';
    c.lineWidth = 2;
    c.beginPath();
    c.arc(s.x * sx, s.y * sy, 9, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    c.fillStyle = '#fff';
    c.font = 'bold 11px sans-serif';
    c.textAlign = 'center';
    c.fillText(String(i + 1), s.x * sx, s.y * sy + 4);
  });
}

import { validateData } from './data/index';
import { GameSession } from './game';
import { presetMap } from './sim/mapgen';
import { loadProgress, loadSettings, saveProgress, saveSettings, type Settings } from './settings';
import { AudioEngine } from './audio/audio';
import { MainMenu, type SkirmishConfig } from './ui/menus';
import { MISSIONS } from './campaign/missions';
import type { FactionId } from './data/types';
import type { GameSetup } from './sim/world';
import { DEFS } from './data/registry';
import { kill } from './sim/combat';

// small debugging handle used by the automated browser play-tests
(window as unknown as { opus: unknown }).opus = { kill, DEFS };

const errs = validateData();
if (errs.length) console.error('Data errors', errs);

const app = document.getElementById('app')!;
const settings: Settings = loadSettings();
const audio = new AudioEngine(settings);
let progress = loadProgress();
let menu: MainMenu | null = null;
let session: GameSession | null = null;

function unlockAudio(): void {
  audio.unlock();
}
window.addEventListener('pointerdown', unlockAudio, { once: false });
window.addEventListener('keydown', unlockAudio, { once: false });

function loading(text: string, tip: string): HTMLElement {
  const l = document.createElement('div');
  l.className = 'loading';
  l.innerHTML = `<div>${text}</div><div class="tip">${tip}</div>`;
  app.appendChild(l);
  return l;
}

const TIPS = [
  'Larger armies pay upkeep: above 50 food your workers deliver less gold.',
  'Neutral camps sleep at night — a perfect time to strike them, or to sneak past.',
  'Your first hero is free. Fight creeps early to level them up.',
  'Spellcasters with autocast abilities glow on the command card. Right-click to toggle.',
  'Heroes revive at your altar or at the Wayfarer\'s Inn, keeping their items and experience.',
  'Hold Alt to see every health bar on the battlefield.',
  'Siege units deal bonus damage to fortified buildings but struggle against armies.',
];

function showMenu(screen: 'main' | 'campaign' | 'skirmish' = 'main'): void {
  session?.destroy();
  session = null;
  if (menu) menu.destroy();
  menu = new MainMenu(app, {
    settings,
    missions: MISSIONS,
    progress,
    unlock: () => {
      unlockAudio();
      audio.menuMusic();
    },
    onSettings: (s) => {
      saveSettings(s);
      audio.setVolumes(s);
    },
    startSkirmish: (cfg) => startSkirmish(cfg),
    startMission: (id) => briefing(id),
  });
  if (screen === 'campaign') menu.showCampaign();
  if (screen === 'skirmish') menu.showSkirmish();
  audio.menuMusic();
}

function launch(setup: GameSetup, local: number, title: string, onExit: (won: boolean | null) => void, restart?: () => void, campaign = false): void {
  menu?.destroy();
  menu = null;
  const l = loading(title, TIPS[Math.floor(Math.random() * TIPS.length)]);
  // let the loading screen paint before the heavy setup
  setTimeout(() => {
    try {
      session = new GameSession(app, {
        setup,
        local,
        settings,
        audio,
        title,
        campaign,
        onExit: (r) => onExit(r.victory),
        onRestart: restart,
      });
      session.start();
      (window as unknown as { game: GameSession }).game = session;
    } catch (err) {
      console.error(err);
      alert('Failed to start the game: ' + (err as Error).message);
      showMenu();
    } finally {
      l.remove();
    }
  }, 30);
}

function startSkirmish(cfg: SkirmishConfig): void {
  const setup: GameSetup = {
    map: cfg.map,
    seed: Math.floor(Math.random() * 1e9),
    players: cfg.players,
    fog: cfg.fog,
    startGold: cfg.startGold,
    startLumber: cfg.startLumber,
  };
  const local = cfg.players.findIndex((p) => !p.ai);
  launch(
    setup,
    Math.max(0, local),
    'Skirmish — ' + cfg.map.name,
    () => showMenu('skirmish'),
    () => {
      session?.destroy();
      session = null;
      startSkirmish(cfg);
    },
  );
}

function briefing(id: string): void {
  const m = MISSIONS.find((x) => x.id === id);
  if (!m) return;
  const o = document.createElement('div');
  o.className = 'overlay';
  o.style.zIndex = '60';
  const idx = MISSIONS.indexOf(m) + 1;
  o.innerHTML = `<div class="panel" style="width:min(620px,94vw)"><h2>Chapter ${idx}: ${m.title}</h2><p style="font-size:15px;line-height:1.65">${m.briefing}</p></div>`;
  const p = o.firstChild as HTMLElement;
  const go = document.createElement('button');
  go.className = 'btn primary';
  go.textContent = 'Begin';
  go.onclick = () => {
    o.remove();
    startMission(id);
  };
  const back = document.createElement('button');
  back.className = 'btn';
  back.textContent = 'Back';
  back.onclick = () => o.remove();
  p.append(go, back);
  app.appendChild(o);
}

function startMission(id: string): void {
  const m = MISSIONS.find((x) => x.id === id)!;
  const { setup, local } = m.build();
  launch(
    setup,
    local,
    m.title,
    (won) => {
      if (won) {
        progress = { ...progress, [id]: true };
        saveProgress(progress);
      }
      showMenu('campaign');
    },
    () => {
      session?.destroy();
      session = null;
      startMission(id);
    },
    true,
  );
}

// ---------------------------------------------------------------------------
// entry point (URL parameters allow quick testing: ?quick&f=crown&e=iron&map=thornvale&spectate&t=300)
// ---------------------------------------------------------------------------
const params = new URLSearchParams(location.search);
if (params.has('quick') || params.has('spectate')) {
  const spectate = params.has('spectate');
  const setup: GameSetup = {
    map: presetMap(params.get('map') || 'thornvale'),
    seed: Number(params.get('seed') || 7),
    players: [
      { name: 'You', faction: (params.get('f') as FactionId) || 'crown', color: 1, team: 0, ai: spectate, difficulty: 'normal', start: 0 },
      { name: 'Computer', faction: (params.get('e') as FactionId) || 'iron', color: 0, team: 1, ai: true, difficulty: 'normal', start: 1 },
    ],
  };
  session = new GameSession(app, { setup, local: 0, settings, audio, title: 'Skirmish', onExit: () => showMenu() });
  const ff = Number(params.get('t') || 0);
  for (let i = 0; i < ff * 20; i++) {
    for (const ai of (session as unknown as { ais: { update(): void }[] }).ais) ai.update();
    session.world.step();
    session.world.events.length = 0;
  }
  if (params.has('reveal')) session.world.players[0].revealAll = true;
  session.start();
  (window as unknown as { game: GameSession }).game = session;
} else if (params.has('gallery')) {
  // debug: show every model of a faction in rows
  const fac = params.get('gallery') || 'crown';
  const map = presetMap('ashkar');
  const setup: GameSetup = {
    map,
    seed: 1,
    fog: false,
    noStartBases: true,
    noCreeps: true,
    script: { customVictory: true },
    players: [{ name: 'You', faction: (fac === 'neutral' ? 'crown' : fac) as FactionId, color: 1, team: 0, ai: false, difficulty: 'normal', start: 0 }, { name: 'B', faction: 'iron', color: 0, team: 1, ai: false, difficulty: 'normal', start: 1 }],
  };
  session = new GameSession(app, { setup, local: 0, settings, audio, title: 'Gallery', onExit: () => showMenu() });
  const w = session.world;
  // clear neutral buildings / units around the showcase area
  for (const e of w.entities) if (e.owner !== 0 && Math.abs(e.x - map.w / 2) < 22 && Math.abs(e.y - map.h / 2) < 16 && !e.def.goldMine) w.removeEntity(e);
  const defs = Object.values(DEFS).filter((d) => d.faction === fac && (params.has('b') ? d.kind === 'building' : d.kind === 'unit'));
  const cx = map.w / 2;
  const cy = map.h / 2;
  const cols = params.has('b') ? 5 : 7;
  defs.forEach((d, i) => {
    const x = cx - 12 + (i % cols) * (params.has('b') ? 6 : 3.4);
    const y = cy - 6 + Math.floor(i / cols) * (params.has('b') ? 6 : 3.6);
    if (d.kind === 'building') {
      for (let ty = Math.floor(y - 3); ty < y + 3; ty++) for (let tx = Math.floor(x - 3); tx < x + 3; tx++) { const t = w.map.treeAt[w.map.idx(tx, ty)]; if (t >= 0) w.map.removeTree(t); }
      w.spawnBuilding(d.id, 0, Math.round(x - (d.size ?? 2) / 2), Math.round(y - (d.size ?? 2) / 2), true);
    } else {
      const u = w.spawnUnit(d.id, 0, x, y, Math.PI / 2 + 0.6);
      u.lifetime = 0;
    }
  });
  session.renderer.camera.lookAt(cx, cy + 2);
  session.renderer.camera.setZoom(Number(params.get('z') || 26));
  session.start();
  (window as unknown as { game: GameSession }).game = session;
} else if (params.has('mission')) {
  startMission(params.get('mission')!);
} else {
  showMenu();
}

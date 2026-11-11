import { FACTIONS, ITEMS, lv } from '../data/registry';
import { ARMOR_TYPE_NAMES, ATTACK_TYPE_NAMES, HERO_MAX_LEVEL, upkeepFor } from '../data/rules';
import type { Entity } from '../sim/entity';
import type { GameEvent } from '../sim/events';
import type { World } from '../sim/world';
import { tierName } from '../sim/world';
import { xpForLevel } from '../sim/heroes';
import { PALETTES } from '../render/materials';
import { fmtTime } from '../util/math';
import { buildCard, type CmdButton, type UICtx, abilityTip } from './commands';
import { iconURL, resourceIcon } from './icons';
import { portraits } from './portraits';

export interface HudHost extends UICtx {
  selectIds(ids: number[], add?: boolean): void;
  centerOn(x: number, y: number): void;
  minimapOrder(x: number, y: number, queued: boolean): void;
  openMenu(): void;
  openAllies(): void;
  idleWorkers(): Entity[];
  selectIdleWorker(): void;
  heroes(): Entity[];
  focusHero(i: number, center: boolean): void;
  inventoryUse(slot: number): void;
  inventoryRight(slot: number): void;
  inventorySwap(from: number, to: number): void;
  cancelQueue(index: number): void;
  readonly cameraFootprint: { x: number; y: number }[];
  isTeamGame: boolean;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, parent?: HTMLElement, html?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  if (parent) parent.appendChild(e);
  return e;
}
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

export class Hud {
  readonly root: HTMLElement;
  private host: HudHost;
  private world: World;
  private goldEl: HTMLElement;
  private lumberEl: HTMLElement;
  private foodEl: HTMLElement;
  private upkeepEl: HTMLElement;
  private clockCanvas: HTMLCanvasElement;
  private timeEl: HTMLElement;
  private phaseEl: HTMLElement;
  private msgs: HTMLElement;
  private heroesEl: HTMLElement;
  private idleBtn: HTMLElement;
  private info: HTMLElement;
  private card: HTMLElement;
  private tooltip: HTMLElement;
  private mini: HTMLCanvasElement;
  private miniBg: HTMLCanvasElement;
  private fogCanvas: HTMLCanvasElement;
  private fogData: ImageData;
  private buttons: CmdButton[] = [];
  private cardSig = '';
  private infoSig = '';
  private infoTimer = 0;
  private miniTimer = 0;
  private pings: { x: number; y: number; t: number; color: string }[] = [];
  private heroSig = '';
  readonly dialogue: HTMLElement;
  readonly objectives: HTMLElement;
  private speedInd: HTMLElement;
  private pausedInd: HTMLElement;
  private tipTarget: HTMLElement | null = null;
  private lastMouse = { x: -1, y: -1 };
  private dragSlot = -1;
  private miniDragging = false;

  constructor(parent: HTMLElement, host: HudHost) {
    this.host = host;
    this.world = host.world;
    const r = el('div', 'hud', parent);
    this.root = r;
    // top bar
    const top = el('div', 'topbar', r);
    const left = el('div', 'tb-left', top);
    const menuBtn = el('button', 'tb-btn', left, 'Menu <span style="opacity:.6">F10</span>');
    menuBtn.onclick = () => host.openMenu();
    if (host.isTeamGame) {
      const allyBtn = el('button', 'tb-btn', left, 'Allies');
      allyBtn.onclick = () => host.openAllies();
    }
    const objBtn = el('button', 'tb-btn', left, 'Objectives');
    objBtn.onclick = () => {
      this.objectives.style.display = this.objectives.style.display === 'block' ? 'none' : 'block';
    };
    const clock = el('div', 'clock', r);
    this.clockCanvas = el('canvas', '', clock);
    this.clockCanvas.width = 68;
    this.clockCanvas.height = 68;
    const ct = el('div', '', clock);
    this.timeEl = el('div', 'time', ct, '8:00');
    this.phaseEl = el('div', 'phase', ct, 'Day');
    const right = el('div', 'tb-right', top);
    const res = (cls: string, icon: string) => {
      const d = el('div', 'res ' + cls, right);
      const img = el('img', '', d) as HTMLImageElement;
      img.src = icon;
      img.style.width = '20px';
      img.style.height = '20px';
      img.style.borderRadius = '4px';
      return el('span', '', d);
    };
    this.goldEl = res('gold', resourceIcon('gold'));
    this.lumberEl = res('lumber', resourceIcon('lumber'));
    this.foodEl = res('food', resourceIcon('food'));
    this.upkeepEl = el('div', 'upkeep u0', right, 'No Upkeep');
    this.upkeepEl.dataset.tip = '<h4>Upkeep</h4><div>Large armies reduce the gold your workers deliver.</div><div class="lv">0-50 food: 100% gold</div><div class="lv">51-80 food: 70% gold</div><div class="lv">81-100 food: 40% gold</div>';
    this.foodEl.parentElement!.dataset.tip = '<h4>Food</h4><div>Units consume food. Build more food structures to raise the limit (maximum 100).</div>';
    this.goldEl.parentElement!.dataset.tip = '<h4>Gold</h4><div>Mined from gold mines.</div>';
    this.lumberEl.parentElement!.dataset.tip = '<h4>Lumber</h4><div>Harvested from trees.</div>';

    this.msgs = el('div', 'messages', r);
    this.heroesEl = el('div', 'heroes', r);
    this.idleBtn = el('div', 'idle-btn', r);
    this.idleBtn.innerHTML = `<img src="${iconURL({ glyph: 'pick', bg: 0x6a5a2a })}"><span></span>`;
    this.idleBtn.dataset.tip = '<h4>Idle Workers</h4><div>Select an idle worker. Hotkey: <span class="kbd">F8</span></div>';
    this.idleBtn.onclick = () => host.selectIdleWorker();

    // bottom
    const bottom = el('div', 'bottom', r);
    const mw = el('div', 'minimap-wrap', bottom);
    this.mini = el('canvas', '', mw);
    this.mini.width = 400;
    this.mini.height = 400;
    this.info = el('div', 'info', bottom);
    this.card = el('div', 'cmdcard', bottom);
    this.tooltip = el('div', 'tooltip', r);
    this.dialogue = el('div', 'dialogue', r);
    this.objectives = el('div', 'objectives', r);
    this.speedInd = el('div', 'speed-ind', r);
    this.pausedInd = el('div', 'paused-ind', r, 'PAUSED');

    // minimap background
    const w = this.world;
    this.miniBg = document.createElement('canvas');
    this.miniBg.width = w.map.w;
    this.miniBg.height = w.map.h;
    this.renderMiniBg();
    this.fogCanvas = document.createElement('canvas');
    this.fogCanvas.width = w.map.w;
    this.fogCanvas.height = w.map.h;
    this.fogData = this.fogCanvas.getContext('2d')!.createImageData(w.map.w, w.map.h);

    this.bindEvents();
  }

  private bindEvents(): void {
    const host = this.host;
    // command card
    this.card.addEventListener('mousedown', (ev) => {
      const t = (ev.target as HTMLElement).closest('.cmd') as HTMLElement | null;
      if (!t) return;
      ev.preventDefault();
      ev.stopPropagation();
      const b = this.buttons.find((x) => x.slot === Number(t.dataset.slot));
      if (!b) return;
      if (ev.button === 2) b.right?.();
      else if (ev.button === 0) b.action();
      this.cardSig = '';
    });
    this.card.addEventListener('contextmenu', (e) => e.preventDefault());
    // info panel (multi-select cells, queue, inventory)
    this.info.addEventListener('mousedown', (ev) => {
      const t = ev.target as HTMLElement;
      const cell = t.closest('.mcell') as HTMLElement | null;
      if (cell) {
        ev.preventDefault();
        const id = Number(cell.dataset.id);
        if (ev.shiftKey) host.selectIds(host.selection.filter((e) => e.id !== id).map((e) => e.id));
        else host.selectIds([id]);
        return;
      }
      const q = t.closest('.qslot') as HTMLElement | null;
      if (q) {
        ev.preventDefault();
        host.cancelQueue(Number(q.dataset.i));
        return;
      }
      const slot = t.closest('.slot') as HTMLElement | null;
      if (slot) {
        ev.preventDefault();
        const i = Number(slot.dataset.i);
        if (ev.button === 2) host.inventoryRight(i);
        else {
          this.dragSlot = i;
          host.inventoryUse(i);
        }
      }
    });
    this.info.addEventListener('mouseup', (ev) => {
      const slot = (ev.target as HTMLElement).closest('.slot') as HTMLElement | null;
      if (slot && this.dragSlot >= 0) {
        const i = Number(slot.dataset.i);
        if (i !== this.dragSlot) host.inventorySwap(this.dragSlot, i);
      }
      this.dragSlot = -1;
    });
    this.info.addEventListener('contextmenu', (e) => e.preventDefault());
    // heroes
    this.heroesEl.addEventListener('mousedown', (ev) => {
      const b = (ev.target as HTMLElement).closest('.hero-btn') as HTMLElement | null;
      if (!b) return;
      ev.preventDefault();
      host.focusHero(Number(b.dataset.i), ev.detail >= 2);
    });
    // minimap
    const miniPos = (ev: MouseEvent) => {
      const r = this.mini.getBoundingClientRect();
      return { x: ((ev.clientX - r.left) / r.width) * this.world.map.w, y: ((ev.clientY - r.top) / r.height) * this.world.map.h };
    };
    this.mini.addEventListener('mousedown', (ev) => {
      ev.preventDefault();
      const p = miniPos(ev);
      if (ev.button === 2) {
        host.minimapOrder(p.x, p.y, ev.shiftKey);
        return;
      }
      if (host.targetMode && host.targetMode.kind !== 'cast') {
        host.minimapOrder(p.x, p.y, ev.shiftKey);
        return;
      }
      this.miniDragging = true;
      host.centerOn(p.x, p.y);
    });
    window.addEventListener('mousemove', (ev) => {
      if (this.miniDragging) {
        const p = miniPos(ev);
        host.centerOn(Math.max(0, Math.min(this.world.map.w, p.x)), Math.max(0, Math.min(this.world.map.h, p.y)));
      }
      this.updateTooltip(ev);
    });
    window.addEventListener('mouseup', () => (this.miniDragging = false));
    this.mini.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  // ---------------------------------------------------------------------------
  /** re-evaluate the tooltip after the element under a resting mouse was re-rendered */
  private refreshTooltip(): void {
    if (this.tooltip.style.display !== 'block' || this.lastMouse.x < 0) return;
    if (this.tipTarget && this.tipTarget.isConnected) return;
    const target = document.elementFromPoint(this.lastMouse.x, this.lastMouse.y);
    this.updateTooltip({ target, clientX: this.lastMouse.x, clientY: this.lastMouse.y } as unknown as MouseEvent);
  }

  private updateTooltip(ev: MouseEvent): void {
    this.lastMouse.x = ev.clientX;
    this.lastMouse.y = ev.clientY;
    let t = (ev.target as HTMLElement | null)?.closest?.('[data-tip], .cmd') as HTMLElement | null;
    if (t && !this.root.contains(t)) t = null;
    if (!t) {
      this.tooltip.style.display = 'none';
      this.tipTarget = null;
      return;
    }
    let html = t.dataset.tip ?? '';
    if (t.classList.contains('cmd')) {
      const b = this.buttons.find((x) => x.slot === Number(t!.dataset.slot));
      if (b) html = b.tip + `<div class="lv" style="margin-top:4px">Hotkey: <span class="kbd">${b.label}</span></div>`;
    }
    if (!html) {
      this.tooltip.style.display = 'none';
      return;
    }
    if (this.tipTarget !== t || this.tooltip.innerHTML !== html) this.tooltip.innerHTML = html;
    this.tipTarget = t;
    this.tooltip.style.display = 'block';
    const r = this.root.getBoundingClientRect();
    const tw = this.tooltip.offsetWidth;
    const th = this.tooltip.offsetHeight;
    let x = ev.clientX - r.left + 14;
    let y = ev.clientY - r.top - th - 14;
    if (x + tw > r.width - 6) x = r.width - tw - 6;
    if (y < 44) y = ev.clientY - r.top + 18;
    this.tooltip.style.left = x + 'px';
    this.tooltip.style.top = y + 'px';
  }

  message(text: string, kind: 'error' | 'info' | 'good' | 'warn' = 'info'): void {
    const m = el('div', 'msg ' + kind, this.msgs, esc(text));
    while (this.msgs.children.length > 5) this.msgs.firstChild!.remove();
    setTimeout(() => (m.style.opacity = '0'), 3200);
    setTimeout(() => m.remove(), 4000);
  }

  ping(x: number, y: number, color = '#ff4030'): void {
    this.pings.push({ x, y, t: 0, color });
  }

  setSpeed(speed: number, paused: boolean): void {
    this.speedInd.style.display = speed !== 1 ? 'block' : 'none';
    this.speedInd.textContent = `Speed ×${speed}`;
    this.pausedInd.style.display = paused ? 'block' : 'none';
  }

  handleEvents(events: GameEvent[]): void {
    const local = this.host.local;
    const w = this.world;
    for (const ev of events) {
      if (ev.t === 'msg' && ev.owner === local) this.message(ev.text, ev.kind === 'good' ? 'good' : ev.kind === 'info' ? 'info' : 'error');
      else if (ev.t === 'alert' && ev.owner === local) {
        this.ping(ev.x, ev.y);
        this.message(ev.kind === 'hero' ? 'Your hero is under attack!' : ev.kind === 'building' ? 'Your base is under attack!' : 'Your forces are under attack!', 'warn');
      } else if (ev.t === 'research' && ev.owner === local) this.message('Research complete', 'good');
      else if (ev.t === 'upgraded' && ev.owner === local) this.message(w.get(ev.id)?.def.name + ' upgrade complete', 'good');
      else if (ev.t === 'buildDone' && ev.owner === local) {
        const e = w.get(ev.id);
        if (e) this.message(e.def.name + ' construction complete', 'good');
      } else if (ev.t === 'heroDied' && ev.owner === local) this.message('Your hero has fallen! Revive them at an altar.', 'warn');
      else if (ev.t === 'playerDefeated' && ev.owner !== local) this.message(w.players[ev.owner].name + ' has been defeated', 'info');
      else if (ev.t === 'dialogue') this.queueDialogue(ev.speaker, ev.text, ev.duration ?? 7);
      else if (ev.t === 'objective') this.setObjective(ev.id, ev.text, !!ev.done, !!ev.failed);
    }
  }

  // ---------------------------------------------------------------------------
  update(dt: number): void {
    const w = this.world;
    const p = w.players[this.host.local];
    if (!p) return;
    this.goldEl.textContent = String(Math.floor(p.gold));
    this.lumberEl.textContent = String(Math.floor(p.lumber));
    this.foodEl.textContent = `${p.foodUsed}/${p.foodCap}`;
    this.foodEl.parentElement!.classList.toggle('full', p.foodUsed >= p.foodCap);
    const up = upkeepFor(p.foodUsed);
    this.upkeepEl.textContent = up.name;
    this.upkeepEl.className = 'upkeep u' + up.tier;
    this.drawClock();
    this.tickDialogue(dt);
    // command card
    this.buttons = buildCard(this.host);
    const sig = this.buttons.map((b) => `${b.slot}:${b.icon.length}:${b.icon.slice(-24)}:${b.disabled ? 1 : 0}:${b.autocast ? 1 : 0}:${b.cdText ?? ''}:${b.level ?? ''}:${b.unlearned ? 1 : 0}:${b.cost ?? ''}:${b.learn ? 1 : 0}`).join('|');
    if (sig !== this.cardSig) {
      this.cardSig = sig;
      this.renderCard();
    } else this.updateCooldowns();
    // throttled panels
    this.infoTimer -= dt;
    if (this.infoTimer <= 0) {
      this.infoTimer = 0.12;
      this.renderInfo();
      this.renderHeroes();
      const idle = this.host.idleWorkers().length;
      this.idleBtn.style.display = idle ? 'flex' : 'none';
      (this.idleBtn.querySelector('span') as HTMLElement).textContent = String(idle);
    }
    this.miniTimer -= dt;
    for (const pg of this.pings) pg.t += dt;
    this.pings = this.pings.filter((pg) => pg.t < 4);
    if (this.miniTimer <= 0) {
      this.miniTimer = 0.1;
      this.renderMinimap();
    }
  }

  private renderCard(): void {
    const slots: string[] = new Array(12).fill('');
    for (const b of this.buttons) {
      const cls = ['cmd'];
      if (b.disabled) cls.push('disabled');
      if (b.passive) cls.push('passive');
      if (b.unlearned) cls.push('unlearned');
      if (b.autocast) cls.push('autocast');
      if (b.active) cls.push('active-mode');
      if (b.learn) cls.push('learn');
      slots[b.slot] = `<button class="${cls.join(' ')}" data-slot="${b.slot}"><img src="${b.icon}"><span class="hk">${b.label}</span>${b.cost ? `<span class="cost">${b.cost}</span>` : ''}${b.level ? `<span class="lvl">${b.level}</span>` : ''}<div class="cdov" style="height:${Math.round((b.cd ?? 0) * 100)}%"></div>${b.cdText ? `<div class="cdtxt">${b.cdText}</div>` : ''}</button>`;
    }
    this.card.innerHTML = slots.map((s, i) => s || `<div data-empty="${i}"></div>`).join('');
    this.refreshTooltip();
  }

  private updateCooldowns(): void {
    for (const b of this.buttons) {
      if (b.cd === undefined) continue;
      const node = this.card.querySelector(`[data-slot="${b.slot}"] .cdov`) as HTMLElement | null;
      if (node) node.style.height = Math.round((b.cd ?? 0) * 100) + '%';
    }
  }

  private drawClock(): void {
    const w = this.world;
    const c = this.clockCanvas.getContext('2d')!;
    const S = 68;
    c.clearRect(0, 0, S, S);
    const night = w.night;
    const tod = w.tod;
    c.save();
    c.translate(S / 2, S / 2);
    c.fillStyle = night ? '#141a36' : '#5aa0e0';
    c.beginPath();
    c.arc(0, 0, 30, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = '#c9a85a';
    c.lineWidth = 3;
    c.stroke();
    const ang = (tod - 0.5) * Math.PI * 2 - Math.PI / 2;
    const x = Math.cos(ang) * 17;
    const y = Math.sin(ang) * 17;
    c.fillStyle = night ? '#dfe8ff' : '#ffd84a';
    c.beginPath();
    c.arc(night ? -x : x, night ? -y : y, 8, 0, Math.PI * 2);
    c.fill();
    if (night) {
      c.fillStyle = '#141a36';
      c.beginPath();
      c.arc(-x + 4, -y - 3, 7, 0, Math.PI * 2);
      c.fill();
    }
    c.restore();
    const hours = tod * 24;
    const h = Math.floor(hours);
    const m = Math.floor((hours - h) * 60);
    this.timeEl.textContent = `${h}:${m < 10 ? '0' : ''}${m}`;
    this.phaseEl.textContent = (w.forcedDay > 0 ? 'Dawnbreak' : night ? 'Night' : 'Day') + ' · ' + fmtTime(w.time);
  }

  private renderHeroes(): void {
    const heroes = this.host.heroes();
    const sel = new Set(this.host.selection.map((e) => e.id));
    const sig = heroes.map((h) => `${h.id}:${h.alive}:${h.hero!.level}:${h.hero!.skillPoints}:${sel.has(h.id)}:${Math.round((h.hp / h.st.maxHp) * 40)}:${Math.round((h.mana / Math.max(1, h.st.maxMana)) * 40)}`).join('|');
    if (sig === this.heroSig) return;
    this.heroSig = sig;
    const color = this.world.players[this.host.local].color;
    this.heroesEl.innerHTML = heroes
      .map((h, i) => {
        const hs = h.hero!;
        const hp = h.alive ? h.hp / h.st.maxHp : 0;
        const mp = h.st.maxMana > 0 ? h.mana / h.st.maxMana : 0;
        return `<div class="hero-btn${sel.has(h.id) ? ' sel' : ''}${h.alive ? '' : ' dead'}" data-i="${i}" data-tip="<h4>${esc(h.def.name)}</h4><div>Level ${hs.level} ${esc(h.def.hero!.title)}</div><div class='lv'>F${i + 1} to select, double-tap to center</div>">
          <img src="${portraits.get(h.def.id, color)}">
          <span class="lvl">${hs.level}</span><span class="pts" style="display:${hs.skillPoints > 0 && h.alive ? 'block' : 'none'}">${hs.skillPoints}</span>
          <span class="key">F${i + 1}</span>
          <div class="bars"><div class="bar"><div style="width:${Math.round(hp * 100)}%"></div></div><div class="bar mana"><div style="width:${Math.round(mp * 100)}%"></div></div></div>
        </div>`;
      })
      .join('');
  }

  // ---------------------------------------------------------------------------
  private renderInfo(): void {
    const host = this.host;
    const w = this.world;
    const sel = host.selection.filter((e) => !e.removed && (e.alive || (e.hero && !e.alive)));
    const color = (e: Entity) => (w.players[e.owner]?.isNeutral ? (w.players[e.owner].passive ? 0xb0a080 : 0x7a3a2a) : w.players[e.owner].color);
    let html = '';
    if (!sel.length) {
      const f = FACTIONS[w.players[host.local].faction];
      html = `<div class="stats"><h3>${esc(f.name)}</h3><div class="sub">${esc(f.description)}</div><div class="lv" style="font-size:12px;color:#a39d8e;margin-top:6px">Left-click or drag to select units. Right-click to move, attack or gather. Press <span class="kbd">F1</span> for your first hero.</div></div>`;
      if (html !== this.infoSig) {
        this.info.innerHTML = html;
        this.refreshTooltip();
        this.infoSig = html;
      }
      return;
    }
    if (sel.length > 1) {
      const cells = sel
        .slice(0, 12)
        .map((e) => {
          const hp = e.hp / e.st.maxHp;
          const col = hp > 0.6 ? '#4fdc4a' : hp > 0.3 ? '#e8c43a' : '#e8473a';
          return `<div class="mcell${e.def.id === host.activeType ? ' active' : ''}" data-id="${e.id}" data-tip="<h4>${esc(e.def.name)}</h4><div>${Math.ceil(e.hp)} / ${e.st.maxHp}</div>"><img src="${portraits.get(e.def.id, color(e))}"><div class="bar"><div style="width:${Math.round(hp * 100)}%;background:${col}"></div></div></div>`;
        })
        .join('');
      html = `<div class="multi">${cells}</div>`;
      if (html !== this.infoSig) {
        this.info.innerHTML = html;
        this.refreshTooltip();
        this.infoSig = html;
      }
      return;
    }
    const e = sel[0];
    const d = e.def;
    const st = e.st;
    let stats = '';
    const own = e.owner === host.local;
    const sub = e.hero ? `Level ${e.hero.level} ${esc(d.hero!.title)}` : e.b ? (e.b.constructing ? 'Under construction' : esc(w.players[e.owner]?.isNeutral ? 'Neutral' : w.players[e.owner].name)) : esc(w.players[e.owner]?.isNeutral ? (w.players[e.owner].passive ? 'Neutral' : 'Hostile creature · level ' + (d.level ?? 1)) : w.players[e.owner].name);
    let hpLine = `<div class="hpline"><span class="hp">${Math.ceil(Math.max(0, e.hp))} / ${st.maxHp}</span>${st.maxMana > 0 ? `<span class="mp">${Math.floor(e.mana)} / ${st.maxMana}</span>` : ''}</div>`;
    if (d.goldMine && e.b) hpLine = `<div class="hpline"><span style="color:var(--gold)">Gold remaining: ${Math.floor(e.b.gold)}</span></div>`;
    if (d.onMine && e.b) {
      const m = w.get(e.b.mine);
      hpLine += `<div class="hpline"><span style="color:var(--gold)">Gold remaining: ${Math.floor(m?.b?.gold ?? 0)}</span><span>Cultists: ${e.b.miners.length}/5</span></div>`;
    }
    if (d.goldMine && e.b && e.b.boundBy >= 0) hpLine += `<div class="hpline"><span>Spirits: ${e.b.miners.length}/5</span></div>`;
    if (d.weapon && !(e.b && e.b.constructing)) {
      const w0 = Math.round(st.dmgMin + st.dmgBonus);
      const w1 = Math.round(st.dmgMax + st.dmgBonus);
      const pct = st.dmgPct ? ` <span class="bonus">+${Math.round(st.dmgPct * 100)}%</span>` : '';
      stats += `<div data-tip="<h4>Attack</h4><div>${ATTACK_TYPE_NAMES[d.weapon.type]} damage. Cooldown ${st.cooldown.toFixed(2)}s. ${d.weapon.projectile ? 'Range ' + st.range.toFixed(1) : 'Melee'}.</div>"><img src="${iconURL({ glyph: d.weapon.projectile ? 'bow' : 'sword', bg: 0x5a3a2a })}">Damage <span class="v">${w0}-${w1}</span>${pct}</div>`;
    }
    if (!d.goldMine) stats += `<div data-tip="<h4>Armor</h4><div>${ARMOR_TYPE_NAMES[d.armorType]} armor. Each point reduces incoming physical damage.</div>"><img src="${iconURL({ glyph: 'shield', bg: 0x3a4a6a })}">Armor <span class="v">${st.armor.toFixed(st.armor % 1 ? 1 : 0)}</span> <span style="color:#a39d8e">${ARMOR_TYPE_NAMES[d.armorType]}</span></div>`;
    if (e.kind === 'unit' && d.speed) stats += `<div><img src="${iconURL({ glyph: 'boot', bg: 0x4a4a3a })}">Speed <span class="v">${st.speed.toFixed(1)}</span></div>`;
    if (e.kind === 'unit' && d.weapon?.projectile) stats += `<div><img src="${iconURL({ glyph: 'arrowUp', bg: 0x3a4a3a })}">Range <span class="v">${st.range.toFixed(1)}</span></div>`;
    if (e.b && d.foodProvided && !e.b.constructing) stats += `<div><img src="${resourceIcon('food')}">Provides <span class="v">${d.foodProvided}</span> food</div>`;
    let attrs = '';
    if (e.hero && d.hero) {
      const pr = d.hero.primary;
      const xpNow = e.hero.xp - xpForLevel(e.hero.level);
      const xpNeed = e.hero.level >= HERO_MAX_LEVEL ? 1 : xpForLevel(e.hero.level + 1) - xpForLevel(e.hero.level);
      const xpF = e.hero.level >= HERO_MAX_LEVEL ? 1 : Math.max(0, Math.min(1, xpNow / xpNeed));
      attrs = `<div class="attrs"><span class="${pr === 'str' ? 'p' : ''}" data-tip="<h4>Strength</h4><div>Each point grants health and health regeneration.</div>">STR ${st.str}</span><span class="${pr === 'agi' ? 'p' : ''}" data-tip="<h4>Agility</h4><div>Each point grants armor and attack speed.</div>">AGI ${st.agi}</span><span class="${pr === 'int' ? 'p' : ''}" data-tip="<h4>Intelligence</h4><div>Each point grants mana and mana regeneration.</div>">INT ${st.int}</span></div><div class="xpbar" data-tip="<h4>Experience</h4><div>${Math.floor(e.hero.xp)} XP${e.hero.level < HERO_MAX_LEVEL ? ' · next level at ' + xpForLevel(e.hero.level + 1) : ' · maximum level'}</div>"><div style="width:${Math.round(xpF * 100)}%"></div></div>`;
      if (!e.alive) attrs += `<div class="hpline" style="color:var(--bad)">Fallen${e.hero.reviving ? ' — reviving' : ' — revive at an altar or inn'}</div>`;
    }
    const buffs = e.buffs
      .filter((b) => !b.def.id.startsWith('creep'))
      .slice(0, 10)
      .map((b) => `<img class="${b.def.positive ? '' : 'neg'}" src="${iconURL(b.def.icon ?? { glyph: b.def.positive ? 'aura' : 'swirl', bg: b.def.positive ? 0x2a5a3a : 0x6a2a2a })}" data-tip="<h4>${esc(b.def.name)}</h4><div>${b.aura ? 'Aura' : Math.ceil(b.remaining) + 's remaining'}</div>">`)
      .join('');
    // building queue / construction
    let queue = '';
    if (e.b && own) {
      if (e.b.constructing) {
        queue = `<div class="queue"><span style="font-size:12px;color:#a39d8e">Construction</span><div class="qprog"><div style="width:${Math.round(e.b.progress * 100)}%"></div></div><span style="font-size:12px">${Math.round(e.b.progress * 100)}%</span></div>`;
      } else if (e.b.queue.length) {
        const q0 = e.b.queue[0];
        const pr = 1 - q0.time / q0.total;
        queue =
          `<div class="queue">` +
          e.b.queue
            .map((q, i) => {
              const ic = q.kind === 'unit' || q.kind === 'upgrade' ? portraits.get(q.id, color(e)) : q.kind === 'revive' ? portraits.get(w.get(Number(q.id))?.def.id ?? '', color(e)) : iconURL(UPGRADES_ICON(q.id));
              return `<div class="qslot${i === 0 ? ' first' : ''}" data-i="${i}" data-tip="<h4>Click to cancel</h4>"><img src="${ic}"></div>`;
            })
            .join('') +
          `<div class="qprog"><div style="width:${Math.round(pr * 100)}%"></div></div></div>`;
      } else if (e.b.garrison.length) {
        queue = `<div class="queue" style="font-size:12px">Sheltering ${e.b.garrison.length}/${d.garrison} Clanhands</div>`;
      } else if (d.fountain?.pool) {
        queue = `<div class="queue" style="font-size:12px">Stored moonlight: ${Math.floor(e.b.pool)} / ${d.fountain.pool}</div>`;
      }
      if (d.mainHall) queue += `<div style="font-size:11px;color:#a39d8e;margin-top:4px">${esc(tierName(w.players[e.owner].faction, d.hallTier ?? 1))} · tier ${d.hallTier ?? 1}</div>`;
    }
    if (e.lifetime > 0) queue += `<div style="font-size:12px;color:#c0b0ff">Expires in ${Math.ceil(e.lifetime)}s</div>`;
    let inv = '';
    if (e.hero) {
      const keys = ['Z', 'X', 'C', 'V', 'B', 'N'];
      inv =
        '<div class="inventory">' +
        e.hero.inventory
          .map((it, i) => {
            if (!it) return `<div class="slot" data-i="${i}"><span class="k">${keys[i]}</span></div>`;
            const ab = it.def.ability ? abilityTip_(it.def.ability) : '';
            const tip = `<h4>${esc(it.def.name)}</h4><div>${esc(it.def.description)}</div>${ab}<div class='lv'>${it.def.ability ? 'Click or press ' + keys[i] + ' to use. ' : ''}Right-click to drop or give. Drag to rearrange.</div>`;
            const cd = it.cd > 0 && it.def.ability ? `<div class="cd" style="height:${Math.round(Math.min(1, it.cd / Math.max(1, lv(abilityCd(it.def.ability), 1))) * 100)}%"></div>` : '';
            return `<div class="slot" data-i="${i}" data-tip="${tip.replace(/"/g, '&quot;')}"><img src="${iconURL(it.def.icon)}">${cd}<span class="k">${keys[i]}</span>${it.charges > 1 || (it.def.charges && it.def.charges > 1) ? `<span class="chg">${it.charges}</span>` : ''}</div>`;
          })
          .join('') +
        '</div>';
    }
    html = `<div class="portrait"><img src="${portraits.get(d.id, color(e))}"></div><div class="stats"><h3>${esc(d.name)}</h3><div class="sub">${sub}</div>${hpLine}${attrs}<div class="statgrid">${stats}</div><div class="buffs">${buffs}</div>${queue}</div>${inv}`;
    if (html !== this.infoSig) {
      this.info.innerHTML = html;
      this.refreshTooltip();
      this.infoSig = html;
    }
  }

  // ---------------------------------------------------------------------------
  private renderMiniBg(): void {
    const w = this.world;
    const map = w.map;
    const c = this.miniBg.getContext('2d')!;
    const img = c.createImageData(map.w, map.h);
    const pal = PALETTES[map.biome];
    for (let y = 0; y < map.h; y++)
      for (let x = 0; x < map.w; x++) {
        const i = y * map.w + x;
        let col = pal.terrain[map.terrain[i]] ?? pal.terrain[0];
        if (map.water[i]) col = map.water[i] === 2 ? pal.waterDeep : pal.water;
        if (map.cliff[i]) col = pal.rock;
        if (map.blight[i]) col = pal.blight;
        let r = (col >> 16) & 255;
        let g = (col >> 8) & 255;
        let b = col & 255;
        const shadeF = 0.85 + map.level[i] * 0.12 + (map.cliff[i] ? -0.15 : 0);
        if (map.treeAt[i] >= 0 && map.trees[map.treeAt[i]].alive) {
          r = 30;
          g = 70;
          b = 40;
        }
        img.data[i * 4] = Math.min(255, r * shadeF);
        img.data[i * 4 + 1] = Math.min(255, g * shadeF);
        img.data[i * 4 + 2] = Math.min(255, b * shadeF);
        img.data[i * 4 + 3] = 255;
      }
    c.putImageData(img, 0, 0);
    this.miniVersion = map.visualVersion;
  }
  private miniVersion = -1;

  private renderMinimap(): void {
    const w = this.world;
    const map = w.map;
    if (map.visualVersion !== this.miniVersion) this.renderMiniBg();
    const c = this.mini.getContext('2d')!;
    const S = this.mini.width;
    const sx = S / map.w;
    const sy = S / map.h;
    c.imageSmoothingEnabled = true;
    c.drawImage(this.miniBg, 0, 0, S, S);
    const p = w.players[this.host.local];
    const reveal = !w.fog || p.revealAll;
    // units and buildings
    for (const e of w.entities) {
      if (!e.alive || e.removed || e.inside >= 0 || e.kind === 'item') continue;
      const own = e.owner === this.host.local;
      const ally = w.isAlly(this.host.local, e.owner);
      if (!reveal && !own && !ally) {
        if (e.b) {
          // remembered buildings (explored)
          if (!p.explored[Math.floor(e.y) * map.w + Math.floor(e.x)]) continue;
          if (!(e.seenBy & (1 << this.host.local)) && !e.def.goldMine && !w.players[e.owner].passive) continue;
        } else if (!(e.seenBy & (1 << this.host.local))) continue;
      }
      const pl = w.players[e.owner];
      let col = pl.isNeutral ? (pl.passive ? '#e0c060' : '#d0d0d0') : '#' + pl.color.toString(16).padStart(6, '0');
      if (e.def.goldMine) col = '#ffd040';
      if (e.b) {
        const s = Math.max(3, e.b.size * sx);
        c.fillStyle = '#000';
        c.fillRect(e.x * sx - s / 2 - 1, e.y * sy - s / 2 - 1, s + 2, s + 2);
        c.fillStyle = col;
        c.fillRect(e.x * sx - s / 2, e.y * sy - s / 2, s, s);
      } else {
        const s = e.hero ? 7 : Math.max(3.5, e.radius * 2 * sx);
        c.fillStyle = col;
        c.fillRect(e.x * sx - s / 2, e.y * sy - s / 2, s, s);
      }
    }
    // fog overlay
    if (!reveal) {
      const d = this.fogData.data;
      for (let i = 0; i < map.w * map.h; i++) {
        const a = p.visible[i] ? 0 : p.explored[i] ? 120 : 255;
        d[i * 4] = 4;
        d[i * 4 + 1] = 5;
        d[i * 4 + 2] = 8;
        d[i * 4 + 3] = a;
      }
      this.fogCanvas.getContext('2d')!.putImageData(this.fogData, 0, 0);
      c.drawImage(this.fogCanvas, 0, 0, S, S);
    }
    // camera footprint
    const fp = this.host.cameraFootprint;
    if (fp.length === 4) {
      c.strokeStyle = 'rgba(255,255,255,0.9)';
      c.lineWidth = 2;
      c.beginPath();
      fp.forEach((q, i) => (i ? c.lineTo(q.x * sx, q.y * sy) : c.moveTo(q.x * sx, q.y * sy)));
      c.closePath();
      c.stroke();
    }
    // pings
    for (const pg of this.pings) {
      const k = (pg.t % 1) / 1;
      c.strokeStyle = pg.color;
      c.globalAlpha = 1 - k;
      c.lineWidth = 3;
      c.beginPath();
      c.arc(pg.x * sx, pg.y * sy, 6 + k * 26, 0, Math.PI * 2);
      c.stroke();
      c.globalAlpha = 1;
    }
  }

  // ---------------------------------------------------------------------------
  // campaign dialogue and objectives
  // ---------------------------------------------------------------------------
  private dq: { speaker: string; text: string; dur: number }[] = [];
  private dTimer = 0;
  private objList = new Map<string, { text: string; done: boolean; failed: boolean }>();

  private queueDialogue(speaker: string, text: string, dur: number): void {
    this.dq.push({ speaker, text, dur });
    if (this.dTimer <= 0) this.nextDialogue();
  }

  private nextDialogue(): void {
    const d = this.dq.shift();
    if (!d) {
      this.dialogue.style.display = 'none';
      this.dTimer = 0;
      return;
    }
    this.dTimer = d.dur;
    this.dialogue.style.display = 'flex';
    const initials = d.speaker
      .split(' ')
      .map((w) => w[0])
      .slice(-2)
      .join('');
    this.dialogue.innerHTML = `<div style="width:64px;height:64px;border-radius:10px;border:1px solid #6a5a3a;background:radial-gradient(circle at 40% 35%,#5a4a2a,#1a1410);display:flex;align-items:center;justify-content:center;font-family:var(--title);font-size:24px;color:#f3e2b0;flex:none">${esc(initials)}</div><div><div class="who">${esc(d.speaker)}</div><div class="txt">${esc(d.text)}</div><div class="skip">Click to continue</div></div>`;
    this.dialogue.onclick = () => this.nextDialogue();
  }

  tickDialogue(dt: number): void {
    if (this.dTimer > 0) {
      this.dTimer -= dt;
      if (this.dTimer <= 0) this.nextDialogue();
    }
  }

  private setObjective(id: string, text: string, done: boolean, failed: boolean): void {
    const prev = this.objList.get(id);
    this.objList.set(id, { text, done, failed });
    if (!prev) this.message('New objective: ' + text, 'good');
    else if (done && !prev.done) this.message('Objective complete: ' + text, 'good');
    else if (failed && !prev.failed) this.message('Objective failed: ' + text, 'warn');
    this.objectives.style.display = 'block';
    this.objectives.innerHTML =
      '<h4>Objectives</h4>' +
      [...this.objList.values()].map((o) => `<div class="o${o.done ? ' done' : ''}${o.failed ? ' failed' : ''}">${o.done ? '✔' : o.failed ? '✖' : '◆'} ${esc(o.text)}</div>`).join('');
  }

  showEnd(html: string): void {
    const o = el('div', 'overlay', this.root);
    o.innerHTML = html;
  }
}

import { ABILITIES, UPGRADES } from '../data/registry';
function UPGRADES_ICON(id: string) {
  return UPGRADES[id]?.icon ?? { glyph: 'arrowUp', bg: 0x444444 };
}
function abilityTip_(id: string): string {
  const a = ABILITIES[id];
  return a ? `<div class='lv'>${esc(a.name)}${a.cooldown ? ' · ' + lv(a.cooldown, 1) + 's cooldown' : ''}</div>` : '';
}
function abilityCd(id: string) {
  return ABILITIES[id]?.cooldown ?? 1;
}
void ITEMS;
void abilityTip;

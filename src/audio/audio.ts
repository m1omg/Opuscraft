import type { FactionId } from '../data/types';
import type { Entity } from '../sim/entity';
import type { GameEvent } from '../sim/events';
import type { World } from '../sim/world';
import type { Settings } from '../settings';

type Theme = FactionId | 'menu';

const NOTE = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

interface ThemeDef {
  tempo: number;
  root: number; // midi
  scale: number[];
  progression: number[][]; // chord degrees (scale steps)
  lead: 'brass' | 'horn' | 'choir' | 'flute' | 'strings';
  drums: 'march' | 'tribal' | 'toll' | 'soft' | 'none';
  pad: 'strings' | 'drone' | 'choir' | 'glass';
  arp: boolean;
}

const THEMES: Record<Theme, ThemeDef> = {
  crown: { tempo: 92, root: 50, scale: [0, 2, 4, 5, 7, 9, 11], progression: [[0, 2, 4], [4, 6, 8], [5, 7, 9], [3, 5, 7]], lead: 'brass', drums: 'march', pad: 'strings', arp: false },
  iron: { tempo: 100, root: 45, scale: [0, 3, 5, 7, 10], progression: [[0, 2, 4], [0, 2, 4], [3, 5, 7], [1, 3, 5]], lead: 'horn', drums: 'tribal', pad: 'drone', arp: false },
  sepulchral: { tempo: 66, root: 40, scale: [0, 1, 3, 5, 7, 8, 10], progression: [[0, 2, 4], [1, 3, 5], [5, 7, 9], [6, 8, 10]], lead: 'choir', drums: 'toll', pad: 'choir', arp: false },
  twilight: { tempo: 76, root: 53, scale: [0, 2, 4, 6, 7, 9, 11], progression: [[0, 2, 4], [5, 7, 9], [3, 5, 7], [4, 6, 8]], lead: 'flute', drums: 'soft', pad: 'glass', arp: true },
  menu: { tempo: 84, root: 50, scale: [0, 2, 3, 5, 7, 8, 10], progression: [[0, 2, 4], [5, 7, 9], [2, 4, 6], [4, 6, 8]], lead: 'strings', drums: 'march', pad: 'strings', arp: true },
};

const LINES: Record<FactionId, { wSel: string[]; wOrd: string[]; sel: string[]; ord: string[]; atk: string[] }> = {
  crown: {
    wSel: ['Yes, my liege?', 'Ready to work.', 'What needs doing?'],
    wOrd: ['Right away.', 'As you wish.', 'On my way.'],
    sel: ['For the Crown!', 'Orders, commander?', 'Standing ready.', 'At your command.'],
    ord: ['Moving out.', 'Understood.', 'Forward!'],
    atk: ['Charge!', 'To arms!', 'For the League!'],
  },
  iron: {
    wSel: ['Yes, chief?', 'What you need?', 'Hrm?'],
    wOrd: ['Going.', 'Fine, fine.', 'I do it.'],
    sel: ['Blood and iron!', 'Point me at them.', 'Ready to fight!'],
    ord: ['We march.', 'Yes, chief!', 'Moving.'],
    atk: ['Crush them!', 'For the clans!', 'Smash!'],
  },
  sepulchral: {
    wSel: ['We obey.', 'The dark calls.', 'Speak, master.'],
    wOrd: ['It is done.', 'As the Conclave wills.', 'We go.'],
    sel: ['Death is patient.', 'Command us.', 'We hunger.'],
    ord: ['It shall be done.', 'Onward.', 'We follow.'],
    atk: ['Feed the grave!', 'None escape.', 'Join us in death!'],
  },
  twilight: {
    wSel: ['The forest listens.', 'Yes?', 'We are here.'],
    wOrd: ['Swift as wind.', 'Gladly.', 'It will grow.'],
    sel: ['By moon and leaf.', 'Ready.', 'The grove stands with you.'],
    ord: ['Moving swiftly.', 'As you say.', 'Through the trees.'],
    atk: ['For the grove!', 'Strike true!', 'Let them fall!'],
  },
};

/** lines when the same unit is clicked again and again */
const ANNOYED: Record<FactionId, string[]> = {
  crown: ['Yes, I am still here.', 'Is there a problem, commander?', 'Poking me will not win the war.', 'I have a sword, you know.'],
  iron: ['Stop poking!', 'You want fight with me?', 'Chief, I am busy being strong.', 'Grr. Again?'],
  sepulchral: ['I was dead already. This is worse.', 'Your touch is colder than mine.', 'Patience is a virtue of the grave.', 'Again? Truly?'],
  twilight: ['Even the oldest oak grows weary.', 'I am not a drum.', 'Gently, please.', 'The wind is less restless than you.'],
};

/** heroes speak their own lines */
const HERO_LINES: Record<string, { sel: string[]; ord: string[]; atk: string[] }> = {
  cr_h_marshal: { sel: ['The line holds while I stand.', 'Marshal, reporting.', 'Give the word.'], ord: ['Form up behind me.', 'We advance.', 'On my mark.'], atk: ['Shields high, blades out!', 'Break them!', 'For the League!'] },
  cr_h_lightwarden: { sel: ['The dawn is near.', 'Light keeps us.', 'I am listening.'], ord: ['Where the light leads.', 'I will go.', 'Walk with me.'], atk: ['Burn in the dawn!', 'Begone, darkness!', 'By the first light!'] },
  cr_h_thane: { sel: ['Powder is dry, barrel is clean.', 'What needs shooting?', 'Aye?'], ord: ['Hauling my gear.', 'Right then.', 'Lead on.'], atk: ['Fire in the hole!', 'Line it up!', 'Steady... now!'] },
  ir_h_warlord: { sel: ['The clans follow strength.', 'Speak quickly.', 'My axe is thirsty.'], ord: ['The warband moves.', 'Ha! Good.', 'Follow me!'], atk: ['Feel the earth shake!', 'For the clans!', 'Crush them all!'] },
  ir_h_beastcaller: { sel: ['The beasts are restless.', 'I hear the wild.', 'Yes?'], ord: ['The pack moves.', 'I track them.', 'Silent feet.'], atk: ['Hunt!', 'Tear them down!', 'The pack strikes!'] },
  ir_h_storm: { sel: ['The sky speaks to me.', 'Thunder waits.', 'The spirits listen.'], ord: ['Riding the wind.', 'The storm follows.', 'So it shall be.'], atk: ['Lightning take you!', 'Feel the storm!', 'Spirits, strike!'] },
  sep_h_gravelord: { sel: ['Every grave answers me.', 'I rose for this.', 'Command me.'], ord: ['The dead march.', 'Onward to the grave.', 'Lead them to me.'], atk: ['Your bones are mine!', 'Kneel in the dirt!', 'Rise no more!'] },
  sep_h_witch: { sel: ['Whispers, whispers.', 'The rot is beautiful.', 'Yesss?'], ord: ['I drift.', 'Where the fog goes.', 'Mmm, yes.'], atk: ['Wither!', 'Your blood runs cold!', 'Choke on it!'] },
  sep_h_shadowblade: { sel: ['From the shadows.', 'Name the target.', 'Unseen, unheard.'], ord: ['Vanishing.', 'They will not see me.', 'Quietly.'], atk: ['Behind you.', 'One cut is enough.', 'Too slow.'] },
  tw_h_ranger: { sel: ['My bow is strung.', 'The moon guides my aim.', 'I see far.'], ord: ['Swift and silent.', 'Through the canopy.', 'I am gone.'], atk: ['Mark them!', 'Loose!', 'None outrun the moonlight!'] },
  tw_h_keeper: { sel: ['The forest remembers.', 'Roots run deep.', 'Peace, friend.'], ord: ['The grove guides me.', 'Patiently.', 'I will tend to it.'], atk: ['The wild rises!', 'Roots, hold them!', 'Nature answers!'] },
  tw_h_wildheart: { sel: ['The beast within stirs.', 'Ready to run.', 'Hmm?'], ord: ['Running!', 'On four feet or two.', 'Wild and free.'], atk: ['Claws out!', 'Rrraagh!', 'Into the fray!'] },
  nh_djinn: { sel: ['You summoned a flame. Speak.', 'The embers listen.', 'Coin first, then fire.'], ord: ['I drift like smoke.', 'As the fire wills.', 'Mmm, warm.'], atk: ['Burn!', 'Ashes to ashes!', 'Feel the heat!'] },
  nh_tinker: { sel: ['Gears are turning!', 'Need something built?', 'Tinkerer at your service.'], ord: ['Clanking along!', 'Calculating route.', 'Wind me up!'], atk: ['Deploy the contraption!', 'Tick, tock, boom!', 'Engineering!'] },
  nh_reaver: { sel: ['The wastes made me.', 'Speak, paymaster.', 'I hunger for battle.'], ord: ['Through fire and ash.', 'Fine.', 'I go.'], atk: ['Reap!', 'Into the ash!', 'Fall!'] },
};
const NEUTRAL_TONE = { pitch: 0.85, rate: 0.95 };

const VOICE_TONE: Record<FactionId, { pitch: number; rate: number }> = {
  crown: { pitch: 1.0, rate: 1.0 },
  iron: { pitch: 0.55, rate: 0.9 },
  sepulchral: { pitch: 0.35, rate: 0.8 },
  twilight: { pitch: 1.35, rate: 0.95 },
};

export class AudioEngine {
  settings: Settings;
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private ambBus: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private theme: Theme | null = null;
  private musicTimer = 0;
  private nextNoteTime = 0;
  private beat = 0;
  private cx = 0;
  private cy = 0;
  private zoom = 27;
  private recent = new Map<string, number>();
  private active = 0;
  private lastVoice = 0;
  private night = false;
  private ambT = 0;
  private melodyNote = 0;

  constructor(settings: Settings) {
    this.settings = settings;
  }

  /** Create the audio context on the first user gesture. */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AC();
    } catch {
      return;
    }
    const ctx = this.ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.ratio.value = 4;
    this.master = ctx.createGain();
    this.master.connect(comp);
    comp.connect(ctx.destination);
    this.sfxBus = ctx.createGain();
    this.musicBus = ctx.createGain();
    this.ambBus = ctx.createGain();
    this.sfxBus.connect(this.master);
    this.musicBus.connect(this.master);
    this.ambBus.connect(this.master);
    const len = ctx.sampleRate * 1.5;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.setVolumes(this.settings);
    if (this.theme) this.playTheme(this.theme);
  }

  setVolumes(s: Settings): void {
    this.settings = s;
    if (!this.ctx) return;
    this.master!.gain.value = s.master;
    this.sfxBus!.gain.value = s.sfx * 0.9;
    this.musicBus!.gain.value = s.music * 0.5;
    this.ambBus!.gain.value = s.sfx * 0.35;
  }

  // ---------------------------------------------------------------------------
  // music
  // ---------------------------------------------------------------------------
  menuMusic(): void {
    this.playTheme('menu');
  }
  startGame(f: FactionId): void {
    this.playTheme(f);
  }
  stopMusic(): void {
    this.theme = null;
    if (this.musicTimer) clearInterval(this.musicTimer);
    this.musicTimer = 0;
  }

  private playTheme(t: Theme): void {
    this.theme = t;
    if (!this.ctx) return;
    if (this.musicTimer) clearInterval(this.musicTimer);
    this.nextNoteTime = this.ctx.currentTime + 0.2;
    this.beat = 0;
    this.musicTimer = window.setInterval(() => this.schedule(), 90);
  }

  private schedule(): void {
    const ctx = this.ctx;
    if (!ctx || !this.theme || ctx.state !== 'running') return;
    const th = THEMES[this.theme];
    const spb = 60 / th.tempo / 2; // eighth notes
    while (this.nextNoteTime < ctx.currentTime + 0.35) {
      this.music8th(th, this.beat, this.nextNoteTime, spb);
      this.nextNoteTime += spb;
      this.beat++;
    }
  }

  private music8th(th: ThemeDef, beat: number, t: number, spb: number): void {
    const bar = Math.floor(beat / 8);
    const pos = beat % 8;
    const chord = th.progression[Math.floor(bar / 2) % th.progression.length];
    const deg = (d: number) => {
      const n = th.scale.length;
      const o = Math.floor(d / n);
      return th.root + th.scale[((d % n) + n) % n] + o * 12;
    };
    const section = Math.floor(bar / 8) % 4; // vary intensity in long cycles
    // pad at the start of each chord
    if (pos === 0 && bar % 2 === 0) {
      for (const d of chord) this.pad(NOTE(deg(d) + 12), t, spb * 16, th.pad);
      this.bass(NOTE(deg(chord[0]) - 12), t, spb * 7, th);
    }
    if (pos === 4 && th.drums !== 'toll') this.bass(NOTE(deg(chord[0]) - 12), t, spb * 3, th);
    // percussion
    switch (th.drums) {
      case 'march':
        if (pos === 0 || pos === 4) this.drum('kick', t, 0.5);
        if (pos === 2 || pos === 6) this.drum('snare', t, 0.25);
        if (section > 0 && (pos === 7 || pos === 5)) this.drum('snare', t, 0.12);
        break;
      case 'tribal':
        if (pos === 0 || pos === 3 || pos === 6) this.drum('tom', t, 0.55);
        if (pos === 4) this.drum('kick', t, 0.6);
        if (section > 1 && pos % 2 === 1) this.drum('hand', t, 0.2);
        break;
      case 'toll':
        if (pos === 0 && bar % 2 === 0) this.bell(NOTE(deg(chord[0])), t, 0.25);
        if (pos === 0) this.drum('kick', t, 0.25);
        break;
      case 'soft':
        if (pos === 0) this.drum('hand', t, 0.18);
        if (pos === 5) this.drum('hand', t, 0.1);
        break;
    }
    // arpeggio
    if (th.arp && section !== 3) {
      const d = chord[pos % 3] + (pos >= 4 ? 7 : 0);
      this.pluck(NOTE(deg(d) + 12), t, spb * 2, 0.08);
    }
    // melody: sparse random walk over the scale, phrased in 2-bar sentences
    if (section !== 0 || bar % 4 >= 2) {
      const rhythm = [1, 0, 0, 1, 0, 1, 0, 0];
      if (rhythm[pos] && Math.random() < 0.85) {
        const target = chord[Math.floor(Math.random() * 3)];
        this.melodyNote += Math.sign(target + 7 - this.melodyNote) * (Math.random() < 0.6 ? 1 : 2);
        this.melodyNote = Math.max(3, Math.min(13, this.melodyNote));
        const len = pos === 0 ? spb * 3 : spb * 2;
        this.lead(NOTE(deg(this.melodyNote) + 12), t, len, th.lead);
      }
    }
  }

  private env(g: GainNode, t: number, a: number, peak: number, dur: number, rel: number): void {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
    g.gain.setValueAtTime(Math.max(0.0002, peak), t + Math.max(a, dur - rel));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }

  private osc(type: OscillatorType, f: number, t: number, dur: number, dest: AudioNode, detune = 0): OscillatorNode {
    const o = this.ctx!.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    o.detune.value = detune;
    o.connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
    return o;
  }

  private pad(f: number, t: number, dur: number, kind: ThemeDef['pad']): void {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    const flt = ctx.createBiquadFilter();
    flt.type = 'lowpass';
    flt.frequency.value = kind === 'glass' ? 2400 : kind === 'choir' ? 1100 : 1400;
    flt.connect(g);
    g.connect(this.musicBus!);
    this.env(g, t, dur * 0.25, kind === 'drone' ? 0.05 : 0.035, dur, dur * 0.3);
    if (kind === 'choir') {
      for (const dt of [-8, 0, 7]) this.osc('triangle', f, t, dur, flt, dt);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 700;
      bp.Q.value = 2;
    } else if (kind === 'glass') {
      this.osc('sine', f, t, dur, flt, 0);
      this.osc('sine', f * 2, t, dur, flt, 4);
    } else {
      this.osc('sawtooth', f, t, dur, flt, -9);
      this.osc('sawtooth', f, t, dur, flt, 9);
    }
  }

  private bass(f: number, t: number, dur: number, th: ThemeDef): void {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    const flt = ctx.createBiquadFilter();
    flt.type = 'lowpass';
    flt.frequency.value = th.pad === 'drone' ? 500 : 380;
    flt.connect(g);
    g.connect(this.musicBus!);
    this.env(g, t, 0.02, 0.11, dur, dur * 0.5);
    this.osc(th.pad === 'drone' ? 'sawtooth' : 'triangle', f, t, dur, flt);
  }

  private lead(f: number, t: number, dur: number, kind: ThemeDef['lead']): void {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    const flt = ctx.createBiquadFilter();
    flt.type = 'lowpass';
    g.connect(this.musicBus!);
    flt.connect(g);
    const vib = ctx.createOscillator();
    const vg = ctx.createGain();
    vib.frequency.value = 5.2;
    vg.gain.value = kind === 'flute' ? 5 : 3;
    vib.connect(vg);
    vib.start(t);
    vib.stop(t + dur + 0.1);
    let o: OscillatorNode;
    switch (kind) {
      case 'brass':
      case 'horn':
        flt.frequency.setValueAtTime(400, t);
        flt.frequency.linearRampToValueAtTime(kind === 'brass' ? 2200 : 1200, t + 0.08);
        flt.frequency.linearRampToValueAtTime(900, t + dur);
        this.env(g, t, 0.05, kind === 'horn' ? 0.07 : 0.06, dur, 0.15);
        o = this.osc('sawtooth', kind === 'horn' ? f / 2 : f, t, dur, flt);
        break;
      case 'choir':
        flt.frequency.value = 900;
        this.env(g, t, 0.25, 0.05, dur * 1.6, 0.4);
        o = this.osc('triangle', f, t, dur * 1.6, flt);
        this.osc('triangle', f * 1.003, t, dur * 1.6, flt);
        break;
      case 'flute':
        flt.frequency.value = 3000;
        this.env(g, t, 0.06, 0.06, dur, 0.15);
        o = this.osc('sine', f * 2, t, dur, flt);
        break;
      default:
        flt.frequency.value = 1800;
        this.env(g, t, 0.12, 0.045, dur * 1.3, 0.3);
        o = this.osc('sawtooth', f, t, dur * 1.3, flt, -6);
        this.osc('sawtooth', f, t, dur * 1.3, flt, 6);
    }
    vg.connect(o.frequency);
  }

  private pluck(f: number, t: number, dur: number, vol: number): void {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    g.connect(this.musicBus!);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur * 1.5);
    this.osc('triangle', f, t, dur * 1.5, g);
    const g2 = ctx.createGain();
    g2.connect(this.musicBus!);
    g2.gain.setValueAtTime(vol * 0.4, t);
    g2.gain.exponentialRampToValueAtTime(0.0001, t + dur * 0.6);
    this.osc('sine', f * 2, t, dur, g2);
  }

  private bell(f: number, t: number, vol: number): void {
    const ctx = this.ctx!;
    for (const [mult, v, d] of [
      [1, 1, 3.5],
      [2.76, 0.5, 2.2],
      [5.4, 0.25, 1.2],
    ]) {
      const g = ctx.createGain();
      g.connect(this.musicBus!);
      g.gain.setValueAtTime(vol * v, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      this.osc('sine', f * mult, t, d, g);
    }
  }

  private noise(t: number, dur: number, dest: AudioNode): AudioBufferSourceNode {
    const s = this.ctx!.createBufferSource();
    s.buffer = this.noiseBuf;
    s.loop = true;
    s.connect(dest);
    s.start(t, Math.random() * 0.5);
    s.stop(t + dur + 0.05);
    return s;
  }

  private drum(kind: 'kick' | 'snare' | 'tom' | 'hand', t: number, vol: number, bus?: AudioNode): void {
    const ctx = this.ctx!;
    const out = bus ?? this.musicBus!;
    if (kind === 'kick' || kind === 'tom') {
      const g = ctx.createGain();
      g.connect(out);
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + (kind === 'kick' ? 0.45 : 0.35));
      const o = this.osc('sine', kind === 'kick' ? 110 : 160, t, 0.5, g);
      o.frequency.exponentialRampToValueAtTime(kind === 'kick' ? 40 : 80, t + 0.3);
      return;
    }
    const g = ctx.createGain();
    const f = ctx.createBiquadFilter();
    f.type = kind === 'snare' ? 'highpass' : 'bandpass';
    f.frequency.value = kind === 'snare' ? 1800 : 600;
    f.Q.value = kind === 'hand' ? 2 : 0.7;
    f.connect(g);
    g.connect(out);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (kind === 'snare' ? 0.18 : 0.12));
    this.noise(t, 0.2, f);
  }

  // ---------------------------------------------------------------------------
  // sound effects
  // ---------------------------------------------------------------------------
  private gate(key: string, minGap: number): boolean {
    const now = this.ctx ? this.ctx.currentTime : 0;
    const last = this.recent.get(key) ?? -10;
    if (now - last < minGap) return false;
    this.recent.set(key, now);
    return true;
  }

  /** Volume for a world position (0 when far away). */
  private spatial(x: number, y: number): number {
    const d = Math.hypot(x - this.cx, y - this.cy);
    const r = this.zoom * 0.95;
    if (d > r * 1.6) return 0;
    const z = Math.max(0.35, Math.min(1.2, 30 / this.zoom));
    return Math.max(0, 1 - Math.max(0, d - r * 0.5) / r) * z;
  }

  private sfxOut(vol: number): GainNode | null {
    if (!this.ctx || this.ctx.state !== 'running' || vol <= 0.01 || this.active > 28) return null;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    g.connect(this.sfxBus!);
    this.active++;
    setTimeout(() => {
      this.active--;
      g.disconnect();
    }, 1600);
    return g;
  }

  play(name: string, vol = 1, x?: number, y?: number): void {
    if (!this.ctx) return;
    const v = x !== undefined && y !== undefined ? vol * this.spatial(x, y) : vol;
    const out = this.sfxOut(v);
    if (!out) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.005;
    const nz = (dur: number, type: BiquadFilterType, freq: number, q: number, peak: number, attack = 0.002) => {
      const g = ctx.createGain();
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      f.connect(g);
      g.connect(out);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      this.noise(t, dur, f);
      return f;
    };
    const tone = (type: OscillatorType, f0: number, f1: number, dur: number, peak: number, delay = 0) => {
      const g = ctx.createGain();
      g.connect(out);
      g.gain.setValueAtTime(0.0001, t + delay);
      g.gain.exponentialRampToValueAtTime(peak, t + delay + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + delay + dur);
      const o = this.osc(type, f0, t + delay, dur, g);
      if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + delay + dur);
    };
    switch (name) {
      case 'blade':
        nz(0.12, 'bandpass', 3200, 1.5, 0.35);
        for (const f of [1870, 2630, 3910]) tone('square', f * (0.95 + Math.random() * 0.1), f * 0.98, 0.18, 0.025);
        break;
      case 'blunt':
        nz(0.15, 'lowpass', 600, 1, 0.6);
        tone('sine', 140, 60, 0.15, 0.3);
        break;
      case 'pierce':
        nz(0.07, 'bandpass', 1500, 3, 0.4);
        break;
      case 'magicHit':
        tone('sine', 900, 1500, 0.2, 0.12);
        nz(0.2, 'highpass', 5000, 0.7, 0.1);
        break;
      case 'arrow':
        nz(0.14, 'bandpass', 2500, 4, 0.25, 0.03);
        break;
      case 'gun':
        nz(0.18, 'lowpass', 2200, 0.8, 0.8);
        tone('square', 180, 60, 0.08, 0.15);
        break;
      case 'magicShot':
        tone('triangle', 500, 1100, 0.18, 0.1);
        nz(0.15, 'bandpass', 4000, 2, 0.06);
        break;
      case 'catapult':
        nz(0.3, 'lowpass', 400, 1, 0.5, 0.02);
        tone('sine', 90, 50, 0.25, 0.3);
        break;
      case 'explosion':
        nz(0.9, 'lowpass', 800, 0.7, 0.9, 0.005);
        tone('sine', 80, 30, 0.6, 0.6);
        break;
      case 'heal':
        [0, 0.07, 0.14].forEach((d, i) => tone('sine', [660, 880, 1320][i], [660, 880, 1320][i], 0.4, 0.07, d));
        break;
      case 'holy':
        [0, 0.05, 0.1, 0.15].forEach((d, i) => tone('triangle', [523, 659, 784, 1046][i], [523, 659, 784, 1046][i], 0.7, 0.06, d));
        nz(0.6, 'highpass', 6000, 0.7, 0.05, 0.1);
        break;
      case 'fire':
        nz(0.6, 'bandpass', 900, 0.8, 0.5, 0.05);
        tone('sawtooth', 120, 80, 0.4, 0.06);
        break;
      case 'frost':
        nz(0.5, 'highpass', 4000, 1, 0.25, 0.02);
        [0, 0.06].forEach((d) => tone('sine', 1760 + Math.random() * 400, 2200, 0.3, 0.05, d));
        break;
      case 'lightning':
        nz(0.35, 'highpass', 1200, 0.6, 0.7, 0.002);
        tone('sawtooth', 70, 40, 0.35, 0.25);
        break;
      case 'nature':
        nz(0.5, 'bandpass', 1800, 3, 0.15, 0.08);
        [0, 0.08].forEach((d, i) => tone('sine', [784, 988][i], [880, 1175][i], 0.4, 0.05, d));
        break;
      case 'necro':
        tone('sawtooth', 110, 55, 0.7, 0.08);
        tone('sine', 220, 110, 0.7, 0.08);
        nz(0.7, 'lowpass', 500, 2, 0.2, 0.1);
        break;
      case 'arcane':
        [0, 0.05, 0.1].forEach((d, i) => tone('sine', [988, 1319, 1760][i], [1480, 1976, 2637][i], 0.3, 0.05, d));
        break;
      case 'summon':
        tone('triangle', 200, 600, 0.6, 0.08);
        nz(0.6, 'bandpass', 1200, 1, 0.12, 0.2);
        break;
      case 'death':
        nz(0.25, 'lowpass', 500, 1, 0.35);
        tone('sine', 160, 70, 0.25, 0.12);
        break;
      case 'collapse':
        nz(1.4, 'lowpass', 400, 0.7, 0.9, 0.02);
        tone('sine', 60, 30, 1.2, 0.5);
        break;
      case 'chop':
        nz(0.06, 'bandpass', 900, 4, 0.5);
        tone('sine', 300, 200, 0.05, 0.12);
        break;
      case 'coin':
        tone('square', 1568, 1568, 0.07, 0.03);
        tone('square', 2093, 2093, 0.12, 0.03, 0.06);
        break;
      case 'build':
        for (let i = 0; i < 2; i++) nz(0.05, 'bandpass', 1400, 5, 0.4);
        break;
      case 'ready':
        tone('triangle', 784, 784, 0.15, 0.12);
        tone('triangle', 1175, 1175, 0.3, 0.12, 0.12);
        break;
      case 'fanfare':
        [0, 0.12, 0.24, 0.42].forEach((d, i) => tone('sawtooth', [523, 659, 784, 1046][i], [523, 659, 784, 1046][i], i === 3 ? 0.6 : 0.2, 0.07, d));
        break;
      case 'research':
        [0, 0.1, 0.2].forEach((d, i) => tone('triangle', [660, 880, 990][i], [660, 880, 990][i], 0.35, 0.09, d));
        break;
      case 'levelup':
        [0, 0.08, 0.16, 0.24, 0.32].forEach((d, i) => tone('triangle', [523, 659, 784, 1046, 1319][i], [523, 659, 784, 1046, 1319][i], 0.45, 0.08, d));
        break;
      case 'alert':
        tone('sawtooth', 220, 210, 0.5, 0.12);
        tone('sawtooth', 330, 320, 0.6, 0.09, 0.15);
        break;
      case 'herodeath':
        tone('sine', 196, 196, 2.2, 0.25);
        tone('sine', 196 * 2.76, 196 * 2.76, 1.4, 0.1);
        break;
      case 'error':
        tone('square', 180, 150, 0.15, 0.06);
        break;
      case 'click':
        tone('triangle', 900, 700, 0.05, 0.08);
        break;
      case 'item':
        [0, 0.06, 0.12].forEach((d, i) => tone('sine', [1046, 1568, 2093][i], [1046, 1568, 2093][i], 0.25, 0.06, d));
        break;
      case 'victory':
        [0, 0.2, 0.4, 0.7, 0.9].forEach((d, i) => tone('sawtooth', [392, 523, 659, 784, 1046][i], [392, 523, 659, 784, 1046][i], i === 4 ? 1.6 : 0.3, 0.08, d));
        break;
      case 'defeat':
        [0, 0.4, 0.8].forEach((d, i) => tone('sawtooth', [392, 349, 262][i], [392, 349, 262][i], i === 2 ? 1.8 : 0.5, 0.08, d));
        break;
      case 'chirp':
        tone('sine', 3200 + Math.random() * 800, 4200, 0.08, 0.03);
        tone('sine', 3600, 4800, 0.06, 0.025, 0.1);
        break;
      case 'cricket':
        for (let i = 0; i < 3; i++) tone('square', 4400, 4400, 0.02, 0.01, i * 0.05);
        break;
    }
  }

  ui(kind: string): void {
    if (kind === 'error') {
      if (this.gate('uierr', 0.4)) this.play('error', 0.8);
    } else this.play('click', 0.6);
  }

  stinger(k: 'victory' | 'defeat'): void {
    this.stopMusic();
    this.play(k, 1);
  }

  // ---------------------------------------------------------------------------
  update(dt: number, x: number, y: number, dist: number, night: boolean): void {
    this.cx = x;
    this.cy = y;
    this.zoom = dist;
    this.night = night;
    if (!this.ctx) return;
    this.ambT -= dt;
    if (this.ambT <= 0) {
      this.ambT = 0.8 + Math.random() * 2.5;
      if (this.ctx.state === 'running' && this.ambBus && this.settings.sfx > 0) {
        // ambience routed through the ambience bus
        const keep = this.sfxBus;
        this.sfxBus = this.ambBus;
        this.play(night ? 'cricket' : 'chirp', 0.5);
        this.sfxBus = keep;
      }
    }
  }

  handleEvents(w: World, events: GameEvent[], local: number): void {
    if (!this.ctx || this.ctx.state !== 'running') return;
    for (const ev of events) {
      switch (ev.t) {
        case 'attack': {
          const s = w.get(ev.src);
          if (!s || !ev.ranged || !w.tileVisible(local, s.x, s.y)) break;
          const k = s.def.weapon?.projectile?.kind;
          const snd = k === 'bullet' ? 'gun' : k === 'orb' || k === 'bolt' ? 'magicShot' : k === 'boulder' || k === 'shell' || k === 'bone' || k === 'seed' ? 'catapult' : 'arrow';
          if (this.gate('shot' + snd, 0.06)) this.play(snd, 0.7, s.x, s.y);
          break;
        }
        case 'hit': {
          const t = w.get(ev.tgt);
          if (!t || !w.tileVisible(local, t.x, t.y)) break;
          if (ev.atk === 'spell') break;
          const src = w.get(ev.src);
          const ranged = !!src?.def.weapon?.projectile;
          const snd = ev.atk === 'magic' ? 'magicHit' : ev.atk === 'siege' ? 'blunt' : ranged ? 'pierce' : t.b ? 'blunt' : 'blade';
          if (this.gate('hit' + snd, 0.05)) this.play(snd, 0.55, t.x, t.y);
          break;
        }
        case 'death': {
          const e = w.get(ev.id);
          if (!e || !w.tileVisible(local, e.x, e.y)) break;
          if (e.b) this.play('collapse', 1, e.x, e.y);
          else if (this.gate('death', 0.12)) this.play('death', 0.6, e.x, e.y);
          break;
        }
        case 'cast': {
          const e = w.get(ev.id);
          if (!e || !w.tileVisible(local, e.x, e.y)) break;
          this.play(spellSound(ev.ability), 0.8, e.x, e.y);
          break;
        }
        case 'fx': {
          if (!w.tileVisible(local, ev.x, ev.y)) break;
          if (ev.fx === 'explosion' || ev.fx === 'meteor' || ev.fx === 'shellstrike') {
            if (this.gate('boom', 0.12)) this.play('explosion', 0.8, ev.x, ev.y);
          } else if (ev.fx === 'splash') {
            if (this.gate('splash', 0.1)) this.play('blunt', 0.6, ev.x, ev.y);
          } else if (ev.fx === 'lightning' || ev.fx === 'lightningStrike') {
            if (this.gate('zap', 0.1)) this.play('lightning', 0.7, ev.x, ev.y);
          } else if (ev.fx === 'summonBuilding' || ev.fx === 'root' || ev.fx === 'uproot') this.play('summon', 0.6, ev.x, ev.y);
          break;
        }
        case 'chop': {
          const e = w.get(ev.id);
          if (e && e.owner === local && this.gate('chop', 0.25)) this.play('chop', 0.35, e.x, e.y);
          break;
        }
        case 'deposit': {
          if (ev.owner !== local || ev.res !== 'gold') break;
          const e = w.get(ev.id);
          if (e && this.gate('coin', 0.5)) this.play('coin', 0.25, e.x, e.y);
          break;
        }
        case 'buildDone':
          if (ev.owner === local) this.play('fanfare', 0.8);
          break;
        case 'trained':
          if (ev.owner === local) {
            this.play('ready', 0.7);
            const e = w.get(ev.id);
            if (e) this.say(e, 'sel', true);
          }
          break;
        case 'research':
          if (ev.owner === local) this.play('research', 0.8);
          break;
        case 'upgraded':
          if (ev.owner === local) this.play('fanfare', 0.8);
          break;
        case 'levelUp': {
          const e = w.get(ev.id);
          if (e && e.owner === local) this.play('levelup', 0.8);
          break;
        }
        case 'alert':
          if (ev.owner === local && this.gate('alert', 4)) this.play('alert', 0.9);
          break;
        case 'heroDied':
          if (ev.owner === local) this.play('herodeath', 0.9);
          break;
        case 'item':
          if (ev.owner === local) this.play('item', 0.7);
          break;
        case 'msg':
          if (ev.owner === local && ev.kind !== 'good' && ev.kind !== 'info') this.ui('error');
          break;
        default:
          break;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // voices
  // ---------------------------------------------------------------------------
  /** `repeat` counts quick re-selections of the same unit; units grow testy after a few */
  voiceSelect(e: Entity, repeat = 0): void {
    if (repeat >= 4) this.say(e, 'annoyed', true);
    else this.say(e, 'sel');
  }

  voiceOrder(e: Entity, attack: boolean): void {
    this.say(e, attack ? 'atk' : 'ord');
  }

  private say(e: Entity, kind: 'sel' | 'ord' | 'atk' | 'annoyed', force = false): void {
    if (!this.settings.voices || this.settings.voice <= 0.01 || this.settings.master <= 0.01) return;
    if (typeof speechSynthesis === 'undefined') return;
    const f = e.def.faction;
    if (!HERO_LINES[e.def.id] && (f === 'neutral' || !LINES[f as FactionId])) return;
    const now = performance.now();
    if (!force && now - this.lastVoice < 1400) return;
    if (!force && kind !== 'atk' && Math.random() < 0.35) return;
    this.lastVoice = now;
    const L = LINES[f as FactionId];
    const H = HERO_LINES[e.def.id];
    const pool =
      kind === 'annoyed'
        ? (ANNOYED[f as FactionId] ?? ANNOYED.crown)
        : H
          ? H[kind]
          : kind === 'sel'
            ? e.isWorker
              ? L.wSel
              : L.sel
            : kind === 'atk'
              ? L.atk
              : e.isWorker
                ? L.wOrd
                : L.ord;
    const text = pool[Math.floor(Math.random() * pool.length)];
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      const tone = VOICE_TONE[f as FactionId] ?? NEUTRAL_TONE;
      const big = e.radius > 0.6 ? 0.8 : 1;
      u.pitch = Math.max(0.1, Math.min(2, tone.pitch * big * (e.hero ? 0.9 : 1)));
      u.rate = tone.rate;
      u.volume = this.settings.voice * this.settings.master;
      speechSynthesis.speak(u);
    } catch {
      /* speech unavailable */
    }
  }
}

function spellSound(id: string): string {
  if (/radiant|dawn|sanct|light|mend|ward|halo|laststand|banner/.test(id)) return 'holy';
  if (/fire|ember|inferno|cinder|soulburn|flame/.test(id)) return 'fire';
  if (/chill|frost/.test(id)) return 'frost';
  if (/lightning|forked|tempest|thunder|storm/.test(id)) return 'lightning';
  if (/thorn|renewal|root|sapling|verdant|wrath|moon|grove|nightveil|trample|wild/.test(id)) return 'nature';
  if (/raise|bone|plague|wither|corpse|army|soul|grave|pestil|devour|wail|fade|shadow|cuts/.test(id)) return 'necro';
  if (/chrono|shackle|blink|weave|arcane/.test(id)) return 'arcane';
  if (/summon|boars|turret|totem/.test(id)) return 'summon';
  if (/heal|spiritmend/.test(id)) return 'heal';
  return 'arcane';
}

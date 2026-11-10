export interface Settings {
  master: number;
  music: number;
  sfx: number;
  voice: number;
  voices: boolean;
  shadows: boolean;
  quality: number;
  pixelRatio: number;
  edgeScroll: boolean;
  scrollSpeed: number;
  alwaysBars: boolean;
  gameSpeed: number;
}

export const DEFAULT_SETTINGS: Settings = {
  master: 0.8,
  music: 0.45,
  sfx: 0.8,
  voice: 0.7,
  voices: true,
  shadows: true,
  quality: 1,
  pixelRatio: 1.5,
  edgeScroll: true,
  scrollSpeed: 1,
  alwaysBars: false,
  gameSpeed: 1,
};

const KEY = 'opuscraft.settings.v1';

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    /* storage unavailable */
  }
  return { ...DEFAULT_SETTINGS };
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable */
  }
}

const PROGRESS = 'opuscraft.campaign.v1';
export function loadProgress(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(PROGRESS);
    if (raw) return JSON.parse(raw) as Record<string, boolean>;
  } catch {
    /* ignore */
  }
  return {};
}
export function saveProgress(p: Record<string, boolean>): void {
  try {
    localStorage.setItem(PROGRESS, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

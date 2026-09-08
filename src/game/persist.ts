// Persistence: progress, settings, and in-flight game state in localStorage.

import type { Powerups } from "./session";

const KEY_PROGRESS = "mj2.progress.v1";
const KEY_SETTINGS = "mj2.settings.v1";
const KEY_SESSION = "mj2.session.v1";

export interface LevelRecord {
  stars: number;
  score: number;
}

export interface Progress {
  /** highest unlocked 1-based level */
  unlocked: number;
  /** per-level best results */
  levels: Record<string, LevelRecord>;
  powerups: Powerups;
  totalScore: number;
}

export interface Settings {
  muted: boolean;
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return { ...fallback, ...(JSON.parse(raw) as object) } as T;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable (private mode) — play without persistence */
  }
}

export function loadProgress(): Progress {
  const p = read<Progress>(KEY_PROGRESS, {
    unlocked: 1,
    levels: {},
    powerups: { hints: 3, shuffles: 2, undos: 5 },
    totalScore: 0,
  });
  if (!p.levels) p.levels = {};
  if (!p.powerups) p.powerups = { hints: 3, shuffles: 2, undos: 5 };
  return p;
}

export function saveProgress(p: Progress) {
  write(KEY_PROGRESS, p);
}

export function loadSettings(): Settings {
  // sound off by default (personal preference); persisted override wins
  return read<Settings>(KEY_SETTINGS, { muted: true });
}

export function saveSettings(s: Settings) {
  write(KEY_SETTINGS, s);
}

export interface SavedSession {
  level: number;
  layoutId: string;
  faces: number[];
  historyLen: number;
  buffer: Array<{ face: number; idx: number }>;
  score: number;
  combo: number;
  hintsUsed: number;
  shufflesUsed: number;
  undosUsed: number;
  powerups: Powerups;
}

export function saveSession(s: SavedSession) {
  write(KEY_SESSION, s);
}

export function loadSession(): SavedSession | null {
  try {
    const raw = localStorage.getItem(KEY_SESSION);
    return raw ? (JSON.parse(raw) as SavedSession) : null;
  } catch {
    return null;
  }
}

export function clearSession() {
  try {
    localStorage.removeItem(KEY_SESSION);
  } catch {
    /* ignore */
  }
}

import { CONFIG } from './config';

/** Player-chosen options kept on this device. Pure helpers so they can be unit-tested. */
export interface Settings {
  /** index into CONFIG.settings.cameraSpeeds */
  camSpeed: number;
  invertY: boolean;
  muted: boolean;
}

export const DEFAULT_SETTINGS: Settings = { camSpeed: CONFIG.settings.defaultCameraSpeed, invertY: false, muted: false };

/** Reads saved settings, falling back to defaults for anything missing or malformed. */
export function parseSettings(raw: string | null): Settings {
  const s = { ...DEFAULT_SETTINGS };
  if (!raw) return s;
  let o: unknown;
  try {
    o = JSON.parse(raw);
  } catch {
    return s;
  }
  if (!o || typeof o !== 'object') return s;
  const r = o as Record<string, unknown>;
  const n = CONFIG.settings.cameraSpeeds.length;
  if (typeof r.camSpeed === 'number' && Number.isInteger(r.camSpeed) && r.camSpeed >= 0 && r.camSpeed < n) s.camSpeed = r.camSpeed;
  if (typeof r.invertY === 'boolean') s.invertY = r.invertY;
  if (typeof r.muted === 'boolean') s.muted = r.muted;
  return s;
}

export function nextCamSpeed(i: number): number {
  return (i + 1) % CONFIG.settings.cameraSpeeds.length;
}

export function camSpeedLabel(i: number): string {
  return CONFIG.settings.cameraSpeeds[i]?.label ?? 'Normal';
}

/** Per-axis multipliers applied to look input (pixels of drag/mouse movement). */
export function lookScale(s: Settings): { x: number; y: number } {
  const k = CONFIG.settings.cameraSpeeds[s.camSpeed]?.scale ?? 1;
  return { x: k, y: s.invertY ? -k : k };
}

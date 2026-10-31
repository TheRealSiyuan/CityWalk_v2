import { CONFIG } from './config';

/**
 * Ghost of your best race run: a compact recording of where you were during the run, replayed
 * as a translucent runner next time you race the same route. Pure data, no rendering.
 */
export interface GhostPose {
  x: number;
  y: number;
  z: number;
  yaw: number;
  anim: number;
  speed: number;
  anchor: { x: number; y: number; z: number } | null;
}

/** One frame: x, y, z, yaw, anim, speed, then the rope anchor x, y, z when roped. */
type Frame = number[];

export interface Ghost {
  v: 1;
  dt: number; // seconds between frames
  time: number; // the finishing time this ghost ran
  frames: Frame[];
  splits?: number[]; // race time at each checkpoint
}

const r1 = (n: number) => Math.round(n * 10) / 10 || 0; // || 0: no -0
const r2 = (n: number) => Math.round(n * 100) / 100 || 0;

export class GhostRecorder {
  frames: Frame[] = [];
  private full = false;
  readonly dt = 1 / CONFIG.ghost.sampleHz;

  reset(): void {
    this.frames = [];
    this.full = false;
  }

  /** Call every frame while the race clock runs; keeps one sample per `dt` of race time. */
  record(raceTime: number, p: GhostPose): void {
    if (this.full) return;
    while (this.frames.length * this.dt <= raceTime + 1e-9) {
      if (this.frames.length >= CONFIG.ghost.maxFrames) {
        this.full = true; // too long a run to keep; no ghost for it
        return;
      }
      const f: Frame = [r1(p.x), r1(p.y), r1(p.z), r2(p.yaw), p.anim, r1(p.speed)];
      if (p.anchor) f.push(r1(p.anchor.x), r1(p.anchor.y), r1(p.anchor.z));
      this.frames.push(f);
    }
  }

  /** The finished recording, or null if the run was too long to keep. */
  finish(time: number, splits: number[] = []): Ghost | null {
    if (this.full || this.frames.length < 2) return null;
    return { v: 1, dt: this.dt, time, frames: this.frames, splits: splits.map(r2) };
  }
}

export function encodeGhost(g: Ghost): string {
  return JSON.stringify(g);
}

/** Parse a stored ghost; anything malformed (old format, hand-edited, truncated) is null. */
export function decodeGhost(s: string | null): Ghost | null {
  if (!s) return null;
  try {
    const g = JSON.parse(s) as Ghost;
    if (g?.v !== 1 || !(g.dt > 0) || !(g.time > 0) || !Array.isArray(g.frames) || g.frames.length < 2) return null;
    if (g.splits !== undefined && (!Array.isArray(g.splits) || !g.splits.every((n) => typeof n === 'number' && Number.isFinite(n)))) return null;
    for (const f of g.frames) {
      if (!Array.isArray(f) || (f.length !== 6 && f.length !== 9) || !f.every((n) => typeof n === 'number' && Number.isFinite(n))) return null;
    }
    return g;
  } catch {
    return null;
  }
}

function lerpAngle(a: number, b: number, t: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

/** The ghost's pose at race time `t` (held at the last frame once it has finished). */
export function ghostPose(g: Ghost, t: number, out: GhostPose): GhostPose {
  const last = g.frames.length - 1;
  const ft = Math.max(0, Math.min(last, t / g.dt));
  const i = Math.min(last - 1, Math.floor(ft));
  const k = ft - i;
  const a = g.frames[i];
  const b = g.frames[i + 1];
  out.x = a[0] + (b[0] - a[0]) * k;
  out.y = a[1] + (b[1] - a[1]) * k;
  out.z = a[2] + (b[2] - a[2]) * k;
  out.yaw = lerpAngle(a[3], b[3], k);
  const near = k < 0.5 ? a : b;
  out.anim = near[4];
  out.speed = a[5] + (b[5] - a[5]) * k;
  out.anchor = near.length === 9 ? { x: near[6], y: near[7], z: near[8] } : null;
  return out;
}

/** Seconds ahead (+) or behind (-) of the ghost, given the checkpoint you just reached. */
export function splitDelta(mine: number, ghostSplits: number[] | undefined, index: number): number | null {
  const g = ghostSplits?.[index];
  return g === undefined ? null : g - mine;
}

/**
 * Live gap to the ghost between checkpoints: seconds ahead (+) or behind (-), or null when it
 * can't be judged (no splits, or you are far off the ghost's path). Finds where the ghost
 * passed closest to you on the current leg and compares the clocks there; when the ghost
 * lingered in one spot, the moment nearest your own clock is used, so standing together reads 0.
 */
export function liveDelta(g: Ghost, leg: number, x: number, z: number, t: number): number | null {
  if (!g.splits || leg < 0 || leg >= g.splits.length) return null;
  const last = g.frames.length - 1;
  const from = Math.max(0, Math.floor((leg > 0 ? g.splits[leg - 1] : 0) / g.dt));
  const to = Math.min(last, Math.ceil(g.splits[leg] / g.dt));
  if (to < from) return null;
  const d2 = (i: number) => (g.frames[i][0] - x) ** 2 + (g.frames[i][2] - z) ** 2;
  let min = Infinity;
  for (let i = from; i <= to; i++) min = Math.min(min, d2(i));
  if (Math.sqrt(min) > CONFIG.ghost.liveMaxOffPath) return null;
  const tol = (Math.sqrt(min) + CONFIG.ghost.liveTieMetres) ** 2;
  let best = -1;
  for (let i = from; i <= to; i++) {
    if (d2(i) <= tol && (best < 0 || Math.abs(i * g.dt - t) < Math.abs(best * g.dt - t))) best = i;
  }
  return best * g.dt - t;
}

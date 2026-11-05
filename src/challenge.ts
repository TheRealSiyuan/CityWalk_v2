import { CONFIG } from './config';
import type { Ghost } from './ghost';
import { dailyRoute, type Route } from './race';

/**
 * "Race my ghost": a daily-race run packed small enough to travel in a link. Only the path,
 * animation, rope and clock survive (facing and speed are rebuilt from the path). The rope is
 * the first thing dropped if a run won't fit. The link's contents are untrusted: anything
 * malformed decodes to null.
 */
export interface Challenge {
  day: string; // UTC day, e.g. "2026-11-03"; the route is generated from it
  route: Route;
  ghost: Ghost;
}

const FORMAT = 2; // 2 added the rope; links already shared in format 1 still open
const OLDEST_FORMAT = 1;
const QUANT = 2; // position units per metre
const CS = 100; // clock units per second
const MS_PER_DAY = 86_400_000;
const MAX_DAY = 100_000; // around the year 2243; keeps the date valid
const MAX_VARINT = 2 ** 31;

class Writer {
  bytes: number[] = [];
  uint(n: number): void {
    while (n >= 0x80) {
      this.bytes.push((n % 0x80) | 0x80);
      n = Math.floor(n / 0x80);
    }
    this.bytes.push(n);
  }
  sint(n: number): void {
    this.uint(n >= 0 ? n * 2 : -n * 2 - 1);
  }
}

class Reader {
  private at = 0;
  constructor(private bytes: Uint8Array) {}
  get done(): boolean {
    return this.at === this.bytes.length;
  }
  uint(): number {
    let n = 0;
    let scale = 1;
    for (;;) {
      if (this.at >= this.bytes.length) throw new Error('truncated');
      const b = this.bytes[this.at++];
      n += (b & 0x7f) * scale;
      if (n >= MAX_VARINT) throw new Error('too large');
      if (b < 0x80) return n;
      scale *= 0x80;
    }
  }
  sint(): number {
    const n = this.uint();
    return n % 2 ? -(n + 1) / 2 : n / 2;
  }
}

function toCode(bytes: number[]): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromCode(code: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(code)) throw new Error('bad characters');
  const bin = atob(code.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

function pack(day: string, g: Ghost, step: number, withRope: boolean): string {
  const w = new Writer();
  w.uint(FORMAT);
  w.uint(Math.round(Date.parse(day) / MS_PER_DAY));
  w.uint(Math.round(g.time * CS));
  const splits = g.splits ?? [];
  w.uint(splits.length);
  let lastSplit = 0;
  for (const s of splits) {
    const cs = Math.round(s * CS);
    w.uint(Math.max(0, cs - lastSplit));
    lastSplit = Math.max(lastSplit, cs);
  }
  // keep every step-th frame, and the final one so the ghost still reaches the finish
  const frames = g.frames.filter((_, i) => i % step === 0);
  if ((g.frames.length - 1) % step !== 0) frames.push(g.frames[g.frames.length - 1]);
  w.uint(Math.round(g.dt * step * 1000)); // milliseconds between kept frames
  w.uint(frames.length);
  let px = 0;
  let py = 0;
  let pz = 0;
  for (const f of frames) {
    const x = Math.round(f[0] * QUANT);
    const y = Math.round(f[1] * QUANT);
    const z = Math.round(f[2] * QUANT);
    w.sint(x - px);
    w.sint(y - py);
    w.sint(z - pz);
    px = x;
    py = y;
    pz = z;
  }
  // animation as runs: it changes far less often than the position
  for (let i = 0; i < frames.length; ) {
    let j = i + 1;
    while (j < frames.length && frames[j][4] === frames[i][4]) j++;
    w.uint(j - i);
    w.uint(frames[i][4]);
    i = j;
  }
  // rope as runs too: one anchor for each swing, measured from the runner at its first frame
  const rope = (f: number[]): number[] | null => (withRope && f.length === 9 ? f.slice(6, 9).map((n) => Math.round(n * QUANT)) : null);
  for (let i = 0; i < frames.length; ) {
    const a = rope(frames[i]);
    let j = i + 1;
    while (j < frames.length && String(rope(frames[j])) === String(a)) j++;
    w.uint((j - i) * 2 + (a ? 1 : 0));
    if (a) for (let k = 0; k < 3; k++) w.sint(a[k] - Math.round(frames[i][k] * QUANT));
    i = j;
  }
  return toCode(w.bytes);
}

/**
 * The code for this run at the finest frame rate that fits a link, or null if none does. A run
 * too busy to fit with its rope at any frame rate is sent without it: better than no link.
 */
export function encodeChallenge(day: string, g: Ghost): string | null {
  if (!Number.isFinite(Date.parse(day))) return null;
  for (const withRope of [true, false]) {
    for (const step of CONFIG.challenge.frameSteps) {
      const code = pack(day, g, step, withRope);
      if (code.length <= CONFIG.challenge.maxChars) return code;
    }
  }
  return null;
}

/** Rebuild facing and speed, which a link does not carry, from the direction of travel. */
function rebuild(points: { x: number; y: number; z: number; anim: number }[], dt: number): number[][] {
  const frames: number[][] = [];
  let yaw = 0;
  for (let i = points.length - 1; i >= 0; i--) {
    const a = points[Math.min(i, points.length - 2)];
    const b = points[Math.min(i + 1, points.length - 1)];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 0.01) yaw = Math.atan2(dx, dz); // standing still: keep the way it faces next
    const p = points[i];
    frames[i] = [p.x, p.y, p.z, yaw, p.anim, dist / dt];
  }
  return frames;
}

/** Parse a code from a link. Null for anything malformed, whatever it contains. */
export function decodeChallenge(code: string | null | undefined): Challenge | null {
  if (!code || code.length > CONFIG.challenge.maxChars) return null;
  try {
    const r = new Reader(fromCode(code));
    const format = r.uint();
    if (format < OLDEST_FORMAT || format > FORMAT) return null;
    const dayNo = r.uint();
    if (dayNo > MAX_DAY) return null;
    const day = new Date(dayNo * MS_PER_DAY).toISOString().slice(0, 10);
    const time = r.uint() / CS;
    if (!(time > 0)) return null;
    const route = dailyRoute(day);
    const splitCount = r.uint();
    if (splitCount !== route.stops.length) return null;
    const splits: number[] = [];
    let cs = 0;
    for (let i = 0; i < splitCount; i++) {
      cs += r.uint();
      splits.push(cs / CS);
    }
    if (splits[splitCount - 1] > time + 0.011) return null;
    const ms = r.uint();
    if (ms < 1 || ms > 10_000) return null;
    const dt = ms / 1000;
    const count = r.uint();
    if (count < 2 || count > CONFIG.ghost.maxFrames) return null;
    const points: { x: number; y: number; z: number; anim: number }[] = [];
    let x = 0;
    let y = 0;
    let z = 0;
    for (let i = 0; i < count; i++) {
      x += r.sint();
      y += r.sint();
      z += r.sint();
      points.push({ x: x / QUANT, y: y / QUANT, z: z / QUANT, anim: 0 });
    }
    for (let i = 0; i < count; ) {
      const run = r.uint();
      const anim = r.uint();
      if (run < 1 || i + run > count) return null;
      for (let j = 0; j < run; j++) points[i + j].anim = anim;
      i += run;
    }
    const frames = rebuild(points, dt);
    if (format >= 2) {
      for (let i = 0; i < count; ) {
        const head = r.uint();
        const run = Math.floor(head / 2);
        if (run < 1 || i + run > count) return null;
        if (head % 2) {
          const ax = points[i].x + r.sint() / QUANT;
          const ay = points[i].y + r.sint() / QUANT;
          const az = points[i].z + r.sint() / QUANT;
          for (let j = 0; j < run; j++) frames[i + j].push(ax, ay, az);
        }
        i += run;
      }
    }
    if (!r.done) return null;
    return { day, route, ghost: { v: 1, dt, time, frames, splits } };
  } catch {
    return null;
  }
}

/** The challenge code carried by a page's `location.hash`, if any. */
export function challengeFromHash(hash: string): string | null {
  const m = /^#c=([^&]*)$/.exec(hash);
  return m ? m[1] : null;
}

/** How a finished run compares with the friend's. */
export function rivalLine(mine: number, theirs: number): string {
  const gap = Math.abs(mine - theirs).toFixed(1);
  if (gap === '0.0') return 'Dead level with your friend!';
  return mine < theirs ? `You beat your friend by ${gap} s` : `Your friend was ${gap} s faster`;
}

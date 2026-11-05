import { describe, expect, it } from 'vitest';
import { challengeFromHash, decodeChallenge, encodeChallenge, rivalLine } from '../src/challenge';
import { CONFIG } from '../src/config';
import { GhostRecorder, ghostPose, liveDelta, type Ghost, type GhostPose } from '../src/ghost';
import { dailyRoute } from '../src/race';

const DAY = '2026-11-03';
const stops = dailyRoute(DAY).stops.length;

/** A run across the city at swing speed, curving and rising and falling, with animation changes. */
function run(seconds: number): Ghost {
  const rec = new GhostRecorder();
  const n = Math.round(seconds * 60);
  for (let i = 0; i <= n; i++) {
    const t = i / 60;
    rec.record(t, {
      x: -300 + t * 16,
      y: 8 + Math.sin(t) * 7,
      z: 120 + Math.sin(t / 5) * 90,
      yaw: 1,
      anim: Math.floor(t / 3) % 2 ? 4 : 2,
      speed: 16,
      anchor: null,
    });
  }
  return rec.finish(seconds, Array.from({ length: stops }, (_, i) => (seconds * (i + 1)) / stops))!;
}

/** The same run with a fresh rope every `every` seconds, each held for most of that time. */
function roped(seconds: number, every = 2.5): Ghost {
  const g = run(seconds);
  g.frames = g.frames.map((f, i) => {
    const t = i * g.dt;
    const swing = Math.floor(t / every);
    if (t - swing * every > every * 0.8) return f;
    return [...f, Math.round(f[0] + 18 + (swing % 5)) + 0.3, 24 + (swing % 7), f[2] + (swing % 2 ? 11.2 : -9.6)];
  });
  // an anchor stays put for a whole swing, as a real rope's does
  let held: number[] | null = null;
  let last = -1;
  g.frames.forEach((f, i) => {
    if (f.length !== 9) return void (held = null);
    const swing = Math.floor((i * g.dt) / every);
    if (!held || swing !== last) held = f.slice(6);
    last = swing;
    f.splice(6, 3, ...held);
  });
  return g;
}

const pose = (): GhostPose => ({ x: 0, y: 0, z: 0, yaw: 0, anim: 0, speed: 0, anchor: null });

describe('challenge links', () => {
  it('round-trips a run: route, clock, splits and path, usable by the race ghost', () => {
    const g = run(30);
    const code = encodeChallenge(DAY, g)!;
    expect(code).toMatch(/^[A-Za-z0-9_-]+$/);
    const c = decodeChallenge(code)!;
    expect(c.day).toBe(DAY);
    expect(c.route).toEqual(dailyRoute(DAY));
    expect(c.ghost.time).toBeCloseTo(30, 2);
    expect(c.ghost.splits!.length).toBe(stops);
    expect(c.ghost.splits![0]).toBeCloseTo(30 / stops, 2);
    for (const f of c.ghost.frames) {
      const src = g.frames[Math.round(c.ghost.frames.indexOf(f) * (c.ghost.dt / g.dt))];
      expect(Math.abs(f[0] - src[0])).toBeLessThanOrEqual(0.3);
      expect(Math.abs(f[1] - src[1])).toBeLessThanOrEqual(0.3);
      expect(Math.abs(f[2] - src[2])).toBeLessThanOrEqual(0.3);
      expect(f[4]).toBe(src[4]);
      expect(f.length).toBe(6);
    }
    expect(liveDelta(c.ghost, 0, g.frames[40][0], g.frames[40][2], 4)).toBeCloseTo(0, 0);
  });

  it('carries the rope: same anchors, on the same frames, and the ghost draws it', () => {
    const g = roped(30);
    const c = decodeChallenge(encodeChallenge(DAY, g)!)!;
    const ratio = Math.round(c.ghost.dt / g.dt);
    expect(ratio).toBe(CONFIG.challenge.frameSteps[0]); // the rope did not cost a 30 s run any smoothness
    c.ghost.frames.forEach((f, i) => {
      const src = g.frames[Math.min(i * ratio, g.frames.length - 1)];
      expect(f.length).toBe(src.length);
      for (let k = 6; k < src.length; k++) expect(Math.abs(f[k] - src[k])).toBeLessThanOrEqual(0.3);
    });
    const held = c.ghost.frames.findIndex((f) => f.length === 9);
    expect(ghostPose(c.ghost, held * c.ghost.dt, pose()).anchor).not.toBeNull();
    const free = c.ghost.frames.findIndex((f) => f.length === 6);
    expect(ghostPose(c.ghost, free * c.ghost.dt, pose()).anchor).toBeNull();
  });

  it('fits a link with a rope for any likely run, and a hopelessly busy one loses only the rope', () => {
    for (const s of [20, 60, 120, 180]) {
      const code = encodeChallenge(DAY, roped(s))!;
      expect(code.length).toBeLessThanOrEqual(CONFIG.challenge.maxChars);
      expect(decodeChallenge(code)!.ghost.frames.some((f) => f.length === 9)).toBe(true);
    }
    // nonstop swinging for 5 minutes: the link still fits, whether or not the rope does
    expect(encodeChallenge(DAY, roped(300))).not.toBeNull();
    const busy = run(240);
    const before = encodeChallenge(DAY, busy)!;
    // a new far-off anchor every kept frame: more than any link can hold
    busy.frames = busy.frames.map((f, i) => [...f, f[0] + 900 + i * 7, 900 - (i % 50), f[2] - 900 - i * 3]);
    const code = encodeChallenge(DAY, busy)!;
    expect(code.length).toBeLessThanOrEqual(CONFIG.challenge.maxChars);
    const c = decodeChallenge(code)!;
    expect(c.ghost.frames.every((f) => f.length === 6)).toBe(true);
    expect(c.ghost.dt).toBeCloseTo(decodeChallenge(before)!.ghost.dt, 5);
  });

  it('still opens a link shared before ropes were added', () => {
    const c = decodeChallenge('AZiiAawCBEtLS0vIARCvCSDgAwwIAA4DAAwDAA4IAAwDAAwDAA4IAAwDAA4DAAwIAAwDAA4DAAwIAA4DAAYEAAgCCAQ')!;
    expect(c.day).toBe(DAY);
    expect(c.ghost.time).toBeCloseTo(3, 2);
    expect(c.ghost.frames.length).toBeGreaterThan(10);
    expect(c.ghost.frames.every((f) => f.length === 6)).toBe(true);
  });

  it('rebuilds facing and speed from the path', () => {
    const c = decodeChallenge(encodeChallenge(DAY, run(10))!)!;
    const f = c.ghost.frames[10];
    const next = c.ghost.frames[11];
    expect(f[3]).toBeCloseTo(Math.atan2(next[0] - f[0], next[2] - f[2]), 5);
    const t = 10 * c.ghost.dt;
    const trueSpeed = Math.hypot(16, 18 * Math.cos(t / 5)); // the test run's horizontal velocity
    expect(Math.abs(f[5] - trueSpeed)).toBeLessThan(4); // within position rounding over one frame
  });

  it('reaches the finish even when the last frame falls between kept frames', () => {
    const g = run(30.1);
    const c = decodeChallenge(encodeChallenge(DAY, g)!)!;
    const a = c.ghost.frames[c.ghost.frames.length - 1];
    const b = g.frames[g.frames.length - 1];
    expect(Math.abs(a[0] - b[0])).toBeLessThanOrEqual(0.3);
  });

  it('fits a link for any likely run, dropping frames as runs grow', () => {
    for (const s of [20, 60, 120, 300]) {
      const code = encodeChallenge(DAY, run(s))!;
      expect(code.length).toBeLessThanOrEqual(CONFIG.challenge.maxChars);
      expect(decodeChallenge(code)).not.toBeNull();
    }
    const short = decodeChallenge(encodeChallenge(DAY, run(20))!)!;
    const long = decodeChallenge(encodeChallenge(DAY, run(300))!)!;
    expect(long.ghost.dt).toBeGreaterThan(short.ghost.dt);
  });

  it('gives no code when even the coarsest frames will not fit', () => {
    const steps = CONFIG.challenge.frameSteps;
    const coarsest = steps[steps.length - 1];
    const noisy: Ghost = { ...run(30), frames: [] };
    for (let i = 0; i < 6000; i++) noisy.frames.push([(i % coarsest === 0 ? (i % 2 ? 900 : -900) : 0), 900 * (i % 3), 900, 0, i % 7, 0]);
    expect(encodeChallenge(DAY, noisy)).toBeNull();
  });

  it('rejects anything malformed without throwing', () => {
    const code = encodeChallenge(DAY, roped(10))!;
    for (const bad of [null, undefined, '', '!!!', 'not_a_real_code', 'A'.repeat(50), 'A'.repeat(CONFIG.challenge.maxChars + 1)]) {
      expect(decodeChallenge(bad)).toBeNull();
    }
    for (let cut = 1; cut < code.length; cut += 7) expect(decodeChallenge(code.slice(0, cut))).toBeNull();
    expect(decodeChallenge(`${code}AAAA`)).toBeNull(); // trailing bytes
    // random garbage never throws, and anything that does parse is usable
    let seed = 7;
    const rnd = () => (seed = (seed * 1664525 + 1013904223) % 2 ** 32) / 2 ** 32;
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    for (let i = 0; i < 2000; i++) {
      const s = Array.from({ length: 1 + Math.floor(rnd() * 80) }, () => alphabet[Math.floor(rnd() * 64)]).join('');
      const c = decodeChallenge(s);
      if (c) expect(c.ghost.frames.every((f) => f.every(Number.isFinite))).toBe(true);
    }
  });

  it('rejects a run whose splits do not match the route', () => {
    const g = run(10);
    expect(decodeChallenge(encodeChallenge(DAY, { ...g, splits: [1] })!)).toBeNull();
    expect(decodeChallenge(encodeChallenge(DAY, { ...g, splits: g.splits!.map((s) => s + 50) })!)).toBeNull();
  });

  it('reads the code only from a well-formed hash', () => {
    expect(challengeFromHash('#c=abc-_1')).toBe('abc-_1');
    expect(challengeFromHash('')).toBeNull();
    expect(challengeFromHash('#x=abc')).toBeNull();
  });

  it('words the result', () => {
    expect(rivalLine(40, 41.26)).toBe('You beat your friend by 1.3 s');
    expect(rivalLine(41.26, 40)).toBe('Your friend was 1.3 s faster');
    expect(rivalLine(40, 40.02)).toBe('Dead level with your friend!');
  });
});

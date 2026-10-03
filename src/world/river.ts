/**
 * The Thames as a smoothed centre-line. Pure maths (no three.js) so it can be
 * shared by rendering, collision and tests.
 *
 * World axes: +x = east, +z = south, +y = up. 1 unit = 1 metre of the
 * compressed map (real central London scaled by ~0.28 horizontally).
 */
export const RIVER_HALF_WIDTH = 28;
export const WATER_Y = -1.6;
export const RIVER_BED = -4;
export const MAP = { minX: -800, maxX: 800, minZ: -480, maxZ: 480 };

// Control points follow the real course: north past Westminster, the bend at
// Charing Cross / Waterloo, then east past Blackfriars to Tower Bridge.
const CTRL: [number, number][] = [
  [-316, 760],
  [-296, 425],
  [-257, 227],
  [-221, 60],
  [-159, -19],
  [-40, -46],
  [84, -50],
  [200, -47],
  [286, -28],
  [411, 3],
  [668, 84],
  [846, 160],
  [1040, 250],
];

function catmull(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

function buildPath(): Float32Array {
  const out: number[] = [];
  const SUB = 8;
  for (let i = 0; i < CTRL.length - 1; i++) {
    const p0 = CTRL[Math.max(0, i - 1)];
    const p1 = CTRL[i];
    const p2 = CTRL[i + 1];
    const p3 = CTRL[Math.min(CTRL.length - 1, i + 2)];
    for (let s = 0; s < SUB; s++) {
      const t = s / SUB;
      out.push(catmull(p0[0], p1[0], p2[0], p3[0], t), catmull(p0[1], p1[1], p2[1], p3[1], t));
    }
  }
  const last = CTRL[CTRL.length - 1];
  out.push(last[0], last[1]);
  return new Float32Array(out);
}

/** Flat [x0,z0,x1,z1,...] polyline of the river centre. */
export const RIVER_PATH = buildPath();

export interface RiverInfo {
  /** distance from the centre-line */
  dist: number;
  /** nearest point on the centre-line */
  cx: number;
  cz: number;
  /** unit tangent (downstream) at that point */
  tx: number;
  tz: number;
}

const scratch: RiverInfo = { dist: 0, cx: 0, cz: 0, tx: 1, tz: 0 };

/** Nearest point on the river centre-line. Returns a shared scratch object. */
export function riverInfo(x: number, z: number, out: RiverInfo = scratch): RiverInfo {
  let best = Infinity;
  const P = RIVER_PATH;
  for (let i = 0; i < P.length - 2; i += 2) {
    const ax = P[i];
    const az = P[i + 1];
    const bx = P[i + 2] - ax;
    const bz = P[i + 3] - az;
    const len2 = bx * bx + bz * bz;
    let t = ((x - ax) * bx + (z - az) * bz) / len2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const px = ax + bx * t;
    const pz = az + bz * t;
    const d2 = (x - px) * (x - px) + (z - pz) * (z - pz);
    if (d2 < best) {
      best = d2;
      const len = Math.sqrt(len2);
      out.cx = px;
      out.cz = pz;
      out.tx = bx / len;
      out.tz = bz / len;
    }
  }
  out.dist = Math.sqrt(best);
  return out;
}

export function riverDist(x: number, z: number): number {
  return riverInfo(x, z).dist;
}

function smoothstep(a: number, b: number, v: number): number {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** Terrain height: flat city at y=0, sloping down into the river channel. */
export function heightFromRiverDist(d: number): number {
  return (smoothstep(RIVER_HALF_WIDTH - 9, RIVER_HALF_WIDTH + 2, d) - 1) * -RIVER_BED;
}

export function groundHeight(x: number, z: number): number {
  return heightFromRiverDist(riverDist(x, z));
}

/** A dry point on the bank nearest to (x,z), on the same side of the river. */
export function nearestBank(x: number, z: number): { x: number; z: number } {
  const r = riverInfo(x, z);
  let nx = x - r.cx;
  let nz = z - r.cz;
  const len = Math.hypot(nx, nz);
  if (len < 0.01) {
    nx = -r.tz;
    nz = r.tx;
  } else {
    nx /= len;
    nz /= len;
  }
  const off = RIVER_HALF_WIDTH + 7;
  return { x: r.cx + nx * off, z: r.cz + nz * off };
}

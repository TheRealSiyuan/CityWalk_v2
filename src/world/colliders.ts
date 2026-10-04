import type { Body } from '../physics/swing';

/**
 * Collision solids.
 *
 * Every solid is a footprint (a box rotated about the vertical axis, or a
 * circle) extruded from y0 to y1, plus an optional *cap* that rises above y1:
 * a pitched roof, a hipped/mansard roof or pyramid, a dome or a cone. The cap
 * is what keeps the physics surface identical to the rendered roof — a player
 * can never come to rest underneath something they can see.
 */
export enum Cap {
  Flat = 0,
  /** insets along local x / z: gable, hip, mansard, pyramid, spire */
  Slope = 1,
  /** half-ellipsoid on a round footprint */
  Dome = 2,
  /** cone / frustum on a round footprint */
  Cone = 3,
}

export interface Solid {
  cx: number;
  cz: number;
  hx: number;
  hz: number;
  y0: number;
  y1: number;
  c: number;
  s: number;
  round: boolean;
  cap: Cap;
  /** height of the cap above y1 */
  capH: number;
  /** Slope: horizontal run from the edge to where the cap reaches full height (per axis; Infinity = no slope on that axis). Cone: top radius. */
  ex: number;
  ez: number;
}

export interface SolidOpts {
  yaw?: number;
  round?: boolean;
  cap?: Cap;
  capH?: number;
  ex?: number;
  ez?: number;
}

const CELL = 40;
const key = (ix: number, iz: number) => (ix + 512) * 2048 + (iz + 512);

/** Surface height of the solid above local point (lx,lz), which must be inside the footprint. */
function surface(b: Solid, lx: number, lz: number): number {
  switch (b.cap) {
    case Cap.Slope: {
      // an infinite run means "no slope on this axis"
      const fx = Number.isFinite(b.ex) ? (b.hx - Math.abs(lx)) / b.ex : 1;
      const fz = Number.isFinite(b.ez) ? (b.hz - Math.abs(lz)) / b.ez : 1;
      const f = Math.min(1, fx, fz);
      return b.y1 + b.capH * (f > 0 ? f : 0);
    }
    case Cap.Dome: {
      const d2 = (lx * lx + lz * lz) / (b.hx * b.hx);
      return d2 >= 1 ? b.y1 : b.y1 + b.capH * Math.sqrt(1 - d2);
    }
    case Cap.Cone: {
      const d = Math.hypot(lx, lz);
      const f = (b.hx - d) / (b.hx - b.ex);
      return b.y1 + b.capH * (f > 1 ? 1 : f > 0 ? f : 0);
    }
    default:
      return b.y1;
  }
}

// Horizontal cross-section of the solid at height y (the part that is taller
// than y). Written into these scratch values; returns false if empty.
let secX = 0;
let secZ = 0;
function section(b: Solid, y: number): boolean {
  if (y < b.y1) {
    secX = b.hx;
    secZ = b.hz;
    return true;
  }
  if (b.cap === Cap.Flat || y >= b.y1 + b.capH) return false;
  const f = (y - b.y1) / b.capH;
  switch (b.cap) {
    case Cap.Slope:
      secX = b.hx - (Number.isFinite(b.ex) ? b.ex * f : 0);
      secZ = b.hz - (Number.isFinite(b.ez) ? b.ez * f : 0);
      return secX > 0 && secZ > 0;
    case Cap.Dome:
      secX = secZ = b.hx * Math.sqrt(1 - f * f);
      return true;
    default:
      secX = secZ = b.hx - (b.hx - b.ex) * f;
      return secX > 0;
  }
}

/** Static collision world in a uniform spatial hash. */
export class Colliders {
  solids: Solid[] = [];
  private grid = new Map<number, Solid[]>();

  add(cx: number, cz: number, hx: number, hz: number, y0: number, y1: number, o: SolidOpts | number = {}): Solid {
    const opt = typeof o === 'number' ? { yaw: o } : o;
    const yaw = opt.yaw ?? 0;
    const round = opt.round ?? false;
    const b: Solid = {
      cx, cz, hx, hz: round ? hx : hz, y0, y1,
      c: Math.cos(yaw), s: Math.sin(yaw),
      round,
      cap: opt.cap ?? Cap.Flat,
      capH: opt.capH ?? 0,
      ex: opt.ex ?? Infinity,
      ez: opt.ez ?? Infinity,
    };
    if (b.cap !== Cap.Flat && b.capH <= 0) b.cap = Cap.Flat;
    this.solids.push(b);
    const ex = (round ? hx : Math.abs(hx * b.c) + Math.abs(hz * b.s)) + 1.5;
    const ez = (round ? hx : Math.abs(hx * b.s) + Math.abs(hz * b.c)) + 1.5;
    const x0 = Math.floor((cx - ex) / CELL);
    const x1 = Math.floor((cx + ex) / CELL);
    const z0 = Math.floor((cz - ez) / CELL);
    const z1 = Math.floor((cz + ez) / CELL);
    for (let ix = x0; ix <= x1; ix++) {
      for (let iz = z0; iz <= z1; iz++) {
        const k = key(ix, iz);
        let list = this.grid.get(k);
        if (!list) this.grid.set(k, (list = []));
        list.push(b);
      }
    }
    return b;
  }

  private cell(x: number, z: number): Solid[] | undefined {
    return this.grid.get(key(Math.floor(x / CELL), Math.floor(z / CELL)));
  }

  /**
   * Resolve a vertical cylinder (feet at body.pos) against the solids.
   *
   * For each solid: anything taller than (feet + step) is a wall and pushes
   * the body out sideways; anything lower that the body's centre is over is a
   * floor and lifts the body onto it. Because both tests use the same surface
   * function, gentle roofs are walkable, steep spires shed you, and there is
   * no height at which a body is left inside the solid.
   *
   * Returns true if the body is standing on a solid.
   */
  resolve(body: Body, radius: number, height: number, step: number): boolean {
    // Being pushed out of one wall can push you into its neighbour (the inside
    // corner where two terraces meet), so repeat until nothing moves.
    let grounded = false;
    for (let pass = 0; pass < 4; pass++) {
      this.pushed = false;
      if (this.resolveOnce(body, radius, height, step)) grounded = true;
      if (!this.pushed) break;
    }
    return grounded;
  }

  private pushed = false;

  private resolveOnce(body: Body, radius: number, height: number, step: number): boolean {
    const p = body.pos;
    const v = body.vel;
    const list = this.cell(p.x, p.z);
    if (!list) return false;
    let grounded = false;
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      const dx = p.x - b.cx;
      const dz = p.z - b.cz;
      let lx = dx * b.c - dz * b.s;
      let lz = dx * b.s + dz * b.c;
      if (b.round) {
        if (lx * lx + lz * lz >= (b.hx + radius) * (b.hx + radius)) continue;
      } else if (Math.abs(lx) >= b.hx + radius || Math.abs(lz) >= b.hz + radius) continue;
      if (p.y >= b.y1 + b.capH) continue; // above it
      if (p.y + height <= b.y0) continue; // underneath an overhang
      if (p.y + height * 0.5 < b.y0) {
        // head bump on an overhang
        if (b.round ? lx * lx + lz * lz < b.hx * b.hx : Math.abs(lx) < b.hx && Math.abs(lz) < b.hz) {
          p.y = b.y0 - height;
          if (v.y > 0) v.y = 0;
        }
        continue;
      }

      // --- wall: the cross-section too tall to step onto ---------------------
      if (section(b, p.y + step)) {
        let nlx = 0;
        let nlz = 0;
        let moved = false;
        if (b.round) {
          const d = Math.hypot(lx, lz);
          const pen = secX + radius - d;
          if (pen > 0) {
            if (d > 1e-5) {
              nlx = lx / d;
              nlz = lz / d;
            } else nlx = 1;
            lx += nlx * pen;
            lz += nlz * pen;
            moved = true;
          }
        } else {
          const px = secX + radius - Math.abs(lx);
          const pz = secZ + radius - Math.abs(lz);
          if (px > 0 && pz > 0) {
            if (px < pz) {
              nlx = lx >= 0 ? 1 : -1;
              lx += nlx * px;
            } else {
              nlz = lz >= 0 ? 1 : -1;
              lz += nlz * pz;
            }
            moved = true;
          }
        }
        if (moved) {
          this.pushed = true;
          p.x = b.cx + lx * b.c + lz * b.s;
          p.z = b.cz - lx * b.s + lz * b.c;
          const nx = nlx * b.c + nlz * b.s;
          const nz = -nlx * b.s + nlz * b.c;
          const vn = v.x * nx + v.z * nz;
          if (vn < 0) {
            v.x -= nx * vn;
            v.z -= nz * vn;
          }
        }
      }

      // --- floor: lift onto whatever is under the body's centre ---------------
      const inside = b.round ? lx * lx + lz * lz < b.hx * b.hx : Math.abs(lx) < b.hx && Math.abs(lz) < b.hz;
      if (!inside) continue;
      const h = surface(b, lx, lz);
      if (p.y <= h) {
        p.y = h;
        if (v.y <= 0.01) {
          v.y = 0;
          grounded = true;
        }
      }
    }
    return grounded;
  }

  /** Is this point inside any solid? (camera occlusion, tests) */
  blocked(x: number, y: number, z: number): boolean {
    const list = this.cell(x, z);
    if (!list) return false;
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (y < b.y0 || y > b.y1 + b.capH) continue;
      const dx = x - b.cx;
      const dz = z - b.cz;
      const lx = dx * b.c - dz * b.s;
      const lz = dx * b.s + dz * b.c;
      if (b.round ? lx * lx + lz * lz >= b.hx * b.hx : Math.abs(lx) >= b.hx || Math.abs(lz) >= b.hz) continue;
      if (y < surface(b, lx, lz)) return true;
    }
    return false;
  }

  /**
   * Highest solid surface over (x,z) that is not above `below` (pass Infinity
   * for the very top). Returns -Infinity when there is nothing there.
   */
  topAt(x: number, z: number, below = Infinity): number {
    const list = this.cell(x, z);
    let top = -Infinity;
    if (!list) return top;
    for (const b of list) {
      const dx = x - b.cx;
      const dz = z - b.cz;
      const lx = dx * b.c - dz * b.s;
      const lz = dx * b.s + dz * b.c;
      if (b.round ? lx * lx + lz * lz >= b.hx * b.hx : Math.abs(lx) >= b.hx || Math.abs(lz) >= b.hz) continue;
      const h = surface(b, lx, lz);
      if (h > top && h <= below) top = h;
    }
    return top;
  }
}

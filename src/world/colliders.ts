import type { Body } from '../physics/swing';

/** A box rotated about the vertical axis (three.js yaw convention). */
export interface Box {
  cx: number;
  cz: number;
  hx: number;
  hz: number;
  y0: number;
  y1: number;
  c: number;
  s: number;
}

const CELL = 40;
const key = (ix: number, iz: number) => (ix + 512) * 2048 + (iz + 512);

/** Static collision world: yawed boxes in a uniform spatial hash. */
export class Colliders {
  boxes: Box[] = [];
  private grid = new Map<number, Box[]>();

  add(cx: number, cz: number, hx: number, hz: number, y0: number, y1: number, yaw = 0): void {
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    const b: Box = { cx, cz, hx, hz, y0, y1, c, s };
    this.boxes.push(b);
    const ex = Math.abs(hx * c) + Math.abs(hz * s) + 1.5;
    const ez = Math.abs(hx * s) + Math.abs(hz * c) + 1.5;
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
  }

  private cell(x: number, z: number): Box[] | undefined {
    return this.grid.get(key(Math.floor(x / CELL), Math.floor(z / CELL)));
  }

  /**
   * Resolve a vertical cylinder (feet at body.pos) against the boxes.
   * Lands on tops, bumps heads on undersides, slides along walls.
   * Returns true if the body is standing on a box.
   */
  resolve(body: Body, radius: number, height: number, step: number): boolean {
    const list = this.cell(body.pos.x, body.pos.z);
    if (!list) return false;
    let grounded = false;
    const p = body.pos;
    const v = body.vel;
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      const dx = p.x - b.cx;
      const dz = p.z - b.cz;
      let lx = dx * b.c - dz * b.s;
      let lz = dx * b.s + dz * b.c;
      const px = b.hx + radius - Math.abs(lx);
      if (px <= 0) continue;
      const pz = b.hz + radius - Math.abs(lz);
      if (pz <= 0) continue;

      if (p.y >= b.y1 - step) {
        // On or above the top surface.
        if (p.y <= b.y1 && v.y <= 0.01) {
          p.y = b.y1;
          v.y = 0;
          grounded = true;
        }
        continue;
      }
      if (p.y + height <= b.y0) continue; // entirely underneath
      if (p.y + height * 0.5 < b.y0) {
        // Head bump on an overhang.
        p.y = b.y0 - height;
        if (v.y > 0) v.y = 0;
        continue;
      }
      // Push out sideways along the axis of least penetration.
      let nlx = 0;
      let nlz = 0;
      if (px < pz) {
        nlx = lx >= 0 ? 1 : -1;
        lx += nlx * px;
      } else {
        nlz = lz >= 0 ? 1 : -1;
        lz += nlz * pz;
      }
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
    return grounded;
  }

  /** Is this point inside any box? (camera occlusion) */
  blocked(x: number, y: number, z: number): boolean {
    const list = this.cell(x, z);
    if (!list) return false;
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (y < b.y0 || y > b.y1) continue;
      const dx = x - b.cx;
      const dz = z - b.cz;
      if (Math.abs(dx * b.c - dz * b.s) < b.hx && Math.abs(dx * b.s + dz * b.c) < b.hz) return true;
    }
    return false;
  }

  /** Highest box top covering this point, or -Infinity. */
  topAt(x: number, z: number): number {
    const list = this.cell(x, z);
    let top = -Infinity;
    if (!list) return top;
    for (const b of list) {
      const dx = x - b.cx;
      const dz = z - b.cz;
      if (Math.abs(dx * b.c - dz * b.s) < b.hx && Math.abs(dx * b.s + dz * b.c) < b.hz && b.y1 > top) top = b.y1;
    }
    return top;
  }
}

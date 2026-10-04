import { beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { CONFIG } from '../src/config';
import { Cap, Colliders } from '../src/world/colliders';
import { Player, type MoveInput } from '../src/player/controller';
import { buildWorld, type World } from '../src/world/city';
import { MAP } from '../src/world/river';

const DT = 1 / 60;
const R = CONFIG.playerRadius;
const H = CONFIG.playerHeight;
const idle: MoveInput = { mx: 0, my: 0, jump: false, swing: false, camYaw: 0 };
const body = (x: number, y: number, z: number, vx = 0, vy = 0, vz = 0) => ({ pos: { x, y, z }, vel: { x: vx, y: vy, z: vz } });

describe('solids with roofs', () => {
  // a 20 × 10 house, walls to y=10, ridge along x at y=14
  const house = () => {
    const c = new Colliders();
    c.add(0, 0, 10, 5, 0, 10, { cap: Cap.Slope, capH: 4, ez: 5 });
    return c;
  };

  it('lands on the pitched roof surface, not on the wall-top hidden under it', () => {
    for (const z of [-4, -2, 0, 1.5, 4.5]) {
      const b = body(3, 13.9, z, 0, -8, 0);
      const c = house();
      let grounded = false;
      for (let i = 0; i < 60 && !grounded; i++) {
        b.pos.y += b.vel.y * DT;
        grounded = c.resolve(b, R, H, CONFIG.ledgeAssist);
      }
      expect(grounded, `z=${z}`).toBe(true);
      expect(b.pos.y).toBeCloseTo(10 + 4 * (1 - Math.abs(z) / 5), 5);
    }
  });

  it('walking over the ridge follows the roof and never dips inside it', () => {
    const c = house();
    const b = body(0, 10, -4.9);
    for (let i = 0; i < 400; i++) {
      b.pos.z += 0.025;
      b.vel.y = -1;
      b.pos.y -= 0.02;
      c.resolve(b, R, H, CONFIG.stepHeight);
      if (Math.abs(b.pos.z) < 5) expect(b.pos.y).toBeGreaterThanOrEqual(10 + 4 * (1 - Math.abs(b.pos.z) / 5) - 1e-6);
    }
    expect(b.pos.z).toBeGreaterThan(4.9);
  });

  it('a gable end is a wall: you cannot walk into the roof space from the side', () => {
    const c = house();
    const b = body(11, 10.5, 0, -5, 0, 0); // level with the roof, outside the end wall
    for (let i = 0; i < 120; i++) {
      b.pos.x += b.vel.x * DT;
      c.resolve(b, R, H, CONFIG.stepHeight);
    }
    expect(b.pos.x).toBeGreaterThanOrEqual(10 + R - 1e-6);
    expect(b.vel.x).toBe(0);
  });

  it('a steep spire sheds you instead of holding or swallowing you', () => {
    const c = new Colliders();
    c.add(0, 0, 5, 5, 0, 0, { cap: Cap.Slope, capH: 60, ex: 5, ez: 5 }); // 85° faces
    const b = body(1, 70, 0.5);
    for (let i = 0; i < 600; i++) {
      b.vel.y -= CONFIG.gravity * DT;
      b.pos.y += b.vel.y * DT;
      c.resolve(b, R, H, CONFIG.ledgeAssist);
      if (b.pos.y < 0) break;
      expect(c.blocked(b.pos.x, b.pos.y + H / 2, b.pos.z)).toBe(false);
    }
    expect(b.pos.y).toBeLessThan(5); // slid all the way down
    expect(Math.max(Math.abs(b.pos.x), Math.abs(b.pos.z))).toBeGreaterThan(4.5);
  });

  it('domes are standable on top and round at the sides', () => {
    const c = new Colliders();
    c.add(0, 0, 10, 0, 0, 20, { round: true, cap: Cap.Dome, capH: 10 });
    const top = body(0.5, 31, 0, 0, -3, 0);
    for (let i = 0; i < 90; i++) {
      top.pos.y += top.vel.y * DT;
      c.resolve(top, R, H, CONFIG.ledgeAssist);
    }
    expect(top.pos.y).toBeCloseTo(20 + 10 * Math.sqrt(1 - 0.0025), 4);
    const side = body(9.9, 5, 9.9, -4, 0, -4); // outside the circle, inside its bounding square
    c.resolve(side, R, H, CONFIG.stepHeight);
    expect(side.pos.x).toBe(9.9); // not touched: the footprint really is round
  });

  it('does not tunnel through a thin wall at top speed', () => {
    const c = new Colliders();
    c.add(0, 0, 1.2, 20, 0, 30); // 2.4 m thick: the thinnest wall in the city
    const b = body(-6, 5, 0, CONFIG.maxSpeed, 0, 0);
    for (let i = 0; i < 30; i++) {
      b.pos.x += b.vel.x * DT;
      c.resolve(b, R, H, CONFIG.ledgeAssist);
    }
    expect(b.pos.x).toBeLessThanOrEqual(-1.2 - R + 1e-6);
  });
});

describe('the real city: you can never end up inside a building', () => {
  let world: World;
  let visualTop: (x: number, z: number) => number;
  beforeAll(() => {
    world = buildWorld();
    world.group.updateMatrixWorld(true);
    // Index every rendered triangle by its footprint so "what is the highest
    // thing drawn above this point" is a fast, exact query.
    const CELL = 8;
    const grid = new Map<number, number[]>();
    const tris: number[] = [];
    const key = (ix: number, iz: number) => (ix + 1024) * 4096 + (iz + 1024);
    const v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    const addTri = () => {
      const id = tris.length / 9;
      for (const p of v) tris.push(p.x, p.y, p.z);
      const x0 = Math.floor(Math.min(v[0].x, v[1].x, v[2].x) / CELL);
      const x1 = Math.floor(Math.max(v[0].x, v[1].x, v[2].x) / CELL);
      const z0 = Math.floor(Math.min(v[0].z, v[1].z, v[2].z) / CELL);
      const z1 = Math.floor(Math.max(v[0].z, v[1].z, v[2].z) / CELL);
      if ((x1 - x0) * (z1 - z0) > 400) return; // ground and water sheets
      for (let ix = x0; ix <= x1; ix++) for (let iz = z0; iz <= z1; iz++) {
        const k = key(ix, iz);
        let l = grid.get(k);
        if (!l) grid.set(k, (l = []));
        l.push(id);
      }
    };
    const m4 = new THREE.Matrix4();
    world.group.traverse((o) => {
      const m = o as THREE.Mesh;
      // skip sky/clouds, and the turning Eye wheel (deliberately not solid)
      if (!m.isMesh || (m.material as THREE.Material).depthWrite === false || m.name === 'eye-wheel') return;
      const pos = m.geometry.getAttribute('position');
      const idx = m.geometry.getIndex();
      const n = idx ? idx.count : pos.count;
      const inst = (m as THREE.InstancedMesh).isInstancedMesh ? (m as THREE.InstancedMesh) : null;
      for (let k = 0; k < (inst ? inst.count : 1); k++) {
        if (inst) {
          inst.getMatrixAt(k, m4);
          m4.premultiply(m.matrixWorld);
        } else m4.copy(m.matrixWorld);
        for (let i = 0; i < n; i += 3) {
          for (let c = 0; c < 3; c++) v[c].fromBufferAttribute(pos, idx ? idx.getX(i + c) : i + c).applyMatrix4(m4);
          addTri();
        }
      }
    });
    visualTop = (x, z) => {
      const l = grid.get(key(Math.floor(x / CELL), Math.floor(z / CELL)));
      let top = -Infinity;
      if (!l) return top;
      for (const id of l) {
        const o = id * 9;
        const ax = tris[o], ay = tris[o + 1], az = tris[o + 2];
        const bx = tris[o + 3], by = tris[o + 4], bz = tris[o + 5];
        const cx = tris[o + 6], cy = tris[o + 7], cz = tris[o + 8];
        const den = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
        if (Math.abs(den) < 1e-9) continue;
        const w0 = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / den;
        const w1 = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / den;
        const w2 = 1 - w0 - w1;
        if (w0 < 0 || w1 < 0 || w2 < 0) continue;
        const y = w0 * ay + w1 * by + w2 * cy;
        if (y > top) top = y;
      }
      return top;
    };
  });

  it('wherever you land, your feet are on the roof you can see (regression: buried under pitched roofs)', { timeout: 60_000 }, () => {
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    let landed = 0;
    const buried: string[] = [];
    for (let i = 0; i < 2500; i++) {
      const x = MAP.minX + 20 + rnd() * (MAP.maxX - MAP.minX - 40);
      const z = MAP.minZ + 20 + rnd() * (MAP.maxZ - MAP.minZ - 40);
      const top = world.colliders.topAt(x, z);
      if (top < 5) continue; // not over a building
      const p = new Player(world, { x, y: top + 5, z });
      p.grounded = false;
      for (let k = 0; k < 200; k++) p.step(DT, idle);
      landed++;
      // Rendered surface under the body (thin spikes and poles can't hide a body: sample its footprint)
      let vis = Infinity;
      for (const [ox, oz] of [[0, 0], [0.3, 0], [-0.3, 0], [0, 0.3], [0, -0.3]]) vis = Math.min(vis, visualTop(p.pos.x + ox, p.pos.z + oz));
      const depth = vis - p.pos.y;
      if (depth > 0.75) buried.push(`(${p.pos.x.toFixed(1)}, ${p.pos.z.toFixed(1)}) feet ${p.pos.y.toFixed(1)}, visible surface ${vis.toFixed(1)}`);
    }
    expect(landed).toBeGreaterThan(400);
    expect(buried, buried.slice(0, 8).join('\n')).toHaveLength(0);
  });

  it('fast, erratic swinging never puts the body inside a solid (tunnelling / roof-edge fuzz)', { timeout: 60_000 }, () => {
    let seed = 99;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const starts = world.plan.roads.slice(0, 6).map((r) => r.pts[1]);
    let steps = 0;
    let saves = 0;
    for (const [sx, sz] of starts) {
      const p = new Player(world, { x: sx, y: 0, z: sz });
      const input: MoveInput = { mx: 0, my: 1, jump: false, swing: false, camYaw: rnd() * 6.28 };
      for (let i = 0; i < 60 * 90; i++) {
        if (i % 20 === 0) {
          input.swing = rnd() < 0.7;
          input.mx = rnd() * 2 - 1;
          if (rnd() < 0.15) input.camYaw += (rnd() - 0.5) * 2;
        }
        input.jump = rnd() < 0.02;
        p.step(DT, input);
        steps++;
        const inside = world.colliders.blocked(p.pos.x, p.pos.y + H * 0.5, p.pos.z);
        if (inside) throw new Error(`inside a solid at (${p.pos.x.toFixed(1)}, ${p.pos.y.toFixed(1)}, ${p.pos.z.toFixed(1)}) after ${i} steps, speed ${Math.hypot(p.vel.x, p.vel.y, p.vel.z).toFixed(1)}`);
      }
      saves += p.saves;
    }
    console.log(`fuzz: ${steps} steps, safety net used ${saves} times`);
    expect(steps).toBe(6 * 60 * 90);
    // the last-resort safety net should almost never be what kept us out
    expect(saves / steps).toBeLessThan(0.002);
  });

  it('you can still jump and swing off a roof', () => {
    const b = world.plan.buildings.find((x) => !x.scenery && x.roof === 'gable' && x.hx > 10 && x.h > 14)!;
    const p = new Player(world, { x: b.x, y: b.h + b.roofH + 3, z: b.z });
    p.grounded = false;
    for (let k = 0; k < 120; k++) p.step(DT, idle);
    expect(p.grounded).toBe(true);
    const y0 = p.pos.y;
    p.step(DT, { ...idle, jump: true });
    for (let k = 0; k < 12; k++) p.step(DT, idle);
    expect(p.pos.y).toBeGreaterThan(y0 + 1);
    // run off the eave and hold swing: a rope must attach before hitting the street
    const q = new Player(world, { x: b.x, y: b.h + b.roofH, z: b.z });
    let roped = false;
    for (let k = 0; k < 60 * 6 && !roped; k++) {
      q.step(DT, { mx: 0, my: 1, jump: false, swing: k > 30, camYaw: b.yaw });
      roped = !!q.rope;
    }
    expect(roped).toBe(true);
  });
});

import * as THREE from 'three';
import { Builder } from './builder';
import { Cap, Colliders } from './colliders';
import { buildCrane, buildLandmarks } from './landmarks';
import { EXCLUSIONS, PARKS, inPark } from './data';
import { MAP, RIVER_HALF_WIDTH, RIVER_PATH, WATER_Y, heightFromRiverDist, riverDist, riverInfo } from './river';
import { SKIRT, Style, buildPlan, mulberry32, type Building, type CityPlan } from './streets';
import { shared, skyMaterial, toonMaterial, waterMaterial } from '../render/materials';
import type { V3 } from '../physics/swing';

const ACELL = 32;
const akey = (ix: number, iz: number) => (ix + 512) * 2048 + (iz + 512);
const LEAVES = [0x86b86a, 0x6fa85e, 0x9cc76f, 0xd9a441, 0xe0803c, 0xb5c85a];

export interface World {
  group: THREE.Group;
  colliders: Colliders;
  anchors: V3[];
  plan: CityPlan;
  /** Anchors within reach of a point (shared scratch array). */
  anchorsNear(x: number, z: number, radius: number): V3[];
  update(time: number, camera: THREE.Camera): void;
  stats: { buildings: number; anchors: number; colliders: number; triangles: number };
}

/** Growable typed vertex buffers for one merged, vertex-coloured mesh. */
class MeshData {
  pos: number[] = [];
  nor: number[] = [];
  col: number[] = [];
  wall: number[] = [];
  private c = new THREE.Color();
  constructor(private withWall = false) {}

  tri(a: number[], b: number[], d: number[], color: number, wa?: number[], wb?: number[], wd?: number[]): void {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    this.c.setHex(color);
    for (const p of [a, b, d]) {
      this.pos.push(p[0], p[1], p[2]);
      this.nor.push(nx, ny, nz);
      this.col.push(this.c.r, this.c.g, this.c.b);
    }
    if (this.withWall) {
      const plain = [0, 0, 0, -1];
      for (const w of [wa ?? plain, wb ?? plain, wd ?? plain]) this.wall.push(w[0], w[1], w[2], w[3]);
    }
  }

  quad(a: number[], b: number[], c: number[], d: number[], color: number, wa?: number[], wb?: number[], wc?: number[], wd?: number[]): void {
    this.tri(a, b, c, color, wa, wb, wc);
    this.tri(a, c, d, color, wa, wc, wd);
  }

  get triangles(): number {
    return this.pos.length / 9;
  }

  /** Ground decals are lit as flat ground whatever their winding. */
  flatUp(): this {
    for (let i = 0; i < this.nor.length; i += 3) {
      this.nor[i] = 0;
      this.nor[i + 1] = 1;
      this.nor[i + 2] = 0;
    }
    return this;
  }

  build(material: THREE.Material): THREE.Mesh {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.pos), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(this.nor), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(this.col), 3));
    if (this.withWall) g.setAttribute('aWall', new THREE.BufferAttribute(new Float32Array(this.wall), 4));
    const m = new THREE.Mesh(g, material);
    m.frustumCulled = false;
    m.matrixAutoUpdate = false;
    this.pos = this.nor = this.col = this.wall = [];
    return m;
  }
}

function nearPlaza(x: number, z: number): boolean {
  for (const [cx, cz, r] of EXCLUSIONS) if (Math.hypot(x - cx, z - cz) < r - 6) return true;
  return false;
}

/** Terrain: fine triangles along the river banks, coarse ones everywhere flat. */
function buildGround(): THREE.Mesh {
  const FINE = 6;
  const K = 4; // coarse cell = K×K fine cells
  const pad = 300;
  const x0 = MAP.minX - pad;
  const z0 = MAP.minZ - pad;
  const nx = Math.ceil((MAP.maxX - MAP.minX + 2 * pad) / (FINE * K)) * K;
  const nz = Math.ceil((MAP.maxZ - MAP.minZ + 2 * pad) / (FINE * K)) * K;
  const W = nx + 1;
  const hy = new Float32Array(W * (nz + 1));
  const rd = new Float32Array(W * (nz + 1));
  // river distance is only needed accurately near the river: sample coarsely first
  for (let cz = 0; cz <= nz; cz += K) {
    for (let cx = 0; cx <= nx; cx += K) {
      const d = riverDist(x0 + cx * FINE, z0 + cz * FINE);
      rd[cz * W + cx] = d;
    }
  }
  const md = new MeshData();
  const asphalt = 0x8d8985;
  const stone = 0xd3c8b0;
  const bed = 0x9a8f78;
  const field = 0x9db87a;
  const col = new THREE.Color();
  const colorAt = (x: number, z: number, d: number, y: number): number => {
    if (y < -0.4) return col.setHex(stone).lerp(new THREE.Color(bed), Math.min(1, -y / 3)).getHex();
    if (d < RIVER_HALF_WIDTH + 12.5) return stone;
    if (x < MAP.minX - SKIRT || x > MAP.maxX + SKIRT || z < MAP.minZ - SKIRT || z > MAP.maxZ + SKIRT) return field;
    return asphalt;
  };
  const emit = (ix: number, iz: number, size: number): void => {
    const pts: number[][] = [];
    const cols: number[] = [];
    for (const [dx, dz] of [[0, 0], [0, size], [size, size], [size, 0]]) {
      const gx = ix + dx;
      const gz = iz + dz;
      const x = x0 + gx * FINE;
      const z = z0 + gz * FINE;
      const d = size === 1 ? rd[gz * W + gx] : 1e3;
      const y = size === 1 ? hy[gz * W + gx] : 0;
      pts.push([x, y, z]);
      cols.push(colorAt(x, z, d, y));
    }
    // per-vertex colours: write two triangles by hand so colours interpolate
    const push = (i: number) => {
      md.pos.push(pts[i][0], pts[i][1], pts[i][2]);
      md.nor.push(0, 1, 0);
      col.setHex(cols[i]);
      md.col.push(col.r, col.g, col.b);
    };
    push(0); push(1); push(2);
    push(0); push(2); push(3);
  };
  for (let cz = 0; cz < nz; cz += K) {
    for (let cx = 0; cx < nx; cx += K) {
      const dmin = Math.min(rd[cz * W + cx], rd[cz * W + cx + K], rd[(cz + K) * W + cx], rd[(cz + K) * W + cx + K]);
      if (dmin > RIVER_HALF_WIDTH + 14 + FINE * K * 1.5) {
        emit(cx, cz, K);
        continue;
      }
      for (let iz = cz; iz <= cz + K; iz++) {
        for (let ix = cx; ix <= cx + K; ix++) {
          const d = riverDist(x0 + ix * FINE, z0 + iz * FINE);
          rd[iz * W + ix] = d;
          hy[iz * W + ix] = heightFromRiverDist(d);
        }
      }
      for (let iz = cz; iz < cz + K; iz++) for (let ix = cx; ix < cx + K; ix++) emit(ix, iz, 1);
    }
  }
  return md.build(toonMaterial({ vertexColors: true, ground: true }));
}

export function buildWorld(): World {
  const group = new THREE.Group();
  const colliders = new Colliders();
  const anchors: V3[] = [];
  const rnd = mulberry32(20261003);
  const plan = buildPlan();
  let triangles = 0;

  // --- sky, ground, water ---------------------------------------------------
  const sky = new THREE.Mesh(new THREE.SphereGeometry(10, 24, 12), skyMaterial());
  sky.frustumCulled = false;
  sky.renderOrder = -10;
  group.add(sky);
  group.add(buildGround());
  const water = new THREE.Mesh(new THREE.PlaneGeometry(2600, 2000), waterMaterial());
  water.rotation.x = -Math.PI / 2;
  water.position.y = WATER_Y;
  water.frustumCulled = false;
  group.add(water);

  // --- landmarks, bridges, cranes: one merged mesh --------------------------
  const flat = toonMaterial({ vertexColors: true });
  const lb = new Builder(colliders, anchors);
  const { wheel } = buildLandmarks(lb, flat);
  for (const [x, z, yaw, h] of plan.cranes) buildCrane(lb, x, z, yaw, h);
  triangles += lb.vertexCount / 3;
  const landmarkMesh = lb.build(flat);
  landmarkMesh.frustumCulled = false;
  wheel.name = 'eye-wheel';
  group.add(landmarkMesh, wheel);

  // --- ground layers: parks, plazas, pavements, lawns, road markings -----------
  const parks = new MeshData();
  const paving = new MeshData();
  const overlay = new MeshData();
  const fan = (md: MeshData, cx: number, cz: number, rx: number, rz: number, color: number, seg = 40): void => {
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2;
      const a1 = ((i + 1) / seg) * Math.PI * 2;
      md.tri([cx, 0, cz], [cx + Math.cos(a1) * rx, 0, cz + Math.sin(a1) * rz], [cx + Math.cos(a0) * rx, 0, cz + Math.sin(a0) * rz], color);
    }
  };
  for (const [px, pz, rx, rz] of PARKS) fan(parks, px, pz, rx, rz, 0x9ccb78);
  for (const [cx, cz, r] of EXCLUSIONS) fan(paving, cx, cz, r - 5, r - 5, 0xe6dac1, 36);
  for (const blk of plan.blocks) {
    const p = blk.pts.map(([x, z]) => [x, 0, z]);
    const up = (p[1][0] - p[0][0]) * (p[2][2] - p[0][2]) - (p[1][2] - p[0][2]) * (p[2][0] - p[0][0]) < 0;
    const q = up ? p : [p[0], p[3], p[2], p[1]];
    paving.quad(q[0], q[1], q[2], q[3], blk.kind === 'site' ? 0xd8c7a0 : 0xdbd0ba);
    if (blk.kind === 'square') {
      const k = 0.13;
      const c = [blk.cx, 0, blk.cz];
      const inn = q.map((v) => [v[0] + (c[0] - v[0]) * k, 0, v[2] + (c[2] - v[2]) * k]);
      overlay.quad(inn[0], inn[1], inn[2], inn[3], 0x93c573);
    }
  }
  // dashed centre lines on the main roads
  for (const road of plan.roads) {
    for (let i = 0; i < road.pts.length - 1; i++) {
      const [x1, z1] = road.pts[i];
      const [x2, z2] = road.pts[i + 1];
      const len = Math.hypot(x2 - x1, z2 - z1);
      const ux = (x2 - x1) / len;
      const uz = (z2 - z1) / len;
      for (let t = 12; t < len - 12; t += 8) {
        const ax = x1 + ux * t;
        const az = z1 + uz * t;
        const bx = ax + ux * 3;
        const bz = az + uz * 3;
        const wx = -uz * 0.18;
        const wz = ux * 0.18;
        overlay.quad([ax - wx, 0, az - wz], [bx - wx, 0, bz - wz], [bx + wx, 0, bz + wz], [ax + wx, 0, az + wz], 0xf2ead6);
      }
    }
  }
  triangles += parks.triangles + paving.triangles + overlay.triangles;
  group.add(
    parks.flatUp().build(toonMaterial({ vertexColors: true, ground: true, layer: 1, side: THREE.DoubleSide })),
    paving.flatUp().build(toonMaterial({ vertexColors: true, ground: true, layer: 2, side: THREE.DoubleSide })),
    overlay.flatUp().build(toonMaterial({ vertexColors: true, layer: 3, side: THREE.DoubleSide })),
  );

  // --- buildings: one merged mesh with procedural facades ------------------------
  const walls = new MeshData(true);
  const chimneys: { x: number; y: number; z: number; yaw: number; color: number }[] = [];
  const addBuilding = (b: Building): void => {
    const c = Math.cos(b.yaw);
    const s = Math.sin(b.yaw);
    const P = (lx: number, y: number, lz: number): number[] => [b.x + lx * c + lz * s, y, b.z - lx * s + lz * c];
    const { hx, hz, y0, h } = b;
    const wallH = h - y0;
    const style = b.y0 > 0 ? -1 : b.style;
    // four walls: (start corner, end corner) walking right as seen from outside
    const faces: [number, number, number, number][] = [
      [-hx, hz, hx, hz], // +z
      [hx, hz, hx, -hz], // +x
      [hx, -hz, -hx, -hz], // -z
      [-hx, -hz, -hx, hz], // -x
    ];
    for (const [ax, az, bx, bz] of faces) {
      const len = Math.hypot(bx - ax, bz - az);
      // centre the window bays on the wall
      const off = style === Style.Glass ? 0 : ((len % 6.4) / 2);
      walls.quad(
        P(ax, y0, az), P(bx, y0, bz), P(bx, h, bz), P(ax, h, az), b.color,
        [off, 0, wallH, style], [off + len, 0, wallH, style], [off + len, wallH, wallH, style], [off, wallH, wallH, style],
      );
    }
    if (b.roof === 'gable') {
      const r = h + b.roofH;
      walls.quad(P(-hx, h, -hz), P(-hx, r, 0), P(hx, r, 0), P(hx, h, -hz), b.roofColor);
      walls.quad(P(-hx, h, hz), P(hx, h, hz), P(hx, r, 0), P(-hx, r, 0), b.roofColor);
      walls.tri(P(-hx, h, -hz), P(-hx, h, hz), P(-hx, r, 0), b.color);
      walls.tri(P(hx, h, hz), P(hx, h, -hz), P(hx, r, 0), b.color);
    } else if (b.roof === 'hip') {
      const e = Math.min(3, hz - 0.8, hx - 0.8);
      const r = h + b.roofH;
      walls.quad(P(-hx, h, -hz), P(-hx + e, r, -hz + e), P(hx - e, r, -hz + e), P(hx, h, -hz), b.roofColor);
      walls.quad(P(-hx, h, hz), P(hx, h, hz), P(hx - e, r, hz - e), P(-hx + e, r, hz - e), b.roofColor);
      walls.quad(P(-hx, h, -hz), P(-hx, h, hz), P(-hx + e, r, hz - e), P(-hx + e, r, -hz + e), b.roofColor);
      walls.quad(P(hx, h, hz), P(hx, h, -hz), P(hx - e, r, -hz + e), P(hx - e, r, hz - e), b.roofColor);
      walls.quad(P(-hx + e, r, -hz + e), P(-hx + e, r, hz - e), P(hx - e, r, hz - e), P(hx - e, r, -hz + e), 0x8f8c88);
    } else {
      walls.quad(P(-hx, h, -hz), P(-hx, h, hz), P(hx, h, hz), P(hx, h, -hz), b.roofColor);
    }
    if (b.chimneys) {
      for (let t = -hx + 3.2; t < hx - 1; t += 12.8) {
        const [x, , z] = P(t, 0, 0);
        chimneys.push({ x, y: h + b.roofH - 1, z, yaw: b.yaw, color: b.color });
        if (!b.scenery) colliders.add(x, z, 0.45, 0.85, h + b.roofH - 1, h + b.roofH + 1.6, { yaw: b.yaw });
      }
    }
    if (b.scenery) return;

    // collision that matches what is drawn, roof included
    if (b.roof === 'gable') colliders.add(b.x, b.z, hx, hz, y0, h, { yaw: b.yaw, cap: Cap.Slope, capH: b.roofH, ez: hz });
    else if (b.roof === 'hip') {
      const e = Math.min(3, hz - 0.8, hx - 0.8);
      colliders.add(b.x, b.z, hx, hz, y0, h, { yaw: b.yaw, cap: Cap.Slope, capH: b.roofH, ex: e, ez: e });
    } else colliders.add(b.x, b.z, hx, hz, y0, h, { yaw: b.yaw });

    // swing anchors along the eaves (and up the corners of towers)
    if (b.y0 > 0) return;
    const out = 0.15;
    const n = Math.max(1, Math.round((2 * hx) / 7.5));
    for (let i = 0; i <= n; i++) {
      const t = -hx + (2 * hx * i) / n;
      for (const sz of [-1, 1]) {
        const [x, , z] = P(t, 0, sz * (hz + out));
        anchors.push({ x, y: h, z });
      }
    }
    if (b.tower) {
      for (const sx of [-1, 1]) {
        const [x, , z] = P(sx * (hx + out), 0, 0);
        anchors.push({ x, y: h, z });
      }
      for (let y = 22; y < h - 10; y += 20) {
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
          const [x, , z] = P(sx * (hx + out), 0, sz * (hz + out));
          anchors.push({ x, y, z });
        }
      }
    }
  };
  for (const b of plan.buildings) addBuilding(b);
  triangles += walls.triangles;
  group.add(walls.build(toonMaterial({ vertexColors: true, walls: true })));

  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const col = new THREE.Color();
  const e = new THREE.Euler();
  const chimGeo = new THREE.BoxGeometry(0.9, 2.6, 1.7);
  chimGeo.translate(0, 1.3, 0);
  chimGeo.deleteAttribute('uv');
  const chimMesh = new THREE.InstancedMesh(chimGeo, toonMaterial(), chimneys.length);
  chimneys.forEach((ch, i) => {
    q.setFromEuler(e.set(0, ch.yaw, 0));
    m4.compose(new THREE.Vector3(ch.x, ch.y, ch.z), q, new THREE.Vector3(1, 1, 1));
    chimMesh.setMatrixAt(i, m4);
    chimMesh.setColorAt(i, col.setHex(ch.color).multiplyScalar(0.82));
  });
  chimMesh.frustumCulled = false;
  group.add(chimMesh);
  triangles += chimneys.length * 12;

  // --- trees and lampposts --------------------------------------------------
  const trees: [number, number, number][] = plan.trees.slice();
  const lamps: [number, number][] = [];
  for (const [px, pz, rx, rz] of PARKS) {
    const n = Math.round((rx * rz) / 150);
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2;
      const rr = Math.sqrt(rnd()) * 0.95;
      const x = px + Math.cos(a) * rx * rr;
      const z = pz + Math.sin(a) * rz * rr;
      const s = 0.8 + rnd() * 0.7;
      if (riverDist(x, z) < RIVER_HALF_WIDTH + 6 || nearPlaza(x, z) || colliders.topAt(x, z) > -1) continue;
      trees.push([x, z, s]);
    }
  }
  // Embankment promenade: alternate plane trees and lampposts along both banks.
  const P = RIVER_PATH;
  let acc = 0;
  let n = 0;
  for (let i = 0; i < P.length - 2; i += 2) {
    const dx = P[i + 2] - P[i];
    const dz = P[i + 3] - P[i + 1];
    const len = Math.hypot(dx, dz);
    acc += len;
    while (acc > 13) {
      acc -= 13;
      const t = 1 - acc / len;
      const x = P[i] + dx * t;
      const z = P[i + 1] + dz * t;
      n++;
      for (const side of [-1, 1]) {
        const ox = x + ((-dz / len) * side) * (RIVER_HALF_WIDTH + 6.5);
        const oz = z + ((dx / len) * side) * (RIVER_HALF_WIDTH + 6.5);
        if (ox < MAP.minX || ox > MAP.maxX || oz < MAP.minZ || oz > MAP.maxZ) continue;
        if (riverInfo(ox, oz).dist < RIVER_HALF_WIDTH + 5) continue;
        if (colliders.topAt(ox, oz) > -1) continue;
        if (n % 2 === 0) trees.push([ox, oz, 0.75 + rnd() * 0.3]);
        else lamps.push([ox, oz]);
      }
    }
  }

  const trunkGeo = new THREE.CylinderGeometry(0.28, 0.4, 3.2, 5);
  trunkGeo.translate(0, 1.6, 0);
  const crownGeo = new THREE.IcosahedronGeometry(2.6, 0);
  crownGeo.translate(0, 5, 0);
  const trunkMesh = new THREE.InstancedMesh(trunkGeo, toonMaterial({ tint: 0x7a5a44 }), trees.length);
  const crownMesh = new THREE.InstancedMesh(crownGeo, toonMaterial(), trees.length);
  trees.forEach(([x, z, s], i) => {
    q.setFromEuler(e.set(0, rnd() * 6.28, 0));
    m4.compose(new THREE.Vector3(x, 0, z), q, new THREE.Vector3(s, s, s));
    trunkMesh.setMatrixAt(i, m4);
    m4.compose(new THREE.Vector3(x, 0, z), q, new THREE.Vector3(s * (0.9 + rnd() * 0.3), s, s * (0.9 + rnd() * 0.3)));
    crownMesh.setMatrixAt(i, m4);
    const autumn = inPark(x, z) ? 0.3 : 0.45;
    crownMesh.setColorAt(i, col.setHex(LEAVES[rnd() < autumn ? 3 + Math.floor(rnd() * 3) : Math.floor(rnd() * 3)]));
  });
  q.identity();
  trunkMesh.frustumCulled = false;
  crownMesh.frustumCulled = false;
  group.add(trunkMesh, crownMesh);
  triangles += trees.length * 30;

  const lampB = new Builder(null, null).at(0, 0);
  lampB.cyl(0, 0, 0, 0.12, 0.2, 7, 0x2f343c, 6);
  lampB.cyl(0, 0, 0, 0.32, 0.36, 0.9, 0x2f343c, 6);
  lampB.box(0, 6.2, 0, 1.6, 0.14, 0.14, 0x2f343c);
  lampB.sphere(-0.8, 6.9, 0, 0.36, 0xfff0bd, 1.2, 6);
  lampB.sphere(0.8, 6.9, 0, 0.36, 0xfff0bd, 1.2, 6);
  lampB.sphere(0, 7.5, 0, 0.42, 0xfff0bd, 1.2, 6);
  const lampGeo = lampB.build(flat).geometry;
  const lampMesh = new THREE.InstancedMesh(lampGeo, flat, lamps.length);
  lamps.forEach(([x, z], i) => {
    const r = riverInfo(x, z);
    q.setFromEuler(e.set(0, Math.atan2(-r.tz, r.tx), 0));
    m4.compose(new THREE.Vector3(x, 0, z), q, new THREE.Vector3(1, 1, 1));
    lampMesh.setMatrixAt(i, m4);
    anchors.push({ x, y: 7.6, z });
  });
  q.identity();
  lampMesh.frustumCulled = false;
  group.add(lampMesh);

  // --- clouds ---------------------------------------------------------------
  const puffs: [number, number, number, number, number][] = [];
  for (let i = 0; i < 16; i++) {
    const cx = (rnd() - 0.5) * 2600;
    const cz = (rnd() - 0.5) * 2200;
    const cy = 240 + rnd() * 120;
    const k = 3 + Math.floor(rnd() * 3);
    for (let j = 0; j < k; j++) puffs.push([cx + (j - k / 2) * 34 + rnd() * 10, cy + rnd() * 8, cz + rnd() * 20, 24 + rnd() * 22, 0.34 + rnd() * 0.12]);
  }
  const cloudMesh = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(1, 1),
    new THREE.MeshBasicMaterial({ color: 0xfff6ea, transparent: true, opacity: 0.92, depthWrite: false }),
    puffs.length,
  );
  puffs.forEach(([x, y, z, s, sy], i) => {
    m4.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(s * 1.5, s * sy, s));
    cloudMesh.setMatrixAt(i, m4);
  });
  cloudMesh.frustumCulled = false;
  group.add(cloudMesh);

  // --- anchor spatial hash --------------------------------------------------
  const agrid = new Map<number, V3[]>();
  for (const a of anchors) {
    const k = akey(Math.floor(a.x / ACELL), Math.floor(a.z / ACELL));
    let cell = agrid.get(k);
    if (!cell) agrid.set(k, (cell = []));
    cell.push(a);
  }
  const near: V3[] = [];
  const anchorsNear = (x: number, z: number, radius: number): V3[] => {
    near.length = 0;
    const x0 = Math.floor((x - radius) / ACELL);
    const x1 = Math.floor((x + radius) / ACELL);
    const z0 = Math.floor((z - radius) / ACELL);
    const z1 = Math.floor((z + radius) / ACELL);
    for (let ix = x0; ix <= x1; ix++) {
      for (let iz = z0; iz <= z1; iz++) {
        const cell = agrid.get(akey(ix, iz));
        if (cell) for (let i = 0; i < cell.length; i++) near.push(cell[i]);
      }
    }
    return near;
  };

  return {
    group,
    colliders,
    anchors,
    plan,
    anchorsNear,
    update(time, camera) {
      shared.uTime.value = time;
      sky.position.copy(camera.position);
      wheel.rotation.z = time * 0.03;
      cloudMesh.position.x = Math.sin(time * 0.004) * 220;
    },
    stats: { buildings: plan.buildings.length, anchors: anchors.length, colliders: colliders.solids.length, triangles: Math.round(triangles) },
  };
}

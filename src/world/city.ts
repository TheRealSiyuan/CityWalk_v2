import * as THREE from 'three';
import { Builder, GABLE } from './builder';
import { Colliders } from './colliders';
import { buildLandmarks, CRANES } from './landmarks';
import { EXTRA_CLEAR, LANDMARKS, PARKS, inPark } from './data';
import { MAP, RIVER_HALF_WIDTH, RIVER_PATH, WATER_Y, heightFromRiverDist, riverDist, riverInfo } from './river';
import { shared, skyMaterial, toonMaterial, waterMaterial } from '../render/materials';
import type { V3 } from '../physics/swing';

/** Deterministic RNG so every player (and every test run) sees the same city. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PITCH = 46; // street grid pitch (matches the ground shader)
const BLOCK = 33; // buildable width inside a cell
const ACELL = 32;
/** The city keeps going (as scenery only) this far past the walkable map edge. */
const SKIRT = 215;
const akey = (ix: number, iz: number) => (ix + 512) * 2048 + (iz + 512);

const WALLS = [0xead8b4, 0xdcab7e, 0xc97e5f, 0xe8c98f, 0xbcc8cc, 0xdabca4, 0xb07c60, 0xf0e5cb, 0xd9b9a8, 0xcdd2bd];
const GLASSY = [0x9dbfd1, 0xb6cfd8, 0x8fb0c4, 0xc7d6d6, 0xa9c2b8];
const ROOFS = [0x8c5a4a, 0x6f7783, 0xa66a52, 0x7d6a63];
const LEAVES = [0x86b86a, 0x6fa85e, 0x9cc76f, 0xd9a441, 0xe0803c, 0xb5c85a];

export interface World {
  group: THREE.Group;
  colliders: Colliders;
  anchors: V3[];
  /** Anchors within reach of a point (shared scratch array). */
  anchorsNear(x: number, z: number, radius: number): V3[];
  update(time: number, camera: THREE.Camera): void;
  stats: { buildings: number; anchors: number; colliders: number };
}

function clearOfLandmarks(x: number, z: number, pad: number): boolean {
  for (const l of LANDMARKS) if (Math.hypot(x - l.x, z - l.z) < l.clear + pad) return false;
  for (const [cx, cz, r] of EXTRA_CLEAR) if (Math.hypot(x - cx, z - cz) < r + pad) return false;
  return true;
}

function buildGround(): THREE.Mesh {
  const STEP = 8;
  const pad = 300;
  const x0 = MAP.minX - pad;
  const z0 = MAP.minZ - pad;
  const nx = Math.ceil((MAP.maxX - MAP.minX + 2 * pad) / STEP);
  const nz = Math.ceil((MAP.maxZ - MAP.minZ + 2 * pad) / STEP);
  const count = (nx + 1) * (nz + 1);
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const street = new Float32Array(count);
  const nor = new Float32Array(count * 3);
  const pave = new THREE.Color(0xe2d3b4);
  const grass = new THREE.Color(0x9ecb78);
  const stone = new THREE.Color(0xcfc4ab);
  const bed = new THREE.Color(0x9a8f78);
  const plaza = new THREE.Color(0xe9dcc2);
  const c = new THREE.Color();
  let i = 0;
  for (let iz = 0; iz <= nz; iz++) {
    for (let ix = 0; ix <= nx; ix++, i++) {
      const x = x0 + ix * STEP;
      const z = z0 + iz * STEP;
      const d = riverDist(x, z);
      const y = heightFromRiverDist(d);
      pos[i * 3] = x;
      pos[i * 3 + 1] = y;
      pos[i * 3 + 2] = z;
      nor[i * 3 + 1] = 1;
      const park = inPark(x, z);
      const open = !clearOfLandmarks(x, z, -14);
      const bank = d < RIVER_HALF_WIDTH + 15;
      const outside = x < MAP.minX - SKIRT || x > MAP.maxX + SKIRT || z < MAP.minZ - SKIRT || z > MAP.maxZ + SKIRT;
      if (y < -0.5) c.copy(stone).lerp(bed, Math.min(1, -y / 3));
      else if (park || outside) c.copy(grass);
      else if (bank) c.copy(stone);
      else if (open) c.copy(plaza);
      else c.copy(pave);
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
      street[i] = park || open || bank || outside ? 0 : 1;
    }
  }
  const idx = new Uint32Array(nx * nz * 6);
  let k = 0;
  for (let iz = 0; iz < nz; iz++) {
    for (let ix = 0; ix < nx; ix++) {
      const a = iz * (nx + 1) + ix;
      const b = a + 1;
      const d = a + nx + 1;
      const e = d + 1;
      idx[k++] = a; idx[k++] = d; idx[k++] = b;
      idx[k++] = b; idx[k++] = d; idx[k++] = e;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aStreet', new THREE.BufferAttribute(street, 1));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  const m = new THREE.Mesh(g, toonMaterial({ vertexColors: true, ground: true }));
  m.frustumCulled = false;
  m.matrixAutoUpdate = false;
  return m;
}

export function buildWorld(): World {
  const group = new THREE.Group();
  const colliders = new Colliders();
  const anchors: V3[] = [];
  const rnd = mulberry32(20261003);

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
  const landmarkMesh = lb.build(flat);
  landmarkMesh.frustumCulled = false;
  group.add(landmarkMesh, wheel);

  // --- generic buildings: instanced ----------------------------------------
  interface B { x: number; z: number; sx: number; sz: number; h: number; color: number; roof: number; scenery: boolean }
  const list: B[] = [];
  const craneCells = new Set(CRANES.map(([x, z]) => `${Math.round(x / PITCH)},${Math.round(z / PITCH)}`));
  const ix0 = Math.ceil((MAP.minX - SKIRT + 30) / PITCH);
  const ix1 = Math.floor((MAP.maxX + SKIRT - 30) / PITCH);
  const iz0 = Math.ceil((MAP.minZ - SKIRT + 30) / PITCH);
  const iz1 = Math.floor((MAP.maxZ + SKIRT - 30) / PITCH);
  for (let ix = ix0; ix <= ix1; ix++) {
    for (let iz = iz0; iz <= iz1; iz++) {
      const cx = ix * PITCH;
      const cz = iz * PITCH;
      // consume the same number of randoms per cell so the layout is stable
      const r = [rnd(), rnd(), rnd(), rnd(), rnd(), rnd(), rnd(), rnd(), rnd(), rnd(), rnd(), rnd()];
      if (craneCells.has(`${ix},${iz}`)) continue;
      // The City (financial district) and the South Bank run taller.
      const cityness = Math.max(0, 1 - Math.hypot(cx - 400, cz + 170) / 260);
      const westEnd = Math.max(0, 1 - Math.hypot(cx + 150, cz + 200) / 400);
      const split = r[0] < 0.3 ? 1 : r[0] < 0.62 ? 2 : r[0] < 0.84 ? 3 : 4;
      const parts: [number, number, number, number][] = [];
      const gap = 1.2;
      const half = (BLOCK - gap) / 2;
      const q = BLOCK / 4 + gap / 4;
      if (split === 1) parts.push([0, 0, BLOCK, BLOCK]);
      else if (split === 2) parts.push([-q, 0, half, BLOCK], [q, 0, half, BLOCK]);
      else if (split === 3) parts.push([0, -q, BLOCK, half], [0, q, BLOCK, half]);
      else parts.push([-q, -q, half, half], [q, -q, half, half], [-q, q, half, half], [q, q, half, half]);
      parts.forEach(([ox, oz, sx, sz], n) => {
        const x = cx + ox;
        const z = cz + oz;
        const rad = Math.hypot(sx, sz) / 2;
        if (riverDist(x, z) < RIVER_HALF_WIDTH + 13 + rad) return;
        if (!clearOfLandmarks(x, z, rad - 4)) return;
        if (inPark(x, z) || inPark(x + sx / 2, z + sz / 2) || inPark(x - sx / 2, z - sz / 2)) return;
        const rv = r[1 + n * 2];
        const rc = r[2 + n * 2];
        let h = 11 + rv * 17 + westEnd * 6;
        let color: number;
        if (cityness > 0.15 && rv > 0.45) {
          h = 30 + rv * 70 * cityness + 14;
          color = GLASSY[Math.floor(rc * GLASSY.length)];
        } else {
          if (rv > 0.93) h += 16;
          color = WALLS[Math.floor(rc * WALLS.length)];
        }
        const roof = h < 24 && rc > 0.35 ? ROOFS[Math.floor(r[9 + (n % 3)] * ROOFS.length)] : -1;
        const scenery = x < MAP.minX - 4 || x > MAP.maxX + 4 || z < MAP.minZ - 4 || z > MAP.maxZ + 4;
        list.push({ x, z, sx, sz, h, color, roof, scenery });
      });
    }
  }

  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  boxGeo.translate(0, 0.5, 0);
  boxGeo.deleteAttribute('uv');
  const bMesh = new THREE.InstancedMesh(boxGeo, toonMaterial({ windows: true }), list.length);
  const roofCount = list.filter((b) => b.roof >= 0).length;
  const rMesh = new THREE.InstancedMesh(GABLE, toonMaterial(), roofCount);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const qy = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
  const col = new THREE.Color();
  let ri = 0;
  list.forEach((b, i) => {
    m4.compose(new THREE.Vector3(b.x, 0, b.z), q, new THREE.Vector3(b.sx, b.h, b.sz));
    bMesh.setMatrixAt(i, m4);
    bMesh.setColorAt(i, col.setHex(b.color));
    let top = b.h;
    if (b.roof >= 0) {
      const alongZ = b.sz > b.sx;
      const rh = 3.2 + (Math.min(b.sx, b.sz) / BLOCK) * 2.4;
      m4.compose(
        new THREE.Vector3(b.x, b.h, b.z),
        alongZ ? qy : q,
        new THREE.Vector3(alongZ ? b.sz : b.sx, rh, alongZ ? b.sx : b.sz).addScalar(0.7),
      );
      rMesh.setMatrixAt(ri, m4);
      rMesh.setColorAt(ri, col.setHex(b.roof));
      ri++;
      top = b.h + 0.4;
    }
    if (b.scenery) return; // beyond the walkable edge: no collision or anchors needed
    colliders.add(b.x, b.z, b.sx / 2, b.sz / 2, 0, b.h);
    const ax = b.sx / 2 - 0.4;
    const az = b.sz / 2 - 0.4;
    anchors.push(
      { x: b.x - ax, y: top, z: b.z - az },
      { x: b.x + ax, y: top, z: b.z - az },
      { x: b.x - ax, y: top, z: b.z + az },
      { x: b.x + ax, y: top, z: b.z + az },
    );
  });
  bMesh.instanceMatrix.needsUpdate = true;
  rMesh.instanceMatrix.needsUpdate = true;
  bMesh.frustumCulled = false;
  rMesh.frustumCulled = false;
  group.add(bMesh, rMesh);

  // --- trees and lampposts --------------------------------------------------
  const trees: [number, number, number][] = [];
  const lamps: [number, number][] = [];
  for (const [px, pz, rx, rz] of PARKS) {
    const n = Math.round((rx * rz) / 150);
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2;
      const rr = Math.sqrt(rnd()) * 0.95;
      const x = px + Math.cos(a) * rx * rr;
      const z = pz + Math.sin(a) * rz * rr;
      const s = 0.8 + rnd() * 0.7;
      if (riverDist(x, z) < RIVER_HALF_WIDTH + 6 || !clearOfLandmarks(x, z, -38)) continue;
      trees.push([x, z, s]);
    }
  }
  // Embankment promenade: alternate trees and lampposts along both banks.
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
        const ox = x + ((-dz / len) * side) * (RIVER_HALF_WIDTH + 7.5);
        const oz = z + ((dx / len) * side) * (RIVER_HALF_WIDTH + 7.5);
        if (ox < MAP.minX || ox > MAP.maxX || oz < MAP.minZ || oz > MAP.maxZ) continue;
        if (riverInfo(ox, oz).dist < RIVER_HALF_WIDTH + 6) continue;
        if (colliders.topAt(ox, oz) > -1 || !clearOfLandmarks(ox, oz, -50)) continue;
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
  const e = new THREE.Euler();
  trees.forEach(([x, z, s], i) => {
    q.setFromEuler(e.set(0, rnd() * 6.28, 0));
    m4.compose(new THREE.Vector3(x, 0, z), q, new THREE.Vector3(s, s, s));
    trunkMesh.setMatrixAt(i, m4);
    m4.compose(new THREE.Vector3(x, 0, z), q, new THREE.Vector3(s * (0.9 + rnd() * 0.3), s, s * (0.9 + rnd() * 0.3)));
    crownMesh.setMatrixAt(i, m4);
    crownMesh.setColorAt(i, col.setHex(LEAVES[Math.floor(rnd() * LEAVES.length)]));
  });
  q.identity();
  trunkMesh.frustumCulled = false;
  crownMesh.frustumCulled = false;
  group.add(trunkMesh, crownMesh);

  const lampB = new Builder(null, null).at(0, 0);
  lampB.cyl(0, 0, 0, 0.12, 0.2, 7, 0x3f4650, 6);
  lampB.box(0.6, 6.8, 0, 1.4, 0.16, 0.16, 0x3f4650);
  lampB.sphere(1.2, 6.5, 0, 0.42, 0xfff0bd, 1, 6);
  const lampGeo = lampB.build(flat).geometry;
  const lampMesh = new THREE.InstancedMesh(lampGeo, flat, lamps.length);
  lamps.forEach(([x, z], i) => {
    m4.makeTranslation(x, 0, z);
    lampMesh.setMatrixAt(i, m4);
    anchors.push({ x, y: 7.2, z });
  });
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
    anchorsNear,
    update(time, camera) {
      shared.uTime.value = time;
      sky.position.copy(camera.position);
      wheel.rotation.z = time * 0.03;
      cloudMesh.position.x = Math.sin(time * 0.004) * 220;
    },
    stats: { buildings: list.length, anchors: anchors.length, colliders: colliders.boxes.length },
  };
}

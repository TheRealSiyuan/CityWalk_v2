import * as THREE from 'three';
import { Builder } from './builder';
import { riverInfo, RIVER_HALF_WIDTH } from './river';
import { BRIDGES } from './data';

const STONE = 0xe6dcc3;
const SAND = 0xdcbb7c;
const SAND_D = 0xc9a561;
const SLATE = 0x5a6877;
const WHITE = 0xf6f2e8;
const GOLD = 0xedbb45;
const BRICK = 0xa86c4a;
const GLASS = 0x9cc6da;
const LEAD = 0x93a5ae;
const DARK = 0x4b4d57;
const SKYBLUE = 0x74b3d8;
const RED = 0xc5524c;
const PI = Math.PI;

/** Yaw that points a builder's local +x across the river at (x,z). */
function acrossRiver(x: number, z: number): { cx: number; cz: number; yaw: number } {
  const r = riverInfo(x, z);
  // normal = (-tz, tx); local x -> (cos θ, -sin θ)
  return { cx: r.cx, cz: r.cz, yaw: Math.atan2(-r.tx, -r.tz) };
}

function bigBen(b: Builder): void {
  b.at(-311, 230);
  // Elizabeth Tower
  b.box(0, 0, 0, 10, 5, 10, SAND_D);
  b.box(0, 0, 0, 8.4, 42, 8.4, SAND, { solid: true });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(sx * 4, 0, sz * 4, 1.2, 42, 1.2, SAND_D);
  b.box(0, 42, 0, 10.4, 9, 10.4, SAND_D, { solid: true });
  for (const s of [-1, 1]) {
    b.disc(s * 5.3, 46.5, 0, 3.5, WHITE, 'x');
    b.disc(0, 46.5, s * 5.3, 3.5, WHITE, 'z');
    b.box(s * 5.5, 46.4, 0, 0.2, 3, 0.36, DARK);
    b.box(s * 5.5, 46.3, s * 0.9, 0.2, 0.36, 2, DARK);
    b.box(0, 46.4, s * 5.5, 0.36, 3, 0.2, DARK);
    b.box(-s * 0.9, 46.3, s * 5.5, 2, 0.36, 0.2, DARK);
  }
  b.pyr(0, 51, 0, 10.6, 6.5, SLATE, 5.2);
  b.box(0, 57.5, 0, 5, 3.2, 5, GOLD);
  b.pyr(0, 60.7, 0, 5.6, 10.5, SLATE);
  b.cyl(0, 71, 0, 0.14, 0.14, 2.6, GOLD, 5);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    b.pyr(sx * 4.8, 51, sz * 4.8, 1.3, 4, GOLD);
    b.anchor(sx * 5.6, 51, sz * 5.6);
  }
  b.anchor(0, 72, 0);

  // Palace of Westminster stretching south along the river
  b.box(5, 0, 47, 24, 15, 76, SAND, { solid: true });
  b.roof(5, 15, 47, 76, 5, 24, SLATE, PI / 2);
  for (let z = 12; z <= 82; z += 10) {
    b.box(17.4, 0, z, 1.5, 19, 1.5, SAND_D);
    b.pyr(17.4, 19, z, 1.5, 3.5, SAND_D);
    b.box(-7.4, 0, z, 1.5, 19, 1.5, SAND_D);
    b.pyr(-7.4, 19, z, 1.5, 3.5, SAND_D);
  }
  b.box(5, 15, 47, 7, 12, 7, SAND);
  b.pyr(5, 27, 47, 7.4, 13, SLATE);
  // Victoria Tower
  b.box(3, 0, 93, 14, 44, 14, SAND, { solid: true });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    b.box(3 + sx * 6.4, 0, 93 + sz * 6.4, 2.2, 49, 2.2, SAND_D);
    b.pyr(3 + sx * 6.4, 49, 93 + sz * 6.4, 2.2, 4.5, SAND_D);
    b.anchor(3 + sx * 7, 45, 93 + sz * 7);
  }
  b.cyl(3, 44, 93, 0.16, 0.16, 11, WHITE, 5);
  b.box(3, 52, 94.6, 0.14, 2, 3, RED);
  for (const z of [16, 47, 78]) for (const s of [-1, 1]) b.anchor(5 + s * 12.4, 16, z);
  b.anchor(5, 40, 47);
}

/** Returns the rotating wheel as its own mesh. */
function londonEye(b: Builder, wheelMat: THREE.Material): THREE.Mesh {
  const X = -200;
  const Z = 150;
  const r = riverInfo(X, Z);
  // local x along the river (wheel plane), local +z pointing inland (east)
  let yaw = Math.atan2(-r.tz, r.tx);
  const inlandX = Math.sin(yaw);
  if (inlandX * (X - r.cx) + Math.cos(yaw) * (Z - r.cz) < 0) yaw += PI;
  b.at(X, Z, yaw);
  const HUB = 44;
  const R = 38;
  b.beam(-15, 0, 24, 0, HUB, 4, 1.5, WHITE);
  b.beam(15, 0, 24, 0, HUB, 4, 1.5, WHITE);
  b.beam(0, HUB, 5, 0, HUB, -1.5, 2.2, WHITE);
  b.beam(0, HUB, 4, 0, 0, 40, 0.35, 0xdfe6ea);
  b.box(0, 0, -3, 46, 2.4, 9, 0xd8dde0, { solid: true });
  b.box(0, 2.4, -3, 30, 2.6, 5, GLASS);
  b.solid(-15, 24, 1.6, 1.6, 0, 5);
  b.solid(15, 24, 1.6, 1.6, 0, 5);
  b.anchor(0, HUB, 0);
  b.anchor(0, HUB + R, 0);
  for (const s of [-1, 1]) {
    b.anchor(s * R, HUB, 0);
    b.anchor(s * R * 0.707, HUB + R * 0.707, 0);
    b.anchor(s * R * 0.707, HUB - R * 0.707 + 4, 0);
  }

  const w = new Builder(null, null).at(0, 0, 0);
  w.torus(0, 0, 0, R, 0.75, WHITE, 56);
  w.torus(0, 0, 0, R - 2.6, 0.32, 0xdfe6ea, 40);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * PI * 2;
    w.beam(0, 0, 0, Math.cos(a) * (R - 1), Math.sin(a) * (R - 1), 0, 0.22, 0xdfe6ea);
  }
  w.add(new THREE.CylinderGeometry(2.4, 2.4, 4.4, 12), WHITE, new THREE.Matrix4().makeRotationX(PI / 2));
  for (let i = 0; i < 32; i++) {
    const a = (i / 32) * PI * 2;
    const g = new THREE.SphereGeometry(1.75, 7, 5);
    g.scale(1.35, 1, 1);
    const m = new THREE.Matrix4().makeRotationZ(a + PI / 2).setPosition(Math.cos(a) * (R + 2.3), Math.sin(a) * (R + 2.3), 0);
    w.add(g, 0xc4e6f4, m);
  }
  const wheel = w.build(wheelMat);
  wheel.matrixAutoUpdate = true;
  wheel.rotation.order = 'YXZ';
  wheel.rotation.y = yaw;
  wheel.position.set(X, HUB, Z);
  wheel.frustumCulled = false;
  return wheel;
}

function abbey(b: Builder): void {
  b.at(-372, 286);
  b.box(2, 0, 0, 54, 19, 13, STONE, { solid: true });
  b.roof(2, 19, 0, 54, 6, 13, LEAD);
  b.box(10, 0, 0, 12, 19, 36, STONE, { solid: true });
  b.roof(10, 19, 0, 36, 6, 12, LEAD, PI / 2);
  b.box(10, 19, 0, 8, 8, 8, STONE);
  b.pyr(10, 27, 0, 8.4, 5, LEAD);
  b.cyl(32, 0, 0, 6.5, 6.5, 17, STONE, 10, { solid: true });
  b.cyl(32, 17, 0, 0, 6.8, 5, LEAD, 10);
  for (const s of [-1, 1]) {
    // west towers
    b.box(-25, 0, s * 6.6, 7.6, 37, 7.6, STONE, { solid: true });
    b.box(-25, 37, s * 6.6, 8.2, 1.2, 8.2, 0xd6caa9);
    for (const ax of [-1, 1]) for (const az of [-1, 1]) b.pyr(-25 + ax * 3.3, 38.2, s * 6.6 + az * 3.3, 1.5, 6, STONE);
    b.box(-28.9, 22, s * 6.6, 0.3, 9, 2.4, DARK);
    b.anchor(-25, 44, s * 6.6);
    // buttress pinnacles along the nave
    for (let x = -14; x <= 26; x += 8) {
      if (Math.abs(x - 10) < 7) continue;
      b.box(x, 0, s * 7.6, 1.3, 22, 1.3, 0xd6caa9);
      b.pyr(x, 22, s * 7.6, 1.3, 3.4, 0xd6caa9);
    }
    b.anchor(10, 20, s * 18.5);
  }
  b.disc(-29, 15, 0, 3.2, 0x7d8fb0, 'x');
  b.roof(-27, 19, 0, 4, 6, 6, STONE);
  b.anchor(10, 32, 0);
  b.anchor(30, 22, 0);
}

function buckingham(b: Builder): void {
  // faces east (+x) down The Mall
  b.at(-664, 208);
  const CREAM = 0xebe0c6;
  b.box(0, 0, 0, 26, 19, 86, CREAM, { solid: true });
  b.box(0, 19, 0, 27.4, 1.4, 87.4, WHITE);
  b.box(0, 20.4, 0, 22, 2.2, 82, 0xdcd0b4);
  // central portico with pediment
  b.box(14.5, 0, 0, 4, 21, 20, CREAM, { solid: true });
  b.roof(14.5, 21, 0, 4.4, 4.6, 20, WHITE);
  b.box(17.2, 0, 0, 2, 6, 18, 0xdcd0b4);
  for (let z = -7.5; z <= 7.5; z += 3) b.cyl(17.2, 6, z, 0.65, 0.75, 13.6, WHITE, 8);
  b.box(17.2, 19.6, 0, 2.4, 1.4, 18.6, WHITE);
  for (const s of [-1, 1]) {
    b.box(14, 0, s * 37, 3.4, 20.4, 12, CREAM, { solid: true });
    b.roof(14, 20.4, s * 37, 3.8, 3.4, 12, WHITE);
    for (let z = 14; z <= 28; z += 4.6) for (const y of [4.5, 11.5]) b.box(13.1, y, s * z, 0.3, 3.4, 1.9, 0x66788f);
    b.anchor(13, 21, s * 43);
    b.anchor(-13, 21, s * 43);
  }
  b.cyl(0, 22.6, 0, 0.18, 0.18, 10, WHITE, 5);
  b.box(0, 30, 1.7, 0.14, 2.2, 3.2, RED);
  b.anchor(0, 33, 0);
  b.anchor(16, 26, 0);
  // forecourt + Victoria Memorial
  b.box(40, 0, 0, 46, 0.12, 70, 0xdcc9b0);
  b.cyl(60, 0, 0, 9.5, 10.5, 1.4, WHITE, 18);
  b.cyl(60, 1.4, 0, 4.6, 5.6, 5, WHITE, 12, { solid: true });
  b.cyl(60, 6.4, 0, 1.5, 2.2, 10.5, WHITE, 10);
  b.sphere(60, 18.4, 0, 1.7, GOLD);
  b.box(60, 19, 0, 0.5, 2.4, 3.6, GOLD);
  b.anchor(60, 21, 0);
}

function trafalgar(b: Builder): void {
  b.at(-380, 0);
  const PAVE = 0xe4d9c3;
  b.box(0, 0, 10, 84, 0.12, 62, PAVE);
  // Nelson's Column
  const cz = 26;
  b.box(0, 0, cz, 12, 0.6, 12, STONE, { solid: true });
  b.box(0, 0.6, cz, 7, 5.2, 7, STONE, { solid: true });
  b.cyl(0, 5.8, cz, 1.45, 1.9, 26, STONE, 12);
  b.box(0, 31.8, cz, 4.2, 1.5, 4.2, 0xcabf9f);
  b.cyl(0, 33.3, cz, 0.55, 0.8, 3.4, 0x70757d, 8);
  b.sphere(0, 37.2, cz, 0.6, 0x70757d, 1, 6);
  b.anchor(0, 37.5, cz);
  // four bronze lions
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const lx = sx * 8.6;
    const lz = cz + sz * 8.6;
    b.box(lx, 0, lz, 5.6, 1.5, 2.6, 0xcabf9f, { solid: true });
    b.box(lx, 1.5, lz, 4.2, 1.4, 1.6, 0x3d3a39);
    b.sphere(lx + sx * 2.1, 3.1, lz, 1.05, 0x3d3a39, 1, 7);
  }
  // fountains
  for (const s of [-1, 1]) {
    b.cyl(s * 23, 0, 4, 7, 7.3, 0.6, STONE, 18);
    b.cyl(s * 23, 0.2, 4, 6.2, 6.2, 0.6, 0x8fd0de, 18);
    b.cyl(s * 23, 0.6, 4, 0.5, 0.8, 2.6, 0x8a9aa0, 8);
    b.cyl(s * 23, 3.0, 4, 2, 0.5, 0.4, 0x8a9aa0, 10);
  }
  // National Gallery along the north side
  const GAL = 0xdfd6c0;
  b.box(0, 0, -34, 88, 13, 15, GAL, { solid: true });
  b.box(0, 13, -34, 89, 1.2, 16, WHITE);
  b.box(0, 0, -24.6, 26, 2, 5, GAL, { solid: true });
  for (let x = -10.5; x <= 10.5; x += 3) b.cyl(x, 2, -24, 0.7, 0.8, 10.4, WHITE, 8);
  b.box(0, 12.4, -25, 25, 1.4, 5.4, WHITE);
  b.roof(0, 13.8, -25.5, 6.5, 4, 25, GAL, PI / 2);
  b.cyl(0, 14.2, -35, 4.6, 4.6, 4.5, GAL, 12);
  b.sphere(0, 18.7, -35, 4.8, LEAD, 1.05);
  b.cyl(0, 23.4, -35, 0.5, 0.7, 2, GAL, 6);
  for (const s of [-1, 1]) {
    b.cyl(s * 30, 14.2, -34, 2.2, 2.2, 3, GAL, 8);
    b.sphere(s * 30, 17.2, -34, 2.3, LEAD, 1, 8);
    b.anchor(s * 44, 14.5, -27);
    b.anchor(s * 22, 14.5, -27);
  }
  b.anchor(0, 25.5, -35);
}

function britishMuseum(b: Builder): void {
  // faces south (+z)
  b.at(-358, -360);
  const C = 0xdad4c2;
  b.box(0, 0, -8, 78, 15, 34, C, { solid: true });
  b.box(0, 15, -8, 79, 1.2, 35, WHITE);
  b.box(0, 0, 14, 32, 0.6, 12, 0xcfc8b4);
  for (let x = -12.25; x <= 12.25; x += 3.5) b.cyl(x, 0.6, 17, 1, 1.1, 12.6, WHITE, 8);
  for (let x = -8.75; x <= 8.75; x += 3.5) b.cyl(x, 0.6, 12.5, 1, 1.1, 12.6, WHITE, 8);
  b.box(0, 13.2, 14, 30, 2, 11, WHITE);
  b.roof(0, 15.2, 14, 11, 5, 30, C, PI / 2);
  for (const s of [-1, 1]) {
    b.box(s * 31, 0, 13, 16, 13, 16, C, { solid: true });
    b.box(s * 31, 13, 13, 17, 1.2, 17, WHITE);
    for (let x = -6; x <= 6; x += 3) b.cyl(s * 31 + x, 0.4, 22.2, 0.8, 0.9, 11.6, WHITE, 8);
    b.box(s * 31, 12, 22, 15.4, 1.4, 2.6, WHITE);
    b.anchor(s * 38, 15, 20.5);
    b.anchor(s * 38.5, 16.6, -24.5);
  }
  b.sphere(0, 15.4, -8, 15, 0x9fd3cb, 0.42, 14);
  b.sphere(0, 20.5, -8, 5, 0xc9e6e0, 0.6, 10);
  b.anchor(0, 21, 19);
  b.anchor(0, 24, -8);
}

function stPauls(b: Builder): void {
  // west front faces west (-x); the dome sits on the crossing at x=8
  b.at(205, -150);
  b.box(-16, 0, 0, 44, 19, 17, STONE, { solid: true });
  b.roof(-16, 19, 0, 44, 4, 17, LEAD);
  b.box(27, 0, 0, 26, 19, 17, STONE, { solid: true });
  b.roof(27, 19, 0, 26, 4, 17, LEAD);
  b.cyl(40, 0, 0, 8.4, 8.4, 19, STONE, 12, { solid: true });
  b.cyl(40, 19, 0, 0, 8.6, 4, LEAD, 12);
  b.box(8, 0, 0, 17, 19, 44, STONE, { solid: true });
  b.roof(8, 19, 0, 44, 4, 17, LEAD, PI / 2);
  // drum, colonnade, dome
  b.cyl(8, 19, 0, 12.4, 12.8, 12, STONE, 20);
  b.solid(8, 0, 11.4, 11.4, 0, 31);
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * PI * 2;
    b.cyl(8 + Math.cos(a) * 13.7, 20.4, Math.sin(a) * 13.7, 0.6, 0.6, 9.2, WHITE, 6);
  }
  b.cyl(8, 29.6, 0, 14.6, 14.6, 1.3, WHITE, 20);
  b.cyl(8, 30.9, 0, 11.4, 11.8, 5, STONE, 20);
  b.sphere(8, 35.9, 0, 11.6, LEAD, 1.12, 16);
  b.cyl(8, 47.6, 0, 2.2, 2.9, 6.6, STONE, 8);
  b.sphere(8, 55, 0, 2.3, LEAD, 1.1, 8);
  b.sphere(8, 58.2, 0, 0.9, GOLD, 1, 6);
  b.box(8, 59, 0, 0.3, 3.8, 0.3, GOLD);
  b.box(8, 61, 0, 0.3, 0.3, 2, GOLD);
  b.anchor(8, 63, 0);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * PI * 2 + PI / 4;
    b.anchor(8 + Math.cos(a) * 14.8, 31.5, Math.sin(a) * 14.8);
    b.anchor(8 + Math.cos(a) * 9, 44, Math.sin(a) * 9);
  }
  // west towers and two-tier portico
  for (const s of [-1, 1]) {
    b.box(-36, 0, s * 12.5, 8, 27, 8, STONE, { solid: true });
    b.cyl(-36, 27, s * 12.5, 2.8, 3.3, 7, STONE, 8);
    b.sphere(-36, 34.6, s * 12.5, 3, LEAD, 1.15, 8);
    b.sphere(-36, 38.6, s * 12.5, 0.7, GOLD, 1, 6);
    b.anchor(-36, 39.5, s * 12.5);
    b.anchor(8, 20.5, s * 22);
  }
  for (let z = -6; z <= 6; z += 2.4) {
    b.cyl(-39.6, 0.5, z, 0.55, 0.62, 8.4, WHITE, 6);
    b.cyl(-39.6, 9.9, z, 0.5, 0.55, 8, WHITE, 6);
  }
  b.box(-39.4, 0, 0, 3, 0.5, 15, 0xd3c9ae);
  b.box(-39.4, 8.9, 0, 2.6, 1, 15, WHITE);
  b.box(-39.4, 17.9, 0, 2.6, 1, 15, WHITE);
  b.roof(-39, 18.9, 0, 3.4, 4.2, 15, STONE);
  b.anchor(40, 23.5, 0);
}

function millenniumBridge(b: Builder): void {
  const f = acrossRiver(200, -47);
  b.at(f.cx, f.cz, f.yaw);
  const STEEL = 0xcfd9de;
  const L = 96;
  b.box(0, -1, 0, L, 1.5, 4.6, STEEL, { solid: true });
  for (const s of [-1, 1]) {
    b.box(0, 0.5, s * 2.2, L, 0.9, 0.12, 0xaebbc2);
    for (const px of [-20, 20]) {
      b.beam(px, -4, 0, px, 0.2, s * 1.5, 1.3, 0xb7c3c9);
      b.beam(px, 0.2, s * 1.5, px, 3.4, s * 7, 0.7, STEEL);
      b.anchor(px, 4.2, s * 7);
    }
    const pts: [number, number, number][] = [
      [-L / 2, 0.6, s * 2.6], [-20, 3.4, s * 7], [0, 1.5, s * 5.4], [20, 3.4, s * 7], [L / 2, 0.6, s * 2.6],
    ];
    for (const off of [0, 0.7]) {
      for (let i = 0; i < pts.length - 1; i++) {
        const [x1, y1, z1] = pts[i];
        const [x2, y2, z2] = pts[i + 1];
        b.beam(x1, y1, z1 + s * off, x2, y2, z2 + s * off, 0.22, 0xe9eef0);
      }
    }
    for (let x = -40; x <= 40; x += 8) b.beam(x, 0.2, s * 2.3, x, 0.9, s * 4.6, 0.14, STEEL);
  }
}

function tate(b: Builder): void {
  // river (north) front faces -z
  b.at(198, 44);
  b.box(0, 0, 0, 92, 21, 30, BRICK, { solid: true });
  b.box(0, 21, 0, 88, 4.2, 25, 0xe6eef0, { solid: true });
  b.box(0, 0, -17.5, 8.4, 60, 8.4, BRICK, { solid: true });
  b.box(0, 60, -17.5, 6.6, 3.4, 6.6, 0xe4cfa6);
  for (let x = -40; x <= 40; x += 6.5) {
    if (Math.abs(x) < 7) continue;
    b.box(x, 3, -15.1, 2, 15, 0.4, 0x4f5a66);
  }
  b.box(0, 2, -22.2, 6.6, 46, 0.5, 0x8d583b);
  // Blavatnik Building: the twisted brick pyramid behind
  b.pyr(-24, 0, 36, 30, 40, 0xb47755, 17, 0.12);
  b.solid(-24, 36, 12, 12, 0, 40);
  b.anchor(0, 64, -17.5);
  for (const s of [-1, 1]) {
    b.anchor(s * 46, 26, -15);
    b.anchor(s * 24, 26, -15);
    b.anchor(s * 46, 26, 15);
  }
  b.anchor(-24, 41, 36);
}

function shard(b: Builder): void {
  b.at(435, 112);
  const H = 160;
  b.box(0, 0, 0, 32, 7, 32, 0x8cb2c6, { solid: true });
  b.pyr(0, 0, 0, 29, H - 8, GLASS, 3);
  b.pyr(0, 0, 0, 25, H, 0xbcdcea, 0.6, 0.42);
  b.pyr(0, 0, 0, 27, H - 22, 0x86b6cf, 5, -0.3);
  b.beam(1.2, H - 30, 0.6, 1.6, H + 3, 0.8, 0.5, 0xd8ecf5);
  b.beam(-1.2, H - 34, -0.8, -1.8, H - 2, -1, 0.5, 0xd8ecf5);
  const steps = 7;
  for (let k = 0; k < steps; k++) {
    const y0 = (k * (H - 12)) / steps;
    const y1 = ((k + 1) * (H - 12)) / steps;
    const half = 14.5 * (1 - (y0 + y1) / 2 / H) + 0.6;
    b.solid(0, 0, half, half, y0, y1);
    if (k > 0) for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.anchor(sx * (half + 1), y0, sz * (half + 1));
  }
  b.anchor(0, H, 0);
}

function towerOfLondon(b: Builder): void {
  b.at(588, -22);
  const KEEP = 0xe9e3d3;
  const WALL = 0xd2c8b0;
  b.box(0, 0, 0, 62, 0.14, 62, 0x9fc67c);
  // White Tower
  b.box(0, 0, 0, 24, 19, 24, KEEP, { solid: true });
  for (let i = -10; i <= 10; i += 4) {
    for (const s of [-1, 1]) {
      b.box(i, 19, s * 11.4, 2, 1.5, 1.2, KEEP);
      b.box(s * 11.4, 19, i, 1.2, 1.5, 2, KEEP);
    }
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const round = sx === 1 && sz === -1;
    if (round) b.cyl(sx * 12, 0, sz * 12, 2.9, 2.9, 25, KEEP, 10);
    else b.box(sx * 12, 0, sz * 12, 5, 25, 5, KEEP);
    b.solid(sx * 12, sz * 12, 2.6, 2.6, 0, 25);
    b.sphere(sx * 12, 25.4, sz * 12, 2.5, LEAD, 1.15, 8);
    b.cyl(sx * 12, 28, sz * 12, 0.08, 0.3, 2.4, GOLD, 5);
    b.anchor(sx * 12, 30, sz * 12);
  }
  // curtain wall with a south gate
  const S = 33;
  b.box(0, 0, -S, 2 * S, 8, 3, WALL, { solid: true });
  b.box(-S, 0, 0, 3, 8, 2 * S, WALL, { solid: true });
  b.box(S, 0, 0, 3, 8, 2 * S, WALL, { solid: true });
  for (const s of [-1, 1]) {
    b.box(s * 19.5, 0, S, 27, 8, 3, WALL, { solid: true });
    b.box(s * 5, 0, S, 3.4, 11, 4.4, WALL, { solid: true });
    b.anchor(s * 5, 12, S);
    for (const z of [-S, S]) {
      b.cyl(s * S, 0, z, 4.3, 4.6, 11.5, WALL, 10, { solid: true });
      b.cyl(s * S, 11.5, z, 4.8, 4.8, 1.2, 0xc4b99e, 10);
      b.anchor(s * S, 13.4, z);
    }
    b.cyl(s * S, 0, 0, 3.4, 3.6, 10.5, WALL, 10, { solid: true });
    b.cyl(0, 0, -S, 3.4, 3.6, 10.5, WALL, 10, { solid: true });
  }
  for (let i = -S + 5; i <= S - 5; i += 5) {
    b.box(i, 8, -S, 2.4, 1.2, 3, WALL);
    b.box(-S, 8, i, 3, 1.2, 2.4, WALL);
    b.box(S, 8, i, 3, 1.2, 2.4, WALL);
  }
}

function towerBridge(b: Builder): void {
  const f = acrossRiver(668, 84);
  b.at(f.cx, f.cz, f.yaw);
  const ST = 0xd0c4a4;
  const ROOF = 0x66849c;
  const L = 128;
  b.box(0, -1, 0, L, 1.5, 10, 0x8f9aa5, { solid: true });
  for (const s of [-1, 1]) b.box(0, 0.5, s * 4.9, L, 1, 0.3, SKYBLUE);
  for (const t of [-1, 1]) {
    const x = t * 21;
    b.box(x, -4, 0, 16, 4.4, 21, 0xb9ad92);
    // tower legs either side of the roadway, joined above the arch
    for (const s of [-1, 1]) b.box(x, 0.4, s * 6.6, 11, 12, 3.4, ST, { solid: true });
    b.box(x, 12, 0, 11, 30, 16.6, ST, { solid: true });
    b.box(x, 25, 0, 11.6, 1, 17.2, 0xbfb392);
    b.box(x, 41, 0, 11.8, 1.2, 17.4, 0xbfb392);
    b.pyr(x, 42.2, 0, 10.5, 9, ROOF, 2.5);
    b.cyl(x, 51.2, 0, 0.1, 0.5, 4, GOLD, 5);
    for (const ax of [-1, 1]) for (const az of [-1, 1]) {
      b.box(x + ax * 5.2, 0.4, az * 8, 2.4, 45, 2.4, ST);
      b.pyr(x + ax * 5.2, 45.4, az * 8, 2.6, 6, ROOF);
    }
    b.box(x - t * 5.6, 16, 0, 0.3, 7, 5, 0x55657a);
    b.box(x + t * 5.6, 16, 0, 0.3, 7, 5, 0x55657a);
    b.anchor(x, 55, 0);
    b.anchor(x, 12, 0);
    // suspension chains down to the shore abutments
    const pts: [number, number][] = [[t * 26.5, 37], [t * 36, 22], [t * 46, 12], [t * 57, 8]];
    for (const s of [-1, 1]) {
      for (let i = 0; i < pts.length - 1; i++) {
        b.beam(pts[i][0], pts[i][1], s * 5, pts[i + 1][0], pts[i + 1][1], s * 5, 0.9, SKYBLUE);
      }
      for (const [hx, hy] of [[t * 36, 22], [t * 46, 12]] as [number, number][]) {
        b.beam(hx, hy, s * 5, hx, 0.5, s * 5, 0.22, SKYBLUE);
      }
      b.box(t * 58.5, 0.4, s * 6.4, 5, 9, 2.6, ST, { solid: true });
      b.pyr(t * 58.5, 9.4, s * 6.4, 4, 3, ROOF);
    }
    b.anchor(t * 41, 17, 0);
  }
  // high-level walkways
  for (const s of [-1, 1]) {
    b.box(0, 33, s * 4.6, 31, 3.2, 2.6, SKYBLUE, { solid: true });
    b.box(0, 36.2, s * 4.6, 31, 0.5, 3, WHITE);
  }
  for (const x of [-9, 0, 9]) b.anchor(x, 33, 0);
}

function plainBridges(b: Builder): void {
  for (const br of BRIDGES) {
    const f = acrossRiver(br.x, br.z);
    b.at(f.cx, f.cz, f.yaw);
    const L = 2 * (RIVER_HALF_WIDTH + 13);
    b.box(0, -1, 0, L, 1.5, br.width, 0xd6cfc0, { solid: true });
    b.box(0, -1.9, 0, L - 6, 1, br.width + 0.6, br.color);
    for (const s of [-1, 1]) {
      b.box(0, 0.5, s * (br.width / 2 - 0.2), L, 0.95, 0.35, br.color);
      for (const px of [-20, 0, 20]) {
        b.box(px, 0.5, s * (br.width / 2 - 0.2), 0.3, 6, 0.3, DARK);
        b.sphere(px, 6.7, s * (br.width / 2 - 0.2), 0.5, 0xfff1c2, 1, 6);
        // No anchors on these low lamps: a swing from one only ends in the river.
      }
    }
    for (const px of [-18, 0, 18]) b.box(px, -4, 0, 5, 3, br.width + 2.4, 0xc4bba6);
    if (br.masts) {
      // Golden Jubilee footbridge pylons with fanned stays
      for (const px of [-24, 0, 24]) for (const s of [-1, 1]) {
        const z0 = s * (br.width / 2 + 0.4);
        b.beam(px, -2, z0, px, 21, z0 + s * 5, 0.55, WHITE);
        for (const dx of [-9, -4.5, 4.5, 9]) b.beam(px, 20.5, z0 + s * 5, px + dx, 0.6, z0, 0.12, WHITE);
        b.anchor(px, 21.5, z0 + s * 5);
      }
    }
  }
}

/** County Hall: the long riverside block between Westminster Bridge and the Eye. */
function countyHall(b: Builder): void {
  b.at(-193, 197, -0.21);
  const C = 0xe3d8bd;
  b.box(0, 0, 0, 22, 19, 46, C, { solid: true });
  b.box(0, 19, 0, 23, 1, 47, WHITE);
  b.roof(0, 20, 0, 46, 6.5, 20, SLATE, PI / 2);
  b.box(-12, 0, 0, 3, 15, 16, C, { solid: true });
  for (let z = -6; z <= 6; z += 3) b.cyl(-14.2, 1, z, 0.6, 0.7, 12, WHITE, 6);
  b.box(-13.4, 13, 0, 3.6, 1.2, 16.6, WHITE);
  b.box(0, 26.5, 0, 2.4, 5, 2.4, C);
  b.pyr(0, 31.5, 0, 2.8, 6, 0x6fa392);
  for (let z = -20; z <= 20; z += 4) {
    if (Math.abs(z) < 9) continue;
    for (const y of [4, 9, 14]) {
      b.box(-11.05, y, z, 0.3, 2.8, 1.7, 0x62738a);
      b.box(11.05, y, z, 0.3, 2.8, 1.7, 0x62738a);
    }
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.anchor(sx * 11.2, 20.5, sz * 23.2);
  b.anchor(0, 37, 0);
  b.anchor(-11.2, 20.5, 0);
  b.anchor(11.2, 20.5, 0);
}

function crane(b: Builder, x: number, z: number, yaw: number, h: number): void {
  b.at(x, z, yaw);
  const Y = 0xf0b63f;
  b.box(0, 0, 0, 5, 1, 5, 0x9a9a9a, { solid: true });
  b.box(0, 1, 0, 2, h, 2, Y, { solid: true });
  b.box(1, h + 1, 0, 2.2, 2.4, 2.2, WHITE);
  b.box(14, h + 3.4, 0, 46, 1.2, 1.4, Y);
  b.box(-9, h + 3.4, 0, 3.6, 2.6, 2.6, 0x7b7f86);
  b.beam(0, h + 9.5, 0, 36, h + 4.4, 0, 0.2, DARK);
  b.beam(0, h + 9.5, 0, -9, h + 4.6, 0, 0.2, DARK);
  b.box(0, h + 3.4, 0, 1, 6.4, 1, Y);
  b.beam(30, h + 3.4, 0, 30, h - 6, 0, 0.12, DARK);
  b.box(30, h - 7, 0, 0.9, 1, 0.9, RED);
  for (let jx = 6; jx <= 36; jx += 10) b.anchor(jx, h + 3.2, 0);
}

export const CRANES: [number, number, number, number][] = [
  [322, -138, 0.6, 62],
  [368, -230, 2.4, 70],
  [506, -138, -1.1, 66],
  [92, -184, 1.9, 54],
  [-92, -138, 0.3, 50],
  [-46, 138, -2.2, 52],
  [322, 138, 2.9, 56],
  [-230, -184, 1.2, 48],
  [552, 230, 0.9, 50],
  [-506, -46, -0.5, 46],
];

export function buildLandmarks(b: Builder, wheelMat: THREE.Material): { wheel: THREE.Mesh } {
  bigBen(b);
  const wheel = londonEye(b, wheelMat);
  abbey(b);
  buckingham(b);
  trafalgar(b);
  britishMuseum(b);
  stPauls(b);
  millenniumBridge(b);
  tate(b);
  shard(b);
  towerOfLondon(b);
  towerBridge(b);
  plainBridges(b);
  countyHall(b);
  for (const [x, z, yaw, h] of CRANES) crane(b, x, z, yaw, h);
  return { wheel };
}

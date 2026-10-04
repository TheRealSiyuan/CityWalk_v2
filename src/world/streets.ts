/**
 * London's street plan and buildings, as pure data (no three.js).
 *
 * This is deliberately NOT a grid of identical boxes. Streets come from an
 * irregular lattice that is rotated, warped and then pushed out of the river,
 * the parks and the landmark plazas, so roads bend, meet at odd angles, run
 * parallel to the Embankment and curve round squares. Each block is then
 * lined with joined terraces around a courtyard — the perimeter-block form
 * most of central London actually has — in the materials of its district.
 */
import { EXCLUSIONS, PARKS, type District, districtAt } from './data';
import { MAP, RIVER_HALF_WIDTH, riverInfo } from './river';

export const SKIRT = 215; // scenery-only city beyond the walkable edge

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Pt = [number, number];

export enum Style {
  Terrace = 0,
  Shop = 1,
  Stone = 2,
  Warehouse = 3,
  Glass = 4,
}
export type RoofKind = 'flat' | 'gable' | 'hip';

export interface Building {
  x: number;
  z: number;
  hx: number;
  hz: number;
  yaw: number;
  y0: number;
  h: number; // wall top (absolute)
  roof: RoofKind;
  roofH: number;
  style: Style;
  color: number;
  roofColor: number;
  chimneys: boolean;
  /** beyond the walkable map: drawn, but no collision or anchors */
  scenery: boolean;
  tower: boolean;
}

export interface Block {
  pts: Pt[]; // kerb line, 4 corners
  cx: number;
  cz: number;
  district: District;
  scenery: boolean;
  kind: 'built' | 'square' | 'site';
}

export interface Road {
  pts: Pt[];
  width: number;
}

export interface CityPlan {
  blocks: Block[];
  buildings: Building[];
  roads: Road[];
  /** tree positions in garden squares and courtyards: x, z, scale */
  trees: [number, number, number][];
  /** construction sites for tower cranes: x, z, yaw, height */
  cranes: [number, number, number, number][];
}

const PAVEMENT = 2.2;
const MAJOR = 17;
const RIVER_LIMIT = RIVER_HALF_WIDTH + 11;

// --- palettes: London stock brick, red brick, stucco, Portland stone, slate ----
const STOCK = [0xcaa86c, 0xbd9860, 0xb58a58, 0xd2b47c];
const REDBRICK = [0xa65f48, 0xb06a4c, 0x9c5a46];
const STUCCO = [0xf1e9d8, 0xe9dfca, 0xf3ecdf, 0xe2d9c4];
const PORTLAND = [0xe6dfcd, 0xdcd4bf, 0xd6ccb4, 0xece6d6];
const DARKBRICK = [0x8f6049, 0x9b6c4e, 0x7f5846, 0xa67c5c, 0x8a6a5a];
const GLASS = [0x8fb4c6, 0x7fa5ba, 0xa3c2cc, 0x6f9bb0, 0x9dbfbf];
const SLATE = [0x5b6570, 0x66707a, 0x545d68];
const TILE = [0x8a5a4a, 0x7d5245];
const FLATROOF = [0x8d8a86, 0x7f7c7a, 0x9a9690];

interface DistrictSpec {
  walls: number[][];
  styles: Style[];
  hMin: number;
  hMax: number;
  depth: number;
  gable: number; // probability of a pitched roof
  hip: number; // probability of a mansard
  squares: number; // probability a block is a garden square
  towers: number; // probability a block is a glass tower
  towerH: [number, number];
}

const SPECS: Record<District, DistrictSpec> = {
  westminster: { walls: [PORTLAND, PORTLAND, STUCCO], styles: [Style.Stone, Style.Stone, Style.Shop], hMin: 19, hMax: 27, depth: 13, gable: 0.1, hip: 0.6, squares: 0.05, towers: 0, towerH: [0, 0] },
  westend: { walls: [STOCK, STOCK, REDBRICK, STUCCO], styles: [Style.Terrace, Style.Shop, Style.Terrace, Style.Shop], hMin: 13, hMax: 20, depth: 10.5, gable: 0.75, hip: 0.1, squares: 0.07, towers: 0.02, towerH: [38, 60] },
  holborn: { walls: [PORTLAND, STOCK, REDBRICK], styles: [Style.Stone, Style.Shop, Style.Terrace], hMin: 16, hMax: 25, depth: 12, gable: 0.4, hip: 0.3, squares: 0.07, towers: 0.05, towerH: [40, 70] },
  city: { walls: [PORTLAND, PORTLAND, STOCK], styles: [Style.Stone, Style.Stone, Style.Shop], hMin: 18, hMax: 28, depth: 13, gable: 0.12, hip: 0.4, squares: 0.03, towers: 0.3, towerH: [48, 110] },
  southbank: { walls: [DARKBRICK, DARKBRICK, STOCK], styles: [Style.Warehouse, Style.Warehouse, Style.Terrace], hMin: 15, hMax: 25, depth: 12.5, gable: 0.45, hip: 0.05, squares: 0.04, towers: 0.12, towerH: [36, 72] },
  south: { walls: [STOCK, REDBRICK, STOCK, STUCCO], styles: [Style.Terrace, Style.Terrace, Style.Terrace, Style.Shop], hMin: 11, hMax: 16, depth: 9.5, gable: 0.85, hip: 0.05, squares: 0.08, towers: 0.02, towerH: [30, 48] },
};

// --- geometry helpers ------------------------------------------------------------
const area = (p: Pt[]): number => {
  let a = 0;
  for (let i = 0; i < p.length; i++) {
    const [x1, z1] = p[i];
    const [x2, z2] = p[(i + 1) % p.length];
    a += x1 * z2 - x2 * z1;
  }
  return a / 2;
};

/** Offset each edge of a convex quad inward by its own distance. */
function insetQuad(p: Pt[], d: number[]): Pt[] | null {
  const sign = area(p) > 0 ? 1 : -1;
  const lines: { px: number; pz: number; ux: number; uz: number }[] = [];
  for (let k = 0; k < 4; k++) {
    const [x1, z1] = p[k];
    const [x2, z2] = p[(k + 1) % 4];
    const len = Math.hypot(x2 - x1, z2 - z1);
    if (len < 1) return null;
    const ux = (x2 - x1) / len;
    const uz = (z2 - z1) / len;
    // inward normal
    const nx = -uz * sign;
    const nz = ux * sign;
    lines.push({ px: x1 + nx * d[k], pz: z1 + nz * d[k], ux, uz });
  }
  const out: Pt[] = [];
  for (let k = 0; k < 4; k++) {
    const a = lines[(k + 3) % 4];
    const b = lines[k];
    const den = a.ux * b.uz - a.uz * b.ux;
    if (Math.abs(den) < 1e-4) return null;
    const t = ((b.px - a.px) * b.uz - (b.pz - a.pz) * b.ux) / den;
    out.push([a.px + a.ux * t, a.pz + a.uz * t]);
  }
  if (Math.sign(area(out)) !== sign) return null;
  // convexity
  for (let k = 0; k < 4; k++) {
    const [ax, az] = out[k];
    const [bx, bz] = out[(k + 1) % 4];
    const [cx, cz] = out[(k + 2) % 4];
    if (((bx - ax) * (cz - bz) - (bz - az) * (cx - bx)) * sign <= 0) return null;
  }
  return out;
}

function inExclusion(x: number, z: number, pad: number): boolean {
  for (const [cx, cz, r] of EXCLUSIONS) if (Math.hypot(x - cx, z - cz) < r + pad) return true;
  for (const [px, pz, rx, rz] of PARKS) {
    const dx = (x - px) / (rx + pad);
    const dz = (z - pz) / (rz + pad);
    if (dx * dx + dz * dz < 1) return true;
  }
  return riverInfo(x, z).dist < RIVER_LIMIT + pad;
}

/** Push a street junction out of the river, parks and plazas. */
function pushOut(p: Pt): boolean {
  let moved = false;
  for (let it = 0; it < 3; it++) {
    const r = riverInfo(p[0], p[1]);
    if (r.dist < RIVER_LIMIT) {
      let nx = p[0] - r.cx;
      let nz = p[1] - r.cz;
      const l = Math.hypot(nx, nz);
      if (l < 0.01) {
        nx = -r.tz;
        nz = r.tx;
      } else {
        nx /= l;
        nz /= l;
      }
      p[0] = r.cx + nx * RIVER_LIMIT;
      p[1] = r.cz + nz * RIVER_LIMIT;
      moved = true;
    }
    for (const [cx, cz, rad] of EXCLUSIONS) {
      const dx = p[0] - cx;
      const dz = p[1] - cz;
      const l = Math.hypot(dx, dz);
      if (l < rad) {
        const k = l < 0.01 ? 1 : rad / l;
        p[0] = cx + (l < 0.01 ? rad : dx * k);
        p[1] = cz + dz * k;
        moved = true;
      }
    }
    for (const [px, pz, rx, rz] of PARKS) {
      const dx = (p[0] - px) / rx;
      const dz = (p[1] - pz) / rz;
      const l = Math.hypot(dx, dz);
      if (l < 1) {
        const k = l < 0.01 ? 1 : 1 / l;
        p[0] = px + dx * k * rx;
        p[1] = pz + dz * k * rz;
        moved = true;
      }
    }
  }
  return moved;
}

export function buildPlan(seed = 20261004): CityPlan {
  const rnd = mulberry32(seed);
  const pick = <T>(a: T[]): T => a[Math.floor(rnd() * a.length)];

  // --- irregular lattice, rotated and warped -----------------------------------
  const TH = 0.13;
  const cosT = Math.cos(TH);
  const sinT = Math.sin(TH);
  const xs: number[] = [];
  const zs: number[] = [];
  for (let x = -1180; x < 1180; x += 60 + rnd() * 44) xs.push(x);
  for (let z = -900; z < 900; z += 54 + rnd() * 38) zs.push(z);
  const widthOf = (): number => {
    const r = rnd();
    return r < 0.3 ? 8.5 : r < 0.78 ? 11.5 : MAJOR;
  };
  const wI = xs.map(widthOf);
  const wJ = zs.map(widthOf);
  const nodes: Pt[][] = [];
  const pushed: boolean[][] = [];
  for (let i = 0; i < xs.length; i++) {
    nodes.push([]);
    pushed.push([]);
    for (let j = 0; j < zs.length; j++) {
      const bx = xs[i] * cosT - zs[j] * sinT;
      const bz = xs[i] * sinT + zs[j] * cosT;
      const p: Pt = [
        bx + 15 * Math.sin(bz / 97 + 1.3) + 9 * Math.sin((bx + bz) / 61) + (rnd() - 0.5) * 6,
        bz + 13 * Math.sin(bx / 113 + 0.4) + 8 * Math.sin((bx - bz) / 71 + 2) + (rnd() - 0.5) * 6,
      ];
      pushed[i].push(pushOut(p));
      nodes[i].push(p);
    }
  }

  const inView = (x: number, z: number): boolean =>
    x > MAP.minX - SKIRT && x < MAP.maxX + SKIRT && z > MAP.minZ - SKIRT && z < MAP.maxZ + SKIRT;
  const inMap = (x: number, z: number): boolean => x > MAP.minX + 6 && x < MAP.maxX - 6 && z > MAP.minZ + 6 && z < MAP.maxZ - 6;

  // --- blocks ----------------------------------------------------------------------
  const blocks: Block[] = [];
  for (let i = 0; i < xs.length - 1; i++) {
    for (let j = 0; j < zs.length - 1; j++) {
      const quad: Pt[] = [nodes[i][j], nodes[i + 1][j], nodes[i + 1][j + 1], nodes[i][j + 1]];
      const r1 = rnd();
      const r2 = rnd();
      const pts = insetQuad(quad, [wJ[j] / 2, wI[i + 1] / 2, wJ[j + 1] / 2, wI[i] / 2]);
      if (!pts) continue;
      const cx = (pts[0][0] + pts[1][0] + pts[2][0] + pts[3][0]) / 4;
      const cz = (pts[0][1] + pts[1][1] + pts[2][1] + pts[3][1]) / 4;
      if (!inView(cx, cz)) continue;
      if (Math.abs(area(pts)) < 420) continue;
      let ok = !inExclusion(cx, cz, 4);
      let minEdge = Infinity;
      for (let k = 0; k < 4 && ok; k++) {
        const [x1, z1] = pts[k];
        const [x2, z2] = pts[(k + 1) % 4];
        minEdge = Math.min(minEdge, Math.hypot(x2 - x1, z2 - z1));
        if (inExclusion(x1, z1, -3) || inExclusion((x1 + x2) / 2, (z1 + z2) / 2, -1)) ok = false;
      }
      if (!ok || minEdge < 17) continue;
      const scenery = !pts.every(([x, z]) => inMap(x, z));
      const district = districtAt(cx, cz);
      const spec = SPECS[district];
      let kind: Block['kind'] = 'built';
      if (!scenery && r1 < spec.squares) kind = 'square';
      else if (!scenery && (district === 'city' || district === 'southbank' || district === 'holborn') && r2 < 0.035) kind = 'site';
      blocks.push({ pts, cx, cz, district, scenery, kind });
    }
  }

  // --- buildings ---------------------------------------------------------------------
  const buildings: Building[] = [];
  const trees: [number, number, number][] = [];
  const cranes: [number, number, number, number][] = [];

  const addRoofed = (b: Omit<Building, 'roof' | 'roofH' | 'roofColor' | 'chimneys'>, spec: DistrictSpec): void => {
    const r = rnd();
    let roof: RoofKind = 'flat';
    if (b.style !== Style.Glass && b.hz > 3.5) {
      if (r < spec.gable) roof = 'gable';
      else if (r < spec.gable + spec.hip) roof = 'hip';
    }
    const roofH = roof === 'gable' ? Math.min(5.2, 1.6 + b.hz * 0.5) : roof === 'hip' ? 3.2 : 0;
    const roofColor = roof === 'flat' ? pick(FLATROOF) : b.style === Style.Warehouse && rnd() < 0.4 ? pick(TILE) : pick(SLATE);
    buildings.push({ ...b, roof, roofH, roofColor, chimneys: roof === 'gable' && (b.style === Style.Terrace || b.style === Style.Shop) });
  };

  for (const blk of blocks) {
    const spec = SPECS[blk.district];
    const p = blk.pts;
    const sign = area(p) > 0 ? 1 : -1;
    if (blk.kind === 'square') {
      const n = 5 + Math.floor(rnd() * 5);
      for (let k = 0; k < n; k++) {
        const a = rnd();
        const b = rnd();
        // bilinear point inside the quad, kept off the kerb
        const u = 0.14 + a * 0.72;
        const v = 0.14 + b * 0.72;
        const x = (p[0][0] * (1 - u) + p[1][0] * u) * (1 - v) + (p[3][0] * (1 - u) + p[2][0] * u) * v;
        const z = (p[0][1] * (1 - u) + p[1][1] * u) * (1 - v) + (p[3][1] * (1 - u) + p[2][1] * u) * v;
        trees.push([x, z, 0.9 + rnd() * 0.6]);
      }
      continue;
    }
    if (blk.kind === 'site') {
      cranes.push([blk.cx, blk.cz, rnd() * Math.PI * 2, 46 + rnd() * 24]);
      continue;
    }
    // facade line = kerb inset by the pavement
    const f = insetQuad(p, [PAVEMENT, PAVEMENT, PAVEMENT, PAVEMENT]);
    if (!f) continue;
    const edges = f.map((a, k) => {
      const b = f[(k + 1) % 4];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const ux = (b[0] - a[0]) / len;
      const uz = (b[1] - a[1]) / len;
      return { a, len, ux, uz, nx: -uz * sign, nz: ux * sign };
    });
    // thickness of the block across each pair of opposite edges
    const across = (k: number): number => {
      const e = edges[k];
      const o = edges[(k + 2) % 4];
      const mx = o.a[0] + o.ux * o.len * 0.5;
      const mz = o.a[1] + o.uz * o.len * 0.5;
      return (mx - e.a[0]) * e.nx + (mz - e.a[1]) * e.nz;
    };
    const thin = Math.min(across(0), across(1));
    const cityness = blk.district === 'city' ? Math.max(0, 1 - Math.hypot(blk.cx - 500, blk.cz + 180) / 250) : 1;
    const towerP = spec.towers * (blk.district === 'city' ? 0.25 + cityness * 2 : 1);
    const wi = Math.floor(rnd() * spec.walls.length);
    const baseH = spec.hMin + rnd() * (spec.hMax - spec.hMin);

    if ((!blk.scenery && rnd() < towerP) || thin < 2 * spec.depth + 6) {
      // one building fills the block: a tower on a podium, or a solid low block
      const k = edges[0].len > edges[1].len ? 0 : 1;
      const e = edges[k];
      let hx = Infinity;
      let hz = Infinity;
      const mx = (f[0][0] + f[1][0] + f[2][0] + f[3][0]) / 4;
      const mz = (f[0][1] + f[1][1] + f[2][1] + f[3][1]) / 4;
      for (const c of f) {
        hx = Math.min(hx, Math.abs((c[0] - mx) * e.ux + (c[1] - mz) * e.uz));
        hz = Math.min(hz, Math.abs((c[0] - mx) * e.nx + (c[1] - mz) * e.nz));
      }
      hx *= 0.97;
      hz *= 0.97;
      if (hx < 5 || hz < 5) continue;
      const yaw = Math.atan2(-e.uz, e.ux);
      const isTower = thin >= 2 * spec.depth + 6 || (blk.district === 'city' && rnd() < cityness);
      if (isTower && !blk.scenery) {
        const th = spec.towerH[0] + rnd() * (spec.towerH[1] - spec.towerH[0]) * (blk.district === 'city' ? 0.35 + cityness * 0.65 : 1);
        const col = pick(GLASS);
        const ph = 8 + rnd() * 5;
        buildings.push({ x: mx, z: mz, hx, hz, yaw, y0: 0, h: ph, roof: 'flat', roofH: 0, style: Style.Glass, color: pick(GLASS), roofColor: pick(FLATROOF), chimneys: false, scenery: false, tower: false });
        const s = 0.6 + rnd() * 0.22;
        const tx = Math.min(hx * s, 17);
        const tz = Math.min(hz * s, 15);
        buildings.push({ x: mx, z: mz, hx: tx, hz: tz, yaw, y0: 0, h: th, roof: 'flat', roofH: 0, style: Style.Glass, color: col, roofColor: pick(FLATROOF), chimneys: false, scenery: false, tower: true });
        // plant room crown
        buildings.push({ x: mx, z: mz, hx: tx * 0.55, hz: tz * 0.55, yaw, y0: th, h: th + 3.2, roof: 'flat', roofH: 0, style: Style.Glass, color: 0x7d8a92, roofColor: pick(FLATROOF), chimneys: false, scenery: false, tower: false });
      } else {
        addRoofed({ x: mx, z: mz, hx, hz, yaw, y0: 0, h: baseH, style: spec.styles[wi], color: pick(spec.walls[wi]), scenery: blk.scenery, tower: false }, spec);
      }
      continue;
    }

    // perimeter terraces round a courtyard (pinwheel, so rows do not overlap)
    const D = spec.depth;
    for (let k = 0; k < 4; k++) {
      const e = edges[k];
      // Each row runs from its own corner into the side of the next row, so the
      // corner is closed (no slot a player could be dragged into) and no two
      // walls are coplanar.
      const L = e.len - D * 0.5;
      if (L < 9) continue;
      const rowWall = rnd() < 0.7 ? wi : Math.floor(rnd() * spec.walls.length);
      const n = Math.max(1, Math.min(3, Math.round(L / 27)));
      let t0 = 0.06;
      for (let sgm = 0; sgm < n; sgm++) {
        const t1 = sgm === n - 1 ? L : t0 + L / n + (rnd() - 0.5) * 6;
        const step = rnd();
        const h = baseH + (step < 0.5 ? 0 : step < 0.75 ? 3 : step < 0.92 ? -2.6 : 6);
        const cxm = (t0 + t1) / 2;
        addRoofed(
          {
            x: e.a[0] + e.ux * cxm + e.nx * (D / 2),
            z: e.a[1] + e.uz * cxm + e.nz * (D / 2),
            hx: (t1 - t0) / 2,
            hz: D / 2,
            yaw: Math.atan2(-e.uz, e.ux),
            y0: 0,
            h,
            style: spec.styles[rowWall],
            color: pick(spec.walls[rowWall]),
            scenery: blk.scenery,
            tower: false,
          },
          spec,
        );
        t0 = t1;
      }
    }
    if (!blk.scenery && rnd() < 0.45 && thin > 2 * D + 12) trees.push([blk.cx, blk.cz, 0.8 + rnd() * 0.5]);
  }

  // --- drivable main roads (for buses and cabs) ------------------------------------------
  const roads: Road[] = [];
  const usable = (a: Pt, b: Pt): boolean => {
    const mx = (a[0] + b[0]) / 2;
    const mz = (a[1] + b[1]) / 2;
    return mx > MAP.minX - 60 && mx < MAP.maxX + 60 && mz > MAP.minZ - 60 && mz < MAP.maxZ + 60 && !inExclusion(mx, mz, 3);
  };
  const flush = (run: Pt[], width: number): void => {
    if (run.length >= 3) roads.push({ pts: run.slice(), width });
  };
  for (let i = 0; i < xs.length; i++) {
    if (wI[i] < MAJOR) continue;
    let run: Pt[] = [];
    for (let j = 0; j < zs.length; j++) {
      const ok = !pushed[i][j] && (run.length === 0 || usable(run[run.length - 1], nodes[i][j]));
      if (ok) run.push(nodes[i][j]);
      else {
        flush(run, wI[i]);
        run = pushed[i][j] ? [] : [nodes[i][j]];
      }
    }
    flush(run, wI[i]);
  }
  for (let j = 0; j < zs.length; j++) {
    if (wJ[j] < MAJOR) continue;
    let run: Pt[] = [];
    for (let i = 0; i < xs.length; i++) {
      const ok = !pushed[i][j] && (run.length === 0 || usable(run[run.length - 1], nodes[i][j]));
      if (ok) run.push(nodes[i][j]);
      else {
        flush(run, wJ[j]);
        run = pushed[i][j] ? [] : [nodes[i][j]];
      }
    }
    flush(run, wJ[j]);
  }

  return { blocks, buildings, roads, trees, cranes };
}

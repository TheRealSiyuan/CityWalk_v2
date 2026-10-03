import { describe, expect, it } from 'vitest';
import { LANDMARKS, BRIDGES } from '../src/world/data';
import { MAP, RIVER_HALF_WIDTH, WATER_Y, groundHeight, nearestBank, riverDist, riverInfo } from '../src/world/river';
import { Colliders } from '../src/world/colliders';

const byId = (id: string) => LANDMARKS.find((l) => l.id === id)!;
/** Which bank? Sign of the cross product of river tangent and offset. */
function side(x: number, z: number): number {
  const r = riverInfo(x, z);
  return Math.sign(r.tx * (z - r.cz) - r.tz * (x - r.cx));
}

describe('London layout', () => {
  it('has all twelve landmarks, each with a name and a fact, inside the map', () => {
    expect(LANDMARKS).toHaveLength(12);
    for (const l of LANDMARKS) {
      expect(l.name.length).toBeGreaterThan(3);
      expect(l.fact.length).toBeGreaterThan(20);
      expect(l.x).toBeGreaterThan(MAP.minX);
      expect(l.x).toBeLessThan(MAP.maxX);
      expect(l.z).toBeGreaterThan(MAP.minZ);
      expect(l.z).toBeLessThan(MAP.maxZ);
    }
  });

  it('is roughly 1.5 km across', () => {
    const xs = LANDMARKS.map((l) => l.x);
    const span = Math.max(...xs) - Math.min(...xs);
    expect(span).toBeGreaterThan(1100);
    expect(MAP.maxX - MAP.minX).toBeLessThanOrEqual(1700);
  });

  it('puts landmarks on the correct bank of the Thames', () => {
    const north = side(byId('stpauls').x, byId('stpauls').z);
    for (const id of ['bigben', 'abbey', 'palace', 'trafalgar', 'museum', 'stpauls', 'tower']) {
      expect(side(byId(id).x, byId(id).z), id).toBe(north);
    }
    for (const id of ['eye', 'tate', 'shard']) expect(side(byId(id).x, byId(id).z), id).toBe(-north);
  });

  it('keeps the real west-to-east and north-to-south ordering', () => {
    const order = ['palace', 'trafalgar', 'bigben', 'eye', 'stpauls', 'shard', 'tower', 'towerbridge'];
    for (let i = 1; i < order.length; i++) expect(byId(order[i]).x, order[i]).toBeGreaterThan(byId(order[i - 1]).x);
    expect(byId('museum').z).toBeLessThan(byId('trafalgar').z); // museum is north of the square
    expect(byId('stpauls').z).toBeLessThan(byId('millennium').z);
    expect(byId('millennium').z).toBeLessThan(byId('tate').z); // the bridge links St Paul's to the Tate
  });

  it('puts the bridges on the river and the buildings off it', () => {
    for (const id of ['millennium', 'towerbridge']) expect(riverDist(byId(id).x, byId(id).z)).toBeLessThan(6);
    for (const b of BRIDGES) expect(riverDist(b.x, b.z)).toBeLessThan(8);
    for (const l of LANDMARKS) {
      if (l.id === 'millennium' || l.id === 'towerbridge') continue;
      expect(riverDist(l.x, l.z), l.id).toBeGreaterThan(RIVER_HALF_WIDTH + 4);
    }
  });
});

describe('river', () => {
  it('is below water level mid-channel and flat on the banks', () => {
    const r = riverInfo(0, -40);
    expect(groundHeight(r.cx, r.cz)).toBeLessThan(WATER_Y);
    expect(groundHeight(-500, -300)).toBe(0);
  });

  it('respawns on dry land on the same side you fell in', () => {
    const r = { ...riverInfo(120, -50) };
    for (const s of [-1, 1]) {
      const x = r.cx - r.tz * s * 9;
      const z = r.cz + r.tx * s * 9;
      const bank = nearestBank(x, z);
      expect(groundHeight(bank.x, bank.z)).toBe(0);
      expect(side(bank.x, bank.z)).toBe(side(x, z));
    }
  });
});

describe('colliders', () => {
  const mk = () => {
    const c = new Colliders();
    c.add(0, 0, 5, 5, 0, 10);
    return c;
  };
  it('pushes a walker out of a wall and kills velocity into it', () => {
    const b = { pos: { x: 5.2, y: 0, z: 0 }, vel: { x: -3, y: 0, z: 1 } };
    mk().resolve(b, 0.45, 1.8, 0.7);
    expect(b.pos.x).toBeCloseTo(5.45, 5);
    expect(b.vel.x).toBe(0);
    expect(b.vel.z).toBe(1);
  });
  it('lands a falling body on the roof', () => {
    const b = { pos: { x: 1, y: 9.8, z: 1 }, vel: { x: 0, y: -5, z: 0 } };
    expect(mk().resolve(b, 0.45, 1.8, 0.7)).toBe(true);
    expect(b.pos.y).toBe(10);
    expect(b.vel.y).toBe(0);
  });
  it('handles rotated boxes', () => {
    const c = new Colliders();
    c.add(0, 0, 10, 1, 0, 10, Math.PI / 2); // long axis now runs along z
    const b = { pos: { x: 1.2, y: 0, z: 8 }, vel: { x: 0, y: 0, z: 0 } };
    c.resolve(b, 0.45, 1.8, 0.7);
    expect(b.pos.x).toBeCloseTo(1.45, 5);
    expect(c.blocked(0, 5, 9)).toBe(true);
    expect(c.blocked(9, 5, 0)).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { type Body, type Rope, energy, reelRope, releaseRope, selectAnchor, stepFree, stepSwing } from '../src/physics/swing';

// The tests run against the real, shipped tuning values.
const G = CONFIG.gravity;
const PARAMS = { gravity: G, damping: CONFIG.swing.damping };
const DT = 1 / 60;

function pendulum(angle: number, length: number): { body: Body; rope: Rope } {
  const anchor = { x: 0, y: 40, z: 0 };
  return {
    rope: { anchor, length },
    body: {
      pos: { x: Math.sin(angle) * length, y: anchor.y - Math.cos(angle) * length, z: 0 },
      vel: { x: 0, y: 0, z: 0 },
    },
  };
}

describe('swing physics', () => {
  it('roughly conserves mechanical energy over many swings', () => {
    const { body, rope } = pendulum(1.1, 20);
    // measure relative to the bottom of the arc so the tolerance is meaningful
    const bottom = G * (rope.anchor.y - rope.length);
    const e0 = energy(body, G) - bottom;
    let worst = 0;
    for (let i = 0; i < 60 * 20; i++) {
      stepSwing(body, rope, DT, PARAMS);
      worst = Math.max(worst, Math.abs(energy(body, G) - bottom - e0) / e0);
    }
    expect(e0).toBeGreaterThan(100);
    expect(worst).toBeLessThan(0.03);
  });

  it('conserves energy for a 3D (conical) swing with an initial sideways push', () => {
    const { body, rope } = pendulum(0.8, 25);
    body.vel.z = 9;
    const bottom = G * (rope.anchor.y - rope.length);
    const e0 = energy(body, G) - bottom;
    for (let i = 0; i < 60 * 10; i++) stepSwing(body, rope, DT, PARAMS);
    expect(Math.abs(energy(body, G) - bottom - e0) / e0).toBeLessThan(0.03);
  });

  it('keeps the rope length: the body never stretches past it', () => {
    const { body, rope } = pendulum(1.3, 18);
    for (let i = 0; i < 600; i++) {
      stepSwing(body, rope, DT, PARAMS);
      const d = Math.hypot(body.pos.x - rope.anchor.x, body.pos.y - rope.anchor.y, body.pos.z - rope.anchor.z);
      expect(d).toBeLessThanOrEqual(rope.length + 1e-6);
    }
  });

  it('swings like a real pendulum: small-angle period is 2π√(L/g)', () => {
    const L = 15;
    const { body, rope } = pendulum(0.12, L);
    const crossings: number[] = [];
    let prev = body.pos.x;
    for (let i = 1; i < 60 * 30 && crossings.length < 5; i++) {
      stepSwing(body, rope, DT, PARAMS);
      if (prev > 0 && body.pos.x <= 0) crossings.push(i * DT);
      prev = body.pos.x;
    }
    expect(crossings.length).toBe(5);
    const period = (crossings[4] - crossings[0]) / 4;
    const ideal = 2 * Math.PI * Math.sqrt(L / G);
    expect(Math.abs(period - ideal) / ideal).toBeLessThan(0.03);
  });

  it('rises to the same height on the far side', () => {
    const { body, rope } = pendulum(1.0, 20);
    const startY = body.pos.y;
    let farY = -Infinity;
    for (let i = 0; i < 60 * 6; i++) {
      stepSwing(body, rope, DT, PARAMS);
      if (body.pos.x < 0) farY = Math.max(farY, body.pos.y);
    }
    expect(Math.abs(farY - startY)).toBeLessThan(0.4);
  });

  it('release keeps velocity exactly, then flight is ballistic', () => {
    const { body, rope } = pendulum(1.2, 20);
    // swing through the bottom and partway up the far side
    let steps = 0;
    while (!(body.pos.x < -6 && body.vel.y > 0) && steps++ < 2000) stepSwing(body, rope, DT, PARAMS);
    const before = { ...body.vel };
    const speedBefore = Math.hypot(before.x, before.y, before.z);
    expect(speedBefore).toBeGreaterThan(5);

    const after = releaseRope(body);
    expect(after).toEqual(before);
    expect(body.vel).toEqual(before);

    // After release the rope no longer acts: horizontal velocity is constant
    // and the apex matches projectile motion.
    const y0 = body.pos.y;
    let apex = y0;
    for (let i = 0; i < 240; i++) {
      stepFree(body, DT, G);
      apex = Math.max(apex, body.pos.y);
      expect(body.vel.x).toBeCloseTo(before.x, 10);
      expect(body.vel.z).toBeCloseTo(before.z, 10);
    }
    expect(apex - y0).toBeCloseTo((before.y * before.y) / (2 * G), 1);
  });

  it('a slack rope does nothing until it goes taut', () => {
    const body: Body = { pos: { x: 0, y: 39, z: 0 }, vel: { x: 0, y: 0, z: 0 } };
    const rope: Rope = { anchor: { x: 0, y: 40, z: 0 }, length: 10 };
    expect(stepSwing(body, rope, DT, PARAMS)).toBe(false);
    let taut = false;
    for (let i = 0; i < 120 && !taut; i++) taut = stepSwing(body, rope, DT, PARAMS);
    expect(taut).toBe(true);
    expect(body.pos.y).toBeGreaterThanOrEqual(30 - 1e-6);
  });

  it('pushing the stick pumps energy into the swing', () => {
    const { body, rope } = pendulum(0.5, 20);
    const e0 = energy(body, G);
    for (let i = 0; i < 180; i++) {
      const dir = Math.sign(body.vel.x) || -1;
      stepSwing(body, rope, DT, PARAMS, dir * CONFIG.swing.pump, 0);
    }
    expect(energy(body, G)).toBeGreaterThan(e0 + 50);
  });

  it('reeling shortens the rope to its target and lifts the body', () => {
    const { body, rope } = pendulum(0, 20);
    const y0 = body.pos.y;
    let reeling = true;
    for (let i = 0; i < 200 && reeling; i++) {
      reeling = reelRope(rope, 12, CONFIG.swing.reelSpeed, DT);
      stepSwing(body, rope, DT, PARAMS, 0, 0, false);
    }
    expect(rope.length).toBe(12);
    expect(body.pos.y).toBeGreaterThan(y0 + 7);
  });
});

describe('auto-aim', () => {
  const pos = { x: 0, y: 0, z: 0 };
  const S = CONFIG.swing;

  it('prefers an anchor ahead and above over one behind', () => {
    const anchors = [
      { x: 0, y: 20, z: -20 }, // behind
      { x: 0, y: 20, z: 20 }, // ahead
    ];
    expect(selectAnchor(pos, 0, 1, anchors, S)).toBe(1);
  });

  it('ignores anchors that are too far, too low, or directly behind', () => {
    const anchors = [
      { x: 0, y: 20, z: S.maxRope + 5 },
      { x: 0, y: S.minAnchorRise - 1, z: 10 },
      { x: 0, y: 6, z: -30 },
    ];
    expect(selectAnchor(pos, 0, 1, anchors, S)).toBe(-1);
  });

  it('is generous: an anchor well off to the side still counts', () => {
    expect(selectAnchor(pos, 0, 1, [{ x: 22, y: 18, z: 6 }], S)).toBe(0);
  });
});

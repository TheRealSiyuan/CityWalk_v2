import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { LandingTracker, landKind, landPose, posePoint } from '../src/player/landing';

const cfg = CONFIG.landing;
const dt = 1 / 60;

describe('landing pose', () => {
  it('picks no pose for soft landings, a crouch for hard ones, a roll when also fast', () => {
    expect(landKind(cfg.crouchFall - 0.5, 20)).toBe('none');
    expect(landKind(cfg.crouchFall + 0.5, 0)).toBe('crouch');
    expect(landKind(cfg.rollFall + 1, cfg.rollSpeed - 1)).toBe('crouch');
    expect(landKind(cfg.rollFall + 1, cfg.rollSpeed + 1)).toBe('roll');
    expect(landKind(30, 30, { ...cfg, enabled: false })).toBe('none');
    expect(landKind(NaN, 30)).toBe('none');
    // a plain standing jump lands at about jump speed: no pose, so walking about stays calm
    expect(CONFIG.jumpSpeed).toBeLessThan(cfg.crouchFall - 0.5);
  });

  it('a roll turns exactly once and ends upright, a crouch keeps the feet planted', () => {
    expect(landPose('roll', cfg.rollTime * 0.5)!.angle).toBeCloseTo(Math.PI);
    expect(landPose('roll', cfg.rollTime - 1e-6)!.angle).toBeCloseTo(Math.PI * 2, 3);
    expect(landPose('roll', cfg.rollTime)).toBeNull();
    expect(landPose('crouch', cfg.crouchTime)).toBeNull();
    for (let t = 0; t < cfg.crouchTime; t += dt) {
      const p = landPose('crouch', t)!;
      expect(posePoint(p, 0, 0).y).toBeCloseTo(0);
      expect(p.sy).toBeGreaterThanOrEqual(1 - cfg.crouchDepth - 1e-9);
    }
  });

  it('the body never sinks into the pavement during a roll', () => {
    let lowest = Infinity;
    for (let t = 0; t < cfg.rollTime; t += dt / 4) {
      const p = landPose('roll', t)!;
      // feet, belly, top of the head, front of the face, back of the backpack
      for (const [y, z] of [[0, 0], [0.8, 0.3], [1.9, 0], [1.6, 0.3], [0.9, -0.4]]) {
        lowest = Math.min(lowest, posePoint(p, y, z).y);
      }
    }
    expect(lowest).toBeGreaterThan(-0.05);
  });

  it('the tracker starts one pose on touchdown, from heights alone', () => {
    const tr = new LandingTracker();
    let y = 10;
    let vy = 0;
    tr.update(dt, y, false, 0);
    // fall from 10 m while running fast: about 15 m/s at the ground
    while (y > 0) {
      vy -= CONFIG.gravity * dt;
      y = Math.max(0, y + vy * dt);
      tr.update(dt, y, y > 0, 12);
    }
    expect(tr.count).toBe(1);
    expect(tr.kind).toBe('roll');
    for (let i = 0; i < 60; i++) tr.update(dt, 0, false, 12);
    expect(tr.kind).toBe('none');
    expect(tr.count).toBe(1);
  });

  it('a hop or a teleport does not count; a fast swing low point is forgotten before a short drop', () => {
    const tr = new LandingTracker();
    tr.update(dt, 0, false, 0);
    // standing jump at jump speed
    let y = 0;
    let vy = CONFIG.jumpSpeed;
    do {
      vy -= CONFIG.gravity * dt;
      y = Math.max(0, y + vy * dt);
      tr.update(dt, y, y > 0, 0);
    } while (y > 0);
    expect(tr.count).toBe(0);
    // teleport 100 m down while airborne, then touch down
    tr.update(dt, 100, true, 0);
    tr.update(dt, 0, false, 0);
    expect(tr.count).toBe(0);
    // swing: 20 m/s down through the low point, rise for a second, then a short drop
    y = 20;
    for (let i = 0; i < 10; i++) tr.update(dt, (y -= 20 * dt), true, 15);
    for (let i = 0; i < 60; i++) tr.update(dt, (y += 3 * dt), true, 15);
    vy = 0;
    const floor = y - 0.6;
    while (y > floor) {
      vy -= CONFIG.gravity * dt;
      y = Math.max(floor, y + vy * dt);
      tr.update(dt, y, y > floor, 15);
    }
    expect(tr.count).toBe(0);
  });
});

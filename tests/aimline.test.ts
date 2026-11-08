import { describe, expect, it } from 'vitest';
import { aimSegment } from '../src/render/aimline';
import { CONFIG } from '../src/config';

const hand = { x: 0, y: 1.75, z: 0 };
const cfg = CONFIG.aimLine;

describe('aim preview line', () => {
  it('runs from just off the hand to the anchor', () => {
    const s = aimSegment(hand, { x: 0, y: 1.75, z: -20 }, false)!;
    expect(s).not.toBeNull();
    expect(s.to).toEqual({ x: 0, y: 1.75, z: -20 });
    expect(s.from.z).toBeCloseTo(-cfg.startGap);
    expect(s.len).toBeCloseTo(20 - cfg.startGap);
  });

  it('is hidden with no target, while roped, when disabled, or when too short', () => {
    expect(aimSegment(hand, null, false)).toBeNull();
    expect(aimSegment(hand, { x: 10, y: 20, z: 0 }, true)).toBeNull();
    expect(aimSegment(hand, { x: 10, y: 20, z: 0 }, false, { ...cfg, enabled: false })).toBeNull();
    expect(aimSegment(hand, { x: 0, y: 1.75 + cfg.startGap + cfg.minLength * 0.5, z: 0 }, false)).toBeNull();
  });
});

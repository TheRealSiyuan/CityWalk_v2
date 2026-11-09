import { describe, expect, it } from 'vitest';
import { ropeHum, ropeTension } from '../src/ropesound';
import { CONFIG } from '../src/config';

const anchor = { x: 0, y: 20, z: 0 };
const g = CONFIG.gravity;
const cfg = CONFIG.ropeHum;

describe('rope tension', () => {
  it('is 1 g hanging still under the anchor', () => {
    expect(ropeTension({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, anchor)).toBeCloseTo(1);
  });

  it('adds v²/r at the low point of a swing', () => {
    // 20 m rope, 20 m/s: centripetal 400/20 = 20 m/s² on top of gravity
    expect(ropeTension({ x: 0, y: 0, z: 0 }, { x: 20, y: 0, z: 0 }, anchor)).toBeCloseTo(1 + 20 / g);
  });

  it('ignores speed along the rope and goes slack above the anchor', () => {
    expect(ropeTension({ x: 0, y: 0, z: 0 }, { x: 0, y: 15, z: 0 }, anchor)).toBeCloseTo(1);
    expect(ropeTension({ x: 0, y: 30, z: 0 }, { x: 0, y: 0, z: 0 }, anchor)).toBe(0);
    expect(ropeTension(anchor, { x: 5, y: 0, z: 0 }, anchor)).toBe(0);
  });
});

describe('rope hum', () => {
  it('is silent with no rope, a resting rope, or when disabled', () => {
    expect(ropeHum(null).gain).toBe(0);
    expect(ropeHum(1).gain).toBe(0);
    expect(ropeHum(5, { ...cfg, enabled: false }).gain).toBe(0);
  });

  it('rises in volume and pitch with tension, capped at full tension', () => {
    const mid = ropeHum((cfg.minTension + cfg.fullTension) / 2);
    const top = ropeHum(cfg.fullTension);
    expect(mid.gain).toBeGreaterThan(0);
    expect(mid.gain).toBeLessThan(top.gain);
    expect(mid.freq).toBeGreaterThan(cfg.baseFreq);
    expect(mid.freq).toBeLessThan(top.freq);
    expect(top).toEqual({ gain: cfg.maxGain, freq: cfg.topFreq });
    expect(ropeHum(cfg.fullTension * 3)).toEqual(top);
  });
});

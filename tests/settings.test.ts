import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { DEFAULT_SETTINGS, camSpeedLabel, fpsLabel, lookScale, nextCamSpeed, parseSettings } from '../src/settings';

describe('player settings', () => {
  it('defaults to normal camera, normal look, sound on', () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(camSpeedLabel(DEFAULT_SETTINGS.camSpeed)).toBe('Normal');
    expect(lookScale(DEFAULT_SETTINGS)).toEqual({ x: 1, y: 1 });
    expect(DEFAULT_SETTINGS.muted).toBe(false);
    expect(DEFAULT_SETTINGS.showFps).toBe(false);
  });

  it('round-trips through JSON', () => {
    const s = { camSpeed: 2, invertY: true, muted: true, showFps: true };
    expect(parseSettings(JSON.stringify(s))).toEqual(s);
  });

  it('ignores malformed or out-of-range values', () => {
    expect(parseSettings('not json')).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('null')).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('{"camSpeed":99,"invertY":"yes","muted":1,"showFps":"on"}')).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('{"camSpeed":0.5}').camSpeed).toBe(DEFAULT_SETTINGS.camSpeed);
    expect(parseSettings('{"camSpeed":0}')).toEqual({ ...DEFAULT_SETTINGS, camSpeed: 0 });
  });

  it('cycles camera speeds and wraps around', () => {
    const n = CONFIG.settings.cameraSpeeds.length;
    let i = DEFAULT_SETTINGS.camSpeed;
    const seen = new Set<string>();
    for (let k = 0; k < n; k++) {
      seen.add(camSpeedLabel(i));
      i = nextCamSpeed(i);
    }
    expect(i).toBe(DEFAULT_SETTINGS.camSpeed);
    expect(seen.size).toBe(n);
  });

  it('slow is slower and fast is faster; invert flips only the vertical axis', () => {
    const slow = lookScale({ ...DEFAULT_SETTINGS, camSpeed: 0 });
    const fast = lookScale({ ...DEFAULT_SETTINGS, camSpeed: CONFIG.settings.cameraSpeeds.length - 1 });
    expect(slow.x).toBeLessThan(1);
    expect(fast.x).toBeGreaterThan(1);
    const inv = lookScale({ ...DEFAULT_SETTINGS, invertY: true });
    expect(inv).toEqual({ x: 1, y: -1 });
  });

  it('keeps settings saved before the frame-rate option existed', () => {
    expect(parseSettings('{"camSpeed":2,"invertY":true,"muted":true}')).toEqual({ camSpeed: 2, invertY: true, muted: true, showFps: false });
  });

  it('labels the frame-rate readout with whole fps and render scale', () => {
    expect(fpsLabel(59.6, 1.5)).toBe('60 fps · 1.50x');
    expect(fpsLabel(31.2, 0.65)).toBe('31 fps · 0.65x');
    expect(fpsLabel(Number.NaN, 1)).toBe('-- fps');
    expect(fpsLabel(-1, 1)).toBe('-- fps');
    expect(fpsLabel(40, Number.NaN)).toBe('40 fps');
  });
});

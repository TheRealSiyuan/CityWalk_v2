import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { MissHint } from '../src/player/misshint';

const cfg = CONFIG.missHint;

describe('missed-swing hint', () => {
  it('shows on the first miss, not again within the cooldown, then again after it', () => {
    const h = new MissHint();
    expect(h.onMiss(5)).toBe(true);
    expect(h.onMiss(5.3)).toBe(false);
    expect(h.onMiss(5 + cfg.cooldown - 0.1)).toBe(false);
    expect(h.onMiss(5 + cfg.cooldown)).toBe(true);
    expect(h.count).toBe(2);
  });

  it('stops after the per-session limit however long you wait', () => {
    const h = new MissHint();
    let shown = 0;
    for (let i = 0; i < cfg.maxPerSession + 5; i++) if (h.onMiss(i * (cfg.cooldown + 1))) shown++;
    expect(shown).toBe(cfg.maxPerSession);
  });

  it('never shows when disabled or given a bad clock', () => {
    expect(new MissHint({ ...cfg, enabled: false }).onMiss(100)).toBe(false);
    expect(new MissHint().onMiss(NaN)).toBe(false);
  });

  it('is short enough for a phone toast', () => {
    expect(cfg.text.length).toBeLessThanOrEqual(60);
    expect(cfg.maxPerSession).toBeGreaterThan(0);
  });
});

import { CONFIG } from '../config';

/**
 * Decides when a missed Swing press (nothing in reach) earns a text hint.
 * The miss sound and button flash always play; the words only show the first
 * few times, spaced out, so a new player learns why and an expert is not nagged.
 */
export class MissHint {
  private shown = 0;
  private lastAt = -Infinity;

  constructor(private readonly cfg = CONFIG.missHint) {}

  /** Call on each missed press with the current time in seconds; true = show the hint now. */
  onMiss(nowSec: number): boolean {
    const c = this.cfg;
    if (!c.enabled || !Number.isFinite(nowSec)) return false;
    if (this.shown >= c.maxPerSession) return false;
    if (nowSec - this.lastAt < c.cooldown) return false;
    this.shown++;
    this.lastAt = nowSec;
    return true;
  }

  get count(): number {
    return this.shown;
  }
}

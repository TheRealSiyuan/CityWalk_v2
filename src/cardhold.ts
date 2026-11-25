import type { Landmark } from './world/data';

/**
 * Landmark cards found while a race (or a menu such as the finish card) is on screen wait here,
 * so the fact card never covers the race clock, hint or finish card. When the screen is free the
 * most recent find is shown, with a note of how many others came with it.
 */
export class CardHold {
  private latest: Landmark | null = null;
  private count = 0;

  hold(l: Landmark): void {
    this.latest = l;
    this.count++;
  }

  get pending(): number {
    return this.count;
  }

  /** The card to show now and how many other held finds it stands for; null when nothing waits. */
  release(): { landmark: Landmark; others: number } | null {
    if (!this.latest) return null;
    const out = { landmark: this.latest, others: this.count - 1 };
    this.latest = null;
    this.count = 0;
    return out;
  }
}

/** The small line above the landmark name on its card. */
export function cardKicker(found: number, total: number, others = 0): string {
  if (found >= total) return `All ${total} found. London explored!`;
  const base = `Landmark ${found} of ${total}`;
  return others > 0 ? `${base} · +${others} more on that run` : base;
}

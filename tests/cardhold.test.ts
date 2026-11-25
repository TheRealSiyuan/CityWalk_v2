import { describe, expect, it } from 'vitest';
import { CardHold, cardKicker } from '../src/cardhold';
import { LANDMARKS } from '../src/world/data';

describe('landmark cards held during a race', () => {
  it('releases nothing when nothing was held', () => {
    expect(new CardHold().release()).toBeNull();
  });

  it('shows the latest find once, counting the others, then clears', () => {
    const h = new CardHold();
    h.hold(LANDMARKS[0]);
    h.hold(LANDMARKS[1]);
    h.hold(LANDMARKS[2]);
    expect(h.pending).toBe(3);
    expect(h.release()).toEqual({ landmark: LANDMARKS[2], others: 2 });
    expect(h.pending).toBe(0);
    expect(h.release()).toBeNull();
  });

  it('words the kicker for one find, several finds and the last landmark', () => {
    expect(cardKicker(3, 20)).toBe('Landmark 3 of 20');
    expect(cardKicker(5, 20, 2)).toBe('Landmark 5 of 20 · +2 more on that run');
    expect(cardKicker(20, 20, 3)).toBe('All 20 found. London explored!');
  });
});

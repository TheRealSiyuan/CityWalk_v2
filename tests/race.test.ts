import { describe, expect, it } from 'vitest';
import { LANDMARKS } from '../src/world/data';
import { ROUTES, Race, formatTime, type BestStore } from '../src/race';

const memStore = (): BestStore & { data: Record<string, number> } => {
  const data: Record<string, number> = {};
  return { data, get: (id) => data[id] ?? null, set: (id, t) => (data[id] = t) };
};
const at = (id: string) => LANDMARKS.find((l) => l.id === id)!;

describe('landmark race', () => {
  it('every route visits real landmarks', () => {
    for (const r of ROUTES) {
      expect(r.stops.length).toBeGreaterThanOrEqual(3);
      for (const id of r.stops) expect(at(id), `${r.id}:${id}`).toBeDefined();
    }
  });

  it('counts down, times the run, takes checkpoints in order and records a personal best', () => {
    const store = memStore();
    const events: string[] = [];
    const race = new Race(store, {
      onCountdown: (n) => events.push(`cd${n}`),
      onCheckpoint: (i, s) => events.push(`cp${i}:${s.id}`),
      onFinish: (t, best, isNew) => events.push(`fin:${t.toFixed(1)}:${best?.toFixed(1)}:${isNew}`),
    });
    const route = ROUTES[0];
    race.start(route);
    for (let i = 0; i < 200; i++) race.update(1 / 60, 0, 0); // countdown, standing still
    expect(race.state).toBe('running');
    expect(events.slice(0, 4)).toEqual(['cd3', 'cd2', 'cd1', 'cd0']);
    // skipping ahead to a later stop does not count
    const last = at(route.stops[route.stops.length - 1]);
    race.update(1, last.x, last.z);
    expect(race.next).toBe(0);
    for (const id of route.stops) {
      race.update(5, 9999, 9999); // 5 s of travelling
      race.update(1 / 60, at(id).x, at(id).z);
    }
    expect(race.state).toBe('finished');
    expect(store.data[route.id]).toBeCloseTo(race.time, 6);
    expect(events.filter((e) => e.startsWith('cp'))).toEqual(route.stops.map((id, i) => `cp${i}:${id}`));
    expect(events[events.length - 1]).toMatch(/:true$/);

    // a slower second run keeps the old best
    const firstBest = store.data[route.id];
    race.start(route);
    for (let i = 0; i < 200; i++) race.update(1 / 60, 0, 0);
    for (const id of route.stops) {
      race.update(9, 9999, 9999);
      race.update(1 / 60, at(id).x, at(id).z);
    }
    expect(store.data[route.id]).toBe(firstBest);
    expect(events[events.length - 1]).toMatch(/:false$/);
  });

  it('formats times as m:ss.s', () => {
    expect(formatTime(0)).toBe('0:00.0');
    expect(formatTime(65.43)).toBe('1:05.4');
  });
});

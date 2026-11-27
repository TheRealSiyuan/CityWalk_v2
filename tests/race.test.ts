import { describe, expect, it } from 'vitest';
import { LANDMARKS } from '../src/world/data';
import { CONFIG } from '../src/config';
import { ROUTES, Race, canQuickRestart, dailyRoute, dayKey, formatTime, targetResult, targetText, type BestStore } from '../src/race';

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

  it('daily route: same for everyone on a day, valid landmarks at sensible distances, changes day to day', () => {
    expect(dayKey(new Date(Date.UTC(2026, 9, 27, 23, 59)))).toBe('2026-10-27');
    expect(dailyRoute('2026-10-27')).toEqual(dailyRoute('2026-10-27'));
    const { stops: n, minLeg, maxLeg } = CONFIG.daily;
    const seen = new Set<string>();
    const day0 = Date.UTC(2026, 0, 1);
    for (let i = 0; i < 365; i++) {
      const key = dayKey(new Date(day0 + i * 86400_000));
      const r = dailyRoute(key);
      expect(r.id).toBe(`daily-${key}`);
      expect(r.name).toMatch(/^Daily · \d{1,2} [A-Z][a-z]{2}$/);
      expect(r.stops.length, key).toBe(n);
      expect(new Set(r.stops).size).toBe(n);
      let px = r.start.x;
      let pz = r.start.z;
      for (const id of r.stops) {
        const l = at(id);
        expect(l, `${key}:${id}`).toBeDefined();
        const d = Math.hypot(l.x - px, l.z - pz);
        expect(d, `${key}:${id}`).toBeGreaterThanOrEqual(minLeg);
        expect(d, `${key}:${id}`).toBeLessThanOrEqual(maxLeg);
        px = l.x;
        pz = l.z;
      }
      // starts on a hand-made route start (known clear ground), facing the first stop
      expect(ROUTES.some((h) => h.start.x === r.start.x && h.start.z === r.start.z)).toBe(true);
      const first = at(r.stops[0]);
      const dx = first.x - r.start.x;
      const dz = first.z - r.start.z;
      const len = Math.hypot(dx, dz);
      expect(-Math.sin(r.start.yaw) * (dx / len) - Math.cos(r.start.yaw) * (dz / len)).toBeCloseTo(1, 6);
      seen.add(r.stops.join('>'));
    }
    expect(seen.size).toBeGreaterThan(100); // plenty of variety across a year
  });

  it('daily personal bests are kept per day', () => {
    const store = memStore();
    const race = new Race(store);
    const r = dailyRoute('2026-10-27');
    race.start(r);
    for (let i = 0; i < 200; i++) race.update(1 / 60, r.start.x, r.start.z);
    for (const id of r.stops) {
      race.update(4, 9999, 9999);
      race.update(1 / 60, at(id).x, at(id).z);
    }
    expect(race.state).toBe('finished');
    expect(store.data['daily-2026-10-27']).toBeGreaterThan(0);
    expect(race.bestFor(dailyRoute('2026-10-28').id)).toBeNull();
  });
});

describe('daily share text', () => {
  it('names the day and time, and only adds a link when given one', async () => {
    const { raceShareText } = await import('../src/race');
    const route = dailyRoute('2026-10-29');
    const plain = raceShareText(route.name, '1:23.4');
    expect(plain).toContain('Daily · 29 Oct');
    expect(plain).toContain('1:23.4');
    expect(plain).not.toMatch(/https?:|\?room=/);
    expect(raceShareText(route.name, '1:23.4', 'https://example.test/')).toMatch(/ https:\/\/example\.test\/$/);
    expect(raceShareText(route.name, '1:23.4', 'https://example.test/#c=abc', true)).toMatch(/Race my ghost.* https:\/\/example\.test\/#c=abc$/);
  });
});

describe('racing a friend’s room time', () => {
  it('shows who and what time to beat', () => {
    expect(targetText('Swift Otter', 83.4)).toBe('Beat Swift Otter · 1:23.4');
  });
  it('says who won and by how much, or a tie at display precision', () => {
    expect(targetResult('Sam', 80, 83.4)).toBe('You beat Sam by 3.4 s');
    expect(targetResult('Sam', 85.25, 83)).toBe('Sam was 2.3 s faster');
    expect(targetResult('Sam', 83.42, 83.4)).toBe('Dead level with Sam!');
  });
});

describe('quick restart key', () => {
  it('counts the countdown in real seconds at a low frame rate, but times the run in game time', () => {
    const race = new Race(memStore());
    race.start(ROUTES[0]);
    // 3 fps: each frame is 0.1 s of game time (the cap) but a third of a real second
    let frames = 0;
    while (race.state === 'countdown' && frames < 100) {
      race.update(0.1, 0, 0, 1 / 3);
      frames++;
    }
    expect(race.state).toBe('running');
    // about 3 real seconds (9 frames, or 10 with float rounding), not 30 frames (10 s) as before
    expect(frames).toBeGreaterThanOrEqual(9);
    expect(frames).toBeLessThanOrEqual(10);
    expect(race.time).toBe(0);
    race.update(0.1, 9999, 9999, 1 / 3);
    expect(race.time).toBeCloseTo(0.1); // the run clock still follows game time
  });

  it('does not skip the countdown after one long stall, and still works without real time', () => {
    const race = new Race(memStore());
    race.start(ROUTES[0]);
    race.update(0.1, 0, 0, 30); // tab hidden for 30 s
    expect(race.state).toBe('countdown');
    // only countdownMaxStep of it counted: the rest of the countdown still has to run
    const left = 3 - CONFIG.countdownMaxStep;
    for (let i = 0; i < Math.floor(left / 0.1) - 1; i++) race.update(0.1, 0, 0, 0.1);
    expect(race.state).toBe('countdown');
    for (let i = 0; i < 3; i++) race.update(0.1, 0, 0, 0.1);
    expect(race.state).toBe('running');
    const old = new Race(memStore());
    old.start(ROUTES[0]);
    for (let i = 0; i < 29; i++) old.update(0.1, 0, 0); // callers that pass game time only
    expect(old.state).toBe('countdown');
    old.update(0.1, 0, 0);
    expect(old.state).toBe('running');
  });

  it('restarts during a countdown, a run, or from the finish card', () => {
    expect(canQuickRestart('countdown', false)).toBe(true);
    expect(canQuickRestart('running', false)).toBe(true);
    expect(canQuickRestart('finished', false)).toBe(true);
  });
  it('does nothing in free roam or while the journal or route list is open', () => {
    expect(canQuickRestart('idle', false)).toBe(false);
    expect(canQuickRestart('running', true)).toBe(false);
    expect(canQuickRestart('finished', true)).toBe(false);
  });
  it('is a key that does not clash with movement, jump or swing', () => {
    expect(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'KeyE', 'ShiftLeft', 'ShiftRight']).not.toContain(CONFIG.keys.restartRace);
  });
});

import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { Player } from '../src/player/controller';
import { buildWorld } from '../src/world/city';
import { LANDMARKS } from '../src/world/data';
import { ROUTES, Race, dailyRoute, formatTime, medalFor, medalLine, medalTimes, routeLength } from '../src/race';

const westminster = ROUTES.find((r) => r.id === 'westminster')!;

describe('race medals', () => {
  it('gives every fixed route and a month of dailies ordered, sensible targets', () => {
    const routes = [...ROUTES];
    for (let d = 1; d <= 30; d++) routes.push(dailyRoute(`2026-11-${String(d).padStart(2, '0')}`));
    for (const r of routes) {
      const len = routeLength(r);
      const m = medalTimes(r);
      expect(len).toBeGreaterThan(100);
      expect(m.gold).toBeLessThan(m.silver);
      expect(m.silver).toBeLessThan(m.bronze);
      expect(Number.isInteger(m.gold)).toBe(true);
      // running flat out in a perfectly straight line must not be enough for silver
      expect(len / m.silver).toBeGreaterThan(CONFIG.runSpeed);
    }
  });

  it('awards the best tier a time beats, inclusive of the target itself', () => {
    const m = medalTimes(westminster);
    expect(medalFor(westminster, m.gold)).toBe('gold');
    expect(medalFor(westminster, m.gold + 0.05)).toBe('silver');
    expect(medalFor(westminster, m.silver)).toBe('silver');
    expect(medalFor(westminster, m.bronze)).toBe('bronze');
    expect(medalFor(westminster, m.bronze + 0.05)).toBeNull();
  });

  it('the finish line names the medal and the next target to chase', () => {
    const m = medalTimes(westminster);
    expect(medalLine(westminster, 1)).toBe('Gold medal!');
    expect(medalLine(westminster, m.silver)).toBe(`Silver medal · Gold: ${formatTime(m.gold)}`);
    expect(medalLine(westminster, m.bronze)).toBe(`Bronze medal · Silver: ${formatTime(m.silver)}`);
    expect(medalLine(westminster, m.bronze + 10)).toBe(`No medal yet · Bronze: ${formatTime(m.bronze)}`);
  });

  it('a bot that only holds Swing and steers at the next stop earns a medal, but not gold', () => {
    const world = buildWorld();
    for (const id of ['westminster', 'river']) {
      const route = ROUTES.find((r) => r.id === id)!;
      const p = new Player(world, { x: route.start.x, y: 0, z: route.start.z });
      const race = new Race({ get: () => null, set: () => {} });
      race.start(route);
      for (let i = 0; i < 60 * 200 && race.state !== 'finished'; i++) {
        const s = race.stop ?? LANDMARKS[0];
        const yaw = Math.atan2(-(s.x - p.pos.x), -(s.z - p.pos.z));
        p.step(1 / 60, { mx: 0, my: 1, jump: false, swing: i > 200, camYaw: yaw });
        race.update(1 / 60, p.pos.x, p.pos.z);
      }
      expect(race.state).toBe('finished');
      const medal = medalFor(route, race.time);
      expect(medal).not.toBeNull();
      expect(medal).not.toBe('gold');
    }
  }, 120000);
});

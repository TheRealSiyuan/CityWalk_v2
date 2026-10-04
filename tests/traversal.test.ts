import { beforeAll, describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { Player, type MoveInput } from '../src/player/controller';
import { buildWorld, type World } from '../src/world/city';
import { MAP, RIVER_HALF_WIDTH, WATER_Y, riverDist, riverInfo } from '../src/world/river';
import { SPAWN } from '../src/world/data';
import { Anim } from '../src/player/avatar';

/**
 * Drives the real controller through the real city with a deliberately dumb
 * "beginner" bot: push the stick forward, hold Swing for a beat, let go for a
 * beat, repeat. No aiming, no timing skill.
 */
const DT = 1 / 60;
let world: World;
beforeAll(() => {
  world = buildWorld();
});

function run(start: { x: number; z: number }, camYaw: number, seconds: number, hold = 1.1, gap = 0.45) {
  const player = new Player(world, { x: start.x, y: 0, z: start.z });
  const input: MoveInput = { mx: 0, my: 1, jump: false, swing: false, camYaw };
  let maxY = 0;
  let maxSpeed = 0;
  let airTime = 0;
  const log: string[] = [];
  for (let i = 0; i < seconds * 60; i++) {
    const t = i * DT;
    input.swing = t > 1 && (t - 1) % (hold + gap) < hold;
    player.step(DT, input);
    const p = player.pos;
    const sp = Math.hypot(player.vel.x, player.vel.y, player.vel.z);
    expect(Number.isFinite(p.x + p.y + p.z)).toBe(true);
    expect(p.y).toBeGreaterThanOrEqual(WATER_Y - 3);
    expect(sp).toBeLessThanOrEqual(CONFIG.maxSpeed + 1e-6);
    expect(p.x).toBeGreaterThanOrEqual(MAP.minX);
    expect(p.x).toBeLessThanOrEqual(MAP.maxX);
    maxY = Math.max(maxY, p.y);
    maxSpeed = Math.max(maxSpeed, sp);
    if (!player.grounded) airTime += DT;
    if (i % 30 === 0) log.push(`${t.toFixed(1)}s (${p.x.toFixed(0)},${p.y.toFixed(1)},${p.z.toFixed(0)}) v=${sp.toFixed(1)} ${Anim[player.anim]}${player.rope ? ' L=' + player.rope.length.toFixed(0) : ''}`);
  }
  return { player, maxY, maxSpeed, airTime, log, dist: Math.hypot(player.pos.x - start.x, player.pos.z - start.z) };
}

describe('traversal: a beginner chains swings', () => {
  it('chains at least three swings in the first minute down a city street', () => {
    const road = world.plan.roads[0].pts;
    const yaw = Math.atan2(-(road[2][0] - road[1][0]), -(road[2][1] - road[1][1]));
    const r = run({ x: road[1][0], z: road[1][1] }, yaw, 20);
    if (process.env.TRACE) console.log(r.log.join('\n'), '\n', r.player.swings, r.maxY, r.maxSpeed, r.airTime, r.dist);
    expect(r.player.swings).toBeGreaterThanOrEqual(3);
    expect(r.maxY).toBeGreaterThan(6); // actually left the ground
    expect(r.airTime).toBeGreaterThan(8); // spent most of the run airborne
    expect(r.dist).toBeGreaterThan(120); // and made real progress, faster than running
  });

  it('works from the spawn point too (first thing a new player tries)', () => {
    const r = run(SPAWN, SPAWN.yaw, 25);
    if (process.env.TRACE) console.log(r.log.join('\n'), '\n', r.player.swings, r.maxY, r.maxSpeed, r.airTime, r.dist);
    expect(r.player.swings).toBeGreaterThanOrEqual(3);
    expect(r.maxY).toBeGreaterThan(6);
    expect(r.dist).toBeGreaterThan(60); // not looping in place
  });

  it('never gets stuck: running + swinging in eight directions always makes progress', () => {
    for (let k = 0; k < 8; k++) {
      const [sx, sz] = world.plan.roads[1].pts[1];
      const r = run({ x: sx, z: sz }, (k * Math.PI) / 4, 15);
      expect(r.dist, `direction ${k}`).toBeGreaterThan(40);
    }
  });

  it('falling into the Thames puts you back on the bank, unharmed', () => {
    let splashed = 0;
    // stand on the open embankment and run straight at the water
    const r = { ...riverInfo(330, -20) };
    const off = RIVER_HALF_WIDTH + 6;
    const start = { x: r.cx - r.tz * off, y: 0, z: r.cz + r.tx * off };
    const p = new Player(world, start, { onSplash: () => splashed++ });
    // camera yaw whose forward (-sin, -cos) points from the start to the river centre
    const camYaw = Math.atan2(-(r.cx - start.x), -(r.cz - start.z));
    const input: MoveInput = { mx: 0, my: 1, jump: false, swing: false, camYaw };
    for (let i = 0; i < 60 * 12 && !splashed; i++) p.step(DT, input);
    expect(splashed).toBe(1);
    expect(p.pos.y).toBeGreaterThanOrEqual(0);
    expect(p.grounded).toBe(true);
    expect(riverDist(p.pos.x, p.pos.z)).toBeGreaterThan(RIVER_HALF_WIDTH);
  });
});

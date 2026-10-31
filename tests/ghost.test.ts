import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { GhostRecorder, decodeGhost, encodeGhost, ghostPose, liveDelta, splitDelta, type GhostPose } from '../src/ghost';

const pose = (x: number, roped = false): GhostPose => ({ x, y: 1, z: -x, yaw: 0.5, anim: roped ? 4 : 2, speed: 11, anchor: roped ? { x, y: 30, z: 0 } : null });
const blank = (): GhostPose => ({ x: 0, y: 0, z: 0, yaw: 0, anim: 0, speed: 0, anchor: null });

describe('race ghost', () => {
  it('records at a fixed rate of race time, whatever the frame rate', () => {
    const rec = new GhostRecorder();
    for (let t = 0; t <= 5.0001; t += 1 / 144) rec.record(t, pose(t * 10));
    expect(rec.frames.length).toBe(Math.floor(5 * CONFIG.ghost.sampleHz) + 1);
    const slow = new GhostRecorder();
    for (let t = 0; t <= 5.0001; t += 1 / 20) slow.record(t, pose(t * 10));
    expect(slow.frames.length).toBe(rec.frames.length);
  });

  it('replays the recording, interpolating between frames, holding the end, keeping the rope', () => {
    const rec = new GhostRecorder();
    for (let t = 0; t <= 4.0001; t += 1 / 60) rec.record(t, pose(t * 10, t > 2));
    const g = rec.finish(4, [1.234, 3.5])!;
    expect(g.splits).toEqual([1.23, 3.5]);
    const p = ghostPose(g, 1.05, blank());
    expect(p.x).toBeCloseTo(10.5, 0);
    expect(p.z).toBeCloseTo(-10.5, 0);
    expect(p.anchor).toBeNull();
    expect(ghostPose(g, 3, blank()).anchor).not.toBeNull();
    expect(ghostPose(g, 99, blank()).x).toBeCloseTo(40, 0); // waits at the finish
    expect(ghostPose(g, -1, blank()).x).toBeCloseTo(0, 5); // countdown: at the start
  });

  it('survives storage round trips and rejects anything malformed', () => {
    const rec = new GhostRecorder();
    for (let t = 0; t <= 1; t += 0.05) rec.record(t, pose(t));
    const g = rec.finish(1, [0.5])!;
    expect(decodeGhost(encodeGhost(g))).toEqual(g);
    expect(decodeGhost(null)).toBeNull();
    expect(decodeGhost('not json')).toBeNull();
    expect(decodeGhost(JSON.stringify({ ...g, v: 2 }))).toBeNull();
    expect(decodeGhost(JSON.stringify({ ...g, frames: [[1, 2, 3]] }))).toBeNull();
    expect(decodeGhost(JSON.stringify({ ...g, frames: [...g.frames, [1, 2, 3, 4, 5, 'x']] }))).toBeNull();
    expect(decodeGhost(JSON.stringify({ ...g, splits: 'x' }))).toBeNull();
  });

  it('keeps no ghost for a run too long to store', () => {
    const rec = new GhostRecorder();
    const long = (CONFIG.ghost.maxFrames + 5) / CONFIG.ghost.sampleHz;
    for (let t = 0; t <= long; t += 0.5) rec.record(t, pose(1));
    expect(rec.frames.length).toBeLessThanOrEqual(CONFIG.ghost.maxFrames);
    expect(rec.finish(long)).toBeNull();
  });

  it('reports checkpoint splits as time ahead (+) or behind (-) of the ghost', () => {
    expect(splitDelta(10, [12, 20], 0)).toBe(2);
    expect(splitDelta(23, [12, 20], 1)).toBe(-3);
    expect(splitDelta(5, [12], 1)).toBeNull();
    expect(splitDelta(5, undefined, 0)).toBeNull();
  });

  it('gives a live gap between checkpoints: ahead (+), behind (-), none when off the path', () => {
    // ghost: waits 1 s at the start, runs +x at 10 m/s to a checkpoint at x=50 (t=6), then +z
    const rec = new GhostRecorder();
    for (let t = 0; t <= 11.0001; t += 1 / 60) {
      const x = t < 1 ? 0 : Math.min(50, (t - 1) * 10);
      const z = t <= 6 ? 0 : (t - 6) * 10;
      rec.record(t, { x, y: 0, z, yaw: 0, anim: 2, speed: 10, anchor: null });
    }
    const g = rec.finish(11, [6, 11])!;
    expect(liveDelta(g, 0, 30, 0, 3)).toBeCloseTo(1, 1); // ghost reached x=30 at 4 s: you are 1 s up
    expect(liveDelta(g, 0, 30, 0, 5.5)).toBeCloseTo(-1.5, 1); // 1.5 s down
    expect(liveDelta(g, 0, 0, 0, 0.5)).toBeCloseTo(0, 5); // both still at the start: level
    expect(liveDelta(g, 1, 50, 20, 9)).toBeCloseTo(-1, 1); // second leg uses the second window
    expect(liveDelta(g, 0, 30, 500, 3)).toBeNull(); // nowhere near the ghost's path
    expect(liveDelta(g, 2, 30, 0, 3)).toBeNull(); // past the last checkpoint
    expect(liveDelta({ ...g, splits: undefined }, 0, 30, 0, 3)).toBeNull();
  });
});

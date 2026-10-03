/**
 * Pure rope/pendulum physics. No rendering or DOM dependencies so it can be
 * unit-tested directly (tests/swing.test.ts).
 */
export interface V3 {
  x: number;
  y: number;
  z: number;
}
export interface Body {
  pos: V3;
  vel: V3;
}
export interface Rope {
  anchor: V3;
  length: number;
}
export interface SwingParams {
  gravity: number;
  damping: number;
  /** 0..1: how much of the rope's reel-in speed is handed to the body as momentum */
  reelPull?: number;
  /** cap on that reel-in speed (m/s) */
  reelSpeed?: number;
}

/** Mechanical energy per unit mass. */
export function energy(b: Body, gravity: number): number {
  const v = b.vel;
  return 0.5 * (v.x * v.x + v.y * v.y + v.z * v.z) + gravity * b.pos.y;
}

/** Ballistic step (velocity Verlet: exact for constant gravity). */
export function stepFree(b: Body, dt: number, gravity: number): void {
  b.pos.x += b.vel.x * dt;
  b.pos.y += b.vel.y * dt - 0.5 * gravity * dt * dt;
  b.pos.z += b.vel.z * dt;
  b.vel.y -= gravity * dt;
}

/**
 * One step of a body hanging on an inextensible rope.
 *
 * The rope only pulls (it can go slack). When taut, the body is projected back
 * onto the rope sphere, outward radial velocity is removed, and the speed is
 * corrected so mechanical energy is conserved — so with zero damping this is a
 * true pendulum whose arc does not decay or grow.
 *
 * `ax`/`az` is an optional steering acceleration (the "pump"), which
 * deliberately adds energy. `conserve=false` is used while the rope is being
 * reeled in, where the rope legitimately does work on the body.
 *
 * Returns true if the rope was taut this step.
 */
export function stepSwing(
  b: Body,
  rope: Rope,
  dt: number,
  p: SwingParams,
  ax = 0,
  az = 0,
  conserve = true,
): boolean {
  b.vel.x += ax * dt;
  b.vel.z += az * dt;
  const e0 = energy(b, p.gravity);

  stepFree(b, dt, p.gravity);

  const dx = b.pos.x - rope.anchor.x;
  const dy = b.pos.y - rope.anchor.y;
  const dz = b.pos.z - rope.anchor.z;
  const dist = Math.hypot(dx, dy, dz);
  if (dist <= rope.length || dist < 1e-6) return false;

  const nx = dx / dist;
  const ny = dy / dist;
  const nz = dz / dist;
  b.pos.x = rope.anchor.x + nx * rope.length;
  b.pos.y = rope.anchor.y + ny * rope.length;
  b.pos.z = rope.anchor.z + nz * rope.length;

  const vr = b.vel.x * nx + b.vel.y * ny + b.vel.z * nz;
  if (vr > 0) {
    b.vel.x -= nx * vr;
    b.vel.y -= ny * vr;
    b.vel.z -= nz * vr;
  }

  if (!conserve && p.reelPull) {
    // A shortening rope does work on the body: hand over part of the reel-in
    // speed as momentum toward the anchor so the pull feels like a launch.
    const pull = Math.min((dist - rope.length) / dt, p.reelSpeed ?? Infinity) * p.reelPull;
    const inward = -(b.vel.x * nx + b.vel.y * ny + b.vel.z * nz);
    if (inward < pull) {
      const add = pull - inward;
      b.vel.x -= nx * add;
      b.vel.y -= ny * add;
      b.vel.z -= nz * add;
    }
  }

  if (conserve) {
    const speed = Math.hypot(b.vel.x, b.vel.y, b.vel.z);
    const target2 = 2 * (e0 - p.gravity * b.pos.y);
    // Only redirect when the tangent direction is well defined.
    if (speed > 1 && target2 > 0) {
      const s = Math.sqrt(target2) / speed;
      b.vel.x *= s;
      b.vel.y *= s;
      b.vel.z *= s;
    }
  }

  if (p.damping > 0) {
    const k = Math.exp(-p.damping * dt);
    b.vel.x *= k;
    b.vel.y *= k;
    b.vel.z *= k;
  }
  return true;
}

/** Letting go: the rope simply stops constraining. Velocity is untouched. */
export function releaseRope(b: Body): V3 {
  return { x: b.vel.x, y: b.vel.y, z: b.vel.z };
}

/** Shorten the rope toward `target` at `speed`. Returns true while reeling. */
export function reelRope(rope: Rope, target: number, speed: number, dt: number): boolean {
  if (rope.length <= target) return false;
  rope.length = Math.max(target, rope.length - speed * dt);
  return true;
}

export interface AimParams {
  maxRope: number;
  minAnchorRise: number;
  aimConeDot: number;
  idealDist: number;
  idealElevation: number;
}

/**
 * Generous auto-aim: pick the best anchor that is ahead of and above the
 * player. `fx,fz` is the (unit, horizontal) direction the player is heading.
 * Returns the index into `anchors`, or -1.
 */
export function selectAnchor(
  pos: V3,
  fx: number,
  fz: number,
  anchors: readonly V3[],
  p: AimParams,
): number {
  let best = -1;
  let bestScore = -Infinity;
  for (let i = 0; i < anchors.length; i++) {
    const a = anchors[i];
    const dx = a.x - pos.x;
    const dy = a.y - pos.y;
    const dz = a.z - pos.z;
    if (dy < p.minAnchorRise) continue;
    const dist = Math.hypot(dx, dy, dz);
    if (dist > p.maxRope) continue;
    const horiz = Math.hypot(dx, dz);
    const ahead = horiz > 0.5 ? (dx * fx + dz * fz) / horiz : 1;
    if (ahead < p.aimConeDot) continue;
    const elev = dy / dist;
    // Ahead matters most; then a good swing angle and distance; and a high
    // anchor (rooftop, crane) beats a low one (lamppost) because it swings further.
    const score =
      ahead * 2 -
      Math.abs(elev - p.idealElevation) * 1.5 -
      Math.abs(dist - p.idealDist) / p.idealDist +
      (Math.min(dy, 30) / 30) * 0.8;
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return best;
}

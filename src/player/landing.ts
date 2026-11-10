import { CONFIG } from '../config';

const MAX_VY = 60;
const FALL_DECAY = CONFIG.gravity * 2;

export type LandingConfig = typeof CONFIG.landing;
export type LandKind = 'none' | 'crouch' | 'roll';

/** Which landing pose a touchdown earns: `fall` is downward speed, `speed` across the ground (m/s). */
export function landKind(fall: number, speed: number, cfg: LandingConfig = CONFIG.landing): LandKind {
  if (!cfg.enabled || !(fall >= cfg.crouchFall)) return 'none';
  if (fall >= cfg.rollFall && speed >= cfg.rollSpeed) return 'roll';
  return 'crouch';
}

/**
 * The body's pose `t` seconds into a landing, or null once it is over.
 * The body turns forward by `angle` about a point `pivot` m above the feet,
 * that point rises by `lift`, and the body is scaled by `sy` (up) and `sxz` (across).
 */
export interface LandPose {
  angle: number;
  pivot: number;
  lift: number;
  sy: number;
  sxz: number;
  /** 0..1: how tucked the arms and legs are */
  tuck: number;
}

export function landPose(kind: LandKind, t: number, cfg: LandingConfig = CONFIG.landing): LandPose | null {
  if (kind === 'none' || t < 0) return null;
  if (kind === 'crouch') {
    if (t >= cfg.crouchTime) return null;
    const u = t / cfg.crouchTime;
    // fast down, slower back up
    const k = u < 0.3 ? Math.sin((u / 0.3) * Math.PI * 0.5) : Math.cos(((u - 0.3) / 0.7) * Math.PI * 0.5);
    return { angle: 0, pivot: 0, lift: 0, sy: 1 - cfg.crouchDepth * k, sxz: 1 + cfg.crouchDepth * 0.4 * k, tuck: k * 0.5 };
  }
  if (t >= cfg.rollTime) return null;
  const u = t / cfg.rollTime;
  const e = u * u * (3 - 2 * u); // ease in and out
  const k = Math.sin(Math.PI * u);
  const s = 1 - cfg.rollTuck * k;
  return { angle: Math.PI * 2 * e, pivot: cfg.rollPivot, lift: cfg.rollLift * k, sy: s, sxz: s, tuck: k };
}

/**
 * Where a point of the body (height `y`, `z` forward of the feet) ends up in a pose,
 * in the body's own upright frame. Matches how the avatar applies the pose.
 */
export function posePoint(p: LandPose, y: number, z: number): { y: number; z: number } {
  const ly = (y - p.pivot) * p.sy;
  const lz = z * p.sxz;
  const c = Math.cos(p.angle);
  const s = Math.sin(p.angle);
  // rotation about the sideways axis: positive angle tips the head forward
  return { y: p.pivot + p.lift + ly * c - lz * s, z: ly * s + lz * c };
}

/**
 * Watches an avatar's height and animation state and starts a landing pose on
 * touchdown. Works from positions alone, so it also runs for friends and ghosts.
 */
export class LandingTracker {
  kind: LandKind = 'none';
  t = 0;
  /** number of landing poses started (diagnostics / tests) */
  count = 0;
  private lastY: number | null = null;
  private fall = 0;
  private wasAir = false;

  constructor(private cfg: LandingConfig = CONFIG.landing) {}

  /** `airborne` = falling or roped; returns the current pose, if any. */
  update(dt: number, y: number, airborne: boolean, speed: number): LandPose | null {
    let vy = this.lastY === null || dt <= 0 ? 0 : (y - this.lastY) / dt;
    if (Math.abs(vy) > MAX_VY) vy = 0; // a teleport, not a fall
    this.lastY = y;
    if (airborne) {
      // Remembered fall speed may only drop as fast as twice gravity would slow it, so
      // one jittery frame (a friend's interpolated position) does not erase a real fall,
      // while a swing's fast low point is forgotten by the time you let go and drop.
      this.fall = this.wasAir ? Math.max(-vy, this.fall - FALL_DECAY * dt) : -vy;
      this.wasAir = true;
      this.kind = 'none';
      return null;
    }
    if (this.wasAir) {
      this.wasAir = false;
      this.kind = landKind(this.fall, speed, this.cfg);
      this.t = 0;
      if (this.kind !== 'none') this.count++;
    } else {
      this.t += dt;
    }
    const pose = landPose(this.kind, this.t, this.cfg);
    if (!pose) this.kind = 'none';
    return pose;
  }
}

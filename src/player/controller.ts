import { CONFIG } from '../config';
import { type Body, type Rope, type V3, reelRope, selectAnchor, stepFree, stepSwing } from '../physics/swing';
import { MAP, RIVER_HALF_WIDTH, WATER_Y, groundHeight, nearestBank, riverDist } from '../world/river';
import type { World } from '../world/city';
import { Anim } from './avatar';

export interface MoveInput {
  /** stick, camera-relative: x = right, y = forward, magnitude 0..1 */
  mx: number;
  my: number;
  jump: boolean; // edge: pressed this frame
  swing: boolean; // held
  camYaw: number;
}

export interface PlayerEvents {
  onSplash?(): void;
  onAttach?(): void;
  onRelease?(): void;
  onJump?(): void;
  onLand?(speed: number): void;
}

/** Character controller: walk / run / jump / swing, fixed-step. */
export class Player implements Body {
  pos: V3;
  vel: V3 = { x: 0, y: 0, z: 0 };
  yaw = 0;
  grounded = true;
  rope: (Rope & { target: number }) | null = null;
  anim: Anim = Anim.Idle;
  /** best anchor the swing button would grab right now (for the reticle) */
  aim: V3 | null = null;
  swings = 0;
  private coyote = 0;
  private jumpBuf = 0;
  private swingWasHeld = false;
  private wantAttach = false;
  private lastSafe: V3;
  /** last position known to be outside every solid */
  private prev: V3;
  private stuck = 0;
  /** how many steps the safety net had to step in (diagnostics) */
  saves = 0;

  constructor(
    private world: World,
    spawn: V3,
    private events: PlayerEvents = {},
  ) {
    this.pos = { ...spawn };
    this.lastSafe = { ...spawn };
    this.prev = { ...spawn };
  }

  get speed(): number {
    return Math.hypot(this.vel.x, this.vel.z);
  }

  teleport(x: number, y: number, z: number): void {
    this.pos.x = x;
    this.pos.y = y;
    this.pos.z = z;
    this.vel.x = this.vel.y = this.vel.z = 0;
    this.rope = null;
    this.prev.x = x;
    this.prev.y = y;
    this.prev.z = z;
  }

  private findAnchor(dirX: number, dirZ: number): V3 | null {
    const S = CONFIG.swing;
    const near = this.world.anchorsNear(this.pos.x, this.pos.z, S.maxRope);
    const i = selectAnchor(this.pos, dirX, dirZ, near, S);
    return i < 0 ? null : near[i];
  }

  step(dt: number, input: MoveInput): void {
    const C = CONFIG;
    const S = C.swing;
    const p = this.pos;
    const v = this.vel;

    // Camera-relative stick direction.
    const sy = Math.sin(input.camYaw);
    const cy = Math.cos(input.camYaw);
    let dx = input.mx * cy - input.my * sy;
    let dz = -input.mx * sy - input.my * cy;
    const mag = Math.min(1, Math.hypot(dx, dz));
    if (mag > 1e-3) {
      const l = Math.hypot(dx, dz);
      dx /= l;
      dz /= l;
    }

    // Heading used for auto-aim: travel direction, steered by the stick, else camera.
    let hx = -sy;
    let hz = -cy;
    const sp = this.speed;
    if (mag > 0.2) {
      hx = dx;
      hz = dz;
    }
    if (sp > 3) {
      hx = hx * 0.5 + (v.x / sp) * 0.9;
      hz = hz * 0.5 + (v.z / sp) * 0.9;
    }
    const hl = Math.hypot(hx, hz) || 1;
    hx /= hl;
    hz /= hl;

    // --- swing button ------------------------------------------------------
    if (input.swing && !this.swingWasHeld) this.wantAttach = true;
    if (!input.swing) {
      this.wantAttach = false;
      if (this.rope) {
        this.rope = null;
        this.events.onRelease?.();
      }
    }
    this.swingWasHeld = input.swing;
    this.aim = this.rope ? null : this.findAnchor(hx, hz);
    if (this.wantAttach && !this.rope && this.aim) {
      const a = this.aim;
      const dist = Math.hypot(a.x - p.x, a.y - p.y, a.z - p.z);
      const floor = Math.max(groundHeight(p.x, p.z), 0);
      const target = Math.max(S.minRope, Math.min(dist, a.y - floor - S.groundClearance));
      this.rope = { anchor: a, length: Math.max(dist, S.minRope), target };
      this.wantAttach = false;
      this.swings++;
      if (this.grounded) {
        v.y = Math.max(v.y, S.attachHop);
        this.grounded = false;
      }
      this.aim = null;
      this.events.onAttach?.();
    }

    // --- jump ---------------------------------------------------------------
    this.jumpBuf = input.jump ? C.jumpBuffer : this.jumpBuf - dt;
    this.coyote = this.grounded ? C.coyoteTime : this.coyote - dt;
    if (this.jumpBuf > 0) {
      if (this.rope) {
        this.rope = null;
        v.y += S.jumpOffBoost;
        this.jumpBuf = 0;
        this.wantAttach = false;
        this.events.onRelease?.();
        this.events.onJump?.();
      } else if (this.coyote > 0) {
        v.y = C.jumpSpeed;
        this.grounded = false;
        this.coyote = 0;
        this.jumpBuf = 0;
        this.events.onJump?.();
      }
    }

    // --- integrate ----------------------------------------------------------
    const wasGrounded = this.grounded;
    const fallSpeed = -v.y;
    if (this.rope) {
      const reeling = reelRope(this.rope, this.rope.target, S.reelSpeed, dt);
      stepSwing(this, this.rope, dt, { gravity: C.gravity, damping: S.damping, reelPull: S.reelPull, reelSpeed: S.reelSpeed }, dx * mag * S.pump, dz * mag * S.pump, !reeling);
    } else {
      if (this.grounded) {
        const target =
          mag < C.runThreshold
            ? (mag / C.runThreshold) * C.walkSpeed
            : C.walkSpeed + ((mag - C.runThreshold) / (1 - C.runThreshold)) * (C.runSpeed - C.walkSpeed);
        const tx = dx * target;
        const tz = dz * target;
        const ex = tx - v.x;
        const ez = tz - v.z;
        const el = Math.hypot(ex, ez);
        const maxDv = C.groundAccel * dt;
        if (el <= maxDv) {
          v.x = tx;
          v.z = tz;
        } else {
          v.x += (ex / el) * maxDv;
          v.z += (ez / el) * maxDv;
        }
      } else if (mag > 0.05) {
        const before = Math.hypot(v.x, v.z);
        v.x += dx * mag * C.airControl * dt;
        v.z += dz * mag * C.airControl * dt;
        const after = Math.hypot(v.x, v.z);
        const cap = Math.max(before, C.runSpeed);
        if (after > cap) {
          v.x *= cap / after;
          v.z *= cap / after;
        }
      }
      stepFree(this, dt, C.gravity);
    }

    const total = Math.hypot(v.x, v.y, v.z);
    if (total > C.maxSpeed) {
      const k = C.maxSpeed / total;
      v.x *= k;
      v.y *= k;
      v.z *= k;
    }

    // --- collide ------------------------------------------------------------
    let grounded = this.world.colliders.resolve(this, C.playerRadius, C.playerHeight, wasGrounded ? C.stepHeight : C.ledgeAssist);
    const gy = groundHeight(p.x, p.z);
    if (p.y <= gy) {
      p.y = gy;
      if (v.y < 0) v.y = 0;
      grounded = true;
    }
    // Stay glued to the surface when walking down a slope, a pitched roof or a
    // kerb, instead of becoming airborne for a frame at a time.
    if (!grounded && wasGrounded && v.y <= 0 && !this.rope) {
      const support = Math.max(gy, this.world.colliders.topAt(p.x, p.z, p.y + 0.05));
      if (p.y - support < 0.45) {
        p.y = support;
        v.y = 0;
        grounded = true;
      }
    }
    // Safety net: whatever happened above, the body is never left inside a
    // solid. If it would be (wedged by a reeling rope, say), stay where we were.
    if (this.world.colliders.blocked(p.x, p.y + C.playerHeight * 0.5, p.z)) {
      p.x = this.prev.x;
      p.y = this.prev.y;
      p.z = this.prev.z;
      v.x = v.y = v.z = 0;
      grounded = wasGrounded;
      this.saves++;
      if (this.rope && ++this.stuck > 12) {
        this.rope = null;
        this.events.onRelease?.();
      }
    } else {
      this.stuck = 0;
      this.prev.x = p.x;
      this.prev.y = p.y;
      this.prev.z = p.z;
    }
    if (p.x < MAP.minX) { p.x = MAP.minX; if (v.x < 0) v.x = 0; }
    if (p.x > MAP.maxX) { p.x = MAP.maxX; if (v.x > 0) v.x = 0; }
    if (p.z < MAP.minZ) { p.z = MAP.minZ; if (v.z < 0) v.z = 0; }
    if (p.z > MAP.maxZ) { p.z = MAP.maxZ; if (v.z > 0) v.z = 0; }
    this.grounded = grounded;
    if (grounded && !wasGrounded && fallSpeed > 4) this.events.onLand?.(fallSpeed);

    // --- the Thames never punishes: hop back to the nearest bank -------------
    if (p.y < WATER_Y + 0.25 && riverDist(p.x, p.z) < RIVER_HALF_WIDTH) {
      const bank = nearestBank(p.x, p.z);
      const top = this.world.colliders.topAt(bank.x, bank.z);
      this.teleport(bank.x, Math.max(groundHeight(bank.x, bank.z), top) + 0.05, bank.z);
      this.grounded = true;
      this.events.onSplash?.();
    } else if (grounded && riverDist(p.x, p.z) > RIVER_HALF_WIDTH + 4) {
      this.lastSafe.x = p.x;
      this.lastSafe.y = p.y;
      this.lastSafe.z = p.z;
    }
    if (!Number.isFinite(p.x + p.y + p.z) || p.y < -50) this.teleport(this.lastSafe.x, this.lastSafe.y, this.lastSafe.z);

    // --- facing + animation state -------------------------------------------
    const hs = this.speed;
    if (hs > 0.6) {
      const want = Math.atan2(v.x, v.z);
      let d = want - this.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.yaw += d * Math.min(1, C.turnRate * dt);
    }
    if (this.rope) this.anim = Anim.Swing;
    else if (!grounded) this.anim = Anim.Air;
    else if (hs > C.walkSpeed + 1) this.anim = Anim.Run;
    else if (hs > 0.4) this.anim = Anim.Walk;
    else this.anim = Anim.Idle;
  }
}

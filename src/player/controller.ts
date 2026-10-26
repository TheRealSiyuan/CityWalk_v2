import { CONFIG } from '../config';
import { type AimParams, type Body, type Rope, type V3, reelRope, selectAnchor, stepFree, stepSwing } from '../physics/swing';
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

/** A rope in use. `anchor` is the physics pivot; `visual` is where it is drawn. */
export interface ActiveRope extends Rope {
  target: number;
  visual: V3;
  mode: 'swing' | 'zip';
  /** heading when attached */
  hx: number;
  hz: number;
  age: number;
  descended: boolean;
}

export interface PlayerEvents {
  onSplash?(): void;
  onAttach?(): void;
  /** Swing pressed but nothing in reach */
  onMiss?(): void;
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
  rope: ActiveRope | null = null;
  anim: Anim = Anim.Idle;
  /** best anchor the swing button would grab right now (for the reticle) */
  aim: V3 | null = null;
  swings = 0;
  private coyote = 0;
  private jumpBuf = 0;
  private swingWasHeld = false;
  private wantAttach = false;
  private rehook = -1;
  private swingWasHeldFrames = 0;
  private chaining = false;
  private airJumps = 0;
  private lastAnchor: V3 | null = null;
  private lastAnchorT = 0;
  private time = 0;
  private aimZip = false;
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

  /** Is the straight line from the body to this anchor free of buildings? */
  private clearLine(a: V3): boolean {
    const p = this.pos;
    const sx = p.x;
    const sy = p.y + 1.6;
    const sz = p.z;
    const dx = a.x - sx;
    const dy = a.y - sy;
    const dz = a.z - sz;
    const len = Math.hypot(dx, dy, dz);
    const stop = Math.max(0, len - 1.2); // the anchor itself sits on a roof edge
    for (let t = 1.5; t < stop; t += 2.5) {
      const k = t / len;
      if (this.world.colliders.blocked(sx + dx * k, sy + dy * k, sz + dz * k)) return false;
    }
    return true;
  }

  private pickFrom(near: V3[], dirX: number, dirZ: number, params: AimParams): V3 | null {
    const S = CONFIG.swing;
    const skip = this.time - this.lastAnchorT < 0.9 ? this.lastAnchor : null;
    // look slightly ahead of where we are, so fast swings aim where we are going
    const probe = { x: this.pos.x + this.vel.x * 0.15, y: this.pos.y + Math.max(0, this.vel.y) * 0.1, z: this.pos.z + this.vel.z * 0.15 };
    const pool = near.slice();
    for (let tries = 0; tries < 16 && pool.length; tries++) {
      const i = selectAnchor(probe, dirX, dirZ, pool, params);
      if (i < 0) return null;
      const a = pool[i];
      if (a !== skip && (!S.lineOfSight || this.clearLine(a))) return a;
      pool.splice(i, 1);
    }
    return null;
  }

  /** Best anchor for a swing; failing that, a level/low one for a zip. */
  private findAnchor(dirX: number, dirZ: number, strict = false): V3 | null {
    const S = CONFIG.swing;
    const near = this.world.anchorsNear(this.pos.x, this.pos.z, S.maxRope);
    this.aimZip = false;
    // automatic re-grabs (hold-to-chain) only take anchors that are genuinely
    // ahead, so holding never drags you sideways or back the way you came
    const a = this.pickFrom(near, dirX, dirZ, strict ? { ...S, aimConeDot: S.chainConeDot } : S);
    if (a) {
      const horiz = Math.hypot(a.x - this.pos.x, a.z - this.pos.z);
      this.aimZip = a.y - this.pos.y < Math.max(4, horiz * 0.3);
      return a;
    }
    const z = this.pickFrom(near, dirX, dirZ, { ...S, maxRope: S.zipMaxRope, minAnchorRise: -1.5, aimConeDot: 0.3, idealDist: 16, idealElevation: 0.1 });
    if (z) this.aimZip = true;
    return z;
  }

  /** Start a swing (or zip) from anchor `a`, travelling along (hx,hz). */
  private attach(a: V3, hx: number, hz: number): void {
    const S = CONFIG.swing;
    const p = this.pos;
    const v = this.vel;
    const sp = Math.hypot(v.x, v.z);
    if (sp > 3) {
      hx = v.x / sp;
      hz = v.z / sp;
    }
    const zip = this.aimZip;
    let pivot = a;
    if (!zip && S.straighten > 0) {
      // slide the pivot sideways toward the line we are travelling along
      const lat = (a.x - p.x) * -hz + (a.z - p.z) * hx;
      pivot = { x: a.x + hz * lat * S.straighten, y: a.y, z: a.z - hx * lat * S.straighten };
    }
    const dist = Math.hypot(pivot.x - p.x, pivot.y - p.y, pivot.z - p.z);
    const floor = Math.max(groundHeight(p.x, p.z), 0);
    const target = zip ? S.minRope : Math.max(S.minRope, Math.min(dist, pivot.y - floor - S.groundClearance));
    this.rope = { anchor: pivot, visual: a, length: Math.max(dist, S.minRope), target, mode: zip ? 'zip' : 'swing', hx, hz, age: 0, descended: false };
    this.wantAttach = false;
    this.rehook = -1;
    this.airJumps = CONFIG.airJumps;
    this.swings++;
    if (this.grounded) {
      v.y = Math.max(v.y, S.attachHop);
      this.grounded = false;
    }
    this.aim = null;
    this.events.onAttach?.();
  }

  private letGo(auto: boolean): void {
    const r = this.rope;
    if (!r) return;
    this.lastAnchor = r.visual;
    this.lastAnchorT = this.time;
    if (r.mode === 'zip') this.vel.y = Math.max(this.vel.y, CONFIG.swing.zipPop);
    this.rope = null;
    if (auto) this.rehook = CONFIG.swing.rehook;
    this.events.onRelease?.();
  }

  /** Should a held rope let go by itself? (hold-to-chain) */
  private spent(r: ActiveRope): boolean {
    const S = CONFIG.swing;
    const p = this.pos;
    const v = this.vel;
    if (r.mode === 'zip') {
      const dx = r.visual.x - p.x;
      const dz = r.visual.z - p.z;
      const d = Math.hypot(dx, r.visual.y - p.y, dz);
      return d < S.minRope + 1.5 || (r.age > 0.15 && dx * r.hx + dz * r.hz < 0) || r.age > 2.5;
    }
    if (!S.autoRelease || r.age < 0.3) return false;
    const ox = p.x - r.anchor.x;
    const oz = p.z - r.anchor.z;
    const ahead = ox * r.hx + oz * r.hz; // how far past the pivot along the travel line
    const below = r.anchor.y - p.y;
    const angle = Math.atan2(ahead, below);
    const forward = v.x * r.hx + v.z * r.hz;
    if (r.descended && v.y > 0 && v.y < S.releaseVy && angle > 0.3) return true;
    if (angle > S.releaseAngle && v.y > 0) return true;
    return r.age > 0.9 && forward < 1.5 && Math.hypot(v.x, v.y, v.z) < 4;
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
    this.time += dt;
    // Holding Swing means "keep me on a rope": whenever there is no rope (after
    // an automatic release, a splash, landing...) it grabs the next good anchor,
    // apart from a short pause after letting go so the release is felt.
    if (input.swing && !this.swingWasHeld) this.rehook = -1;
    if (!input.swing) {
      this.rehook = -1;
      if (this.rope) this.letGo(false);
    }
    this.swingWasHeld = input.swing;
    if (this.rope && input.swing && this.spent(this.rope)) this.letGo(true);
    if (this.rehook >= 0) {
      this.rehook -= dt;
      if (this.rehook < 0) this.chaining = true;
    }
    this.wantAttach = input.swing && this.rehook < 0;
    if (this.rope || !input.swing || this.grounded) this.chaining = false;
    this.aim = this.rope ? null : this.findAnchor(hx, hz, this.chaining);
    if (this.wantAttach && !this.rope) {
      if (this.aim) this.attach(this.aim, hx, hz);
      else if (input.swing && this.swingWasHeldFrames === 0) this.events.onMiss?.();
    }
    this.swingWasHeldFrames = input.swing ? this.swingWasHeldFrames + 1 : 0;

    // --- jump ---------------------------------------------------------------
    this.jumpBuf = input.jump ? C.jumpBuffer : this.jumpBuf - dt;
    this.coyote = this.grounded ? C.coyoteTime : this.coyote - dt;
    if (this.jumpBuf > 0) {
      if (this.rope) {
        this.letGo(false);
        this.rehook = 0.35; // a jump-off is a deliberate exit: don't instantly re-grab
        v.y += S.jumpOffBoost;
        this.jumpBuf = 0;
        this.wantAttach = false;
        this.events.onJump?.();
      } else if (this.coyote > 0) {
        v.y = C.jumpSpeed;
        this.grounded = false;
        this.coyote = 0;
        this.jumpBuf = 0;
        this.events.onJump?.();
      } else if (this.airJumps > 0) {
        // a second jump in mid-air: the recovery move when a swing goes wrong
        v.y = Math.max(v.y, C.jumpSpeed * C.airJumpScale);
        this.airJumps--;
        this.jumpBuf = 0;
        this.events.onJump?.();
      }
    }

    // --- integrate ----------------------------------------------------------
    const wasGrounded = this.grounded;
    const fallSpeed = -v.y;
    if (this.rope) {
      const r = this.rope;
      r.age += dt;
      if (v.y < -1.5) r.descended = true;
      const zip = r.mode === 'zip';
      const reelSpeed = zip ? S.zipSpeed : S.reelSpeed;
      const reeling = reelRope(r, r.target, reelSpeed, dt);
      const pump = zip ? 0 : S.pump;
      stepSwing(this, r, dt, { gravity: C.gravity, damping: S.damping, reelPull: zip ? S.zipPull : S.reelPull, reelSpeed }, dx * mag * pump, dz * mag * pump, !reeling);
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
        // Landing from a swing faster than a run: slide out of it gently rather
        // than stopping dead, so momentum carries into the next jump or swing.
        const fast = Math.hypot(v.x, v.z) > C.runSpeed + 0.5 && v.x * dx + v.z * dz > 0;
        const maxDv = (fast ? C.slideDecel : C.groundAccel) * dt;
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
      if (this.rope && ++this.stuck > 12) this.letGo(false);
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
    if (grounded) this.airJumps = C.airJumps;
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

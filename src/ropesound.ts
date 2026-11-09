import { CONFIG } from './config';

type V3 = { x: number; y: number; z: number };

/**
 * Rope tension in g: what the rope must supply to keep you on the arc.
 * Centripetal pull (tangential speed² / radius) plus the share of gravity along the rope.
 * Hanging still under the anchor reads 1; whipping through the low point reads 2–4.
 */
export function ropeTension(pos: V3, vel: V3, anchor: V3, gravity = CONFIG.gravity): number {
  const rx = anchor.x - pos.x;
  const ry = anchor.y - pos.y;
  const rz = anchor.z - pos.z;
  const r = Math.hypot(rx, ry, rz);
  if (r < 1e-3) return 0;
  const radial = (vel.x * rx + vel.y * ry + vel.z * rz) / r;
  const tan2 = Math.max(0, vel.x * vel.x + vel.y * vel.y + vel.z * vel.z - radial * radial);
  const along = gravity * (ry / r); // gravity's share pulling you away from an anchor above
  return Math.max(0, (tan2 / r + along) / gravity);
}

/** The rope's hum for a given tension: silent when slack, louder and higher as it pulls harder. */
export function ropeHum(tension: number | null, cfg = CONFIG.ropeHum): { gain: number; freq: number } {
  if (!cfg.enabled || tension === null) return { gain: 0, freq: cfg.baseFreq };
  const k = Math.min(1, Math.max(0, (tension - cfg.minTension) / (cfg.fullTension - cfg.minTension)));
  return { gain: k * cfg.maxGain, freq: cfg.baseFreq + k * (cfg.topFreq - cfg.baseFreq) };
}

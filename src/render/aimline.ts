import * as THREE from 'three';
import { CONFIG } from '../config';

export interface P3 {
  x: number;
  y: number;
  z: number;
}

/**
 * Where the aim preview line runs: from just off the player's hand to the anchor
 * the Swing button would grab. Null when there is nothing to show.
 */
export function aimSegment(hand: P3, aim: P3 | null, roped: boolean, cfg = CONFIG.aimLine): { from: P3; to: P3; len: number } | null {
  if (!cfg.enabled || !aim || roped) return null;
  const dx = aim.x - hand.x, dy = aim.y - hand.y, dz = aim.z - hand.z;
  const full = Math.hypot(dx, dy, dz);
  const len = full - cfg.startGap;
  if (len < cfg.minLength) return null;
  const k = cfg.startGap / full;
  return { from: { x: hand.x + dx * k, y: hand.y + dy * k, z: hand.z + dz * k }, to: { x: aim.x, y: aim.y, z: aim.z }, len };
}

/**
 * A dotted line previewing the next rope, drawn while a target is in reach.
 * Dots (not a GL line) so it stays visible on high-density phone screens,
 * where a 1-pixel line all but disappears.
 */
export class AimLine {
  readonly line: THREE.InstancedMesh;
  private readonly m = new THREE.Matrix4();

  constructor(scene: THREE.Scene) {
    const cfg = CONFIG.aimLine;
    const geo = new THREE.BoxGeometry(cfg.dot, cfg.dot, cfg.dot);
    const mat = new THREE.MeshBasicMaterial({ color: cfg.color, transparent: true, opacity: cfg.opacity, depthWrite: false });
    this.line = new THREE.InstancedMesh(geo, mat, cfg.maxDots);
    this.line.frustumCulled = false;
    this.line.visible = false;
    this.line.renderOrder = 4;
    scene.add(this.line);
  }

  update(hand: P3, aim: P3 | null, roped: boolean): void {
    const s = aimSegment(hand, aim, roped);
    this.line.visible = !!s;
    if (!s) return;
    const cfg = CONFIG.aimLine;
    const n = Math.min(cfg.maxDots, Math.floor(s.len / cfg.spacing) + 1);
    for (let i = 0; i < n; i++) {
      const t = n > 1 ? i / (n - 1) : 1;
      this.m.makeTranslation(s.from.x + (s.to.x - s.from.x) * t, s.from.y + (s.to.y - s.from.y) * t, s.from.z + (s.to.z - s.from.z) * t);
      this.line.setMatrixAt(i, this.m);
    }
    this.line.count = n;
    this.line.instanceMatrix.needsUpdate = true;
  }
}

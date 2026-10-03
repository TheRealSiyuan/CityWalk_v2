import * as THREE from 'three';
import type { Colliders } from './colliders';
import type { V3 } from '../physics/swing';

export interface PartOpts {
  /** yaw (three.js convention) */
  ry?: number;
  rx?: number;
  rz?: number;
  /** also register a collision box (boxes / cylinders only) */
  solid?: boolean;
}

const UP = new THREE.Vector3(0, 1, 0);

/** Unit gable prism: ridge along x, base y=0, apex y=1, footprint 1×1. */
function gableGeometry(): THREE.BufferGeometry {
  const A = [-0.5, 0, -0.5], B = [0.5, 0, -0.5], C = [0.5, 0, 0.5], D = [-0.5, 0, 0.5];
  const E = [-0.5, 1, 0], F = [0.5, 1, 0];
  const tris = [A, E, F, A, F, B, D, C, F, D, F, E, A, D, E, B, F, C];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(tris.flat()), 3));
  g.computeVertexNormals();
  return g;
}
export const GABLE = gableGeometry();

/**
 * Accumulates coloured primitives into ONE merged, vertex-coloured mesh
 * (one draw call), while registering colliders and swing anchors in the same
 * local frame. `at()` sets the frame for a landmark.
 */
export class Builder {
  private pos: Float32Array[] = [];
  private nor: Float32Array[] = [];
  private col: number[][] = [];
  private count = 0;
  private origin = new THREE.Matrix4();
  private ox = 0;
  private oz = 0;
  private yaw = 0;

  constructor(
    private colliders: Colliders | null,
    private anchors: V3[] | null,
  ) {}

  at(x: number, z: number, yaw = 0): this {
    this.ox = x;
    this.oz = z;
    this.yaw = yaw;
    this.origin.makeRotationY(yaw).setPosition(x, 0, z);
    return this;
  }

  /** Local → world on the ground plane. */
  world(x: number, z: number): { x: number; z: number } {
    const c = Math.cos(this.yaw);
    const s = Math.sin(this.yaw);
    return { x: this.ox + x * c + z * s, z: this.oz - x * s + z * c };
  }

  add(g: THREE.BufferGeometry, color: number, local: THREE.Matrix4): void {
    const ng = g.index ? g.toNonIndexed() : g.clone();
    ng.applyMatrix4(new THREE.Matrix4().multiplyMatrices(this.origin, local));
    const p = ng.getAttribute('position').array as Float32Array;
    const n = ng.getAttribute('normal').array as Float32Array;
    this.pos.push(p);
    this.nor.push(n);
    this.col.push([((color >> 16) & 255) / 255, ((color >> 8) & 255) / 255, (color & 255) / 255]);
    this.count += p.length / 3;
    if (ng !== g) ng.dispose();
    g.dispose();
  }

  private mat(x: number, y: number, z: number, o?: PartOpts): THREE.Matrix4 {
    const m = new THREE.Matrix4();
    if (o && (o.rx || o.ry || o.rz)) m.makeRotationFromEuler(new THREE.Euler(o.rx ?? 0, o.ry ?? 0, o.rz ?? 0, 'YXZ'));
    return m.setPosition(x, y, z);
  }

  solid(x: number, z: number, hx: number, hz: number, y0: number, y1: number, ry = 0): void {
    if (!this.colliders) return;
    const w = this.world(x, z);
    this.colliders.add(w.x, w.z, hx, hz, y0, y1, this.yaw + ry);
  }

  anchor(x: number, y: number, z: number): void {
    if (!this.anchors) return;
    const w = this.world(x, z);
    this.anchors.push({ x: w.x, y, z: w.z });
  }

  /** Box with its base at y. */
  box(x: number, y: number, z: number, sx: number, sy: number, sz: number, color: number, o?: PartOpts): void {
    this.add(new THREE.BoxGeometry(sx, sy, sz), color, this.mat(x, y + sy / 2, z, o));
    if (o?.solid) this.solid(x, z, sx / 2, sz / 2, y, y + sy, o.ry ?? 0);
  }

  /** Upright cylinder / cone with its base at y. */
  cyl(x: number, y: number, z: number, rTop: number, rBot: number, h: number, color: number, seg = 10, o?: PartOpts): void {
    this.add(new THREE.CylinderGeometry(rTop, rBot, h, seg, 1), color, this.mat(x, y + h / 2, z, o));
    if (o?.solid) {
      const r = Math.max(rTop, rBot) * 0.9;
      this.solid(x, z, r, r, y, y + h, o.ry ?? 0);
    }
  }

  /** Square pyramid aligned with a box of the given full width. */
  pyr(x: number, y: number, z: number, width: number, h: number, color: number, topWidth = 0, ry = 0): void {
    const k = Math.SQRT1_2;
    this.add(new THREE.CylinderGeometry(topWidth * k, width * k, h, 4, 1), color, this.mat(x, y + h / 2, z, { ry: Math.PI / 4 + ry }));
  }

  /** Sphere centred at (x,y,z), optionally squashed/stretched vertically. */
  sphere(x: number, y: number, z: number, r: number, color: number, sy = 1, seg = 10): void {
    const g = new THREE.SphereGeometry(r, seg, Math.max(5, Math.floor(seg * 0.7)));
    if (sy !== 1) g.scale(1, sy, 1);
    this.add(g, color, this.mat(x, y, z));
  }

  /** Gable roof: `len` along the ridge, `span` across, base at y. */
  roof(x: number, y: number, z: number, len: number, h: number, span: number, color: number, ry = 0): void {
    const g = GABLE.clone();
    g.scale(len, h, span);
    this.add(g, color, this.mat(x, y, z, { ry }));
  }

  /** Thin flat disc facing along local x ('x') or z ('z'). */
  disc(x: number, y: number, z: number, r: number, color: number, axis: 'x' | 'z', thick = 0.3): void {
    const o: PartOpts = axis === 'x' ? { rz: Math.PI / 2 } : { rx: Math.PI / 2 };
    this.add(new THREE.CylinderGeometry(r, r, thick, 16, 1), color, this.mat(x, y, z, o));
  }

  /** Square beam between two points. */
  beam(x1: number, y1: number, z1: number, x2: number, y2: number, z2: number, thick: number, color: number): void {
    const a = new THREE.Vector3(x1, y1, z1);
    const d = new THREE.Vector3(x2, y2, z2).sub(a);
    const len = d.length();
    const q = new THREE.Quaternion().setFromUnitVectors(UP, d.clone().normalize());
    const m = new THREE.Matrix4().compose(a.addScaledVector(d, 0.5), q, new THREE.Vector3(1, 1, 1));
    this.add(new THREE.BoxGeometry(thick, len, thick), color, m);
  }

  torus(x: number, y: number, z: number, R: number, tube: number, color: number, seg = 48): void {
    this.add(new THREE.TorusGeometry(R, tube, 6, seg), color, this.mat(x, y, z));
  }

  build(material: THREE.Material): THREE.Mesh {
    const P = new Float32Array(this.count * 3);
    const N = new Float32Array(this.count * 3);
    const C = new Float32Array(this.count * 3);
    let o = 0;
    for (let i = 0; i < this.pos.length; i++) {
      P.set(this.pos[i], o);
      N.set(this.nor[i], o);
      const [r, g, b] = this.col[i];
      for (let k = 0; k < this.pos[i].length; k += 3) {
        C[o + k] = r;
        C[o + k + 1] = g;
        C[o + k + 2] = b;
      }
      o += this.pos[i].length;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(P, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(N, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(C, 3));
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, material);
    mesh.matrixAutoUpdate = false;
    this.pos = [];
    this.nor = [];
    this.col = [];
    return mesh;
  }

  get vertexCount(): number {
    return this.count;
  }
}

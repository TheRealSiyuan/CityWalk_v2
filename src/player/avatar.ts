import * as THREE from 'three';
import { Builder } from '../world/builder';
import { toonMaterial } from '../render/materials';

export enum Anim {
  Idle = 0,
  Walk = 1,
  Run = 2,
  Air = 3,
  Swing = 4,
}

export const PLAYER_COLORS = [0xe8604c, 0x4c9be8, 0x59b86a, 0xf0b43c, 0xa26be0, 0xef7fb0, 0x3fbfb4, 0xf08a3c];

const mat = toonMaterial({ vertexColors: true });
const ropeMat = new THREE.MeshBasicMaterial({ color: 0xfff4d6 });
const ropeGeo = new THREE.CylinderGeometry(0.055, 0.055, 1, 5);
ropeGeo.translate(0, 0.5, 0);
const UP = new THREE.Vector3(0, 1, 0);
const tmp = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
const yawQ = new THREE.Quaternion();

function limb(color: number, w: number, len: number, tip: number): THREE.Mesh {
  const b = new Builder(null, null).at(0, 0);
  b.box(0, -len, 0, w, len, w, color);
  b.box(0, -len - 0.02, 0.03, w + 0.04, 0.16, w + 0.1, tip);
  const m = b.build(mat);
  m.matrixAutoUpdate = true;
  return m;
}

function makeTag(name: string, color: number): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const g = c.getContext('2d')!;
  g.font = '600 30px system-ui, sans-serif';
  const w = Math.min(244, g.measureText(name).width + 34);
  g.fillStyle = 'rgba(40,32,28,0.72)';
  g.beginPath();
  if (g.roundRect) g.roundRect((256 - w) / 2, 8, w, 48, 24);
  else g.rect((256 - w) / 2, 8, w, 48);
  g.fill();
  g.fillStyle = '#' + color.toString(16).padStart(6, '0');
  g.beginPath();
  g.arc((256 - w) / 2 + 18, 32, 7, 0, 7);
  g.fill();
  g.fillStyle = '#fff8ec';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(name, 128 + 8, 33, 200);
  const tex = new THREE.CanvasTexture(c);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  s.scale.set(3.2, 0.8, 1);
  s.position.y = 2.55;
  s.renderOrder = 5;
  return s;
}

/** A small procedural cel-shaded character plus its rope. */
export class Avatar {
  root = new THREE.Group();
  rope = new THREE.Mesh(ropeGeo, ropeMat);
  private body = new THREE.Group();
  private armL: THREE.Mesh;
  private armR: THREE.Mesh;
  private legL: THREE.Mesh;
  private legR: THREE.Mesh;
  private tag: THREE.Sprite | null = null;
  private phase = 0;
  private lean = new THREE.Quaternion();

  constructor(public color: number) {
    const SKIN = 0xf4c9a0;
    const DARK = 0x3c3a44;
    const b = new Builder(null, null).at(0, 0);
    b.cyl(0, 0.78, 0, 0.27, 0.33, 0.62, color, 8); // jacket
    b.cyl(0, 0.72, 0, 0.34, 0.34, 0.1, DARK, 8); // belt
    b.sphere(0, 1.6, 0, 0.27, SKIN, 1, 10); // head
    b.sphere(0, 1.7, -0.03, 0.285, DARK, 0.75, 10); // hair
    b.box(0, 1.36, 0.02, 0.5, 0.11, 0.5, 0xfff1d0); // scarf
    b.box(0.12, 1.1, -0.34, 0.12, 0.5, 0.1, 0xfff1d0); // scarf tail
    b.box(0, 0.86, -0.3, 0.36, 0.44, 0.16, DARK); // backpack
    b.box(-0.1, 1.6, 0.25, 0.06, 0.07, 0.03, DARK); // eyes
    b.box(0.1, 1.6, 0.25, 0.06, 0.07, 0.03, DARK);
    const torso = b.build(mat);
    this.armL = limb(color, 0.14, 0.52, SKIN);
    this.armR = limb(color, 0.14, 0.52, SKIN);
    this.legL = limb(DARK, 0.17, 0.72, 0xfff1d0);
    this.legR = limb(DARK, 0.17, 0.72, 0xfff1d0);
    this.armL.position.set(-0.38, 1.34, 0);
    this.armR.position.set(0.38, 1.34, 0);
    this.legL.position.set(-0.15, 0.78, 0);
    this.legR.position.set(0.15, 0.78, 0);
    this.body.add(torso, this.armL, this.armR, this.legL, this.legR);
    this.root.add(this.body);
    this.rope.visible = false;
    this.rope.frustumCulled = false;
  }

  setName(name: string): void {
    if (this.tag) {
      this.root.remove(this.tag);
      this.tag.material.map?.dispose();
      this.tag.material.dispose();
    }
    this.tag = makeTag(name, this.color);
    this.root.add(this.tag);
  }

  /**
   * Pose the avatar. `speed` is horizontal speed; `anchor` is the rope's
   * attachment point (or null).
   */
  update(dt: number, x: number, y: number, z: number, yaw: number, anim: Anim, speed: number, anchor: { x: number; y: number; z: number } | null): void {
    this.root.position.set(x, y, z);
    yawQ.setFromAxisAngle(UP, yaw);
    // Lean along the rope while swinging, into the run otherwise.
    if (anim === Anim.Swing && anchor) {
      tmp.set(anchor.x - x, anchor.y - (y + 1.3), anchor.z - z).normalize();
      tmp.lerp(UP, 0.35).normalize();
      tmpQ.setFromUnitVectors(UP, tmp);
    } else {
      tmpQ.identity();
    }
    this.lean.slerp(tmpQ, 1 - Math.exp(-10 * dt));
    this.body.quaternion.copy(this.lean).multiply(yawQ);

    const k = 1 - Math.exp(-14 * dt);
    let aL = 0, aR = 0, lL = 0, lR = 0, tilt = 0, bob = 0;
    if (anim === Anim.Walk || anim === Anim.Run) {
      this.phase += dt * (anim === Anim.Run ? 11.5 : 5 + speed * 0.9);
      const amp = anim === Anim.Run ? 1.05 : 0.55;
      const s = Math.sin(this.phase);
      lL = s * amp;
      lR = -s * amp;
      aL = -s * amp * 0.9;
      aR = s * amp * 0.9;
      tilt = anim === Anim.Run ? 0.2 : 0.05;
      bob = Math.abs(Math.cos(this.phase)) * (anim === Anim.Run ? 0.09 : 0.04);
    } else if (anim === Anim.Air) {
      aL = aR = -2.5;
      lL = 0.5;
      lR = -0.35;
    } else if (anim === Anim.Swing) {
      aL = aR = -3.0;
      lL = -0.5;
      lR = -0.75;
    } else {
      this.phase += dt * 2;
      bob = Math.sin(this.phase) * 0.012;
      aL = 0.04;
      aR = -0.04;
    }
    this.armL.rotation.x += (aL - this.armL.rotation.x) * k;
    this.armR.rotation.x += (aR - this.armR.rotation.x) * k;
    this.legL.rotation.x += (lL - this.legL.rotation.x) * k;
    this.legR.rotation.x += (lR - this.legR.rotation.x) * k;
    this.armL.rotation.z = -0.12;
    this.armR.rotation.z = 0.12;
    this.body.position.y = bob;
    if (tilt) {
      tmpQ.setFromAxisAngle(tmp.set(1, 0, 0), tilt);
      this.body.quaternion.multiply(tmpQ);
    }

    if (anchor) {
      const hx = x, hy = y + 1.75, hz = z;
      tmp.set(anchor.x - hx, anchor.y - hy, anchor.z - hz);
      const len = tmp.length();
      this.rope.visible = true;
      this.rope.position.set(hx, hy, hz);
      this.rope.scale.set(1, len, 1);
      this.rope.quaternion.setFromUnitVectors(UP, tmp.divideScalar(len || 1));
    } else {
      this.rope.visible = false;
    }
  }

  dispose(): void {
    this.root.removeFromParent();
    this.rope.removeFromParent();
    this.tag?.material.map?.dispose();
    this.tag?.material.dispose();
  }
}

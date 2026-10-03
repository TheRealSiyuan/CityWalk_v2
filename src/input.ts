import { CONFIG } from './config';

/**
 * Touch-first input: floating joystick on the left, look-drag on the right,
 * Jump and Swing buttons. Desktop falls back to WASD + mouse + Space + click.
 */
export class Input {
  mx = 0;
  my = 0;
  swing = false;
  /** accumulated look deltas, consumed by the camera each frame */
  lookX = 0;
  lookY = 0;
  lastLook = -10;
  /** total look-drag in pixels (for the tutorial) */
  lookTotal = 0;
  onFirstGesture: (() => void) | null = null;

  private jumpQueued = false;
  private keys = new Set<string>();
  private joyId = -1;
  private joyX = 0;
  private joyY = 0;
  private lookId = -1;
  private lastX = 0;
  private lastY = 0;
  private touchSwing = false;
  private mouseSwing = false;
  private keySwing = false;
  private stickX = 0;
  private stickY = 0;
  private gestured = false;

  private base = document.getElementById('joy-base')!;
  private knob = document.getElementById('joy-knob')!;

  constructor(private surface: HTMLElement) {
    const jump = document.getElementById('btn-jump')!;
    const swing = document.getElementById('btn-swing')!;
    surface.addEventListener('pointerdown', this.down);
    surface.addEventListener('pointermove', this.move);
    surface.addEventListener('pointerup', this.up);
    surface.addEventListener('pointercancel', this.up);
    surface.addEventListener('contextmenu', (e) => e.preventDefault());

    jump.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.gesture();
      this.jumpQueued = true;
      jump.classList.add('on');
    });
    const jumpOff = () => jump.classList.remove('on');
    jump.addEventListener('pointerup', jumpOff);
    jump.addEventListener('pointercancel', jumpOff);
    jump.addEventListener('pointerleave', jumpOff);

    swing.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.gesture();
      swing.setPointerCapture(e.pointerId);
      this.touchSwing = true;
      swing.classList.add('on');
    });
    const swingOff = () => {
      this.touchSwing = false;
      swing.classList.remove('on');
    };
    swing.addEventListener('pointerup', swingOff);
    swing.addEventListener('pointercancel', swingOff);
    swing.addEventListener('lostpointercapture', swingOff);

    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.repeat) return;
      this.gesture();
      this.keys.add(e.code);
      if (e.code === 'Space') {
        this.jumpQueued = true;
        e.preventDefault();
      }
      if (e.code === 'KeyE') this.keySwing = true;
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      if (e.code === 'KeyE') this.keySwing = false;
    });
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.keySwing = this.mouseSwing = this.touchSwing = false;
      this.endJoy();
    });
    document.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement === surface) this.look(e.movementX, e.movementY);
    });
  }

  private gesture(): void {
    if (this.gestured) return;
    this.gestured = true;
    this.onFirstGesture?.();
  }

  private look(dx: number, dy: number): void {
    this.lookX += dx;
    this.lookY += dy;
    this.lastLook = performance.now() / 1000;
    this.lookTotal += Math.abs(dx) + Math.abs(dy);
  }

  private down = (e: PointerEvent): void => {
    this.gesture();
    if (e.pointerType === 'mouse') {
      if (e.button === 0) this.mouseSwing = true;
      if (document.pointerLockElement !== this.surface) {
        // Pointer lock gives proper mouse-look; without it, dragging still works.
        try {
          const r = this.surface.requestPointerLock() as unknown;
          if (r instanceof Promise) r.catch(() => {});
        } catch {
          /* unsupported: fall back to drag-look */
        }
        this.lookId = e.pointerId;
        this.lastX = e.clientX;
        this.lastY = e.clientY;
      }
      return;
    }
    e.preventDefault();
    if (e.clientX < window.innerWidth * 0.5 && this.joyId < 0) {
      this.joyId = e.pointerId;
      this.joyX = e.clientX;
      this.joyY = e.clientY;
      this.base.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
      this.knob.style.transform = 'translate(0px, 0px)';
      this.base.classList.add('on');
      this.surface.setPointerCapture(e.pointerId);
    } else if (this.lookId < 0) {
      this.lookId = e.pointerId;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      this.surface.setPointerCapture(e.pointerId);
    }
  };

  private move = (e: PointerEvent): void => {
    if (e.pointerId === this.joyId) {
      const R = 58;
      let dx = (e.clientX - this.joyX) / R;
      let dy = (e.clientY - this.joyY) / R;
      const l = Math.hypot(dx, dy);
      if (l > 1) {
        dx /= l;
        dy /= l;
      }
      this.stickX = dx;
      this.stickY = -dy;
      this.knob.style.transform = `translate(${dx * R}px, ${dy * R}px)`;
      this.base.classList.toggle('run', Math.min(1, l) >= CONFIG.runThreshold);
    } else if (e.pointerId === this.lookId) {
      if (e.pointerType === 'mouse' && document.pointerLockElement === this.surface) return;
      this.look(e.clientX - this.lastX, e.clientY - this.lastY);
      this.lastX = e.clientX;
      this.lastY = e.clientY;
    }
  };

  private endJoy(): void {
    this.joyId = -1;
    this.stickX = this.stickY = 0;
    this.base.classList.remove('on', 'run');
  }

  private up = (e: PointerEvent): void => {
    if (e.pointerType === 'mouse') {
      if (e.button === 0) this.mouseSwing = false;
      if (e.pointerId === this.lookId) this.lookId = -1;
      return;
    }
    if (e.pointerId === this.joyId) this.endJoy();
    if (e.pointerId === this.lookId) this.lookId = -1;
  };

  /** Call once per frame before reading mx/my/swing. */
  poll(): void {
    const k = this.keys;
    let x = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    let y = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    if (x || y) {
      const l = Math.hypot(x, y);
      const walk = k.has('ShiftLeft') || k.has('ShiftRight') ? 0.5 : 1;
      x = (x / l) * walk;
      y = (y / l) * walk;
    } else {
      x = this.stickX;
      y = this.stickY;
    }
    this.mx = x;
    this.my = y;
    this.swing = this.touchSwing || this.mouseSwing || this.keySwing;
  }

  consumeJump(): boolean {
    const j = this.jumpQueued;
    this.jumpQueued = false;
    return j;
  }
}

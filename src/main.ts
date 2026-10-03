import * as THREE from 'three';
import { CONFIG } from './config';
import { Input } from './input';
import { Net, makeRoomCode, sample, sanitizeRoom, type Peer, type Snap } from './net';
import { Avatar, Anim, PLAYER_COLORS } from './player/avatar';
import { Player } from './player/controller';
import { Sfx } from './audio';
import { UI, store } from './ui';
import { buildWorld } from './world/city';
import { LANDMARKS, SPAWN, type Landmark } from './world/data';
import { WATER_Y, groundHeight } from './world/river';

// We author colours as final display values, so skip three's colour management.
THREE.ColorManagement.enabled = false;

const canvas = document.getElementById('game') as HTMLCanvasElement;
const params = new URLSearchParams(location.search);

// --- room: every visit lands in a room, and the URL always carries it ---------
const room = sanitizeRoom(params.get('room')) ?? makeRoomCode();
if (params.get('room') !== room) {
  params.set('room', room);
  try {
    history.replaceState(null, '', `${location.pathname}?${params.toString()}${location.hash}`);
  } catch {
    /* sandboxed frame: the Share button still carries the room */
  }
}
const shareUrl = (): string => `${location.origin}${location.pathname}?room=${room}`;

// --- renderer -------------------------------------------------------------------
const dpr = window.devicePixelRatio || 1;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: dpr < 2, powerPreference: 'high-performance', stencil: false });
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
let pixelRatio = Math.min(dpr, CONFIG.perf.maxPixelRatio);
renderer.setPixelRatio(pixelRatio);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(CONFIG.camera.baseFov, 1, 0.3, 2600);

function baseFov(): number {
  // Portrait phones need a taller vertical FOV to keep a usable horizontal view.
  const aspect = camera.aspect;
  if (aspect >= 1.2) return CONFIG.camera.baseFov;
  const h = THREE.MathUtils.degToRad(aspect < 1 ? 56 : 70);
  return Math.min(92, THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(h / 2) / aspect)));
}
function resize(): void {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.fov = baseFov();
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', resize);

// --- world, player, systems -------------------------------------------------------
const world = buildWorld();
scene.add(world.group);

const sfx = new Sfx();
const ui = new UI(shareUrl);
const input = new Input(document.getElementById('touch')!);
input.onFirstGesture = () => sfx.start();
for (const ev of ['pointerup', 'touchend', 'click', 'keyup']) document.addEventListener(ev, () => sfx.resume(), { passive: true });
ui.onMute = (m) => (sfx.muted = m);

const tut = { moved: 0, looked: 0, jumped: 0, swung: 0 };
const jitter = () => (Math.random() - 0.5) * 3;
const spawn = { x: SPAWN.x + jitter(), y: 0, z: SPAWN.z + jitter() };
spawn.y = groundHeight(spawn.x, spawn.z);
const player = new Player(world, spawn, {
  onSplash: () => {
    sfx.splash();
    ui.toast('Splash! Back on the bank.');
  },
  onAttach: () => {
    sfx.attach();
    tut.swung++;
  },
  onRelease: () => sfx.release(),
  onJump: () => {
    sfx.jump();
    tut.jumped++;
  },
  onLand: () => sfx.land(),
});
player.yaw = SPAWN.yaw + Math.PI;

const ADJ = ['Brisk', 'Foggy', 'Jolly', 'Swift', 'Sunny', 'Lucky', 'Plucky', 'Dapper'];
const NOUN = ['Fox', 'Pigeon', 'Raven', 'Corgi', 'Swan', 'Badger', 'Robin', 'Otter'];
const pick = <T>(a: T[]): T => a[Math.floor(Math.random() * a.length)];
const cleanName = (s: string): string => s.replace(/[^\p{L}\p{N} _-]/gu, '').trim().slice(0, 14);
let myName = cleanName(store.get('citywalk.name') ?? '') || `${pick(ADJ)} ${pick(NOUN)}`;
ui.setNameField(myName);

const colorFor = (id: string): number => {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return PLAYER_COLORS[h % PLAYER_COLORS.length];
};

// --- multiplayer --------------------------------------------------------------------
interface Remote {
  peer: Peer;
  avatar: Avatar;
  snap: Snap;
  seen: boolean;
}
const remotes = new Map<string, Remote>();
const net = new Net({
  onJoin(peer) {
    const avatar = new Avatar(colorFor(peer.id));
    avatar.setName(peer.name);
    avatar.root.visible = false;
    scene.add(avatar.root, avatar.rope);
    remotes.set(peer.id, {
      peer,
      avatar,
      snap: { t: 0, x: 0, y: 0, z: 0, yaw: 0, anim: 0, speed: 0, roped: false, ax: 0, ay: 0, az: 0 },
      seen: false,
    });
    ui.setPlayers(remotes.size + 1);
    ui.toast('A friend joined your walk');
  },
  onLeave(id) {
    const r = remotes.get(id);
    if (!r) return;
    r.avatar.dispose();
    remotes.delete(id);
    ui.setPlayers(remotes.size + 1);
  },
  onName(peer) {
    remotes.get(peer.id)?.avatar.setName(peer.name);
  },
});
const avatar = new Avatar(colorFor(net.id));
scene.add(avatar.root, avatar.rope);
ui.onName = (name) => {
  const n = cleanName(name);
  if (!n || n === myName) return;
  myName = n;
  store.set('citywalk.name', n);
  net.setName(n);
};
// `?relay=wss://…` swaps the public signalling relays for your own (also used by the tests).
const relayParam = params.get('relay');
const relays = relayParam && /^wss?:\/\//.test(relayParam) ? [relayParam] : null;
// Solo: `?solo=1`, or a build made with VITE_SOLO=1 for hosts that block WebRTC.
const SOLO = params.get('solo') === '1' || import.meta.env.VITE_SOLO === '1';
if (SOLO) document.body.classList.add('solo');
else net.start(room, myName, relays);
window.addEventListener('pagehide', () => net.leave());

// --- camera rig --------------------------------------------------------------------
let camYaw = SPAWN.yaw;
let camPitch = 0.2;
let camDist = CONFIG.camera.distance;
const camTarget = new THREE.Vector3(player.pos.x, player.pos.y + CONFIG.camera.height, player.pos.z);
const camDir = new THREE.Vector3();

/** Dev/test override: a fixed camera, set through window.__citywalk.view(). */
let fixedView: { pos: THREE.Vector3; target: THREE.Vector3 } | null = null;

function updateCamera(dt: number, now: number): void {
  const C = CONFIG.camera;
  if (fixedView) {
    input.lookX = input.lookY = 0;
    camera.position.copy(fixedView.pos);
    camera.lookAt(fixedView.target);
    return;
  }
  camYaw -= input.lookX * C.lookSensitivity;
  camPitch += input.lookY * C.lookSensitivity;
  input.lookX = input.lookY = 0;
  camPitch = Math.min(C.maxPitch, Math.max(C.minPitch, camPitch));

  // One-thumb play: when you are not steering the camera it trails your travel.
  const sp = player.speed;
  if (now - input.lastLook > C.autoFollowDelay && sp > 2.5) {
    const want = Math.atan2(-player.vel.x, -player.vel.z);
    const d = Math.atan2(Math.sin(want - camYaw), Math.cos(want - camYaw));
    const away = Math.abs(d) < 2.3 ? 1 : 0.12; // do not whip round when running at the camera
    camYaw += d * Math.min(1, C.autoFollowRate * (player.rope ? 1.6 : 1) * away * dt);
  }

  const p = rp;
  const kxz = 1 - Math.exp(-16 * dt);
  const ky = 1 - Math.exp(-9 * dt);
  camTarget.x += (p.x - camTarget.x) * kxz;
  camTarget.z += (p.z - camTarget.z) * kxz;
  camTarget.y += (p.y + C.height - camTarget.y) * ky;

  const total = Math.hypot(player.vel.x, player.vel.y, player.vel.z);
  const wantDist = player.rope || total > 16 ? C.swingDistance : C.distance;
  const cp = Math.cos(camPitch);
  camDir.set(Math.sin(camYaw) * cp, Math.sin(camPitch), Math.cos(camYaw) * cp);
  // Pull the camera in front of anything that would hide the player.
  let clear = wantDist;
  const STEPS = 10;
  for (let i = 1; i <= STEPS; i++) {
    const t = (wantDist * i) / STEPS;
    const x = camTarget.x + camDir.x * t;
    const y = camTarget.y + camDir.y * t;
    const z = camTarget.z + camDir.z * t;
    if (world.colliders.blocked(x, y, z) || y < groundHeight(x, z) + 0.3) {
      clear = Math.max(1.4, t - wantDist / STEPS);
      break;
    }
  }
  camDist = clear < camDist ? clear : camDist + (clear - camDist) * (1 - Math.exp(-4 * dt));
  camera.position.copy(camTarget).addScaledVector(camDir, camDist);
  camera.position.y = Math.max(camera.position.y, WATER_Y + 0.6);
  camera.lookAt(camTarget);

  const fov = baseFov() + Math.min(1, total / 36) * C.speedFov;
  if (Math.abs(fov - camera.fov) > 0.05) {
    camera.fov += (fov - camera.fov) * (1 - Math.exp(-5 * dt));
    camera.updateProjectionMatrix();
  }
}

// --- landmarks / compass -------------------------------------------------------------
let compassTimer = 0;
const proj = new THREE.Vector3();
function updateLandmarks(dt: number): void {
  const p = player.pos;
  let nearest: Landmark | null = null;
  let nd = Infinity;
  for (const l of LANDMARKS) {
    const d = Math.hypot(p.x - l.x, p.z - l.z);
    if (d < l.r && ui.discover(l)) sfx.discover();
    if (!ui.found.has(l.id) && d < nd) {
      nd = d;
      nearest = l;
    }
  }
  compassTimer -= dt;
  if (compassTimer <= 0) {
    compassTimer = 0.1;
    if (nearest && !ui.tutorialActive) {
      // bearing relative to where the camera looks
      const bearing = Math.atan2(nearest.x - p.x, -(nearest.z - p.z));
      const facing = Math.atan2(-Math.sin(camYaw), Math.cos(camYaw));
      ui.setCompass(nearest, bearing - facing, nd);
    } else ui.setCompass(null, 0, 0);
  }
}

function updateReticle(): void {
  const a = player.aim;
  if (!a || player.rope) return ui.setReticle(0, 0, false);
  proj.set(a.x, a.y, a.z).project(camera);
  if (proj.z > 1 || Math.abs(proj.x) > 1 || Math.abs(proj.y) > 1) return ui.setReticle(0, 0, false);
  ui.setReticle((proj.x * 0.5 + 0.5) * window.innerWidth, (-proj.y * 0.5 + 0.5) * window.innerHeight, true);
}

// --- main loop ------------------------------------------------------------------------
const STEP = 1 / 60;
let acc = 0;
let last = performance.now();
let sendTimer = 0;
let frames = 0;
let fpsTime = 0;
let fps = 60;
let stableGood = 0;
let jumpLatch = false;
const move = { mx: 0, my: 0, jump: false, swing: false, camYaw: 0 };
const prev = { ...player.pos };
/** interpolated render position */
const rp = { ...player.pos };

function frame(nowMs: number): void {
  requestAnimationFrame(frame);
  const now = nowMs / 1000;
  const dt = Math.min(0.1, Math.max(0, (nowMs - last) / 1000));
  last = nowMs;

  input.poll();
  if (ui.panelOpen) {
    input.mx = input.my = 0;
    input.swing = false;
  }
  if (input.consumeJump()) jumpLatch = true;
  move.mx = input.mx;
  move.my = input.my;
  move.swing = input.swing;
  move.camYaw = camYaw;

  acc += dt;
  let steps = 0;
  const px = player.pos.x;
  const pz = player.pos.z;
  while (acc >= STEP && steps < 5) {
    move.jump = jumpLatch;
    jumpLatch = false;
    prev.x = player.pos.x;
    prev.y = player.pos.y;
    prev.z = player.pos.z;
    player.step(STEP, move);
    acc -= STEP;
    steps++;
  }
  if (acc > STEP) acc = 0;
  // Render between the last two physics steps so motion is smooth at any refresh rate.
  const alpha = acc / STEP;
  const jump2 = (player.pos.x - prev.x) ** 2 + (player.pos.y - prev.y) ** 2 + (player.pos.z - prev.z) ** 2;
  if (jump2 > 9) {
    prev.x = player.pos.x; // teleported (respawn): do not smear across the map
    prev.y = player.pos.y;
    prev.z = player.pos.z;
  }
  rp.x = prev.x + (player.pos.x - prev.x) * alpha;
  rp.y = prev.y + (player.pos.y - prev.y) * alpha;
  rp.z = prev.z + (player.pos.z - prev.z) * alpha;
  if (player.grounded) tut.moved += Math.hypot(player.pos.x - px, player.pos.z - pz);
  tut.looked = input.lookTotal;

  avatar.update(dt, rp.x, rp.y, rp.z, player.yaw, player.anim, player.speed, player.rope ? player.rope.anchor : null);
  updateCamera(dt, now);
  updateLandmarks(dt);
  updateReticle();
  ui.updateTutorial(dt, tut);
  sfx.setWind(Math.hypot(player.vel.x, player.vel.y, player.vel.z));

  // remote players, rendered slightly in the past and interpolated
  const rt = now - CONFIG.net.interpDelay;
  for (const r of remotes.values()) {
    if (!sample(r.peer.snaps, rt, r.snap)) continue;
    const s = r.snap;
    if (!r.seen) {
      r.seen = true;
      r.avatar.root.visible = true;
    }
    r.avatar.update(dt, s.x, s.y, s.z, s.yaw, s.anim as Anim, s.speed, s.roped ? { x: s.ax, y: s.ay, z: s.az } : null);
  }
  sendTimer -= dt;
  if (sendTimer <= 0) {
    sendTimer += 1 / CONFIG.net.sendHz;
    if (sendTimer < 0) sendTimer = 0;
    net.send(player.pos.x, player.pos.y, player.pos.z, player.yaw, player.anim, player.speed, player.rope ? player.rope.anchor : null);
  }

  world.update(now, camera);
  renderer.render(scene, camera);

  // dynamic resolution: trade pixels for frame rate on slower phones
  frames++;
  fpsTime += dt;
  if (fpsTime >= 1.5) {
    fps = frames / fpsTime;
    frames = 0;
    fpsTime = 0;
    const P = CONFIG.perf;
    if (fps < 45 && pixelRatio > P.minPixelRatio) {
      pixelRatio = Math.max(P.minPixelRatio, pixelRatio - 0.2);
      renderer.setPixelRatio(pixelRatio);
      stableGood = 0;
    } else if (fps > 57 && pixelRatio < Math.min(dpr, P.maxPixelRatio) && ++stableGood >= 4) {
      pixelRatio = Math.min(dpr, P.maxPixelRatio, pixelRatio + 0.1);
      renderer.setPixelRatio(pixelRatio);
      stableGood = 0;
    }
  }
}

resize();
renderer.compile(scene, camera);
requestAnimationFrame((t) => {
  last = t;
  frame(t);
  document.getElementById('loading')!.classList.add('gone');
  ui.startTutorial();
  debug.ready = true;
});

// Read-only state for the automated tests and for poking around in dev tools.
const debug = {
  ready: false,
  room,
  config: CONFIG,
  get player() {
    return { x: player.pos.x, y: player.pos.y, z: player.pos.z, anim: player.anim, roped: !!player.rope, grounded: player.grounded, swings: player.swings };
  },
  get peers() {
    return [...remotes.values()].map((r) => ({ id: r.peer.id, name: r.peer.name, seen: r.seen, x: r.snap.x, y: r.snap.y, z: r.snap.z }));
  },
  get found() {
    return [...ui.found];
  },
  get fps() {
    return fps;
  },
  get pixelRatio() {
    return pixelRatio;
  },
  stats: world.stats,
  /** dev tools: move the player / pin the camera (pass nothing to unpin) */
  teleport: (x: number, y: number, z: number) => player.teleport(x, y, z),
  view: (pos?: [number, number, number], target?: [number, number, number]) => {
    fixedView = pos && target ? { pos: new THREE.Vector3(...pos), target: new THREE.Vector3(...target) } : null;
  },
  draws: () => renderer.info.render,
};
(window as unknown as { __citywalk: typeof debug }).__citywalk = debug;

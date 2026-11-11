import { joinRoom, selfId, type Room } from 'trystero';
import { CONFIG } from './config';

/** One network snapshot of a remote player. */
export interface Snap {
  t: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  anim: number;
  speed: number;
  roped: boolean;
  ax: number;
  ay: number;
  az: number;
}

export interface Peer {
  id: string;
  name: string;
  snaps: Snap[];
}

export interface NetHandlers {
  onJoin(peer: Peer): void;
  onLeave(id: string): void;
  onName(peer: Peer): void;
}

/**
 * When the other end closes a connection without saying goodbye first (its tab
 * crashed, or it reset a stuck handshake), Chrome reports the closed channel as
 * an error ("User-Initiated Abort, reason=Close called") and the networking
 * library logs it with console.error before treating it as a normal disconnect.
 * Nothing is wrong on this side, so that one message is logged as debug instead:
 * a clean console for players and portal QA, and every other error still shows.
 */
export function isRemoteCloseLog(args: readonly unknown[]): boolean {
  return (
    args.length >= 2 &&
    typeof args[0] === 'string' &&
    /\bpeer error\b/i.test(args[0]) &&
    /User-Initiated Abort/.test(String(args[1]))
  );
}

let remoteCloses = 0;
let wrapper: ((...args: unknown[]) => void) | null = null;
/** How many remote closes were logged as debug instead of an error (for tests). */
export const remoteCloseCount = () => remoteCloses;

function quietRemoteCloses(): void {
  if (console.error === wrapper) return;
  const error = console.error.bind(console);
  wrapper = (...args: unknown[]) => {
    if (isRemoteCloseLog(args)) {
      remoteCloses++;
      console.debug('CityWalk: a friend closed the connection; it will reconnect if they are still here.', ...args);
      return;
    }
    error(...args);
  };
  console.error = wrapper;
}

const ROOM_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

export function makeRoomCode(): string {
  const r = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(r, (b) => ROOM_ALPHABET[b % ROOM_ALPHABET.length]).join('');
}

export function sanitizeRoom(s: string | null): string | null {
  if (!s) return null;
  const clean = s.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 24);
  return clean.length >= 3 ? clean : null;
}

/**
 * Serverless multiplayer: Trystero finds peers through public Nostr relays
 * and then talks to them directly over WebRTC data channels. Every failure
 * path leaves the game running solo.
 */
export class Net {
  readonly id = selfId;
  peers = new Map<string, Peer>();
  status: 'off' | 'connecting' | 'online' = 'off';
  private room: Room | null = null;
  private sendState: ((d: Float32Array) => void) | null = null;
  private sendHello: ((d: { name: string }, target?: string) => void) | null = null;
  private buf = new Float32Array(10);
  private name = '';

  constructor(private handlers: NetHandlers) {}

  private roomCode = '';
  private relays: string[] | null = null;
  private joinedAt = 0;
  private retry = 0;
  /** Bumped on every (re-)join, so a room being left can no longer add peers. */
  private generation = 0;
  /** Peers we have not yet heard a word from, with when they joined (seconds). */
  private unconfirmed = new Map<string, number>();
  /** Set when a stuck peer was just dropped and we are alone: re-join at once instead of waiting. */
  private rejoinNow = false;

  start(roomCode: string, name: string, relays: string[] | null): void {
    quietRemoteCloses();
    this.name = name;
    this.roomCode = roomCode;
    this.relays = relays;
    this.join();
    // Trystero announces a few times on joining and then only once a minute.
    // If that first handshake is missed, a friend who has just opened the link
    // would stare at an empty street for a minute, so while we are alone we
    // re-join (and so re-announce) every so often, backing off over time.
    window.setInterval(() => {
      this.dropSilentPeers();
      if (this.status === 'off' || this.peers.size > 0 || document.hidden) return;
      const wait = this.rejoinNow ? 0 : Math.min(60, 18 + this.retry * 6);
      if (performance.now() / 1000 - this.joinedAt < wait) return;
      if (this.rejoinNow) this.rejoinNow = false;
      else this.retry++;
      this.generation++;
      const old = this.room;
      this.room = null;
      const again = () => this.join();
      if (old) old.leave().then(again, again);
      else again();
    }, 2000);
  }

  /**
   * A peer can arrive during a re-join: it finishes connecting to the room being
   * left, the library's second handshake then never completes on one side, and
   * the other side believes it is connected for good (both show an empty street).
   * Every real peer says hello as soon as it joins, even from a background tab, so
   * a peer that stays silent gets its connection closed. That resets both ends,
   * and whoever is left alone then re-joins straight away (the friend is known to
   * be trying to connect, so there is no point waiting out the usual back-off).
   */
  private dropSilentPeers(): void {
    const now = performance.now() / 1000;
    for (const [id, joined] of this.unconfirmed) {
      if (now - joined < CONFIG.net.helloTimeout) continue;
      this.unconfirmed.delete(id);
      try {
        this.room?.getPeers()[id]?.close();
      } catch {
        // Already gone: nothing to close.
      }
      if (this.peers.delete(id)) this.handlers.onLeave(id);
      if (this.peers.size === 0) this.rejoinNow = true;
    }
  }

  private join(): void {
    const generation = ++this.generation;
    this.rejoinNow = false;
    const roomCode = this.roomCode;
    const relays = this.relays;
    this.joinedAt = performance.now() / 1000;
    try {
      this.status = 'connecting';
      const room = joinRoom(
        {
          appId: 'citywalk-london-v1',
          relayConfig: relays ? { urls: relays, warnOnRelayFailure: false } : { redundancy: 6, warnOnRelayFailure: false },
        },
        roomCode,
        { onJoinError: () => {} },
      );
      this.room = room;
      const state = room.makeAction<Float32Array>('st');
      const hello = room.makeAction<{ name: string }>('hi');
      this.sendState = (d) => {
        if (this.peers.size) state.send(d).catch(() => {});
      };
      this.sendHello = (d, target) => {
        hello.send(d, target ? { target } : undefined).catch(() => {});
      };

      room.onPeerJoin = (id) => {
        if (generation !== this.generation) return;
        // Rooms are capped: extra peers are simply not shown or synced.
        if (this.peers.size >= CONFIG.net.maxPlayers - 1) return;
        const peer: Peer = { id, name: 'Walker', snaps: [] };
        this.peers.set(id, peer);
        this.unconfirmed.set(id, performance.now() / 1000);
        this.status = 'online';
        this.retry = 0;
        this.handlers.onJoin(peer);
        this.sendHello?.({ name: this.name }, id);
      };
      room.onPeerLeave = (id) => {
        if (generation !== this.generation) return;
        this.unconfirmed.delete(id);
        if (this.peers.delete(id)) this.handlers.onLeave(id);
      };
      hello.onMessage = (d, ctx) => {
        if (generation !== this.generation) return;
        this.unconfirmed.delete(ctx.peerId);
        const peer = this.peers.get(ctx.peerId);
        if (!peer || !d || typeof d.name !== 'string') return;
        peer.name = d.name.replace(/[^\p{L}\p{N} _-]/gu, '').slice(0, 14) || 'Walker';
        this.handlers.onName(peer);
      };
      state.onMessage = (raw, ctx) => {
        if (generation !== this.generation) return;
        this.unconfirmed.delete(ctx.peerId);
        const peer = this.peers.get(ctx.peerId);
        if (!peer) return;
        // Binary payloads arrive as a view over bytes; re-wrap as floats.
        const src = raw as unknown as ArrayBufferView | ArrayBuffer;
        const bytes = src instanceof ArrayBuffer ? new Uint8Array(src) : new Uint8Array(src.buffer, src.byteOffset, src.byteLength);
        if (bytes.byteLength < 40) return;
        const f = new Float32Array(bytes.slice(0, 40).buffer);
        for (let i = 0; i < 10; i++) if (!Number.isFinite(f[i])) return;
        peer.snaps.push({
          t: performance.now() / 1000,
          x: f[0], y: f[1], z: f[2], yaw: f[3],
          anim: f[4] | 0, speed: f[5], roped: f[6] > 0.5,
          ax: f[7], ay: f[8], az: f[9],
        });
        if (peer.snaps.length > 24) peer.snaps.splice(0, peer.snaps.length - 24);
      };
    } catch {
      this.status = 'off';
      this.room = null;
    }
  }

  setName(name: string): void {
    this.name = name;
    if (this.peers.size) this.sendHello?.({ name });
  }

  send(x: number, y: number, z: number, yaw: number, anim: number, speed: number, anchor: { x: number; y: number; z: number } | null): void {
    if (!this.sendState || !this.peers.size) return;
    const b = this.buf;
    b[0] = x; b[1] = y; b[2] = z; b[3] = yaw; b[4] = anim; b[5] = speed;
    b[6] = anchor ? 1 : 0;
    b[7] = anchor ? anchor.x : 0;
    b[8] = anchor ? anchor.y : 0;
    b[9] = anchor ? anchor.z : 0;
    this.sendState(b);
  }

  /** Test hook: close every peer connection abruptly, as a crashed tab or a stuck-handshake reset would. */
  dropPeersAbruptly(): void {
    for (const p of Object.values(this.room?.getPeers() ?? {})) {
      try {
        p.close();
      } catch {
        // Already gone.
      }
    }
  }

  leave(): void {
    this.room?.leave().catch(() => {});
    this.room = null;
  }
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Sample a peer's snapshot buffer at `time` (already delayed). */
export function sample(snaps: Snap[], time: number, out: Snap): boolean {
  const n = snaps.length;
  if (!n) return false;
  let a = snaps[0];
  let b = snaps[n - 1];
  if (time <= a.t) b = a;
  else if (time >= b.t) a = b;
  else {
    for (let i = n - 2; i >= 0; i--) {
      if (snaps[i].t <= time) {
        a = snaps[i];
        b = snaps[i + 1];
        break;
      }
    }
  }
  const span = b.t - a.t;
  const t = span > 1e-4 ? Math.min(1, Math.max(0, (time - a.t) / span)) : 0;
  out.t = time;
  out.x = lerp(a.x, b.x, t);
  out.y = lerp(a.y, b.y, t);
  out.z = lerp(a.z, b.z, t);
  const dy = Math.atan2(Math.sin(b.yaw - a.yaw), Math.cos(b.yaw - a.yaw));
  out.yaw = a.yaw + dy * t;
  out.anim = a.anim;
  out.speed = lerp(a.speed, b.speed, t);
  out.roped = a.roped;
  out.ax = a.ax;
  out.ay = a.ay;
  out.az = a.az;
  return true;
}

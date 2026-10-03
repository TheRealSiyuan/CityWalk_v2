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

  start(roomCode: string, name: string, relays: string[] | null): void {
    this.name = name;
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
        // Rooms are capped: extra peers are simply not shown or synced.
        if (this.peers.size >= CONFIG.net.maxPlayers - 1) return;
        const peer: Peer = { id, name: 'Walker', snaps: [] };
        this.peers.set(id, peer);
        this.status = 'online';
        this.handlers.onJoin(peer);
        this.sendHello?.({ name: this.name }, id);
      };
      room.onPeerLeave = (id) => {
        if (this.peers.delete(id)) this.handlers.onLeave(id);
      };
      hello.onMessage = (d, ctx) => {
        const peer = this.peers.get(ctx.peerId);
        if (!peer || !d || typeof d.name !== 'string') return;
        peer.name = d.name.replace(/[^\p{L}\p{N} _-]/gu, '').slice(0, 14) || 'Walker';
        this.handlers.onName(peer);
      };
      state.onMessage = (raw, ctx) => {
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

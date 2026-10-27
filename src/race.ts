import { CONFIG } from './config';
import { LANDMARKS, SPAWN, type Landmark } from './world/data';

/** A timed landmark race: reach each stop in order, as fast as you can. */
export interface Route {
  id: string;
  name: string;
  start: { x: number; z: number; yaw: number };
  stops: string[];
}

export const ROUTES: Route[] = [
  { id: 'westminster', name: 'Westminster Dash', start: { x: SPAWN.x, z: SPAWN.z, yaw: SPAWN.yaw }, stops: ['bigben', 'abbey', 'palace', 'trafalgar'] },
  { id: 'river', name: 'River Run', start: { x: SPAWN.x, z: SPAWN.z, yaw: SPAWN.yaw + 1.2 }, stops: ['eye', 'millennium', 'tate', 'shard', 'towerbridge'] },
  { id: 'city', name: 'City Sprint', start: { x: -380, z: 46, yaw: 0 }, stops: ['museum', 'stpauls', 'tower', 'towerbridge'] },
];

export type RaceState = 'idle' | 'countdown' | 'running' | 'finished';

export interface RaceEvents {
  onCountdown?(n: number): void; // 3, 2, 1, 0 = go
  onCheckpoint?(index: number, stop: Landmark, time: number): void;
  onFinish?(time: number, best: number | null, isNewBest: boolean): void;
}

export interface BestStore {
  get(routeId: string): number | null;
  set(routeId: string, time: number): void;
}

export class Race {
  state: RaceState = 'idle';
  route: Route | null = null;
  time = 0;
  next = 0;
  private count = 0;

  constructor(
    private best: BestStore,
    private events: RaceEvents = {},
  ) {}

  get stop(): Landmark | null {
    if (!this.route || this.next >= this.route.stops.length) return null;
    return LANDMARKS.find((l) => l.id === this.route!.stops[this.next]) ?? null;
  }

  get active(): boolean {
    return this.state === 'countdown' || this.state === 'running';
  }

  bestFor(id: string): number | null {
    return this.best.get(id);
  }

  /** Begin the countdown. The caller teleports the player to route.start. */
  start(route: Route): void {
    this.route = route;
    this.state = 'countdown';
    this.time = 0;
    this.next = 0;
    this.count = 3.0;
    this.events.onCountdown?.(3);
  }

  quit(): void {
    this.state = 'idle';
    this.route = null;
  }

  update(dt: number, x: number, z: number): void {
    if (this.state === 'countdown') {
      const before = Math.ceil(this.count);
      this.count -= dt;
      const after = Math.ceil(this.count);
      if (this.count <= 0) {
        this.state = 'running';
        this.events.onCountdown?.(0);
      } else if (after !== before) this.events.onCountdown?.(after);
      return;
    }
    if (this.state !== 'running' || !this.route) return;
    this.time += dt;
    const stop = this.stop;
    if (stop && Math.hypot(x - stop.x, z - stop.z) < stop.r) {
      this.events.onCheckpoint?.(this.next, stop, this.time);
      this.next++;
      if (this.next >= this.route.stops.length) {
        this.state = 'finished';
        const prev = this.best.get(this.route.id);
        const isNew = prev === null || this.time < prev;
        if (isNew) this.best.set(this.route.id, this.time);
        this.events.onFinish?.(this.time, isNew ? this.time : prev, isNew);
      }
    }
  }
}

export function formatTime(t: number): string {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
}

/** UTC calendar day, e.g. "2026-10-27": the daily route changes at the same moment for everyone. */
export function dayKey(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}

function seededRandom(key: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Today's challenge: a deterministic route generated from the date. It starts from one of the
 * hand-made route starts (known clear ground) and links landmarks a sensible distance apart.
 */
export function dailyRoute(key: string = dayKey()): Route {
  const { stops: n, minLeg, maxLeg } = CONFIG.daily;
  const rnd = seededRandom(key);
  const [, mm, dd] = key.split('-').map(Number);
  const name = `Daily · ${dd} ${MONTHS[(mm || 1) - 1] ?? ''}`.trim();
  for (let attempt = 0; attempt < 50; attempt++) {
    const base = ROUTES[Math.floor(rnd() * ROUTES.length)].start;
    const stops: string[] = [];
    let px = base.x;
    let pz = base.z;
    while (stops.length < n) {
      const options = LANDMARKS.filter((l) => {
        if (stops.includes(l.id)) return false;
        const d = Math.hypot(l.x - px, l.z - pz);
        return d >= minLeg && d <= maxLeg;
      });
      if (!options.length) break;
      const l = options[Math.floor(rnd() * options.length)];
      stops.push(l.id);
      px = l.x;
      pz = l.z;
    }
    if (stops.length === n) {
      const first = LANDMARKS.find((l) => l.id === stops[0])!;
      // face the first stop (camera looks along (-sin yaw, -cos yaw))
      const yaw = Math.atan2(base.x - first.x, base.z - first.z);
      return { id: `daily-${key}`, name, start: { x: base.x, z: base.z, yaw }, stops };
    }
  }
  const fallback = ROUTES[Math.floor(rnd() * ROUTES.length)];
  return { ...fallback, id: `daily-${key}`, name };
}

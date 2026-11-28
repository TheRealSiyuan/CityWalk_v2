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

  /**
   * Advance the race by `dt` of game time. `realDt` is the real time since the last call (frames
   * cap game time at 0.1 s); the countdown follows it so "3, 2, 1" stays three real seconds at a
   * low frame rate. The run itself is timed in game time, like the movement it measures.
   */
  update(dt: number, x: number, z: number, realDt = dt): void {
    if (this.state === 'countdown') {
      const before = Math.ceil(this.count);
      this.count -= Math.min(Math.max(dt, realDt), CONFIG.countdownMaxStep);
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

/**
 * Whether the restart key should restart the race: during a countdown or a run, or from the
 * finish card ("Race again"); never in free roam or while a menu (journal, route list) is open.
 */
export function canQuickRestart(state: RaceState, menuOpen: boolean): boolean {
  return !menuOpen && state !== 'idle';
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

/**
 * Text for sharing a race result: a daily's time, or a ghost to race on any route. Plain text only; `url` is omitted in builds that may not
 * link to other sites, so the message still makes sense on its own.
 */
export function raceShareText(routeName: string, time: string, url = '', withGhost = false): string {
  const dare = withGhost ? 'Race my ghost on the same route. Can you beat it?' : 'Same route for everyone today. Can you beat it?';
  const text = `CityWalk ${routeName}: I raced it in ${time}. ${dare}`;
  return url ? `${text} ${url}` : text;
}

/** The route with this id (a fixed route, or any day's daily, rebuilt locally); null if it is not one we know. */
export function routeById(id: string): Route | null {
  const fixed = ROUTES.find((r) => r.id === id);
  if (fixed) return fixed;
  const m = /^daily-(\d{4}-\d{2}-\d{2})$/.exec(id);
  if (!m || Number.isNaN(Date.parse(m[1]))) return null;
  return dailyRoute(m[1]);
}

/** The display name of a route id (a fixed route, or any day's daily); null if it is not one we know. */
export function routeName(id: string): string | null {
  return routeById(id)?.name ?? null;
}

/** The toast shown when a friend in your room finishes a race. */
export function roomResultText(who: string, route: string, t: number): string {
  return `${who} finished ${route} in ${formatTime(t)}`;
}

/** The HUD line while racing a time a friend in your room just set ("Race it"). */
export function targetText(who: string, t: number): string {
  return `Beat ${who} · ${formatTime(t)}`;
}

/** How your finish compares with the time of the friend you chose to race. */
export function targetResult(who: string, mine: number, theirs: number): string {
  const gap = Math.abs(mine - theirs).toFixed(1);
  if (gap === '0.0') return `Dead level with ${who}!`;
  return mine < theirs ? `You beat ${who} by ${gap} s` : `${who} was ${gap} s faster`;
}

export type Medal = 'gold' | 'silver' | 'bronze';
const TIERS: Medal[] = ['gold', 'silver', 'bronze'];
const MEDAL_NAME: Record<Medal, string> = { gold: 'Gold', silver: 'Silver', bronze: 'Bronze' };

/** Metres of straight-line legs a route asks for: start to each stop in turn, minus each stop's radius. */
export function routeLength(route: Route): number {
  let d = 0;
  let x = route.start.x;
  let z = route.start.z;
  for (const id of route.stops) {
    const l = LANDMARKS.find((q) => q.id === id);
    if (!l) continue;
    d += Math.max(0, Math.hypot(l.x - x, l.z - z) - l.r);
    x = l.x;
    z = l.z;
  }
  return d;
}

/** Target time in whole seconds for each medal on this route (gold is the fastest). */
export function medalTimes(route: Route): Record<Medal, number> {
  const len = routeLength(route);
  const t = (speed: number) => Math.max(1, Math.ceil(len / speed));
  return { gold: t(CONFIG.medals.gold), silver: t(CONFIG.medals.silver), bronze: t(CONFIG.medals.bronze) };
}

/** The best medal a time earns on a route, or null if it beats none of the targets. */
export function medalFor(route: Route, time: number): Medal | null {
  const m = medalTimes(route);
  return TIERS.find((tier) => time <= m[tier]) ?? null;
}

/**
 * The medal this run newly earned: better than the medal of `prevBest` (the best time before this
 * run, null if never raced), else null. A first medal on a route counts as new.
 */
export function medalUpgrade(route: Route, prevBest: number | null, time: number): Medal | null {
  const got = medalFor(route, time);
  if (!got) return null;
  const had = prevBest === null ? null : medalFor(route, prevBest);
  return had === null || TIERS.indexOf(got) < TIERS.indexOf(had) ? got : null;
}

/**
 * The finish-card line: the medal earned and the next target to chase. With `prevBest` (the best
 * time before this run) a medal better than any held before reads "New silver medal!".
 */
export function medalLine(route: Route, time: number, prevBest?: number | null): string {
  const m = medalTimes(route);
  const got = medalFor(route, time);
  const isNew = prevBest !== undefined && medalUpgrade(route, prevBest, time) !== null;
  const name = got ? (isNew ? `New ${got} medal!` : `${MEDAL_NAME[got]} medal`) : '';
  if (got === 'gold') return isNew ? name : 'Gold medal!';
  const next: Medal = got === 'silver' ? 'gold' : got === 'bronze' ? 'silver' : 'bronze';
  const chase = `${MEDAL_NAME[next]}: ${formatTime(m[next])}`;
  return got ? `${name} · ${chase}` : `No medal yet · ${chase}`;
}

/**
 * The goal shown beside a route in the route list: the next medal to chase above your best time,
 * or gold on a route you have not raced. Null once you hold gold (nothing left to chase).
 */
export function routeGoal(route: Route, best: number | null): { tier: Medal; text: string } | null {
  const m = medalTimes(route);
  const got = best === null ? null : medalFor(route, best);
  if (got === 'gold') return null;
  const tier: Medal = best === null || got === 'silver' ? 'gold' : got === 'bronze' ? 'silver' : 'bronze';
  return { tier, text: `${MEDAL_NAME[tier]} ${formatTime(m[tier])}` };
}

/**
 * The medal still in reach at this point of a run, for the live HUD chip: the fastest tier whose
 * target the clock has not passed yet. Once even bronze has gone, it stays on bronze, `passed`.
 */
export function medalPace(times: Record<Medal, number>, time: number): { tier: Medal; text: string; passed: boolean } {
  const tier = TIERS.find((t) => time <= times[t]) ?? 'bronze';
  return { tier, text: `${MEDAL_NAME[tier]} ${formatTime(times[tier])}`, passed: time > times[tier] };
}

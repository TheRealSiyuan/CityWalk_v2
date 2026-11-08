import { expect, test, type CDPSession, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { encodeChallenge } from '../src/challenge';
import { dailyRoute } from '../src/race';

// Signalling goes through the local relay started by playwright.config.ts.
const RELAY = 'ws://localhost:7447';
const url = (room: string) => `/?room=${room}&relay=${encodeURIComponent(RELAY)}`;

interface PlayerState { x: number; y: number; z: number; anim: number; roped: boolean; grounded: boolean; swings: number }
interface PeerState { id: string; name: string; seen: boolean; x: number; y: number; z: number }
type Debug = { ready: boolean; room: string; player: PlayerState; peers: PeerState[]; race: { state: string; time: number; next: number; route: string | null; stops: [number, number][] }; ghost: { loaded: boolean; time: number | null; visible: boolean; rope: boolean; x: number; z: number }; aimLine: { visible: boolean; aim: boolean }; reticleAt: { x: number; y: number } | null; teleport(x: number, y: number, z: number): void };
declare global {
  interface Window { __citywalk: Debug }
}

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  return errors;
}

async function ready(page: Page): Promise<void> {
  await page.waitForFunction(() => window.__citywalk?.ready === true, undefined, { timeout: 30_000 });
}
const player = (page: Page) => page.evaluate(() => window.__citywalk.player);

/** A real touch drag, dispatched through the browser's input pipeline. */
async function touch(cdp: CDPSession, type: 'touchStart' | 'touchMove' | 'touchEnd', x?: number, y?: number, id = 1): Promise<void> {
  await cdp.send('Input.dispatchTouchEvent', {
    type,
    touchPoints: type === 'touchEnd' ? [] : [{ x: x!, y: y!, id }],
  });
}
async function pushStick(page: Page, cdp: CDPSession, dx: number, dy: number, ms: number): Promise<void> {
  const x0 = 90;
  const y0 = 690;
  await touch(cdp, 'touchStart', x0, y0);
  for (let i = 1; i <= 6; i++) await touch(cdp, 'touchMove', x0 + (dx * i) / 6, y0 + (dy * i) / 6);
  await page.waitForTimeout(ms);
  await touch(cdp, 'touchEnd');
}

test.beforeAll(() => mkdirSync('screenshots', { recursive: true }));

test('mobile: loads straight into the game, renders, and the joystick moves the player', async ({ page }) => {
  const errors = trackErrors(page);
  const t0 = Date.now();
  await page.goto('/?relay=' + encodeURIComponent(RELAY));
  await ready(page);
  const loadMs = Date.now() - t0;

  // No menu: a room was auto-created and written into the address bar.
  expect(new URL(page.url()).searchParams.get('room')).toMatch(/^[a-z0-9]{6}$/);
  await expect(page.locator('#loading')).toHaveClass(/gone/);
  await expect(page.locator('#share')).toBeVisible();
  await expect(page.locator('#btn-swing')).toBeVisible();
  await expect(page.locator('#btn-jump')).toBeVisible();
  await expect(page.locator('#tutorial')).toBeVisible(); // first-load tutorial

  // The canvas actually drew a scene (not a blank frame).
  const canvas = page.locator('canvas#game');
  await expect(canvas).toBeVisible();
  const box = (await canvas.boundingBox())!;
  expect(box.width).toBe(390);
  expect(box.height).toBe(844);
  await page.waitForTimeout(600);
  const colours = await page.evaluate(async () => {
    const c = document.querySelector<HTMLCanvasElement>('canvas#game')!;
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const img = await createImageBitmap(c);
    const off = new OffscreenCanvas(48, 104);
    const g = off.getContext('2d')!;
    g.drawImage(img, 0, 0, 48, 104);
    const d = g.getImageData(0, 0, 48, 104).data;
    const seen = new Set<number>();
    for (let i = 0; i < d.length; i += 4) seen.add(((d[i] >> 4) << 8) | ((d[i + 1] >> 4) << 4) | (d[i + 2] >> 4));
    return seen.size;
  });
  expect(colours).toBeGreaterThan(25);

  // Joystick: push up hard on the left half and the player runs.
  const cdp = await page.context().newCDPSession(page);
  const before = await player(page);
  await pushStick(page, cdp, 0, -70, 2500);
  const after = await player(page);
  const moved = Math.hypot(after.x - before.x, after.z - before.z);
  expect(moved).toBeGreaterThan(3);

  // Jump button
  await page.locator('#btn-jump').tap();
  await expect.poll(async () => (await player(page)).grounded, { timeout: 2000 }).toBe(false);

  await page.screenshot({ path: 'screenshots/mobile-390x844.png' });
  console.log(`load-to-playable: ${loadMs} ms, joystick moved player ${moved.toFixed(1)} m`);
  expect(errors).toEqual([]);
});

test('mobile: holding Swing attaches a rope and releasing lets go', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto(url('swingtest'));
  await ready(page);
  await page.locator('#tut-skip').tap();
  // before grabbing: a dotted preview line points at the anchor Swing would take
  await expect.poll(async () => page.evaluate(() => window.__citywalk.aimLine), { timeout: 5000 }).toEqual({ visible: true, aim: true });
  // ...and the reticle sits on that anchor, not somewhere else on screen
  const at = (await page.evaluate(() => window.__citywalk.reticleAt))!;
  expect(at).not.toBeNull();
  const rb = (await page.locator('#reticle').boundingBox())!;
  expect(Math.abs(rb.x + rb.width / 2 - at.x)).toBeLessThan(6);
  expect(Math.abs(rb.y + rb.height / 2 - at.y)).toBeLessThan(6);
  const cdp = await page.context().newCDPSession(page);
  const box = (await page.locator('#btn-swing').boundingBox())!;
  const bx = box.x + box.width / 2;
  const by = box.y + box.height / 2;

  await touch(cdp, 'touchStart', bx, by, 2);
  await expect.poll(async () => (await player(page)).roped, { timeout: 5000 }).toBe(true);
  expect((await page.evaluate(() => window.__citywalk.aimLine)).visible).toBe(false); // the real rope replaces it
  await page.waitForTimeout(700);
  const mid = await player(page);
  expect(mid.y).toBeGreaterThan(0.5); // lifted off the ground by the rope
  await page.screenshot({ path: 'screenshots/mobile-swing.png' });
  await touch(cdp, 'touchEnd');
  await expect.poll(async () => (await player(page)).roped, { timeout: 2000 }).toBe(false);
  expect(errors).toEqual([]);
});

test('multiplayer: two browsers on the same room link see each other move', async ({ browser }) => {
  const room = 'e2e' + Math.random().toString(36).slice(2, 8);
  // Two fully separate browser contexts = two different people's phones.
  const phone = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, baseURL: 'http://localhost:4173' };
  const ctxA = await browser.newContext(phone);
  const ctxB = await browser.newContext(phone);
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  const errA = trackErrors(a);
  const errB = trackErrors(b);

  await a.goto(url(room));
  await ready(a);
  await b.goto(url(room));
  await ready(b);

  const peersOf = (p: Page) => p.evaluate(() => window.__citywalk.peers);
  await expect.poll(async () => (await peersOf(a)).filter((p) => p.seen).length, { timeout: 45_000 }).toBe(1);
  await expect.poll(async () => (await peersOf(b)).filter((p) => p.seen).length, { timeout: 45_000 }).toBe(1);
  await expect(a.locator('#pcount')).toHaveText('2');
  await expect(b.locator('#pcount')).toHaveText('2');

  // What each sees of the other matches where the other really is.
  const near = async (viewer: Page, actor: Page) => {
    const seen = (await peersOf(viewer))[0];
    const real = await player(actor);
    return Math.hypot(seen.x - real.x, seen.z - real.z);
  };
  await expect.poll(() => near(a, b), { timeout: 5000 }).toBeLessThan(1.5);
  await expect.poll(() => near(b, a), { timeout: 5000 }).toBeLessThan(1.5);

  // A moves; B watches A's avatar move.
  const seenAOnB0 = (await peersOf(b))[0];
  const cdpA = await a.context().newCDPSession(a);
  await pushStick(a, cdpA, 0, -70, 2500);
  await expect
    .poll(async () => {
      const s = (await peersOf(b))[0];
      return Math.hypot(s.x - seenAOnB0.x, s.z - seenAOnB0.z);
    }, { timeout: 5000 })
    .toBeGreaterThan(3);
  await expect.poll(() => near(b, a), { timeout: 5000 }).toBeLessThan(1.5);

  // B moves; A watches B's avatar move.
  const seenBOnA0 = (await peersOf(a))[0];
  const cdpB = await b.context().newCDPSession(b);
  await pushStick(b, cdpB, 0, -70, 1200); // follows A across the bridge, so A is in B's view
  await expect
    .poll(async () => {
      const s = (await peersOf(a))[0];
      return Math.hypot(s.x - seenBOnA0.x, s.z - seenBOnA0.z);
    }, { timeout: 5000 })
    .toBeGreaterThan(3);
  await expect.poll(() => near(a, b), { timeout: 5000 }).toBeLessThan(1.5);

  await a.screenshot({ path: 'screenshots/multiplayer-a.png' });
  await b.screenshot({ path: 'screenshots/multiplayer-b.png' });
  expect(errA).toEqual([]);
  expect(errB).toEqual([]);
  await ctxA.close();
  await ctxB.close();
});

test('race: pick a route, count down, take every checkpoint, finish and keep a personal best', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto(url('racetest'));
  await ready(page);
  await page.locator('#tut-skip').tap();
  await page.locator('#race-btn').tap();
  await expect(page.locator('#race-panel')).toBeVisible();
  // the daily challenge is listed first; this test runs the fixed Westminster Dash
  await page.locator('#routes button', { hasText: 'Westminster Dash' }).tap();
  await expect(page.locator('#race-hud')).toBeVisible();
  await expect(page.locator('#countdown')).toBeVisible();
  await expect.poll(async () => (await page.evaluate(() => window.__citywalk.race)).state, { timeout: 10_000 }).toBe('running');
  const t0 = (await page.evaluate(() => window.__citywalk.race)).time;
  await page.waitForTimeout(800);
  expect((await page.evaluate(() => window.__citywalk.race)).time).toBeGreaterThan(t0);
  await expect(page.locator('#race-next')).toContainText('1/');
  await expect(page.locator('#race-gap')).toBeHidden(); // no ghost yet on a first run

  // restart puts the clock back to a countdown
  await page.locator('#race-restart').tap();
  await expect.poll(async () => (await page.evaluate(() => window.__citywalk.race)).state).toBe('countdown');
  await expect.poll(async () => (await page.evaluate(() => window.__citywalk.race)).state, { timeout: 10_000 }).toBe('running');

  // arrive at each stop in turn (teleporting stands in for the journey)
  const route = ['bigben', 'abbey', 'palace', 'trafalgar'];
  const where: Record<string, [number, number]> = { bigben: [-311, 222], abbey: [-372, 270], palace: [-610, 208], trafalgar: [-380, 40] };
  for (const id of route) {
    await page.evaluate(([x, z]) => window.__citywalk.teleport(x, 0.5, z), where[id]);
    await page.waitForTimeout(400);
  }
  await expect(page.locator('#race-done')).toBeVisible();
  await expect(page.locator('#done-kicker')).toContainText('new personal best');
  await expect(page.locator('#done-share')).toHaveText('Challenge a friend'); // fixed routes share a ghost too
  await page.screenshot({ path: 'screenshots/race-finish.png' });
  const best = await page.evaluate(() => localStorage.getItem('citywalk.best.westminster'));
  expect(Number(best)).toBeGreaterThan(0);

  // the route list now shows that best time
  await page.locator('#done-routes').tap();
  await expect(page.locator('#routes button', { hasText: 'Westminster Dash' }).locator('.pb')).toHaveText(/\d:\d\d\.\d/);

  // the best run was saved as a ghost; racing again replays it alongside you
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('citywalk.ghost.westminster') ?? 'null'));
  expect(saved?.frames.length).toBeGreaterThan(2);
  expect(saved?.splits).toHaveLength(4);
  await page.locator('#routes button', { hasText: 'Westminster Dash' }).tap();
  await expect.poll(async () => (await page.evaluate(() => window.__citywalk.ghost)).visible).toBe(true);
  const g = await page.evaluate(() => window.__citywalk.ghost);
  expect(g.loaded).toBe(true);
  expect(Math.hypot(g.x - -311, g.z - 222)).toBeGreaterThan(1); // starts at the route start, not at Big Ben
  await expect.poll(async () => (await page.evaluate(() => window.__citywalk.race)).state, { timeout: 10_000 }).toBe('running');
  // the HUD shows a live gap to the ghost between checkpoints
  await expect(page.locator('#race-gap')).toBeVisible();
  await expect(page.locator('#race-gap')).toHaveText(/^[+−]\d+\.\d s$/);
  // first checkpoint toast compares with the ghost's split
  await page.evaluate(() => window.__citywalk.teleport(-311, 0.5, 222));
  await expect(page.locator('#toast')).toContainText(/[+−]\d+\.\d s/);
  await page.screenshot({ path: 'screenshots/race-ghost.png' });
  await page.locator('#race-quit').tap();
  await expect.poll(async () => (await page.evaluate(() => window.__citywalk.ghost)).visible).toBe(false);
  await expect(page.locator('#race-gap')).toBeHidden();
  expect(errors).toEqual([]);
});

test('daily challenge: listed first, starts a 4-stop route for today', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto(url('dailytest'));
  await ready(page);
  await page.locator('#tut-skip').tap();
  await page.locator('#race-btn').tap();
  const first = page.locator('#routes li').first();
  await expect(first).toHaveClass(/daily/);
  await expect(first).toContainText('Today’s challenge');
  await expect(first.locator('.pb')).toHaveText('New');
  await first.locator('button').tap();
  await expect(page.locator('#race-hud')).toBeVisible();
  await expect.poll(async () => (await page.evaluate(() => window.__citywalk.race)).state, { timeout: 10_000 }).toBe('running');
  const today = new Date().toISOString().slice(0, 10);
  expect((await page.evaluate(() => window.__citywalk.race)).route).toBe(`daily-${today}`);
  await expect(page.locator('#race-next')).toContainText('1/4');
  await page.locator('#race-quit').tap();
  await expect(page.locator('#daily-badge')).toBeVisible(); // no daily time yet
  await page.locator('#race-btn').tap();
  await page.screenshot({ path: 'screenshots/daily-challenge.png' });

  // finish today's route: a "Share today's time" button appears and shares plain text
  await page.locator('#routes li').first().locator('button').tap();
  await expect.poll(async () => (await page.evaluate(() => window.__citywalk.race)).state, { timeout: 10_000 }).toBe('running');
  const stops = (await page.evaluate(() => window.__citywalk.race)).stops;
  for (const [x, z] of stops) {
    await page.evaluate(([x, z]) => window.__citywalk.teleport(x, 0.5, z), [x, z]);
    await page.waitForTimeout(400);
  }
  await expect(page.locator('#race-done')).toBeVisible();
  await expect(page.locator('#done-share')).toBeVisible();
  await page.evaluate(() => {
    const w = window as unknown as { __shared: string[] };
    w.__shared = [];
    const capture = async (d: { text?: string }) => void w.__shared.push(d.text ?? '');
    Object.defineProperty(navigator, 'share', { value: capture, configurable: true });
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: (t: string) => capture({ text: t }) }, configurable: true });
  });
  await page.locator('#done-share').tap();
  const shared = await page.evaluate(() => (window as unknown as { __shared: string[] }).__shared);
  expect(shared).toHaveLength(1);
  expect(shared[0]).toMatch(/CityWalk Daily · \d+ \w+: I raced it in \d:\d\d\.\d/);
  expect(shared[0]).toContain('?room=');
  await page.screenshot({ path: 'screenshots/daily-share.png' });
  await page.locator('#done-close').tap();
  await expect(page.locator('#daily-badge')).toBeHidden(); // today's time is set
  expect(errors).toEqual([]);
});

test('first run: after the tutorial, one tap starts today\'s daily race; not offered again', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto(url('firstruntest'));
  await ready(page);
  await expect(page.locator('#next-up')).toBeHidden(); // not during the tutorial
  await page.locator('#tut-skip').tap();
  await expect(page.locator('#next-up')).toBeVisible();
  await expect(page.locator('#next-route')).not.toBeEmpty();
  await page.screenshot({ path: 'screenshots/first-run-next-up.png' });
  await page.locator('#next-go').tap();
  await expect(page.locator('#next-up')).toBeHidden();
  await expect(page.locator('#race-hud')).toBeVisible();
  const today = new Date().toISOString().slice(0, 10);
  await expect.poll(async () => (await page.evaluate(() => window.__citywalk.race)).route).toBe(`daily-${today}`);
  await page.locator('#race-quit').tap();

  // a returning player gets no tutorial and no nudge; replaying the tutorial does not nudge either
  await page.reload();
  await ready(page);
  await expect(page.locator('#tutorial')).toBeHidden();
  await page.waitForTimeout(500);
  await expect(page.locator('#next-up')).toBeHidden();
  await page.locator('#progress').tap();
  await page.locator('#replay').tap();
  await page.locator('#tut-skip').tap();
  await page.waitForTimeout(300);
  await expect(page.locator('#next-up')).toBeHidden();

  // "Not now" dismisses it
  await page.evaluate(() => localStorage.removeItem('citywalk.tutorial'));
  await page.reload();
  await ready(page);
  await page.locator('#tut-skip').tap();
  await expect(page.locator('#next-up')).toBeVisible();
  await page.locator('#next-no').tap();
  await expect(page.locator('#next-up')).toBeHidden();
  expect((await page.evaluate(() => window.__citywalk.race)).state).toBe('idle');
  expect(errors).toEqual([]);
});

test('first race: a how-races-work hint shows once, clear of the HUD and the countdown', async ({ page, browser }) => {
  const errors = trackErrors(page);
  await page.goto(url('racehinttest'));
  await ready(page);
  await page.locator('#tut-skip').tap();
  const hint = page.locator('#race-hint');
  await expect(hint).toBeHidden(); // not before a race
  await page.locator('#next-go').tap();
  await expect(hint).toBeVisible();
  await expect(hint).toContainText('beacon');
  const box = (await hint.boundingBox())!;
  const hud = (await page.locator('#race-hud').boundingBox())!;
  expect(box.y).toBeGreaterThanOrEqual(hud.y + hud.height); // below Restart/Quit
  expect(box.y + box.height).toBeLessThan(844 / 2 - 60); // above the big countdown digit
  await page.screenshot({ path: 'screenshots/race-hint.png' });
  // it hides itself shortly after GO, and a restart does not bring it back
  await expect.poll(async () => (await page.evaluate(() => window.__citywalk.race)).state, { timeout: 15_000 }).toBe('running');
  await expect(hint).toBeHidden({ timeout: 15_000 });
  await page.locator('#race-restart').tap();
  await page.waitForTimeout(300);
  await expect(hint).toBeHidden();
  await page.locator('#race-quit').tap();
  // nor does a later race on this device
  await page.reload();
  await ready(page);
  await page.locator('#race-btn').tap();
  await page.locator('#routes button', { hasText: 'Westminster Dash' }).tap();
  await expect(page.locator('#race-hud')).toBeVisible();
  await page.waitForTimeout(300);
  await expect(hint).toBeHidden();
  expect(errors).toEqual([]);

  // Quit during the countdown takes the hint with it; on a short landscape phone it clears the HUD too
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });
  const land = await ctx.newPage();
  await land.goto(url('racehintland'));
  await ready(land);
  await land.locator('#tut-skip').tap();
  await land.locator('#next-go').tap();
  const lh = land.locator('#race-hint');
  await expect(lh).toBeVisible();
  const lb = (await lh.boundingBox())!;
  const lhud = (await land.locator('#race-hud').boundingBox())!;
  expect(lb.y).toBeGreaterThanOrEqual(lhud.y + lhud.height);
  expect(lb.y + lb.height).toBeLessThanOrEqual(390);
  await land.screenshot({ path: 'screenshots/race-hint-landscape.png' });
  await land.locator('#race-quit').tap();
  await expect(lh).toBeHidden();
  await ctx.close();
});

test('challenge link: a finished daily shares a ghost a friend can race, old and broken links are safe', async ({ page, browser }) => {
  const errors = trackErrors(page);
  await page.goto(url('challengetest'));
  await ready(page);
  await page.locator('#tut-skip').tap();
  await page.locator('#next-go').tap();
  await expect.poll(async () => (await page.evaluate(() => window.__citywalk.race)).state, { timeout: 10_000 }).toBe('running');
  const stops = (await page.evaluate(() => window.__citywalk.race)).stops;
  for (const [x, z] of stops) {
    await page.waitForTimeout(500);
    await page.evaluate(([x, z]) => window.__citywalk.teleport(x, 0.5, z), [x, z]);
    await page.waitForTimeout(300);
  }
  await expect(page.locator('#done-share')).toHaveText('Challenge a friend');
  await expect(page.locator('#done-rival')).toBeHidden(); // nobody to compare with
  const myTime = (await page.evaluate(() => window.__citywalk.race)).time;
  await page.evaluate(() => {
    const w = window as unknown as { __shared: string[] };
    w.__shared = [];
    Object.defineProperty(navigator, 'share', { value: async (d: { text: string }) => void w.__shared.push(d.text), configurable: true });
  });
  await page.locator('#done-share').tap();
  const text = (await page.evaluate(() => (window as unknown as { __shared: string[] }).__shared))[0];
  expect(text).toContain('Race my ghost');
  const link = text.slice(text.indexOf('http'));
  expect(link).toMatch(/\?room=challengetest#c=[\w-]+$/);
  expect(link.length).toBeLessThan(2000);
  await page.close(); // software rendering: one game at a time, so the friend's clock runs at speed

  // a new player opens it: tutorial first, then the offer, which waits for an answer
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const friend = await ctx.newPage();
  const friendErrors = trackErrors(friend);
  await friend.goto(link.replace('?room=challengetest', `?room=challengefriend&relay=${encodeURIComponent(RELAY)}`));
  await ready(friend);
  await expect(friend.locator('#next-up')).toBeHidden();
  await friend.locator('#tut-skip').tap();
  await expect(friend.locator('#next-up')).toBeVisible();
  await expect(friend.locator('#next-kicker')).toContainText('friend challenged you');
  await expect(friend.locator('#next-route')).toContainText('Daily');
  await expect(friend.locator('#next-route')).toContainText('beat');
  await expect(friend.locator('#compass')).toBeHidden(); // nothing peeking through the card
  await friend.screenshot({ path: 'screenshots/challenge-offer.png' });
  await friend.locator('#next-go').tap();
  await expect.poll(async () => (await friend.evaluate(() => window.__citywalk.race)).state, { timeout: 10_000 }).toBe('running');
  const today = new Date().toISOString().slice(0, 10);
  expect((await friend.evaluate(() => window.__citywalk.race)).route).toBe(`daily-${today}`);
  const g = await friend.evaluate(() => window.__citywalk.ghost);
  expect(g.loaded).toBe(true);
  expect(g.time).toBeCloseTo(myTime, 1);
  expect(g.visible).toBe(true);
  expect(friend.url()).not.toContain('#c='); // accepted: a reload won't offer it again
  await friend.screenshot({ path: 'screenshots/challenge-race.png' });
  for (const [x, z] of stops) {
    await friend.evaluate(([x, z]) => window.__citywalk.teleport(x, 0.5, z), [x, z]);
    await friend.waitForTimeout(300);
  }
  await expect(friend.locator('#done-rival')).toHaveText(/friend/);
  await friend.screenshot({ path: 'screenshots/challenge-result.png' });

  // "Race again" still races the friend; a returning player is offered at once
  await friend.locator('#done-again').tap();
  await expect.poll(async () => (await friend.evaluate(() => window.__citywalk.ghost)).time).toBeCloseTo(myTime, 1);
  await friend.locator('#race-quit').tap();
  await friend.goto(link.replace('?room=challengetest', `?room=challengefriend2&relay=${encodeURIComponent(RELAY)}`));
  await ready(friend);
  await expect(friend.locator('#next-up')).toBeVisible();
  await friend.locator('#next-no').tap();
  await expect(friend.locator('#next-up')).toBeHidden();
  expect(friend.url()).not.toContain('#c=');
  expect((await friend.evaluate(() => window.__citywalk.race)).state).toBe('idle');

  // yesterday's link still works: it races that day's route and leaves today's own ghost alone
  const oldDay = '2026-10-01';
  const oldRoute = dailyRoute(oldDay);
  // the friend swung from 1 s to 4 s of this run, so their ghost's rope shows for that stretch
  const frames = Array.from({ length: 50 }, (_, i) => {
    const f = [oldRoute.start.x + i, 0.5, oldRoute.start.z, 0, 2, 5];
    return i >= 10 && i < 40 ? [...f, oldRoute.start.x + 25, 20, oldRoute.start.z] : f;
  });
  const oldCode = encodeChallenge(oldDay, { v: 1, dt: 0.1, time: 5, frames, splits: oldRoute.stops.map((_, i) => i + 1) })!;
  await friend.goto(`${url('challengeold')}#c=${oldCode}`);
  await ready(friend);
  await friend.locator('#next-go').tap();
  await expect.poll(async () => (await friend.evaluate(() => window.__citywalk.race)).state, { timeout: 10_000 }).toBe('running');
  const old = await friend.evaluate(() => window.__citywalk.race);
  expect(old.route).toBe(`daily-${oldDay}`);
  await expect.poll(async () => (await friend.evaluate(() => window.__citywalk.ghost)).rope, { timeout: 8000, intervals: [100] }).toBe(true);
  await expect.poll(async () => (await friend.evaluate(() => window.__citywalk.ghost)).rope, { timeout: 8000, intervals: [100] }).toBe(false);
  for (const [x, z] of old.stops) {
    await friend.evaluate(([x, z]) => window.__citywalk.teleport(x, 0.5, z), [x, z]);
    await friend.waitForTimeout(300);
  }
  await expect(friend.locator('#race-done')).toBeVisible();
  const ghostKeys = await friend.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('citywalk.ghost.')));
  expect(ghostKeys).toContain(`citywalk.ghost.daily-${today}`);

  // a broken link is ignored without an error
  await friend.goto(`${url('challengebroken')}#c=not_a_real_code`);
  await ready(friend);
  await friend.waitForTimeout(300);
  await expect(friend.locator('#next-up')).toBeHidden();
  await ctx.close();
  expect(errors).toEqual([]);
  expect(friendErrors).toEqual([]);
});

test('challenge link: a fixed route shares a ghost, the friend races it on that route', async ({ page, browser }) => {
  const errors = trackErrors(page);
  await page.goto(url('fixedchallenge'));
  await ready(page);
  await page.locator('#tut-skip').tap();
  await page.locator('#next-no').tap();
  await page.locator('#race-btn').tap();
  await page.locator('#routes button', { hasText: 'City Sprint' }).tap();
  await expect.poll(async () => (await page.evaluate(() => window.__citywalk.race)).state, { timeout: 10_000 }).toBe('running');
  for (const [x, z] of (await page.evaluate(() => window.__citywalk.race)).stops) {
    await page.waitForTimeout(500);
    await page.evaluate(([x, z]) => window.__citywalk.teleport(x, 0.5, z), [x, z]);
    await page.waitForTimeout(300);
  }
  await expect(page.locator('#done-share')).toHaveText('Challenge a friend');
  await page.evaluate(() => {
    const w = window as unknown as { __shared: string[] };
    w.__shared = [];
    Object.defineProperty(navigator, 'share', { value: async (d: { text: string }) => void w.__shared.push(d.text), configurable: true });
  });
  await page.locator('#done-share').tap();
  const text = (await page.evaluate(() => (window as unknown as { __shared: string[] }).__shared))[0];
  expect(text).toContain('City Sprint');
  expect(text).toContain('Race my ghost');
  const link = text.slice(text.indexOf('http'));
  expect(link).toMatch(/#c=[\w-]+$/);
  await page.close(); // software rendering: one game at a time

  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, baseURL: 'http://localhost:4173' });
  const friend = await ctx.newPage();
  const friendErrors = trackErrors(friend);
  await friend.goto(link.replace('?room=fixedchallenge', `?room=fixedfriend&relay=${encodeURIComponent(RELAY)}`));
  await ready(friend);
  await friend.locator('#tut-skip').tap();
  await expect(friend.locator('#next-kicker')).toContainText('friend challenged you');
  await expect(friend.locator('#next-route')).toContainText('City Sprint');
  await expect(friend.locator('#next-route')).toContainText('beat');
  await friend.locator('#next-go').tap();
  await expect.poll(async () => (await friend.evaluate(() => window.__citywalk.race)).state, { timeout: 10_000 }).toBe('running');
  const r = await friend.evaluate(() => window.__citywalk.race);
  expect(r.route).toBe('city');
  expect((await friend.evaluate(() => window.__citywalk.ghost)).loaded).toBe(true);
  for (const [x, z] of r.stops) {
    await friend.evaluate(([x, z]) => window.__citywalk.teleport(x, 0.5, z), [x, z]);
    await friend.waitForTimeout(300);
  }
  await expect(friend.locator('#race-done')).toBeVisible();
  await expect(friend.locator('#done-rival')).toHaveText(/friend/i);
  await ctx.close();
  expect(errors).toEqual([]);
  expect(friendErrors).toEqual([]);
});

test('desktop: no touch buttons, key hints shown, WASD and Space work', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, hasTouch: false, isMobile: false, baseURL: 'http://localhost:4173' });
  const page = await ctx.newPage();
  const errors = trackErrors(page);
  await page.goto(url('desktoptest'));
  await ready(page);
  await expect(page.locator('#btn-swing')).toBeHidden();
  await expect(page.locator('#btn-jump')).toBeHidden();
  await expect(page.locator('#keys')).toBeVisible();
  await page.locator('#tut-skip').click();
  const before = await player(page);
  // software rendering at 1280x720 is slow, so hold W until the player has run a few metres
  await page.keyboard.down('KeyW');
  await expect
    .poll(async () => {
      const now = await player(page);
      return Math.hypot(now.x - before.x, now.z - before.z);
    }, { timeout: 20_000 })
    .toBeGreaterThan(3);
  await page.keyboard.up('KeyW');
  await page.keyboard.press('Space');
  await expect.poll(async () => (await player(page)).grounded, { timeout: 2000 }).toBe(false);
  // hold E to swing
  await page.keyboard.down('KeyE');
  await expect.poll(async () => (await player(page)).roped, { timeout: 5000 }).toBe(true);
  await page.keyboard.up('KeyE');
  await page.screenshot({ path: 'screenshots/desktop-1280x720.png' });
  expect(errors).toEqual([]);
  await ctx.close();
});

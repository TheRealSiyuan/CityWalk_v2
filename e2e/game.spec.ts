import { expect, test, type CDPSession, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';

// Signalling goes through the local relay started by playwright.config.ts.
const RELAY = 'ws://localhost:7447';
const url = (room: string) => `/?room=${room}&relay=${encodeURIComponent(RELAY)}`;

interface PlayerState { x: number; y: number; z: number; anim: number; roped: boolean; grounded: boolean; swings: number }
interface PeerState { id: string; name: string; seen: boolean; x: number; y: number; z: number }
type Debug = { ready: boolean; room: string; player: PlayerState; peers: PeerState[] };
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
  const cdp = await page.context().newCDPSession(page);
  const box = (await page.locator('#btn-swing').boundingBox())!;
  const bx = box.x + box.width / 2;
  const by = box.y + box.height / 2;

  await touch(cdp, 'touchStart', bx, by, 2);
  await expect.poll(async () => (await player(page)).roped, { timeout: 5000 }).toBe(true);
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

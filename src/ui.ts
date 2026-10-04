import { LANDMARKS, type Landmark } from './world/data';

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;

const store = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* private mode: progress just is not saved */
    }
  },
};
export { store };

/** Running totals; the tutorial watches how much each grows during a step. */
export interface TutorialState {
  /** metres travelled */
  moved: number;
  /** pixels of look-drag */
  looked: number;
  jumped: number;
  /** ropes attached */
  swung: number;
}

interface Step {
  cls: string;
  touch: string;
  desktop: string;
  done: (s: TutorialState) => boolean;
  max: number;
}

const STEPS: Step[] = [
  { cls: 'tut-move', touch: 'Drag the left side to walk. Push further to run.', desktop: 'WASD to run. Hold Shift to walk.', done: (s) => s.moved > 4, max: 3 },
  { cls: 'tut-look', touch: 'Drag the right side to look around.', desktop: 'Click, then move the mouse to look.', done: (s) => s.looked > 80, max: 2 },
  { cls: 'tut-jump', touch: 'Tap JUMP.', desktop: 'Press Space to jump.', done: (s) => s.jumped >= 1, max: 2 },
  { cls: 'tut-swing', touch: 'Hold SWING to rope a rooftop. Let go to fly!', desktop: 'Hold click (or E) to swing. Release to fly!', done: (s) => s.swung >= 1, max: 3 },
];

export class UI {
  found: Set<string>;
  onName: ((name: string) => void) | null = null;
  onMute: ((muted: boolean) => void) | null = null;
  private cardTimer = 0;
  private toastTimer = 0;
  private tutStep = -1;
  private tutTime = 0;
  private tutBase: TutorialState | null = null;
  private muted = false;
  private touch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;

  constructor(private shareUrl: () => string) {
    let saved: string[] = [];
    try {
      saved = JSON.parse(store.get('citywalk.found') ?? '[]');
    } catch {
      saved = [];
    }
    this.found = new Set(saved.filter((id) => LANDMARKS.some((l) => l.id === id)));
    this.renderProgress();

    $('share').addEventListener('click', () => void this.share());
    $('progress').addEventListener('click', () => this.openPanel());
    $('close').addEventListener('click', () => this.closePanel());
    $('panel').addEventListener('click', (e) => {
      if (e.target === $('panel')) this.closePanel();
    });
    $('card').addEventListener('click', () => $('card').classList.remove('on'));
    $('tut-skip').addEventListener('click', () => this.endTutorial());
    $('replay').addEventListener('click', () => {
      this.closePanel();
      this.startTutorial(true);
    });
    $('mute').addEventListener('click', () => {
      this.muted = !this.muted;
      $('mute').textContent = `Sound: ${this.muted ? 'off' : 'on'}`;
      this.onMute?.(this.muted);
    });
    const dots = $('tut-dots');
    STEPS.forEach(() => dots.appendChild(document.createElement('b')));
  }

  private renderProgress(): void {
    $('count').textContent = `${this.found.size}/${LANDMARKS.length}`;
  }

  /** Returns true if this is a new discovery. */
  discover(l: Landmark): boolean {
    if (this.found.has(l.id)) return false;
    this.found.add(l.id);
    store.set('citywalk.found', JSON.stringify([...this.found]));
    this.renderProgress();
    const all = this.found.size === LANDMARKS.length;
    $('card-kicker').textContent = all ? `All ${LANDMARKS.length} found. London explored!` : `Landmark ${this.found.size} of ${LANDMARKS.length}`;
    $('card-name').textContent = l.name;
    $('card-fact').textContent = l.fact;
    $('card').classList.add('on');
    clearTimeout(this.cardTimer);
    this.cardTimer = window.setTimeout(() => $('card').classList.remove('on'), 7500);
    return true;
  }

  toast(msg: string, ms = 1800): void {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('on');
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => t.classList.remove('on'), ms);
  }

  setPlayers(n: number): void {
    $('pcount').textContent = String(n);
    $('players').classList.toggle('online', n > 1);
  }

  setCompass(l: Landmark | null, angle: number, dist: number): void {
    const c = $('compass');
    if (!l) {
      c.hidden = true;
      return;
    }
    c.hidden = false;
    $('needle').style.transform = `rotate(${angle}rad)`;
    $('compass-text').textContent = ` ${l.name} · ${Math.round(dist / 5) * 5} m`;
  }

  setReticle(x: number, y: number, on: boolean): void {
    const r = $('reticle');
    r.classList.toggle('on', on);
    if (on) r.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
  }

  private async share(): Promise<void> {
    const url = this.shareUrl();
    const data = { title: 'CityWalk', text: 'Swing through London with me!', url };
    try {
      if (navigator.share && this.touch) {
        await navigator.share(data);
        return;
      }
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
    }
    try {
      await navigator.clipboard.writeText(url);
      this.toast('Link copied — send it to a friend');
    } catch {
      window.prompt('Copy this link to invite friends:', url);
    }
  }

  private openPanel(): void {
    const ol = $('journal');
    ol.textContent = '';
    for (const l of LANDMARKS) {
      const li = document.createElement('li');
      li.textContent = l.name;
      if (this.found.has(l.id)) li.className = 'found';
      ol.appendChild(li);
    }
    $('panel').hidden = false;
  }

  private closePanel(): void {
    $('panel').hidden = true;
    const v = $<HTMLInputElement>('name').value.trim();
    if (v) this.onName?.(v);
  }

  setNameField(name: string): void {
    $<HTMLInputElement>('name').value = name;
  }

  get panelOpen(): boolean {
    return !$('panel').hidden;
  }

  // --- tutorial ---------------------------------------------------------------
  startTutorial(force = false): void {
    if (!force && store.get('citywalk.tutorial') === '1') return;
    this.tutStep = 0;
    this.tutTime = 0;
    this.tutBase = null;
    $('tutorial').hidden = false;
    this.renderTutorial();
  }

  private renderTutorial(): void {
    const s = STEPS[this.tutStep];
    $('tut-text').textContent = this.touch ? s.touch : s.desktop;
    document.body.classList.remove(...STEPS.map((x) => x.cls));
    document.body.classList.add(s.cls);
    [...$('tut-dots').children].forEach((d, i) => {
      d.className = i < this.tutStep ? 'done' : i === this.tutStep ? 'now' : '';
    });
  }

  endTutorial(): void {
    this.tutStep = -1;
    $('tutorial').hidden = true;
    document.body.classList.remove(...STEPS.map((x) => x.cls));
    store.set('citywalk.tutorial', '1');
  }

  get tutorialActive(): boolean {
    return this.tutStep >= 0;
  }

  /** Advance when the player does the thing, or after the step's time limit. */
  updateTutorial(dt: number, s: TutorialState): void {
    if (this.tutStep < 0) return;
    this.tutBase ??= { ...s };
    this.tutTime += dt;
    const step = STEPS[this.tutStep];
    // Only count what the player did during this step.
    const b = this.tutBase;
    const fresh: TutorialState = {
      moved: s.moved - b.moved,
      looked: s.looked - b.looked,
      jumped: s.jumped - b.jumped,
      swung: s.swung - b.swung,
    };
    if ((step.done(fresh) && this.tutTime > 0.5) || this.tutTime > step.max) {
      this.tutStep++;
      this.tutTime = 0;
      this.tutBase = { ...s };
      if (this.tutStep >= STEPS.length) this.endTutorial();
      else this.renderTutorial();
    }
  }
}

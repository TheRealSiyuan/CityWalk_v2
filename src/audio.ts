/** Tiny procedural sound effects (WebAudio oscillators + noise; no assets). */
export class Sfx {
  private ctx: AudioContext | null = null;
  private wind: GainNode | null = null;
  muted = false;

  /** Must be called from a user gesture. */
  start(): void {
    if (this.ctx) return;
    try {
      const AC: typeof AudioContext | undefined = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      const ctx = new AC();
      this.ctx = ctx;
      // looping filtered noise = wind that swells with speed
      const len = ctx.sampleRate * 2;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < len; i++) {
        last = last * 0.96 + (Math.random() * 2 - 1) * 0.04;
        d[i] = last * 6;
      }
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 700;
      this.wind = ctx.createGain();
      this.wind.gain.value = 0;
      src.connect(filter).connect(this.wind).connect(ctx.destination);
      src.start();
    } catch {
      this.ctx = null;
    }
  }

  /** iOS only unlocks audio on touch-end / click, so nudge it on every gesture. */
  resume(): void {
    if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume().catch(() => {});
  }

  setWind(speed: number): void {
    if (!this.ctx || !this.wind) return;
    const g = this.muted ? 0 : Math.min(0.22, Math.max(0, (speed - 9) / 30) * 0.22);
    this.wind.gain.setTargetAtTime(g, this.ctx.currentTime, 0.15);
  }

  private tone(freq: number, to: number, dur: number, type: OscillatorType, vol: number, delay = 0): void {
    const ctx = this.ctx;
    if (!ctx || this.muted) return;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(ctx.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  jump(): void { this.tone(300, 520, 0.13, 'triangle', 0.09); }
  attach(): void { this.tone(900, 1500, 0.09, 'square', 0.035); }
  release(): void { this.tone(700, 380, 0.12, 'triangle', 0.05); }
  land(): void { this.tone(140, 70, 0.1, 'sine', 0.12); }
  splash(): void { this.tone(500, 90, 0.35, 'sawtooth', 0.05); }
  discover(): void {
    [523, 659, 784, 1047].forEach((f, i) => this.tone(f, f, 0.32, 'triangle', 0.09, i * 0.09));
  }
}

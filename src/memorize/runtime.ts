/* The session runtime: it walks the schedule, drives the audio layer, and
   publishes one immutable snapshot for the interface to render. Framework-free
   on purpose, so the whole drill can be exercised in a test with a fake audio
   layer and no browser. */

import { ayahAudioUrl } from '../data/audio';
import type { Audio, PlayRequest } from './player';
import { nextCursor, startCursor, type Cursor, type Step } from './schedule';
import {
  costSession,
  paceEstimate,
  type EchoMode,
  type PlayableSegment,
} from './session';

/** A breath between repetitions, so two passes never run into each other. */
const BREATH = 0.4;
/** How often the countdown is refreshed while a session is running. */
const TICK = 250;
/** Recordings fetched at once while the session plays ahead of the learner. */
const PREFETCH = 3;

export type SessionPhase =
  | 'idle'
  | 'preparing'
  | 'reciting'
  | 'echoing'
  | 'waiting'
  | 'paused'
  | 'done'
  | 'error';

export type SessionState = {
  phase: SessionPhase;
  cursor: Cursor;
  /** Fraction of the passage's recordings already fetched, 0 to 1. */
  loaded: number;
  /** Seconds left in the whole drill, sharpening as real lengths arrive. */
  remaining: number;
  /** Seconds left of the current echo, and its full length, for the ring. */
  echoLeft: number;
  echoLength: number;
  /** Index of the segment sounding right now, so the text can follow along. */
  sounding: number | null;
  error: string | null;
};

export type SessionOptions = {
  segments: readonly PlayableSegment[];
  steps: readonly Step[];
  reciter: string;
  /** Measured seconds per letter, for estimates before audio has loaded. */
  pace: number;
  echo: EchoMode;
  audio: Audio;
  onFinished?: () => void;
};

type MutableOptions = SessionOptions & { echo: EchoMode };

const clamp = (n: number) => (Number.isFinite(n) && n > 0 ? n : 0);

export class Session {
  private readonly listeners = new Set<() => void>();
  private readonly durations = new Map<string, number>();
  private readonly urls: string[];
  private state: SessionState;
  private generation = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private ticker: ReturnType<typeof setInterval> | null = null;
  /** Length of the run in flight and the audio-clock time it started. */
  private runLength = 0;
  private runStartedAt = 0;
  /** How far into the current run a pause happened, so it can resume there. */
  private runOffset = 0;
  private echoEndsAt = 0;
  private disposed = false;
  /* A browser that has seen no gesture yet may leave `resume()` pending rather
     than rejecting. Everyone who asks to start waits on that same promise, and
     a latch makes sure only the first of them actually begins the drill. */
  private unlocking: Promise<void> | null = null;
  private launched = false;

  constructor(private readonly options: MutableOptions) {
    // Distinct recordings in the order the drill first reaches them.
    const seen = new Set<string>();
    for (const segment of options.segments)
      for (const clip of segment.clips)
        seen.add(ayahAudioUrl(clip.surah, clip.ayah, options.reciter));
    this.urls = [...seen];
    this.state = {
      phase: 'idle',
      cursor: startCursor,
      loaded: 0,
      remaining: this.cost(startCursor),
      echoLeft: 0,
      echoLength: 0,
      sounding: null,
      error: null,
    };
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = () => this.state;

  private set(patch: Partial<SessionState>) {
    // The clock ticks four times a second; a tick that changes nothing must
    // not publish a new snapshot, or every subscriber re-renders for nothing.
    let changed = false;
    for (const key of Object.keys(patch) as (keyof SessionState)[])
      if (!Object.is(this.state[key], patch[key])) changed = true;
    if (!changed) return;
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }

  /** A segment's length: measured where the audio is in, estimated where not. */
  private segmentSeconds = (index: number): number => {
    const segment = this.options.segments[index];
    if (!segment) return 0;
    let total = 0;
    for (const clip of segment.clips) {
      const known = this.durations.get(
        ayahAudioUrl(clip.surah, clip.ayah, this.options.reciter),
      );
      if (known === undefined) return paceEstimate(segment, this.options.pace);
      const to = clip.to === null ? known : Math.min(clip.to, known);
      total += Math.max(0, to - Math.min(clip.from, known));
    }
    return total;
  };

  private cost(cursor: Cursor) {
    return costSession(
      this.options.steps,
      this.segmentSeconds,
      this.options.echo,
      cursor,
    ).total;
  }

  /** Everything the audio layer must play for one pass over a step. */
  private requests(step: Step, skip = 0): PlayRequest[] {
    const out: PlayRequest[] = [];
    let dropped = 0;
    for (let i = step.from; i <= step.to; i++) {
      for (const clip of this.options.segments[i]?.clips ?? []) {
        const url = ayahAudioUrl(clip.surah, clip.ayah, this.options.reciter);
        const known = this.durations.get(url);
        const to = clip.to ?? known ?? null;
        const length = to === null ? 0 : Math.max(0, to - clip.from);
        if (dropped + length <= skip && length > 0) {
          dropped += length;
          continue;
        }
        const into = Math.max(0, skip - dropped);
        dropped += length;
        out.push({ url, from: clip.from + into, to });
      }
    }
    return out;
  }

  /** True once the recording is both measured and still decoded in memory. */
  private ready(url: string) {
    return this.durations.has(url) && this.options.audio.cached(url);
  }

  private async load(url: string) {
    if (this.ready(url)) return;
    const seconds = await this.options.audio.load(url);
    if (this.disposed) return;
    this.durations.set(url, seconds);
    this.set({
      loaded: this.durations.size / Math.max(1, this.urls.length),
      remaining: this.cost(this.state.cursor),
    });
  }

  /** Fetch the rest of the passage quietly behind whatever is playing. */
  private prefetch() {
    let index = 0;
    const worker = async (): Promise<void> => {
      while (!this.disposed && index < this.urls.length) {
        const url = this.urls[index++];
        await this.load(url).catch(() => {});
      }
    };
    for (let i = 0; i < PREFETCH; i++) void worker();
  }

  async start() {
    if (this.launched) return;
    if (this.state.phase !== 'idle' && this.state.phase !== 'error') return;
    this.unlocking ??= this.options.audio.unlock();
    try {
      await this.unlocking;
    } catch {
      this.unlocking = null;
      this.set({ phase: 'error', error: 'تعذّر تشغيل الصوت في هذا المتصفح.' });
      return;
    }
    this.unlocking = null;
    if (this.disposed || this.launched) return;
    this.launched = true;
    this.prefetch();
    this.startTicking();
    void this.run();
  }

  private async run() {
    const generation = ++this.generation;
    const step = this.options.steps[this.state.cursor.step];
    if (!step) return this.finish();
    const pending = this.requests(step).map((r) => r.url);
    this.options.audio.pin(pending);
    if (pending.some((url) => !this.ready(url))) {
      this.set({ phase: 'preparing', error: null });
      try {
        await Promise.all([...new Set(pending)].map((url) => this.load(url)));
      } catch {
        if (generation === this.generation)
          this.set({
            phase: 'error',
            error: 'تعذّر تحميل التلاوة. تحقّق من الاتصال ثم أعد المحاولة.',
          });
        return;
      }
      if (generation !== this.generation || this.disposed) return;
    }
    const requests = this.requests(step, this.runOffset);
    const endsAt = this.options.audio.play(requests, () =>
      this.afterRun(generation),
    );
    this.runStartedAt = this.options.audio.now;
    this.runLength = Math.max(0, endsAt - this.runStartedAt);
    this.set({
      phase: 'reciting',
      error: null,
      echoLeft: 0,
      echoLength: 0,
      sounding: step.from,
    });
  }

  private afterRun(generation: number) {
    if (generation !== this.generation || this.disposed) return;
    this.runOffset = 0;
    const { echo } = this.options;
    if (echo === 'manual') {
      this.set({
        phase: 'waiting',
        echoLeft: 0,
        echoLength: 0,
        sounding: null,
      });
      return;
    }
    const length =
      typeof echo === 'number' && echo > 0 ? this.runLength * echo : BREATH;
    const echoing = typeof echo === 'number' && echo > 0;
    this.echoEndsAt = Date.now() + length * 1000;
    if (echoing)
      this.set({
        phase: 'echoing',
        echoLeft: length,
        echoLength: length,
        sounding: null,
      });
    this.clearTimer();
    this.timer = setTimeout(() => this.advance(generation), length * 1000);
  }

  private advance(generation: number) {
    if (generation !== this.generation || this.disposed) return;
    const next = nextCursor(this.options.steps, this.state.cursor);
    if (!next) return this.finish();
    this.set({ cursor: next, remaining: this.cost(next) });
    void this.run();
  }

  private finish() {
    this.generation++;
    this.stopAudio();
    this.clearTimer();
    this.stopTicking();
    this.set({
      phase: 'done',
      remaining: 0,
      echoLeft: 0,
      echoLength: 0,
      sounding: null,
    });
    this.options.onFinished?.();
  }

  /** Change the silence left for repeating without restarting the drill. */
  setEcho(echo: EchoMode) {
    if (this.options.echo === echo) return;
    this.options.echo = echo;
    this.set({ remaining: this.cost(this.state.cursor) });
  }

  /** End the echo now, whether it is timed or waiting on the learner. */
  continue() {
    if (this.state.phase !== 'echoing' && this.state.phase !== 'waiting')
      return;
    this.clearTimer();
    this.advance(this.generation);
  }

  pause() {
    if (this.disposed) return;
    if (this.state.phase === 'reciting') {
      const played = clamp(this.options.audio.now - this.runStartedAt);
      // Resuming into the last moment of a run would leave nothing to play,
      // so a pause that close to the end restarts the run instead.
      const left = this.runLength - played;
      this.runOffset = left > BREATH ? played : 0;
    }
    if (
      this.state.phase !== 'reciting' &&
      this.state.phase !== 'echoing' &&
      this.state.phase !== 'waiting' &&
      this.state.phase !== 'preparing'
    )
      return;
    this.generation++;
    this.stopAudio();
    this.clearTimer();
    this.stopTicking();
    this.set({ phase: 'paused', echoLeft: 0, echoLength: 0, sounding: null });
  }

  async resume() {
    if (this.state.phase !== 'paused' && this.state.phase !== 'error') return;
    // Coming back from a locked phone, the context may need waking first.
    if (!this.options.audio.running)
      await this.options.audio.unlock().catch(() => {});
    if (this.disposed) return;
    this.startTicking();
    void this.run();
  }

  /** Move to another step, restarting it from its first repetition. */
  goTo(step: number) {
    if (this.disposed) return;
    const target = Math.max(
      0,
      Math.min(this.options.steps.length - 1, Math.trunc(step)),
    );
    this.generation++;
    this.stopAudio();
    this.clearTimer();
    this.runOffset = 0;
    const cursor = { step: target, rep: 0 };
    this.set({ cursor, remaining: this.cost(cursor), error: null });
    if (this.state.phase === 'paused' || this.state.phase === 'idle') return;
    this.startTicking();
    void this.run();
  }

  next() {
    if (this.state.cursor.step + 1 >= this.options.steps.length)
      return this.finish();
    this.goTo(this.state.cursor.step + 1);
  }

  previous() {
    // Restart the step first, the way a stopped reciter would.
    this.goTo(
      this.state.cursor.rep > 0
        ? this.state.cursor.step
        : this.state.cursor.step - 1,
    );
  }

  private startTicking() {
    this.stopTicking();
    this.ticker = setInterval(() => {
      // A browser that suspended the context while the page was hidden leaves
      // the clock frozen; showing that as paused keeps a way forward.
      if (this.state.phase === 'reciting' && !this.options.audio.running) {
        this.pause();
        return;
      }
      const base = this.cost(this.state.cursor);
      const spent =
        this.state.phase === 'reciting'
          ? clamp(this.options.audio.now - this.runStartedAt)
          : 0;
      const echoLeft =
        this.state.phase === 'echoing'
          ? Math.max(0, (this.echoEndsAt - Date.now()) / 1000)
          : 0;
      this.set({
        remaining: Math.max(0, base - spent),
        echoLeft,
        sounding: this.soundingAt(spent),
      });
    }, TICK);
  }

  /** Which segment of the run in flight is sounding `spent` seconds in. */
  private soundingAt(spent: number): number | null {
    if (this.state.phase !== 'reciting') return null;
    const step = this.options.steps[this.state.cursor.step];
    if (!step) return null;
    let at = -this.runOffset;
    for (let i = step.from; i <= step.to; i++) {
      at += this.segmentSeconds(i);
      if (spent < at) return i;
    }
    return step.to;
  }

  private stopTicking() {
    if (this.ticker !== null) clearInterval(this.ticker);
    this.ticker = null;
  }

  private clearTimer() {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  private stopAudio() {
    this.options.audio.stop();
  }

  dispose() {
    this.disposed = true;
    this.generation++;
    this.stopAudio();
    this.clearTimer();
    this.stopTicking();
    this.listeners.clear();
  }
}

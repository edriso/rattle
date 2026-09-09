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
  /** Seconds left in the whole drill: the reciter's pace until the run's own
      recordings are measured, then corrected once and counting down. */
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
};

type MutableOptions = SessionOptions & { echo: EchoMode };

const clamp = (n: number) => (Number.isFinite(n) && n > 0 ? n : 0);

const NO_AUDIO = 'تعذّر تشغيل الصوت في هذا المتصفح.';

/** Slack allowed between two slices of one recording before they count as
    meeting rather than as two separate places in it. */
const TOUCHING = 0.05;

/**
 * Fold consecutive slices of the same recording that meet into one slice.
 * Two phrases of one ayah are cut at the same moment, so a step that plays
 * them one after the other is playing a continuous stretch of the recording:
 * asking for it as one keeps the reciter's own pause between them, where two
 * requests would have dropped it and spliced the phrases tight together.
 */
function joined(clips: readonly PlayRequest[]): PlayRequest[] {
  const out: PlayRequest[] = [];
  for (const clip of clips) {
    const last = out.at(-1);
    if (
      last &&
      last.url === clip.url &&
      last.to !== null &&
      clip.from <= last.to + TOUCHING
    )
      out[out.length - 1] = {
        url: last.url,
        from: last.from,
        to: clip.to === null ? null : Math.max(last.to, clip.to),
      };
    else out.push(clip);
  }
  return out;
}

export class Session {
  private readonly listeners = new Set<() => void>();
  private readonly durations = new Map<string, number>();
  private readonly urls: string[];
  /* Each segment's length before any of its audio has been measured, worked
     out once. `segmentSeconds` is asked for every segment of every step still
     ahead of the learner, four times a second, and `paceEstimate` counts the
     letters of a segment's text with a regular expression: costing al-Baqarah
     whole at «الكل» spent 850 of every 1,000 ms here, and now spends 4. */
  private readonly estimates: readonly number[];
  private state: SessionState;
  private generation = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private ticker: ReturnType<typeof setInterval> | null = null;
  /** Length of the run in flight and the audio-clock time it started. */
  private runLength = 0;
  private runStartedAt = 0;
  /** How far into the current run a pause happened, so it can resume there. */
  private runOffset = 0;
  /** How far into the run the run in flight began, which a resumed run keeps. */
  private runFrom = 0;
  /** What the repetition had spent when it was paused, frozen for the clock. */
  private pausedSpent = 0;
  private echoEndsAt = 0;
  private disposed = false;
  /* Every fetch this session starts is hung on this, so disposing it stops
     them. `Audio.load` has always taken a signal and nothing ever passed one,
     which left up to four recordings of the voice a learner had just changed
     away from downloading for as long as thirty seconds, competing on a phone
     with the ones the new drill is waiting on. */
  private readonly lifetime = new AbortController();
  /* A browser that has seen no gesture yet may leave `resume()` pending rather
     than rejecting. Everyone who asks to start waits on that same promise, and
     a latch makes sure only the first of them actually begins the drill. */
  private unlocking: Promise<void> | null = null;
  private launched = false;
  private resuming = false;
  private reading = false;

  constructor(private readonly options: MutableOptions) {
    // Distinct recordings in the order the drill first reaches them.
    const seen = new Set<string>();
    for (const segment of options.segments)
      for (const clip of segment.clips)
        seen.add(ayahAudioUrl(clip.surah, clip.ayah, options.reciter));
    this.urls = [...seen];
    this.estimates = options.segments.map((segment) =>
      paceEstimate(segment, options.pace),
    );
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
      if (known === undefined) return this.estimates[index] ?? 0;
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

  /**
   * Seconds of the current repetition already behind the learner: the audio
   * played so far, plus any of the echo that has elapsed. `cost` counts the
   * repetition whole, so without this the clock would climb back up the
   * moment a run ended and the silence began.
   */
  private spent(): number {
    switch (this.state.phase) {
      case 'reciting':
        return this.runFrom + clamp(this.options.audio.now - this.runStartedAt);
      case 'echoing': {
        const left = Math.max(0, (this.echoEndsAt - Date.now()) / 1000);
        return (
          this.runFrom +
          this.runLength +
          Math.max(0, this.state.echoLength - left)
        );
      }
      case 'waiting':
        return this.runFrom + this.runLength;
      case 'paused':
        return this.pausedSpent;
      default:
        return 0;
    }
  }

  /** Seconds left in the drill from where the learner actually stands. */
  private countdown() {
    return Math.max(0, this.cost(this.state.cursor) - this.spent());
  }

  /** Everything the audio layer must play for one pass over a step. */
  private requests(step: Step, skip = 0): PlayRequest[] {
    const clips: PlayRequest[] = [];
    for (let i = step.from; i <= step.to; i++)
      for (const clip of this.options.segments[i]?.clips ?? []) {
        const url = ayahAudioUrl(clip.surah, clip.ayah, this.options.reciter);
        const known = this.durations.get(url);
        clips.push({ url, from: clip.from, to: clip.to ?? known ?? null });
      }
    const out: PlayRequest[] = [];
    let dropped = 0;
    for (const clip of joined(clips)) {
      const length = clip.to === null ? 0 : Math.max(0, clip.to - clip.from);
      if (dropped + length <= skip && length > 0) {
        dropped += length;
        continue;
      }
      const into = Math.max(0, skip - dropped);
      dropped += length;
      out.push({ ...clip, from: clip.from + into });
    }
    return out;
  }

  /** True once the recording is both measured and still decoded in memory. */
  private ready(url: string) {
    return this.durations.has(url) && this.options.audio.cached(url);
  }

  private async load(url: string) {
    if (this.ready(url)) return;
    const seconds = await this.fetch(url);
    if (this.disposed) return;
    this.durations.set(url, seconds);
    /* `loaded` only. The countdown is deliberately not republished here: a
       recording's real length replaces one segment's estimate, and the
       estimates scatter about 20% either side of the truth per ayah, so a
       five-ayah passage used to publish six different totals in three seconds
       and climb on most of them. Measured against Husary's own recordings,
       2:228-232 went 7294 -> 7377 -> 7694 -> 7896 -> 7927 -> 8097, upwards
       every single time. Correcting the unmeasured tail by the ratio measured
       so far is worse rather than better: the error is scatter, not a wrong
       pace, so summing five estimates averages it down where scaling by one
       sample does not. So the forecast stands as it was until the drill
       starts, which is when the tick picks it up with the run's own lengths
       known and it counts down from there. */
    this.set({ loaded: this.durations.size / Math.max(1, this.urls.length) });
  }

  /**
   * Ask the audio layer for a recording, once, and then once more if the
   * attempt was abandoned by somebody else.
   *
   * The layer is shared across drills, so decoded recitation survives a
   * rebuild, and it keeps one fetch per recording however many callers want
   * it. Changing the joins therefore builds a new session over the same
   * recordings while the old one is still fetching them, and disposing the old
   * one aborts a fetch the new one is waiting on. That abort is not this
   * session's failure and must not become an error screen: the abandoned
   * fetch is no longer held, so asking again starts one of this session's own.
   * Anything else, and any abort of our own signal, is passed straight on.
   */
  private async fetch(url: string) {
    try {
      return await this.options.audio.load(url, this.lifetime.signal);
    } catch (error) {
      if (
        this.lifetime.signal.aborted ||
        !(error instanceof DOMException) ||
        error.name !== 'AbortError'
      )
        throw error;
    }
    return this.options.audio.load(url, this.lifetime.signal);
  }

  /**
   * Read ahead of the learner, once per session, whenever it first plays.
   *
   * `start()` is not the only way in, and this used to live there. A drill
   * held across a rebuild is `paused`, which `start()` refuses, so that one
   * arrives through `resume()` and played with nothing fetched ahead of it:
   * every step whose recording was not already decoded stopped to load, and
   * «جارٍ تحميل التلاوة… ٪» undercounted for the rest of the sitting. It has a
   * flag of its own rather than sharing `launched`, which is also `start()`'s
   * re-entry guard.
   */
  private readAhead() {
    if (this.reading) return;
    this.reading = true;
    this.prefetch();
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

  /** Wake the audio context once, however many callers ask at the same time. */
  private wake() {
    this.unlocking ??= this.options.audio.unlock();
    return this.unlocking.finally(() => {
      this.unlocking = null;
    });
  }

  async start() {
    if (this.launched) return;
    if (this.state.phase !== 'idle' && this.state.phase !== 'error') return;
    try {
      await this.wake();
    } catch {
      this.set({ phase: 'error', error: NO_AUDIO });
      return;
    }
    if (this.disposed || this.launched) return;
    this.launched = true;
    this.startTicking();
    void this.run();
  }

  private async run() {
    this.readAhead();
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
        if (generation === this.generation) {
          // Every other way out of a run stops the clock. This one did not,
          // so an error screen left open went on recosting the drill four
          // times a second and publishing nothing.
          this.stopTicking();
          this.set({
            phase: 'error',
            error: 'تعذّر تحميل التلاوة. تحقّق من الاتصال ثم أعِد المحاولة.',
          });
        }
        return;
      }
      if (generation !== this.generation || this.disposed) return;
    }
    const requests = this.requests(step, this.runOffset);
    const endsAt = this.options.audio.play(requests, () =>
      this.afterRun(generation),
    );
    this.runFrom = this.runOffset;
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
    /* Priced off the whole run rather than off the playback that just ended.
       A resumed run only replays what a pause left, so `runLength` is that
       tail: a learner who stopped nine seconds into a ten-second ayah got one
       second of silence to recite the whole of it back. `costSession` has
       always priced the echo off the full run, so the clock disagreed with
       the silence as well. */
    const run = this.runFrom + this.runLength;
    const length = typeof echo === 'number' && echo > 0 ? run * echo : BREATH;
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
    this.runFrom = 0;
    this.pausedSpent = 0;
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
  }

  /** Change the silence left for repeating without restarting the drill. */
  setEcho(echo: EchoMode) {
    if (this.options.echo === echo) return;
    this.options.echo = echo;
    this.set({ remaining: this.countdown() });
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
      // Measured from the start of the run, not of this playback: a resumed
      // run already begins part-way in, and pausing it again must not throw
      // that part away and replay it. Resuming into the last moment would
      // leave nothing to play, so a pause that close to the end starts over.
      const left = this.runLength - played;
      this.runOffset = left > BREATH ? this.runFrom + played : 0;
    }
    if (
      this.state.phase !== 'reciting' &&
      this.state.phase !== 'echoing' &&
      this.state.phase !== 'waiting' &&
      this.state.phase !== 'preparing'
    )
      return;
    // Frozen before the phase changes, so the clock holds where it stood.
    this.pausedSpent = this.spent();
    this.generation++;
    this.stopAudio();
    this.clearTimer();
    this.stopTicking();
    this.set({
      phase: 'paused',
      remaining: this.countdown(),
      echoLeft: 0,
      echoLength: 0,
      sounding: null,
    });
  }

  async resume() {
    if (this.resuming) return;
    const from = this.state.phase;
    if (from !== 'paused' && from !== 'error') return;
    // Coming back from a locked phone, the context may need waking first, and
    // that wait can be long. The latch is what stops a second tap of the play
    // button from starting a second recitation over the first.
    this.resuming = true;
    try {
      if (!this.options.audio.running) await this.wake();
    } catch {
      /* Said, rather than swallowed. Going on to `run()` scheduled into a
         context that is not running, and the tick that notices then set the
         phase back to «متوقّفة» four times a second: a learner pressing play
         on a browser that will not give it got no reason and no way out. */
      this.set({ phase: 'error', error: NO_AUDIO });
      return;
    } finally {
      this.resuming = false;
    }
    if (this.disposed || this.state.phase !== from) return;
    this.startTicking();
    void this.run();
  }

  /**
   * Carry the fact that a drill was stopped across a rebuild. A new `Session`
   * always starts `idle`, which reads to the screen as a drill nobody has
   * begun, so it starts one; a learner who had pressed pause before changing
   * the reciter would then be recited at from behind the open sheet. `start()`
   * refuses every phase but `idle` and `error`, so holding here is also what
   * keeps that auto-start off.
   */
  hold() {
    if (this.disposed || this.state.phase !== 'idle') return;
    this.set({ phase: 'paused', remaining: this.countdown() });
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
    this.runFrom = 0;
    // A step change while paused starts that step from nothing spent.
    this.pausedSpent = 0;
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
      /* Nothing is sounding and nothing is elapsing while the recordings
         arrive, so a tick has nothing of its own to publish, and rewriting the
         forecast is precisely what made the clock jump about. */
      if (this.state.phase === 'preparing') return;
      const spent = this.spent();
      const echoLeft =
        this.state.phase === 'echoing'
          ? Math.max(0, (this.echoEndsAt - Date.now()) / 1000)
          : 0;
      this.set({
        remaining: Math.max(0, this.cost(this.state.cursor) - spent),
        echoLeft,
        sounding: this.soundingAt(spent),
      });
    }, TICK);
  }

  /** Which segment is sounding `into` seconds into the run in flight. */
  private soundingAt(into: number): number | null {
    if (this.state.phase !== 'reciting') return null;
    const step = this.options.steps[this.state.cursor.step];
    if (!step) return null;
    let at = 0;
    for (let i = step.from; i <= step.to; i++) {
      at += this.segmentSeconds(i);
      if (into < at) return i;
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
    this.lifetime.abort();
    this.generation++;
    this.stopAudio();
    this.clearTimer();
    this.stopTicking();
    this.listeners.clear();
  }
}

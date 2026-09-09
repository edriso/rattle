/* Gapless playback of ayah clips through the Web Audio API.

   A run is one pass over a step's segments. Every clip in a run is scheduled
   ahead on the audio clock, so linked ayat splice together the way a reciter
   joins them, with no event-loop gap in between. Runs are chained one at a
   time, which keeps pausing and skipping simple: nothing is committed to the
   clock beyond the run in flight. */

/** What a session asks the audio layer for: a slice of one recording. */
export type PlayRequest = { url: string; from: number; to: number | null };

/** The audio layer a session drives, narrow enough to fake in a test. */
export interface Audio {
  unlock(): Promise<void>;
  /** Fetch and decode a recording, resolving with its length in seconds. */
  load(url: string, signal?: AbortSignal): Promise<number>;
  /** Whether a recording is still decoded and ready to play right now. */
  cached(url: string): boolean;
  /** True while the audio layer is actually able to make sound. */
  readonly running: boolean;
  /** Hold these recordings in memory until the next call replaces the set. */
  pin(urls: readonly string[]): void;
  /** Play the requests back to back; returns the audio-clock time they end. */
  play(requests: readonly PlayRequest[], onFinished: () => void): number;
  stop(): void;
  readonly now: number;
}

/** Combine the signals that exist. Without `AbortSignal.any` only one of them
    can reach `fetch`, and it is the caller's: an abort must always be heard,
    even on an engine where the attempt then loses its own time limit. Pass at
    most two, or the one dropped will not be the one you meant. */
function combine(...signals: (AbortSignal | undefined)[]) {
  const live = signals.filter((s) => s !== undefined);
  if (live.length < 2) return live[0];
  return AbortSignal.any?.(live) ?? live[0];
}

/**
 * Fetch a recording from the first address that answers, and go round the
 * whole list once more after a moment before giving it up. A later address
 * answers a host being unreachable; the second round answers the commoner
 * failure on a phone, a moment of no signal.
 */
async function fetchAudio(urls: readonly string[], signal?: AbortSignal) {
  /* One ceiling over every attempt, so reaching for more addresses can never
     leave a learner waiting longer than a single stalled connection used to.
     It is arithmetic rather than a third signal because on an engine with
     `AbortSignal.timeout` but no `AbortSignal.any` only one signal survives:
     a deadline passed that way would displace each attempt's own limit, and
     the first stalled host would burn the whole budget before any other
     address was tried. That is the failure this list exists to answer. */
  const started = Date.now();
  const left = () => DEADLINE - (Date.now() - started);
  let last: unknown;
  for (let round = 0; round < 2 && left() > 0; round++) {
    if (round) await new Promise((resolve) => setTimeout(resolve, RETRY));
    for (const url of urls) {
      if (signal?.aborted) throw signal.reason;
      if (left() <= 0) break;
      const attempt = AbortSignal.timeout?.(Math.min(TIMEOUT, left()));
      const abort = combine(signal, attempt);
      try {
        const response = await fetch(url, { signal: abort });
        if (!response.ok) throw new Error(`audio ${response.status}`);
        return await response.arrayBuffer();
      } catch (error) {
        if (signal?.aborted) throw error;
        last = error;
      }
    }
  }
  throw last;
}

/** Decoded audio is heavy, so the cache is bounded by playing time, not count. */
const CACHE_SECONDS = 420;
/**
 * How far into a clip that begins part-way through a recording its first sound
 * is looked for. A clip is cut at the moment the reciter finishes a word, so it
 * opens inside the pause he then takes, and that pause runs about a second.
 * Long enough to cover it; far too short to swallow a phrase.
 */
const TRIM_WINDOW = 2;
/** Sound below this fraction of a clip's own loudest moment is silence. */
const SILENT = 0.03;
/** Kept before the first sound, so no beginning is ever clipped. */
const ONSET = 0.04;
/** Longest stretch of a recording ever scanned to find that loudest moment. */
const SCAN = 8;
/** Scheduling lead, long enough to survive a slow frame before the first clip. */
const LEAD = 0.06;
/** A recording that has not arrived by now is treated as a failure, so a
    stalled connection surfaces as a message rather than an endless wait. */
const TIMEOUT = 20_000;
/** Ceiling on one recording's whole fetch, however many addresses it tries,
    counted on the clock so no attempt has to give up its own limit for it. */
const DEADLINE = 30_000;
/** Pause before trying every address again, long enough to outlast a blip. */
const RETRY = 600;

export class ClipPlayer implements Audio {
  private context: AudioContext | null = null;
  private gain: GainNode | null = null;
  private readonly buffers = new Map<string, AudioBuffer>();
  private readonly pending = new Map<string, Promise<AudioBuffer>>();
  /** Insertion order is the eviction order; re-reading a URL refreshes it. */
  private readonly used: string[] = [];
  private live: AudioBufferSourceNode[] = [];
  private pinned = new Set<string>();
  private generation = 0;

  /**
   * @param mirrors Other addresses carrying the recording at a URL, tried in
   * turn when it cannot be reached. Injected rather than imported so this
   * layer stays free of any knowledge of where recitation comes from.
   */
  constructor(
    private readonly mirrors: (url: string) => readonly string[] = () => [],
  ) {}

  private ensureContext(): AudioContext {
    if (!this.context) {
      const Ctor: typeof AudioContext =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      // A lower rate quarters the memory a long passage holds while decoded.
      try {
        this.context = new Ctor({ sampleRate: 24000 });
      } catch {
        this.context = new Ctor();
      }
      this.gain = this.context.createGain();
      this.gain.connect(this.context.destination);
    }
    return this.context;
  }

  /** Must be called from a user gesture, which is the only place iOS and
      Safari let a context leave the suspended state. */
  async unlock(): Promise<void> {
    const context = this.ensureContext();
    if (context.state !== 'running') await context.resume();
  }

  get running() {
    return this.context !== null && this.context.state === 'running';
  }

  get now() {
    return this.context?.currentTime ?? 0;
  }

  async load(url: string, signal?: AbortSignal): Promise<number> {
    return (await this.buffer(url, signal)).duration;
  }

  private buffer(url: string, signal?: AbortSignal): Promise<AudioBuffer> {
    const cached = this.buffers.get(url);
    if (cached) {
      this.touch(url);
      return Promise.resolve(cached);
    }
    const inFlight = this.pending.get(url);
    if (inFlight) return inFlight;
    // Decoding works on a suspended context, so loading needs no gesture.
    const context = this.ensureContext();
    const request = fetchAudio([url, ...this.mirrors(url)], signal)
      .then((bytes) => context.decodeAudioData(bytes))
      .then((buffer) => {
        this.buffers.set(url, buffer);
        this.touch(url);
        this.evict();
        return buffer;
      })
      .finally(() => this.pending.delete(url));
    this.pending.set(url, request);
    return request;
  }

  cached(url: string) {
    return this.buffers.has(url);
  }

  private touch(url: string) {
    const at = this.used.indexOf(url);
    if (at >= 0) this.used.splice(at, 1);
    this.used.push(url);
  }

  /** Recitation needed by the run in flight survives eviction however long
      that run is; everything else goes oldest first once the cache is full. */
  pin(urls: readonly string[]) {
    this.pinned = new Set(urls);
  }

  private evict() {
    let total = 0;
    for (const url of this.used) total += this.buffers.get(url)?.duration ?? 0;
    for (let i = 0; i < this.used.length && total > CACHE_SECONDS;) {
      const url = this.used[i];
      if (this.pinned.has(url) || this.used.length <= 1) {
        i++;
        continue;
      }
      this.used.splice(i, 1);
      total -= this.buffers.get(url)?.duration ?? 0;
      this.buffers.delete(url);
    }
  }

  /**
   * Where the sound actually starts in a clip that begins part-way through a
   * recording. The clip is cut where the reciter finished a word, which is the
   * moment before the pause he takes, so playing from there opens with about a
   * second of silence. A clip that starts at the beginning of a recording is
   * left alone: that silence is the breath between one ayah and the next, and
   * dropping it would run them together.
   */
  private firstSound(buffer: AudioBuffer, from: number, to: number) {
    if (from <= 0) return from;
    const rate = buffer.sampleRate;
    const samples = buffer.getChannelData(0);
    const begin = Math.floor(from * rate);
    const end = Math.min(samples.length, Math.floor(to * rate));
    let loudest = 0;
    for (let i = begin; i < Math.min(end, begin + SCAN * rate); i++) {
      const level = Math.abs(samples[i]);
      if (level > loudest) loudest = level;
    }
    const threshold = loudest * SILENT;
    if (threshold <= 0) return from;
    const window = Math.min(end, begin + TRIM_WINDOW * rate);
    for (let i = begin; i < window; i++)
      if (Math.abs(samples[i]) > threshold)
        return Math.max(from, i / rate - ONSET);
    // Nothing but silence in the whole window, which no pause is long enough
    // to be. Whatever this recording holds, play it from where it was asked.
    return from;
  }

  /**
   * Schedule one pass over `requests`, back to back on the audio clock, and
   * return the time that pass ends. Everything is committed to the clock up
   * front, so linked ayat splice with no event-loop gap between them.
   * A recording that has not been loaded yet is skipped rather than awaited.
   */
  play(requests: readonly PlayRequest[], onFinished: () => void): number {
    const context = this.ensureContext();
    // Whatever is still sounding belongs to a run nobody is listening to any
    // more. Without this, a second play leaves the first batch scheduled with
    // no handle on it, and `stop()` can never silence it.
    this.stop();
    const id = ++this.generation;
    let at = context.currentTime + LEAD;
    const sources: AudioBufferSourceNode[] = [];
    for (const request of requests) {
      const buffer = this.buffers.get(request.url);
      if (!buffer) continue;
      const asked = Math.max(0, Math.min(request.from, buffer.duration));
      const to =
        request.to === null
          ? buffer.duration
          : Math.max(asked, Math.min(request.to, buffer.duration));
      if (to - asked <= 0) continue;
      const from = this.firstSound(buffer, asked, to);
      if (to - from <= 0) continue;
      // Playing a recording is using it, and the cache drops what is unused.
      this.touch(request.url);
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(this.gain!);
      // `duration` counts buffer content, so nothing ever scales it.
      source.start(at, from, to - from);
      source.onended = () => source.disconnect();
      sources.push(source);
      at += to - from;
    }
    this.live = sources;
    const last = sources.at(-1);
    if (!last) {
      // Nothing to schedule. Report it on a later turn, so a caller that is
      // still setting up the run is not called back from inside `play`.
      queueMicrotask(() => {
        if (id === this.generation) onFinished();
      });
      return at;
    }
    last.onended = () => {
      last.disconnect();
      if (id === this.generation) onFinished();
    };
    return at;
  }

  /** Silence everything scheduled and abandon the run in flight. */
  stop() {
    this.generation++;
    for (const source of this.live) {
      source.onended = null;
      try {
        source.stop();
      } catch {
        /* Already finished; nothing to silence. */
      }
      source.disconnect();
    }
    this.live = [];
  }

  async dispose() {
    this.stop();
    this.pinned.clear();
    this.buffers.clear();
    this.used.length = 0;
    const context = this.context;
    this.context = null;
    this.gain = null;
    await context?.close().catch(() => {});
  }
}

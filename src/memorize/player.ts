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

/** Fetch a recording, once more after a moment if the first attempt fails.
    Most failures on a phone are a moment of no signal, not a missing file. */
async function fetchAudio(url: string, signal?: AbortSignal) {
  let last: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt) await new Promise((resolve) => setTimeout(resolve, 600));
    if (signal?.aborted) throw signal.reason;
    const timeout = AbortSignal.timeout?.(TIMEOUT);
    const abort =
      signal && timeout ? AbortSignal.any?.([signal, timeout]) : timeout;
    try {
      const response = await fetch(url, { signal: abort ?? signal });
      if (!response.ok) throw new Error(`audio ${response.status}`);
      return await response.arrayBuffer();
    } catch (error) {
      if (signal?.aborted) throw error;
      last = error;
    }
  }
  throw last;
}

/** Decoded audio is heavy, so the cache is bounded by playing time, not count. */
const CACHE_SECONDS = 420;
/** Scheduling lead, long enough to survive a slow frame before the first clip. */
const LEAD = 0.06;
/** A recording that has not arrived by now is treated as a failure, so a
    stalled connection surfaces as a message rather than an endless wait. */
const TIMEOUT = 20_000;

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
    const request = fetchAudio(url, signal)
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
   * Schedule one pass over `requests`, back to back on the audio clock, and
   * return the time that pass ends. Everything is committed to the clock up
   * front, so linked ayat splice with no event-loop gap between them.
   * A recording that has not been loaded yet is skipped rather than awaited.
   */
  play(requests: readonly PlayRequest[], onFinished: () => void): number {
    const context = this.ensureContext();
    const id = ++this.generation;
    let at = context.currentTime + LEAD;
    const sources: AudioBufferSourceNode[] = [];
    for (const request of requests) {
      const buffer = this.buffers.get(request.url);
      if (!buffer) continue;
      const from = Math.max(0, Math.min(request.from, buffer.duration));
      const to =
        request.to === null
          ? buffer.duration
          : Math.max(from, Math.min(request.to, buffer.duration));
      if (to - from <= 0) continue;
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

  async suspend() {
    this.stop();
    if (this.context?.state === 'running') await this.context.suspend();
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

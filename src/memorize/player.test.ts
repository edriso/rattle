// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ClipPlayer } from './player';

/** Just enough Web Audio to watch what the player schedules and silences. */
class FakeSource {
  buffer: unknown = null;
  onended: (() => void) | null = null;
  started: [number, number, number] | null = null;
  stopped = false;
  connect() {}
  disconnect() {}
  start(when: number, offset: number, duration: number) {
    this.started = [when, offset, duration];
  }
  stop() {
    this.stopped = true;
  }
}

const sources: FakeSource[] = [];
/** Samples per second of fixture. */
const RATE = 100;
/** Seconds of the fixture that hold no sound, as a reciter's pause would. */
let quiet: [number, number] = [0, 0];

class FakeContext {
  state = 'running';
  currentTime = 0;
  destination = {};
  createGain() {
    return { connect: () => {}, gain: { value: 1 } };
  }
  createBufferSource() {
    const source = new FakeSource();
    sources.push(source);
    return source;
  }
  decodeAudioData(bytes: ArrayBuffer) {
    // One byte of fixture stands for one second of recitation, sampled coarsely
    // because all the player looks for in the samples is where sound begins.
    const seconds = bytes.byteLength;
    const samples = new Float32Array(seconds * RATE).fill(0.8);
    for (
      let i = Math.round(quiet[0] * RATE);
      i < Math.min(samples.length, Math.round(quiet[1] * RATE));
      i++
    )
      samples[i] = 0;
    return Promise.resolve({
      duration: seconds,
      sampleRate: RATE,
      length: samples.length,
      getChannelData: () => samples,
    } as unknown as AudioBuffer);
  }
  async resume() {
    this.state = 'running';
  }
  async suspend() {}
  async close() {}
}

const audioOf = (seconds: number) =>
  Promise.resolve({
    ok: true,
    arrayBuffer: async () => new ArrayBuffer(seconds),
  });

beforeEach(() => {
  sources.length = 0;
  quiet = [0, 0];
  vi.stubGlobal('AudioContext', FakeContext);
  vi.stubGlobal(
    'fetch',
    vi.fn(() => audioOf(10)),
  );
});
afterEach(() => vi.unstubAllGlobals());

/* A second run used to leave the first one scheduled with no handle on it, so
   two recitations sounded at once and nothing could silence the older one. */
it('silences the run it replaces, and everything on stop', async () => {
  const player = new ClipPlayer();
  await player.load('/one.mp3');
  await player.load('/two.mp3');
  player.play([{ url: '/one.mp3', from: 0, to: null }], () => {});
  const first = sources.at(-1)!;
  player.play([{ url: '/two.mp3', from: 0, to: null }], () => {});
  expect(first.stopped).toBe(true);
  const second = sources.at(-1)!;
  player.stop();
  expect(second.stopped).toBe(true);
});

it('plays a slice of a recording, bounded by its real length', async () => {
  const player = new ClipPlayer();
  await player.load('/one.mp3');
  player.play([{ url: '/one.mp3', from: 4, to: 99 }], () => {});
  const [, offset, duration] = sources.at(-1)!.started!;
  expect(offset).toBe(4);
  expect(duration).toBe(6);
});

/* A phrase is cut at the moment the reciter finished his word, which is the
   moment before he breathes, so a clip that opens there opens on about a
   second of silence. */
it('opens a clip on its first sound, not on the pause it was cut into', async () => {
  quiet = [4, 5.5];
  const player = new ClipPlayer();
  await player.load('/one.mp3');
  player.play([{ url: '/one.mp3', from: 4.1, to: 8 }], () => {});
  const [, offset, duration] = sources.at(-1)!.started!;
  expect(offset).toBeCloseTo(5.46, 2);
  expect(duration).toBeCloseTo(2.54, 2);
});

/* The silence a recording begins with is the breath between one ayah and the
   next. Trimming that would run them together. */
it('keeps the silence a recording itself begins with', async () => {
  quiet = [0, 1.5];
  const player = new ClipPlayer();
  await player.load('/one.mp3');
  player.play([{ url: '/one.mp3', from: 0, to: null }], () => {});
  const [, offset] = sources.at(-1)!.started!;
  expect(offset).toBe(0);
});

/* The cache is bounded by playing time. It used to age recordings by when
   they were fetched, so the ayah being drilled right now could be dropped
   before one that had not been needed since it arrived. */
it('keeps what is being played over what was merely fetched first', async () => {
  const player = new ClipPlayer();
  vi.stubGlobal(
    'fetch',
    vi.fn(() => audioOf(200)),
  );
  await player.load('/old.mp3');
  await player.load('/idle.mp3');
  player.play([{ url: '/old.mp3', from: 0, to: null }], () => {});
  // Over the cache budget now, so the least recently used one goes.
  await player.load('/new.mp3');
  expect(player.cached('/old.mp3')).toBe(true);
  expect(player.cached('/idle.mp3')).toBe(false);
});

it('holds the run in flight in memory however long the run is', async () => {
  const player = new ClipPlayer();
  vi.stubGlobal(
    'fetch',
    vi.fn(() => audioOf(200)),
  );
  await player.load('/a.mp3');
  await player.load('/b.mp3');
  player.pin(['/a.mp3']);
  await player.load('/c.mp3');
  expect(player.cached('/a.mp3')).toBe(true);
  expect(player.cached('/b.mp3')).toBe(false);
});

/* One host being unreachable used to end a session. The same recitation is
   served from a second address, so a failed fetch falls through to it. */
it("reaches for a mirror when a recording's own host does not answer", async () => {
  const asked: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      asked.push(url);
      return url === '/one.mp3'
        ? Promise.reject(new Error('offline'))
        : audioOf(7);
    }),
  );
  const player = new ClipPlayer((url) =>
    url === '/one.mp3' ? ['/mirror.mp3'] : [],
  );
  await expect(player.load('/one.mp3')).resolves.toBe(7);
  expect(asked).toEqual(['/one.mp3', '/mirror.mp3']);
  // Kept under the address it was asked for, so a mirror never becomes a
  // second cache entry for recitation already in memory.
  expect(player.cached('/one.mp3')).toBe(true);
  expect(player.cached('/mirror.mp3')).toBe(false);
});

it('treats a missing file as a reason to try the next address', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) =>
      url === '/one.mp3'
        ? Promise.resolve({ ok: false, status: 404 })
        : audioOf(3),
    ),
  );
  const player = new ClipPlayer(() => ['/mirror.mp3']);
  await expect(player.load('/one.mp3')).resolves.toBe(3);
});

it('gives up only once every address has been tried twice', async () => {
  const asked: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      asked.push(url);
      return Promise.reject(new Error('offline'));
    }),
  );
  const player = new ClipPlayer(() => ['/mirror.mp3']);
  await expect(player.load('/one.mp3')).rejects.toThrow('offline');
  expect(asked).toEqual(['/one.mp3', '/mirror.mp3', '/one.mp3', '/mirror.mp3']);
});

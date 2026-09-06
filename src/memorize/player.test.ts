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
    // One byte of fixture stands for one second of recitation.
    return Promise.resolve({ duration: bytes.byteLength } as AudioBuffer);
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

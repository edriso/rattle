import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Session, type SessionOptions } from './runtime';
import { buildSegments } from './session';
import { buildSchedule, defaultPlan } from './schedule';
import type { Audio, PlayRequest } from './player';

/** Stand-in for the Web Audio layer: a clock the test moves by hand. */
class FakeAudio implements Audio {
  now = 0;
  unlocked = 0;
  stops = 0;
  readonly runs: PlayRequest[][] = [];
  private finish: (() => void) | null = null;
  failOn: string | null = null;
  seconds = 10;

  pinned: readonly string[] = [];
  running = true;
  /** URLs the layer has thrown away since, as a browser would under memory. */
  evicted = new Set<string>();
  private held = new Set<string>();

  async unlock() {
    this.unlocked++;
    this.running = true;
  }

  cached(url: string) {
    return this.held.has(url) && !this.evicted.has(url);
  }

  pin(urls: readonly string[]) {
    this.pinned = urls;
  }

  /** Every signal a load was handed, so a test can see them abandoned. */
  readonly signals: (AbortSignal | undefined)[] = [];
  /** Every URL a load was asked for, in order, retries included. */
  readonly loads: string[] = [];
  /** Substring of a URL whose loads are abandoned, the way a fetch shared
      with another session is when that session is torn down, and how many of
      them. The prefetch and the run both ask for the first recording, so a
      test that wants the run's own attempt abandoned has to spend two. */
  abandonFirst: string | null = null;
  abandonTimes = 0;

  async load(url: string, signal?: AbortSignal) {
    this.signals.push(signal);
    this.loads.push(url);
    if (
      this.abandonFirst &&
      url.includes(this.abandonFirst) &&
      this.abandonTimes > 0
    ) {
      this.abandonTimes--;
      throw new DOMException('aborted', 'AbortError');
    }
    if (this.failOn && url.includes(this.failOn)) throw new Error('offline');
    this.held.add(url);
    this.evicted.delete(url);
    return this.seconds;
  }

  play(requests: readonly PlayRequest[], onFinished: () => void) {
    this.runs.push([...requests]);
    this.finish = onFinished;
    const length = requests.reduce(
      (n, r) => n + ((r.to ?? this.seconds) - r.from),
      0,
    );
    return this.now + length;
  }

  stop() {
    this.stops++;
    this.finish = null;
  }

  /** Let the run in flight reach its end, advancing the clock with it. */
  complete(elapsed = 0) {
    const done = this.finish;
    this.finish = null;
    this.now += elapsed;
    done?.();
  }
}

const verses = ['ALIF', 'BAA', 'TAA', 'THAA'];
const passage = { surah: 100, from: 1, to: 3 };

function build(overrides: Partial<SessionOptions> = {}) {
  // A one-segment window makes the sliding join visible in the run list.
  const plan = {
    ...defaultPlan,
    linkBack: 1,
    singleReps: 2,
    linkReps: 1,
    reciteReps: 1,
  };
  const segments = buildSegments(passage, verses, 1);
  const steps = buildSchedule(segments.length, plan);
  const audio = new FakeAudio();
  const session = new Session({
    segments,
    steps,
    reciter: 'husary',
    pace: 0.4,
    echo: 'off',
    audio,
    ...overrides,
  });
  return { session, audio, steps };
}

/** Let every queued promise settle without moving the fake timers. */
const settle = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};

const ayah = (request: PlayRequest) => request.url.slice(-10, -4);

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('session runtime', () => {
  it('starts idle with an estimate drawn from the reciter pace', () => {
    const { session } = build();
    expect(session.getSnapshot()).toMatchObject({
      phase: 'idle',
      cursor: { step: 0, rep: 0 },
      loaded: 0,
    });
    expect(session.getSnapshot().remaining).toBeGreaterThan(0);
  });

  it('unlocks audio, loads the first ayah, and plays it', async () => {
    const { session, audio } = build();
    await session.start();
    await settle();
    expect(audio.unlocked).toBe(1);
    // What the run needs is held in memory for as long as the run lasts.
    expect(audio.pinned).toEqual([expect.stringContaining('100001.mp3')]);
    expect(session.getSnapshot().phase).toBe('reciting');
    expect(audio.runs).toHaveLength(1);
    expect(audio.runs[0]).toEqual([
      { url: expect.stringContaining('100001.mp3'), from: 0, to: 10 },
    ]);
  });

  it('starts once however many times it is asked while the audio is locked', async () => {
    const { session, audio } = build();
    // A browser with no gesture yet can leave the unlock pending indefinitely.
    let release!: () => void;
    audio.unlock = () =>
      new Promise<void>((resolve) => {
        audio.unlocked++;
        release = resolve;
      });
    void session.start();
    void session.start();
    void session.start();
    await settle();
    expect(session.getSnapshot().phase).toBe('idle');
    release();
    await settle();
    expect(session.getSnapshot().phase).toBe('reciting');
    expect(audio.runs).toHaveLength(1);
    // And asking again once it is under way changes nothing.
    await session.start();
    await settle();
    expect(audio.runs).toHaveLength(1);
  });

  it('walks the whole drill in order, joining ayat inside a link step', async () => {
    const { session, audio, steps } = build();
    await session.start();
    await settle();
    for (let i = 0; i < 20 && session.getSnapshot().phase !== 'done'; i++) {
      audio.complete(10);
      await vi.advanceTimersByTimeAsync(600);
      await settle();
    }
    expect(session.getSnapshot().phase).toBe('done');
    expect(audio.runs.map((run) => run.map(ayah).join('+'))).toEqual([
      '100001',
      '100001',
      '100002',
      '100002',
      '100001+100002',
      '100003',
      '100003',
      '100002+100003',
      '100001+100002+100003',
    ]);
    // Two repetitions of each solo step, one of every other step.
    expect(steps).toHaveLength(6);
  });

  it('leaves silence proportional to the run when echoing', async () => {
    const { session, audio } = build({ echo: 1 });
    await session.start();
    await settle();
    audio.complete(10);
    await settle();
    expect(session.getSnapshot()).toMatchObject({
      phase: 'echoing',
      echoLength: 10,
    });
    await vi.advanceTimersByTimeAsync(9000);
    expect(session.getSnapshot().phase).toBe('echoing');
    await vi.advanceTimersByTimeAsync(1200);
    await settle();
    expect(session.getSnapshot().phase).toBe('reciting');
    expect(audio.runs).toHaveLength(2);
  });

  /* The screen offers stopping during the learner's own turn now, so the
     clock has to hold there too: the turn is timed, and a paused timer that
     keeps counting is worse than no timer. */
  it('holds the clock when the learner stops during their own turn', async () => {
    const { session, audio } = build({ echo: 1 });
    await session.start();
    await settle();
    audio.complete(10);
    await settle();
    await vi.advanceTimersByTimeAsync(4000);
    const running = session.getSnapshot();
    expect(running.phase).toBe('echoing');
    expect(running.echoLeft).toBeLessThan(running.echoLength);
    session.pause();
    const paused = session.getSnapshot();
    expect(paused.phase).toBe('paused');
    // The ring has nothing to show while nothing is counting.
    expect(paused.echoLeft).toBe(0);
    expect(paused.echoLength).toBe(0);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(session.getSnapshot().remaining).toBe(paused.remaining);
    // And the silence does not quietly run out behind the pause.
    expect(session.getSnapshot().phase).toBe('paused');
    // Coming back plays the run again, which the clock accounts for.
    await session.resume();
    await settle();
    expect(session.getSnapshot().phase).toBe('reciting');
    expect(session.getSnapshot().remaining).toBeGreaterThanOrEqual(
      paused.remaining,
    );
    expect(audio.runs).toHaveLength(2);
  });

  it('changes the echo without costing the learner their place', async () => {
    const { session, audio } = build({ echo: 'off' });
    await session.start();
    await settle();
    audio.complete(10);
    await vi.advanceTimersByTimeAsync(600);
    await settle();
    const before = session.getSnapshot();
    expect(before.cursor).toEqual({ step: 0, rep: 1 });
    session.setEcho(1);
    expect(session.getSnapshot().cursor).toEqual(before.cursor);
    expect(session.getSnapshot().remaining).toBeGreaterThan(before.remaining);
    audio.complete(10);
    await settle();
    expect(session.getSnapshot().phase).toBe('echoing');
  });

  it('waits for the learner when the echo is manual', async () => {
    const { session, audio } = build({ echo: 'manual' });
    await session.start();
    await settle();
    audio.complete(10);
    await settle();
    expect(session.getSnapshot().phase).toBe('waiting');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(session.getSnapshot().phase).toBe('waiting');
    session.continue();
    await settle();
    expect(session.getSnapshot().phase).toBe('reciting');
  });

  it('resumes a paused run where it stopped rather than restarting it', async () => {
    const { session, audio } = build();
    await session.start();
    await settle();
    audio.now += 4;
    session.pause();
    expect(session.getSnapshot().phase).toBe('paused');
    expect(audio.stops).toBeGreaterThan(0);
    await session.resume();
    await settle();
    expect(audio.runs.at(-1)).toEqual([
      { url: expect.stringContaining('100001.mp3'), from: 4, to: 10 },
    ]);
  });

  /* The silence is for reciting the segment back, so it is priced off the run
     and not off the tail a resume replayed. Stopping eight seconds into a ten
     second ayah used to leave two seconds to say the whole of it in, and the
     clock disagreed too: `costSession` has always costed the echo off the
     whole run. */
  it('leaves a whole run of silence after a resumed run, not the tail', async () => {
    const { session, audio } = build({ echo: 1 });
    await session.start();
    await settle();
    audio.now += 8;
    session.pause();
    await session.resume();
    await settle();
    expect(audio.runs.at(-1)).toEqual([
      { url: expect.stringContaining('100001.mp3'), from: 8, to: 10 },
    ]);
    audio.complete(2);
    await settle();
    expect(session.getSnapshot()).toMatchObject({
      phase: 'echoing',
      echoLength: 10,
    });
  });

  /* Swallowing this scheduled into a context that was not running, and the
     tick that noticed set the phase back to «متوقّفة» four times a second:
     a learner pressing play on a browser that will not give it audio got no
     reason and no way out. */
  it('reports a refusal to wake the audio when resuming', async () => {
    const { session, audio } = build();
    await session.start();
    await settle();
    session.pause();
    audio.running = false;
    audio.unlock = () => Promise.reject(new Error('blocked'));
    await session.resume();
    await settle();
    expect(session.getSnapshot().phase).toBe('error');
    expect(session.getSnapshot().error).toContain('تعذّر');
    expect(vi.getTimerCount()).toBe(0);
  });

  /* The clock used to climb back up: a tick subtracted only the audio playing
     at that instant, so the moment a run ended and the silence began it added
     a whole run back on, and pausing put back whatever had been played. */
  it('counts down without ever climbing back up', async () => {
    const { session, audio } = build({ echo: 1 });
    await session.start();
    await settle();
    const seen = [session.getSnapshot().remaining];
    const watch = () => seen.push(session.getSnapshot().remaining);
    audio.now += 4;
    await vi.advanceTimersByTimeAsync(250);
    watch();
    // The run ends and the silence for repeating begins.
    audio.complete(6);
    await settle();
    watch();
    await vi.advanceTimersByTimeAsync(5000);
    watch();
    // The silence runs out and the next repetition starts.
    await vi.advanceTimersByTimeAsync(5200);
    await settle();
    watch();
    audio.now += 3;
    await vi.advanceTimersByTimeAsync(250);
    watch();
    for (let i = 1; i < seen.length; i++)
      expect(seen[i]).toBeLessThanOrEqual(seen[i - 1] + 0.001);
    expect(seen.at(-1)).toBeLessThan(seen[0]);
  });

  it('holds the countdown still while paused', async () => {
    const { session, audio } = build();
    await session.start();
    await settle();
    audio.now += 4;
    await vi.advanceTimersByTimeAsync(250);
    const running = session.getSnapshot().remaining;
    session.pause();
    const paused = session.getSnapshot().remaining;
    expect(paused).toBeLessThanOrEqual(running);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(session.getSnapshot().remaining).toBe(paused);
  });

  it('starts a step chosen while paused from its full length', async () => {
    const { session, audio } = build();
    await session.start();
    await settle();
    audio.now += 6;
    session.pause();
    const paused = session.getSnapshot().remaining;
    session.goTo(1);
    // The new step is not shortened by what the previous one had played.
    expect(session.getSnapshot().remaining).toBeLessThan(paused);
    const chosen = session.getSnapshot().remaining;
    session.setEcho(1);
    session.setEcho('off');
    expect(session.getSnapshot().remaining).toBeCloseTo(chosen, 5);
  });

  /* The pause offset is measured from the start of the run, not of the
     playback: pausing a resumed run used to store only what the second
     playback had covered, and every further pause rewound the recitation. */
  it('resumes further in each time it is paused again', async () => {
    const { session, audio } = build();
    await session.start();
    await settle();
    audio.now += 4;
    session.pause();
    await session.resume();
    await settle();
    expect(audio.runs.at(-1)).toEqual([
      { url: expect.stringContaining('100001.mp3'), from: 4, to: 10 },
    ]);
    audio.now += 3;
    session.pause();
    await session.resume();
    await settle();
    expect(audio.runs.at(-1)).toEqual([
      { url: expect.stringContaining('100001.mp3'), from: 7, to: 10 },
    ]);
  });

  it('restarts the current step before stepping back to the previous one', async () => {
    const { session, audio } = build();
    await session.start();
    await settle();
    audio.complete(10);
    await vi.advanceTimersByTimeAsync(600);
    await settle();
    expect(session.getSnapshot().cursor).toEqual({ step: 0, rep: 1 });
    session.previous();
    await settle();
    expect(session.getSnapshot().cursor).toEqual({ step: 0, rep: 0 });
    session.next();
    await settle();
    expect(session.getSnapshot().cursor).toEqual({ step: 1, rep: 0 });
  });

  it('fetches a recording again once the audio layer has dropped it', async () => {
    const { session, audio } = build();
    await session.start();
    await settle();
    const first = audio.runs[0][0].url;
    audio.evicted.add(first);
    session.goTo(0);
    await settle();
    expect(session.getSnapshot().phase).toBe('reciting');
    expect(audio.cached(first)).toBe(true);
    expect(audio.runs.at(-1)).toEqual([{ url: first, from: 0, to: 10 }]);
  });

  it('shows as paused when the browser suspends the audio under it', async () => {
    const { session, audio } = build();
    await session.start();
    await settle();
    expect(session.getSnapshot().phase).toBe('reciting');
    // A locked phone can suspend the context without telling the page.
    audio.running = false;
    await vi.advanceTimersByTimeAsync(400);
    expect(session.getSnapshot().phase).toBe('paused');
    await session.resume();
    await settle();
    expect(session.getSnapshot().phase).toBe('reciting');
    expect(audio.unlocked).toBe(2);
  });

  it('reports a load failure without leaving the session playing', async () => {
    const { session, audio } = build();
    audio.failOn = '100001';
    await session.start();
    await settle();
    expect(session.getSnapshot().phase).toBe('error');
    expect(session.getSnapshot().error).toContain('تعذّر');
    expect(audio.runs).toHaveLength(0);
    /* And the clock is stopped, as it is on every other way out of a run.
       This was the one path that left it running: an error screen went on
       recosting the whole drill four times a second, publishing nothing, for
       as long as it was open. */
    expect(vi.getTimerCount()).toBe(0);
  });

  it('sharpens the estimate once real lengths are known', async () => {
    const { session, audio } = build();
    const estimated = session.getSnapshot().remaining;
    audio.seconds = 30;
    await session.start();
    await settle();
    await vi.advanceTimersByTimeAsync(300);
    expect(session.getSnapshot().remaining).toBeGreaterThan(estimated);
    expect(session.getSnapshot().loaded).toBeGreaterThan(0);
  });

  it('restarts a run rather than resuming into its last moment', async () => {
    const { session, audio } = build();
    await session.start();
    await settle();
    // Stop with a fraction of a second left: there is nothing left to play.
    audio.now += 9.9;
    session.pause();
    await session.resume();
    await settle();
    expect(audio.runs.at(-1)).toEqual([
      { url: expect.stringContaining('100001.mp3'), from: 0, to: 10 },
    ]);
  });

  it('plays a finished drill again from its first step', async () => {
    const { session, audio } = build();
    await session.start();
    await settle();
    for (let i = 0; i < 20 && session.getSnapshot().phase !== 'done'; i++) {
      audio.complete(10);
      await vi.advanceTimersByTimeAsync(600);
      await settle();
    }
    expect(session.getSnapshot().phase).toBe('done');
    session.goTo(0);
    await settle();
    expect(session.getSnapshot()).toMatchObject({
      phase: 'reciting',
      cursor: { step: 0, rep: 0 },
    });
  });

  it('does not publish a snapshot when a tick changes nothing', async () => {
    const { session, audio } = build();
    const seen = vi.fn();
    session.subscribe(seen);
    await session.start();
    await settle();
    audio.now += 1;
    await vi.advanceTimersByTimeAsync(300);
    const settled = seen.mock.calls.length;
    // The clock keeps running but the numbers stop moving.
    await vi.advanceTimersByTimeAsync(2000);
    expect(seen.mock.calls.length).toBeLessThan(settled + 8);
  });

  /* Two phrases of one ayah are cut at the same moment, so a step that plays
     one after the other is playing a continuous stretch of the recording. Two
     requests would splice them and drop the reciter's pause between them. */
  it('asks for two phrases of one ayah as one continuous stretch', async () => {
    const timings = () => [4];
    const segments = buildSegments(
      { surah: 100, from: 1, to: 1 },
      // Four words either side of the mark: fewer and the two would be folded
      // into one phrase, which is a stub not worth a cycle of its own.
      ['ALIF BAA TAA THAA ۚ JIIM HAA KHAA DAAL'],
      'phrase',
      timings,
    );
    expect(segments).toHaveLength(2);
    const audio = new FakeAudio();
    const session = new Session({
      segments,
      // One step, holding both phrases, which is what a وصل step looks like.
      steps: [{ kind: 'link', from: 0, to: 1, reps: 1 }],
      reciter: 'husary',
      pace: 0.4,
      echo: 'off',
      audio,
    });
    await session.start();
    await settle();
    // One request, from the top of the recording to the end the layer has
    // measured, rather than two meeting at the cut.
    expect(audio.runs.at(-1)).toEqual([
      { url: audio.runs[0][0].url, from: 0, to: audio.seconds },
    ]);
  });

  /* `Audio.load` has always taken a signal and nothing ever passed one, so
     changing the reciter mid-drill left up to four recordings of the voice the
     learner had just moved away from downloading for as long as thirty
     seconds, competing on a phone with the ones the new drill waits on. */
  it('abandons the fetches it started when it is disposed', async () => {
    const { session, audio } = build();
    await session.start();
    await settle();
    expect(audio.signals.length).toBeGreaterThan(0);
    expect(audio.signals.map((s) => s?.aborted)).not.toContain(undefined);
    expect(audio.signals.some((s) => s?.aborted)).toBe(false);
    session.dispose();
    expect(audio.signals.every((s) => s?.aborted)).toBe(true);
  });

  /* The audio layer is shared across drills, so decoded recitation survives a
     rebuild, and it keeps one fetch per recording however many callers want
     it. Changing the joins therefore builds a new session over the same
     recordings while the old one is still fetching them, and disposing the old
     one aborts a fetch the new one is waiting on. That abort is not the new
     session's failure, and it must not become an error screen. */
  it('asks again when a shared fetch is abandoned under it', async () => {
    const { session, audio } = build();
    /* Two, so the run's own attempt is one of them however it races with the
       prefetch, whose failures are swallowed. */
    audio.abandonFirst = '100001';
    audio.abandonTimes = 2;
    await session.start();
    await settle();
    expect(session.getSnapshot().phase).toBe('reciting');
    expect(audio.runs).toHaveLength(1);
  });

  /* And only that: a recording nowhere answers must not be asked for twice as
     long before the message appears. Two callers want the first one, the run
     and the prefetch, so two attempts is the ceiling without a retry. */
  it('does not ask again when a load simply fails', async () => {
    const { session, audio } = build();
    audio.failOn = '100001';
    await session.start();
    await settle();
    expect(session.getSnapshot().phase).toBe('error');
    expect(audio.loads.filter((url) => url.includes('100001'))).toHaveLength(2);
  });

  it('stops the clock and the audio when disposed', async () => {
    const { session, audio } = build();
    await session.start();
    await settle();
    session.dispose();
    session.pause();
    session.goTo(2);
    const before = audio.runs.length;
    audio.complete(10);
    await vi.advanceTimersByTimeAsync(5000);
    await settle();
    expect(audio.runs).toHaveLength(before);
  });
});

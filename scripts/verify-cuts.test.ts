import { describe, expect, it } from 'vitest';
import {
  hearing,
  judge,
  MARGIN,
  MIN_RANGE,
  MIN_SILENCE,
  MIN_YIELD,
  NOISE,
  WINDOW,
} from './verify-cuts.ts';

/* `judge` decides what a recording says about one cut: that it already falls
   in a pause, that it belongs in one nearby, or that there is no pause there
   at all and the text was wrong about the reciter stopping. Everything the app
   plays at phrase level comes out of that decision, so it is tested here the
   way `ayahCuts` is. */

const silence = (from: number, to: number) => ({ from, to });

describe('judging a cut against the silences in a recording', () => {
  it('leaves a cut that already falls inside a pause exactly where it is', () => {
    const verdict = judge(5000, [silence(4800, 6000)]);
    expect(verdict).toEqual({ kind: 'kept', at: 5000 });
  });

  it('moves a cut into the pause it sits just before', () => {
    // The systematic case: 79% of Husary's cuts were early by a median 406ms,
    // because the source they came from records no silence at all.
    const verdict = judge(5000, [silence(5400, 7000)]);
    expect(verdict).toEqual({
      kind: 'moved',
      at: 5400 + MARGIN,
      by: 400 + MARGIN,
    });
  });

  /* The cut is a step into the pause rather than its middle, and this is the
     invariant that keeps that step inside it. Raise `MARGIN` past half of
     `MIN_SILENCE` and the shortest pause that qualifies would take a cut out
     the far side and back into speech. */
  it('cannot step past the end of the shortest pause it will accept', () => {
    expect(MARGIN * 2).toBeLessThanOrEqual(MIN_SILENCE);
    const verdict = judge(5000, [silence(5200, 5200 + MIN_SILENCE)]);
    expect(verdict).toMatchObject({ kind: 'moved', at: 5200 + MARGIN });
    expect(5200 + MARGIN).toBeLessThan(5200 + MIN_SILENCE);
  });

  it('ignores a gap too short to be a place the reciter stopped', () => {
    // A consonant closure or a breath inside a phrase is not a pause.
    expect(judge(5000, [silence(5100, 5100 + MIN_SILENCE - 10)])).toMatchObject(
      {
        kind: 'unfounded',
      },
    );
  });

  it('reports a cut with no pause anywhere near it', () => {
    const verdict = judge(5000, [silence(20000, 22000)]);
    expect(verdict).toMatchObject({ kind: 'unfounded' });
    // And says how far the nearest one was, so the report can tell a near miss
    // from a boundary the reciter simply recites straight through.
    expect(verdict).toMatchObject({ nearest: 15000 });
  });

  it('reports a recording with no pauses at all', () => {
    expect(judge(5000, [])).toEqual({ kind: 'unfounded', nearest: Infinity });
  });

  /* The bug this exists for, and it cost a whole recitation. A cut can arrive
     on either side of its pause: Husary's are a median 406ms early, Abdul
     Basit's mujawwad a median 432ms late. Aiming only at the pause's start
     turned that 432ms correction into a journey of several seconds, the
     window then rejected it, and 95% of that recitation's cuts were reported
     as having no pause at all when every one had one a third of a second
     away. So a late cut steps back from the pause's end. */
  it('moves a late cut back into the end of its pause', () => {
    const verdict = judge(6000, [silence(4000, 5600)]);
    expect(verdict).toEqual({
      kind: 'moved',
      at: 5600 - MARGIN,
      by: -(400 + MARGIN),
    });
  });

  it('corrects a cut by the least it can, from either side', () => {
    // The same pause, a cut either side of it, and both moves are small.
    const pause = silence(10_000, 12_000);
    const early = judge(9800, [pause]);
    const late = judge(12_200, [pause]);
    expect(early).toMatchObject({ by: 200 + MARGIN });
    expect(late).toMatchObject({ by: -(200 + MARGIN) });
    // And each lands inside the pause it was aiming at.
    for (const v of [early, late])
      if (v.kind === 'moved') {
        expect(v.at).toBeGreaterThan(pause.from);
        expect(v.at).toBeLessThan(pause.to);
      }
  });

  it('still refuses to relocate a cut a long way from any pause', () => {
    const cut = 20_000;
    const verdict = judge(cut, [silence(1000, 2000)]);
    expect(verdict.kind).toBe('unfounded');
    // Reported as the gap to the pause's edge: nothing this far out needs the
    // move computing first, so the cheap check answers it.
    expect(verdict).toMatchObject({ nearest: cut - 2000 });
  });

  /* And the guard on the move itself still matters, for the case the edge
     measure lets through: a cut just outside a pause longer than the window,
     where stepping in from the near edge is a short trip and from the far one
     is not. */
  it('bounds the move and not only the gap', () => {
    const cut = 1000;
    const verdict = judge(cut, [
      silence(cut + WINDOW + 1, cut + WINDOW + 5000),
    ]);
    expect(verdict.kind).toBe('unfounded');
  });

  it('takes the nearest pause when several would do', () => {
    const verdict = judge(5000, [
      silence(3000, 3500),
      silence(5300, 6500),
      silence(9000, 9800),
    ]);
    expect(verdict).toMatchObject({ kind: 'moved', at: 5300 + MARGIN });
  });
});

/* Whether a recitation can be measured at all, which is decided before any of
   it is. The figures below are what the script itself reports over 24 ayat
   spread across each mushaf, and the outcome beside each is what a full or
   sampled run actually produced. Held here because `MIN_RANGE` and `NOISE`
   are tuning knobs, and a test that only checked invented numbers would let
   somebody move one and find out from a user which recitations went quiet. */
const MASTERING = [
  // Classic murattal and mujawwad: room to spare, and the gate works.
  { id: 'husary', floor: -58.2, speech: -24.4, measurable: true },
  { id: 'husary-muallim', floor: -64.0, speech: -28.3, measurable: true },
  { id: 'abdulbasit', floor: -68.2, speech: -24.4, measurable: true },
  { id: 'abdulbasit-mujawwad', floor: -73.9, speech: -22.2, measurable: true },
  { id: 'minshawi', floor: -64.9, speech: -21.2, measurable: true },
  { id: 'minshawi-mujawwad', floor: -83.8, speech: -18.3, measurable: true },
  // Modern masters. Every one of these returned no pauses whatever, and
  // shatri two out of ninety-four, which read in the report as reciters who
  // never stop rather than as recordings with no quiet in them.
  { id: 'alafasy', floor: -32.9, speech: -20.6, measurable: false },
  { id: 'shatri', floor: -40.2, speech: -24.6, measurable: false },
  { id: 'shuraim', floor: -30.5, speech: -20.1, measurable: false },
  { id: 'sudais', floor: -31.7, speech: -21.5, measurable: false },
  { id: 'dussary', floor: -28.6, speech: -17.0, measurable: false },
];

/** A level array whose fifth percentile is `floor` and whose median is
    `speech`, which is all `hearing` reads out of one. */
const like = (floor: number, speech: number) =>
  Array.from({ length: 100 }, (_, i) =>
    i < 5 ? -120 : i < 50 ? floor : speech,
  );

describe('whether a level gate can hear a recitation at all', () => {
  it('reads the floor and the speech level out of an envelope', () => {
    const ear = hearing(like(-60, -20));
    expect(ear.floor).toBe(-60);
    expect(ear.speech).toBe(-20);
    expect(ear.range).toBe(40);
  });

  it('takes a frame of digital silence as -120 and not as the floor', () => {
    // -inf would sort nowhere; the fifth percentile is what keeps one frame
    // of it at a file boundary from being mistaken for the room.
    expect(hearing(like(-60, -20)).floor).toBe(-60);
  });

  it.each(MASTERING)(
    'agrees with what $id actually did',
    ({ floor, speech, measurable }) => {
      expect(hearing(like(floor, speech)).measurable).toBe(measurable);
    },
  );

  it('leaves room on both sides of the gap it is drawn across', () => {
    // Nothing measured falls between these two, and `MIN_RANGE` sits in the
    // middle rather than up against either. If a recitation ever lands in
    // between, this is the test that says the constant now needs an argument.
    const works = MASTERING.filter((m) => m.measurable);
    const fails = MASTERING.filter((m) => !m.measurable);
    const worst = Math.min(...works.map((m) => m.speech - m.floor));
    const best = Math.max(...fails.map((m) => m.speech - m.floor));
    expect(best).toBeLessThan(MIN_RANGE);
    expect(worst).toBeGreaterThan(MIN_RANGE);
    expect(MIN_RANGE - best).toBeGreaterThan(5);
    expect(worst - MIN_RANGE).toBeGreaterThan(5);
  });

  it('refuses a recording whose quiet never reaches the gate', () => {
    // The other way it fails, and a different fault: plenty of range, but the
    // floor sits above -40dBFS, so the gate is never crossed.
    const gate = Number.parseFloat(NOISE);
    const ear = hearing(like(gate + 2, gate + 2 + MIN_RANGE * 2));
    expect(ear.range).toBeGreaterThan(MIN_RANGE);
    expect(ear.measurable).toBe(false);
  });

  /** Median absolute move per recitation, from the runs recorded in
      data/README.md, and from 60-ayah samples for Minshawi's two. */
  const OFFSETS = [406, 106, 347, 432, 1002, 1045];

  it('bounds a correction rather than truncating it', () => {
    // A window near a recitation's own median offset is not a bound, it is a
    // clip, and it hides how wrong the constant was instead of measuring it:
    // at 1500 Minshawi's largest move landed exactly on the edge and his
    // median rose the moment it was widened. Twice the largest median any
    // recitation has measured is the margin that keeps the distribution
    // described rather than cut off.
    expect(WINDOW).toBeGreaterThanOrEqual(2 * Math.max(...OFFSETS));
  });

  it('keeps the write floor under every yield a real run has managed', () => {
    // Measured: abdulbasit 59/60, minshawi 49/60, abdulbasit-mujawwad
    // 1284/1489. The collapses it has to catch were 0/60 and 2/60.
    expect(MIN_YIELD).toBeLessThan(49 / 60);
    expect(MIN_YIELD).toBeGreaterThan(2 / 60);
  });
});

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

  /* Where the bound actually falls, which is not where the constant's name
     suggests. `WINDOW` bounds the *move*, and a move is the gap to the pause
     plus the `MARGIN` step into it, so the furthest a pause may sit is
     `WINDOW - MARGIN`. This was two guards, one on each quantity, and the gap
     guard could never refuse anything the move guard would not: it was dead
     as a decision and alive only in the figure it reported. Pinning both
     sides of the edge is what would catch it being split again. */
  it('bounds the move, so a pause may sit at most WINDOW - MARGIN away', () => {
    const reach = WINDOW - MARGIN;
    const at = 10_000;
    const pause = silence(at, at + 3000);

    const justInside = judge(at - reach, [pause]);
    expect(justInside).toMatchObject({ kind: 'moved', by: WINDOW });

    const justOutside = judge(at - reach - 1, [pause]);
    // And it reports the gap it measured, not the gap plus the margin.
    expect(justOutside).toEqual({ kind: 'unfounded', nearest: reach + 1 });

    // The same on the late side, where the step is backwards out of the end.
    expect(judge(pause.to + reach, [pause])).toMatchObject({
      kind: 'moved',
      by: -WINDOW,
    });
    expect(judge(pause.to + reach + 1, [pause])).toEqual({
      kind: 'unfounded',
      nearest: reach + 1,
    });
  });

  /* The property that made recovering the ayat a 1500ms window had dropped a
     safe operation rather than a judgement. Widening the window may admit a
     correction it used to reject, and that is the *only* thing it may do:
     which pause a cut belongs in, where inside it the cut lands, and how far
     the nearest pause was are all read off the recording, so a verdict that
     was accepted comes back byte for byte. Checked against the files as well
     as here: over the four recitations re-measured at 2500, 127 ayat came back
     and not one of the 5,582 already in them lost or altered a cut.

     It only holds because the two window guards were made one. While a guard
     on the gap and a guard on the move both existed, an unfounded verdict in
     the band between them reported a `nearest` 80ms larger at the wider
     window, which is the figure somebody reads to decide whether to widen
     again. So the assertion covers the whole verdict, `nearest` included. */
  it('only ever gains when the window widens', () => {
    // A deterministic walk over layouts rather than the handful that happened
    // to occur to me, because the property has to hold for all of them.
    let seed = 20260909;
    /* `Math.imul` and a mask, not `*` and `%`: the product of two 31-bit
       numbers passes 2^53, so plain multiplication loses exactly the low bits
       the modulus then reads. Written that way this generator could only
       reach 16,471 distinct values before cycling, and `seed % 4` took two of
       them, which is not the walk this comment claims. */
    const random = () => {
      seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff;
      return seed / 0x80000000;
    };
    let admitted = 0;
    let stable = 0;
    for (let trial = 0; trial < 2000; trial++) {
      const pauses: { from: number; to: number }[] = [];
      let at = Math.floor(random() * 500);
      // Drawn once, so the count really is uniform over 1 to 4 rather than
      // re-rolled on every iteration of the condition.
      const count = 1 + Math.floor(random() * 4);
      for (let n = 0; n < count; n++) {
        at += Math.floor(random() * 4000);
        // Some too short to count, so the length filter is exercised too.
        pauses.push({ from: at, to: at + 100 + Math.floor(random() * 900) });
        at = pauses[pauses.length - 1].to;
      }
      const cut = Math.floor(random() * (at + 2000));
      const narrow = judge(cut, pauses, 1500);
      const wide = judge(cut, pauses, WINDOW);
      if (narrow.kind === 'unfounded' && wide.kind !== 'unfounded') {
        admitted++;
      } else {
        // Including unfounded on both sides, where `nearest` has to agree.
        expect(wide).toEqual(narrow);
        stable++;
      }
    }
    // And the trials actually reached both halves of the claim.
    expect(stable).toBeGreaterThan(100);
    expect(admitted).toBeGreaterThan(10);
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

  /** Median absolute move, per recitation, measured over whole mushafs:
      Husary 409ms, his المعلّم 107, Abdul Basit 354, his المجوّد 435. */
  const OFFSETS = [409, 107, 354, 435];

  it('bounds a correction rather than truncating it', () => {
    /* A window near a recitation's own median offset is not a bound, it is a
       clip: it hides how wrong the constant was instead of measuring it. The
       window has to be a multiple of the largest systematic offset measured,
       so what it cuts off is the tail and not the body of the distribution.
       At 2500 the largest single moves come to 2432, 2139, 2444 and 2491, so
       it is still the binding constraint for a few per cent of cuts, which is
       intended: past this a correction is a different boundary, not the same
       one measured. */
    expect(WINDOW).toBeGreaterThanOrEqual(4 * Math.max(...OFFSETS));
  });

  it('keeps the write floor under every yield a real run has managed', () => {
    // Measured: abdulbasit 59/60, minshawi 49/60, abdulbasit-mujawwad
    // 1284/1489. The collapses it has to catch were 0/60 and 2/60.
    expect(MIN_YIELD).toBeLessThan(49 / 60);
    expect(MIN_YIELD).toBeGreaterThan(2 / 60);
  });
});

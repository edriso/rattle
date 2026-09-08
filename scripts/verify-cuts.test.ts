import { describe, expect, it } from 'vitest';
import { judge, MARGIN, MIN_SILENCE, WINDOW } from './verify-cuts.ts';

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

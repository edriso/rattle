import { describe, expect, it } from 'vitest';
import { ayahCuts } from './prepare-timings.ts';

/* The cuts the app plays are only as good as these checks, and every one of
   them exists because trusting the source without it put a cut in the wrong
   place. The source reports each word as [index, from, to] into the whole
   chapter, and the spans touch: a pause lives inside a word rather than
   between two. */
const timing = (
  segments: (number | string)[][],
  { from = 0, to = 10_000 } = {},
) => ({
  verse_key: '2:1',
  timestamp_from: from,
  timestamp_to: to,
  segments,
});

/** Four words a second apart, so word `n` starts at `n - 1` seconds. */
const contiguous = (words: number) =>
  Array.from({ length: words }, (_, i) => [i + 1, i * 1000, (i + 1) * 1000]);

const phrases = (...firstWords: number[]) =>
  firstWords.map((firstWord) => ({ firstWord }));

describe('the cuts inside one ayah', () => {
  it('lands the cut on the next phrase, later than the word the source marks', () => {
    const result = ayahCuts(timing(contiguous(4)), phrases(0, 2), 4);
    // Word 3 is marked at 2,000 ms, and the reciter is still finishing word 2
    // there: the pause begins about 300 ms later.
    expect(result).toEqual({ cuts: [2300] });
  });

  it('drops an ayah whose words the two sources count differently', () => {
    expect(ayahCuts(timing(contiguous(4)), phrases(0, 2), 5)).toEqual({
      dropped: 'mismatch',
    });
  });

  /* A teaching or mujawwad mushaf recites a stretch and then says it again.
     The source files the repeat under the words' original indices, so a word
     before the cut can still be sounding after it, and a clip opening there
     would begin on words belonging to the phrase before it. */
  it('drops an ayah where a repeated stretch runs across the cut', () => {
    const repeated = [
      ...contiguous(4),
      // Words 2 and 3 again, after the whole ayah.
      [2, 4000, 5000],
      [3, 5000, 6000],
    ];
    expect(ayahCuts(timing(repeated), phrases(0, 2), 4)).toEqual({
      dropped: 'repeated',
    });
  });

  it('keeps an ayah whose repeat begins at the cut', () => {
    const repeated = [
      ...contiguous(4),
      // Only words 3 and 4, which belong to the phrase the cut opens.
      [3, 4000, 5000],
      [4, 5000, 6000],
    ];
    // The clip carries the repetition, which is what the reciter did.
    expect(ayahCuts(timing(repeated), phrases(0, 2), 4)).toEqual({
      cuts: [2300],
    });
  });

  it('drops an ayah when a cut would leave nothing after it', () => {
    // The recording ends 2.5 s in, so a cut at 2.3 s leaves 200 ms.
    expect(
      ayahCuts(timing(contiguous(4), { to: 2500 }), phrases(0, 2), 4),
    ).toEqual({ dropped: 'partial' });
  });

  it('drops an ayah the source has no span for one of its phrases', () => {
    // Word 3, which is the word the cut would open on.
    const missing = contiguous(4).filter(([index]) => index !== 3);
    expect(ayahCuts(timing(missing), phrases(0, 2), 4)).toEqual({
      dropped: 'partial',
    });
  });

  /* One unreadable end used to poison the running maximum the repetition check
     is built on, and every word after it passed the check vacuously. */
  it('ignores a span it cannot read rather than trusting the rest', () => {
    const broken = [
      [1, 0, 1000],
      [2, 1000, 'x'],
      [3, 2000, 3000],
      [4, 3000, 4000],
      [2, 4000, 6000],
    ];
    expect(ayahCuts(timing(broken), phrases(0, 2), 4)).toEqual({
      dropped: 'repeated',
    });
  });
});

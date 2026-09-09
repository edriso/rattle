/* Turning a chosen passage into the segments a session drills, and costing the
   drill before a single byte of audio is fetched. */

import { ayatCount } from '../data/arabic';
import { openVerse } from '../data/verse';
import { splitVerse, spokenLetters } from './phrases';
import {
  runsRemaining,
  type Cursor,
  type Segment,
  type Step,
} from './schedule';

/** How much of the passage a single repetition covers. */
export type Grain = 'phrase' | 1 | 2 | 3 | 5;

export const grains: readonly Grain[] = ['phrase', 1, 2, 3, 5];

export const grainLabel = (grain: Grain) =>
  grain === 'phrase' ? 'جملة' : ayatCount(grain).replace(' واحدة', '');

export const isGrain = (value: unknown): value is Grain =>
  grains.includes(value as Grain);

/** One continuous stretch of a single ayah's recording. */
export type Clip = {
  surah: number;
  ayah: number;
  /** Seconds into the ayah's recording, or 0 from its beginning. */
  from: number;
  /** Seconds into the recording, or null to play to the end. */
  to: number | null;
};

export type Passage = {
  surah: number;
  from: number;
  to: number;
};

export type PlayableSegment = Segment & {
  clips: Clip[];
  /** Ayah numbers the segment covers, for labelling and progress. */
  ayahFrom: number;
  ayahTo: number;
};

/**
 * Phrase boundaries inside an ayah, in seconds from the start of its
 * recording. `bounds(surah, ayah)` returns one cut per gap between phrases,
 * or null when this reciter has no timing for that ayah.
 */
export type PhraseBounds = (surah: number, ayah: number) => number[] | null;

const wholeAyah = (surah: number, ayah: number): Clip => ({
  surah,
  ayah,
  from: 0,
  to: null,
});

/**
 * Break a passage into the units a session repeats. `verses` holds the whole
 * surah as stored, so ayah 1 still carries its basmala; it is separated here
 * because the reciter records it apart from the ayah.
 */
export function buildSegments(
  passage: Passage,
  verses: readonly string[],
  grain: Grain,
  bounds?: PhraseBounds,
): PlayableSegment[] {
  const { surah } = passage;
  const from = Math.max(1, passage.from);
  const to = Math.min(verses.length, passage.to);
  const segments: PlayableSegment[] = [];
  if (to < from) return segments;

  if (grain === 'phrase') {
    for (let ayah = from; ayah <= to; ayah++) {
      const { text } = openVerse(surah, ayah, verses[ayah - 1]);
      const phrases = splitVerse(text);
      const cuts = phrases.length > 1 ? bounds?.(surah, ayah) : null;
      // Without usable timings the ayah stays whole rather than being cut
      // blind. Cuts must be one per gap and strictly increasing, or a clip
      // could come out empty and the step would play nothing at all.
      const usable =
        cuts !== null &&
        cuts !== undefined &&
        cuts.length === phrases.length - 1 &&
        cuts.every((cut, i) => cut > (i === 0 ? 0 : cuts[i - 1]));
      if (!usable) {
        segments.push({
          id: `${surah}:${ayah}`,
          surah,
          ayah,
          phrase: null,
          text,
          firstWord: 0,
          words: phrases.reduce((n, p) => n + p.words, 0),
          clips: [wholeAyah(surah, ayah)],
          ayahFrom: ayah,
          ayahTo: ayah,
        });
        continue;
      }
      phrases.forEach((phrase, i) => {
        segments.push({
          id: `${surah}:${ayah}#${i + 1}`,
          surah,
          ayah,
          phrase: i,
          text: phrase.text,
          firstWord: phrase.firstWord,
          words: phrase.words,
          clips: [
            {
              surah,
              ayah,
              from: i === 0 ? 0 : cuts![i - 1],
              to: i === phrases.length - 1 ? null : cuts![i],
            },
          ],
          ayahFrom: ayah,
          ayahTo: ayah,
        });
      });
    }
    return segments;
  }

  for (let ayah = from; ayah <= to; ayah += grain) {
    const last = Math.min(to, ayah + grain - 1);
    const clips: Clip[] = [];
    const parts: string[] = [];
    let words = 0;
    for (let n = ayah; n <= last; n++) {
      const { text } = openVerse(surah, n, verses[n - 1]);
      parts.push(text);
      words += splitVerse(text).reduce((total, p) => total + p.words, 0);
      clips.push(wholeAyah(surah, n));
    }
    segments.push({
      id: ayah === last ? `${surah}:${ayah}` : `${surah}:${ayah}-${last}`,
      surah,
      ayah,
      phrase: null,
      text: parts.join(' '),
      firstWord: 0,
      words,
      clips,
      ayahFrom: ayah,
      ayahTo: last,
    });
  }
  return segments;
}

/**
 * The silence left after each pass for the learner to recite it back, as a
 * multiple of the pass itself. `off` is the other way of using the app: the
 * recitation repeats and the learner only listens.
 */
export type EchoMode = 'off' | 'manual' | 0.5 | 1 | 1.5 | 2;

export const echoModes: readonly EchoMode[] = ['off', 0.5, 1, 1.5, 2, 'manual'];

export const echoLabel = (echo: EchoMode) =>
  echo === 'off'
    ? 'أستمع فقط'
    : echo === 'manual'
      ? 'أنا أتحكّم'
      : echo === 0.5
        ? 'نصف المقطع'
        : echo === 1
          ? 'بقدر المقطع'
          : echo === 1.5
            ? 'مرة ونصف'
            : 'ضعف المقطع';

export const isEcho = (value: unknown): value is EchoMode =>
  echoModes.includes(value as EchoMode);

export type SessionPlanCost = {
  /** Recitation only, in seconds. */
  listening: number;
  /** Silence left for the learner to repeat, in seconds. */
  echo: number;
  total: number;
};

/**
 * Cost a drill. `seconds(index)` gives a segment's known length; anything it
 * cannot answer falls back to the reciter's measured pace, so an estimate
 * exists before the first byte arrives and sharpens as audio loads. Passing a
 * cursor costs only what is left, which is what the countdown shows.
 */
export function costSession(
  steps: readonly Step[],
  seconds: (index: number) => number,
  echo: EchoMode,
  cursor?: Cursor,
): SessionPlanCost {
  const runs = cursor
    ? runsRemaining(steps, cursor)
    : steps.map((step) => ({ step, reps: step.reps }));
  let listening = 0;
  let echoTime = 0;
  for (const { step, reps } of runs) {
    let run = 0;
    for (let i = step.from; i <= step.to; i++) run += seconds(i);
    listening += run * reps;
    if (typeof echo === 'number' && echo > 0) echoTime += run * echo * reps;
  }
  return { listening, echo: echoTime, total: listening + echoTime };
}

/** A segment's length before any of its audio has been measured. */
export const paceEstimate = (segment: PlayableSegment, pace: number) =>
  spokenLetters(segment.text) * pace;

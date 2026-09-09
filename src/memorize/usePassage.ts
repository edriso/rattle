/* Everything a passage needs before it can be drilled: its text, the reciter's
   phrase boundaries, the segments those two produce, and the schedule over
   them. Text and boundaries are both vendored, so this resolves from local
   assets and works with no network. */

import { useEffect, useState } from 'react';
import { cutsPhrases } from '../data/audio';
import { cachedSurah, loadSurah } from '../data/text';
import {
  cachedTimings,
  loadTimings,
  type ReciterTimings,
} from '../data/timings';
import {
  buildSegments,
  costSession,
  paceEstimate,
  type EchoMode,
  type Grain,
  type PlayableSegment,
} from './session';
import {
  buildSchedule,
  totalPlays,
  type SchedulePlan,
  type Step,
} from './schedule';

/** What a drill is made of. Nothing in here depends on the echo. */
export type Passage = {
  segments: readonly PlayableSegment[];
  steps: readonly Step[];
};

export type PreparedPassage = Passage & {
  /** Estimated seconds for the whole drill, from the reciter's pace. */
  seconds: number;
  /** How many times a segment is played across the drill. */
  plays: number;
};

type Loaded = {
  surah: number;
  verses: readonly string[];
  reciter: string;
  timings: ReciterTimings | null;
};

/**
 * The segments and the schedule over them. A running session is built from
 * this and told the echo separately, so changing the silence mid-drill adjusts
 * it in place instead of throwing the learner back to the first step.
 */
export function buildPassage(
  loaded: Loaded,
  from: number,
  to: number,
  grain: Grain,
  plan: SchedulePlan,
): Passage {
  const segments = buildSegments(
    { surah: loaded.surah, from, to },
    loaded.verses,
    grain,
    loaded.timings ?? undefined,
  );
  return { segments, steps: buildSchedule(segments.length, plan) };
}

/** The same, costed: what the start screen shows before a drill begins. */
export function preparePassage(
  loaded: Loaded,
  from: number,
  to: number,
  grain: Grain,
  plan: SchedulePlan,
  echo: EchoMode,
  pace: number,
): PreparedPassage {
  const { segments, steps } = buildPassage(loaded, from, to, grain, plan);
  // One pass over the segments, not one per index of every step: a link step
  // that reaches back over the whole passage asks for each of them again.
  const estimates = segments.map((segment) => paceEstimate(segment, pace));
  const seconds = costSession(
    steps,
    (index) => estimates[index] ?? 0,
    echo,
  ).total;
  return { segments, steps, seconds, plays: totalPlays(steps) };
}

/**
 * Load a surah and, for phrase-level drilling, the reciter's boundaries.
 * Both come from vendored assets, so this resolves offline after first load.
 */
export function usePassageSource(surah: number, reciter: string, grain: Grain) {
  /* A mushaf nobody has published word timings for is drilled by the ayah, so
     nothing waits on a file that does not exist. `buildSegments` keeps an ayah
     whole when it has no boundaries, which is the same answer. */
  const needsTimings = grain === 'phrase' && cutsPhrases(reciter);
  const [result, setResult] = useState<{
    surah: number;
    reciter: string;
    loaded?: Loaded;
    error?: true;
  }>({ surah, reciter });
  const [attempt, setAttempt] = useState(0);
  const current =
    result.surah === surah && (!needsTimings || result.reciter === reciter)
      ? result
      : undefined;
  const loaded =
    current?.loaded &&
    current.loaded.surah === surah &&
    (!needsTimings || current.loaded.timings !== null)
      ? current.loaded
      : null;

  useEffect(() => {
    if (loaded) return;
    let active = true;
    const verses = cachedSurah(surah)
      ? Promise.resolve(cachedSurah(surah)!)
      : loadSurah(surah);
    const bounds = !needsTimings
      ? Promise.resolve(null)
      : cachedTimings(reciter)
        ? Promise.resolve(cachedTimings(reciter)!)
        : loadTimings(reciter);
    void Promise.all([verses, bounds]).then(
      ([text, timings]) => {
        if (active)
          setResult({
            surah,
            reciter,
            loaded: { surah, verses: text, reciter, timings },
          });
      },
      () => {
        if (active) setResult({ surah, reciter, error: true });
      },
    );
    return () => {
      active = false;
    };
  }, [surah, reciter, needsTimings, attempt, loaded]);

  return {
    loaded,
    failed: current?.error === true,
    retry: () => setAttempt((n) => n + 1),
  };
}

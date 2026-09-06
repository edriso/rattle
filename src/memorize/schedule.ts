/* The cross-cumulative repetition plan ("التكرار الدائري المتقاطع"): every new
   segment is drilled alone, then immediately joined to the ones before it, so
   the joins are rehearsed as deliberately as the segments themselves. */

export type Segment = {
  /** Stable id, `surah:ayah` for a verse and `surah:ayah#n` for a phrase. */
  id: string;
  surah: number;
  ayah: number;
  /** Position of the phrase inside its verse, or null for a whole verse. */
  phrase: number | null;
  text: string;
  /** Word offset of the segment inside its verse. */
  firstWord: number;
  words: number;
};

export type StepKind = 'single' | 'link' | 'recite';

export type Step = {
  kind: StepKind;
  /** First segment of the step, as an index into the session's segments. */
  from: number;
  /** Last segment of the step, inclusive. */
  to: number;
  /** How many times the run is played before the step is finished. */
  reps: number;
};

export type SchedulePlan = {
  /** Number of previous segments joined to each new one; 0 joins them all. */
  linkBack: number;
  singleReps: number;
  linkReps: number;
  reciteReps: number;
};

export const defaultPlan: SchedulePlan = {
  linkBack: 2,
  singleReps: 3,
  linkReps: 2,
  reciteReps: 2,
};

const bounded = (value: unknown, min: number, max: number, fallback: number) =>
  Number.isInteger(value) &&
  (value as number) >= min &&
  (value as number) <= max
    ? (value as number)
    : fallback;

/** Coerce a stored or user-supplied plan back into the supported range. */
export function restorePlan(value: unknown): SchedulePlan {
  if (!value || typeof value !== 'object') return defaultPlan;
  const p = value as Partial<SchedulePlan>;
  return {
    linkBack: bounded(p.linkBack, 0, 5, defaultPlan.linkBack),
    singleReps: bounded(p.singleReps, 0, 10, defaultPlan.singleReps),
    linkReps: bounded(p.linkReps, 0, 10, defaultPlan.linkReps),
    reciteReps: bounded(p.reciteReps, 0, 10, defaultPlan.reciteReps),
  };
}

/**
 * Build the ordered drill for `count` segments: each segment alone, then the
 * join that carries it back into what came before, then one closing recital.
 */
export function buildSchedule(count: number, plan: SchedulePlan): Step[] {
  const steps: Step[] = [];
  if (count < 1) return steps;
  for (let i = 0; i < count; i++) {
    if (plan.singleReps > 0)
      steps.push({ kind: 'single', from: i, to: i, reps: plan.singleReps });
    if (i === 0 || plan.linkReps < 1) continue;
    const from = plan.linkBack === 0 ? 0 : Math.max(0, i - plan.linkBack);
    steps.push({ kind: 'link', from, to: i, reps: plan.linkReps });
  }
  if (plan.reciteReps > 0 && count > 1)
    steps.push({
      kind: 'recite',
      from: 0,
      to: count - 1,
      reps: plan.reciteReps,
    });
  // A plan with every count at zero would leave nothing to do.
  if (!steps.length)
    steps.push({ kind: 'recite', from: 0, to: count - 1, reps: 1 });
  return steps;
}

/** Total number of segment playbacks in the plan, for effort estimates. */
export function totalPlays(steps: readonly Step[]): number {
  return steps.reduce((n, s) => n + (s.to - s.from + 1) * s.reps, 0);
}

/** Where a session has got to: which step, and which repetition of it. */
export type Cursor = { step: number; rep: number };

export const startCursor: Cursor = { step: 0, rep: 0 };

/** The position after the run in flight, or null once the drill is over. */
export function nextCursor(
  steps: readonly Step[],
  cursor: Cursor,
): Cursor | null {
  const step = steps[cursor.step];
  if (!step) return null;
  if (cursor.rep + 1 < step.reps)
    return { step: cursor.step, rep: cursor.rep + 1 };
  return cursor.step + 1 < steps.length
    ? { step: cursor.step + 1, rep: 0 }
    : null;
}

/** Runs still to play, counting the one in flight, so a countdown can start. */
export function runsRemaining(
  steps: readonly Step[],
  cursor: Cursor,
): { step: Step; reps: number }[] {
  const remaining: { step: Step; reps: number }[] = [];
  for (let i = cursor.step; i < steps.length; i++) {
    const reps = i === cursor.step ? steps[i].reps - cursor.rep : steps[i].reps;
    if (reps > 0) remaining.push({ step: steps[i], reps });
  }
  return remaining;
}

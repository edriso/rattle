/* Scheduling a memorised passage for review.

   The interval ladder is an SM-2 derivative with two changes the domain
   demands. Intervals are capped, because a hifz syllabus is built around every
   passage recurring within about five weeks rather than drifting into months
   the way a general flashcard deck may; the Turkish Diyanet curriculum fixes
   that recurrence at 35 days and treats it as the binding constraint. And the
   easiness factor is clamped on both the success and the failure path, without
   which repeated "hard" grades drive it below 1 and collapse the interval to
   nothing.

   Passages, unlike flashcards, are ordered and overlapping: the cue for one
   ayah is the ayah before it. So a passage that swallows an older one replaces
   it rather than sitting alongside it. */

import { surahs } from '../data/quran';

/** How the learner recited the passage back, worst to best. */
export type Grade = 'again' | 'hard' | 'good' | 'strong';

export const grades: readonly Grade[] = ['again', 'hard', 'good', 'strong'];

export const gradeLabel: Record<Grade, string> = {
  again: 'أعِدها',
  hard: 'بصعوبة',
  good: 'جيد',
  strong: 'متقن',
};

export const gradeHint: Record<Grade, string> = {
  again: 'تعثّرت كثيرًا',
  hard: 'تذكّرت بعد جهد',
  good: 'سرد سليم مع هفوة',
  strong: 'سرد متصل بلا تردّد',
};

/** Days between reviews for the first successful recitals, then the factor. */
const LADDER = [1, 3, 7, 14];
/** No passage may go longer than five weeks without being heard again. */
export const MAX_INTERVAL = 35;
const MIN_EASE = 1.3;
const MAX_EASE = 2.6;
const START_EASE = 2.5;

export type ReviewItem = {
  /** `surah:from-to`, unique per passage. */
  id: string;
  surah: number;
  from: number;
  to: number;
  /** Consecutive successful recitals; a lapse sends it back to zero. */
  reps: number;
  ease: number;
  interval: number;
  /** Local calendar dates, `YYYY-MM-DD`. */
  due: string;
  last: string;
  lapses: number;
};

export const passageId = (surah: number, from: number, to: number) =>
  `${surah}:${from}-${to}`;

/** Local calendar day, so a review never shifts across a timezone boundary. */
export function today(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const DAY = 86_400_000;

/* Days are added to the calendar date, not to a count of milliseconds. Adding
   24 hours across the end of summer time lands at 23:00 the day before, which
   would make a passage due a day early — or, at the ceiling, come back in 34
   days instead of 35. */
const addDays = (date: string, days: number) => {
  const [y, m, d] = date.split('-').map(Number);
  return today(new Date(y, m - 1, d + days));
};

/** Whole days from `date` until `to`, negative once it is overdue. */
export function daysUntil(date: string, to: string = today()): number {
  const at = (value: string) => {
    const [y, m, d] = value.split('-').map(Number);
    return new Date(y, m - 1, d).getTime();
  };
  return Math.round((at(date) - at(to)) / DAY);
}

const clamp = (value: number, low: number, high: number) =>
  Math.min(high, Math.max(low, value));

/** SM-2's easiness update, on the 0-5 quality scale it was written for. */
const nextEase = (ease: number, quality: number) =>
  clamp(
    ease + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)),
    MIN_EASE,
    MAX_EASE,
  );

const QUALITY: Record<Grade, number> = {
  again: 1,
  hard: 3,
  good: 4,
  strong: 5,
};

/** Advance one passage's schedule after it has been recited and graded. */
export function schedule(
  previous: ReviewItem | null,
  passage: { surah: number; from: number; to: number },
  grade: Grade,
  on: string = today(),
): ReviewItem {
  const base: ReviewItem = previous ?? {
    id: passageId(passage.surah, passage.from, passage.to),
    surah: passage.surah,
    from: passage.from,
    to: passage.to,
    reps: 0,
    ease: START_EASE,
    interval: 0,
    due: on,
    last: on,
    lapses: 0,
  };
  const quality = QUALITY[grade];
  if (quality < 3) {
    const ease = clamp(base.ease - 0.2, MIN_EASE, MAX_EASE);
    return {
      ...base,
      reps: 0,
      ease,
      interval: 1,
      last: on,
      due: addDays(on, 1),
      lapses: base.lapses + 1,
    };
  }
  const interval = clamp(
    base.reps < LADDER.length
      ? LADDER[base.reps]
      : Math.round(base.interval * base.ease),
    1,
    MAX_INTERVAL,
  );
  return {
    ...base,
    reps: base.reps + 1,
    ease: nextEase(base.ease, quality),
    interval,
    last: on,
    due: addDays(on, interval),
  };
}

/**
 * Fold a freshly recited passage into the plan. Passages that overlap are one
 * passage, so they are merged into the range they cover between them: without
 * that, drifting a range by an ayah or two over several days quietly builds a
 * pile of entries that all claim the same lines. The merged entry starts from
 * the least established of the ones it replaces, so widening a passage never
 * inherits a strength the new ayat have not earned.
 */
export function record(
  items: readonly ReviewItem[],
  passage: { surah: number; from: number; to: number },
  grade: Grade,
  on: string = today(),
): ReviewItem[] {
  const overlapping = items.filter(
    (item) =>
      item.surah === passage.surah &&
      item.from <= passage.to &&
      item.to >= passage.from,
  );
  const target = {
    surah: passage.surah,
    from: Math.min(passage.from, ...overlapping.map((i) => i.from)),
    to: Math.max(passage.to, ...overlapping.map((i) => i.to)),
  };
  const weakest = overlapping.reduce<ReviewItem | null>(
    (least, item) =>
      !least ||
      item.reps < least.reps ||
      (item.reps === least.reps && item.ease < least.ease)
        ? item
        : least,
    null,
  );
  const id = passageId(target.surah, target.from, target.to);
  const previous = weakest
    ? { ...weakest, id, from: target.from, to: target.to }
    : null;
  const updated = schedule(previous, target, grade, on);
  const kept = items.filter((item) => !overlapping.includes(item));
  return [...kept, updated].sort(
    (a, b) => a.surah - b.surah || a.from - b.from,
  );
}

/** Everything due on or before `on`, most overdue first. */
export function due(
  items: readonly ReviewItem[],
  on: string = today(),
): ReviewItem[] {
  return items
    .filter((item) => item.due <= on)
    .sort(
      (a, b) =>
        a.due.localeCompare(b.due) || a.surah - b.surah || a.from - b.from,
    );
}

const isDate = (value: unknown): value is string =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);

/** Drop anything a corrupted or hand-edited store may have left behind. */
export function restoreReview(value: unknown): ReviewItem[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const items: ReviewItem[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue;
    const item = entry as Partial<ReviewItem>;
    const { surah, from, to } = item;
    const count = Number.isInteger(surah)
      ? surahs[surah! - 1]?.count
      : undefined;
    if (
      count === undefined ||
      !Number.isInteger(from) ||
      !Number.isInteger(to) ||
      from! < 1 ||
      to! < from! ||
      // A range past the end of the surah would swallow every later passage
      // through the overlap merge, so it is dropped rather than trimmed.
      to! > count ||
      !isDate(item.due) ||
      !isDate(item.last)
    )
      continue;
    const id = passageId(surah!, from!, to!);
    if (seen.has(id)) continue;
    seen.add(id);
    items.push({
      id,
      surah: surah!,
      from: from!,
      to: to!,
      reps: Number.isInteger(item.reps) ? Math.max(0, item.reps!) : 0,
      ease: Number.isFinite(item.ease)
        ? clamp(item.ease!, MIN_EASE, MAX_EASE)
        : START_EASE,
      interval: Number.isInteger(item.interval)
        ? clamp(item.interval!, 1, MAX_INTERVAL)
        : 1,
      due: item.due,
      last: item.last,
      lapses: Number.isInteger(item.lapses) ? Math.max(0, item.lapses!) : 0,
    });
  }
  return items.sort((a, b) => a.surah - b.surah || a.from - b.from);
}

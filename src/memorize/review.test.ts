import { describe, expect, it } from 'vitest';
import {
  daysUntil,
  due,
  MAX_INTERVAL,
  record,
  restoreReview,
  schedule,
  type Grade,
  type ReviewItem,
} from './review';

const passage = { surah: 2, from: 1, to: 5 };
const on = '2026-03-01';

/** Recite the passage repeatedly at the same grade and report the intervals. */
const ladder = (grade: Grade, times: number) => {
  let item: ReviewItem | null = null;
  const intervals: number[] = [];
  let day = on;
  for (let i = 0; i < times; i++) {
    item = schedule(item, passage, grade, day);
    intervals.push(item.interval);
    day = item.due;
  }
  return { intervals, item: item! };
};

describe('review scheduling', () => {
  it('spaces the first recitals on a fixed ladder', () => {
    expect(ladder('good', 4).intervals).toEqual([1, 3, 7, 14]);
  });

  it('never lets a passage go longer than five weeks unheard', () => {
    const { intervals } = ladder('strong', 12);
    expect(Math.max(...intervals)).toBe(MAX_INTERVAL);
    expect(intervals.at(-1)).toBe(MAX_INTERVAL);
  });

  it('keeps the interval growing however often a passage is found hard', () => {
    // An unclamped easiness factor is what collapses an interval to zero.
    const { intervals, item } = ladder('hard', 20);
    expect(item.ease).toBeGreaterThanOrEqual(1.3);
    expect(Math.min(...intervals)).toBeGreaterThanOrEqual(1);
    expect(intervals.at(-1)).toBeGreaterThan(1);
  });

  it('sends a forgotten passage back to tomorrow and counts the lapse', () => {
    const learned = ladder('good', 4).item;
    const lapsed = schedule(learned, passage, 'again', '2026-04-01');
    expect(lapsed).toMatchObject({
      reps: 0,
      interval: 1,
      lapses: 1,
      due: '2026-04-02',
    });
    expect(lapsed.ease).toBeLessThan(learned.ease);
    expect(lapsed.ease).toBeGreaterThanOrEqual(1.3);
  });

  it('counts days to a review across a month boundary', () => {
    expect(daysUntil('2026-03-03', '2026-02-28')).toBe(3);
    expect(daysUntil('2026-02-27', '2026-03-01')).toBe(-2);
  });
});

describe('the review plan', () => {
  it('replaces the passages a wider recital has swallowed', () => {
    let items = record([], { surah: 2, from: 1, to: 5 }, 'good', on);
    items = record(items, { surah: 2, from: 6, to: 10 }, 'good', on);
    items = record(items, { surah: 3, from: 1, to: 4 }, 'good', on);
    expect(items.map((i) => i.id)).toEqual(['2:1-5', '2:6-10', '3:1-4']);
    items = record(items, { surah: 2, from: 1, to: 10 }, 'good', on);
    expect(items.map((i) => i.id)).toEqual(['2:1-10', '3:1-4']);
  });

  it('advances the passage a shorter recital sits inside', () => {
    let items = record([], { surah: 2, from: 1, to: 10 }, 'good', on);
    items = record(items, { surah: 2, from: 3, to: 4 }, 'good', '2026-03-02');
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ id: '2:1-10', reps: 2, interval: 3 });
  });

  it('merges a passage that only half overlaps, and keeps neighbours apart', () => {
    let items = record([], { surah: 2, from: 5, to: 10 }, 'strong', on);
    items = record(items, { surah: 2, from: 8, to: 15 }, 'good', '2026-03-05');
    expect(items.map((i) => i.id)).toEqual(['2:5-15']);
    // Ayat 11 to 15 are new, so the merged passage cannot keep the standing it
    // earned over 5 to 10; it restarts at the foot of the ladder.
    expect(items[0]).toMatchObject({ reps: 2, interval: 3 });
    // Ranges that merely sit next to each other stay two passages.
    items = record(items, { surah: 2, from: 16, to: 20 }, 'good', '2026-03-05');
    expect(items.map((i) => i.id)).toEqual(['2:5-15', '2:16-20']);
  });

  it('lists what is due, most overdue first, and hides what is not', () => {
    const items = restoreReview([
      { surah: 2, from: 1, to: 5, due: '2026-03-04', last: on },
      { surah: 4, from: 1, to: 3, due: '2026-02-20', last: on },
      { surah: 3, from: 1, to: 3, due: '2026-03-01', last: on },
    ]);
    expect(due(items, on).map((i) => i.id)).toEqual(['4:1-3', '3:1-3']);
  });

  it('discards entries a corrupted store may hold', () => {
    expect(
      restoreReview([
        null,
        { surah: 0, from: 1, to: 2, due: on, last: on },
        { surah: 2, from: 5, to: 1, due: on, last: on },
        { surah: 2, from: 1, to: 5, due: 'soon', last: on },
        {
          surah: 2,
          from: 1,
          to: 5,
          due: on,
          last: on,
          ease: 99,
          interval: 900,
        },
        { surah: 2, from: 1, to: 5, due: on, last: on },
      ]),
    ).toEqual([
      {
        id: '2:1-5',
        surah: 2,
        from: 1,
        to: 5,
        reps: 0,
        ease: 2.6,
        interval: MAX_INTERVAL,
        due: on,
        last: on,
        lapses: 0,
      },
    ]);
    expect(restoreReview('nonsense')).toEqual([]);
  });
});

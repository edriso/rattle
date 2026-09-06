import { describe, expect, it } from 'vitest';
import {
  buildSchedule,
  defaultPlan,
  restorePlan,
  totalPlays,
  type SchedulePlan,
} from './schedule';

const shape = (plan: Partial<SchedulePlan>, count: number) =>
  buildSchedule(count, { ...defaultPlan, ...plan }).map(
    (s) => `${s.kind}:${s.from}-${s.to}x${s.reps}`,
  );

describe('cumulative repetition schedule', () => {
  it('drills each segment alone, then joins it to what came before', () => {
    expect(
      shape({ linkBack: 1, singleReps: 5, linkReps: 5, reciteReps: 0 }, 3),
    ).toEqual([
      'single:0-0x5',
      'single:1-1x5',
      'link:0-1x5',
      'single:2-2x5',
      'link:1-2x5',
    ]);
  });

  it('joins every earlier segment when the window is open', () => {
    expect(shape({ linkBack: 0, reciteReps: 0 }, 4)).toEqual([
      'single:0-0x3',
      'single:1-1x3',
      'link:0-1x2',
      'single:2-2x3',
      'link:0-2x2',
      'single:3-3x3',
      'link:0-3x2',
    ]);
  });

  it('closes with a recital of the whole passage', () => {
    expect(shape({}, 3).at(-1)).toBe('recite:0-2x2');
  });

  it('leaves out the recital when there is a single segment', () => {
    expect(shape({}, 1)).toEqual(['single:0-0x3']);
  });

  it('still yields one pass when every count is set to zero', () => {
    const empty = { linkBack: 2, singleReps: 0, linkReps: 0, reciteReps: 0 };
    expect(shape(empty, 3)).toEqual(['recite:0-2x1']);
    expect(buildSchedule(0, defaultPlan)).toEqual([]);
  });

  it('counts every playback so effort can be shown before starting', () => {
    // 3 singles each, 2 joins of 3 segments, one recital of 4, twice over.
    expect(totalPlays(buildSchedule(4, defaultPlan))).toBe(
      4 * 3 + (2 + 3 + 3) * 2 + 4 * 2,
    );
  });

  it('grows with the square of the passage when the window is open', () => {
    const open = { ...defaultPlan, linkBack: 0 };
    const cost = (count: number) =>
      totalPlays(buildSchedule(count, open)) /
      totalPlays(buildSchedule(count, defaultPlan));
    // The open window is what makes a long passage punishing, so the sliding
    // window has to stay the default and the gap has to widen with length.
    expect(cost(10)).toBeGreaterThan(1.5);
    expect(cost(40)).toBeGreaterThan(2 * cost(10));
  });

  it('rejects a stored plan that is out of range', () => {
    expect(restorePlan(null)).toEqual(defaultPlan);
    expect(
      restorePlan({ linkBack: 99, singleReps: -1, reciteReps: 4 }),
    ).toEqual({ ...defaultPlan, reciteReps: 4 });
  });
});

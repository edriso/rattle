import { describe, expect, it } from 'vitest';
import {
  buildSegments,
  costSession,
  grainLabel,
  paceEstimate,
} from './session';
import { buildSchedule, defaultPlan } from './schedule';
import { splitVerse } from './phrases';

const surahs = import.meta.glob<{ verses: string[] }>('../data/surahs/*.json', {
  import: 'default',
  eager: true,
});
const baqarah = surahs['../data/surahs/2.json'].verses;
/** The committed boundaries for al-Husary, in seconds. */
const kursi = [8.97, 15.12, 20.76, 29.9, 35.76, 44.92];

describe('building the segments a session drills', () => {
  it('makes one segment per ayah, played whole', () => {
    const segments = buildSegments({ surah: 2, from: 2, to: 4 }, baqarah, 1);
    expect(segments.map((s) => s.id)).toEqual(['2:2', '2:3', '2:4']);
    expect(segments[0].clips).toEqual([
      { surah: 2, ayah: 2, from: 0, to: null },
    ]);
  });

  it('groups ayat into blocks and keeps one clip per ayah', () => {
    const segments = buildSegments({ surah: 2, from: 1, to: 5 }, baqarah, 2);
    expect(segments.map((s) => s.id)).toEqual(['2:1-2', '2:3-4', '2:5']);
    expect(segments[0].clips.map((c) => c.ayah)).toEqual([1, 2]);
    expect(segments[0].ayahFrom).toBe(1);
    expect(segments[0].ayahTo).toBe(2);
  });

  it('strips the basmala off ayah one, which the reciter records apart', () => {
    const [first] = buildSegments({ surah: 2, from: 1, to: 1 }, baqarah, 1);
    expect(first.text).toBe('الٓمٓ');
  });

  it('cuts a long ayah at the reciter’s own pauses', () => {
    const bounds = (surah: number, ayah: number) =>
      surah === 2 && ayah === 255 ? kursi : null;
    const segments = buildSegments(
      { surah: 2, from: 255, to: 255 },
      baqarah,
      'phrase',
      bounds,
    );
    expect(segments).toHaveLength(kursi.length + 1);
    expect(segments.map((s) => s.id)).toEqual([
      '2:255#1',
      '2:255#2',
      '2:255#3',
      '2:255#4',
      '2:255#5',
      '2:255#6',
      '2:255#7',
    ]);
    // Every phrase runs from the previous cut to the next, so nothing is lost
    // between them and no word can be clipped off an end.
    expect(segments.map((s) => s.clips[0].from)).toEqual([0, ...kursi]);
    expect(segments.map((s) => s.clips[0].to)).toEqual([...kursi, null]);
    expect(segments.map((s) => s.text).join(' ')).toBe(baqarah[254]);
  });

  it('keeps a long ayah whole rather than cutting it blind', () => {
    for (const bounds of [
      () => null,
      // A count that does not match the phrases is a data mismatch, not a cut.
      () => [10],
      // Cuts that repeat or go backwards would leave a clip with nothing in it.
      () => kursi.map(() => 8.97),
      () => [...kursi].reverse(),
      () => [0, ...kursi.slice(1)],
    ]) {
      const segments = buildSegments(
        { surah: 2, from: 255, to: 255 },
        baqarah,
        'phrase',
        bounds,
      );
      expect(segments).toHaveLength(1);
      expect(segments[0].phrase).toBeNull();
      expect(segments[0].clips[0].to).toBeNull();
    }
    expect(splitVerse(baqarah[254]).length).toBeGreaterThan(1);
  });

  it('clamps a range to the surah and refuses an inverted one', () => {
    expect(
      buildSegments({ surah: 2, from: 285, to: 400 }, baqarah, 1),
    ).toHaveLength(2);
    expect(buildSegments({ surah: 2, from: 5, to: 4 }, baqarah, 1)).toEqual([]);
  });

  it('names each grain the way Arabic counts it', () => {
    expect(grainLabel('phrase')).toBe('جملة');
    expect(grainLabel(1)).toBe('آية');
    expect(grainLabel(2)).toBe('آيتان');
    expect(grainLabel(3)).toBe('٣ آيات');
    expect(grainLabel(5)).toBe('٥ آيات');
  });
});

describe('costing a session before any audio is fetched', () => {
  const segments = buildSegments({ surah: 2, from: 1, to: 5 }, baqarah, 1);
  const steps = buildSchedule(segments.length, defaultPlan);
  const seconds = (i: number) => paceEstimate(segments[i], 0.47);

  it('adds the echo to the listening time', () => {
    const silent = costSession(steps, seconds, 'off');
    const echoed = costSession(steps, seconds, 1);
    expect(silent.echo).toBe(0);
    expect(echoed.echo).toBeCloseTo(silent.listening, 5);
    expect(echoed.total).toBeCloseTo(silent.listening * 2, 5);
    expect(costSession(steps, seconds, 'manual').total).toBe(silent.total);
    // The learner who wants twice the reciter's time to repeat gets it.
    expect(costSession(steps, seconds, 2).echo).toBeCloseTo(
      silent.listening * 2,
      5,
    );
  });

  it('costs only what is left once a session is under way', () => {
    const whole = costSession(steps, seconds, 1).total;
    const later = costSession(steps, seconds, 1, {
      step: steps.length - 1,
      rep: 0,
    }).total;
    expect(later).toBeLessThan(whole);
    expect(later).toBeGreaterThan(0);
  });
});

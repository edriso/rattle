import { describe, expect, it } from 'vitest';
import { splitVerse, verseWords } from './phrases';

const surahs = import.meta.glob<{ verses: string[] }>('../data/surahs/*.json', {
  import: 'default',
  eager: true,
});
const verse = (surah: number, ayah: number) =>
  surahs[`../data/surahs/${surah}.json`].verses[ayah - 1];

describe('phrase splitting', () => {
  it('leaves a short verse whole', () => {
    const phrases = splitVerse(verse(1, 1));
    expect(phrases).toHaveLength(1);
    expect(phrases[0]).toMatchObject({ firstWord: 0, words: 4 });
  });

  it('splits at the waqf marks a reciter may stop on', () => {
    // آية الكرسي carries a ۚ or ۖ at every clause end.
    const phrases = splitVerse(verse(2, 255));
    expect(phrases.length).toBeGreaterThan(5);
    expect(phrases[0].text.endsWith('ۚ')).toBe(true);
  });

  it('never stops on a لا mark', () => {
    for (const phrase of splitVerse(verse(2, 26))) {
      expect(phrase.text.trimEnd().endsWith('ۙ')).toBe(false);
    }
  });

  it('breaks a long unmarked stretch at a clause boundary', () => {
    // 6:6 runs 31 words without a single waqf mark.
    const phrases = splitVerse(verse(6, 6));
    expect(phrases.length).toBeGreaterThan(1);
    for (const phrase of phrases) expect(phrase.words).toBeLessThanOrEqual(18);
  });

  it('treats an embedded seen as part of its word, not a pause', () => {
    // 2:245 and 7:69 carry U+06DC inside a word rather than between two.
    for (const [surah, ayah] of [
      [2, 245],
      [7, 69],
    ]) {
      const word = verseWords(verse(surah, ayah)).find((w) =>
        w.includes('\u06DC'),
      );
      expect(word).toBeTruthy();
      expect(word!.length).toBeGreaterThan(1);
    }
  });

  it('keeps every verse verbatim and every word accounted for', () => {
    let phrases = 0;
    for (let surah = 1; surah <= 114; surah++) {
      for (const text of surahs[`../data/surahs/${surah}.json`].verses) {
        const parts = splitVerse(text);
        phrases += parts.length;
        expect(parts.map((p) => p.text).join(' ')).toBe(text);
        expect(parts.reduce((n, p) => n + p.words, 0)).toBe(
          verseWords(text).length,
        );
        parts.forEach((part, i) => {
          expect(part.words).toBeGreaterThan(0);
          if (i > 0)
            expect(part.firstWord).toBe(
              parts[i - 1].firstWord + parts[i - 1].words,
            );
        });
      }
    }
    // A stable figure guards against a rule change that quietly re-cuts the text.
    expect(phrases).toBe(10256);
  });

  it('keeps phrases within a length a learner can hold', () => {
    const sizes: number[] = [];
    for (let surah = 1; surah <= 114; surah++)
      for (const text of surahs[`../data/surahs/${surah}.json`].verses)
        for (const part of splitVerse(text)) sizes.push(part.words);
    sizes.sort((a, b) => a - b);
    expect(sizes[sizes.length >> 1]).toBe(7);
    expect(sizes.at(-1)).toBeLessThanOrEqual(22);
    expect(sizes.filter((n) => n > 18)).toHaveLength(10);
  });
});

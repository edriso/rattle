import { describe, expect, it } from 'vitest';
import { splitVerse, spokenLetters, verseWords } from './phrases';

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

  it('splits at the waqf marks a reciter stops on', () => {
    // آية الكرسي carries a ۚ at most of its clause ends.
    const phrases = splitVerse(verse(2, 255));
    expect(phrases).toHaveLength(6);
    expect(phrases[0].text.endsWith('ۚ')).toBe(true);
  });

  /* Stopping at ۖ is allowed and continuing is preferred, and that is what a
     reciter does: measured against the recordings this app plays, he carries
     on through 28% of them (Husary) to 71% (Abdul Basit). A phrase ending
     there ended in the middle of his breath. */
  it('never ends a phrase on a صلى mark', () => {
    for (let surah = 1; surah <= 114; surah++)
      for (const text of surahs[`../data/surahs/${surah}.json`].verses) {
        const parts = splitVerse(text);
        for (const part of parts.slice(0, -1))
          expect(part.text.trimEnd().endsWith('\u06D6')).toBe(false);
      }
  });

  it('never stops on a لا mark', () => {
    for (const phrase of splitVerse(verse(2, 26))) {
      expect(phrase.text.trimEnd().endsWith('ۙ')).toBe(false);
    }
  });

  /* It used to be cut at a clause word: ثم, قال, a prefixed و. The reciter
     stops at 4% of those (Husary) or none at all (Minshawi, Abdul Basit),
     against the 8-12% rate of any random point mid-word, so every one of those
     cuts was a guess that chopped his breath. Nothing in the text says where
     he breathes inside such a stretch, and the honest answer is to say so by
     leaving it whole. */
  it('leaves a long unmarked stretch whole', () => {
    // 6:6 runs 31 words without a single waqf mark.
    expect(splitVerse(verse(6, 6))).toHaveLength(1);
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
    /* A stable figure guards against a rule change that quietly re-cuts the
       text. It counts the verses as stored, which carry the basmala on the
       first ayah of every surah but two, and the app splits what `openVerse`
       hands back with that separated. The two differ by 7, all of them a
       first ayah (10:1, 11:1, 12:1, 14:1, 15:1, 27:1 and 34:1), so 8,373 is
       the figure to expect from anything that goes through `openVerse` and
       neither number is stale. */
    expect(phrases).toBe(8380);
  });

  /* `spokenLetters` reads a character class of ranges, and a range is exactly
     what a bidirectional editor reorders on screen without changing the file,
     which is why it is written in escapes. This is the self-test that makes
     the escapes provable, and it is worth having because nothing else would
     notice: a range that lost a member would leave marks in the count, and
     every session estimate in the app would be quietly long. The invariant is
     that the count is base letters and nothing else. What goes out with the
     harakat is every combining mark, the two mushaf symbols (۞ and ۩), the
     spaces, and the three letter-shaped modifiers written above the line, the
     tatweel and the small waw and yeh, which stretch or vowel a letter rather
     than being one. */
  it('counts base letters across the mushaf, and nothing else', () => {
    const dropped = new Set<string>();
    const counted = new Set<string>();
    for (let surah = 1; surah <= 114; surah++)
      for (const text of surahs[`../data/surahs/${surah}.json`].verses)
        for (const character of text)
          (spokenLetters(character) ? counted : dropped).add(character);
    expect(
      [...dropped].filter((c) => !/[\p{Mn}\p{Lm}\p{So}\s]/u.test(c)),
    ).toEqual([]);
    expect([...counted].filter((c) => !/\p{Lo}/u.test(c))).toEqual([]);
    // Both kinds are really in the mushaf, so neither list is empty for want
    // of having looked.
    expect(dropped.size).toBeGreaterThan(30);
    expect(counted.size).toBeGreaterThan(30);
  });

  /* Half of all phrases are eight words, which is the length this is for. The
     long tail is the price of only cutting where the reciter stops: a stretch
     with no waqf mark inside it stays whole, however long it runs, because
     nothing says where inside it he takes his breath. Both figures are pinned
     so a change to the rules has to be a deliberate one. */
  it('keeps most phrases to a length a learner can hold', () => {
    const sizes: number[] = [];
    for (let surah = 1; surah <= 114; surah++)
      for (const text of surahs[`../data/surahs/${surah}.json`].verses)
        for (const part of splitVerse(text)) sizes.push(part.words);
    sizes.sort((a, b) => a - b);
    expect(sizes[sizes.length >> 1]).toBe(8);
    expect(sizes.filter((n) => n > 18)).toHaveLength(594);
  });
});

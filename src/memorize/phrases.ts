/* Splitting a verse into memorisable phrases, using only the vendored Uthmani
   text. Verse text is never altered: a phrase is always an exact substring of
   the verse, and concatenating every phrase with single spaces rebuilds it.

   A phrase exists to be played on its own, so it may only end where the
   reciter's own breath ends. That is the whole rule, and it is stricter than
   "where stopping is allowed":

   - ۚ جائز and ۗ قلى and ۘ لازم end a phrase. Measured against the recordings
     the app plays, the reciter does stop at these: 98% and 100% of the time
     for Husary, 93% and 96% for Abdul Basit, 84% and 68% for Minshawi.
   - ۖ صلى does not, and that is the correction. Stopping is permitted there
     but continuing is preferred, which is exactly what a reciter does: he
     carries on through 28% of them (Husary), 33% (Minshawi) and 71% (Abdul
     Basit). Cutting there chopped a phrase mid-breath, which is what a reader
     reported hearing. It was 29% of the cuts in the mushaf, so this costs real
     phrases, and it is worth it: a phrase that ends mid-word teaches a wrong
     ending.
   - A long stretch with no mark at all stays whole. It used to be cut at a
     clause word (ثم, قال, a prefixed و) and the reciter stops at 4% of those
     (Husary) or 0% (Minshawi, Abdul Basit), against the 8-12% rate of any
     random point in the middle of a word. That is not a signal, it was 20% of
     all the cuts in the mushaf, and every one of them was a guaranteed chop.

   Excluded for the same reason as always: ۙ (لا, stopping forbidden), ۛ
   (معانقة, stop at exactly one of a pair, never both) and ۜ (سكتة, a held
   pause taken without breathing).

   The numbers above come from measuring `silencedetect` against the reciters'
   own recordings; see docs in data/README.md. */

/* Escapes rather than the marks themselves, because both of these strings are
   read as regular-expression character classes below. A bidirectional editor
   reorders such a class on screen, so one typed as Arabic marks can be saved
   differently from how it reads, and a class that lost a member makes every
   check here pass vacuously. `phrases.test.ts` walks all 6,236 verses for that
   reason. */

/** Marks that end a phrase: ۚ جائز, ۗ قلى, ۘ لازم. */
const STOP_MARKS = '\u06DA\u06D7\u06D8';
/**
 * Every mark that stands alone between two words rather than belonging to one:
 * the three above plus ۖ صلى, ۙ لا, ۛ معانقة, ۜ سكتة, ۞ بداية الربع and
 * ۩ موضع سجدة, the last two read by nobody.
 */
const MARK_CHARS = `${STOP_MARKS}\u06D6\u06D9\u06DB\u06DC\u06DE\u06E9`;
const MARK_ONLY = new RegExp(`^[${MARK_CHARS}]+$`, 'u');
const STOPPABLE = new RegExp(`[${STOP_MARKS}]`, 'u');

/** True when the token is a standalone annotation rather than a Quranic word. */
const isMark = (token: string) => MARK_ONLY.test(token);

/** Shortest phrase worth practising on its own. */
const MIN_WORDS = 4;
/** Longest phrase a stub is folded into, rather than left on its own. */
const MAX_MERGED = 18;

export type Phrase = {
  /** Verbatim slice of the verse, marks included. */
  text: string;
  /** Index of the first word of the phrase, counting words only. */
  firstWord: number;
  /** Number of words in the phrase, marks excluded. */
  words: number;
};

type Token = { text: string; mark: boolean };

/** Group tokens into runs that end on a waqf mark the reciter stops at. */
function splitAtWaqf(tokens: readonly Token[]): Token[][] {
  const runs: Token[][] = [];
  let current: Token[] = [];
  for (const token of tokens) {
    current.push(token);
    if (token.mark && STOPPABLE.test(token.text)) {
      runs.push(current);
      current = [];
    }
  }
  if (current.length) runs.push(current);
  return runs;
}

const countWords = (piece: readonly Token[]) =>
  piece.reduce((n, token) => n + (token.mark ? 0 : 1), 0);

/**
 * Split one verse into the phrases the reciter himself pauses between. A verse
 * with no such mark comes back whole, which is the honest answer: nothing in
 * the text or in the timings says where he takes his breath inside it.
 */
export function splitVerse(verse: string): Phrase[] {
  const tokens: Token[] = verse
    .split(' ')
    .filter(Boolean)
    .map((text) => ({ text, mark: isMark(text) }));
  if (!tokens.length) return [];

  // Fold a stub into its neighbour: a two-word phrase is not worth a cycle.
  const merged: Token[][] = [];
  for (const piece of splitAtWaqf(tokens)) {
    const previous = merged.at(-1);
    const tooShort =
      countWords(piece) < MIN_WORDS ||
      (previous ? countWords(previous) < MIN_WORDS : false);
    if (
      previous &&
      tooShort &&
      countWords(previous) + countWords(piece) <= MAX_MERGED
    )
      merged[merged.length - 1] = [...previous, ...piece];
    else merged.push(piece);
  }

  let firstWord = 0;
  return merged.map((piece) => {
    const words = countWords(piece);
    const phrase = {
      text: piece.map((t) => t.text).join(' '),
      firstWord,
      words,
    };
    firstWord += words;
    return phrase;
  });
}

/** The words of a verse, with standalone waqf marks removed. */
export function verseWords(verse: string): string[] {
  return verse.split(' ').filter((token) => token && !isMark(token));
}

/**
 * Everything in the Uthmani text that is not a letter the reciter voices: the
 * harakat and tanwin through to the dagger alef (U+064B to U+0670, which takes
 * in the shadda, the sukun and the madda), every mark and small letter above
 * or below the line (U+06D6 to U+06ED, the waqf marks among them), the tatweel
 * that only stretches a join, and the spaces between words. Checked against
 * all 6,236 verses in `phrases.test.ts`: over the whole mushaf what it takes
 * out is marks, symbols, spaces and the modifiers written above the line, and
 * what it leaves is base letters and nothing else.
 */
const UNVOICED = /[\u064B-\u0670\u06D6-\u06ED\u0640\s]/g;

/**
 * Letters a reciter actually voices, which is what recitation time tracks. The
 * pace figures in `src/data/audio.ts` were measured with this same count by
 * `scripts/prepare-timings.ts`, so the two must not drift: a session's
 * estimate is letters times a pace fitted to letters counted this way.
 */
export const spokenLetters = (text: string) =>
  text.replace(UNVOICED, '').length;

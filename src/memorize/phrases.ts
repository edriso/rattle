/* Splitting a verse into memorisable phrases, using only the vendored Uthmani
   text. Verse text is never altered: a phrase is always an exact substring of
   the verse, and concatenating every phrase with single spaces rebuilds it. */

/* Waqf marks that a reciter may stop on, so a phrase may end there:
   ۖ صلى, ۗ قلى, ۘ لازم, ۚ جائز. Deliberately excluded are ۙ (لا, stopping
   forbidden), ۛ (معانقة, stop at exactly one of a pair, never both) and
   ۜ (سكتة, a held pause taken without breathing, so never a phrase end). */
const STOP_MARKS = 'ۖۗۘۚ';
/** ARABIC SMALL HIGH LAM ALEF (لا): stopping here is forbidden. */
const NO_STOP = 'ۙ';
/* Every mark that stands alone between two words rather than belonging to one,
   including ۞ (بداية الربع) and ۩ (موضع سجدة), which are read by nobody. */
const MARK_CHARS = `${STOP_MARKS}${NO_STOP}ۛۜ۞۩`;

const DIACRITICS = /[ً-ٰٕۖ-ۭـ]/g;

const MARK_ONLY = new RegExp(`^[${MARK_CHARS}]+$`, 'u');
const STOPPABLE = new RegExp(`[${STOP_MARKS}]`, 'u');

/** True when the token is a standalone annotation rather than a Quranic word. */
const isMark = (token: string) => MARK_ONLY.test(token);

const bare = (word: string) => word.replace(DIACRITICS, '').replace(/ٱ/g, 'ا');

/** Words that open a new clause, used only when a long stretch has no waqf. */
const CLAUSE_WORDS = new Set([
  'ثم',
  'أو',
  'او',
  'إن',
  'ان',
  'إذا',
  'اذا',
  'إذ',
  'اذ',
  'بل',
  'لكن',
  'أم',
  'ام',
  'حتى',
  'لما',
  'قل',
  'قال',
  'يأيها',
  'يايها',
]);

const opensClause = (word: string) => {
  const w = bare(word);
  if (!w) return false;
  // A prefixed و or ف joins clauses; two letters alone is a word, not a prefix.
  if ((w[0] === 'و' || w[0] === 'ف') && w.length > 2) return true;
  return CLAUSE_WORDS.has(w);
};

export type Phrase = {
  /** Verbatim slice of the verse, marks included. */
  text: string;
  /** Index of the first word of the phrase, counting words only. */
  firstWord: number;
  /** Number of words in the phrase, marks excluded. */
  words: number;
};

export type SplitOptions = {
  /** Longest phrase tolerated before a clause boundary is looked for. */
  maxWords?: number;
  /** Shortest phrase worth practising on its own. */
  minWords?: number;
};

type Token = { text: string; mark: boolean };

/** Group tokens into runs that end on a waqf mark a reciter may stop at. */
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

/** Word positions inside a run where a clause starts and a stop is allowed. */
function clauseBreaks(run: readonly Token[]): number[] {
  const breaks: number[] = [];
  let words = 0;
  let forbidden = false;
  for (const token of run) {
    if (token.mark) {
      if (token.text.includes(NO_STOP)) forbidden = true;
      continue;
    }
    if (words > 0 && !forbidden && opensClause(token.text)) breaks.push(words);
    forbidden = false;
    words++;
  }
  return breaks;
}

/** Cut a run that has no usable waqf mark into pieces at clause boundaries. */
function splitLongRun(
  run: readonly Token[],
  maxWords: number,
  minWords: number,
): Token[][] {
  const wordIndex: number[] = [];
  run.forEach((token, i) => {
    if (!token.mark) wordIndex.push(i);
  });
  const total = wordIndex.length;
  if (total <= maxWords) return [[...run]];
  const breaks = clauseBreaks(run);
  const pieces: Token[][] = [];
  let start = 0;
  let cut = 0;
  while (total - start > maxWords) {
    const ideal = start + Math.round(maxWords * 0.8);
    const inRange = breaks.filter(
      (b) => b >= start + minWords && b <= start + maxWords,
    );
    // Overshoot the limit rather than leave one unmanageable block behind.
    const options = inRange.length
      ? inRange
      : breaks.filter((b) => b >= start + minWords && b <= total - minWords);
    if (!options.length) break;
    const next = options.reduce((best, b) =>
      Math.abs(b - ideal) < Math.abs(best - ideal) ? b : best,
    );
    pieces.push(run.slice(cut, wordIndex[next]));
    cut = wordIndex[next];
    start = next;
  }
  pieces.push(run.slice(cut));
  return pieces;
}

const countWords = (piece: readonly Token[]) =>
  piece.reduce((n, token) => n + (token.mark ? 0 : 1), 0);

/**
 * Split one verse into phrases at the pause marks the reciter observes,
 * falling back to clause boundaries only where a stretch has no mark at all.
 */
export function splitVerse(
  verse: string,
  options: SplitOptions = {},
): Phrase[] {
  const maxWords = options.maxWords ?? 14;
  const minWords = options.minWords ?? 4;
  const tokens: Token[] = verse
    .split(' ')
    .filter(Boolean)
    .map((text) => ({ text, mark: isMark(text) }));
  if (!tokens.length) return [];

  const pieces = splitAtWaqf(tokens).flatMap((run) =>
    splitLongRun(run, maxWords, minWords),
  );

  // Fold a stub into its neighbour: a two-word phrase is not worth a cycle.
  const merged: Token[][] = [];
  for (const piece of pieces) {
    const previous = merged.at(-1);
    const tooShort =
      countWords(piece) < minWords ||
      (previous ? countWords(previous) < minWords : false);
    if (
      previous &&
      tooShort &&
      countWords(previous) + countWords(piece) <= maxWords + minWords
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

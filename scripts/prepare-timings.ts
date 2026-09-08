/* Offline generation of phrase-boundary timings.

   Phrase mode has to cut an ayah's recording exactly where the reciter pauses.
   Rather than call an API at run time, the boundaries are computed here once
   and committed, so a session works from vendored data alone, the
   same arrangement the Quran text already uses.

   Run from the repository root:  node scripts/prepare-timings.ts

   Source: Quran.com's word-by-word segments, which are millisecond offsets
   into the full-chapter recording. Subtracting the ayah's own start turns them
   into offsets into the per-ayah file EveryAyah serves, which is the same
   recording; every reciter below was checked to agree within about 0.3 s.

   Those segments carry no silence: 92% of consecutive words are marked as
   touching exactly, and the largest gap anywhere in the sample was 21 ms. The
   reciter's pause is not between two words, it is inside the span of one of
   them, and the marked boundary sits before it. Measured against the audio,
   the pause begins a median 290 ms after the boundary for Husary, 400 ms for
   Abdul Basit and 645 ms for Minshawi, so a clip that ended at the boundary
   ended while the reciter was still finishing his word. LAG below is the
   correction; data/README.md records how it was measured and what it does not
   fix.  */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { reciters } from '../src/data/audio.ts';
import { openVerse } from '../src/data/verse.ts';
import { splitVerse, verseWords } from '../src/memorize/phrases.ts';

const API = 'https://api.qurancdn.com/api/qdc/audio/reciters';
const OUT = new URL('../src/data/timings/', import.meta.url);

/**
 * Milliseconds every cut is moved later than the word boundary the aligner
 * reports, so a phrase keeps the tail of its own last word. See the note at
 * the top of this file for where the number comes from. It is deliberately
 * short of the measured median: overshooting a cut past the end of a pause
 * would clip the beginning of the next phrase, which is the worse failure.
 */
const LAG = 300;
/** Recording that must be left after a cut, or the ayah stays whole: a final
    phrase with less than this in it is not worth cutting for. */
const MIN_CLIP = 400;
/**
 * How much of a word may still be sounding at a cut before the boundary is
 * treated as landing inside a repeated stretch. The segments touch exactly, so
 * anything past this is a word being said again, not measurement noise.
 */
const OVERLAP = 50;

type VerseTiming = {
  verse_key: string;
  timestamp_from: number;
  timestamp_to: number;
  segments: (number | string)[][];
};

const surahText = (surah: number): string[] =>
  JSON.parse(
    readFileSync(
      new URL(`../src/data/surahs/${surah}.json`, import.meta.url),
      'utf8',
    ),
  ).verses;

async function fetchChapter(recitation: number, chapter: number) {
  const url = `${API}/${recitation}/audio_files?chapter=${chapter}&segments=true`;
  let lastError: unknown;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = (await response.json()) as {
        audio_files: { verse_timings: VerseTiming[] }[];
      };
      const timings = body.audio_files?.[0]?.verse_timings;
      if (!timings?.length) throw new Error('no verse timings');
      return timings;
    } catch (error) {
      lastError = error;
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
    }
  }
  throw new Error(`chapter ${chapter}: ${String(lastError)}`);
}

/** First and last moment each word is voiced, relative to the ayah's file. */
function wordSpans(timing: VerseTiming) {
  const starts = new Map<number, number>();
  const ends = new Map<number, number>();
  for (const segment of timing.segments) {
    const index = Number(segment[0]);
    const from = Number(segment[1]) - timing.timestamp_from;
    const to = Number(segment[2]) - timing.timestamp_from;
    // `to` is checked as well as `from`: one NaN end would carry through the
    // running maximum below and make the repetition check pass vacuously for
    // every word after it, which is the check's whole job.
    if (
      !Number.isFinite(index) ||
      !Number.isFinite(from) ||
      !Number.isFinite(to)
    )
      continue;
    // A reciter who repeats a word gets several entries for the same index.
    starts.set(index, Math.min(starts.get(index) ?? from, from));
    ends.set(index, Math.max(ends.get(index) ?? to, to));
  }
  return { starts, ends, count: starts.size ? Math.max(...starts.keys()) : 0 };
}

/**
 * The cuts inside one ayah, or the reason it has none and plays whole. Every
 * check here is what keeps a cut the app cannot trust out of the file, so this
 * is the part with a test of its own.
 */
export function ayahCuts(
  timing: VerseTiming,
  phrases: readonly { firstWord: number }[],
  words: number,
): { cuts: number[] } | { dropped: 'mismatch' | 'repeated' | 'partial' } {
  const duration = timing.timestamp_to - timing.timestamp_from;
  const { starts, ends, count } = wordSpans(timing);
  // Quran.com joins a handful of words the source text keeps apart; where the
  // two disagree the ayah keeps its timings out of the file entirely.
  if (count !== words) return { dropped: 'mismatch' };
  /* The last moment anything up to each word is still sounding. A teaching
     mushaf recites a stretch and then says it again, so a word before the cut
     can be voiced after it; a clip opening there would begin on words that
     belong to the phrase before it. */
  const voicedUpTo: number[] = [];
  let latest = 0;
  for (let word = 1; word <= count; word++) {
    voicedUpTo[word] = latest;
    latest = Math.max(latest, ends.get(word) ?? latest);
  }
  const cuts: number[] = [];
  for (const phrase of phrases.slice(1)) {
    const word = phrase.firstWord + 1;
    const start = starts.get(word);
    if (start === undefined) break;
    if (voicedUpTo[word] > start + OVERLAP) return { dropped: 'repeated' };
    const cut = Math.round(Math.min(Math.max(start, 0), duration) + LAG);
    if (cut <= (cuts.at(-1) ?? 0) || cut > duration - MIN_CLIP) break;
    cuts.push(cut);
  }
  return cuts.length === phrases.length - 1 ? { cuts } : { dropped: 'partial' };
}

type Report = {
  split: number;
  /** Ayat whose timings could not be trusted, so they play whole. */
  skipped: string[];
  /** Ayat the source has no timing for at all. */
  absent: string[];
  /** Ayat where a cut fell inside a stretch the reciter says twice. */
  repeated: string[];
  letters: number;
  seconds: number;
};

async function build(reciter: (typeof reciters)[number]) {
  const bounds: Record<string, number[]> = {};
  const report: Report = {
    split: 0,
    skipped: [],
    absent: [],
    repeated: [],
    letters: 0,
    seconds: 0,
  };
  for (let surah = 1; surah <= 114; surah++) {
    const verses = surahText(surah);
    const chapter = await fetchChapter(reciter.recitation!, surah);
    /* Keyed, not positional. One recitation returns its ayat out of order,
       chapter 2 opening at 2:27, and read by position every cut in it would
       come from the wrong ayah. Another is missing an ayah altogether, and
       that used to throw and block the whole regeneration. */
    const timings = new Map(chapter.map((t) => [t.verse_key, t]));
    verses.forEach((raw, index) => {
      const ayah = index + 1;
      const timing = timings.get(`${surah}:${ayah}`);
      const { text } = openVerse(surah, ayah, raw);
      if (!timing) {
        report.absent.push(`${surah}:${ayah}`);
        return;
      }
      // Counted here rather than above, so an ayah the source has no timing
      // for contributes neither letters nor seconds to the measured pace.
      report.letters += text.replace(/[ً-ٰٕۖ-ۭـ\s]/g, '').length;
      report.seconds += (timing.timestamp_to - timing.timestamp_from) / 1000;
      const phrases = splitVerse(text);
      if (phrases.length < 2) return;
      const result = ayahCuts(timing, phrases, verseWords(text).length);
      if ('dropped' in result) {
        (result.dropped === 'repeated' ? report.repeated : report.skipped).push(
          `${surah}:${ayah}`,
        );
        return;
      }
      bounds[`${surah}:${ayah}`] = result.cuts;
      report.split++;
    });
  }
  return { bounds, report };
}

/* Everything above is a pure function of what the API returned, so a test can
   import this module and reach it. Only being run as a command generates
   anything. */
if (
  process.argv[1] !== undefined &&
  pathToFileURL(process.argv[1]).href === import.meta.url
)
  await generate();

async function generate() {
  mkdirSync(OUT, { recursive: true });
  const generated = new Date().toISOString().slice(0, 10);
  /* A file that has been measured against the audio is not something this
     script can reproduce: those boundaries came from listening to about
     350 MB of recording per reciter, and everything here can offer instead is
     the text and a constant. So a `verified` file is left alone and named
     rather than quietly overwritten, which means adding a reciter needs no
     flag and costs nothing that was measured.

     `--force` is for the case that really does invalidate a measurement, a
     change to the splitting rules in `src/memorize/phrases.ts` or to `LAG`:
     pass it, then run `npm run verify:cuts` again to measure what it wrote. */
  const force = process.argv.includes('--force');
  const paces: string[] = [];
  for (const reciter of reciters) {
    /* A recitation nobody has published word timings for. Its audio is played
       whole, and the app never offers to cut inside an ayah for it. */
    if (reciter.recitation === undefined) {
      console.log(
        `${reciter.id.padEnd(20)} no word timings published, skipped`,
      );
      continue;
    }
    const out = new URL(`${reciter.id}.json`, OUT);
    if (!force && existsSync(out)) {
      const { verified } = JSON.parse(readFileSync(out, 'utf8')) as {
        verified?: string;
      };
      if (verified) {
        console.log(
          `${reciter.id.padEnd(20)} measured against the audio on ${verified}, left as it is` +
            ` (--force overwrites it, and then it needs measuring again)`,
        );
        continue;
      }
    }
    const { bounds, report } = await build(reciter);
    writeFileSync(
      out,
      /* Indented, because a diff of this file should say which ayat changed.
         `npm run prepare:timings` runs the formatter over the output afterwards,
         which is what collapses the short arrays to a line an ayah. */
      JSON.stringify(
        {
          reciter: reciter.id,
          recitation: reciter.recitation,
          source: `${API}/${reciter.recitation}/audio_files?chapter=<1..114>&segments=true`,
          generated,
          bounds,
        },
        null,
        2,
      ) + '\n',
    );
    const pace = report.seconds / report.letters;
    paces.push(`${reciter.id}: ${pace.toFixed(3)}`);
    console.log(
      `${reciter.id.padEnd(20)} split ${String(report.split).padStart(4)} ayat, ` +
        `skipped ${String(report.skipped.length).padStart(3)}, ` +
        `repeated ${String(report.repeated.length).padStart(3)}, ` +
        `absent ${String(report.absent.length).padStart(3)}, ` +
        `pace ${pace.toFixed(3)} s/letter`,
    );
  }
  console.log(
    '\nMeasured pace values for src/data/audio.ts:\n  ' + paces.join('\n  '),
  );
}

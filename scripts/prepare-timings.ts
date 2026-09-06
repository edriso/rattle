/* Offline generation of phrase-boundary timings.

   Phrase mode has to cut an ayah's recording exactly where the reciter pauses.
   Rather than call an API at run time, the boundaries are computed here once
   and committed, so a session works from vendored data alone — the same
   arrangement the Quran text already uses.

   Run from the repository root:  node scripts/prepare-timings.ts

   Source: Quran.com's word-by-word segments, which are millisecond offsets
   into the full-chapter recording. Subtracting the ayah's own start turns them
   into offsets into the per-ayah file EveryAyah serves, which is the same
   recording; every reciter below was checked to agree within about 0.3 s.  */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { reciters } from '../src/data/audio.ts';
import { openVerse } from '../src/data/verse.ts';
import { splitVerse, verseWords } from '../src/memorize/phrases.ts';

const API = 'https://api.qurancdn.com/api/qdc/audio/reciters';
const OUT = new URL('../src/data/timings/', import.meta.url);

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
    if (!Number.isFinite(index) || !Number.isFinite(from)) continue;
    // A reciter who repeats a word gets several entries for the same index.
    starts.set(index, Math.min(starts.get(index) ?? from, from));
    ends.set(index, Math.max(ends.get(index) ?? to, to));
  }
  return { starts, ends, count: starts.size ? Math.max(...starts.keys()) : 0 };
}

type Report = {
  split: number;
  skipped: string[];
  letters: number;
  seconds: number;
};

async function build(reciter: (typeof reciters)[number]) {
  const bounds: Record<string, number[]> = {};
  const report: Report = { split: 0, skipped: [], letters: 0, seconds: 0 };
  for (let surah = 1; surah <= 114; surah++) {
    const verses = surahText(surah);
    const timings = await fetchChapter(reciter.recitation, surah);
    if (timings.length !== verses.length)
      throw new Error(
        `surah ${surah}: ${timings.length} timings for ${verses.length} ayat`,
      );
    verses.forEach((raw, index) => {
      const ayah = index + 1;
      const timing = timings[index];
      const duration = timing.timestamp_to - timing.timestamp_from;
      const { text } = openVerse(surah, ayah, raw);
      report.letters += text.replace(/[ً-ٰٕۖ-ۭـ\s]/g, '').length;
      report.seconds += duration / 1000;
      const phrases = splitVerse(text);
      if (phrases.length < 2) return;
      const { starts, count } = wordSpans(timing);
      // Quran.com joins a handful of words the source text keeps apart; where
      // the two disagree the ayah keeps its timings out of the file entirely.
      if (count !== verseWords(text).length) {
        report.skipped.push(`${surah}:${ayah}`);
        return;
      }
      const cuts: number[] = [];
      for (const phrase of phrases.slice(1)) {
        const start = starts.get(phrase.firstWord + 1);
        if (start === undefined) break;
        const cut = Math.round(Math.min(Math.max(start, 0), duration));
        if (cut <= (cuts.at(-1) ?? 0) || cut >= duration) break;
        cuts.push(cut);
      }
      if (cuts.length !== phrases.length - 1) {
        report.skipped.push(`${surah}:${ayah}`);
        return;
      }
      bounds[`${surah}:${ayah}`] = cuts;
      report.split++;
    });
  }
  return { bounds, report };
}

mkdirSync(OUT, { recursive: true });
const generated = new Date().toISOString().slice(0, 10);
const paces: string[] = [];
for (const reciter of reciters) {
  const { bounds, report } = await build(reciter);
  writeFileSync(
    new URL(`${reciter.id}.json`, OUT),
    JSON.stringify({
      reciter: reciter.id,
      recitation: reciter.recitation,
      source: `${API}/${reciter.recitation}/audio_files?chapter=<1..114>&segments=true`,
      generated,
      bounds,
    }) + '\n',
  );
  const pace = report.seconds / report.letters;
  paces.push(`${reciter.id}: ${pace.toFixed(3)}`);
  console.log(
    `${reciter.id.padEnd(16)} split ${String(report.split).padStart(4)} ayat, ` +
      `skipped ${String(report.skipped.length).padStart(3)}, ` +
      `pace ${pace.toFixed(3)} s/letter`,
  );
}
console.log(
  '\nMeasured pace values for src/data/audio.ts:\n  ' + paces.join('\n  '),
);

import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { surahs } from './quran';
import { openVerse } from './verse';
import { splitVerse } from '../memorize/phrases';
import { reciters } from './audio';

/* The shipped phrase-boundary timings, checked against the contract the app
   reads them under.

   `buildSegments` defends itself: given a set of cuts that is not exactly one
   per gap between an ayah's phrases, and strictly increasing, it plays the
   ayah whole rather than cutting it blind. That is the right behaviour at run
   time and it is why a bad file cannot break a session. It is also why a bad
   file would be *silent*: «جملة» would quietly stop being offered for some
   ayat and nothing would say so.

   These files are generated, and four of them are rewritten by a script that
   measures them against 350 MB of audio each, so the invariant is maintained
   a long way from where it is relied on. Hence checking it here, on what is
   actually committed, rather than trusting the generator. */

const TIMINGS = new URL('./timings/', import.meta.url);
const files = readdirSync(TIMINGS).filter((name) => name.endsWith('.json'));

type TimingFile = {
  reciter: string;
  recitation: number;
  source: string;
  generated: string;
  verified?: string;
  bounds: Record<string, number[]>;
};

const load = (name: string) =>
  JSON.parse(readFileSync(new URL(name, TIMINGS), 'utf8')) as TimingFile;

const verses = (surah: number): string[] =>
  JSON.parse(
    readFileSync(new URL(`./surahs/${surah}.json`, import.meta.url), 'utf8'),
  ).verses;

/** The phrase count of every ayah that has more than one, read once. */
const phraseCount = new Map<string, number>();
for (const { id, count } of surahs) {
  const text = verses(id);
  for (let ayah = 1; ayah <= count; ayah++) {
    const phrases = splitVerse(openVerse(id, ayah, text[ayah - 1]).text).length;
    if (phrases > 1) phraseCount.set(`${id}:${ayah}`, phrases);
  }
}

it('ships a timing file for every reciter that has word timings, and no others', () => {
  const expected = reciters
    .filter((r) => r.recitation !== undefined)
    .map((r) => `${r.id}.json`);
  expect([...files].sort()).toEqual([...expected].sort());
});

describe.each(files)('%s', (name) => {
  const file = load(name);
  const entries = Object.entries(file.bounds);

  it('names the reciter and recitation it was generated for', () => {
    expect(`${file.reciter}.json`).toBe(name);
    const reciter = reciters.find((r) => r.id === file.reciter);
    expect(reciter?.recitation).toBe(file.recitation);
    expect(file.generated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // Written only by `verify-cuts.ts`, and only after listening.
    if (file.verified !== undefined)
      expect(file.verified).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('keys every entry to an ayah that exists and has phrases to separate', () => {
    for (const [key] of entries) {
      expect(key).toMatch(/^\d+:\d+$/);
      /* Not merely a real ayah: one this app would ever cut. A key for an
         ayah with a single phrase is dead weight the app can never read,
         and it would mean the generator and `phrases.ts` had drifted. */
      expect(phraseCount.has(key)).toBe(true);
    }
  });

  it('carries exactly one cut per gap, strictly increasing and positive', () => {
    /* The whole contract, and the reason `verify-cuts.ts` drops an ayah's
       cuts all together when it cannot place one of them: a partial set is
       not something the app can use, so it must not be in the file. */
    for (const [key, cuts] of entries) {
      const phrases = phraseCount.get(key);
      expect(cuts, key).toHaveLength(phrases! - 1);
      let previous = 0;
      for (const cut of cuts) {
        expect(Number.isInteger(cut), `${key} cut ${cut}`).toBe(true);
        expect(cut, `${key} cut ${cut}`).toBeGreaterThan(previous);
        previous = cut;
      }
    }
  });

  it('covers enough of the mushaf to be worth loading', () => {
    /* A floor far below any real figure, so this catches a file that was
       truncated or half-written rather than one that legitimately measured
       poorly. The lowest a shipped file has ever sat is Abdul Basit's
       murattal at 1,277 of the 1,560 ayat that split, and the measurement
       that fell to 967 was refused rather than written. */
    expect(entries.length).toBeGreaterThan(1000);
    expect(entries.length).toBeLessThanOrEqual(phraseCount.size);
  });
});

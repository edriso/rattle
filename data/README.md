# Data provenance

Two sets of data are committed to this repository rather than fetched at run time: the Quran text, and the phrase-boundary timings the session uses to cut an ayah's recording. Both are generated offline by a script, and neither is re-fetched during a build or an install.

## Quran text

- Source: Tanzil Project, **Uthmani, version 1.1**.
- Official download: https://tanzil.net/download/index.php?quranType=uthmani&outType=txt-2&marks=true&sajdah=true&rub=true&tatweel=true&agree=true
- Downloaded: 2026-09-06.
- Pinned original: `quran-uthmani.txt`; checksum: `SHA256`.
- License: Creative Commons Attribution 3.0, with Tanzil's requirement to preserve the text verbatim. The complete copyright and terms are embedded in the original file and each generated surah file. Official terms: https://tanzil.net/docs/Text_License
- Visible source attribution links to https://tanzil.net in app settings.

Run `npm run prepare:quran` from the repository root to regenerate `src/data/surahs/`. The converter splits only the surah/ayah delimiters: no Unicode normalization, correction, diacritic removal, or other verse-text transformations are performed. Displayed verse numbers are separate UI elements, and `src/text.test.ts` checks every one of the 6,236 verses byte for byte against the pinned source.

The source prefixes the basmala to ayah 1 of every surah except al-Fatihah and at-Tawbah. The stored files keep it there; `src/data/verse.ts` separates it at display time, because it is not part of the numbered ayah and the reciter records it apart. Two surahs, 95 and 97, spell it with a shadda.

## Phrase-boundary timings

- Source: Quran.com word-by-word segments, `https://api.qurancdn.com/api/qdc/audio/reciters/<id>/audio_files?chapter=<1..114>&segments=true`.
- Generated: 2026-09-06, by `npm run prepare:timings`, into `src/data/timings/<reciter>.json`.
- Roughly 46 KB per reciter, about 16 KB over the wire; loaded only when the learner drills at phrase level.

The API reports each word as a millisecond span into the **full-chapter** recording. The app plays the **per-ayah** files EveryAyah serves, so the script subtracts the ayah's own `timestamp_from`. The two are the same recording: across every reciter shipped here, `timestamp_to − timestamp_from` matched the length of the corresponding EveryAyah file to within about 0.3 s, and most to within 0.05 s.

A phrase ends at the **start of the next phrase's first word**, never at the end of its own last word. That way the reciter's pause belongs to the phrase that precedes it, no word can be clipped, and consecutive phrases leave no gap between them.

Where Quran.com's word count disagrees with the Tanzil tokenisation the ayah is left out of the file entirely and plays whole. Five ayat are affected across the mushaf — 2:181, 8:6, 9:60, 13:18 and 13:37, all cases where Quran.com joins `بَعْدَ مَا` into one word — plus a handful more per reciter where a segment is missing. Coverage is about 2,425 of the 2,432 ayat that split into more than one phrase, except for Abdul Basit's murattal, which covers 2,281.

Re-run the script only when a reciter is added or the splitting rules in `src/memorize/phrases.ts` change; the committed output is what the app ships.

## Updating

Download from the official source, review its release notes (https://tanzil.net/updates/ for the text), inspect the diff, regenerate the assets, and run the tests. Do not silently replace a pinned source during an install or a build.

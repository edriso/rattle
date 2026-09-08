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
- Generated: 2026-09-08, by `npm run prepare:timings`, into `src/data/timings/<reciter>.json`.
- About 26 KB per reciter, some 9 KB over the wire; loaded only when the learner drills at phrase level.

The API reports each word as a millisecond span into the **full-chapter** recording. The app plays the **per-ayah** files EveryAyah serves, so the script subtracts the ayah's own `timestamp_from`. The two are the same recording: across every reciter shipped here, `timestamp_to − timestamp_from` matched the length of the corresponding EveryAyah file to within about 0.3 s, and most to within 0.05 s.

Timings are looked up **by `verse_key`, never by position**. One shipped recitation, Minshawi's mujawwad, returns its ayat out of order: chapter 2 opens at 2:27, and 92 of its 114 chapters are unordered, so read positionally every cut in it would come from the wrong ayah. The same recitation is missing a timing for 32:24 altogether; a missing ayah is now reported and left out rather than throwing and blocking the whole regeneration.

### What the source does not contain, and the correction for it

**These segments record no silence.** Measured over some 11,500 word transitions per reciter, 92% of consecutive words are marked as touching exactly, 5% are 20 ms apart, and the largest gap anywhere was 21 ms. The segments are a contiguous partition of the ayah: a pause is not between two words, it is absorbed into the span of one of them. So a pause cannot be found in this data, and no threshold on it can tell whether the reciter stopped somewhere.

**The boundary sits before the pause, not at it.** Measured against the recordings themselves, with `ffmpeg silencedetect` over 390 per-ayah files, 130 ayat for each of three reciters: where the reciter does stop at a cut, the silence begins a median **290 ms** after the boundary the aligner reports (Husary; 400 ms for Abdul Basit, 645 ms for Minshawi), with a 75th percentile of 500 to 900 ms. A clip that ended at the boundary ended while he was still finishing his word: at 90% of the cuts the audio was still voiced.

`LAG = 300` in `scripts/prepare-timings.ts` is the correction. Every cut is stored 300 ms later than the boundary, which takes the share of Husary's true stops that end inside real silence from 11% to 50%. It is deliberately short of the measured median: overshooting past the end of a pause would clip the beginning of the next phrase, and that is the worse failure. A cut is dropped, and the ayah left whole, if the correction would leave less than 400 ms of recording after it.

A phrase still ends at **the start of the next phrase's first word**, plus that lag, never at the end of its own last word. The reciter's pause therefore belongs to the phrase before it, no word is clipped, and consecutive phrases leave no gap. `ClipPlayer` then opens a clip that begins part-way through a recording at its **first sound**, so a phrase does not start with the second of pause it was cut into; a clip that starts at the top of a recording keeps that recording's own opening silence, which is the breath between one ayah and the next.

### Where the reciter is actually asked to stop

`src/memorize/phrases.ts` decides where a verse may be cut, from the text alone, and the rule is stricter than "where stopping is permitted". Measured stop rates at the app's own cuts, over the same audio sample:

| boundary | share of the mushaf | Husary | Abdul Basit | Minshawi | cut here? |
| --- | --- | --- | --- | --- | --- |
| ۚ جائز | 38.8% | 98% | 93% | 84% | yes |
| ۗ قلى (الوقف أولى) | 11.8% | 100% | 96% | 68% | yes |
| ۘ لازم | 0.3% | too rare to measure | | | yes |
| ۖ صلى (الوصل أولى) | 28.8% | 72% | 29% | 67% | **no** |
| a clause word, no mark | 20.3% | 4% | 0% | 0% | **no** |
| any point mid-word (control) | | 8% | 9% | 12% | |

Cutting at ۖ and at clause words is what a reader heard as «المقطع يقطع قبل انتهاء نفس القارئ». Both are gone. The clause-word fallback was the clearer case: it stopped nowhere above the control rate, which is to say it carried no information at all, and it was a fifth of every cut in the mushaf. ۖ is the mark where continuing is *preferred*, and that is exactly what the reciters do.

The cost is real and worth stating: the ayat that split at all fall from 2,432 to 1,560, and the phrases in the mushaf from 10,256 to 8,380. A verse with no such mark now comes back whole, which is the honest answer: nothing in the text or in the timings says where inside it he takes his breath.

### Ayat left whole on purpose

An ayah keeps its timings out of the file, and plays whole, when:

- Quran.com's word count disagrees with the Tanzil tokenisation. Five ayat mushaf-wide (2:181, 8:6, 9:60, 13:18 and 13:37, where Quran.com joins `بَعْدَ مَا` into one word), plus a handful more per reciter where a segment is missing. 2 ayat for Dussary, 99 for Abdul Basit's murattal, and between the two for the rest.
- A cut falls inside a stretch the reciter recites **twice**. A teaching or mujawwad mushaf says a passage and then says it again, and the aligner reports the repeated words under their original indices, so a word before the cut can still be sounding after it and the following clip would open on words belonging to the phrase before it. The script now checks that everything up to a cut has finished before it, with 50 ms of tolerance, and drops the ayah if not: 88 ayat for Minshawi's mujawwad, 55 for Alafasy, 0 to 19 for the rest.

Coverage of the 1,560 ayat that split, as generated: Shuraim 1,555, Husary and Dussary 1,552, Husary Muallim 1,546, Minshawi 1,544, Sudais 1,537, Shatri 1,510, Abdul Basit's mujawwad 1,489, Alafasy 1,480, Abdul Basit 1,458, and Minshawi's mujawwad lowest at 1,398.

### What this still does not fix

Between 27% and 45% of the boundaries this app used to cut at were places the reciter never stopped, and dropping ۖ and the clause fallback removes most but not all of that: at the marks that remain he still runs on 0-2% of the time (Husary, Abdul Basit) and up to 32% (Minshawi at ۗ). The 300 ms lag is a constant standing in for a per-boundary measurement, and it lands inside real silence about half the time.

The fix for both is the same and it is a known next step: **verify the cuts against the audio offline**. For each ayah that splits, fetch the reciter's own per-ayah MP3 once, take a 10 ms RMS envelope, snap each cut to the nearest silence of 250 ms or more within about 1.5 s, and drop any boundary that has none. That is roughly 1,500 files per reciter, it needs `ffmpeg` on the machine running the script, and the output stays vendored data, so nothing changes at run time. It would replace both the constant and the static rule above with the thing they approximate.

Re-run the script only when a reciter is added, or the splitting rules in `src/memorize/phrases.ts` change, or `LAG` changes; the committed output is what the app ships.

## Updating

Download from the official source, review its release notes (https://tanzil.net/updates/ for the text), inspect the diff, regenerate the assets, and run the tests. Do not silently replace a pinned source during an install or a build.

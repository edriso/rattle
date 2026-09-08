# Data provenance

Two sets of data are committed to this repository rather than fetched at run time: the Quran text, and the phrase-boundary timings the session uses to cut an ayah's recording. Both are generated offline by a script, and neither is re-fetched during a build or an install.

Neither is ours to license. [NOTICE](../NOTICE) says whose they are and on what terms; everything written for this repository is [0BSD](../LICENSE) with no conditions at all. If you add a source, add it to both this file and NOTICE in the same pass.

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
- Eleven files for twelve reciters. Measured: 33 to 38 kB each as stored, 25 to 28 kB as built and 9 to 11 kB over the wire, down from 63, 47 and 17 under the looser splitting rule; loaded only when the learner drills at phrase level. Quote the built chunk rather than the stored JSON: Vite inlines the JSON into a chunk of its own, and the two differ by about a quarter.
- The twelfth reciter has no file: no source publishes word timings for أيمن سويد's mushaf, so it is drilled by the ayah. `cutsPhrases()` in `src/data/audio.ts` is what the app asks, and the start screen stops offering «جملة» when the answer is no.

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

### Cuts measured against the audio

`scripts/verify-cuts.ts` replaces the constant with a measurement, for the reciters it has been run on. For every ayah that splits it fetches that reciter's own per-ayah MP3 once, asks `ffmpeg` where the silences are (`silencedetect` at -40 dBFS), and then, for each cut, either leaves it alone because it already falls in a pause of 250 ms or more, moves it 80 ms into the nearest such pause, or drops it because there is none within 1.5 s, which means the text said the reciter stops there and the recording says he does not.

Run it from the repository root, reading only, and it prints what it would change:

```sh
node scripts/verify-cuts.ts husary          # one reciter
node scripts/verify-cuts.ts --write         # every reciter with a file
```

It needs `ffmpeg`, which nothing else here does, and downloads about 1,500 files per reciter, so it caches them under `work/audio/` (git-ignored) and a second run costs nothing. A file it has measured carries a `verified` date. **Re-running `prepare:timings` discards that**, because it writes the boundaries again from the text and the constant; run the verification after it.

Two properties worth knowing. It is **idempotent**: a second pass over a verified file changes nothing, because every cut already sits in a measured pause, which is a useful self-check. And it is **all or nothing per ayah**, because `buildSegments` only cuts an ayah that has exactly one boundary per gap between its phrases: a partial set is not something the app can use, so an ayah that loses one cut loses them all.

Measured over the whole mushaf, four recitations so far:

| | Husary (murattal) | Husary (المعلّم) | Abdul Basit (murattal) | Abdul Basit (المجوّد) |
| --- | --- | --- | --- | --- |
| cuts before | 2,124 | 2,105 | 1,967 | 1,969 |
| already inside a pause | 371 (17.5%) | **2,030 (96.4%)** | 341 (17.3%) | 5 (0.3%) |
| moved into one | 1,688 (79.5%) | 68 (3.2%) | 1,419 (72.1%) | 1,751 (88.9%) |
| median move | **+406 ms** | +106 ms | +347 ms | **−432 ms** |
| which way | 1,686 later | 64 later | 1,399 later | 1,674 **earlier** |
| no pause within 1.5 s | 65 (3.1%) | 7 (0.3%) | 207 (10.5%) | 213 (10.8%) |
| ayat that split | 1,552 → 1,489 | 1,546 → 1,539 | 1,458 → 1,270 | 1,489 → 1,284 |

Three findings, and the first is the one that matters.

**A constant cannot do this job, because its correct sign is not the same for every recitation.** Husary's cuts arrive a median 406 ms *early* and Abdul Basit's mujawwad a median 432 ms *late*, over roughly two thousand cuts each, and almost none of either goes the other way. So the 300 ms lag is not merely imprecise for one reciter and fine for another: it is helping the first and actively hurting the second by about the same amount. No single number could have been right, which is the whole argument for measuring. That also supersedes, for these recitations, the 290 ms figure recorded above from a 130-ayah sample. Abdul Basit's *murattal*, at +347 ms, is the one the constant nearly fits, which is the coincidence that made it look serviceable.

**The teaching mushaf was already nearly right.** 96.4% of الحصري المعلّم's cuts fell inside a real pause before anything was measured, against 17.5% for the same reciter's murattal, and what did move moved a quarter as far. That is what a teaching mushaf is: recited slowly with a deliberate stop at every stopping place, so the pauses are long enough that even an aligner recording no silence puts its boundary inside one. It is also, empirically, the case for what was asked for in the reading group, that this kind of repetition belongs on a teacher's mushaf rather than on any recording that happens to have timings.

**The mujawwad pays the most for it.** Abdul Basit's loses 205 ayat, a seventh of what it had, because 10.8% of its cuts have no pause within a second and a half of them. Melodic recitation holds and elongates where a murattal stops, so some of those marks he simply sings through. Those ayat now play whole, which is the honest answer, and they were being cut mid-breath before.

The constant is left where it is rather than tuned, because tuning one number to one reciter's evidence is the mistake this measurement exists to replace. The answer for a recitation still on the constant is to measure that recitation.

### What this still does not fix

Between 27% and 45% of the boundaries this app used to cut at were places the reciter never stopped, and dropping ۖ and the clause fallback removed most but not all of that: at the marks that remain he still runs on 0-2% of the time (Husary), 4-7% (Abdul Basit) and up to 32% (Minshawi at ۗ). For a verified reciter that residue is now gone, since a boundary with no pause is dropped outright.

What is left is the recitations that have not been measured, and they are not all waiting on the same thing.

### Five recitations cannot be measured this way at all

A gate at -40 dBFS only means something if a recording has somewhere for it to sit. Sampling 24 ayat spread across each of the twelve mushafs and reading the RMS envelope in 20 ms frames splits them in two, with nothing in between:

The six a gate can hear:

| recitation | noise floor | speech | apart | under -40 dBFS |
| --- | --- | --- | --- | --- |
| Minshawi (المجوّد) | −83.8 dBFS | −18.3 | 65.5 dB | 24.0% |
| Abdul Basit (المجوّد) | −73.9 | −22.2 | 51.7 | 19.6% |
| Abdul Basit (murattal) | −68.2 | −24.4 | 43.8 | 17.3% |
| Minshawi (murattal) | −64.9 | −21.2 | 43.6 | 15.1% |
| Husary (المعلّم) | −64.0 | −28.3 | 35.7 | 36.8% |
| Husary (murattal) | −58.2 | −24.4 | 33.7 | 15.7% |

And the five it cannot:

| recitation | noise floor | speech | apart | under -40 dBFS |
| --- | --- | --- | --- | --- |
| Ash-Shaatree | −40.2 | −24.6 | **15.6 dB** | 5.1% |
| Al-Afasy | −32.9 | −20.6 | **12.3** | 1.1% |
| Ad-Dussary | −28.6 | −17.0 | **11.6** | 0.2% |
| Ash-Shuraym | −30.5 | −20.1 | **10.4** | 0.3% |
| As-Sudais | −31.7 | −21.5 | **10.1** | 0.2% |

The first six have 34 to 66 dB between their speech and their own quietest stretches, and spend 15 to 37% of their length under the gate. The other five have 10 to 16 dB, and four of them have a **noise floor above the gate**, so they never cross it: they spend 0.2 to 5% of their length under -40 dBFS, most of that the lead-in of the file. These are modern masters, limited and reverberant, and there is no level a fixed gate could take that separates a pause from a held note in them.

Run blind, that failure is silent and looks like a finding. Sampling 60 ayat of each: Al-Afasy 0 of 95 cuts placed, Ad-Dussary 0 of 95, Ash-Shuraym 0 of 95, As-Sudais 0 of 91, Ash-Shaatree 2 of 94. Written, that would have emptied the phrase cuts of five of the twelve recitations and quietly withdrawn «جملة» from each, and the report would have read as five reciters who never stop for breath.

So `verify-cuts.ts` measures the mastering **before** it measures anything else, refuses to go on when a recitation has less than `MIN_RANGE` (24 dB, the middle of that gap) or a floor above the gate, and prints the two numbers so the refusal can be checked rather than believed. It also refuses to write a run that lost more than 30% of its ayat (`MIN_YIELD`), which is the same fault caught from the other end. `--force` overrides that second guard for somebody who has read the numbers; nothing overrides the first, because there is nothing to override it with.

Hearing these five would take a detector that follows the voice rather than the level: a spectral or onset measure, or a relative dip against the local speech level instead of an absolute floor. That is a project, not a flag.

### Two are measurable and only need running

Minshawi's murattal and mujawwad both pass the mastering check comfortably, and a 60-ayah sample places 88% and 53% of their cuts. Both need roughly 350 MB of downloads and twenty minutes, `node scripts/verify-cuts.ts minshawi --write`. Read the sample first: both press their largest move against the 1.5 s window, which means their true offset is *past* it and `WINDOW` needs widening before the full run is worth the bandwidth. Minshawi's murattal wants a median +971 ms and the mujawwad +861 ms, three times the constant, so a window sized for a 300 ms error is the wrong instrument for them.

Ayman Sowaid has no published word timings, so there is nothing to measure. `verified` in each timing file says which recitations have been measured.

Re-run `prepare:timings` only when a reciter is added, or the splitting rules in `src/memorize/phrases.ts` change, or `LAG` changes; then re-run the verification. The committed output is what the app ships.

## Updating

Download from the official source, review its release notes (https://tanzil.net/updates/ for the text), inspect the diff, regenerate the assets, and run the tests. Do not silently replace a pinned source during an install or a build.

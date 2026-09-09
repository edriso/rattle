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
- Eleven files for twelve reciters. Measured: 31 to 37 kB each as stored, 22 to 28 kB as built and 9 to 11 kB over the wire, down from 63, 47 and 17 under the looser splitting rule; loaded only when the learner drills at phrase level. Quote the built chunk rather than the stored JSON: Vite inlines the JSON into a chunk of its own, and the two differ by about a quarter.
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

Those are the figures the generator writes. Measuring against the audio takes some of them back down, since a cut with no pause under it is dropped: as shipped, Husary Muallim covers 1,541 of the 1,560, Husary 1,517, Abdul Basit's mujawwad 1,374 and his murattal 1,277. `src/data/timings.test.ts` checks every shipped file against what `buildSegments` requires of it, because that function answers a bad set of cuts by playing the ayah whole, which is right at run time and silent. `src/data/timings.test.ts` checks every shipped file against what `buildSegments` requires of it, because that function answers a bad set of cuts by playing the ayah whole, which is right at run time and silent.

### Cuts measured against the audio

`scripts/verify-cuts.ts` replaces the constant with a measurement, for the reciters it has been run on. For every ayah that splits it fetches that reciter's own per-ayah MP3 once, asks `ffmpeg` where the silences are (`silencedetect` at -40 dBFS), and then, for each cut, either leaves it alone because it already falls in a pause of 250 ms or more, moves it 80 ms into the nearest such pause, or drops it because there is none within `WINDOW` of it, which means the text said the reciter stops there and the recording says he does not.

Run it from the repository root, reading only, and it prints what it would change:

```sh
node scripts/verify-cuts.ts --hearing            # can a gate hear these at all? 24 files each
node scripts/verify-cuts.ts husary               # one reciter, reading only
node scripts/verify-cuts.ts minshawi --limit=60  # a sample, to try the pipeline out
node scripts/verify-cuts.ts husary --write       # write what it measured
node scripts/verify-cuts.ts --write              # every reciter with a file
```

`--hearing` is the thing to ask first: it reads the mastering and stops, which costs two dozen files rather than fifteen hundred, and it answers whether a level gate can find anything in a recitation before an hour is spent finding out the slow way.

`--limit=N` measures the first N ayat and will not combine with `--write`, because writing a partial pass would throw away every ayah it did not reach. It is for trying the pipeline out and **not** for deciding whether a recitation is worth measuring: the first sixty ayat of a mushaf are not a sample of it, and a limited run once put Minshawi's yield at 88% where the whole file gives 62.6%. `--force` writes a run that fell below `MIN_YIELD` anyway; read the numbers first, and read the section on Minshawi below before believing that a low yield is a fact about the reciter.

It needs `ffmpeg`, which nothing else here does, and downloads about 1,500 files per reciter, so it caches them under `work/audio/` (git-ignored) and a second run costs nothing. A file it has measured carries a `verified` date, and `prepare:timings` now **leaves such a file alone and says so**, because it cannot reproduce what is in it: those boundaries came from listening to the recordings, and all that script has is the text and a constant. So adding a reciter needs no flag and costs nothing that was measured. `prepare:timings -- --force` overwrites anyway, which is right for a change to the splitting rules or to `LAG`, and then the file needs measuring again. (That flag is unrelated to `verify-cuts`'s own `--force`, which overrides the yield floor.)

Two properties worth knowing. It is **idempotent**: a second pass over a verified file changes nothing, because every cut already sits in a measured pause, which is a useful self-check. And it is **all or nothing per ayah**, because `buildSegments` only cuts an ayah that has exactly one boundary per gap between its phrases: a partial set is not something the app can use, so an ayah that loses one cut loses them all.

Measured over the whole mushaf, four recitations so far, at a window of 2,500 ms:

| | Husary (murattal) | Husary (المعلّم) | Abdul Basit (murattal) | Abdul Basit (المجوّد) |
| --- | --- | --- | --- | --- |
| cuts before | 2,124 | 2,105 | 1,967 | 1,969 |
| already inside a pause | 371 (17.5%) | **2,030 (96.4%)** | 341 (17.3%) | 5 (0.3%) |
| moved into one | 1,716 (80.8%) | 70 (3.3%) | 1,427 (72.5%) | 1,846 (93.8%) |
| median move | **+409 ms** | +107 ms | +354 ms | **−435 ms** |
| which way | 1,714 later | 66 later | 1,401 later | 1,745 **earlier** |
| no pause in the window | 37 (1.7%) | 5 (0.2%) | 199 (10.1%) | 118 (6.0%) |
| ayat that split | 1,552 → 1,517 | 1,546 → 1,541 | 1,458 → 1,277 | 1,489 → 1,374 |
| cuts written | 2,067 | 2,095 | 1,699 | 1,783 |

Three findings, and the first is the one that matters.

**A constant cannot do this job, because its correct sign is not the same for every recitation.** Husary's cuts arrive a median 409 ms *early* and Abdul Basit's mujawwad a median 435 ms *late*, over roughly two thousand cuts each. Husary's is almost unanimous, 1,714 of 1,716 going one way; the mujawwad's is 1,745 of 1,846, with 101 going the other at a median +915 ms. So the 300 ms lag is not merely imprecise for one reciter and fine for another: it is helping the first and actively hurting the second by about the same amount. No single number could have been right, which is the whole argument for measuring. That also supersedes, for these recitations, the 290 ms figure recorded above from a 130-ayah sample. Abdul Basit's *murattal*, at +354 ms, is the one the constant nearly fits, which is the coincidence that made it look serviceable.

**The teaching mushaf was already nearly right.** 96.4% of الحصري المعلّم's cuts fell inside a real pause before anything was measured, against 17.5% for the same reciter's murattal, and what did move moved a quarter as far. That is what a teaching mushaf is: recited slowly with a deliberate stop at every stopping place, so the pauses are long enough that even an aligner recording no silence puts its boundary inside one. It is also, empirically, the case for what was asked for in the reading group, that this kind of repetition belongs on a teacher's mushaf rather than on any recording that happens to have timings.

**What the mujawwad pays is mostly the measurement, and what the murattal pays is real.** At a 1,500 ms window Abdul Basit's mujawwad looked like the expensive one: it dropped 205 ayat, a seventh of what it had. Widening the window to 2,500 gave 90 of them back, because a mujawwad's offsets are simply wider, and its loss is now 115. His *murattal* dropped 188 at the narrower window and got only 7 back, and 30 of its cuts have no pause anywhere in the ayah at all, at any window. So the murattal is now the one that pays most, 181 ayat, and that cost is a fact about the recording rather than about the tool: he recites through those marks. Those ayat play whole, which is the honest answer, and they were being cut mid-breath before.

The constant is left where it is rather than tuned, because tuning one number to one reciter's evidence is the mistake this measurement exists to replace. The answer for a recitation still on the constant is to measure that recitation.

### The window, and the 127 ayat a narrower one had dropped

`WINDOW` was 1,500 ms when these four were first measured, sized for an error of a few hundred milliseconds. Between 0.5% and 14% of each was dropped for having no pause inside it: 63 ayat of Husary's murattal, 7 of his المعلّم, 188 of Abdul Basit's murattal and 205 of his المجوّد. Re-measured at 2,500, **127 of those 463 came back**, and 192 cuts with them.

Doing that is safe, and provably rather than probably. The window decides only whether a correction is *accepted*; which pause a cut belongs in, and where inside it the cut lands, are read off the recording. So re-measuring a file at a wider window can only ever add, and the check bears it out: across the four, 127 ayat recovered, **0 lost and 0 altered** of the 5,582 already there. `scripts/verify-cuts.test.ts` pins the property over two thousand generated pause layouts, and `judge` takes the window as an argument so it can.

And the 192 cuts that came back were then re-read off the audio independently of the pass that placed them: **all 192 sit inside a detected pause of 250 ms or more**, which is the property the file claims for every cut in it.

It was re-measured from the **committed constant-placed boundaries in git history**, not from a fresh `prepare:timings --force`. That is not a shortcut. Nothing that feeds the generation had changed since those files were written, so the two are the same input, and taking it from history means the comparison is against exactly what the first measurement saw rather than against whatever the API returns today. A re-derivation would have confounded recovery with drift, and cost 456 API requests to do it.

What the window is now sized against is the measured offsets, not a guess: the largest median measured over a whole mushaf is 578 ms, and 2,500 is more than four times that. It is still the binding constraint for a small tail, the largest single moves coming to 2,432, 2,139, 2,444 and 2,491 ms, and that is intended. Past a certain distance a correction is a different boundary rather than the same one measured.

One recitation is missing from that reckoning, and it is the one most likely to test it. Minshawi's mujawwad has never been measured over its whole mushaf; its only figures come from the 60-ayah samples this section discards as unrepresentative, and those put its median between 861 and 1,045 ms. If the real figure is near a second, 2,500 is about two and a half times it rather than four, and the window would want looking at again when that recitation is finally measured.

### What this still does not fix

Between 27% and 45% of the boundaries this app used to cut at were places the reciter never stopped, and dropping ۖ and the clause fallback removed most but not all of that: at the marks that remain he still runs on 0-2% of the time (Husary), 4-7% (Abdul Basit) and up to 32% (Minshawi at ۗ). For a verified reciter that residue is now gone, since a boundary with no pause is dropped outright.

What is left is the recitations that have not been measured, and they are not all waiting on the same thing.

### Five recitations cannot be measured this way at all

A gate at -40 dBFS only means something if a recording has somewhere for it to sit. Sampling 24 ayat spread across each of the eleven mushafs that have timings, and reading the RMS envelope in 20 ms frames, splits them in two with nothing in between:

The six a gate can hear:

| recitation | noise floor | speech | apart | under -40 dBFS |
| --- | --- | --- | --- | --- |
| Minshawi (المجوّد) | −86.9 dBFS | −20.7 | 66.2 dB | 19.5% |
| Abdul Basit (المجوّد) | −69.0 | −22.6 | 46.3 | 20.3% |
| Husary (المعلّم) | −63.9 | −29.1 | 34.8 | 38.7% |
| Husary (murattal) | −62.6 | −24.4 | 38.2 | 17.3% |
| Abdul Basit (murattal) | −58.9 | −24.3 | 34.6 | 14.4% |
| Minshawi (murattal) | −53.8 | −21.3 | 32.5 | 10.0% |

And the five it cannot:

| recitation | noise floor | speech | apart | under -40 dBFS |
| --- | --- | --- | --- | --- |
| Ash-Shaatree | −37.5 | −21.5 | **16.0 dB** | 3.5% |
| Al-Afasy | −36.1 | −22.3 | **13.8** | 2.6% |
| Ad-Dussary | −26.8 | −14.8 | **12.1** | 0.2% |
| As-Sudais | −30.9 | −19.7 | **11.2** | 0.2% |
| Ash-Shuraym | −32.1 | −22.0 | **10.1** | 0.5% |

The first six have 32 to 66 dB between their speech and their own quietest stretches, and spend 10 to 39% of their length under the gate. The other five have 10 to 16 dB, and **every one of them has a noise floor above the gate**, so it is never crossed: they spend 0.2 to 3.5% of their length under -40 dBFS, most of that the lead-in of the file. These are modern masters, limited and reverberant, and there is no level a fixed gate could take that separates a pause from a held note in them.

Two dozen ayat carry a couple of dB of sampling variance, so a re-run will differ in the decimal: Husary reads 38.2 dB over the 1,552 ayat he had before the window widened and 40.4 over the 1,517 he has after. The gap the decision sits in is 16 dB wide, so this does not come near mattering, which is the point of leaving `MIN_RANGE` in the middle of it.

These figures replace a first set that was **measured wrong**, and the way it was wrong is worth keeping. They were taken from `--limit=60` runs, which sampled the front of each file rather than the mushaf, and the sampling code drew its two dozen ayat from the limited set. That put Minshawi's murattal at 43.6 dB of range where the mushaf-wide answer is 32.5, and Ash-Shaatree's floor just below the gate where it is in fact above it, like the other four. `verify-cuts.ts` now samples across the whole file whatever `--limit` says, because a verdict on a recitation should not depend on how much of it somebody asked for.

Run blind, that failure is silent and looks like a finding. Sampling 60 ayat of each: Al-Afasy 0 of 95 cuts placed, Ad-Dussary 0 of 95, Ash-Shuraym 0 of 95, As-Sudais 0 of 91, Ash-Shaatree 2 of 94. Written, that would have emptied the phrase cuts of five of the twelve recitations and quietly withdrawn «جملة» from each, and the report would have read as five reciters who never stop for breath.

So `verify-cuts.ts` measures the mastering **before** it measures anything else, refuses to go on when a recitation has less than `MIN_RANGE` (24 dB, the middle of that gap) or a floor above the gate, and prints the two numbers so the refusal can be checked rather than believed. It also refuses to write a run that lost more than 30% of its ayat (`MIN_YIELD`), which is the same fault caught from the other end. `--force` overrides that second guard for somebody who has read the numbers; nothing overrides the first, because there is nothing to override it with.

Hearing these five would take a detector that follows the voice rather than the level: a spectral or onset measure, or a relative dip against the local speech level instead of an absolute floor. That is a project, not a flag.

### Minshawi passes the mastering check and still cannot be measured, and the gate is why

A 60-ayah sample put Minshawi's murattal at 88% of ayat placed and made it look like the obvious next recitation to measure. Run over the whole mushaf it places **62.6%**, and `MIN_YIELD` refused to write it. Nothing was written, and that refusal was right.

The 88% was the biased sampling described above, and so was the 43.6 dB of range and the near-1 s median. Mushaf-wide the murattal's median offset is 578 ms, not a second, and 31.9% of its cuts came back with no pause inside the window: 156 with none anywhere in the ayah, and 516 whose nearest pause is a median 7.9 s away.

That reads like a reciter who runs through the marks. He does not. Sweeping the gate over the same 300 ayat throughout, with a mid-phrase control to catch a gate that has simply become permissive, points at the detector instead. Every figure in this table is over that sample, so the −40 dBFS row reads 67.0% where the mushaf-wide answer is 62.6%; they are compared with each other and not with the whole file:

| gate | ayat keeping a full set | cuts placed | called a pause **mid-phrase** |
| --- | --- | --- | --- |
| −40 dBFS (shipped) | 67.0% | 70.6% | 1.2% |
| −36 | 80.0% | 84.0% | 1.3% |
| −32 | 90.0% | 92.0% | 1.4% |
| −28 | 98.0% | 98.5% | 1.9% |

The control is what makes this evidence rather than a knob being turned until the number improved. Two points are taken in the stretch running up to each cut, a third and two thirds of the way along it, 776 in all; they are inside a phrase and cannot be places he stopped. The share of them a gate mistakes for a pause barely moves, 1.2% to 1.9%, while real placement goes from 71% to 98%. For comparison, the same sweep over 250 ayat of Husary's constant-placed cuts, which the shipped gate places 98.8% of within that sample, mistakes 3.0% of mid-phrase points at −40 dBFS and 4.3% at −28. **A gate loose enough to hear all of Minshawi is still less trigger-happy than the one that already works on Husary.**

It is the gate specifically, and not the 250 ms a pause has to last. Relaxing that to 120 ms, which is a consonant closure rather than a stop, takes the murattal only from 67.0% to 76.0%.

So his pauses are real and simply never get quiet enough to cross a line drawn at a fixed −40 dBFS. What the sweep locates is not their level directly but where a gate has to sit to find them: −32 catches 90% of them and −28 catches 98%, so most bottom out somewhere between −40 and −28. His noise floor, −53.8 dBFS, is the highest of the six, and what fills the pause above it is reverb and room rather than silence.

**What this does not yield is a one-line fix**, and the three obvious reparameterisations were each tried against the measured floors and speech levels:

- a fixed gate, which is what ships: right for four, and 8 to 12 dB too strict for Minshawi, who needs −32 to place 90% of his ayat and −28 to place 98%.
- `floor + 22 dB`, which fits Husary (−40.6) and Minshawi (−31.8) neatly, and then hands Abdul Basit's mujawwad −47.0 and Minshawi's own mujawwad −64.9, both far stricter than the −40 that already measures them well. Their floors are low because the recordings are quiet and wide, not because their pauses are.
- `speech − 15 dB`, which fits Husary at −39.4 and gives Minshawi −36.3, where he places 80%.

The gate has to come from the shape of each recitation's own level distribution, the valley between the mode its speech sits in and the mode its quiet sits in, and it has to be validated per recitation against a control of the kind above. That is the project, and it is now a well-posed one: an envelope the script already computes, a threshold rule to choose, and a false-positive measure to judge it by. It would unlock Minshawi's two, and on the numbers above it will not unlock the five modern masters, whose floors sit above where their pauses would have to be.

Until then Minshawi stays on the constant, which is wrong by a median 578 ms and does not pretend to have listened.

Ayman Sowaid has no published word timings, so there is nothing to measure. `verified` in each timing file says which recitations have been measured.

Re-run `prepare:timings` only when a reciter is added, or the splitting rules in `src/memorize/phrases.ts` change, or `LAG` changes. Adding a reciter needs nothing else. A rules change needs `--force`, because the measured files are measured against the old rules, and then `npm run verify:cuts` to measure them against the new ones. The committed output is what the app ships.

## Updating

Download from the official source, review its release notes (https://tanzil.net/updates/ for the text), inspect the diff, regenerate the assets, and run the tests. Do not silently replace a pinned source during an install or a build.

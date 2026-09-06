# AGENTS.md

Notes for anyone — human or AI — working on Rattil.

## What this app is

Rattil (`رَتِّلِ`) helps people memorise the Quran. It is a small web app. It has
no server, no database, and no accounts. Everything runs in the browser, and
everything the user does stays on their own device.

The app has two screens you can work in:

- **A talqeen session** (`جلسة التلقين`). The app plays a piece of the Quran,
  you repeat it, and then it joins that piece to the pieces before it. This is
  the main screen.
- **Free review** (`مراجعة حرة`). It shows one to five ayat. You can hide them,
  read from memory, and record yourself.

The whole interface is in Arabic and reads right to left. Code and comments are
in English.

## Commands

```sh
npm install
npm run dev        # local server
npm test           # vitest, no watch
npm run lint       # oxlint
npm run format     # oxfmt
npm run build      # type check, then build
```

Run `npm test`, `npm run lint` and `npm run build` before you commit. All three
must pass. The GitHub Pages workflow runs the same three.

Two more commands regenerate data that is committed to the repo. You almost
never need them. See "Data" below.

```sh
npm run prepare:quran
npm run prepare:timings
```

## Where things are

```
src/
  App.tsx        the shell: picks which screen to show
  data/          the Quran text, the reciters, the timings, saved settings
  memorize/      all the memorisation logic (see src/memorize/AGENTS.md)
  components/    the screens and the panels
  routes/        one route, only used for the page title and meta tags
components/ui/   shadcn parts, generated. Do not hand-edit them.
scripts/         offline tools that build the committed data
data/            the original Quran text file, its checksum, and its provenance
```

`src/memorize` holds the method. Only the files named `use*.ts` know about
React. Everything else is plain functions and classes, so you can test it
without a browser. Keep it that way.

## Rules you must not break

**Never change the Quran text.** The files in `src/data/surahs/` come from the
Tanzil project. The licence says the text must stay exactly as it is. A test
checks all 6,236 ayat against the original file, byte for byte. If that test
fails, you broke something. Do not "fix" the text, and do not remove the
licence notice inside each file.

**The basmala is not part of ayah 1.** The source file puts
`بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ` at the front of ayah 1 in every surah
except al-Fatihah and at-Tawbah. The reciter records it separately, so the
audio does not have it. Use `openVerse()` from `src/data/verse.ts` to split it
off before you show an ayah or line it up with audio.

**Only split a verse where a reciter may stop.** Long ayat are cut at the waqf
marks (pause marks) already inside the text: `ۖ` `ۗ` `ۘ` `ۚ`. Never cut at `ۙ`
(stopping is forbidden there), at `ۛ` (you may stop at only one mark of a pair),
or at `ۜ` (a short pause taken without breathing). A mark only counts when the
whole space-separated token is made of mark characters. `src/memorize/phrases.ts`
does this. Do not loosen it.

**Do not send user data anywhere.** Recordings live in memory and are deleted
when the ayah changes or the page closes. Settings and the review plan go in
`localStorage` and nowhere else.

## Data

Two sets of data are generated once and committed. The app never fetches them
at run time.

- **The Quran text**, from Tanzil. `scripts/prepare-quran.mjs` turns
  `data/quran-uthmani.txt` into one JSON file per surah.
- **Phrase timings**, from Quran.com word timings.
  `scripts/prepare-timings.ts` works out where inside each ayah's recording the
  phrases begin, and writes one file per reciter (about 46 KB each). The app
  loads a reciter's file only when the user drills phrase by phrase.

Both scripts run with plain `node` (Node 22 strips the types). Read
`data/README.md` before you touch either. If you add a reciter, or change the
splitting rules in `phrases.ts`, run `npm run prepare:timings` again.

Audio itself is **not** committed. It is fetched from `everyayah.com`, one MP3
per ayah. That host sends `access-control-allow-origin: *`, which is what lets
the app decode and cut the audio. Many other Quran audio hosts do not send that
header, so you cannot simply swap the URL.

## Style

- Copy shown to the user is Arabic. Names in code are English.
- Comments say **why**, not what. If a line looks odd, explain the reason. Do
  not narrate what the code already says.
- Numbers shown to the user use Arabic-Indic digits and correct Arabic grammar.
  Use the helpers in `src/data/arabic.ts` (`arabic`, `ayatCount`, `timesCount`,
  `minutesCount`, `daysCount`) rather than writing `${n} آيات` by hand.
- Do not add a dependency unless there is no reasonable way around it. The app
  ships almost nothing beyond React and the UI parts it already has.
- The linter runs the React Compiler rules and is strict. It will reject
  reading a ref during render, and calling `setState` straight from an effect
  body. Restructure the code instead of silencing the rule.
- Every touch target is at least 44 by 44 pixels. Every control has a label.
  Text meets WCAG AA contrast in both the light and the dark theme, and in all
  four accent colours.

## Tests

Tests sit next to the code they cover. They are written to say what the app
must do, not to describe the code. Two kinds:

- **Plain tests** for `src/memorize` and `src/data`. No browser needed.
  `runtime.test.ts` drives a whole session with a fake audio layer and a fake
  clock, so you can test playback without any sound.
- **jsdom tests** for the screens. `session-ui.test.tsx` stubs `AudioContext`
  and `fetch` and runs the real app.

When you fix a bug, add the test first. Several tests exist only because a bug
got through once; the comment above them says which.

## Traps that have caught people before

**Audio will not start without a tap.** A browser leaves the audio context
suspended until the user interacts with the page. Worse, Chrome leaves
`AudioContext.resume()` _pending_ rather than rejecting it, so waiting on it
looks like the app has frozen. A session therefore starts by itself only when
`navigator.userActivation.hasBeenActive` is not `false`. Otherwise the play
button is the way in. Do not remove that check.

**Decoded audio is thrown away.** The player keeps about seven minutes of
decoded sound and drops the oldest beyond that. So "I loaded this once" is not
the same as "this is ready to play". Always ask the player with
`Audio.cached(url)`. The session used to trust its own memory and went silent
on long passages.

**A phone that locks can suspend the audio context.** The clock then stops. The
session watches `Audio.running` and shows itself as paused, so the user has a
way forward instead of a frozen screen.

**`AudioBufferSourceNode.start(when, offset, duration)`** counts `duration` in
seconds of the buffer's own content. Playback rate does not change it. Do not
divide it by anything.

**Repetition grows fast.** Joining every new segment to _all_ the earlier ones
turns a twenty-ayah passage into a four-hour session. The default joins only
the last two. If you change this, check the estimate the home screen shows.

## If you are adding a feature

Good next steps, roughly in order of value:

1. Highlight each word as it is recited. The committed timing data already has
   what this needs.
2. Give the review plan its own screen. Today the home screen shows only the
   first two items that are due.
3. Drill the join between one passage and the next as its own item. Research on
   hifz says that join is where memorisation usually breaks, and the app does
   not practise it yet.

# AGENTS.md

Notes for anyone — human or AI — working on Rattil.

## What this app is

Rattil (`رَتِّلِ`) helps people memorise the Quran. It is a small web app. It has
no server, no database, and no accounts. Everything runs in the browser, and
everything the user does stays on their own device.

The app has two screens you can work in:

- **A talqeen session** (`جلسة التلقين`). The app plays a piece of the Quran,
  you repeat it in the silence it leaves, and then it joins that piece to the
  pieces before it. This is the main screen. Repeating is not required: the
  home screen also offers `أستمع فقط`, where the same steps run with no gaps
  for people who want to hear a passage over and over.
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
components/ui/   the eight shadcn parts the app actually uses, generated.
                 Do not hand-edit them, and do not pull the whole library
                 back in: `npx shadcn add <part>` fetches only what you need.
scripts/         offline tools that build the committed data
data/            the original Quran text file, its checksum, and its provenance
```

There is no router. The app shows one screen at a time, chosen from the saved
preferences, and the title and social tags are static in `index.html` where a
crawler reads them without running any JavaScript.

`src/memorize` holds the method. Only the files named `use*.ts` know about
React. Everything else is plain functions and classes, so you can test it
without a browser. Keep it that way.

## Keyboard

Every key lives in one file, `src/usePracticeNavigation.ts`, and both screens
use it.

| Key             | What it does                                     |
| --------------- | ------------------------------------------------ |
| `←` or `Enter`  | next step, or next ayat                          |
| `→`             | previous                                         |
| `Space` or `↑`  | play and pause, and end the echo gap early       |
| `↓`             | play this step again, or turn looping on and off |
| `Shift + Enter` | start or stop recording (free review)            |
| `Shift + Space` | play your own recording                          |

Two things to know before you change any of this.

**A focused button owns `Space` and `Enter`.** That is how a button works in
every browser, and taking it away would break the app for anyone using a
keyboard or a screen reader. So once someone tabs or taps onto a button, those
two keys no longer reach the drill. That is why each of them has an arrow that
does the same job: no button ever claims an arrow.

**Use arrows, not letters.** A shortcut made of a plain letter, number or
symbol has to be switchable off or remappable to pass WCAG 2.1.4. Arrows,
`Space`, `Enter`, `Esc`, `Home`, `End`, `Page Up` and `Page Down` are exempt.
Taking `↑` and `↓` does cost the page its arrow scrolling, so leave `Page Up`,
`Page Down`, `Home` and `End` alone. Inside a verse frame that holds more text
than it shows, the arrows go back to reading: `scrolls()` in the hook checks
that before the shortcut runs.

If you add a key, add it in four places: the hook, the `aria-keyshortcuts` and
`title` of the button it belongs to, the list in the settings sheet
(`src/components/Sheets.tsx`), and the README.

## The start screen fits the screen

Everything on the start screen is spaced from one rhythm, `--gap`, declared on
`.start-main` and shrinking with the viewport's own height. It is what lets the
form fit a phone without «ابدأ» falling off the bottom, and still breathe on a
desktop. Two rules go with it:

- Space that screen **through `--gap`**, never with a fresh fixed number, and
  give every use a fallback (`var(--gap, 16px)`). The variable is declared
  nowhere else, so the same rule keeps its old spacing in the sheets, which is
  why `.ayah-field` can be shared between the start screen and the picker.
- The old code tuned the same margins again in two media queries, which is why
  editing the base rule appeared to do nothing. There is one place now. If a
  short screen needs more, shrink `--gap` there rather than re-listing every
  margin.

## The verse frame

The box holding the ayat keeps its size. Ayat differ in length by a factor of
thirty, so a box that grew with the text would move every control under it each
time the reader moved on, and people aim at those controls. `.verse-space` in
`src/styles.css` therefore has `flex-basis: 0`, scrolls its own overflow, and
fades at both edges instead of cutting a line in half.

Four things depend on that and are easy to break:

- `flex-basis` is the length `0`, not the `0%` that `flex: 1` already sets. The
  line looks redundant and is not: a percentage cannot resolve while the row is
  being measured, so it falls back to the height of the text, and the longest
  ayah pushes the controls a thousand pixels down the page again.
- The frame is a tab stop (`tabIndex={0}`), because a scrolling box a keyboard
  cannot reach is a box whose text a keyboard cannot read. That is why
  `.oxlintrc.json` allows `tabIndex` on `section`.
- The edge fade sits behind `@supports (mask-clip: no-clip)`. A plain mask is
  clipped to the frame, and it eats the focus ring with it.
- The line above the play controls (`.session-phase`) keeps its height while it
  is empty. It fills and empties several times a step.

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
header, so you cannot simply swap the URL. `cdn.islamic.network` is one that
does not: it has the same recitations and no CORS header at all.

Every recording has a **second address**, on the mirror Quran.com serves its own
audio from, and a fetch that fails falls through to it. `ayahAudioUrl()` mints
the first address, which stays the one a recording is cached and keyed under;
`audioMirrors()` returns the rest. Two things to know before you touch either:

- The mirror does not carry `Abdurrahmaan_As-Sudais_64kbps` or
  `Saood_ash-Shuraym_64kbps`. Those two fall through to the 192 and 128 kbps
  cuts of the same reading. Measured over eleven ayat from 2 to 43 seconds
  long, the higher cut runs a **constant** 78.7 ms (Sudais) and 34.1 ms
  (Shuraym) longer, whatever the ayah: encoder padding, not drift that piles
  up. So a phrase cut lands within a tenth of a second of where the vendored
  timings put it, and no correction is worth carrying. That is what a
  reciter's `mirror` field is for. If you add a reciter, check its folder on
  the mirror and set the field when the name differs.
- Both hosts sit behind the same CDN. This carries a session through an origin
  or a folder going missing, not through that CDN going down. A genuinely
  independent third address would have to be storage someone owns and pays
  for, which the app deliberately does not have.
- Nothing in the test suite can prove the mirror still resolves; the tests pin
  the strings the code builds, and a network test in CI would be flaky. Check
  it by hand when you touch this, and after a long gap:

  ```sh
  for f in $(grep -oE "(folder|mirror): '[^']+" src/data/audio.ts | cut -d"'" -f2); do
    printf '%-34s %s\n' "$f" \
      "$(curl -sS -o /dev/null -w '%{http_code}' -r 0-0 \
         https://mirrors.quranicaudio.com/everyayah/$f/002027.mp3)"
  done
  ```

  Expect 206 for every `mirror:` folder and for the seven `folder:` values the
  mirror shares. The two 64 kbps folders it does not carry return 404, which
  is why they have a `mirror:` of their own.

**The address that answers belongs to the run.** In `useRangeAudio` the media
element remembers which address worked and keeps it for the rest of the range,
rather than starting from the unreachable one again at every ayah. It goes back
to the recording's own address only once nowhere answers, so a retry after the
network comes back starts from the right place.

## Style

- Copy shown to the user is Arabic. Names in code are English.
- Comments say **why**, not what. If a line looks odd, explain the reason. Do
  not narrate what the code already says.
- Numbers shown to the user use Arabic-Indic digits and correct Arabic grammar.
  Use the helpers in `src/data/arabic.ts` (`arabic`, `ayatCount`, `timesCount`,
  `minutesCount`, `daysCount`) rather than writing `${n} آيات` by hand.
- **A field that takes a number is never `type="number"`.** That field silently
  throws away ٢٥٥, which is what an Arabic keyboard types, and it can only show
  Latin digits. Use `type="text"` with `inputMode="numeric"`, show the value
  through `arabic()`, and read it back through `digits()`, which accepts either
  set of numerals.
- Do not add a dependency unless there is no reasonable way around it. The app
  ships almost nothing beyond React and the UI parts it already has.
- The linter runs the React Compiler rules and is strict. It will reject
  reading a ref during render, and calling `setState` straight from an effect
  body. Restructure the code instead of silencing the rule.
- Every touch target is at least 44 by 44 pixels. Every control has a label.
  Text meets WCAG AA contrast (4.5:1) in both the light and the dark theme and
  in all four accent colours, and every control's edge meets the 3:1 that
  WCAG 1.4.11 asks for — that is what `--control-border` is for, and why it is
  a different token from the quiet `--border` used for separators.
- Do not fade text with `opacity` to show it is secondary. Opacity multiplies
  against the background and quietly drops the contrast below AA; use
  `--muted-foreground`, which is chosen to pass.
- A control that becomes unavailable while it holds focus uses `aria-disabled`,
  not `disabled`. A `disabled` button drops the keyboard on the floor the
  moment it is pressed.

## The panels

The two sheets — the passage picker and the settings — and the grading sheet
share `Panel` in `src/components/Sheets.tsx`. Three things about them are
deliberate:

- They open with the cursor on their **title**, not on the close button.
  Landing on «إغلاق» reads as though leaving were the thing to do, and a
  screen reader hears "close" instead of the panel's name. That is what
  `initialFocus` is for; do not drop it.
- The surah box is a **search field that happens to show where you are**.
  Opening it empties it, so nobody has to delete البقرة before looking for
  آل عمران, and closing it without choosing puts the name back. The name to
  restore comes from a ref, not from the rendered selection: picking a surah
  closes the list in the same breath, and a handler would still be holding the
  previous one.
- Anything the panel says about the app rather than about a setting belongs in
  the `.sheet-about` footer at the end, not as another note under the last
  control.

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

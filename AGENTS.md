# AGENTS.md

Notes for anyone, human or AI, working on Rattle.

## What this app is

Rattle (`رَتِّل`) helps people memorise the Quran. It is a small web app. It has
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

A few more commands regenerate or check something that is committed to the
repo. You almost never need them. See "Data" below, and each script's own
header comment.

```sh
npm run prepare:quran
npm run prepare:timings
npm run verify:cuts        # then measure those cuts against the recordings
npm run assets             # the share card and the icons, in headless Chrome
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
docs/            CONTRIBUTING.md, the walk-through for a first change
LICENSE          0BSD: everything written here, with no conditions at all
NOTICE           what this repository only redistributes, and on whose terms
```

New to the repository? Read [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md)
first. It walks through one change end to end and says which of these files
to open for which kind of task. This file is the reference behind it.

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
| `←` or `Enter`  | forward: next step, next ayat, or end a timed turn |
| `→`             | previous                                         |
| `Space` or `↑`  | play and pause, and continue in «أنا أتحكّم»      |
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

## The start screen carries the session options

Everything that decides what a sitting will be is on that one screen and
**drawn on it**: the passage, how much of it a repetition covers, whether the
learner repeats aloud, how many times each step runs, and who recites. A
reader asked for the repetition counts here, in these words, «وأرى أن وجوده
في الشاشة الرئيسية بجانب بقية خيارات الجلسة سيكون أسهل»: beside the other
options, which means visible, not one tap behind a disclosure. They were put
behind a disclosure once. That was half an answer, and it is not what was
asked for.

The counts are three columns rather than three rows, which is what makes them
affordable: **87px against 150**. Each is bordered as one control, because
three bare triples of «− ٣ +» leave less space between one count's minus and
the next count's plus than between either and its own number, and the eye
groups by proximity. Their buttons narrow with the viewport (`clamp`), 30 to
38 wide by 44 tall, so a 320px screen does not overflow sideways: three of
them share one phone's width, and that is the one place in the app where a
target is under 44 in its narrow dimension. It is still well over the 24px
WCAG 2.5.8 asks for, and the dimension a finger actually aims down has not
moved.

The reciter shares the estimate's row, because his pace is what the estimate
is mostly saying: the slowest mushaf here takes three times as long over a
passage as the quickest, and whether «جملة» can be offered at all depends on
him. He shows a `short` name, which every reciter must carry, and the whole
name as the button's accessible name. It opens the settings sheet with the
cursor on him, through `landOn`.

What stays in the sheet is `linkBack`, the number of previous segments a وصل
step reaches back over. That shapes the method rather than the length of a
sitting, and its default of two is the method as taught.

Two labels on that screen were earned the hard way, and both are about the
words around a counted noun rather than the noun itself.

The range presets say «طول المدى» **on the screen**, not only in the
accessible tree, because a reader took «٣ آيات» under the ayah fields for a
repetition count while the row below said «٣ آيات» too, about something else.
Check a new label against the whole screen, not against its own row.

And the grain row is «مقدار المقطع», which is the name README gives the same
control, and **not** «يُكرّر كل». «كل» is a مضاف, so everything under it is
مجرور, and `grainLabel(2)` returns the nominative dual «آيتان»: the legend
made the screen read «كل آيتان». A label that governs the labels beneath it
has to agree with all of them, and the labels here come from a shared
counter that cannot know what is above it. Prefer a legend that governs
nothing.

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
- There are three height bands, and each one gives up as little as it can.
  Under 900px the rhythm tightens, the surah field sheds its roomiest padding,
  and **the whole `.intro` goes out of the flow**, heading and promise line
  together, to the accessible tree rather than off the page: the h1 is still
  the page's only one and still the first thing a screen reader reaches, but
  the brand in the corner already says which app this is and the form is
  self-evidently a form for choosing a passage, so its 70px buys a row of
  controls. Under 780px the labels and the topbar tighten and the caption
  about the position being saved gives way, since «عن التطبيق» says it too.
  Under 700px the blocks close up on each other, and nothing inside them
  moves.
- **No row is ever dropped and every row keeps its full height.** Measured in
  Chrome against the built app at 390 wide, the form fits whole at 844, 812,
  780, 740 and 700 tall, and nothing overflows sideways down to 320px. At 667
  it scrolls 13px and at 640 37px, both **less** than the 24 and 49 it
  scrolled before the counts arrived. **If you add a row to this screen,
  measure those heights again**, and measure the built app rather than the
  dev server.

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

**Only split a verse where the reciter actually stops.** This is stricter than
"where stopping is allowed", and the difference was a real defect: a reader
heard clips ending mid-breath. Long ayat are cut at `ۚ` (جائز), `ۗ` (قلى) and
`ۘ` (لازم), and nowhere else.

- Never at `ۖ` (صلى). Stopping is permitted and continuing is *preferred*, and
  that is what reciters do: measured against the recordings this app plays,
  they carry on through 28% of them (Husary), 33% (Minshawi) and 71% (Abdul
  Basit). It was 29% of the cuts in the mushaf, so this costs real phrases.
- Never at a clause word in a stretch with no mark at all. That fallback used
  to cut at ثم, قال, a prefixed و; the reciter stops at 4% of those or fewer,
  against the 8-12% rate of any random point mid-word, so it carried no
  information and every one of its cuts was a chop. It was a fifth of all the
  cuts in the mushaf and it is gone.
- Never at `ۙ` (stopping is forbidden), `ۛ` (you may stop at only one mark of a
  pair) or `ۜ` (a pause held without breathing).

A verse with none of the three marks stays whole, however long it runs. That is
the honest answer: nothing in the text or in the vendored timings says where
inside it he takes his breath. `src/memorize/phrases.ts` does this, and
`data/README.md` records how it was measured. Do not loosen it, and do not
reintroduce the clause fallback.

**Do not send user data anywhere.** Recordings live in memory and are deleted
when the ayah changes or the page closes. Settings and the review plan go in
`localStorage` and nowhere else.

**A `localStorage` key is where a reader's own data already sits, so renaming
one takes a carry-over.** The keys are `rattle:v1` and `rattle:review:v1`,
and the plan under the second is the half that matters: it is weeks of
somebody's work and no server here could put it back. Renaming them cost
nothing only because it happened before anybody had a plan worth keeping. A
later one will not be free, so if you rename a key, have the first read adopt
whatever sits under the old name and move it across, make that read
idempotent, since React calls a `useState` initialiser twice under
StrictMode, and do not forget that the theme is read once more in
`index.html` before the bundle exists. The tests spell the key names out as
literals rather than importing them, which is what makes a rename with no
carry-over fail the suite loudly instead of passing quietly.

**Nothing may assume the site's path.** The repository was renamed once
already, from `rattil` to `rattle`, and the only thing that broke was one
deploy that had run a minute earlier. `vite.config.ts` takes `base` from
`VITE_BASE_PATH`, the workflow takes that from `actions/configure-pages`, and
the mirror builds with `./` so it does not care at all. Three consequences:

- **An absolute path in `index.html` is a bug.** Vite rewrites the paths it
  processes, but not one you write by hand: `href="/favicon.svg"` asked
  `edriso.github.io` for a file that lives under `/rattle/`, so the Pages copy
  had no icon at all while the custom domain, being at a root, looked fine.
  Use `%BASE_URL%`, which Vite substitutes per build. The favicon, the
  manifest and the apple-touch-icon all go through it.
- **Inside `public/manifest.webmanifest` every path is relative**, and
  `%BASE_URL%` is no help there because Vite copies that file without reading
  it. A manifest resolves its paths against its own URL, so `"start_url": "."`
  and `"src": "icon-192.png"` are right under `/rattle/`, right at a domain
  root, and right at a path this repository has never heard of; `/icon-192.png`
  is right only at the root. Chrome parses it with no errors from all three.
- **The share card is the one thing that must be absolute**, and it is still
  not written down anywhere. A link scraper is not a browser and will not
  resolve a relative address; Meta's documentation for WhatsApp link previews
  asks for "an absolute URL for an image", and X, LinkedIn, Slack and Telegram
  are documented the same way. A relative `og:image` does work in an unfurler
  that runs a real Chrome, which is how it shipped looking fine. So
  `index.html` carries `%SHARE_CARD%`, `vite.config.ts` fills it from
  `VITE_SITE_URL`, and the workflow takes that from `configure-pages`, which
  reports the address the deployment is going to: a fork gets a card of its
  own with nothing configured. The mirror answers on a domain only its owner
  knows, so that one is named in `vars.MIRROR_URL` beside `MIRROR_REPO`, and
  falls back to the Pages address if it is unset. Unset everywhere, the path
  stays relative, which is right for a local build. Removing the token from
  `index.html` fails the build rather than shipping a card addressed
  `%SHARE_CARD%`.
- Do not put the repository's name in a build script, a document's example
  command, or a test. The pre-push check in the README uses `/subpath/` for
  exactly this reason.

## Data

Two sets of data are generated once and committed. The app never fetches them
at run time.

- **The Quran text**, from Tanzil. `scripts/prepare-quran.mjs` turns
  `data/quran-uthmani.txt` into one JSON file per surah.
- **Phrase timings**, from Quran.com word timings.
  `scripts/prepare-timings.ts` works out where inside each ayah's recording the
  phrases begin, and writes one file per reciter (about 10 KB over the wire). The app
  loads a reciter's file only when the user drills phrase by phrase. Three
  things about that script are load-bearing, and `data/README.md` has the
  measurements behind all of them:
  - **Its source records no silence.** 92% of consecutive words are marked as
    touching exactly. A pause is inside the span of a word, not between two, so
    no threshold on that data can tell you whether the reciter stopped.
  - **Every cut is stored 300 ms later than the boundary the aligner reports**
    (`LAG`), because a clip ending at the boundary ended while the reciter was
    still finishing his word. The 290 ms that number was fitted to came from a
    130-ayah sample of three reciters and **is superseded**: measured over
    whole mushafs, the correction wanted is +409 ms for Husary, +354 for Abdul
    Basit's murattal, +107 for the teaching mushaf and **−435** for Abdul
    Basit's mujawwad. So do not tune `LAG` to any of them. It is left at 300
    deliberately, since fitting one number to one reciter's evidence is the
    mistake measuring exists to replace, and a recitation still resting on it
    wants measuring rather than fitting.
  - **Timings are read by `verse_key`, never by position.** One shipped
    recitation returns its ayat out of order, and one is missing an ayah.

Not every mushaf has timings. `Reciter.recitation` is optional, and
`cutsPhrases()` in `src/data/audio.ts` is what the app asks before it offers
«جملة»; `grainFor()` in `src/data/quran.ts` keeps the pair legal wherever
either half changes. أيمن سويد is the reciter this exists for: no source
publishes word timings for his mushaf, and his pace had to be measured from
the recordings' own lengths instead.

Both scripts run with plain `node` (Node 22 strips the types). Read
`data/README.md` before you touch either.

Adding a reciter is just `npm run prepare:timings`: a file carrying a
`verified` date is left alone and named, since that script writes boundaries
from the text and a constant and cannot reproduce a measurement made by
listening. Changing the splitting rules in `phrases.ts`, or `LAG`, does
invalidate a measurement, so that case is `npm run prepare:timings -- --force`
followed by `npm run verify:cuts`, in that order.

Audio itself is **not** committed. It is fetched from `everyayah.com`, one MP3
per ayah. That host sends `access-control-allow-origin: *`, which is what lets
the app decode and cut the audio. Many other Quran audio hosts do not send that
header, so you cannot simply swap the URL. `cdn.islamic.network` is one that
does not: it has the same recitations and no CORS header at all.

Every recording has a **second address**, on the mirror Quran.com serves its own
audio from, and a fetch that fails falls through to it. `ayahAudioUrl()` mints
the first address, which stays the one a recording is cached and keyed under;
`audioMirrors()` returns the rest. Two things to know before you touch either:

- The mirror does not carry `Abdurrahmaan_As-Sudais_64kbps`,
  `Saood_ash-Shuraym_64kbps` or `Minshawy_Mujawwad_64kbps`. Those three fall
  through to a higher-bitrate cut of the same reading. Measured over eleven
  ayat from 2 to 43 seconds long, the higher cut runs a **constant** 78.7 ms
  (Sudais) and 34.1 ms (Shuraym) longer, whatever the ayah, and over twelve
  ayat from 2 to 391 seconds a bounded 26 to 52 ms longer (Minshawi, which is
  one MP3 frame): encoder padding, not drift that piles up. So a phrase cut
  lands within a tenth of a second of where the vendored timings put it, and
  no correction is worth carrying. That is what a reciter's `mirror` field is
  for. If you add a reciter, check its folder on the mirror and set the field
  when the name differs.
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

  Expect 206 for every `mirror:` folder and for the nine `folder:` values the
  mirror shares. The three folders it does not carry return 404, which is why
  they have a `mirror:` of their own.

**The address that answers belongs to the run.** In `useRangeAudio` the media
element remembers which address worked and keeps it for the rest of the range,
rather than starting from the unreachable one again at every ayah. It goes back
to the recording's own address only once nowhere answers, so a retry after the
network comes back starts from the right place.

## Style

- Copy shown to the user is Arabic. Names in code are English.
- Comments say **why**, not what. If a line looks odd, explain the reason. Do
  not narrate what the code already says.
- Numbers shown to the user use Arabic-Indic digits and correct Arabic
  grammar. Use the helpers in `src/data/arabic.ts` (`arabic`, `ayatCount`,
  `timesCount`, `minutesCount`, `daysCount`) rather than writing `${n} آيات`
  by hand. Three places had written it by hand anyway, and the surah list said
  «٧ آية» for al-Fatiha for months. `arabic.test.ts` now checks every surah in
  the mushaf, so that particular bug cannot come back, but nothing stops a new
  hand-written one: reach for the counter.
- **The counted noun follows the number beside it, not the whole figure.**
  `counted()` bands on `n % 100`, so al-A'raf's ٢٠٦ takes the plural of its
  six and al-Baqarah's ٢٨٦ the singular of its eighty-six.
- **The dual's case comes from what governs it**, which the counter cannot
  see. «آيتان» standing alone as a label, but «نحو دقيقتين», because «نحو» is
  a مضاف, and «متأخرة يومين», because a duration is a ظرف زمان منصوب. Each
  counter carries the dual its own call sites need. A call site in a different
  grammatical position needs a **new counter**, not a change to an existing
  one. «نحو دقيقتان» is what getting this wrong looks like.
- Tanwin stays off interface text, as the Arabic style guides have it, with
  one exception that is not a diacritic at all: the alef an accusative fatha
  is written on. «٢٠ يومًا», never «٢٠ يوم». On a noun ending in ة there is no
  alef, which is why `hundred` is optional on `CountedForms`.
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
  WCAG 1.4.11 asks for: that is what `--control-border` is for, and why it is
  a different token from the quiet `--border` used for separators.
- Do not fade text with `opacity` to show it is secondary. Opacity multiplies
  against the background and quietly drops the contrast below AA; use
  `--muted-foreground`, which is chosen to pass.
- **`--muted-foreground` is chosen against `--surface`, so it is wrong on a
  row the accent has painted.** On `--accent` it collapses to between 1.0 and
  1.5 to one, measured across all four colours in both appearances. Secondary
  text on a highlighted row takes `--accent-foreground-muted`. This is not
  hypothetical: «متأنٍّ» beside a highlighted reciter failed 8 of 8
  combinations and could not be seen at all in the light appearance.
- The pairings, measured in Chrome as composited sRGB over all eight
  combinations, worst case of each. Reuse these rather than re-deriving them,
  and re-measure only what you change:

  | ink on ground | worst | needs |
  | --- | --- | --- |
  | `--foreground` on `--background` | 14.15 | 4.5 |
  | `--accent` on `--background` | 6.01 | 4.5 |
  | `--accent` on `--surface` | 6.32 | 4.5 |
  | `--muted-foreground` on `--background` | 5.98 | 4.5 |
  | `--muted-foreground` on `--surface` | 5.56 | 4.5 |
  | `--accent-foreground` on `--accent` | 6.20 | 4.5 |
  | `--accent-foreground-muted` on `--accent` | 4.95 | 4.5 |
  | `--control-border` on `--background` | 3.24 | 3.0 (1.4.11) |

  Two of those have little room: `--control-border` clears 1.4.11 by 0.24,
  and `--accent-foreground-muted` clears AA by 0.45, which is why its mix is
  85 per cent and must not go below 80.
- **This stylesheet is unlayered, so a plain class beats a Tailwind utility**
  however specific the utility looks. `.muted` outranked
  `**:text-accent-foreground` on the highlighted select row, which is why the
  name flipped colour and the pace beside it did not. If a `components/ui`
  part's own utility is not winning, that is why; add the rule here rather
  than fighting it there.
- A control that becomes unavailable while it holds focus uses `aria-disabled`,
  not `disabled`. A `disabled` button drops the keyboard on the floor the
  moment it is pressed.
- Anything third-party that this repository **redistributes** gets an entry in
  [NOTICE](NOTICE) in the same pass. Everything written here is
  [0BSD](LICENSE): no attribution, no conditions, deliberately, so do not add
  a licence header to a file and do not add a credit-us line anywhere. The
  Quran text is the opposite case, because its terms are not ours to give
  away.

## The transport, and the learner's own turn

One button means one thing: it stops what is running and starts what is not.
The learner's turn counts as running, because the silence is timed and the
clock moves through it, and the turn used to be the one stretch of a session
that could not be stopped. Ending the turn early is a **separate** control,
in the slot that used to hold only the row's balance.

Three things about that control are load-bearing:

- It **stays drawn once the turn is over** and goes `aria-disabled` rather
  than away. Pressing it is exactly what makes it unavailable, and a control
  that vanishes on press drops the keyboard on the floor, which is the same
  reason the whole app prefers `aria-disabled` to `disabled`. It also keeps
  the transport from shifting under a thumb.
- It carries `←` and `Enter` while the turn is running, and the next-step
  button gives them up for that phase. Forward during your own turn means «I
  have finished repeating», not «skip the rest of this step»; without this
  the only way to end a turn early was to reach the button with `Tab`.
- `echo: 'manual'` («أنا أتحكّم») is the exception at both ends: there the
  drill really is halted until the learner says otherwise, so «تابِع» goes on
  the main button, and the separate control gives its slot back rather than
  sitting inert under the same name a finger away, which is worse for a
  screen reader than an empty slot. Phase `waiting` is that state; phase
  `echoing` is a timed silence, which is not the same thing.

## Changing a setting while a drill is running

The settings sheet is reachable mid-session, so nothing in it may cost the
learner their place, and only one thing in it can even try.

- **The silence** is handed to the running session by `setEcho`. The session
  is built with `echo: 'off'` and given the real one straight away for exactly
  this reason.
- **The reciter** rebuilds the drill, and `useSession` carries the cursor
  across **when it is the same drill**: the same steps and the same segments
  in a different voice. Comparing step boundaries is not enough, because two
  reciters can split different ayat of one passage into the same number of
  phrases; `sameDrill` compares segment ids too.

  At `grain: 1` and above it is always the same drill, so the place is always
  kept. At `'phrase'` it usually is, and there are two cases where it is not,
  both real and neither a defect: a reciter whose vendored timings are missing
  an ayah of the passage leaves that ayah whole, which changes the segment
  count (about 1% of five-ayah windows between the closest pair of reciters,
  12% between the furthest); and a reciter with **no** timings at all makes
  `grainFor` demote the grain to `1`, which is in `SessionView`'s key, so the
  screen remounts and the decoded audio goes with it. In both the drill really
  is a different drill and starting over is the honest answer. Do not promise
  more than that in the README.
- **`linkBack`** always makes a different drill, since it decides what every
  step after the first one is, so there is never a step to carry a cursor to.
  It starts over, and while a session is running the sheet says so, naming
  itself: the sentence before it in that paragraph is about a different count,
  so «هذا العدد» pointed at the wrong one.
- Everything else belongs to free review or to the appearance.

Anything that shapes a sitting belongs on the start screen, where changing it
before you begin is the natural thing. If you add a setting, work out which of
those four it is before you decide where it goes.

## The panels

The two sheets, the passage picker and the settings, and the grading sheet
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

1. **Measure Minshawi's two recitations against their audio**, which are the
   only ones left that this method can reach. `scripts/verify-cuts.ts` has
   been run on the four marked `verified` in `src/data/timings/`; what it
   found is stronger than a wrong constant, because the correct **sign**
   differs by recitation. Husary's cuts are a median 406 ms early and Abdul
   Basit's mujawwad a median 432 ms late, so the one lag helps the first and
   hurts the second by about the same amount. The teaching mushaf needed
   almost nothing: 96.4% of its cuts were already inside a real pause.

   **Read `data/README.md` before running it, and do not assume the rest are
   one command each.** Five of the twelve recitations cannot be measured by
   level at all: they are modern masters with 10 to 16 dB between speech and
   their own noise floor, against 34 to 66 dB for the six classic ones, and
   four of them have a floor *above* the -40 dBFS gate, so it is never
   crossed. Run blind, that emptied the phrase cuts of five recitations and
   read in the report as five reciters who never stop for breath. The script
   now measures the mastering first and refuses, and prints the two numbers so
   the refusal can be checked. Both guards are pinned by a table in
   `scripts/verify-cuts.test.ts` holding what each recitation actually
   measured, so moving `MIN_RANGE` or `NOISE` tells you by name which
   recitations you just broke. `WINDOW` has already been widened to 2500 ms for
   them, on the evidence in `data/README.md`: both of Minshawi's want a median
   offset near a second, and at 1500 their largest move sat exactly on the
   edge. His murattal then places 88% of a sample and is worth the bandwidth;
   his mujawwad places 65%, below `MIN_YIELD`, and needs a decision before
   `--force` rather than after.
2. Highlight each word as it is recited. The committed timing data already has
   what this needs.
3. Give the review plan its own screen. Today the home screen shows only the
   first two items that are due.
4. Drill the join between one passage and the next as its own item. Research on
   hifz says that join is where memorisation usually breaks, and the app does
   not practise it yet.

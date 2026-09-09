# Working on Rattle

This is the on-ramp. It assumes you know React and have never seen this
repository, and it does not assume you read Arabic or know anything about
Quran memorisation. [AGENTS.md](../AGENTS.md) is the reference behind it, with
the reasoning and the measurements; come back here when you want to know
*where* to go and read that when you want to know *why* it is that way.

## In one minute

Someone memorising the Quran opens this app, chooses a passage, and the app
plays a small piece of it, leaves a silence for them to repeat it aloud, then
joins that piece to the ones before it and plays them together. That join is
the thing: a memoriser rarely forgets a verse, they forget how the verse they
know connects to the next one.

There is no server, no database, no accounts, and no analytics. Everything is
a static page plus data files in the repository, and everything the user does
stays in their browser's `localStorage`.

## Get it running

```sh
npm install
npm run dev
```

Open the address it prints. Everything works offline after the first load
except the recitation audio, which is fetched per ayah from everyayah.com.

Before you commit, all three of these must pass. CI runs the same three.

```sh
npm test
npm run lint
npm run build
```

`npm run format` (oxfmt) tidies the code; run it before the linter and you
will have fewer things to fix.

## The shape of the thing

Three views, chosen by `prefs.screen`, with no router:

| Screen | File | What it is |
| --- | --- | --- |
| Start | `src/components/HomeView.tsx` | Choose a passage and how it will be drilled |
| Session | `src/components/SessionView.tsx` | The drill itself, «جلسة التلقين» |
| Free review | `src/components/AyahView.tsx` | Show ayat, hide them, record yourself |

`src/App.tsx` is the shell: it holds the preferences, saves them, and decides
which of the three to render. The two slide-up panels (the passage picker and
the settings) live in `src/components/Sheets.tsx` and are loaded on demand;
the frame all three sheets share, the grading one included, is
`src/components/Panel.tsx`.

Two small things sit beside the screens. `src/useSurah.ts` loads one surah's
verses for whichever screen is showing Quran, and `src/webmcp.ts` offers a
browser agent a single tool that opens a session over a passage. The tool has
a section of its own in AGENTS.md.

The method itself is in `src/memorize/`, and **only the files named `use*.ts`
in there know that React exists.** Everything else is plain functions and
classes, which is why a whole session can be driven in a test with a fake
audio layer and no browser. Keep it that way; it is the reason the tests are
fast and honest. That directory has [its own
AGENTS.md](../src/memorize/AGENTS.md).

Reading order, if you want to understand the drill: `phrases.ts` (a verse into
its phrases) → `session.ts` (a passage into the units that get repeated) →
`schedule.ts` (the order the units are drilled in) → `runtime.ts` (the state
machine that walks it) → `player.ts` (Web Audio).

## Where to go for the change you have

| You want to… | Open | Read first |
| --- | --- | --- |
| Change wording on the start screen | `src/components/HomeView.tsx` | "The start screen carries the session options" in AGENTS.md |
| Change spacing or a colour | `src/styles.css` | The Style section, and the two start-screen sections |
| Add or change a reciter | `src/data/audio.ts`, then regenerate timings | "Data" in AGENTS.md and [data/README.md](../data/README.md) |
| Change the drill's steps or counts | `src/memorize/schedule.ts` | [src/memorize/AGENTS.md](../src/memorize/AGENTS.md) |
| Change where a verse is cut | `src/memorize/phrases.ts` | "Rules you must not break". This one is strict |
| Change playback, pausing, the clock | `src/memorize/runtime.ts` | The transport section in AGENTS.md |
| Add a keyboard shortcut | `src/usePracticeNavigation.ts` | The Keyboard section. It lists **four** places to update |
| Change the review schedule | `src/memorize/review.ts` | It is SM-2 with a 35-day ceiling |
| Add a settings control | `src/components/Sheets.tsx` | "Changing a setting while a drill is running" |
| Change how a sheet opens or focuses | `src/components/Panel.tsx` | "The panels" in AGENTS.md |

## The five rules that will bite you

Everything below has bitten somebody. There are more in AGENTS.md; these are
the ones a first change runs into.

**1. Never edit the Quran text.** `src/data/surahs/*.json` is generated from
`data/quran-uthmani.txt`, which is Tanzil's, pinned by checksum, and licensed
on the condition that it is not altered. A test checks all 6,236 verses byte
for byte. If that test fails, you broke something; do not "fix" the text.

While you are at it: **do not type a verse into a source file or a test from
memory either.** Read it out of the data. A verse typed from memory is a
misquotation waiting to be committed, and getting one haraka wrong in a repo
about the Quran is not a small thing. `src/data/arabic.test.ts` shows the
pattern.

**2. The basmala is not part of ayah 1.** The source text puts it at the head
of ayah 1 of every surah except al-Fatiha and at-Tawbah, but the reciter
records it separately, so the audio does not have it. Always go through
`openVerse()` from `src/data/verse.ts` before you show an ayah or line one up
with audio. This surprises everybody once.

**3. Numbers need Arabic grammar, and there are helpers for it.** Never write
`` `${n} آيات` ``. Use `ayatCount(n)` and friends from `src/data/arabic.ts`.
Arabic agreement changes with the number: one and two have their own words,
three to ten take a plural, and eleven upward goes back to the singular. The
surah list said «٧ آية» for al-Fatiha for months because somebody wrote it by
hand.

**4. A field that takes a number is never `type="number"`.** It silently
throws away ٢٥٥, which is what an Arabic keyboard types. Use `type="text"`
with `inputMode="numeric"`, render through `arabic()`, read back through
`digits()`.

**5. Prefer logical CSS properties.** The whole interface is right to left, so
write `padding-inline-start`, not `padding-left`; `margin-inline`, not
`margin-left`. `text-align: start`, not `right`. Anything that hardcodes a
side is a bug waiting on the other one. The block axis is the same in both
directions, so `margin-top` and `border-top` are written plainly throughout;
it is the **inline** side that must never be hardcoded. Two rules in
`styles.css` do, and each carries a comment saying why: the nudge that
optically centres the play triangle, which is not mirrored by writing
direction the way a chevron is, and the border that draws the disclosure
chevron itself, which is geometry rather than text.

## The accessibility floor, which is not optional

Every one of these is checkable, and some are covered by tests:

- Every touch target at least 44 by 44 pixels. There is one deliberate
  exception, and it carries a comment: the compact `+`/`−` buttons on the
  start screen are 30 to 38 wide by 44 tall, because three of them share one
  phone's width. WCAG 2.5.8 asks for 24, so that clears the standard; the
  repository aims higher, and if you need a second exception, measure and say
  why beside it.
- Every control has a label. Icon-only buttons carry `aria-label`.
- Text meets 4.5:1 contrast **in both appearances and all four accent
  colours**, which is eight combinations. A fix that only works in dark mode
  is not a fix. Control edges meet the 3:1 of WCAG 1.4.11, which is what
  `--control-border` is for.
- Never dim text with `opacity`. It multiplies against the background and
  drops the contrast below AA. Use `--muted-foreground`, or
  `--accent-foreground-muted` on a row the accent has painted.
- A control that becomes unavailable while it has focus uses `aria-disabled`,
  not `disabled`, which would drop the keyboard on the floor.
- Everything reachable by mouse is reachable by keyboard. The drill's main
  moves each have an arrow, because a focused button owns `Space` and `Enter`
  and that is not ours to take away; the rest are reachable by `Tab`.

## Writing a test

Tests sit next to the code, and they say what the app must **do**, not what
the code is. Two kinds:

- **Plain** (`src/memorize/*.test.ts`, `src/data/*.test.ts`): no browser.
  `runtime.test.ts` drives a whole session with a fake audio layer and a fake
  clock.
- **jsdom** (`src/*.test.tsx`): the real app, with `AudioContext` and `fetch`
  stubbed. `session-ui.test.tsx` has the fakes; copy them.

Two habits worth having:

**When you fix a bug, write the test first, and check that it fails.** A test
that passes against the old code is not testing your fix. The quickest way to
check is `git stash push -- <the file you fixed>`, run the test, `git stash
pop`. Several tests in this repo exist only because a bug got through once,
and the comment above them says which. Write that comment.

**Give lazy panels room.** The settings and picker are separate chunks, so a
query for something inside them needs `{ timeout: 3000 }`. A test that passes
on your machine and fails in CI is usually this.

## Committing

- Short imperative subject line, no full stop. Say what changed and, in the
  body, **why**. The body is where this repository keeps its reasoning, so
  it is worth more than the subject.
- No AI signatures. No "Generated with" lines, no `Co-Authored-By: Claude`.
- Do not add a licence header to a file, and do not add a credit-us line
  anywhere. Everything written here is [0BSD](../LICENSE) on purpose.
- If you bring in a corpus, dataset, font or audio source, add it to
  [NOTICE](../NOTICE) in the same pass.
- Pushing to `main` deploys. Run the three commands first.

## Measuring the layout, when you touch the start screen

That screen has to fit a phone whole, and "it looks fine on my laptop" is not
a measurement. It is spaced from one variable, `--gap`, and it has three
height bands (900, 780 and 700 pixels tall). **If you add or remove a row,
measure again**, against the built app (`npm run build && npx vite preview`)
and not the dev server. And build without `VITE_BASE_PATH`, or every asset
404s at the preview root and you will spend twenty minutes debugging an app
that is fine.

Any way of measuring is fine; headless Chrome over the DevTools Protocol is
what was used, setting the viewport to 390×844, 812, 780, 740, 700, 667 and
360×640 and reading `document.documentElement.scrollHeight` against
`innerHeight`. Write down what you got, the way AGENTS.md does. A number in a
comment saves the next person the afternoon.

One trap worth knowing when you write CSS for that screen: **this stylesheet
has no cascade layers, so two single-class selectors are decided by which
comes last in the file.** `.stepper-compact` was written above `.stepper` and
lost `gap`, `padding-block` and `justify-content` silently, which made every
count 20px taller than its own rules said. Put a variant after the base.

## The thing half-done, if you want something substantial

The phrase cuts inside a long ayah start out placed from the waqf marks in the
text plus a constant correction, because the timing data this app vendors
records no silence at all. `scripts/verify-cuts.ts` replaces that guess with a
measurement, and it has been run on four of the twelve recitations: it fetches
each ayah's recording, asks `ffmpeg` where the pauses are, and moves, keeps or
drops every cut accordingly. `verified` in each file in `src/data/timings/`
says which have been done.

What is left is not "run it on the rest", and this is the part worth reading
before you start. The detector is a **fixed** threshold, -40 dBFS, applied to
recordings whose noise floors span 60 dB, and that one decision is what stands
between this and two more of the eight recitations still on the constant. Of
the rest, five need a different kind of detector entirely, and the twelfth has
no published word timings for any detector to measure.

**Five of the twelve cannot be measured by it at all.** They are modern
masters with only 10 to 16 dB between the reciter's voice and their own noise
floor, against 32 to 66 dB for the older ones, and every one of the five has a
noise floor sitting *above* the threshold, so they spend under 4% of their
length below it and most of that is the lead-in of the file. Run blind, that
does not degrade their files, it empties them, because an ayah loses its whole
set of cuts when a single one cannot be placed. The script measures that before
it measures anything else and refuses, printing the two numbers so you can
check the refusal instead of believing it.

**And one recitation that passes the check still cannot be written.** Minshawi's
murattal places 62.6% of its ayat, under the floor the script will write at.
That looks like a reciter who runs through the marks until you sweep the
threshold with a mid-phrase control: at -32 dBFS he places 90%, while the
share of points *inside* a phrase mistaken for a pause goes only from 1.2% to
1.4%. The shipped threshold already mistakes 3.0% of them on Husary. So a
threshold loose enough to hear all of Minshawi is less trigger-happy than the
one in use, and his pauses are real: a threshold at -32 finds 90% of them and
one at -28 finds 98%, so they bottom out between -40 and -28, filled with
reverb rather than reaching silence.

So this is one project rather than three, and it is now a well-posed one:

- **Choose the threshold per recitation, from the shape of its own level
  histogram** rather than from a constant, and validate each one against a
  control of points that cannot be pauses. The envelope the rule needs is
  already computed on every run, for the mastering check. The three obvious
  reparameterisations are tried and recorded in
  [data/README.md](../data/README.md), and each one fails on some recitation,
  so do read that before reaching for a formula. Getting it right unlocks
  Minshawi's two, some 3,000 ayat; on the numbers it will not reach the five
  modern masters, whose floors sit above where their pauses would have to be,
  and those still want something spectral.

Two smaller ones that came out of the same work and are already done, in case
the write-ups are useful as a shape: the search window was widened from 1,500
to 2,500 ms, which gave back 127 ayat across the four measured recitations with
0 lost and 0 altered; and the mastering sampling was reading the front of each
file instead of the whole mushaf, which had Minshawi's dynamic range 11 dB
wrong. The 88% was a separate trap of the same shape, a `--limit=60` run whose
yield was read as the whole mushaf's.

The numbers that say what any of this is worth are at the end of AGENTS.md and
in [data/README.md](../data/README.md).

# AGENTS.md — src/memorize

This folder holds the memorisation method. Read the root
[AGENTS.md](../../AGENTS.md) first.

Only the files named `use*.ts` know about React. Everything else is plain
TypeScript, so it can be tested without a browser. Please keep it that way: it
is why a whole session can be driven in a test with a fake clock.

## What a session does

A session takes a passage — one surah, one ayah to another — and drills it in
three kinds of step, over and over:

- **تلقين (single)** — play one segment on its own, a few times.
- **وصل (link)** — play that segment together with the ones just before it, so
  the join between them gets practised too.
- **سرد (recite)** — at the end, play the whole passage.

Joining is the point. A learner who drills each ayah alone ends up with a set
of separate ayat, not a surah. This comes from Sheikh Ahmad Shams's proposal on
community.itqan.dev/d/432, and it matches what Sheikh Abdul Muhsin al-Qasim
writes down: ayah ×20, next ayah ×20, **the two together** ×10, and so on.

By default a link step reaches back **two** segments, not all of them. Reaching
back to the start of the passage every time makes the session grow with the
square of its length: twenty ayat would take over four hours. The user can
still choose "الكل" if they want that.

## The files

| File          | What it does                                                                        |
| ------------- | ----------------------------------------------------------------------------------- |
| `phrases.ts`  | Splits one verse into phrases at the waqf marks.                                    |
| `session.ts`  | Turns a passage into segments and clips. Also estimates how long a drill will take. |
| `schedule.ts` | Builds the list of steps, and moves the cursor through them.                        |
| `player.ts`   | Web Audio. Fetches, decodes, caches and plays slices of ayah recordings.            |
| `runtime.ts`  | The session state machine. Walks the schedule and drives the player.                |
| `review.ts`   | Decides when a passage should come back.                                            |
| `use*.ts`     | Thin React wrappers around the above.                                               |

## How the pieces fit

A **segment** is one thing the drill repeats. It may be a phrase, one ayah, or
a block of two, three or five ayat. A segment holds one or more **clips**. A
clip is a slice of a single ayah's recording: a start time, and an end time or
`null` for "play to the end".

`buildSegments()` makes them. For phrase-level drilling it needs the reciter's
phrase boundaries. If those are missing, or if they look wrong — the wrong
count, or not going forward — it keeps the ayah whole instead of cutting it
blind. Never remove that check.

## The runtime

`Session` in `runtime.ts` is a small state machine. It publishes one immutable
snapshot, and React reads it with `useSyncExternalStore`.

Phases: `idle` → `preparing` → `reciting` → `echoing` or `waiting` → back to
`reciting` for the next repetition → `done`. Plus `paused` and `error`.

A few rules the class keeps to. Break one and something will get stuck:

- Every way of leaving a run bumps `generation`, stops the audio and clears the
  timer. That includes `finish()`. A callback that arrives with an old
  generation must do nothing.
- One pass over a step's segments is called a **run**. Only the run in flight
  is ever scheduled on the audio clock. That is what makes pausing and skipping
  simple.
- Inside a run the clips are scheduled ahead of time, so joined ayat splice
  together with no gap. Between runs there is a normal gap, so nothing is
  scheduled ahead there.
- Pausing remembers how far into the run it got, and resuming carries on from
  there. Pausing right at the end restarts the run instead, because resuming
  into the last fraction of a second would leave nothing to play.
- The tick loop runs four times a second. `set()` publishes nothing when the
  numbers have not changed, or every subscriber would re-render for nothing.
- The countdown is `cost(cursor) - spent()`. `cost` prices the repetition in
  front of the learner whole, so `spent()` has to account for every second
  already behind them — the audio played, the echo elapsed, and what a paused
  run had covered. Miss one and the clock climbs back up instead of down.

## Audio

- Recordings come from `everyayah.com`, one MP3 per ayah. That host allows
  cross-origin reads, which is what lets the app decode and slice the sound.
- The context is created at 24 kHz to keep decoded audio small.
- The cache holds about seven minutes of decoded audio, then drops the oldest.
  The clips a run needs are pinned first, so a long run cannot be cut short.
- A fetch that fails is tried once more, and one that hangs is dropped after 20
  seconds. Without the timeout a stalled connection looks like a frozen app.
- `play()` silences the batch it replaces. Only the sources of the newest call
  are held, so anything left scheduled by an older one could never be stopped
  again — two recitations at once, with no way to quiet the first.
- The cache is ordered by **use**, not by arrival: playing a recording moves it
  to the young end. Otherwise the ayah being drilled ages like one nothing has
  touched since it loaded, and gets thrown out from under the drill.

## The echo

After each pass, the app leaves silence for the learner to repeat. The silence
is as long as the audio that just played, times a factor the user chooses, from
half of it up to double. It is never a fixed number of seconds — a long ayah
needs a long pause and a short one does not. `manual` waits for a tap instead.

`off` is not a switched-off setting, it is the other way of using the app: some
people want to hear the passage repeated and do not repeat it aloud. It leaves
only a short breath, so two passes do not run into each other. That is why the
home screen offers it as a choice of its own and the sheet only tunes the
length.

## Review scheduling

`review.ts` decides when a passage comes back. It is SM-2 with two changes that
the subject needs:

- **Intervals are capped at 35 days.** A hifz syllabus is built on every
  passage coming back within about five weeks. General flashcard schedulers let
  intervals drift into months, which is wrong here.
- **The easiness factor is clamped on both paths**, not only on failure.
  Without that, grading "hard" again and again drives it under 1 and the
  interval collapses to zero, and the passage is stuck as due forever.

Days are added to the calendar date, never as 24-hour blocks: adding hours
across the end of summer time lands on the previous day, which would make a
passage due a day early. The ladder for the first four good recitals is 1, 3, 7
and 14 days. After that
the interval is multiplied by the easiness factor, still capped at 35.

Passages that overlap are treated as one passage and merged into the range they
cover between them. Otherwise, drifting a range by an ayah or two over a few
days quietly builds a pile of entries that all claim the same lines. A merged
entry starts from the least established of the entries it replaces, so making a
passage wider never inherits a strength the new ayat have not earned.

We do not use FSRS. It calibrates better in general, but hifz needs a hard
interval ceiling that sits outside the range FSRS is tuned for; it treats every
card as independent when the cue for one ayah _is_ the ayah before it;
`ts-fsrs` ships no way to tune its parameters in a static app; and the one live
A/B test of it lost about 10% of user retention while winning every offline
measure. If you want to revisit this, read that evidence first.

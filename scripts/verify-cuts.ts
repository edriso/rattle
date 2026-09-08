/* Offline verification of the phrase cuts against the recordings themselves.

   `prepare-timings.ts` places every cut from the text plus a constant: the
   word boundary Quran.com reports, moved LAG milliseconds later, because that
   source records no silence at all and the boundary it gives sits before the
   pause rather than in it. The constant is a stand-in for a measurement, and
   this is the measurement.

   For each ayah that splits, it fetches that reciter's own per-ayah MP3 once,
   asks ffmpeg where the silences are, and then, for each cut, either leaves it
   where it is because it already falls in one, moves it into the nearest one,
   or reports that there is no silence there at all, which means the text said
   the reciter stops and the recording says he does not.

   Run from the repository root. Reading only, and prints what it would change:

     node scripts/verify-cuts.ts husary

   With `--write` it rewrites `src/data/timings/<reciter>.json`. With no
   reciter it does every one that has a file.

   Needs ffmpeg on the machine, which nothing else here does, and it downloads
   about 1,500 files per reciter, so it caches them under `work/audio/` and a
   second run costs nothing. Keep the concurrency modest: everyayah.com serves
   this for free.  */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { ayahAudioUrl, reciters } from '../src/data/audio.ts';

const TIMINGS = new URL('../src/data/timings/', import.meta.url);
const CACHE = new URL('../work/audio/', import.meta.url);

/** Below this the signal counts as silence, in dBFS. */
const NOISE = '-40dB';
/** Shortest run ffmpeg is asked to report, in seconds. Shorter than the pause
    we want, so the distribution of what it finds can be looked at. */
const DETECT = 0.15;
/** A silence has to be at least this long to be a place the reciter stopped
    rather than a consonant closure or a breath inside a phrase. */
const MIN_SILENCE = 250;
/**
 * How far from its current position a cut may be moved to reach a silence.
 * Wider than this and it is a different boundary, not the same one measured.
 *
 * 1500 was sized for an error of a few hundred milliseconds, which is what the
 * first recitations measured. Minshawi's two want about a second, and at 1500
 * their largest move sat exactly on the edge: the window was clipping the
 * answer rather than bounding it. 2500 is where his murattal's median stops
 * moving (971ms at a window of 1500, 1002 at 2500, 1002 at 3500) and it takes
 * the ayat it can place from 82% of a 60-ayah sample to 88%.
 *
 * Widening it costs the recitations already measured nothing, and that is not
 * a judgement call: every cut in a verified file already sits inside a pause,
 * so `judge` returns `kept` and never reaches this. Read-only over all of
 * Husary and all of Abdul Basit's mujawwad at 2500, both come back 100% kept,
 * 0 moved, 0 unfounded.
 *
 * What it does not do is give those four back the cuts they dropped at 1500,
 * because a dropped cut is not in the file to reconsider. Recovering those
 * means `prepare:timings --force` and then measuring again.
 */
const WINDOW = 2500;
/**
 * How far inside the pause the cut is placed, measured from whichever edge it
 * arrived at: far enough in that a word tail fading under the threshold is not
 * clipped, and never so far that it crosses to the other side. Keeping it
 * under half of `MIN_SILENCE` is what guarantees the second part, and a test
 * says so.
 */
const MARGIN = 80;

/** Frames the envelope is measured in, in milliseconds: 882 samples at the
    44.1kHz the resample pins, so the figure does not depend on how a
    recitation happens to have been encoded. */
const FRAME = 20;

/**
 * How much room a recitation has to have between its speech and its own
 * quietest stretches, in dB, before `NOISE` can find anything in it.
 *
 * `NOISE` is a fixed gate, and a fixed gate only means something if there is
 * somewhere for it to sit. Measured over 24 ayat of each of the twelve: the
 * six classic murattal and mujawwad recitations have 34 to 63dB of room and
 * spend 16 to 36% of their length under -40dBFS. The five modern masters have
 * 10 to 16dB, and four of them have a noise floor *above* -40dBFS, so they
 * spend 0.2 to 6% of their length under the gate and it finds no pauses at
 * all. That is not a reciter running his boundaries together, it is limiting,
 * and in the output the two are indistinguishable unless something separates
 * them first. 24 is the middle of a gap with nothing in it: the lowest range
 * that works is 33.8dB and the highest that fails is 16.1.
 */
const MIN_RANGE = 24;

/** Ayat sampled to characterise the mastering, which belongs to the recording
    session rather than to the ayah, so two dozen settle it. */
const SOUNDINGS = 24;

/**
 * How much of a recitation a `--write` has to leave standing, as a fraction of
 * the ayat that had cuts.
 *
 * An ayah loses its whole set when a single cut cannot be placed, so a
 * measurement that mishears a recording does not degrade that file, it empties
 * it, and «جملة» quietly stops being offered for that reciter. Every
 * recitation measured so far keeps 82% or more, so a run under this is
 * reporting a fault in the method and not a finding about the reciter.
 */
const MIN_YIELD = 0.7;

type Bounds = Record<string, number[]>;
type TimingFile = {
  reciter: string;
  recitation: number;
  source: string;
  generated: string;
  bounds: Bounds;
  /** Written by this script once the cuts have been measured. */
  verified?: string;
};

const run = (file: string, args: string[]) =>
  new Promise<{ stdout: string; stderr: string }>((resolve, reject) =>
    execFile(file, args, { maxBuffer: 1 << 24 }, (error, stdout, stderr) =>
      // ffmpeg writes its report to stderr and exits 0; a real failure has
      // no silence lines to parse, which the caller notices.
      error && !stderr ? reject(error) : resolve({ stdout, stderr }),
    ),
  );

/** Recording that must be left after the last cut, matching `prepare-timings`:
    a final phrase shorter than this is not worth cutting for. */
const MIN_CLIP = 400;

/** Silent stretches of one recording, in milliseconds, as ffmpeg hears them,
    with the recording's own length, which ffmpeg reports on the way past. */
async function silences(path: string) {
  const { stderr } = await run('ffmpeg', [
    '-hide_banner',
    '-nostats',
    '-i',
    path,
    '-af',
    `silencedetect=noise=${NOISE}:d=${DETECT}`,
    '-f',
    'null',
    '-',
  ]);
  const found: { from: number; to: number }[] = [];
  let duration = 0;
  let open: number | null = null;
  for (const line of stderr.split('\n')) {
    const length = /Duration:\s*(\d+):(\d+):([\d.]+)/.exec(line);
    if (length)
      duration = Math.round(
        (Number(length[1]) * 3600 +
          Number(length[2]) * 60 +
          Number(length[3])) *
          1000,
      );
    const start = /silence_start:\s*(-?[\d.]+)/.exec(line);
    if (start) open = Math.round(Number(start[1]) * 1000);
    const end = /silence_end:\s*(-?[\d.]+)/.exec(line);
    if (end && open !== null) {
      found.push({
        from: Math.max(0, open),
        to: Math.round(Number(end[1]) * 1000),
      });
      open = null;
    }
  }
  // A recording that ends in silence never reports an end for it, so that run
  // is closed at the end of the file; it is the one a last cut can land in.
  if (open !== null && duration)
    found.push({ from: Math.max(0, open), to: duration });
  if (!duration) throw new Error(`no duration reported for ${path}`);
  return { found, duration };
}

/** The recording, from the cache or fetched into it. */
async function recording(surah: number, ayah: number, reciter: string) {
  const name = `${reciter}-${surah}-${ayah}.mp3`;
  const path = new URL(name, CACHE);
  if (existsSync(path)) return path;
  const url = ayahAudioUrl(surah, ayah, reciter);
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = Buffer.from(await response.arrayBuffer());
      if (body.length < 512) throw new Error(`only ${body.length} bytes`);
      writeFileSync(path, body);
      return path;
    } catch (error) {
      lastError = error;
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }
  }
  throw new Error(`${surah}:${ayah}: ${String(lastError)}`);
}

/** The recording's loudness over time, one RMS reading per `FRAME`. */
async function envelope(path: string) {
  const { stdout } = await run('ffmpeg', [
    '-hide_banner',
    '-nostats',
    '-i',
    path,
    '-af',
    `aresample=44100,asetnsamples=${(44100 * FRAME) / 1000},astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.RMS_level:file=-`,
    '-f',
    'null',
    '-',
  ]);
  const levels: number[] = [];
  for (const m of stdout.matchAll(/RMS_level=(-?[\d.]+|-inf)/g))
    // A frame of true digital silence reads -inf, which no percentile can
    // sort. -120dBFS is below anything a microphone in a room ever heard.
    levels.push(m[1] === '-inf' ? -120 : Number(m[1]));
  return levels;
}

/**
 * Whether a level gate can find this recitation's pauses at all, and the two
 * numbers that decide it: where its quiet sits and where its speech sits.
 */
function hearing(levels: readonly number[]) {
  const sorted = [...levels].sort((a, b) => a - b);
  const at = (p: number) =>
    sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
  // The fifth percentile rather than the minimum: one frame of digital
  // silence at a file boundary is not the noise floor of the room.
  const floor = at(0.05);
  const speech = at(0.5);
  const gate = Number.parseFloat(NOISE);
  return {
    floor,
    speech,
    range: speech - floor,
    under: levels.filter((v) => v < gate).length / (levels.length || 1),
    // Both, because they fail differently: too little room means the gate
    // cannot separate speech from pause, and a floor above the gate means it
    // never crosses at all.
    measurable: speech - floor >= MIN_RANGE && floor < gate,
  };
}

type Verdict =
  | { kind: 'kept'; at: number }
  | { kind: 'moved'; at: number; by: number }
  | { kind: 'unfounded'; nearest: number };

/** What the recording says about one cut. */
function judge(
  cut: number,
  heard: readonly { from: number; to: number }[],
): Verdict {
  const long = heard.filter((s) => s.to - s.from >= MIN_SILENCE);
  const holding = long.find((s) => cut >= s.from && cut <= s.to);
  if (holding) return { kind: 'kept', at: cut };
  let best: { from: number; to: number } | null = null;
  let distance = Infinity;
  for (const s of long) {
    const away = cut < s.from ? s.from - cut : cut - s.to;
    if (away < distance) {
      distance = away;
      best = s;
    }
  }
  // The distance is carried out even when it is too far, so the report can
  // say whether an unfounded cut just missed the window or is nowhere near a
  // pause at all. Those are different findings and want different answers.
  if (!best || distance > WINDOW)
    return { kind: 'unfounded', nearest: best ? distance : Infinity };
  /* The nearest point inside the pause, entered from the side the cut came
     from: a step past the start for a cut that is early, a step back from the
     end for one that is late. Always the smallest correction that lands
     inside, which is the whole idea, and `MARGIN` under half of `MIN_SILENCE`
     is what keeps a step from crossing to the far side.

     Aiming only at the start, as this did at first, is not a smaller error in
     the other direction: it is a different boundary. Abdul Basit's mujawwad
     cuts arrive a systematic 330ms *after* their pause, so a start-only rule
     turned a 330ms correction into a 4.5s relocation, the window then
     rejected all of it, and 95% of that recitation's cuts came back
     "no pause here" when every one of them had a pause a third of a second
     away. The two of Husary's that travelled backwards were the same bug
     showing a symptom, and the window guard hid it rather than fixing it. */
  const at = cut < best.from ? best.from + MARGIN : best.to - MARGIN;
  // The window bounds the move itself, not the distance to the nearest edge.
  if (Math.abs(at - cut) > WINDOW)
    return { kind: 'unfounded', nearest: Math.abs(at - cut) };
  return { kind: 'moved', at, by: at - cut };
}

/** Run `work` over `items` with at most `width` in flight. */
async function pooled<T, R>(
  items: readonly T[],
  width: number,
  work: (item: T, index: number) => Promise<R>,
) {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(width, items.length) }, async () => {
      while (next < items.length) {
        const index = next++;
        out[index] = await work(items[index], index);
      }
    }),
  );
  return out;
}

const median = (xs: readonly number[]) => {
  if (!xs.length) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

async function verify(
  id: string,
  write: boolean,
  limit: number,
  force: boolean,
) {
  const path = new URL(`${id}.json`, TIMINGS);
  const file = JSON.parse(readFileSync(path, 'utf8')) as TimingFile;
  const all = Object.keys(file.bounds);
  // `--limit` is for trying the pipeline out; writing a partial pass would
  // throw away every ayah it did not reach, so the two do not combine.
  const keys = limit ? all.slice(0, limit) : all;
  if (limit && write)
    throw new Error('--limit cannot be combined with --write');

  console.log(`\n${id}`);
  /* What the recording can be asked, before it is asked fifteen hundred
     times. Spread across the run rather than taken off the front, so a sura
     recorded on its own day does not stand for the whole mushaf. */
  const step = Math.max(1, Math.floor(keys.length / SOUNDINGS));
  const soundings: number[] = [];
  for (const key of keys.filter((_, i) => i % step === 0).slice(0, SOUNDINGS)) {
    const [surah, ayah] = key.split(':').map(Number);
    try {
      soundings.push(
        ...(await envelope(new URL(await recording(surah, ayah, id)).pathname)),
      );
    } catch {
      // A file that will not read says nothing about the mastering either way.
    }
  }
  const ear = soundings.length ? hearing(soundings) : null;
  if (ear)
    console.log(
      `  mastering        floor ${ear.floor.toFixed(1)}dBFS, speech ${ear.speech.toFixed(1)}dBFS, ` +
        `${ear.range.toFixed(1)}dB apart, ${(ear.under * 100).toFixed(1)}% of it under ${NOISE}`,
    );
  if (ear && !ear.measurable) {
    console.log(
      `  a gate at ${NOISE} cannot hear this recitation: it needs ${MIN_RANGE}dB of room and has ${ear.range.toFixed(1)}.\n` +
        `  Nothing measured, nothing written. These cuts stay on the constant, which at least does not\n` +
        `  pretend to have listened. Hearing them would take a detector that follows the voice rather\n` +
        `  than the level; see data/README.md.`,
    );
    return;
  }
  const kept: number[] = [];
  const moved: number[] = [];
  const unfounded: number[] = [];
  let failed = 0;
  const next: Bounds = {};
  const emptied: string[] = [];

  let done = 0;
  await pooled(keys, 6, async (key) => {
    const [surah, ayah] = key.split(':').map(Number);
    let heard: { found: { from: number; to: number }[]; duration: number };
    try {
      heard = await silences(
        new URL(await recording(surah, ayah, id)).pathname,
      );
    } catch (error) {
      // A recording that cannot be fetched or read says nothing either way, so
      // its cuts are left exactly as they were rather than dropped.
      failed++;
      next[key] = file.bounds[key];
      return;
    }
    const survivors: number[] = [];
    for (const cut of file.bounds[key]) {
      const verdict = judge(cut, heard.found);
      if (verdict.kind === 'kept') {
        kept.push(0);
        survivors.push(verdict.at);
      } else if (verdict.kind === 'moved') {
        moved.push(verdict.by);
        survivors.push(verdict.at);
      } else unfounded.push(verdict.nearest);
    }
    /* Cuts must stay strictly increasing and distinct, and the last one has to
       leave something worth playing after it, exactly as when they were
       generated. Two cuts snapped into one silence collapse to one. */
    const tidy = [...new Set(survivors)]
      .sort((a, b) => a - b)
      .filter((cut) => cut <= heard.duration - MIN_CLIP);
    /* All or nothing per ayah. `buildSegments` cuts an ayah only when it has
       exactly one boundary per gap between its phrases, so a partial set is
       not something the app can use: keeping it would be dead weight in the
       file and a promise it cannot keep. */
    if (tidy.length === file.bounds[key].length) next[key] = tidy;
    else emptied.push(key);
    if (++done % 200 === 0)
      process.stderr.write(`  ${id}: ${done}/${keys.length}\n`);
  });

  const total = kept.length + moved.length + unfounded.length;
  const away = moved.map(Math.abs);
  console.log(
    `  ayat with cuts   ${keys.length} -> ${Object.keys(next).length}`,
  );
  /* What is written, not what survived judgement: the cuts of an ayah that
     lost one of its own go with it, so the two differ. */
  const written = Object.values(next).reduce((n, cuts) => n + cuts.length, 0);
  console.log(`  cuts             ${total} -> ${written} written`);
  console.log(
    `  already in silence ${kept.length} (${((kept.length / total) * 100).toFixed(1)}%)`,
  );
  /* Signed as well as absolute, because the sign is the diagnostic: if the
     cuts that move mostly move later, LAG is too short, and by how much. */
  const later = moved.filter((by) => by > 0);
  const earlier = moved.filter((by) => by < 0);
  console.log(
    `  moved into one     ${moved.length} (${((moved.length / total) * 100).toFixed(1)}%), median ${median(away)}ms, max ${away.length ? Math.max(...away) : 0}ms`,
  );
  console.log(
    `    later            ${later.length}, median +${median(later)}ms`,
  );
  console.log(
    `    earlier          ${earlier.length}, median ${median(earlier)}ms`,
  );
  const nowhere = unfounded.filter((d) => !Number.isFinite(d)).length;
  const missed = unfounded.filter((d) => Number.isFinite(d));
  console.log(
    `  no silence at all  ${unfounded.length} (${((unfounded.length / total) * 100).toFixed(1)}%)`,
  );
  console.log(`    none in the ayah ${nowhere}`);
  console.log(
    `    outside ${WINDOW}ms    ${missed.length}, median ${median(missed)}ms, min ${missed.length ? Math.min(...missed) : 0}ms`,
  );
  console.log(
    `  ayat left whole    ${emptied.length} (one cut lost costs the ayah: a partial set is unusable)`,
  );
  if (failed)
    console.log(`  recordings unread  ${failed} (cuts left as they were)`);
  /* A distribution whose largest move is exactly the window is not being
     described by the measurement, it is being clipped by it: the real offset
     of this recitation is somewhere past the edge, and so is an unknown share
     of the cuts counted "no silence within the window" above. */
  if (away.length && Math.max(...away) >= WINDOW)
    console.log(
      `  note: the largest move reaches ${WINDOW}ms, the window itself, so this recitation's offset is\n` +
        `  truncated by the window rather than measured by it.`,
    );

  const intact = Object.keys(next).length / (keys.length || 1);
  if (write && intact < MIN_YIELD && !force) {
    console.log(
      `  Nothing written: ${(intact * 100).toFixed(1)}% of ayat kept a usable set and the floor is ${(MIN_YIELD * 100).toFixed(0)}%.\n` +
        `  A collapse this size is a fault in the measurement, not a finding about the reciter, and\n` +
        `  writing it would take «جملة» away from this recitation without saying so. Pass --force if\n` +
        `  you have read the numbers above and mean it.`,
    );
    return;
  }

  if (write) {
    file.bounds = Object.fromEntries(
      Object.keys(next)
        .sort((a, b) => {
          const [as, aa] = a.split(':').map(Number);
          const [bs, ba] = b.split(':').map(Number);
          return as - bs || aa - ba;
        })
        .map((k) => [k, next[k]]),
    );
    file.verified = new Date().toISOString().slice(0, 10);
    writeFileSync(path, `${JSON.stringify(file, null, 2)}\n`);
    console.log(`  written`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const write = args.includes('--write');
  const force = args.includes('--force');
  const wanted = args.filter((a) => !a.startsWith('--'));
  const limit = Number(/--limit=(\d+)/.exec(args.join(' '))?.[1] ?? 0);
  const ids = (
    wanted.length
      ? wanted
      : reciters.filter((r) => r.recitation !== undefined).map((r) => r.id)
  ).filter((id) => existsSync(new URL(`${id}.json`, TIMINGS)));
  if (!ids.length) throw new Error('no timing files for the reciters given');
  mkdirSync(CACHE, { recursive: true });
  for (const id of ids) await verify(id, write, limit, force);
}

if (pathToFileURL(process.argv[1]).href === import.meta.url)
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });

export {
  judge,
  silences,
  hearing,
  MIN_SILENCE,
  WINDOW,
  MARGIN,
  MIN_RANGE,
  MIN_YIELD,
  NOISE,
};

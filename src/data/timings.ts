/* Phrase-boundary timings, generated offline by `scripts/prepare-timings.ts`
   and committed, so cutting an ayah at the reciter's own pauses needs no
   network call and no third-party API at run time. */

/* Only `bounds` is read here. The rest is provenance, declared so the shape
   of the file is described in one place rather than only in the script that
   writes it. */
type TimingFile = {
  reciter: string;
  recitation: number;
  /** The exact endpoint the word timings came from. */
  source?: string;
  generated: string;
  /** When the cuts were last measured against the recordings themselves, by
      `scripts/verify-cuts.ts`. Absent means they rest on the constant. */
  verified?: string;
  /** Boundaries inside an ayah keyed `surah:ayah`, in milliseconds. */
  bounds: Record<string, number[]>;
};

/** Cuts inside one ayah in seconds, or null when this reciter has none. */
export type ReciterTimings = (surah: number, ayah: number) => number[] | null;

const files = import.meta.glob<TimingFile>('./timings/*.json', {
  import: 'default',
});

const cache = new Map<string, ReciterTimings>();
const pending = new Map<string, Promise<ReciterTimings>>();

const lookup = (file: TimingFile): ReciterTimings => {
  const bounds = file.bounds;
  return (surah, ayah) => {
    const cuts = bounds[`${surah}:${ayah}`];
    return cuts ? cuts.map((ms) => ms / 1000) : null;
  };
};

export const cachedTimings = (reciter: string) => cache.get(reciter);

export function loadTimings(reciter: string): Promise<ReciterTimings> {
  const ready = cache.get(reciter);
  if (ready) return Promise.resolve(ready);
  const inFlight = pending.get(reciter);
  if (inFlight) return inFlight;
  const loader = files[`./timings/${reciter}.json`];
  if (!loader) return Promise.reject(new Error('Unknown reciter'));
  const request = loader()
    .then((file) => {
      const timings = lookup(file);
      cache.set(reciter, timings);
      return timings;
    })
    .finally(() => pending.delete(reciter));
  pending.set(reciter, request);
  return request;
}

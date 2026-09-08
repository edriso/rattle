/* Per-ayah recitation audio. EveryAyah serves constant-bitrate MP3s for every
   ayah of every reciter below with `access-control-allow-origin: *`, which is
   what lets the session decode and splice them through the Web Audio API.

   Quran.com keeps a mirror of the same tree and serves its own audio from it,
   so every recording has a second address. A fetch tries the addresses in
   order, which carries a session through one host being unreachable. Both
   sit behind the same CDN, so this covers an origin or a folder going
   missing, not that CDN going down. */

export type Reciter = {
  id: string;
  name: string;
  /** EveryAyah folder holding one MP3 per ayah, named `SSSAAA.mp3`. */
  folder: string;
  /**
   * Folder to reach for on the mirror, where it does not carry this exact
   * cut. The two that differ are a higher bitrate of the same reading, a
   * constant 79ms or less longer whatever the ayah, so the vendored phrase
   * timings still land. See AGENTS.md for the measurements.
   */
  mirror?: string;
  /** Constant bitrate of that folder, in kbps, used to size a download. */
  kbps: number;
  /**
   * Quran.com recitation id, the source of the vendored phrase timings, or
   * absent where nobody has published word timings for this mushaf. Such a
   * recitation is drilled by the ayah and never cut inside one.
   */
  recitation?: number;
  /**
   * Seconds of recitation per Arabic letter, measured over the reciter's whole
   * mushaf. Used to estimate a session before any audio has been fetched.
   */
  pace: number;
};

/* Ordered from the most deliberate recitation to the swiftest, because a
   learner taking on new material wants the slow end of the list. */
export const reciters: readonly Reciter[] = [
  {
    id: 'husary-muallim',
    name: 'محمود خليل الحصري (المعلّم)',
    folder: 'Husary_Muallim_128kbps',
    kbps: 128,
    recitation: 12,
    pace: 0.526,
  },
  {
    id: 'husary',
    name: 'محمود خليل الحصري',
    folder: 'Husary_64kbps',
    kbps: 64,
    recitation: 6,
    pace: 0.471,
  },
  {
    id: 'abdulbasit',
    name: 'عبد الباسط عبد الصمد',
    folder: 'Abdul_Basit_Murattal_64kbps',
    kbps: 64,
    recitation: 2,
    pace: 0.34,
  },
  {
    id: 'alafasy',
    name: 'مشاري راشد العفاسي',
    folder: 'Alafasy_128kbps',
    kbps: 128,
    recitation: 7,
    pace: 0.327,
  },
  {
    id: 'minshawi',
    name: 'محمد صديق المنشاوي',
    folder: 'Minshawy_Murattal_128kbps',
    kbps: 128,
    recitation: 9,
    pace: 0.319,
  },
  {
    id: 'shatri',
    name: 'أبو بكر الشاطري',
    folder: 'Abu_Bakr_Ash-Shaatree_128kbps',
    kbps: 128,
    recitation: 4,
    pace: 0.285,
  },
  {
    id: 'dussary',
    name: 'ياسر الدوسري',
    folder: 'Yasser_Ad-Dussary_128kbps',
    kbps: 128,
    recitation: 97,
    pace: 0.283,
  },
  {
    id: 'sudais',
    name: 'عبد الرحمن السديس',
    folder: 'Abdurrahmaan_As-Sudais_64kbps',
    mirror: 'Abdurrahmaan_As-Sudais_192kbps',
    kbps: 64,
    recitation: 3,
    pace: 0.233,
  },
  {
    id: 'shuraim',
    name: 'سعود الشريم',
    folder: 'Saood_ash-Shuraym_64kbps',
    mirror: 'Saood_ash-Shuraym_128kbps',
    kbps: 64,
    recitation: 10,
    pace: 0.201,
  },
];

export const defaultReciter = 'husary';

const byId = new Map(reciters.map((r) => [r.id, r]));

export const findReciter = (id: string): Reciter =>
  byId.get(id) ?? byId.get(defaultReciter)!;

/** Pace bands, so the picker can say how deliberate a recitation is. */
export function paceLabel(pace: number): string {
  if (pace >= 0.6) return 'متأنٍّ جدًّا';
  if (pace >= 0.45) return 'متأنٍّ';
  if (pace >= 0.3) return 'معتدل';
  return 'سريع';
}

/**
 * Whether an ayah of this recitation can be cut into phrases. It needs
 * published word timings, and not every mushaf has them; without them the
 * drill works by the ayah and the interface does not offer «جملة».
 */
export const cutsPhrases = (id: string) =>
  findReciter(id).recitation !== undefined;

const pad = (n: number) => String(n).padStart(3, '0');

const HOME = 'https://everyayah.com/data';
const MIRROR = 'https://mirrors.quranicaudio.com/everyayah';

/** URL of one ayah as recited by one reciter. This is the address the
    recording is fetched, cached and keyed under; a mirror is only ever
    reached for, never remembered under an address of its own. */
export function ayahAudioUrl(
  surah: number,
  ayah: number,
  reciter: string,
): string {
  return `${HOME}/${findReciter(reciter).folder}/${pad(surah)}${pad(ayah)}.mp3`;
}

const AYAH_URL = /^https:\/\/everyayah\.com\/data\/([^/]+)\/(\d{6})\.mp3$/;

const mirrorFolders = new Map(
  reciters.map((r) => [r.folder, r.mirror ?? r.folder]),
);

/** Other addresses for the recording at `url`, in the order to try them.
    Anything this module did not mint has none, which leaves a caller holding
    such a URL behaving exactly as it did before there were mirrors. */
export function audioMirrors(url: string): readonly string[] {
  const match = AYAH_URL.exec(url);
  if (!match) return [];
  const folder = mirrorFolders.get(match[1]);
  return folder ? [`${MIRROR}/${folder}/${match[2]}.mp3`] : [];
}

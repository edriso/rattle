/* Per-ayah recitation audio. EveryAyah serves constant-bitrate MP3s for every
   ayah of every reciter below with `access-control-allow-origin: *`, which is
   what lets the session decode and splice them through the Web Audio API. */

export type Reciter = {
  id: string;
  name: string;
  /** EveryAyah folder holding one MP3 per ayah, named `SSSAAA.mp3`. */
  folder: string;
  /** Constant bitrate of that folder, in kbps, used to size a download. */
  kbps: number;
  /** Quran.com recitation id, the source of the vendored phrase timings. */
  recitation: number;
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
    kbps: 64,
    recitation: 3,
    pace: 0.233,
  },
  {
    id: 'shuraim',
    name: 'سعود الشريم',
    folder: 'Saood_ash-Shuraym_64kbps',
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
  if (pace >= 0.45) return 'متأنٍّ';
  if (pace >= 0.3) return 'معتدل';
  return 'سريع';
}

const pad = (n: number) => String(n).padStart(3, '0');

/** URL of one ayah as recited by one reciter. */
export function ayahAudioUrl(
  surah: number,
  ayah: number,
  reciter: string,
): string {
  return `https://everyayah.com/data/${findReciter(reciter).folder}/${pad(surah)}${pad(ayah)}.mp3`;
}

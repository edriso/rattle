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
  /**
   * The name where there is only room for a name: the start screen carries
   * the reciter beside the estimate his pace decides, on one line of a phone.
   * Required rather than derived, because which part of a name is the
   * recognisable part is a judgement about that name and not a rule about
   * strings, and a truncated «محمد صديق المنش…» helps nobody.
   */
  short: string;
  /** EveryAyah folder holding one MP3 per ayah, named `SSSAAA.mp3`. */
  folder: string;
  /**
   * Folder to reach for on the mirror, where it does not carry this exact
   * cut. All three that differ are a higher bitrate of the same reading, and
   * run a bounded 79 ms or less longer whatever the ayah, so the vendored
   * phrase timings still land. See AGENTS.md for the measurements.
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
   learner taking on new material wants the slow end of the list.

   What is not here, and why, so nobody spends the afternoon finding out again:
   محمود علي البنا is on EveryAyah at 32 kbps only, no mirror carries him under
   any name, and Quran.com returns `segments: []` for all 6,236 of his ayat.
   عبد الله بصفر and علي الحذيفي and محمد أيوب have no word segments either,
   and Quran.com's Basfar is a different recording from EveryAyah's: 0.279
   s/letter against 0.332 measured off the files this app would play. مصحف
   المنشاوي المعلّم has segments for every ayah, and they describe a different
   master: over the whole mushaf its chapter timings disagree with the
   per-ayah files by 3-8% in twenty-three surahs and by 88% in az-Zumar, and
   in al-Baqarah only 10 of 286 ayat agree within 0.3 s. Trusting those would
   put every cut in the wrong place while looking perfectly healthy. */
export const reciters: readonly Reciter[] = [
  {
    id: 'minshawi-mujawwad',
    name: 'محمد صديق المنشاوي (المجوّد)',
    short: 'المنشاوي (المجوّد)',
    folder: 'Minshawy_Mujawwad_64kbps',
    // The mirror does not carry the 64 kbps cut. Measured over twelve ayat
    // from 2 to 391 seconds, the folder it does carry runs a bounded 26 to
    // 52 ms longer, which is one MP3 frame of encoder padding rather than
    // drift, so a phrase cut still lands where the timings put it.
    mirror: 'Minshawy_Mujawwad_192kbps',
    kbps: 64,
    recitation: 8,
    pace: 0.659,
  },
  {
    id: 'abdulbasit-mujawwad',
    name: 'عبد الباسط عبد الصمد (المجوّد)',
    short: 'عبد الباسط (المجوّد)',
    folder: 'Abdul_Basit_Mujawwad_128kbps',
    kbps: 128,
    recitation: 1,
    pace: 0.648,
  },
  {
    id: 'husary-muallim',
    name: 'محمود خليل الحصري (المعلّم)',
    short: 'الحصري (المعلّم)',
    folder: 'Husary_Muallim_128kbps',
    kbps: 128,
    recitation: 12,
    pace: 0.526,
  },
  {
    id: 'husary',
    name: 'محمود خليل الحصري',
    short: 'الحصري',
    folder: 'Husary_64kbps',
    kbps: 64,
    recitation: 6,
    pace: 0.471,
  },
  {
    id: 'ayman-sowaid',
    name: 'أيمن سويد',
    short: 'أيمن سويد',
    folder: 'Ayman_Sowaid_64kbps',
    kbps: 64,
    /* No `recitation`: Quran.com publishes no word timings for this mushaf,
       and no other host publishes any either. Every id from 1 to 400 was
       probed; 174 is the highest that exists and none of them is his. So this
       one is drilled by the ayah and never cut inside one.
       Its pace is measured from the recordings' own lengths rather than from
       timings: 421 ayat spread over all 114 surahs, sized from their
       content-length at the folder's constant bitrate, then calibrated by
       measuring `husary` the same way and scaling by the 1.5% the method
       overstated his known pace by. */
    pace: 0.459,
  },
  {
    id: 'abdulbasit',
    name: 'عبد الباسط عبد الصمد',
    short: 'عبد الباسط',
    folder: 'Abdul_Basit_Murattal_64kbps',
    kbps: 64,
    recitation: 2,
    pace: 0.34,
  },
  {
    id: 'alafasy',
    name: 'مشاري راشد العفاسي',
    short: 'العفاسي',
    folder: 'Alafasy_128kbps',
    kbps: 128,
    recitation: 7,
    pace: 0.327,
  },
  {
    id: 'minshawi',
    name: 'محمد صديق المنشاوي',
    short: 'المنشاوي',
    folder: 'Minshawy_Murattal_128kbps',
    kbps: 128,
    recitation: 9,
    pace: 0.319,
  },
  {
    id: 'shatri',
    name: 'أبو بكر الشاطري',
    short: 'الشاطري',
    folder: 'Abu_Bakr_Ash-Shaatree_128kbps',
    kbps: 128,
    recitation: 4,
    pace: 0.285,
  },
  {
    id: 'dussary',
    name: 'ياسر الدوسري',
    short: 'الدوسري',
    folder: 'Yasser_Ad-Dussary_128kbps',
    kbps: 128,
    recitation: 97,
    pace: 0.283,
  },
  {
    id: 'sudais',
    name: 'عبد الرحمن السديس',
    short: 'السديس',
    folder: 'Abdurrahmaan_As-Sudais_64kbps',
    mirror: 'Abdurrahmaan_As-Sudais_192kbps',
    kbps: 64,
    recitation: 3,
    pace: 0.233,
  },
  {
    id: 'shuraim',
    name: 'سعود الشريم',
    short: 'الشريم',
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

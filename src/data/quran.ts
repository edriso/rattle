import { cutsPhrases, defaultReciter, findReciter } from './audio';
import {
  defaultPlan,
  restorePlan,
  type SchedulePlan,
} from '../memorize/schedule';
import {
  isEcho,
  isGrain,
  type EchoMode,
  type Grain,
} from '../memorize/session';
// Local catalogue, and the device preferences restored from storage.
const names =
  'الفاتحة البقرة آل_عمران النساء المائدة الأنعام الأعراف الأنفال التوبة يونس هود يوسف الرعد إبراهيم الحجر النحل الإسراء الكهف مريم طه الأنبياء الحج المؤمنون النور الفرقان الشعراء النمل القصص العنكبوت الروم لقمان السجدة الأحزاب سبأ فاطر يس الصافات ص الزمر غافر فصلت الشورى الزخرف الدخان الجاثية الأحقاف محمد الفتح الحجرات ق الذاريات الطور النجم القمر الرحمن الواقعة الحديد المجادلة الحشر الممتحنة الصف الجمعة المنافقون التغابن الطلاق التحريم الملك القلم الحاقة المعارج نوح الجن المزمل المدثر القيامة الإنسان المرسلات النبأ النازعات عبس التكوير الانفطار المطففين الانشقاق البروج الطارق الأعلى الغاشية الفجر البلد الشمس الليل الضحى الشرح التين العلق القدر البينة الزلزلة العاديات القارعة التكاثر العصر الهمزة الفيل قريش الماعون الكوثر الكافرون النصر المسد الإخلاص الفلق الناس'.split(
    ' ',
  );
const counts = [
  7, 286, 200, 176, 120, 165, 206, 75, 129, 109, 123, 111, 43, 52, 99, 128, 111,
  110, 98, 135, 112, 78, 118, 64, 77, 227, 93, 88, 69, 60, 34, 30, 73, 54, 45,
  83, 182, 88, 75, 85, 54, 53, 89, 59, 37, 35, 38, 29, 18, 45, 60, 49, 62, 55,
  78, 96, 29, 22, 24, 13, 14, 11, 11, 18, 12, 12, 30, 52, 52, 44, 28, 28, 20,
  56, 40, 31, 50, 40, 46, 42, 29, 19, 36, 25, 22, 17, 19, 26, 30, 20, 15, 21,
  11, 8, 8, 19, 5, 8, 8, 11, 11, 8, 3, 9, 5, 4, 7, 3, 6, 3, 5, 4, 5, 6,
];
export const surahs = names.map((name, i) => ({
  id: i + 1,
  name: name.replace('_', ' '),
  count: counts[i],
}));
export {
  arabic,
  ayatCount,
  counted,
  daysCount,
  digits,
  minutesCount,
  normalize,
  timesCount,
} from './arabic';

export type Screen = 'home' | 'session' | 'practice';

export type Preferences = {
  screen: Screen;
  surah: number;
  /** First ayah of the passage, and the position free practice sits at. */
  ayah: number;
  /** Last ayah of the passage a session drills. */
  to: number;
  reciter: string;
  theme: 'gold' | 'sage' | 'blue' | 'rose';
  appearance: 'dark' | 'light' | 'system';
  /** Ayat shown at once in free practice. */
  perView: number;
  /**
   * Whether recitation carries on into the next ayat in free review. It is
   * not autoplay: nothing starts without the learner pressing play, and a run
   * they paused stays paused. It only keeps a run that is already sounding
   * from stopping every time they move.
   */
  keepPlaying: boolean;
  grain: Grain;
  echo: EchoMode;
  plan: SchedulePlan;
};

/** A first passage short enough to finish, so a session never opens daunting. */
const PASSAGE = 5;

export const defaults: Preferences = {
  screen: 'home',
  surah: 1,
  ayah: 1,
  to: PASSAGE,
  reciter: defaultReciter,
  theme: 'gold',
  appearance: 'dark',
  perView: 1,
  keepPlaying: true,
  grain: 1,
  echo: 1,
  plan: defaultPlan,
};

/** Pull a stored number back into range, keeping as much of it as is usable. */
const clamped = (
  value: unknown,
  low: number,
  high: number,
  fallback: number,
) =>
  Number.isInteger(value)
    ? Math.min(high, Math.max(low, value as number))
    : fallback;

/**
 * The grain a reciter can actually be drilled at. Phrase level cuts inside an
 * ayah, which needs that reciter's word timings; where they do not exist the
 * choice falls back to one ayah rather than erroring in front of the learner.
 */
export const grainFor = (grain: Grain, reciter: string): Grain =>
  grain === 'phrase' && !cutsPhrases(reciter) ? 1 : grain;

export function restore(value: unknown): Preferences {
  if (!value || typeof value !== 'object') return defaults;
  const p = value as Partial<Preferences> & { started?: boolean };
  const surah = clamped(p.surah, 1, 114, 1);
  const count = surahs[surah - 1].count;
  const ayah = clamped(p.ayah, 1, count, 1);
  const reciter = findReciter(p.reciter ?? '').id;
  return {
    // A store written before the two modes existed only knew free practice.
    screen: (['home', 'session', 'practice'] as const).includes(p.screen!)
      ? p.screen!
      : p.started === true
        ? 'practice'
        : 'home',
    surah,
    ayah,
    to: clamped(p.to, ayah, count, Math.min(count, ayah + PASSAGE - 1)),
    reciter,
    theme: (['gold', 'sage', 'blue', 'rose'] as const).includes(p.theme!)
      ? p.theme!
      : defaults.theme,
    appearance: (['dark', 'light', 'system'] as const).includes(p.appearance!)
      ? p.appearance!
      : defaults.appearance,
    perView: clamped(p.perView, 1, 5, 1),
    keepPlaying:
      typeof p.keepPlaying === 'boolean' ? p.keepPlaying : defaults.keepPlaying,
    grain: grainFor(isGrain(p.grain) ? p.grain : defaults.grain, reciter),
    echo: isEcho(p.echo) ? p.echo : defaults.echo,
    plan: restorePlan(p.plan),
  };
}

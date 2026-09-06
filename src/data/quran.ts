import { reciters } from './audio';
// Local catalogue and validated device preferences. Audio integration is separate.
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
const numberFormat = new Intl.NumberFormat('ar-EG', { useGrouping: false });
export const arabic = (n: number) => numberFormat.format(n);
export const normalize = (s: string) =>
  s
    .normalize('NFKD')
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي');
export type Preferences = {
  started: boolean;
  surah: number;
  ayah: number;
  reciter: string;
  theme: 'gold' | 'sage' | 'blue' | 'rose';
  appearance: 'dark' | 'light' | 'system';
  perView: number;
};
export const defaults: Preferences = {
  started: false,
  surah: 1,
  ayah: 1,
  reciter: reciters[0].id,
  theme: 'gold',
  appearance: 'dark',
  perView: 1,
};
export function restore(value: unknown): Preferences {
  if (!value || typeof value !== 'object') return defaults;
  const p = value as Partial<Preferences>;
  const surah =
    Number.isInteger(p.surah) && p.surah! >= 1 && p.surah! <= 114
      ? p.surah!
      : 1;
  return {
    started: p.started === true,
    surah,
    ayah: Number.isInteger(p.ayah)
      ? Math.max(1, Math.min(surahs[surah - 1].count, p.ayah!))
      : 1,
    reciter: reciters.some((r) => r.id === p.reciter)
      ? p.reciter!
      : defaults.reciter,
    theme: ['gold', 'sage', 'blue', 'rose'].includes(p.theme!)
      ? p.theme!
      : defaults.theme,
    appearance: ['dark', 'light', 'system'].includes(p.appearance!)
      ? p.appearance!
      : defaults.appearance,
    perView: Number.isInteger(p.perView)
      ? Math.max(1, Math.min(5, p.perView!))
      : 1,
  };
}

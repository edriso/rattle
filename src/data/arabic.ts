/* Arabic-Indic digits, and the noun agreement a counted number takes. */

const numberFormat = new Intl.NumberFormat('ar-EG', { useGrouping: false });
export const arabic = (n: number) => numberFormat.format(n);
/**
 * A number with its counted noun, following Arabic agreement: one and two
 * take their own words, three to ten take the plural, and above that the
 * singular returns in the accusative.
 */
export function counted(
  n: number,
  forms: { one: string; two: string; few: string; many: string },
) {
  if (n === 1) return forms.one;
  if (n === 2) return forms.two;
  const unit = n % 100;
  return `${arabic(n)} ${unit >= 3 && unit <= 10 ? forms.few : forms.many}`;
}

export const ayatCount = (n: number) =>
  counted(n, {
    one: 'آية واحدة',
    two: 'آيتان',
    few: 'آيات',
    many: 'آية',
  });

export const timesCount = (n: number) =>
  counted(n, {
    one: 'مرة واحدة',
    two: 'مرتان',
    few: 'مرات',
    many: 'مرة',
  });

export const minutesCount = (n: number) =>
  counted(n, {
    one: 'دقيقة',
    two: 'دقيقتان',
    few: 'دقائق',
    many: 'دقيقة',
  });

export const daysCount = (n: number) =>
  counted(n, { one: 'يوم', two: 'يومان', few: 'أيام', many: 'يومًا' });

export const normalize = (s: string) =>
  s
    .normalize('NFKD')
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي');
/** Which of the two ways of working the app is showing. */

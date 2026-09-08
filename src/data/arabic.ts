/* Arabic-Indic digits, and the noun agreement a counted number takes. */

const numberFormat = new Intl.NumberFormat('ar-EG', { useGrouping: false });
export const arabic = (n: number) => numberFormat.format(n);

/**
 * The digits of a typed number, whichever numerals the keyboard produced.
 * An Arabic layout types ٢٥٥ and a Latin one types 255; both mean the same
 * ayah, and a field that takes only one of them turns a reader away.
 */
export const digits = (value: string) =>
  value
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06f0-\u06f9]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[^0-9]/g, '');
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

/**
 * The form of Arabic text this app searches by. Everything a plain keyboard
 * cannot type goes: harakat, the dagger alef, the mushaf's waqf marks and
 * small letters, the tatweel. Hamza and alef-wasla fold to a bare alef and
 * the alef maksura to ya, and the spaces the stripped marks leave behind
 * close up, so a phrase typed across one of them still matches.
 *
 * The escapes are numeric on purpose: a bidirectional editor reorders a
 * character range on screen, so a range typed as Arabic letters can be saved
 * differently from how it reads.
 */
export const normalize = (s: string) =>
  s
    .normalize('NFKD')
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g, '')
    .replace(/[\u0623\u0625\u0622\u0671]/g, '\u0627')
    .replace(/\u0649/g, '\u064A')
    .replace(/\s+/g, ' ')
    .trim();
/** Which of the two ways of working the app is showing. */

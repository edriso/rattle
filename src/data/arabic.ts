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
/** The forms a counted noun takes. One and two carry their own word instead
    of a numeral, so those two hold a whole phrase rather than a bare noun. */
export type CountedForms = {
  /** «آية واحدة»: the noun first, واحدة after it as a صفة. */
  one: string;
  /** The dual, «آيتان»: the form itself carries the two, with no numeral. */
  two: string;
  /** Three to ten, جمع مجرور: «٣ آيات». */
  few: string;
  /** Eleven to ninety-nine, مفرد منصوب. A noun ending in a consonant needs
      the alef its tanwin is written on here: «٢٠ يومًا», never «٢٠ يوم». */
  many: string;
  /** Exact hundreds and thousands, مفرد مجرور, where that alef goes again:
      «١٠٠ يوم». A noun ending in ة reads the same either way, which is why
      this may be left out. */
  hundred?: string;
  /** Nothing to count. Arabic does not say «٠ مرة»; it says there are none. */
  none?: string;
};

/**
 * A number with its counted noun.
 *
 * The band is read off `n % 100` rather than off `n`, because the تمييز
 * follows the number **beside** it and not the whole figure: ٢٠٦ آيات takes
 * the plural of the six, and ٢٨٦ آية the singular of the eighty-six. That is
 * مجمع اللغة العربية's «ويحكم التمييز نصبًا أو جرًا مميزُهُ».
 *
 * The dual is stored per counter instead of derived, because its case depends
 * on what governs it where it lands: «آيتان» standing alone as a label, but
 * «نحو دقيقتين», where «نحو» is a مضاف. This function cannot see that
 * context, so each counter below carries the form its own call sites need,
 * and a call site in a different position needs its own counter rather than
 * this one. Getting that wrong is what «نحو دقيقتان» was.
 *
 * Numerals stay as digits and are never spelt out, so the gender reversal of
 * three to ten, سبع آيات against سبعة أيام, never arises.
 */
export function counted(n: number, forms: CountedForms) {
  if (n === 0 && forms.none) return forms.none;
  if (n === 1) return forms.one;
  if (n === 2) return forms.two;
  const unit = n % 100;
  if (unit >= 3 && unit <= 10) return `${arabic(n)} ${forms.few}`;
  if (unit === 0 && forms.hundred) return `${arabic(n)} ${forms.hundred}`;
  return `${arabic(n)} ${forms.many}`;
}

/** Ayat, as a label with nothing governing it, so the dual is مرفوع. */
export const ayatCount = (n: number) =>
  counted(n, {
    one: 'آية واحدة',
    two: 'آيتان',
    few: 'آيات',
    many: 'آية',
  });

/** Plays of a run, as a label. */
export const timesCount = (n: number) =>
  counted(n, {
    one: 'مرة واحدة',
    two: 'مرتان',
    few: 'مرات',
    many: 'مرة',
    none: 'بلا تكرار',
  });

/** Minutes after «نحو», which is a مضاف, so its dual is مجرور. */
export const minutesCount = (n: number) =>
  counted(n, {
    one: 'دقيقة',
    two: 'دقيقتين',
    few: 'دقائق',
    many: 'دقيقة',
  });

/** Days as a ظرف زمان منصوب, «متأخرة يومين», so the dual is منصوب too. */
export const daysCount = (n: number) =>
  counted(n, {
    one: 'يومًا واحدًا',
    two: 'يومين',
    few: 'أيام',
    many: 'يومًا',
    hundred: 'يوم',
  });

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

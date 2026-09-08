import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  arabic,
  ayatCount,
  counted,
  daysCount,
  digits,
  minutesCount,
  normalize,
  timesCount,
} from './arabic';
import { surahs } from './quran';
import { openVerse } from './verse';

describe('counted nouns', () => {
  /* The band follows `n % 100` and not `n`, because the تمييز takes its case
     from the number beside it rather than from the whole figure. Al-A'raf and
     Ali Imran are the two real cases in the mushaf where that matters. */
  it('agrees with the number beside the noun, not the whole figure', () => {
    expect(ayatCount(1)).toBe('آية واحدة');
    expect(ayatCount(2)).toBe('آيتان');
    expect(ayatCount(3)).toBe('٣ آيات');
    expect(ayatCount(7)).toBe('٧ آيات');
    expect(ayatCount(10)).toBe('١٠ آيات');
    expect(ayatCount(11)).toBe('١١ آية');
    expect(ayatCount(86)).toBe('٨٦ آية');
    // ٢٠٦ takes the plural of its six; ٢٨٦ the singular of its eighty-six.
    expect(ayatCount(206)).toBe('٢٠٦ آيات');
    expect(ayatCount(286)).toBe('٢٨٦ آية');
    // An exact hundred is مضاف إليه, singular again.
    expect(ayatCount(100)).toBe('١٠٠ آية');
    expect(ayatCount(200)).toBe('٢٠٠ آية');
    // And past a hundred the bare words for one and two do not come back.
    expect(ayatCount(101)).toBe('١٠١ آية');
    expect(ayatCount(102)).toBe('١٠٢ آية');
  });

  /* Every surah's count is shown as a badge in the picker, and «٧ آية» for
     al-Fatiha was the bug. Nothing in the mushaf may read that way. */
  it('says every surah of the mushaf correctly', () => {
    for (const surah of surahs) {
      const said = ayatCount(surah.count);
      const unit = surah.count % 100;
      expect(said).toBe(
        `${arabic(surah.count)} ${unit >= 3 && unit <= 10 ? 'آيات' : 'آية'}`,
      );
    }
    expect(ayatCount(surahs[0].count)).toBe('٧ آيات');
    expect(ayatCount(surahs[1].count)).toBe('٢٨٦ آية');
    expect(ayatCount(surahs[6].count)).toBe('٢٠٦ آيات');
    expect(ayatCount(surahs[2].count)).toBe('٢٠٠ آية');
  });

  /* The dual's case comes from what governs it where it lands, which is why
     each counter carries its own and this is asserted at the call site's
     wording rather than at the helper's. */
  it('puts the dual in the case its sentence gives it', () => {
    // A bare label: nothing governs it, so مرفوع.
    expect(ayatCount(2)).toBe('آيتان');
    expect(timesCount(2)).toBe('مرتان');
    // «نحو» is a مضاف, so what follows it is مجرور.
    expect(`نحو ${minutesCount(2)}`).toBe('نحو دقيقتين');
    expect(`نحو ${minutesCount(1)}`).toBe('نحو دقيقة');
    expect(`نحو ${minutesCount(3)}`).toBe('نحو ٣ دقائق');
    expect(`نحو ${minutesCount(12)}`).toBe('نحو ١٢ دقيقة');
    // Duration is a ظرف زمان منصوب.
    expect(`متأخرة ${daysCount(2)}`).toBe('متأخرة يومين');
    expect(`متأخرة ${daysCount(5)}`).toBe('متأخرة ٥ أيام');
  });

  /* Tanwin is left off UI text, but the alef a fatha is written on is a
     letter and not a diacritic, so dropping it would be a spelling mistake. */
  it('keeps the alef the accusative singular is written on', () => {
    expect(daysCount(20)).toBe('٢٠ يومًا');
    expect(daysCount(35)).toBe('٣٥ يومًا');
    // An exact hundred is مجرور, where that alef goes again.
    expect(daysCount(100)).toBe('١٠٠ يوم');
  });

  it('says there are none rather than counting to zero', () => {
    expect(timesCount(0)).toBe('بلا تكرار');
    // A counter with nothing to say about zero still says something usable.
    expect(
      counted(0, { one: 'مرة', two: 'مرتان', few: 'مرات', many: 'مرة' }),
    ).toBe('٠ مرة');
  });
});

describe('numerals', () => {
  it('reads the digits of either keyboard', () => {
    expect(digits('٢٥٥')).toBe('255');
    expect(digits('255')).toBe('255');
    expect(digits('۲۵۵')).toBe('255');
    expect(digits('  ١٢ ')).toBe('12');
    expect(digits('البقرة')).toBe('');
  });

  it('writes Arabic-Indic digits without a thousands separator', () => {
    expect(arabic(6236)).toBe('٦٢٣٦');
  });
});

describe('search folding', () => {
  /* Read out of the pinned corpus rather than typed here. A verse typed from
     memory is a misquotation waiting to be committed, and the point of this
     test is what the folding does to real mushaf orthography anyway: alef
     wasla, the dagger alef, the small high marks, the waqf marks. */
  const verse = (surah: number, ayah: number) =>
    (
      JSON.parse(
        readFileSync(
          new URL(`./surahs/${surah}.json`, import.meta.url),
          'utf8',
        ),
      ) as { verses: string[] }
    ).verses[ayah - 1];

  it('leaves nothing a plain keyboard cannot type', () => {
    const folded = normalize(verse(2, 255));
    // Al-Baqarah 255 opens on an alef wasla and carries a dagger alef; both
    // are gone, and what is left is what somebody would actually type.
    expect(folded.startsWith('الله لا اله الا هو')).toBe(true);
    expect(folded).toContain('يعلم ما بين ايديهم');
    for (const surah of [1, 2, 18, 36, 55, 78, 93, 112, 114])
      for (const [index, text] of Object.entries(
        (
          JSON.parse(
            readFileSync(
              new URL(`./surahs/${surah}.json`, import.meta.url),
              'utf8',
            ),
          ) as { verses: string[] }
        ).verses,
      )) {
        const said = normalize(text);
        expect(said, `${surah}:${Number(index) + 1}`).toMatch(
          /^[\u0621-\u063A\u0641-\u064A ]*$/,
        );
        expect(said).not.toMatch(/ {2}|^ | $/);
      }
  });

  it('folds a hamza, an alef wasla and an alef maksura onto their bare forms', () => {
    /* Ad-Duha 1, which ends on an alef maksura carrying a dagger alef. Read
       through `openVerse`, because the corpus keeps the basmala at the head
       of the first ayah of every surah but al-Fatiha and at-Tawbah, and the
       app separates it there rather than in the data. */
    expect(normalize(openVerse(93, 1, verse(93, 1)).text)).toBe('والضحي');
    // Al-Fatiha 7 has the three hamza carriers between them.
    expect(normalize(verse(1, 7))).not.toMatch(
      /[\u0623\u0625\u0622\u0671\u0649]/,
    );
  });
});

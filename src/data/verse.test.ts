import { describe, expect, it } from 'vitest';
import { BASMALA, openVerse } from './verse';

const surahs = import.meta.glob<{ verses: string[] }>('./surahs/*.json', {
  import: 'default',
  eager: true,
});
const verse = (surah: number, ayah: number) =>
  surahs[`./surahs/${surah}.json`].verses[ayah - 1];

describe('separating the basmala from ayah one', () => {
  it('leaves al-Fatihah, where the basmala is ayah one itself', () => {
    expect(openVerse(1, 1, verse(1, 1))).toEqual({
      basmala: null,
      text: BASMALA,
    });
  });

  it('leaves at-Tawbah, which has no basmala', () => {
    const text = verse(9, 1);
    expect(openVerse(9, 1, text)).toEqual({ basmala: null, text });
  });

  it('splits the opening off every other surah and keeps both halves whole', () => {
    for (let surah = 2; surah <= 114; surah++) {
      if (surah === 9) continue;
      const source = verse(surah, 1);
      const { basmala, text } = openVerse(surah, 1, source);
      expect(basmala).toBeTruthy();
      expect(`${basmala} ${text}`).toBe(source);
      expect(text.startsWith('ب')).toBe(false);
    }
  });

  it('keeps the shadda spelling used in surahs 95 and 97', () => {
    for (const surah of [95, 97])
      expect(openVerse(surah, 1, verse(surah, 1)).basmala).not.toBe(BASMALA);
  });

  it('never touches an ayah other than the first', () => {
    // 27:30 quotes the basmala inside the ayah; it must stay put.
    const text = verse(27, 30);
    expect(openVerse(27, 30, text)).toEqual({ basmala: null, text });
  });
});

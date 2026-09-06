/* The source text opens ayah 1 of every surah but al-Fatihah and at-Tawbah
   with the basmala. It is not part of the numbered ayah, and the reciter
   records it separately, so display and audio both need it split off. Two
   surahs carry it with a shadda, joining it to the surah before. */
export const BASMALA = 'بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ';
const BASMALA_JOINED = 'بِّسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ';

export type OpenedVerse = { basmala: string | null; text: string };

/** Separate the basmala from ayah 1 without altering either half. */
export function openVerse(
  surah: number,
  ayah: number,
  verse: string,
): OpenedVerse {
  if (ayah !== 1 || surah === 1 || surah === 9)
    return { basmala: null, text: verse };
  const words = verse.split(' ');
  const opening = words.slice(0, 4).join(' ');
  if (opening !== BASMALA && opening !== BASMALA_JOINED)
    return { basmala: null, text: verse };
  return { basmala: opening, text: words.slice(4).join(' ') };
}

import { arabic } from '../data/quran';
import { openVerse } from '../data/text';
import { useSurah } from '../useSurah';
export function QuranVerses({
  surah,
  first,
  last,
}: {
  surah: number;
  first: number;
  last: number;
}) {
  const { verses, failed, retry } = useSurah(surah);
  if (!verses)
    return (
      <div className="placeholder" aria-live="polite">
        {failed ? (
          <>
            <p>تعذّر تحميل النص.</p>
            <button className="reveal-button" onClick={retry}>
              إعادة المحاولة
            </button>
          </>
        ) : (
          <p>جارٍ تحميل الآيات…</p>
        )}
      </div>
    );
  return (
    <div className="verses">
      {verses.slice(first - 1, last).map((raw, i) => {
        const ayah = first + i;
        // The basmala opens ayah 1 in the source text but is read on its own.
        const { basmala, text } = openVerse(surah, ayah, raw);
        return (
          <div key={ayah}>
            {basmala && <p className="quran-text basmala">{basmala}</p>}
            <p className="quran-text">
              {text}{' '}
              <span className="ayah-number">
                <span className="sr-only">الآية </span>
                {arabic(ayah)}
              </span>
            </p>
          </div>
        );
      })}
    </div>
  );
}

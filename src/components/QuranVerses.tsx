import { useEffect, useState } from 'react';
import { arabic } from '../data/quran';
import { cachedSurah, loadSurah, openVerse } from '../data/text';
export function QuranVerses({
  surah,
  first,
  last,
}: {
  surah: number;
  first: number;
  last: number;
}) {
  const [result, setResult] = useState<{
    id: number;
    verses?: readonly string[];
    error?: boolean;
  }>(() => ({ id: surah, verses: cachedSurah(surah) }));
  const [attempt, setAttempt] = useState(0);
  const verses =
    cachedSurah(surah) ?? (result.id === surah ? result.verses : undefined);
  useEffect(() => {
    if (verses) return;
    let active = true;
    void loadSurah(surah).then(
      (text) => {
        if (active) setResult({ id: surah, verses: text });
      },
      () => {
        if (active) setResult({ id: surah, error: true });
      },
    );
    return () => {
      active = false;
    };
  }, [surah, attempt, verses]);
  if (!verses)
    return (
      <div className="placeholder" aria-live="polite">
        {result.id === surah && result.error ? (
          <>
            <p>تعذّر تحميل النص.</p>
            <button
              className="reveal-button"
              onClick={() => {
                setResult({ id: surah });
                setAttempt((n) => n + 1);
              }}
            >
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
              <span className="ayah-number" aria-label={`الآية ${arabic(ayah)}`}>
                {arabic(ayah)}
              </span>
            </p>
          </div>
        );
      })}
    </div>
  );
}

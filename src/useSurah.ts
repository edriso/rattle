import { useEffect, useState } from 'react';
import { cachedSurah, loadSurah } from './data/text';

/**
 * One surah's verses, and a way to ask for them again if they did not arrive.
 * Both screens that show Quran need exactly this, and had a copy of it each.
 *
 * Nothing has to wait on the text: the passage picker works as a pair of
 * number fields until the openings arrive, and simply never shows them if the
 * load fails, while the verse frame does wait and offers `retry`.
 */
export function useSurah(surah: number) {
  const [result, setResult] = useState<{
    id: number;
    verses?: readonly string[];
    failed?: true;
  }>(() => ({ id: surah, verses: cachedSurah(surah) }));
  const [attempt, setAttempt] = useState(0);
  /* Read through the module cache during render rather than reaching for it in
     the effect, so a surah already in memory is drawn on the first paint. */
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
        if (active) setResult({ id: surah, failed: true });
      },
    );
    return () => {
      active = false;
    };
  }, [surah, attempt, verses]);
  return {
    verses,
    failed: result.id === surah && result.failed === true,
    retry: () => {
      setResult({ id: surah });
      setAttempt((n) => n + 1);
    },
  };
}

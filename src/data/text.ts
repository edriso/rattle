import firstSurah from './surahs/1.json';
import { surahs } from './quran';
type TextFile = { notice: string; verses: string[] };
const files = import.meta.glob<TextFile>(
  ['./surahs/*.json', '!./surahs/1.json'],
  {
    import: 'default',
  },
);
const cache = new Map<number, readonly string[]>([[1, firstSurah.verses]]);
const pending = new Map<number, Promise<readonly string[]>>();
export const cachedSurah = (id: number) => cache.get(id);
export function loadSurah(id: number): Promise<readonly string[]> {
  const cached = cache.get(id);
  if (cached) return Promise.resolve(cached);
  const existing = pending.get(id);
  if (existing) return existing;
  const loader = files[`./surahs/${id}.json`];
  if (!loader || !surahs[id - 1])
    return Promise.reject(new Error('Invalid surah'));
  const request = loader()
    .then(({ verses }) => {
      if (
        verses.length !== surahs[id - 1].count ||
        verses.some((v) => typeof v !== 'string' || !v)
      )
        throw new Error('Incomplete surah');
      cache.set(id, verses);
      return verses;
    })
    .finally(() => pending.delete(id));
  pending.set(id, request);
  return request;
}

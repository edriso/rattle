import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import { surahs, restore, defaults } from './data/quran';
import { cachedSurah, loadSurah } from './data/text';
it('preserves all 6,236 source verses and their notice exactly', async () => {
  const raw = readFileSync(
    new URL('../data/quran-uthmani.txt', import.meta.url),
    'utf8',
  );
  const checksum = readFileSync(
    new URL('../data/SHA256', import.meta.url),
    'utf8',
  ).split(' ')[0];
  expect(createHash('sha256').update(raw).digest('hex')).toBe(checksum);
  const lines = raw.split(/\r?\n/);
  const source = lines.filter((line) => /^\d+\|/.test(line));
  const notice = lines.filter((line) => line.startsWith('#')).join('\n');
  expect(source).toHaveLength(6236);
  let index = 0;
  for (const surah of surahs) {
    const verses = await loadSurah(surah.id);
    expect(verses).toHaveLength(surah.count);
    const file = JSON.parse(
      readFileSync(
        new URL(`./data/surahs/${surah.id}.json`, import.meta.url),
        'utf8',
      ),
    );
    expect(file.notice).toBe(notice);
    verses.forEach((verse, ayah) =>
      expect(`${surah.id}|${ayah + 1}|${verse}`).toBe(source[index++]),
    );
  }
});
it('deduplicates concurrent loads and reuses the loaded array', async () => {
  const first = loadSurah(2);
  const second = loadSurah(2);
  expect(await first).toBe(await second);
  expect(await loadSurah(2)).toBe(cachedSurah(2));
});
it('rejects invalid positions rather than substituting unrelated verses', async () => {
  await expect(loadSurah(115)).rejects.toThrow('Invalid surah');
});
it('drops obsolete display preferences while preserving progress and settings', () => {
  const restored = restore({
    ...defaults,
    surah: 24,
    ayah: 9,
    to: 13,
    mode: 'page',
    theme: 'sage',
  });
  expect(restored).toEqual({
    ...defaults,
    surah: 24,
    ayah: 9,
    to: 13,
    theme: 'sage',
  });
  expect(restored).not.toHaveProperty('mode');
});

// Offline conversion only: preserve every downloaded verse character verbatim.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
const raw = readFileSync(
  new URL('../data/quran-uthmani.txt', import.meta.url),
  'utf8',
);
const lines = raw.split(/\r?\n/);
const notice = lines.filter((line) => line.startsWith('#')).join('\n');
const groups = Array.from({ length: 114 }, () => []);
for (const line of lines) {
  if (!line || line.startsWith('#')) continue;
  const match = /^(\d+)\|(\d+)\|(.+)$/.exec(line);
  if (!match) throw new Error('Invalid source line');
  const [, s, a, text] = match;
  const group = groups[Number(s) - 1];
  if (!group || Number(a) !== group.length + 1)
    throw new Error('Invalid verse order');
  group.push(text);
}
if (groups.some((group) => !group.length) || groups.flat().length !== 6236)
  throw new Error('Incomplete Quran');
const directory = new URL('../src/data/surahs/', import.meta.url);
mkdirSync(directory, { recursive: true });
groups.forEach((verses, index) =>
  writeFileSync(
    new URL(`${index + 1}.json`, directory),
    JSON.stringify({ notice, verses }) + '\n',
  ),
);
writeFileSync(
  new URL('../data/SHA256', import.meta.url),
  createHash('sha256').update(raw).digest('hex') + '  quran-uthmani.txt\n',
);

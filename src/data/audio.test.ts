import { describe, expect, it } from 'vitest';
import { audioMirrors, ayahAudioUrl, findReciter, reciters } from './audio';

describe('addresses for one ayah of recitation', () => {
  it('names the recording after its own host, which keys the cache', () => {
    expect(ayahAudioUrl(2, 27, 'husary')).toBe(
      'https://everyayah.com/data/Husary_64kbps/002027.mp3',
    );
  });

  it('offers a mirror of the same folder to fall through to', () => {
    expect(audioMirrors(ayahAudioUrl(2, 27, 'husary'))).toEqual([
      'https://mirrors.quranicaudio.com/everyayah/Husary_64kbps/002027.mp3',
    ]);
  });

  /* The mirror does not carry these two at the bitrate everyayah does, so
     they fall through to a higher one: the same reading, same timings. */
  it('reaches for the cut the mirror actually carries', () => {
    expect(audioMirrors(ayahAudioUrl(2, 27, 'sudais'))).toEqual([
      'https://mirrors.quranicaudio.com/everyayah/Abdurrahmaan_As-Sudais_192kbps/002027.mp3',
    ]);
    expect(audioMirrors(ayahAudioUrl(114, 6, 'shuraim'))).toEqual([
      'https://mirrors.quranicaudio.com/everyayah/Saood_ash-Shuraym_128kbps/114006.mp3',
    ]);
  });

  it('gives every reciter somewhere else to go', () => {
    for (const reciter of reciters)
      expect(audioMirrors(ayahAudioUrl(1, 1, reciter.id))).toHaveLength(1);
  });

  /* A caller holding a URL from anywhere else must behave exactly as it did
     before there were mirrors, rather than inventing a host for it. */
  it('offers nothing for a URL it did not mint', () => {
    expect(audioMirrors('blob:something')).toEqual([]);
    expect(
      audioMirrors('https://everyayah.com/data/Made_Up/002027.mp3'),
    ).toEqual([]);
    expect(
      audioMirrors('https://elsewhere.example/data/Husary_64kbps/002027.mp3'),
    ).toEqual([]);
  });

  it('falls back to a known reciter rather than minting a broken folder', () => {
    expect(ayahAudioUrl(1, 1, 'nobody')).toBe(
      ayahAudioUrl(1, 1, findReciter('nobody').id),
    );
  });
});

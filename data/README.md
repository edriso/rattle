# Quran text provenance

- Source: Tanzil Project, **Uthmani, version 1.1**.
- Official download: https://tanzil.net/pub/download/index.php?quranType=uthmani&outType=txt-2&marks=true&sajdah=true&rub=true&tatweel=true&agree=true
- Downloaded: 2026-09-06.
- Pinned original: `quran-uthmani.txt`; checksum: `SHA256`.
- License: Creative Commons Attribution 3.0, with Tanzil's requirement to preserve the text verbatim. The complete copyright and terms are embedded in the original file and each generated surah file. Official terms: https://tanzil.net/docs/Text_License
- Visible source attribution links to https://tanzil.net in app settings.

Run `node scripts/prepare-quran.mjs` from the repository root to regenerate the per-surah assets. The converter splits only the surah/ayah delimiters: no Unicode normalization, correction, diacritic removal, or other verse-text transformations are performed. Displayed verse numbers are separate UI elements.

For future updates, download from Tanzil's official source, review its release notes at https://tanzil.net/updates/, inspect the source diff, regenerate assets and run tests. Do not silently replace the pinned source during installs or builds.

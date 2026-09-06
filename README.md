# رِتِّل

Arabic, RTL, mobile-first Quran memorization app. React 19, TypeScript, Vite, TanStack Router, Base UI/Shadcn, and semantic OKLCH themes.

## Run

```sh
npm install
npm run dev
npm run build
npm run preview
```

## Phase one

- One TanStack route at `/`, Arabic route metadata and font links in the root route.
- All 114 Surah names and verse counts, Arabic search that ignores vowel marks and normalizes hamza.
- Al-Fatihah preview text. Other verses, reciter audio and Mushaf images are explicitly marked as unavailable placeholders. No Quran API requests are made yet.
- Four accent themes, 1–5 verses per view, text/page mode, reciter selection, hide/reveal and bounded navigation.
- Versioned, validated device-local preferences loaded after mount. Nothing is uploaded.
- Microphone recording, live analyser waveform, playback and deletion. Recording blobs exist in memory only and are released when changing position or leaving the page. A secure context and browser microphone permission are required.
- Keyboard-operable sheets and selectors, reduced motion, focus indicators and RTL layouts.

## Phase two integration

`src/data/quran.ts` contains the local catalogue, preference validation and provider boundary. Replace preview provider methods with the supplied endpoints, add cancellable requests and caching, then wire reciter playback/repeat and page images in `AyahView.tsx`. Never substitute a different verse for missing content. The selected reciter IDs are provisional and should be mapped to the supplied catalogue.

Fonts are loaded from Google Fonts; recordings never leave the device. A compatible browser can optionally expose the `start_memorization` WebMCP tool. No compatible validation browser was available during implementation.

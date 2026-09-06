# رَتِّلِ

[Open the app](https://edriso.github.io/rattil/) · [Deployment workflow](https://github.com/edriso/rattil/actions/workflows/pages.yml)

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
- Four accent colors and persistent light/dark/system appearance, 1–5 verses per view, text/page mode, reciter selection, hide/reveal and bounded navigation.
- Minimal viewport-height layout with concise Modern Standard Arabic. Long passages, enlarged text and small landscape screens can scroll without clipping controls.
- Versioned, validated device-local preferences loaded after mount. Nothing is uploaded.
- Microphone recording, live analyser waveform, playback and deletion. Recording blobs exist in memory only and are released when changing position or leaving the page. A secure context and browser microphone permission are required.
- Keyboard-operable sheets and selectors, reduced motion, focus indicators and RTL layouts.

## Phase two integration

`src/data/quran.ts` contains the local catalogue, preference validation and provider boundary. Replace preview provider methods with the supplied endpoints, add cancellable requests and caching, then wire page images in `AyahView.tsx`. The reciter play/pause and repeat controls already use `useAyahAudio` when the provider returns an audio URL (the first ayah of the displayed group). Never substitute a different verse for missing content. The selected reciter IDs are provisional and should be mapped to the supplied catalogue.

Fonts are loaded from Google Fonts; recordings never leave the device. A compatible browser can optionally expose the `start_memorization` WebMCP tool. No compatible validation browser was available during implementation.

## GitHub Pages

Pushes to `main` and manual runs of `.github/workflows/pages.yml` run tests, lint and the production build before publishing to GitHub Pages. The repository Pages source must be **GitHub Actions**. No deployment secrets are required.

The workflow reads the Pages base path and passes it as `VITE_BASE_PATH`; Vite assets, the router and the home link use the same base. Local development and other hosting keep `/` by default. To reproduce the project-site build locally:

```sh
VITE_BASE_PATH=/rattil/ npm run build
VITE_BASE_PATH=/rattil/ npm run preview
```

## Navigation

The app uses Arabic reading direction: next is on the left, previous is on the right. Play/pause icons retain the standard media direction.

- **Left Arrow / Enter:** next displayed ayah group.
- **Right Arrow:** previous group.
- **Space:** play/pause the current ayah. Audio remains unavailable until the phase-two provider supplies URLs.
- **Swipe right over the verse:** next group; **swipe left:** previous group.

Shortcuts pause while either sheet is open and ignore typing, text selection controls, modified keys and held-key repeats. Space/Enter keep native behavior on a focused button or link. Swipes require a deliberate horizontal gesture and ignore vertical scrolling, small drags, multi-touch, selected text and browser edges. Neither keyboard nor swipe navigation leaves the current surah. Shortcut help is available in Settings.

Verified with automated interaction/media tests and native-browser keyboard checks plus touch emulation at phone widths (including 320 × 568); emulation does not replace testing on physical iOS/Android devices.

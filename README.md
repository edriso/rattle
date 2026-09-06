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

## Features

- One TanStack route at `/`, Arabic route metadata and font links in the root route.
- All 114 Surah names and verse counts, Arabic search that ignores vowel marks and normalizes hamza.
- Complete Tanzil Uthmani Quran text (114 surahs, 6,236 ayahs), served from local, versioned assets. Reciter audio remains a clearly marked placeholder pending the supplied API.
- Four accent colors and persistent light/dark/system appearance, 1–5 verses per view, reciter selection, hide/reveal and bounded navigation.
- Minimal viewport-height layout with concise Modern Standard Arabic. Long passages, enlarged text and small landscape screens can scroll without clipping controls.
- Startup keeps a theme-aware Arabic shell visible, restores the saved appearance before first paint, and waits for the UI font set (with a bounded fallback) before mounting the app to prevent a dark flash or font swap.
- Versioned, validated device-local preferences loaded after mount. Nothing is uploaded.
- Microphone recording, live analyser waveform, playback and deletion. Recording blobs exist in memory only and are released when changing position, re-recording, deleting, or leaving the page (including back/forward caching). Recording and reciter playback cannot overlap. A secure context and browser microphone permission are required.
- Keyboard-operable sheets and selectors, reduced motion, focus indicators and RTL layouts.

## Reciter API integration

`src/data/audio.ts` is the only future API boundary: reciter IDs/names and per-ayah audio URLs. Replace its provisional catalogue and URL provider with the supplied endpoints. No API endpoint has been supplied yet, so no live reciter requests are made. Text is independent of this API and must remain local. The play/pause and repeat controls already consume audio URLs through `useAyahAudio` (the first ayah of the displayed group). When integrating asynchronous audio metadata, deduplicate/cache requests and discard stale responses when the selected reciter or ayah changes.

## Quran source and performance

Text: [Tanzil Project, Uthmani version 1.1](https://tanzil.net/download/), downloaded directly from its official endpoint. See [source provenance and license](data/README.md). Every verse is preserved verbatim, including diacritics and pause signs. Automated checks compare all generated verses with the pinned source and its SHA-256, and validate all surah counts.

Al-Fatihah is available immediately. Other surahs are loaded on demand as separate hashed assets, with deduplicated in-flight requests and a session cache. Navigating within a loaded surah or changing reciter, ayah count, accent or appearance does not refetch text. Failed loads offer retry; late responses cannot replace the newly selected surah. Only the selected 1–5 ayahs are rendered. Media loads on demand; settings are lazy-loaded. Number formatting reuses one formatter and keyboard listeners remain stable across option changes.

Older saved preferences are validated and migrated automatically; obsolete fields are dropped without losing progress.

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
- **Shift + Enter:** start, stop, or re-record your voice.
- **Shift + Space:** play/pause your recording.
- **Swipe right over the verse:** next group; **swipe left:** previous group.

Shortcuts use standard `KeyboardEvent.key` values and non-letter keys for Arabic/Latin layouts on macOS, Windows and Linux. Return/Enter and either Shift key work equivalently; Ctrl, Command, Alt/Option, composition and held-key events remain untouched. Custom OS shortcuts and assistive technology may intercept keys; all actions also have visible controls.

Shortcuts pause while either sheet is open and ignore typing, text selection controls, unassigned modified keys and held-key repeats. Space/Enter keep native behavior on a focused button or link. Swipes require a deliberate horizontal gesture and ignore vertical scrolling, small drags, multi-touch, selected text and browser edges. Neither keyboard nor swipe navigation leaves the current surah. Collapsible shortcut help appears at the bottom of Settings on desktop devices with a mouse/trackpad. Settings are ordered: reciter, ayah count, appearance, accent colors.

Verified with automated interaction/media tests and native-browser keyboard checks plus touch emulation at phone widths (including 320 × 568), real microphone recording, playback, re-recording and swipe cleanup; emulation does not replace testing on physical iOS/Android devices.

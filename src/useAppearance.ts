import { useEffect } from 'react';
import type { Preferences } from './data/quran';

export function useAppearance(
  appearance: Preferences['appearance'],
  ready: boolean,
) {
  useEffect(() => {
    if (!ready) return;
    const media =
      typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-color-scheme: dark)')
        : null;
    const apply = () => {
      document.documentElement.dataset.appearance =
        appearance === 'system'
          ? media?.matches
            ? 'dark'
            : 'light'
          : appearance;
      const background = getComputedStyle(document.documentElement)
        .getPropertyValue('--background')
        .trim();
      if (background)
        document
          .querySelector('meta[name="theme-color"]')
          ?.setAttribute('content', background);
    };
    apply();
    if (appearance !== 'system') return;
    media?.addEventListener('change', apply);
    return () => media?.removeEventListener('change', apply);
  }, [appearance, ready]);
}

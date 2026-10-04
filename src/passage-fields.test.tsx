// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { App } from './App';

/* The start screen's passage fields are a chunk of their own, so the first
   paint does not wait on the combobox. A chunk can fail to arrive, and
   through `lazy` with nothing to catch it that took the whole screen down
   with it. This file holds the failure on its own, because the screen keeps
   a loaded module for the life of the page. */
vi.mock('./components/PassageFields', () => {
  throw new Error('chunk did not arrive');
});

afterEach(() => {
  cleanup();
  localStorage.clear();
});

it('keeps the start screen when the passage fields fail to load', async () => {
  localStorage.setItem(
    'rattle:v1',
    JSON.stringify({ screen: 'home', surah: 2, ayah: 255, to: 257 }),
  );
  render(<App />);
  const retry = await screen.findByRole('button', { name: 'إعادة المحاولة' });
  // The rest of the screen is there, and the boxes still say where you are.
  expect(screen.getByText('البقرة')).toBeTruthy();
  expect(screen.getByText('٢٥٥')).toBeTruthy();
  expect(
    screen.getByRole('button', { name: 'ابدأ جلسة التلقين' }),
  ).toBeTruthy();
  /* The way on is a reload rather than another `import()`, which a browser
     may answer from its memory of the failure, and which after a deploy asks
     for a name that is gone. jsdom has no reload, so the press is all that
     can be checked here. */
  expect(retry.tagName).toBe('BUTTON');
});

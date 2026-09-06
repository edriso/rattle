// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { QuranVerses } from './components/QuranVerses';
import * as text from './data/text';
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it('ignores a late response for the previous surah', async () => {
  vi.spyOn(text, 'cachedSurah').mockReturnValue(undefined);
  let first!: (value: string[]) => void;
  let second!: (value: string[]) => void;
  vi.spyOn(text, 'loadSurah').mockImplementation(
    (id) =>
      new Promise((resolve) => {
        if (id === 2) first = resolve;
        else second = resolve;
      }),
  );
  const view = render(<QuranVerses surah={2} first={1} last={1} />);
  view.rerender(<QuranVerses surah={3} first={1} last={1} />);
  await act(async () => {
    second(['current fixture']);
  });
  await act(async () => {
    first(['stale fixture']);
  });
  expect(screen.getByText('current fixture')).toBeTruthy();
  expect(screen.queryByText('stale fixture')).toBeNull();
});
it('offers retry after failure and does not reload when the ayah range changes', async () => {
  vi.spyOn(text, 'cachedSurah').mockReturnValue(undefined);
  const loader = vi
    .spyOn(text, 'loadSurah')
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValue(['first fixture', 'second fixture']);
  const view = render(<QuranVerses surah={2} first={1} last={1} />);
  fireEvent.click(
    await screen.findByRole('button', { name: 'إعادة المحاولة' }),
  );
  expect(await screen.findByText('first fixture')).toBeTruthy();
  view.rerender(<QuranVerses surah={2} first={2} last={2} />);
  expect(screen.getByText('second fixture')).toBeTruthy();
  expect(loader).toHaveBeenCalledTimes(2);
});

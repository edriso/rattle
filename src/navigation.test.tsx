// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  renderHook,
} from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { App } from './App';
import { defaults } from './data/quran';
import { usePracticeNavigation } from './usePracticeNavigation';
import { useRangeAudio } from './useRangeAudio';
import { audioMirrors, ayahAudioUrl } from './data/audio';
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
beforeEach(() => {
  localStorage.clear();
  window.getSelection()?.removeAllRanges();
  localStorage.setItem(
    'rattle:v1',
    JSON.stringify({ ...defaults, screen: 'practice', ayah: 2 }),
  );
});
const position = () => JSON.parse(localStorage.getItem('rattle:v1')!).ayah;
const touch = (x: number, y: number, id = 1) => ({
  clientX: x,
  clientY: y,
  identifier: id,
});
function swipe(dx: number, dy = 0) {
  const verse = screen.getByRole('region', { name: /سورة الفاتحة، الآية/ });
  fireEvent.touchStart(verse, { touches: [touch(200, 200)] });
  fireEvent.touchMove(verse, { touches: [touch(200 + dx, 200 + dy)] });
  fireEvent.touchEnd(verse, {
    touches: [],
    changedTouches: [touch(200 + dx, 200 + dy)],
  });
}
it('uses RTL arrows and Enter and preserves a useful focus target', () => {
  render(<App />);
  fireEvent.keyDown(document.body, { key: 'ArrowLeft' });
  expect(position()).toBe(3);
  expect(document.activeElement?.id).toBe('current-verse');
  fireEvent.keyDown(document.activeElement!, { key: 'ArrowRight' });
  expect(position()).toBe(2);
  fireEvent.keyDown(document.activeElement!, { key: 'Enter' });
  expect(position()).toBe(3);
});
it('does not repeat held keys or intercept modified keys, input, or editable text', () => {
  render(<App />);
  for (const args of [
    { key: 'Enter', repeat: true },
    { key: 'ArrowLeft', altKey: true },
    { key: 'ArrowLeft', isComposing: true },
  ])
    fireEvent.keyDown(document.body, args);
  expect(position()).toBe(2);
  const field = document.createElement('input');
  document.body.append(field);
  fireEvent.keyDown(field, { key: 'ArrowLeft' });
  field.remove();
  const edit = document.createElement('div');
  edit.contentEditable = 'true';
  edit.setAttribute('contenteditable', 'true');
  document.body.append(edit);
  fireEvent.keyDown(edit, { key: 'Enter' });
  edit.remove();
  expect(position()).toBe(2);
});
it('keeps Space and Enter native on focused buttons', async () => {
  render(<App />);
  const reveal = screen.getByRole('button', { name: 'إخفاء الآية' });
  reveal.focus();
  await userEvent.keyboard('[Space]');
  expect(screen.getByText('اقرأ من حفظك')).toBeTruthy();
  expect(position()).toBe(2);
  expect(screen.queryByText('التلاوة غير متاحة حاليًا.')).toBeNull();
});
it('claims Space and the vertical arrows rather than letting them scroll', async () => {
  render(<App />);
  for (const key of [' ', 'ArrowUp', 'ArrowDown']) {
    const event = new KeyboardEvent('keydown', {
      key,
      bubbles: true,
      cancelable: true,
    });
    await act(async () => {
      document.body.dispatchEvent(event);
    });
    expect(event.defaultPrevented).toBe(true);
  }
  expect(position()).toBe(2);
});
it('leaves the vertical arrows alone where there is nothing to repeat', () => {
  renderHook(() =>
    usePracticeNavigation({
      enabled: true,
      next: vi.fn(),
      previous: vi.fn(),
      toggleAudio: vi.fn(),
    }),
  );
  const event = new KeyboardEvent('keydown', {
    key: 'ArrowDown',
    bubbles: true,
    cancelable: true,
  });
  act(() => {
    document.body.dispatchEvent(event);
  });
  expect(event.defaultPrevented).toBe(false);
});
it('pauses shortcuts while settings or picker are opening', () => {
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: 'الإعدادات' }));
  fireEvent.keyDown(document.body, { key: 'ArrowLeft' });
  fireEvent.keyDown(document.body, { key: 'Enter' });
  expect(position()).toBe(2);
});
it('swipes right to next and left to previous, without escaping the surah', () => {
  render(<App />);
  swipe(110);
  expect(position()).toBe(3);
  swipe(-110);
  expect(position()).toBe(2);
  swipe(-110);
  expect(position()).toBe(1);
  swipe(-110);
  expect(position()).toBe(1);
});
it('ignores vertical, diagonal, and short drags and cancelled/multitouch gestures', () => {
  render(<App />);
  swipe(10);
  swipe(15, 110);
  swipe(65, 60);
  const verse = screen.getByRole('region', { name: /سورة الفاتحة، الآية/ });
  fireEvent.touchStart(verse, {
    touches: [touch(100, 200), touch(200, 200, 2)],
  });
  fireEvent.touchEnd(verse, { touches: [], changedTouches: [touch(300, 200)] });
  fireEvent.touchStart(verse, { touches: [touch(100, 200)] });
  fireEvent.touchCancel(verse);
  fireEvent.touchEnd(verse, { touches: [], changedTouches: [touch(300, 200)] });
  expect(position()).toBe(2);
});
it('preserves browser edge gestures and verse text selection', () => {
  render(<App />);
  const verse = screen.getByRole('region', { name: /سورة الفاتحة، الآية/ });
  fireEvent.touchStart(verse, { touches: [touch(5, 200)] });
  fireEvent.touchEnd(verse, { touches: [], changedTouches: [touch(200, 200)] });
  const range = document.createRange();
  range.selectNodeContents(verse);
  window.getSelection()?.addRange(range);
  swipe(110);
  expect(position()).toBe(2);
});
it('uses the visible group boundary for keyboard and swipe navigation', () => {
  localStorage.setItem(
    'rattle:v1',
    JSON.stringify({ ...defaults, screen: 'practice', ayah: 1, perView: 5 }),
  );
  render(<App />);
  fireEvent.keyDown(document.body, { key: 'Enter' });
  expect(position()).toBe(6);
  swipe(100);
  fireEvent.keyDown(document.body, { key: 'Enter' });
  expect(position()).toBe(6);
  fireEvent.keyDown(document.body, { key: 'ArrowRight' });
  expect(position()).toBe(1);
});

class FakeAudio {
  paused = true;
  src = '';
  preload = '';
  onplaying: (() => void) | null = null;
  onpause: (() => void) | null = null;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  play = vi.fn(async () => {
    this.paused = false;
    this.onplaying?.();
  });
  pause = vi.fn(() => {
    this.paused = true;
    this.onpause?.();
  });
  removeAttribute = vi.fn();
  load = vi.fn();
}
it('plays, pauses, and cleans up actual audio', async () => {
  const player = new FakeAudio();
  vi.stubGlobal(
    'Audio',
    class {
      constructor() {
        return player;
      }
    },
  );
  const view = renderHook(() => useRangeAudio(['/one.mp3'], false));
  await act(() => view.result.current.toggle());
  expect(view.result.current.playing).toBe(true);
  await act(() => view.result.current.toggle());
  expect(view.result.current.playing).toBe(false);
  view.unmount();
  expect(player.pause).toHaveBeenCalled();
  expect(player.removeAttribute).toHaveBeenCalledWith('src');
});
it('walks a run of ayat and loops it only when asked', async () => {
  const player = new FakeAudio();
  vi.stubGlobal(
    'Audio',
    class {
      constructor() {
        return player;
      }
    },
  );
  const view = renderHook(
    ({ repeat }) => useRangeAudio(['/one.mp3', '/two.mp3'], repeat),
    { initialProps: { repeat: false } },
  );
  await act(() => view.result.current.toggle());
  await act(async () => player.onended?.());
  expect(player.src).toBe('/two.mp3');
  await act(async () => player.onended?.());
  expect(view.result.current.playing).toBe(false);
  // The run rewinds, so play starts it over instead of resuming on the last.
  expect(player.src).toBe('/one.mp3');
  view.rerender({ repeat: true });
  await act(() => view.result.current.toggle());
  await act(async () => player.onended?.());
  await act(async () => player.onended?.());
  expect(player.src).toBe('/one.mp3');
  expect(view.result.current.playing).toBe(true);
});
it('handles rejected playback without reporting a playing state', async () => {
  const player = new FakeAudio();
  player.play.mockRejectedValue(new Error('blocked'));
  vi.stubGlobal(
    'Audio',
    class {
      constructor() {
        return player;
      }
    },
  );
  const { result } = renderHook(() => useRangeAudio(['/fixture.mp3'], false));
  await act(() => result.current.toggle());
  expect(result.current.playing).toBe(false);
  expect(result.current.notice).toContain('تعذّر');
});
it('cancels pending playback when Space is pressed a second time', async () => {
  const player = new FakeAudio();
  let resolve!: () => void;
  player.play.mockImplementation(
    () =>
      new Promise<void>((r) => {
        resolve = r;
      }),
  );
  vi.stubGlobal(
    'Audio',
    class {
      constructor() {
        return player;
      }
    },
  );
  const { result } = renderHook(() => useRangeAudio(['/fixture.mp3'], false));
  act(() => {
    void result.current.toggle();
  });
  await act(() => result.current.toggle());
  expect(player.pause).toHaveBeenCalled();
  await act(async () => resolve());
  expect(result.current.playing).toBe(false);
});

const fakeAudio = () => {
  const player = new FakeAudio();
  vi.stubGlobal(
    'Audio',
    class {
      constructor() {
        return player;
      }
    },
  );
  return player;
};

/* Moving on used to silence the recitation, so a reader listening straight
   through a passage had to press play again at every ayah. */
it('connects Space and the play button to the same audio and carries it across a move', async () => {
  fakeAudio();
  render(<App />);
  await act(async () => {
    fireEvent.keyDown(document.body, { key: ' ' });
  });
  expect(
    screen.getByRole('button', { name: 'إيقاف التلاوة مؤقّتًا' }),
  ).toBeTruthy();
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'إيقاف التلاوة مؤقّتًا' }));
  });
  expect(screen.getByRole('button', { name: 'تشغيل التلاوة' })).toBeTruthy();
  // A move while it is paused leaves it paused: nothing starts on its own.
  await act(async () => {
    fireEvent.keyDown(document.body, { key: 'ArrowLeft' });
  });
  expect(screen.getByRole('button', { name: 'تشغيل التلاوة' })).toBeTruthy();
  await act(async () => {
    fireEvent.keyDown(document.body, { key: ' ' });
  });
  await act(async () => {
    fireEvent.keyDown(document.body, { key: 'ArrowLeft' });
  });
  expect(position()).toBe(4);
  expect(
    screen.getByRole('button', { name: 'إيقاف التلاوة مؤقّتًا' }),
  ).toBeTruthy();
});

/* A pause from the lock screen, a headset button or the OS media controls
   never passes through this app, so what carries a run across a move has to be
   whether the element was sounding, not whether the app last asked it to. */
it('does not restart a recitation the phone itself paused', async () => {
  const player = fakeAudio();
  render(<App />);
  await act(async () => {
    fireEvent.keyDown(document.body, { key: ' ' });
  });
  expect(
    screen.getByRole('button', { name: 'إيقاف التلاوة مؤقّتًا' }),
  ).toBeTruthy();
  // Not through `pause()`: the element is stopped from outside the page.
  await act(async () => {
    player.pause();
  });
  expect(screen.getByRole('button', { name: 'تشغيل التلاوة' })).toBeTruthy();
  await act(async () => {
    fireEvent.keyDown(document.body, { key: 'ArrowLeft' });
  });
  expect(position()).toBe(3);
  expect(screen.getByRole('button', { name: 'تشغيل التلاوة' })).toBeTruthy();
});

it('stops the recitation on a move for a reader who has asked it to', async () => {
  localStorage.setItem(
    'rattle:v1',
    JSON.stringify({
      ...defaults,
      screen: 'practice',
      ayah: 2,
      keepPlaying: false,
    }),
  );
  fakeAudio();
  render(<App />);
  await act(async () => {
    fireEvent.keyDown(document.body, { key: ' ' });
  });
  await act(async () => {
    fireEvent.keyDown(document.body, { key: 'ArrowLeft' });
  });
  expect(position()).toBe(3);
  expect(screen.getByRole('button', { name: 'تشغيل التلاوة' })).toBeTruthy();
});

/* A tab or a tap leaves focus on a button, and that button owns Space and
   Enter from then on. The arrows are the twins that keep the drill reachable. */
it('plays and repeats from the arrows while a button holds the focus', async () => {
  const player = new FakeAudio();
  vi.stubGlobal(
    'Audio',
    class {
      constructor() {
        return player;
      }
    },
  );
  render(<App />);
  const reveal = screen.getByRole('button', { name: 'إخفاء الآية' });
  reveal.focus();
  await act(async () => {
    fireEvent.keyDown(reveal, { key: 'ArrowUp' });
  });
  expect(
    screen.getByRole('button', { name: 'إيقاف التلاوة مؤقّتًا' }),
  ).toBeTruthy();
  await act(async () => {
    fireEvent.keyDown(reveal, { key: 'ArrowUp' });
  });
  expect(screen.getByRole('button', { name: 'تشغيل التلاوة' })).toBeTruthy();
  fireEvent.keyDown(reveal, { key: 'ArrowDown' });
  expect(
    screen
      .getByRole('button', { name: 'تكرار التلاوة' })
      .getAttribute('aria-pressed'),
  ).toBe('true');
  // The ayah stayed put, and the focused button was never activated.
  expect(position()).toBe(2);
  expect(screen.queryByText('اقرأ من حفظك')).toBeNull();
});
it('preserves Command, Control, Option/Alt and Shift-arrow OS shortcuts', () => {
  render(<App />);
  for (const modifier of ['metaKey', 'ctrlKey', 'altKey']) {
    for (const key of [
      'ArrowLeft',
      'ArrowRight',
      'ArrowUp',
      'ArrowDown',
      'Enter',
      ' ',
    ]) {
      const event = new KeyboardEvent('keydown', {
        key,
        [modifier]: true,
        bubbles: true,
        cancelable: true,
      });
      act(() => {
        document.body.dispatchEvent(event);
      });
      expect(event.defaultPrevented).toBe(false);
    }
  }
  fireEvent.keyDown(document.body, { key: 'ArrowLeft', shiftKey: true });
  expect(position()).toBe(2);
});
it('uses the latest ayah count without reinstalling the global key listener', () => {
  const listener = vi.spyOn(document, 'addEventListener');
  const { rerender } = renderHook(
    ({ next }) =>
      usePracticeNavigation({
        enabled: true,
        next,
        previous: vi.fn(),
        toggleAudio: vi.fn(),
      }),
    { initialProps: { next: vi.fn() } },
  );
  const before = listener.mock.calls.filter(
    ([type]) => type === 'keydown',
  ).length;
  const next = vi.fn();
  rerender({ next });
  fireEvent.keyDown(document.body, { key: 'Enter', code: 'NumpadEnter' });
  expect(next).toHaveBeenCalledOnce();
  expect(
    listener.mock.calls.filter(([type]) => type === 'keydown'),
  ).toHaveLength(before);
});

/* A recording's own host being unreachable used to be the end of it, even
   though the same recitation is served from a second address. */
it('moves an unreachable ayah to its mirror before giving up on it', async () => {
  const player = new FakeAudio();
  vi.stubGlobal(
    'Audio',
    class {
      constructor() {
        return player;
      }
    },
  );
  const url = ayahAudioUrl(2, 27, 'husary');
  const view = renderHook(() => useRangeAudio([url], false));
  await act(() => view.result.current.toggle());
  await act(async () => player.onerror?.());
  expect(player.src).toBe(audioMirrors(url)[0]);
  // Recovered, so the learner is not told anything went wrong.
  expect(view.result.current.notice).toBe('');
  expect(view.result.current.playing).toBe(true);
  // Nowhere left to reach, and now it is worth saying.
  await act(async () => player.onerror?.());
  expect(view.result.current.playing).toBe(false);
  expect(view.result.current.notice).not.toBe('');
});

/* An error can land after the learner has already pressed pause. Moving to
   the mirror is right; starting it sounding is not. */
it('moves to a mirror without sounding a run that was paused', async () => {
  const player = new FakeAudio();
  vi.stubGlobal(
    'Audio',
    class {
      constructor() {
        return player;
      }
    },
  );
  const url = ayahAudioUrl(2, 27, 'husary');
  const view = renderHook(() => useRangeAudio([url], false));
  await act(() => view.result.current.toggle());
  act(() => view.result.current.pause());
  player.play.mockClear();
  await act(async () => player.onerror?.());
  expect(player.src).toBe(audioMirrors(url)[0]);
  expect(player.play).not.toHaveBeenCalled();
  expect(view.result.current.playing).toBe(false);
});

const fakePlayer = () => {
  const player = new FakeAudio();
  vi.stubGlobal(
    'Audio',
    class {
      constructor() {
        return player;
      }
    },
  );
  return player;
};

/* Asking the dead host again at every ayah bought nothing but another
   failure, once per ayah and once more on every pass of a loop. */
it('keeps the mirror it found for the rest of the run', async () => {
  const player = fakePlayer();
  const urls = [ayahAudioUrl(2, 27, 'husary'), ayahAudioUrl(2, 28, 'husary')];
  const view = renderHook(() => useRangeAudio(urls, false));
  await act(() => view.result.current.toggle());
  await act(async () => player.onerror?.());
  expect(player.src).toBe(audioMirrors(urls[0])[0]);
  await act(async () => player.onended?.());
  expect(player.src).toBe(audioMirrors(urls[1])[0]);
});

/* An error can land after the learner has already stopped listening. Telling
   them the recitation failed is then just noise about something they ended. */
it('says nothing about a run the learner stopped before it failed', async () => {
  const player = fakePlayer();
  const url = ayahAudioUrl(2, 27, 'husary');
  const view = renderHook(() => useRangeAudio([url], false));
  await act(() => view.result.current.toggle());
  await act(async () => player.onerror?.());
  act(() => view.result.current.pause());
  await act(async () => player.onerror?.());
  expect(view.result.current.notice).toBe('');
  expect(view.result.current.playing).toBe(false);
});

it('still says so when the learner is waiting and nowhere answers', async () => {
  const player = fakePlayer();
  const url = ayahAudioUrl(2, 27, 'husary');
  const view = renderHook(() => useRangeAudio([url], false));
  await act(() => view.result.current.toggle());
  await act(async () => player.onerror?.());
  await act(async () => player.onerror?.());
  expect(view.result.current.notice).not.toBe('');
  expect(view.result.current.playing).toBe(false);
});

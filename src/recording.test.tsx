// @vitest-environment jsdom
/* Assertions inspect mocked methods without invoking them unbound. */
/* eslint-disable typescript/unbound-method */
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { App } from './App';
import { defaults } from './data/quran';

let recorder: FakeRecorder;
const stopTrack = vi.fn();
class FakeRecorder {
  state = 'inactive';
  mimeType = 'audio/webm';
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor() {
    // Expose the browser-created fake so tests can deliver asynchronous events.
    // eslint-disable-next-line typescript/no-this-alias
    recorder = this;
  }
  start() {
    this.state = 'recording';
  }
  stop = vi.fn(() => {
    this.state = 'inactive';
  });
  finish() {
    this.ondataavailable?.({ data: new Blob(['private voice']) });
    this.onstop?.();
  }
}
const key = (key: string) =>
  fireEvent.keyDown(document.body, { key, shiftKey: true });
async function record() {
  key('Enter');
  await screen.findByRole('button', { name: 'إنهاء التسجيل' });
  key('Enter');
  act(() => recorder.finish());
  await screen.findByRole('button', { name: 'إعادة التسجيل' });
}
beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(
    'rattle:v1',
    JSON.stringify({ ...defaults, screen: 'practice' }),
  );
  stopTrack.mockClear();
  vi.stubGlobal('MediaRecorder', FakeRecorder);
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getUserMedia: vi
        .fn()
        .mockResolvedValue({ getTracks: () => [{ stop: stopTrack }] }),
    },
  });
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: vi.fn().mockReturnValue('blob:private'),
  });
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    value: vi.fn(),
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it('records with Shift+Enter, ignores repeated stop, and plays with Shift+Space', async () => {
  render(<App />);
  key('Enter');
  key('Enter');
  await screen.findByRole('button', { name: 'إنهاء التسجيل' });
  expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledOnce();
  expect(
    screen
      .getByRole('button', { name: 'تشغيل التلاوة' })
      .getAttribute('aria-disabled'),
  ).toBe('true');
  key('Enter');
  key('Enter');
  expect(recorder.stop).toHaveBeenCalledOnce();
  act(() => recorder.finish());
  await screen.findByRole('button', { name: 'إعادة التسجيل' });
  await act(async () => {
    key(' ');
  });
  expect(HTMLMediaElement.prototype.play).toHaveBeenCalledOnce();
  expect(JSON.parse(localStorage.getItem('rattle:v1')!)).toEqual({
    ...defaults,
    screen: 'practice',
  });
});
it('revokes the old recording on re-record, then discards the new one on navigation', async () => {
  render(<App />);
  await record();
  key('Enter');
  await screen.findByRole('button', { name: 'إنهاء التسجيل' });
  expect(URL.revokeObjectURL).toHaveBeenCalledOnce();
  expect(screen.queryByRole('button', { name: 'تشغيل التسجيل' })).toBeNull();
  key('Enter');
  act(() => recorder.finish());
  fireEvent.keyDown(document.body, { key: 'ArrowLeft' });
  expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2);
  expect(screen.getByRole('button', { name: 'تسجيل صوتك' })).toBeTruthy();
});
it('discards recordings on pagehide, including back-forward cache navigation', async () => {
  render(<App />);
  await record();
  fireEvent(window, new Event('pagehide'));
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:private');
  expect(screen.queryByRole('button', { name: 'تشغيل التسجيل' })).toBeNull();
  expect(screen.getByRole('button', { name: 'تسجيل صوتك' })).toBeTruthy();
});
it('cleans up recording failures and allows retry without retaining partial audio', async () => {
  render(<App />);
  key('Enter');
  await screen.findByRole('button', { name: 'إنهاء التسجيل' });
  act(() => recorder.onerror?.());
  expect(stopTrack).toHaveBeenCalled();
  expect(URL.createObjectURL).not.toHaveBeenCalled();
  expect(await screen.findByRole('alert')).toBeTruthy();
  key('Enter');
  await screen.findByRole('button', { name: 'إنهاء التسجيل' });
});
it('cancels pending private playback before recording again', async () => {
  let resolve!: () => void;
  vi.mocked(HTMLMediaElement.prototype.play).mockImplementation(
    () =>
      new Promise<void>((done) => {
        resolve = done;
      }),
  );
  render(<App />);
  await record();
  key(' ');
  key('Enter');
  await screen.findByRole('button', { name: 'إنهاء التسجيل' });
  await act(async () => resolve());
  expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
  await waitFor(() =>
    expect(screen.queryByRole('button', { name: 'إيقاف مؤقّت' })).toBeNull(),
  );
});
/* Pressing this button is what makes it briefly unavailable, so `disabled`
   dropped the keyboard while the browser was still asking about the
   microphone: the learner came back to a permission dialog and a page with
   nothing focused. `phase` is what holds the second press off, not the
   attribute. */
it('keeps the keyboard on the record button while the microphone is asked for', async () => {
  let allow!: (stream: unknown) => void;
  const asking = vi.fn(
    () =>
      new Promise((resolve) => {
        allow = resolve;
      }),
  );
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: asking },
  });
  render(<App />);
  const button = await screen.findByRole('button', { name: 'تسجيل صوتك' });
  button.focus();
  fireEvent.click(button);
  const waiting = await screen.findByRole('button', {
    name: 'بانتظار الميكروفون…',
  });
  expect(waiting).toBe(button);
  expect(waiting.getAttribute('aria-disabled')).toBe('true');
  expect((waiting as HTMLButtonElement).disabled).toBe(false);
  expect(document.activeElement).toBe(waiting);
  fireEvent.click(waiting);
  expect(asking).toHaveBeenCalledOnce();
  await act(async () => {
    allow({ getTracks: () => [{ stop: stopTrack }] });
  });
  expect(await screen.findByRole('button', { name: 'إنهاء التسجيل' })).toBe(
    button,
  );
  expect(document.activeElement).toBe(button);
});

/* Recording starts from Shift+Enter, which can be pressed while the
   recitation button holds the focus. `disabled` on that button dropped the
   keyboard at exactly the moment the microphone dialog opened. */
it('keeps the keyboard on the recitation button when recording starts', async () => {
  render(<App />);
  const play = await screen.findByRole('button', { name: 'تشغيل التلاوة' });
  play.focus();
  key('Enter');
  await screen.findByRole('button', { name: 'إنهاء التسجيل' });
  expect(play.getAttribute('aria-disabled')).toBe('true');
  expect((play as HTMLButtonElement).disabled).toBe(false);
  expect(document.activeElement).toBe(play);
  // And the press it would have taken is refused rather than queued.
  fireEvent.click(play);
  expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
});

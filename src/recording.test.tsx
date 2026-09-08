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
    (screen.getByRole('button', { name: 'تشغيل التلاوة' }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
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

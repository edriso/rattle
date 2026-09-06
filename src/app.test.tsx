// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { App } from './App';
import userEvent from '@testing-library/user-event';
import { Recorder } from './components/Recorder';
import { defaults, normalize, restore, surahs } from './data/quran';
afterEach(cleanup);
beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});
describe('catalogue and persisted state', () => {
  it('has every surah and the complete verse count', () => {
    expect(surahs).toHaveLength(114);
    expect(surahs.reduce((n, s) => n + s.count, 0)).toBe(6236);
    expect(normalize('آل عِمْرَان')).toBe(normalize('ال عمران'));
  });
  it('rejects corrupt preferences and bounds valid numeric values', () => {
    expect(restore(null)).toEqual(defaults);
    expect(
      restore({
        surah: 114,
        ayah: 999,
        perView: 999,
        theme: 'invalid',
        reciter: 'invalid',
      }),
    ).toMatchObject({
      surah: 114,
      ayah: 6,
      perView: 5,
      theme: 'gold',
      reciter: defaults.reciter,
    });
    expect(restore({ surah: Infinity, ayah: NaN })).toMatchObject({
      surah: 1,
      ayah: 1,
    });
  });
  it('starts, hides actual verse text, navigates, and restores position', async () => {
    const view = render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'ابدأ الحفظ' }));
    expect(screen.getByText('بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ')).toBeTruthy();
    fireEvent.click(
      screen.getByRole('button', { name: 'إخفاء الآية لاختبار حفظك' }),
    );
    expect(screen.queryByText('بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'الآيات التالية' }));
    expect(screen.getByText('الْحَمْدُ لِلَّهِ رَبِّ الْعَالَمِينَ')).toBeTruthy();
    view.unmount();
    render(<App />);
    await waitFor(() =>
      expect(screen.getByText('الْحَمْدُ لِلَّهِ رَبِّ الْعَالَمِينَ')).toBeTruthy(),
    );
    expect(screen.queryByRole('button', { name: 'ابدأ الحفظ' })).toBeNull();
  });
  it('handles unavailable local storage', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    render(<App />);
    expect(
      await screen.findByText('تعذّر حفظ التقدّم على هذا المتصفح.'),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'ابدأ الحفظ' })).toBeTruthy();
  });
  it('does not pass the last verse', async () => {
    localStorage.setItem(
      'rattil:v1',
      JSON.stringify({ ...defaults, started: true, surah: 114, ayah: 6 }),
    );
    render(<App />);
    await waitFor(() =>
      expect(
        (
          screen.getByRole('button', {
            name: 'الآيات التالية',
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(true),
    );
  });
});
describe('private recording', () => {
  it('reports permission refusal and restores the record control', async () => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: vi
          .fn()
          .mockRejectedValue(new DOMException('denied', 'NotAllowedError')),
      },
    });
    vi.stubGlobal('MediaRecorder', class {});
    render(<Recorder position="1:1" />);
    fireEvent.click(screen.getByRole('button', { name: 'سمّع بصوتك' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(
      (screen.getByRole('button', { name: 'سمّع بصوتك' }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
  });
  it('stops a late microphone grant when the verse changes', async () => {
    let resolve!: (value: unknown) => void;
    const stop = vi.fn();
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: () =>
          new Promise((r) => {
            resolve = r;
          }),
      },
    });
    vi.stubGlobal('MediaRecorder', class {});
    const view = render(<Recorder position="1:1" />);
    fireEvent.click(screen.getByRole('button', { name: 'سمّع بصوتك' }));
    view.rerender(<Recorder position="1:2" />);
    resolve({ getTracks: () => [{ stop }] });
    await waitFor(() => expect(stop).toHaveBeenCalledOnce());
  });
});

describe('settings and surah picker', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    window.matchMedia = vi.fn().mockImplementation(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
  });
  it('applies and persists a theme through the settings sheet', async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'الإعدادات' }));
    const theme = await screen.findByRole('radio', { name: 'زيتوني' });
    fireEvent.click(theme);
    await waitFor(() =>
      expect(document.documentElement.dataset.theme).toBe('sage'),
    );
    expect(JSON.parse(localStorage.getItem('rattil:v1')!).theme).toBe('sage');
    fireEvent.click(screen.getByRole('button', { name: 'إغلاق' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
  it('opens the searchable catalogue and validates the selected verse', async () => {
    render(<App />);
    fireEvent.click(
      await screen.findByRole('button', {
        name: /اختيار السورة، سورة الفاتحة/,
      }),
    );
    const input = await screen.findByRole('combobox');
    const user = userEvent.setup();
    await user.click(input);
    await user.clear(input);
    await user.type(input, 'الناس');
    const option = await screen.findByRole('option', { name: /سورة الناس/ });
    fireEvent.click(option);
    const ayah = screen.getByLabelText('ابدأ من الآية');
    fireEvent.change(ayah, { target: { value: '7' } });
    expect(
      (
        screen.getByRole('button', {
          name: 'تأكيد الموضع',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    fireEvent.change(ayah, { target: { value: '6' } });
    fireEvent.click(screen.getByRole('button', { name: 'تأكيد الموضع' }));
    await waitFor(() =>
      expect(JSON.parse(localStorage.getItem('rattil:v1')!)).toMatchObject({
        surah: 114,
        ayah: 6,
      }),
    );
  });
});

it('keeps recordings in memory and releases their URL on position change', async () => {
  const stopTrack = vi.fn();
  const createURL = vi.fn().mockReturnValue('blob:private-recording');
  const revokeURL = vi.fn();
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: createURL,
  });
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    value: revokeURL,
  });
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getUserMedia: vi
        .fn()
        .mockResolvedValue({ getTracks: () => [{ stop: stopTrack }] }),
    },
  });
  vi.stubGlobal(
    'MediaRecorder',
    class {
      state = 'inactive';
      mimeType = 'audio/webm';
      ondataavailable: ((e: { data: Blob }) => void) | null = null;
      onstop: (() => void) | null = null;
      start() {
        this.state = 'recording';
      }
      stop() {
        this.state = 'inactive';
        this.ondataavailable?.({ data: new Blob(['voice']) });
        this.onstop?.();
      }
    },
  );
  const view = render(<Recorder position="1:1" />);
  fireEvent.click(screen.getByRole('button', { name: 'سمّع بصوتك' }));
  fireEvent.click(await screen.findByRole('button', { name: 'إنهاء التسجيل' }));
  expect(
    await screen.findByRole('button', { name: 'استمع إلى تسجيلك' }),
  ).toBeTruthy();
  expect(createURL).toHaveBeenCalledOnce();
  expect(stopTrack).toHaveBeenCalled();
  expect(localStorage.length).toBe(0);
  view.rerender(<Recorder position="1:2" />);
  expect(revokeURL).toHaveBeenCalledWith('blob:private-recording');
  expect(screen.queryByRole('button', { name: 'استمع إلى تسجيلك' })).toBeNull();
});

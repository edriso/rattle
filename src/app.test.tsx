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
import { reciters } from './data/audio';
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
        to: 999,
        perView: 999,
        theme: 'invalid',
        reciter: 'invalid',
        grain: 'page',
        echo: 9,
        plan: { linkBack: 99, singleReps: 4 },
      }),
    ).toMatchObject({
      surah: 114,
      ayah: 6,
      to: 6,
      perView: 5,
      theme: 'gold',
      reciter: defaults.reciter,
      grain: defaults.grain,
      echo: defaults.echo,
      plan: { ...defaults.plan, singleReps: 4 },
    });
    expect(restore({ surah: Infinity, ayah: NaN })).toMatchObject({
      surah: 1,
      ayah: 1,
      to: 5,
    });
  });
  /* Cutting inside an ayah needs that reciter's word timings, and not every
     mushaf has them. A pair the app cannot drill used to fail the whole
     session with «تعذّر تحميل النص». */
  it('never pairs phrase drilling with a reciter who has no word timings', async () => {
    expect(restore({ reciter: 'ayman-sowaid', grain: 'phrase' })).toMatchObject(
      {
        reciter: 'ayman-sowaid',
        grain: 1,
      },
    );
    expect(restore({ reciter: 'husary', grain: 'phrase' })).toMatchObject({
      grain: 'phrase',
    });
    // And changing the reciter under a session carries the grain with it.
    localStorage.setItem(
      'rattil:v1',
      JSON.stringify({ ...defaults, grain: 'phrase', reciter: 'husary' }),
    );
    render(<App />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'الإعدادات' }));
    // The settings panel is a lazy chunk, so give it room to arrive.
    await user.click(
      await screen.findByRole(
        'combobox',
        { name: 'القارئ' },
        { timeout: 3000 },
      ),
    );
    await user.click(
      await screen.findByRole(
        'option',
        { name: /أيمن سويد/ },
        { timeout: 3000 },
      ),
    );
    await waitFor(() =>
      expect(JSON.parse(localStorage.getItem('rattil:v1')!)).toMatchObject({
        reciter: 'ayman-sowaid',
        grain: 1,
      }),
    );
  });
  /* Who recites is a session choice: it decides how long the sitting will
     take and whether «جملة» can be offered at all. So it is on the start
     screen beside the estimate its pace moves, and tapping it puts the
     cursor on the reciter rather than on the panel's name. */
  it('reaches the reciter from the start screen', async () => {
    render(<App />);
    const user = userEvent.setup();
    const pick = await screen.findByRole('button', { name: /القارئ، محمود/ });
    /* The short name on the screen, because it shares one line of a phone
       with the estimate, and the whole name in the accessible name, so
       nothing is lost to somebody who cannot see which of them it is. */
    expect(pick.textContent).toBe('الحصري');
    expect(pick.getAttribute('aria-label')).toBe('القارئ، محمود خليل الحصري');
    await user.click(pick);
    const select = await screen.findByRole(
      'combobox',
      { name: 'القارئ' },
      { timeout: 3000 },
    );
    await waitFor(() => expect(document.activeElement).toBe(select));
    await user.click(select);
    await user.click(
      await screen.findByRole('option', { name: /العفاسي/ }, { timeout: 3000 }),
    );
    await waitFor(() =>
      expect(JSON.parse(localStorage.getItem('rattil:v1')!).reciter).toBe(
        'alafasy',
      ),
    );
    // And the gear still opens the same panel on its own name.
    await user.click(screen.getByRole('button', { name: 'إغلاق' }));
    await user.click(screen.getByRole('button', { name: 'الإعدادات' }));
    await waitFor(() =>
      expect(document.activeElement).not.toBe(
        screen.getByRole('combobox', { name: 'القارئ' }),
      ),
    );
  });

  /* Every reciter has to have a name short enough for that row, and it has
     to be a real name rather than the full one cut off somewhere. */
  it('gives every reciter a short name that is part of his name', () => {
    for (const reciter of reciters) {
      expect(reciter.short.length).toBeLessThanOrEqual(21);
      expect(reciter.short.length).toBeGreaterThan(3);
      for (const word of reciter.short.replace(/[()]/g, ' ').split(/\s+/))
        if (word) expect(reciter.name).toContain(word);
    }
  });

  it('reviews freely, hides actual verse text, navigates, and restores position', async () => {
    const view = render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: /راجِع بنفسك/ }));
    expect(screen.getByText('بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'إخفاء الآية' }));
    expect(screen.queryByText('بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'الآيات التالية' }));
    expect(screen.getByText('ٱلْحَمْدُ لِلَّهِ رَبِّ ٱلْعَـٰلَمِينَ')).toBeTruthy();
    view.unmount();
    render(<App />);
    await waitFor(() =>
      expect(screen.getByText('ٱلْحَمْدُ لِلَّهِ رَبِّ ٱلْعَـٰلَمِينَ')).toBeTruthy(),
    );
    expect(screen.queryByRole('button', { name: /راجِع بنفسك/ })).toBeNull();
  });
  /* Free review used to be remounted on every move, which switched looping
     off underneath the learner. Hiding is per ayah and must still reset. */
  it('keeps looping across a move, and shows each new ayah', async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: /راجِع بنفسك/ }));
    const loop = () => screen.getByRole('button', { name: 'تكرار التلاوة' });
    fireEvent.click(loop());
    expect(loop().getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'إخفاء الآية' }));
    fireEvent.click(screen.getByRole('button', { name: 'الآيات التالية' }));
    expect(loop().getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'إخفاء الآية' })).toBeTruthy();
  });

  it('stays usable, and says so, when local storage is blocked', async () => {
    const blocked = () => {
      throw new Error('blocked');
    };
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(blocked);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(blocked);
    render(<App />);
    expect(
      await screen.findByText('تعذّر حفظ التقدّم على هذا المتصفح.'),
    ).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'ابدأ جلسة التلقين' }),
    ).toBeTruthy();
  });
  it('does not pass the last verse', async () => {
    localStorage.setItem(
      'rattil:v1',
      JSON.stringify({ ...defaults, screen: 'practice', surah: 114, ayah: 6 }),
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
    fireEvent.click(screen.getByRole('button', { name: 'تسجيل صوتك' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(
      (screen.getByRole('button', { name: 'تسجيل صوتك' }) as HTMLButtonElement)
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
    fireEvent.click(screen.getByRole('button', { name: 'تسجيل صوتك' }));
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
    const theme = await screen.findByRole(
      'radio',
      {
        name: 'زيتوني',
      },
      { timeout: 3000 },
    );
    fireEvent.click(theme);
    await waitFor(() =>
      expect(document.documentElement.dataset.theme).toBe('sage'),
    );
    expect(JSON.parse(localStorage.getItem('rattil:v1')!).theme).toBe('sage');
    fireEvent.click(screen.getByRole('button', { name: 'إغلاق' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
  it('puts the surah back when the list is left without a choice', async () => {
    render(<App />);
    fireEvent.click(
      await screen.findByRole('button', {
        name: /اختيار السورة، سورة الفاتحة/,
      }),
    );
    const input = (await screen.findByRole(
      'combobox',
      { name: 'السورة' },
      { timeout: 3000 },
    )) as HTMLInputElement;
    const user = userEvent.setup();
    await user.click(input);
    await user.type(input, 'الناس');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(input.value).toBe('الفاتحة'));
  });

  /* Somebody who knows the verse and not its number is who the openings in
     that list are for. */
  it('finds an ayah by its own words', async () => {
    localStorage.setItem(
      'rattil:v1',
      JSON.stringify({ ...defaults, surah: 2, ayah: 1, to: 5 }),
    );
    render(<App />);
    fireEvent.click(
      await screen.findByRole('button', { name: /اختيار السورة، سورة البقرة/ }),
    );
    const from = (await screen.findByRole(
      'combobox',
      { name: 'من الآية' },
      // The picker is a lazy chunk, so give it room to arrive.
      { timeout: 3000 },
    )) as HTMLInputElement;
    const user = userEvent.setup();
    await user.click(from);
    await user.type(from, 'الله لا اله الا هو الحي القيوم');
    const option = await screen.findByRole('option', { name: /٢٥٥/ });
    fireEvent.click(option);
    await waitFor(() => expect(from.value).toBe('٢٥٥'));
    // The far end of the passage came along, rather than being left behind
    // the ayah it was on with an error to clear.
    expect(
      (screen.getByRole('combobox', { name: 'إلى الآية' }) as HTMLInputElement)
        .value,
    ).toBe('٢٥٥');
    fireEvent.click(screen.getByRole('button', { name: 'تأكيد المقطع' }));
    await waitFor(() =>
      expect(JSON.parse(localStorage.getItem('rattil:v1')!)).toMatchObject({
        surah: 2,
        ayah: 255,
        to: 255,
      }),
    );
  });

  it('opens the searchable catalogue and validates the selected verse', async () => {
    render(<App />);
    fireEvent.click(
      await screen.findByRole('button', {
        name: /اختيار السورة، سورة الفاتحة/,
      }),
    );
    const input = (await screen.findByRole(
      'combobox',
      { name: 'السورة' },
      { timeout: 3000 },
    )) as HTMLInputElement;
    const user = userEvent.setup();
    expect(input.value).toBe('الفاتحة');
    // Opening the list empties the box: the search starts on a clear field
    // rather than making the reader delete the surah they are already on.
    await user.click(input);
    expect(input.value).toBe('');
    await user.type(input, 'الناس');
    const option = await screen.findByRole('option', { name: /سورة الناس/ });
    fireEvent.click(option);
    expect(input.value).toBe('الناس');
    const from = screen.getByRole('combobox', { name: 'من الآية' });
    const to = screen.getByRole('combobox', { name: 'إلى الآية' });
    fireEvent.change(from, { target: { value: '٧' } });
    expect(
      (
        screen.getByRole('button', {
          name: 'تأكيد المقطع',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    fireEvent.change(from, { target: { value: '٤' } });
    fireEvent.change(to, { target: { value: '6' } });
    fireEvent.click(screen.getByRole('button', { name: 'تأكيد المقطع' }));
    await waitFor(() =>
      expect(JSON.parse(localStorage.getItem('rattil:v1')!)).toMatchObject({
        surah: 114,
        ayah: 4,
        to: 6,
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
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
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
  fireEvent.click(screen.getByRole('button', { name: 'تسجيل صوتك' }));
  fireEvent.click(await screen.findByRole('button', { name: 'إنهاء التسجيل' }));
  expect(
    await screen.findByRole('button', { name: 'تشغيل التسجيل' }),
  ).toBeTruthy();
  expect(createURL).toHaveBeenCalledOnce();
  expect(stopTrack).toHaveBeenCalled();
  expect(localStorage.length).toBe(0);
  view.rerender(<Recorder position="1:2" />);
  expect(revokeURL).toHaveBeenCalledWith('blob:private-recording');
  expect(screen.queryByRole('button', { name: 'تشغيل التسجيل' })).toBeNull();
});

it('carries a store written before the two modes existed into free review', () => {
  expect(
    restore({ started: true, surah: 24, ayah: 9, theme: 'rose' }),
  ).toMatchObject({
    screen: 'practice',
    surah: 24,
    ayah: 9,
    theme: 'rose',
    appearance: 'dark',
  });
  expect(restore({ started: false }).screen).toBe('home');
  expect(restore({ appearance: 'invalid' }).appearance).toBe('dark');
});

it('changes appearance without losing the verse or accent and restores it after remount', async () => {
  localStorage.setItem(
    'rattil:v1',
    JSON.stringify({ ...defaults, screen: 'practice', ayah: 2, theme: 'blue' }),
  );
  const view = render(<App />);
  fireEvent.click(await screen.findByRole('button', { name: 'الإعدادات' }));
  fireEvent.click(await screen.findByRole('radio', { name: 'فاتح' }));
  await waitFor(() =>
    expect(document.documentElement.dataset.appearance).toBe('light'),
  );
  expect(JSON.parse(localStorage.getItem('rattil:v1')!)).toMatchObject({
    ayah: 2,
    theme: 'blue',
    appearance: 'light',
  });
  fireEvent.click(screen.getByRole('button', { name: 'إغلاق' }));
  view.unmount();
  render(<App />);
  await waitFor(() =>
    expect(document.documentElement.dataset.appearance).toBe('light'),
  );
  expect(screen.getByText('ٱلْحَمْدُ لِلَّهِ رَبِّ ٱلْعَـٰلَمِينَ')).toBeTruthy();
});

it('follows system appearance changes and unsubscribes when a fixed appearance is chosen', async () => {
  let listener: (() => void) | undefined;
  const media = {
    matches: false,
    addEventListener: vi.fn((_name: string, callback: () => void) => {
      listener = callback;
    }),
    removeEventListener: vi.fn(),
  };
  window.matchMedia = vi.fn().mockReturnValue(media);
  localStorage.setItem(
    'rattil:v1',
    JSON.stringify({ ...defaults, appearance: 'system' }),
  );
  render(<App />);
  await waitFor(() =>
    expect(document.documentElement.dataset.appearance).toBe('light'),
  );
  media.matches = true;
  listener?.();
  expect(document.documentElement.dataset.appearance).toBe('dark');
  fireEvent.click(screen.getByRole('button', { name: 'الإعدادات' }));
  fireEvent.click(await screen.findByRole('radio', { name: 'فاتح' }));
  await waitFor(() =>
    expect(document.documentElement.dataset.appearance).toBe('light'),
  );
  expect(media.removeEventListener).toHaveBeenCalledWith(
    'change',
    expect.any(Function),
  );
});

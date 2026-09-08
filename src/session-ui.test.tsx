// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { App } from './App';
import { SessionView } from './components/SessionView';
import { defaults, type Preferences } from './data/quran';
import { openVerse } from './data/verse';
import ikhlas from './data/surahs/112.json';

/** Ayah 1 of al-Ikhlas without the basmala the source text prefixes to it. */
const first = openVerse(112, 1, ikhlas.verses[0]);

/** Just enough Web Audio for the session runtime to run under jsdom. */
class FakeAudioContext {
  state = 'running';
  currentTime = 0;
  destination = {};
  createGain() {
    return { connect: () => {}, gain: { value: 1 } };
  }
  createBufferSource() {
    return {
      buffer: null as unknown,
      onended: null as (() => void) | null,
      connect: () => {},
      start: () => {},
      stop: () => {},
      disconnect: () => {},
    };
  }
  decodeAudioData() {
    return Promise.resolve({ duration: 6 } as AudioBuffer);
  }
  resume() {
    return Promise.resolve();
  }
  suspend() {
    return Promise.resolve();
  }
  close() {
    return Promise.resolve();
  }
}

const start = (prefs: Partial<Preferences>) =>
  localStorage.setItem('rattil:v1', JSON.stringify({ ...defaults, ...prefs }));

const plan = () =>
  JSON.parse(localStorage.getItem('rattil:review:v1') ?? 'null');

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('AudioContext', FakeAudioContext);
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(8),
    })),
  );
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
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  // jsdom has no user activation of its own; only a test ever defines it.
  Reflect.deleteProperty(navigator, 'userActivation');
});

describe('choosing a passage', () => {
  it('costs the drill before anything is fetched and grows with the range', async () => {
    start({ surah: 2, ayah: 1, to: 3 });
    render(<App />);
    const estimate = await screen.findByRole('status', {
      name: 'تقدير الجلسة',
    });
    await waitFor(() => expect(estimate.textContent).toMatch(/دقيقة|دقائق/));
    const before = estimate.textContent;
    fireEvent.change(screen.getByRole('textbox', { name: 'إلى الآية' }), {
      target: { value: '10' },
    });
    await waitFor(() => expect(estimate.textContent).not.toBe(before));
    expect(estimate.textContent).toMatch(/مرة|مرات|مرتان/);
  });

  /* The passage clamps every keystroke, so a field showing the clamped value
     fought the typing: over ٩, a typed ١ read as an inverted range, snapped to
     ٥, and the next digit landed on that. */
  it('takes a retyped number a digit at a time', async () => {
    start({ surah: 2, ayah: 5, to: 9 });
    render(<App />);
    const to = (await screen.findByRole('textbox', {
      name: 'إلى الآية',
    })) as HTMLInputElement;
    const user = userEvent.setup();
    await user.clear(to);
    expect(to.value).toBe('');
    await user.type(to, '١٢');
    expect(to.value).toBe('١٢');
    await waitFor(() =>
      expect(JSON.parse(localStorage.getItem('rattil:v1')!).to).toBe(12),
    );
    // Leaving the field shows the number the passage actually holds.
    fireEvent.blur(to);
    expect(to.value).toBe('١٢');
  });

  it('says what to do about a drill that would run long', async () => {
    start({ surah: 2, ayah: 255, to: 257 });
    render(<App />);
    const hint = await screen.findByText(/جلسة طويلة/, {}, { timeout: 3000 });
    expect(hint).toBeTruthy();
    // The way out of a long drill is one tap from the sentence saying so, and
    // it opens the counts on this screen rather than sending the reader to a
    // panel to look for them.
    fireEvent.click(screen.getByRole('button', { name: 'خفّف التكرار' }));
    const counts = await screen.findByRole('button', {
      name: 'أنقِص مرات التلقين',
    });
    fireEvent.click(counts);
    await waitFor(() =>
      expect(
        JSON.parse(localStorage.getItem('rattil:v1')!).plan.singleReps,
      ).toBe(defaults.plan.singleReps - 1),
    );
  });

  it('offers listening alone, and hands the gap back when repeating resumes', async () => {
    start({ surah: 112, ayah: 1, to: 4, echo: 2 });
    render(<App />);
    const estimate = await screen.findByRole('status', {
      name: 'تقدير الجلسة',
    });
    await waitFor(() => expect(estimate.textContent).toMatch(/دقيقة|دقائق/));
    const repeating = estimate.textContent;
    fireEvent.click(screen.getByRole('radio', { name: 'أستمع فقط' }));
    // Dropping the gaps is most of the session, so the estimate must follow.
    await waitFor(() => expect(estimate.textContent).not.toBe(repeating));
    expect(JSON.parse(localStorage.getItem('rattil:v1')!).echo).toBe('off');
    fireEvent.click(screen.getByRole('radio', { name: /أستمع وأُردّد/ }));
    await waitFor(() =>
      expect(JSON.parse(localStorage.getItem('rattil:v1')!).echo).toBe(2),
    );
  });

  it('offers the ayah before the passage so it can be joined to what came before', async () => {
    start({ surah: 2, ayah: 6, to: 10 });
    render(<App />);
    fireEvent.click(
      await screen.findByRole('button', { name: /صِلْ بما قبلها/ }),
    );
    await waitFor(() =>
      expect(
        (
          screen.getByRole('textbox', {
            name: 'من الآية',
          }) as HTMLInputElement
        ).value,
      ).toBe('٥'),
    );
  });

  it('carries the passage along when free review moves the position', async () => {
    start({ screen: 'practice', surah: 2, ayah: 1, to: 3, perView: 1 });
    render(<App />);
    fireEvent.click(
      await screen.findByRole('button', { name: 'الآيات التالية' }),
    );
    await waitFor(() =>
      expect(JSON.parse(localStorage.getItem('rattil:v1')!)).toMatchObject({
        ayah: 2,
        to: 4,
      }),
    );
    // Returning to the start screen must never land on an empty range.
    fireEvent.click(
      screen.getByRole('button', { name: 'رجوع إلى اختيار المقطع' }),
    );
    expect(
      (
        await screen.findByRole('button', { name: 'ابدأ جلسة التلقين' })
      ).hasAttribute('disabled'),
    ).toBe(false);
  });

  it('lists what is due, most overdue first, and loads it when picked', async () => {
    start({ surah: 1, ayah: 1, to: 3 });
    localStorage.setItem(
      'rattil:review:v1',
      JSON.stringify([
        {
          surah: 2,
          from: 1,
          to: 5,
          due: '2020-01-01',
          last: '2019-12-01',
          reps: 1,
          ease: 2.5,
          interval: 1,
          lapses: 0,
        },
        {
          surah: 112,
          from: 1,
          to: 4,
          due: '2020-02-01',
          last: '2020-01-01',
          reps: 1,
          ease: 2.5,
          interval: 1,
          lapses: 0,
        },
      ]),
    );
    render(<App />);
    const due = await screen.findAllByRole('button', { name: /متأخرة/ });
    expect(due).toHaveLength(2);
    expect(due[0].textContent).toContain('البقرة');
    fireEvent.click(due[1]);
    await waitFor(() =>
      expect(JSON.parse(localStorage.getItem('rattil:v1')!)).toMatchObject({
        surah: 112,
        ayah: 1,
        to: 4,
      }),
    );
  });
});

describe('the browser tool', () => {
  type Tool = {
    name: string;
    execute: (input: unknown) => unknown;
  };

  const registered = () => {
    const tools: Tool[] = [];
    Object.defineProperty(document, 'modelContext', {
      configurable: true,
      value: { registerTool: (tool: Tool) => tools.push(tool) },
    });
    return tools;
  };

  it('opens a session over the passage it is given', async () => {
    const tools = registered();
    start({});
    render(<App />);
    await waitFor(() => expect(tools).toHaveLength(1));
    const tool = tools.find((t) => t.name === 'start_memorization')!;
    expect(tool.execute({ surah: 112, ayah: 1, to: 4 })).toEqual({
      surah: 112,
      ayah: 1,
      to: 4,
    });
    await waitFor(() =>
      expect(JSON.parse(localStorage.getItem('rattil:v1')!)).toMatchObject({
        screen: 'session',
        surah: 112,
        ayah: 1,
        to: 4,
      }),
    );
  });

  it('drills five ayat when given no end, and refuses a position off the end', async () => {
    const tools = registered();
    start({});
    render(<App />);
    await waitFor(() => expect(tools).toHaveLength(1));
    const tool = tools[0];
    expect(tool.execute({ surah: 2, ayah: 10 })).toEqual({
      surah: 2,
      ayah: 10,
      to: 14,
    });
    // Al-Ikhlas has four ayat, so the range cannot run past them.
    expect(tool.execute({ surah: 112, ayah: 3 })).toEqual({
      surah: 112,
      ayah: 3,
      to: 4,
    });
    expect(() => tool.execute({ surah: 112, ayah: 9 })).toThrow('موضع');
    expect(() => tool.execute({ surah: 0, ayah: 1 })).toThrow('موضع');
    expect(() => tool.execute('nonsense')).toThrow('موضع');
  });
});

describe('a talqeen session', () => {
  it('waits for a tap where the page has seen no gesture at all', async () => {
    Object.defineProperty(navigator, 'userActivation', {
      configurable: true,
      value: { hasBeenActive: false },
    });
    start({ screen: 'session', surah: 112, ayah: 1, to: 3 });
    render(<App />);
    // Reopening the app onto a saved session must not look like it hangs:
    // no browser will unlock audio unasked, so the play button is the way in.
    const play = await screen.findByRole(
      'button',
      { name: 'تشغيل' },
      { timeout: 3000 },
    );
    fireEvent.click(play);
    expect(
      await screen.findByRole('button', { name: 'إيقاف مؤقت' }),
    ).toBeTruthy();
  });

  it('drills the first segment, names the step, and counts down', async () => {
    start({ screen: 'session', surah: 112, ayah: 1, to: 3 });
    render(<App />);
    expect(
      await screen.findByText(/الخطوة ١ من/, {}, { timeout: 3000 }),
    ).toBeTruthy();
    expect(screen.getByText('تلقين')).toBeTruthy();
    expect(screen.getByText(new RegExp(first.text))).toBeTruthy();
    // The basmala is recorded apart from ayah one, so it is not in the drill.
    expect(screen.queryByText(new RegExp(first.basmala!))).toBeNull();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'إيقاف مؤقت' })).toBeTruthy(),
    );
  });

  it('pauses from the up arrow and offers the down arrow for the step again', async () => {
    start({ screen: 'session', surah: 112, ayah: 1, to: 3 });
    render(<App />);
    const pause = await screen.findByRole(
      'button',
      { name: 'إيقاف مؤقت' },
      { timeout: 3000 },
    );
    // Space would belong to this button once it has focus, so the arrow has to
    // reach the session on its own.
    pause.focus();
    fireEvent.keyDown(pause, { key: 'ArrowUp' });
    expect(await screen.findByRole('button', { name: 'تشغيل' })).toBeTruthy();
    expect(
      screen
        .getByRole('button', { name: 'أعِد هذه الخطوة' })
        .getAttribute('aria-keyshortcuts'),
    ).toBe('ArrowDown');
  });

  /* The settings sheet is reachable mid-drill. Changing the silence used to
     rebuild the session and drop the learner back on step one. */
  it('keeps the learner in place when the silence changes mid-drill', async () => {
    const prefs = {
      ...defaults,
      screen: 'session',
      surah: 112,
      ayah: 1,
      to: 3,
      echo: 1,
    } as Preferences;
    const noop = () => {};
    const view = render(
      <SessionView prefs={prefs} onExit={noop} onGraded={noop} />,
    );
    await screen.findByText(/الخطوة ١ من/, {}, { timeout: 3000 });
    fireEvent.click(screen.getByRole('button', { name: 'الخطوة التالية' }));
    await screen.findByText(/الخطوة ٢ من/);
    view.rerender(
      <SessionView
        prefs={{ ...prefs, echo: 2 }}
        onExit={noop}
        onGraded={noop}
      />,
    );
    expect(screen.getByText(/الخطوة ٢ من/)).toBeTruthy();
  });

  it('schedules the passage for review once it is graded', async () => {
    start({ screen: 'session', surah: 112, ayah: 1, to: 3 });
    render(<App />);
    fireEvent.click(
      await screen.findByRole(
        'button',
        { name: /أنهِ الجلسة/ },
        { timeout: 3000 },
      ),
    );
    fireEvent.click(await screen.findByRole('button', { name: /جيد/ }));
    await waitFor(() => expect(plan()).toHaveLength(1));
    expect(plan()[0]).toMatchObject({
      id: '112:1-3',
      surah: 112,
      from: 1,
      to: 3,
      reps: 1,
      interval: 1,
    });
    expect(JSON.parse(localStorage.getItem('rattil:v1')!).screen).toBe('home');
  });

  it('leaves without scheduling when the learner says so', async () => {
    start({ screen: 'session', surah: 112, ayah: 1, to: 3 });
    render(<App />);
    fireEvent.click(
      await screen.findByRole(
        'button',
        { name: /أنهِ الجلسة/ },
        { timeout: 3000 },
      ),
    );
    fireEvent.click(
      await screen.findByRole('button', { name: 'اخرج دون جدولة' }),
    );
    await waitFor(() =>
      expect(JSON.parse(localStorage.getItem('rattil:v1')!).screen).toBe(
        'home',
      ),
    );
    expect(plan()).toBeNull();
  });

  it('tries a failed recitation once more before giving up', async () => {
    const attempts = vi.fn(async () => {
      if (attempts.mock.calls.length === 1) throw new Error('no signal');
      return { ok: true, arrayBuffer: async () => new ArrayBuffer(8) };
    });
    vi.stubGlobal('fetch', attempts);
    start({ screen: 'session', surah: 112, ayah: 1, to: 3 });
    render(<App />);
    expect(
      await screen.findByRole(
        'button',
        { name: 'إيقاف مؤقت' },
        { timeout: 4000 },
      ),
    ).toBeTruthy();
    expect(attempts.mock.calls.length).toBeGreaterThan(1);
    expect(screen.queryByText(/تعذّر/)).toBeNull();
  });

  it('says so plainly when the recitation cannot be fetched', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 503 })),
    );
    start({ screen: 'session', surah: 112, ayah: 1, to: 3 });
    render(<App />);
    expect(
      await screen.findByText(/تعذّر تحميل التلاوة/, {}, { timeout: 3000 }),
    ).toBeTruthy();
  });

  it('keeps working where the browser has no Web Audio at all', async () => {
    vi.stubGlobal('AudioContext', undefined);
    start({ screen: 'session', surah: 112, ayah: 1, to: 3 });
    render(<App />);
    expect(
      await screen.findByText(/تعذّر تشغيل الصوت/, {}, { timeout: 3000 }),
    ).toBeTruthy();
    // The passage is still on screen to read from.
    expect(screen.getByText(new RegExp(first.text))).toBeTruthy();
  });
});

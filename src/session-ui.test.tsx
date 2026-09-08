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
  localStorage.setItem('rattle:v1', JSON.stringify({ ...defaults, ...prefs }));

const plan = () =>
  JSON.parse(localStorage.getItem('rattle:review:v1') ?? 'null');

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
      expect(JSON.parse(localStorage.getItem('rattle:v1')!).to).toBe(12),
    );
    // Leaving the field shows the number the passage actually holds.
    fireEvent.blur(to);
    expect(to.value).toBe('١٢');
  });

  /* The counts go down to nothing and up to ten, and both ends have to read
     as something rather than as a number that will not move. */
  it('holds the counts between nothing and ten, and says which', async () => {
    start({
      surah: 112,
      ayah: 1,
      to: 2,
      plan: { ...defaults.plan, singleReps: 1 },
    });
    render(<App />);
    const single = await screen.findByRole('status', { name: 'مرات التلقين' });
    const less = screen.getByRole('button', { name: 'أنقِص مرات التلقين' });
    const more = screen.getByRole('button', { name: 'زِد مرات التلقين' });
    expect(single.textContent).toBe('١');
    fireEvent.click(less);
    // Zero is «بلا», not «٠»: the step is dropped, it is not run no times.
    await waitFor(() => expect(single.textContent).toBe('بلا'));
    /* And it stops there. `aria-disabled` rather than `disabled`, so pressing
       it again does not drop the keyboard where it stands. */
    expect(less.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(less);
    expect(single.textContent).toBe('بلا');
    for (let i = 0; i < 12; i++) fireEvent.click(more);
    await waitFor(() => expect(single.textContent).toBe('١٠'));
    expect(more.getAttribute('aria-disabled')).toBe('true');
  });

  /* Now that all three counts can be turned down from the start screen, all
     three can be turned down to nothing at once. The schedule keeps one
     closing recital rather than presenting a drill with no steps in it, so
     the start button never sits there refusing to be pressed with nothing on
     the screen to explain why. */
  it('keeps one closing recital when every count is turned off', async () => {
    start({
      surah: 112,
      ayah: 1,
      to: 3,
      plan: { linkBack: 2, singleReps: 0, linkReps: 0, reciteReps: 0 },
    });
    render(<App />);
    const estimate = await screen.findByRole(
      'status',
      { name: 'تقدير الجلسة' },
      { timeout: 3000 },
    );
    await waitFor(() => expect(estimate.textContent).toMatch(/دقيقة|دقائق/));
    // Something to play, and counted the way Arabic counts it.
    expect(estimate.textContent).toMatch(/مرة|مرات|مرتان/);
    expect(estimate.textContent).not.toMatch(/٠ مرة/);
    const begin = screen.getByRole('button', {
      name: /ابدأ جلسة التلقين/,
    }) as HTMLButtonElement;
    expect(begin.disabled).toBe(false);
    fireEvent.click(begin);
    expect(
      await screen.findByText(/الخطوة ١ من ١/, {}, { timeout: 3000 }),
    ).toBeTruthy();
    expect(screen.getByText('سرد')).toBeTruthy();
  });

  it('says what to do about a drill that would run long', async () => {
    start({ surah: 2, ayah: 255, to: 257 });
    render(<App />);
    const hint = await screen.findByText(/جلسة طويلة/, {}, { timeout: 3000 });
    expect(hint).toBeTruthy();
    /* And the way out is already on the screen the sentence is on: the three
       counts are drawn, not hidden behind anything that has to be found and
       opened first. This is the request the reading group made in those
       words, so it is asserted rather than left to a stylesheet. */
    const counts = screen.getByRole('button', { name: 'أنقِص مرات التلقين' });
    fireEvent.click(counts);
    await waitFor(() =>
      expect(
        JSON.parse(localStorage.getItem('rattle:v1')!).plan.singleReps,
      ).toBe(defaults.plan.singleReps - 1),
    );
    // All three, and each showing what it is set to.
    for (const name of ['مرات التلقين', 'مرات الوصل', 'مرات السرد'])
      expect(screen.getByRole('status', { name })).toBeTruthy();
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
    expect(JSON.parse(localStorage.getItem('rattle:v1')!).echo).toBe('off');
    fireEvent.click(screen.getByRole('radio', { name: /أستمع وأُردّد/ }));
    await waitFor(() =>
      expect(JSON.parse(localStorage.getItem('rattle:v1')!).echo).toBe(2),
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
      expect(JSON.parse(localStorage.getItem('rattle:v1')!)).toMatchObject({
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
      'rattle:review:v1',
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
    const due = await screen.findAllByRole('button', { name: /متأخّرة/ });
    expect(due).toHaveLength(2);
    expect(due[0].textContent).toContain('البقرة');
    fireEvent.click(due[1]);
    await waitFor(() =>
      expect(JSON.parse(localStorage.getItem('rattle:v1')!)).toMatchObject({
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
      expect(JSON.parse(localStorage.getItem('rattle:v1')!)).toMatchObject({
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
      await screen.findByRole('button', { name: 'إيقاف مؤقّت' }),
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
      expect(screen.getByRole('button', { name: 'إيقاف مؤقّت' })).toBeTruthy(),
    );
  });

  /* A recitation that actually finishes, so the drill reaches the learner's
     own turn. The shared fake never ends a source, which is what every other
     test here wants; this one needs the phase after the recitation. */
  class EndingAudioContext extends FakeAudioContext {
    createBufferSource() {
      const source = {
        buffer: null as unknown,
        onended: null as (() => void) | null,
        connect: () => {},
        // `onended` is assigned right after `start()` returns, so a timeout
        // of zero is late enough to find it there.
        start: () => setTimeout(() => source.onended?.(), 0),
        stop: () => {},
        disconnect: () => {},
      };
      return source;
    }
  }

  /* The learner's turn is part of the drill: the silence is timed and the
     clock is running through it. It used to be the one stretch of a session
     that could not be stopped, because the only control on the screen was
     «تابِع», and somebody who wanted to stop had to wait for the reciter to
     start again and then catch him. */
  it('stops during the learner own turn, and offers to end it early', async () => {
    vi.stubGlobal('AudioContext', EndingAudioContext);
    start({ screen: 'session', surah: 112, ayah: 1, to: 3, echo: 1 });
    render(<App />);
    expect(
      await screen.findByText('ردّد الآن', {}, { timeout: 3000 }),
    ).toBeTruthy();
    // The main button stops the clock, and «تابِع» is its own control beside
    // it rather than the thing the main button has been turned into.
    const skip = screen.getByRole('button', { name: 'تابِع الآن' });
    expect(skip.className).toContain('skip-echo');
    expect(skip.getAttribute('aria-disabled')).toBe('false');
    expect(skip.getAttribute('aria-keyshortcuts')).toBe('ArrowLeft Enter');
    const pause = screen.getByRole('button', { name: 'إيقاف مؤقّت' });
    expect(pause.className).toContain('play-main');
    fireEvent.click(pause);
    expect(await screen.findByText('متوقّفة')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'تشغيل' })).toBeTruthy();
    /* «تابِع» stays where it was and goes inert, rather than being taken off
       the screen: pressing it is what ends the turn, so removing it on press
       would drop the keyboard off the control that had just been used. */
    const after = screen.getByRole('button', { name: 'تابِع الآن' });
    expect(after).toBe(skip);
    expect(after.getAttribute('aria-disabled')).toBe('true');
    expect(after.getAttribute('aria-keyshortcuts')).toBeNull();
  });

  it('ends the turn early from the button beside the main one', async () => {
    vi.stubGlobal('AudioContext', EndingAudioContext);
    start({ screen: 'session', surah: 112, ayah: 1, to: 3, echo: 2 });
    render(<App />);
    await screen.findByText('ردّد الآن', {}, { timeout: 3000 });
    const first = screen.getByText(/التكرار ١ من/);
    expect(first).toBeTruthy();
    /* The button beside the main one, not the main one: on the old screen
       these were the same control, so naming it is what makes this a test. */
    const skip = screen.getByRole('button', { name: 'تابِع الآن' });
    expect(skip.className).toContain('skip-echo');
    expect(skip.className).not.toContain('play-main');
    fireEvent.click(skip);
    // Which moves the drill on rather than skipping the whole step.
    expect(await screen.findByText(/التكرار ٢ من/)).toBeTruthy();
  });

  /* Forward during the turn means «I have finished repeating», which is what
     the button carrying that shortcut does. Without this the only way to end
     a turn early was to reach the button with Tab. */
  it('ends the turn early from the arrow that button carries', async () => {
    vi.stubGlobal('AudioContext', EndingAudioContext);
    start({ screen: 'session', surah: 112, ayah: 1, to: 3, echo: 2 });
    render(<App />);
    await screen.findByText('ردّد الآن', {}, { timeout: 3000 });
    expect(screen.getByText(/التكرار ١ من/)).toBeTruthy();
    const frame = screen.getByRole('region', { name: 'نص المقطع' });
    fireEvent.keyDown(frame, { key: 'ArrowLeft' });
    expect(await screen.findByText(/التكرار ٢ من/)).toBeTruthy();
    // And it is still on the first step, not skipped past it.
    expect(screen.getByText(/الخطوة ١ من/)).toBeTruthy();
  });

  /* «أنا أتحكّم» is the one phase where nothing is running, so there the main
     button is the way on and there is nothing to stop. */
  it('puts continuing on the main button when the learner holds the drill', async () => {
    vi.stubGlobal('AudioContext', EndingAudioContext);
    start({ screen: 'session', surah: 112, ayah: 1, to: 3, echo: 'manual' });
    render(<App />);
    expect(
      await screen.findByText('ردّد، ثم تابِع', {}, { timeout: 3000 }),
    ).toBeTruthy();
    /* And it is the only «تابِع» on the screen: the button beside it gives
       its slot back rather than sitting there inert under the same name. */
    const main = screen.getByRole('button', { name: 'تابِع الآن' });
    expect(main.className).toContain('play-main');
    expect(screen.queryByRole('button', { name: 'إيقاف مؤقّت' })).toBeNull();
    expect(document.querySelector('.skip-echo')).toBeNull();
  });

  it('names the clock and shows it as minutes and padded seconds', async () => {
    start({ screen: 'session', surah: 112, ayah: 1, to: 3 });
    render(<App />);
    const clock = await screen.findByRole(
      'timer',
      { name: 'الوقت المتبقي' },
      { timeout: 3000 },
    );
    // Arabic-Indic digits, two seconds digits, and read left to right, since
    // «١:٠٥» is a number and not a phrase.
    expect(clock.textContent).toMatch(/^[\u0660-\u0669]+:[\u0660-\u0669]{2}$/);
    expect(clock.getAttribute('dir')).toBe('ltr');
  });

  it('pauses from the up arrow and offers the down arrow for the step again', async () => {
    start({ screen: 'session', surah: 112, ayah: 1, to: 3 });
    render(<App />);
    const pause = await screen.findByRole(
      'button',
      { name: 'إيقاف مؤقّت' },
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

  /* Nothing in the settings sheet may cost the learner their place. The
     silence is handed to the running session; the reciter rebuilds the drill,
     and the drill is the same drill in a different voice, so the cursor goes
     with it. Somebody who asks to be read to more slowly on step three of
     nine should not be sent back to step one. */
  it('keeps the learner in place when the reciter changes mid-drill', async () => {
    const prefs = {
      ...defaults,
      screen: 'session',
      surah: 112,
      ayah: 1,
      to: 3,
    } as Preferences;
    const noop = () => {};
    const view = render(
      <SessionView prefs={prefs} onExit={noop} onGraded={noop} />,
    );
    await screen.findByText(/الخطوة ١ من/, {}, { timeout: 3000 });
    fireEvent.click(screen.getByRole('button', { name: 'الخطوة التالية' }));
    fireEvent.click(screen.getByRole('button', { name: 'الخطوة التالية' }));
    await screen.findByText(/الخطوة ٣ من/);
    view.rerender(
      <SessionView
        prefs={{ ...prefs, reciter: 'shuraim' }}
        onExit={noop}
        onGraded={noop}
      />,
    );
    expect(
      await screen.findByText(/الخطوة ٣ من/, {}, { timeout: 3000 }),
    ).toBeTruthy();
    expect(screen.getByText('سعود الشريم')).toBeTruthy();
  });

  /* The one setting in the sheet that cannot keep the learner's place says so
     while a drill is running, and says nothing on the start screen, where
     there is no drill to lose. */
  it('warns about the joins only while a drill is running', async () => {
    start({ screen: 'session', surah: 112, ayah: 1, to: 3 });
    render(<App />);
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole(
        'button',
        { name: 'الإعدادات' },
        { timeout: 3000 },
      ),
    );
    expect(
      await screen.findByText(/بدأت الجلسة من أوّلها/, {}, { timeout: 3000 }),
    ).toBeTruthy();
    /* It names the count it is about. The sentence before it in the same
       paragraph is about «مرات التكرار», which is on the start screen and
       cannot be changed mid-drill at all, so «هذا العدد» would have pointed
       at the wrong one. */
    expect(screen.getByText(/بدأت الجلسة من أوّلها/).textContent).toContain(
      'عدد مقاطع الوصل',
    );
    await user.click(screen.getByRole('button', { name: 'إغلاق' }));
    cleanup();
    // On the start screen there is nothing running, so nothing to warn about.
    start({ screen: 'home', surah: 112, ayah: 1, to: 3 });
    render(<App />);
    await user.click(
      await screen.findByRole(
        'button',
        { name: 'الإعدادات' },
        { timeout: 3000 },
      ),
    );
    await screen.findByRole('combobox', { name: 'القارئ' }, { timeout: 3000 });
    expect(screen.queryByText(/بدأت الجلسة من أوّلها/)).toBeNull();
  });

  /* But a change that makes a different drill has no step to carry a cursor
     to, and says so rather than pretending: the joins decide what every step
     after the first one even is. */
  it('starts over when the joins change', async () => {
    const prefs = {
      ...defaults,
      screen: 'session',
      surah: 112,
      ayah: 1,
      to: 4,
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
        prefs={{ ...prefs, plan: { ...prefs.plan, linkBack: 0 } }}
        onExit={noop}
        onGraded={noop}
      />,
    );
    expect(
      await screen.findByText(/الخطوة ١ من/, {}, { timeout: 3000 }),
    ).toBeTruthy();
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
    expect(JSON.parse(localStorage.getItem('rattle:v1')!).screen).toBe('home');
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
      expect(JSON.parse(localStorage.getItem('rattle:v1')!).screen).toBe(
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
        { name: 'إيقاف مؤقّت' },
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

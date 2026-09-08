// @vitest-environment jsdom
/* Auditing all five screens in Chrome by hand found one real bug: a 50px-tall
   search box whose field was only 32px, so 9px at each end of the box
   answered no tap. Everything else was clean, and nothing in the suite could
   have told us either way.

   This sweeps every screen for the three things that audit checked and that a
   renderer can answer without a layout engine: every visible control has an
   accessible name, no id is used twice, and no text is dimmed with `opacity`.

   **Target size is not covered here and cannot be.** jsdom computes no
   layout, so every box is 0×0 and any assertion about 44×44 would pass
   vacuously. That, and the reading order, stay a manual check against the
   built app: `npm run build && npx vite preview`. The bug above is exactly
   the kind this file will not catch. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from './App';
import { defaults, type Preferences } from './data/quran';

/** Just enough Web Audio for the session runtime to run under jsdom; the same
    fake as `session-ui.test.tsx`. */
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

// ---------------------------------------------------------------------------
// What counts as a control
// ---------------------------------------------------------------------------

const INTERACTIVE = [
  'button',
  'a[href]',
  'input:not([type="hidden"])',
  'select',
  'textarea',
  'summary',
  '[role="button"]',
  '[role="radio"]',
  '[role="combobox"]',
  '[role="option"]',
  '[tabindex]',
].join(',');

/** `[tabindex]` is in the list for the verse frame, which is a scrolling box
    a keyboard has to be able to reach. `-1` means deliberately out of the tab
    order, so it is only a control if something else on the list says so. */
const isControl = (el: Element) =>
  el.getAttribute('tabindex') !== '-1' ||
  el.matches(INTERACTIVE.split(',').slice(0, -1).join(','));

/** Out of the accessibility tree, or hidden, or drawn off-screen for a screen
    reader's benefit.

    base-ui renders aria-hidden internals and focus guards that are not real
    controls, and a modal marks the rest of the page aria-hidden, so an
    element that is itself aria-hidden counts as excluded. `.sr-only` is
    treated as an *ancestor* test rather than a self test on purpose: the
    segmented rows on the start screen and in the settings are real radio
    inputs made invisible behind a `<label>` that carries the text, and those
    have accessible names to check like anything else. */
function excluded(el: Element): boolean {
  if (el.closest('[aria-hidden="true"], [hidden], [inert]')) return true;
  if (el.parentElement?.closest('.sr-only')) return true;
  for (
    let node: HTMLElement | null = el as HTMLElement;
    node;
    node = node.parentElement
  ) {
    const style = node.style;
    if (style.display === 'none' || style.visibility === 'hidden') return true;
  }
  return false;
}

const controls = () =>
  [...document.body.querySelectorAll<HTMLElement>(INTERACTIVE)].filter(
    (el) => isControl(el) && !excluded(el),
  );

// ---------------------------------------------------------------------------
// Accessible name
// ---------------------------------------------------------------------------

const text = (el: Element | null) => (el?.textContent ?? '').trim();

/** Not a full accname implementation: the sources this app actually uses, in
    the order the algorithm consults them. */
function accessibleName(el: HTMLElement): string {
  const aria = (el.getAttribute('aria-label') ?? '').trim();
  if (aria) return aria;

  const referenced = (el.getAttribute('aria-labelledby') ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .map((id) => text(document.getElementById(id)))
    .filter(Boolean)
    .join(' ');
  if (referenced) return referenced;

  const own = text(el);
  if (own) return own;

  const title = (el.getAttribute('title') ?? '').trim();
  if (title) return title;

  // Covers both `<label for>` and a label the control sits inside.
  const labels = (el as HTMLInputElement).labels;
  const labelled = labels ? [...labels].map(text).join(' ').trim() : '';
  if (labelled) return labelled;

  return (el.getAttribute('placeholder') ?? '').trim();
}

/** Enough to point at the offender in a failure message. An icon-only button
    has no name and often no id either, and three of them on the start screen
    share a class, so the nearest text above it goes in too: that is the row it
    belongs to, which is how somebody reading the failure will find it. */
function describeElement(el: HTMLElement): string {
  const self = [
    el.tagName.toLowerCase(),
    el.getAttribute('role') ? `[role=${el.getAttribute('role')}]` : '',
    el.id ? `#${el.id}` : '',
    el.className
      ? `.${String(el.className).trim().split(/\s+/).slice(0, 2).join('.')}`
      : '',
  ].join('');
  let context = '';
  let node = el.parentElement;
  for (
    let up = 0;
    node && up < 4 && !context;
    up++, node = node.parentElement
  ) {
    const near = text(node).replace(/\s+/g, ' ');
    if (near.length >= 2 && near.length <= 60) context = near;
  }
  return context ? `${self} in «${context}»` : self;
}

// ---------------------------------------------------------------------------
// Dimmed text
// ---------------------------------------------------------------------------

/* An unconditional Tailwind opacity utility. A variant-prefixed one
   (`disabled:opacity-50`, `has-disabled:opacity-50`,
   `data-ending-style:opacity-0`) has a `:` rather than whitespace before
   `opacity-`, so it does not match: those are the disabled and transition
   states, which are allowed. */
const OPACITY_UTILITY = /(?:^|\s)!?opacity-(?:(\d+)|\[([^\]]+)])(?=\s|$)/;

const inDisabledState = (el: Element) =>
  el.closest('[disabled], [aria-disabled="true"]') !== null;

/** The stylesheet is not loaded under jsdom, so this sees inline styles and
    utility classes rather than computed opacity. That is where the mistake
    gets made: reaching for `opacity-60` or `style={{ opacity: 0.6 }}` on a
    secondary label instead of `--muted-foreground`, which is chosen to pass
    AA. The rule and the reason are in AGENTS.md under Style. */
function dimmed(): string[] {
  const found: string[] = [];
  for (const el of document.body.querySelectorAll<HTMLElement>('*')) {
    if (!text(el) || inDisabledState(el)) continue;

    const inline = el.style.opacity;
    if (inline) {
      const value = Number.parseFloat(inline);
      if (value > 0 && value < 1)
        found.push(`${describeElement(el)} has style opacity ${inline}`);
    }

    const utility = OPACITY_UTILITY.exec(String(el.className || ''));
    if (utility) {
      const value = utility[1]
        ? Number.parseInt(utility[1], 10) / 100
        : Number.parseFloat(utility[2]);
      if (value > 0 && value < 1)
        found.push(`${describeElement(el)} has class «${utility[0].trim()}»`);
    }
  }
  return found;
}

// ---------------------------------------------------------------------------
// The five screens
// ---------------------------------------------------------------------------

/** `least` is what the Chrome audit counted on each screen. It is a floor
    rather than an equality so that adding a control does not fail the suite,
    and it is here so that a screen which silently rendered nothing cannot
    pass every check below vacuously. The sweep finds more than the audit did
    on two screens, because it also reaches the visually-hidden radios behind
    the segmented labels, which a mouse never touches. */
const SCREENS = [
  {
    name: 'the start screen',
    least: 18,
    open: async () => {
      start({ screen: 'home' });
      render(<App />);
      await screen.findByRole('button', { name: 'ابدأ جلسة التلقين' });
    },
  },
  {
    name: 'the passage picker',
    least: 5,
    open: async () => {
      start({ screen: 'home' });
      render(<App />);
      const user = userEvent.setup();
      await user.click(
        await screen.findByRole('button', { name: /اختيار السورة/ }),
      );
      // The picker is a lazy chunk, so give it room to arrive.
      await screen.findByRole(
        'combobox',
        { name: 'السورة' },
        { timeout: 3000 },
      );
    },
  },
  {
    name: 'the settings sheet',
    least: 7,
    open: async () => {
      start({ screen: 'home' });
      render(<App />);
      const user = userEvent.setup();
      await user.click(await screen.findByRole('button', { name: 'الإعدادات' }));
      await screen.findByRole(
        'combobox',
        { name: 'القارئ' },
        { timeout: 3000 },
      );
    },
  },
  {
    name: 'free review',
    least: 11,
    open: async () => {
      start({ screen: 'practice', surah: 112, ayah: 1, to: 4 });
      render(<App />);
      await screen.findByRole('button', { name: 'إخفاء الآية' });
    },
  },
  {
    name: 'a session',
    least: 11,
    open: async () => {
      start({ screen: 'session', surah: 112, ayah: 1, to: 3 });
      render(<App />);
      await screen.findByText(/الخطوة ١ من/, {}, { timeout: 3000 });
    },
  },
];

describe.each(SCREENS)('$name', ({ name, least, open }) => {
  it('gives every visible control a name, keeps every id unique, and dims no text', async () => {
    await open();

    const found = controls();
    expect(
      found.length,
      `${name} rendered ${found.length} controls, fewer than the ${least} the audit counted`,
    ).toBeGreaterThanOrEqual(least);

    const nameless = found
      .filter((el) => accessibleName(el) === '')
      .map(describeElement);
    expect(
      nameless,
      `controls with no accessible name on ${name}: ${nameless.join(', ')}`,
    ).toEqual([]);

    const ids = [...document.querySelectorAll('[id]')].map((el) => el.id);
    const repeated = [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];
    expect(
      repeated,
      `ids used more than once on ${name}: ${repeated.join(', ')}`,
    ).toEqual([]);

    const faded = dimmed();
    expect(
      faded,
      `text dimmed with opacity on ${name}: ${faded.join('; ')}`,
    ).toEqual([]);
  });
});

/* The pace label beside a highlighted reciter failed WCAG AA in 8 of 8
   theme/appearance combinations, all of them under 3:1, and in the light
   appearance it sat at 1.02:1: invisible. Nothing in the suite noticed,
   because contrast lived in a stylesheet and was checked by eye. It was found
   by measuring in a browser, which is not something CI does.

   So this test reads the tokens out of `src/styles.css` rather than repeating
   their values, resolves the `var()` chains and the per-theme and
   per-appearance overrides into the eight combinations, and does the colour
   arithmetic itself.

   The arithmetic is the risky part, so it is validated against measurement
   before it is trusted to assert anything: `MEASURED` below is the worst case
   of each pairing over the eight combinations, read in real Chrome as
   composited 8-bit sRGB, and AGENTS.md carries the same table under Style. If
   this file and that table ever disagree, one of them is stale. */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const CSS = readFileSync(new URL('./styles.css', import.meta.url), 'utf8');

const THEMES = ['gold', 'sage', 'blue', 'rose'] as const;
const APPEARANCES = ['dark', 'light'] as const;
type Theme = (typeof THEMES)[number];
type Appearance = (typeof APPEARANCES)[number];

// ---------------------------------------------------------------------------
// Reading the stylesheet
// ---------------------------------------------------------------------------

/** One `:root…{…}` rule: its selector and its custom properties. */
type Block = { selector: string; declarations: Map<string, string> };

/** Splits on a delimiter only where no bracket is open, so `color-mix(in
    oklab, a 85%, b)` survives being cut into declarations. */
function splitTopLevel(text: string, delimiter: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '(' || c === '[') depth++;
    else if (c === ')' || c === ']') depth--;
    else if (c === delimiter && depth === 0) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts;
}

function readBlocks(css: string): Block[] {
  // Comments first: one of them mentions `--accent` and would be read as a
  // declaration.
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const blocks: Block[] = [];
  const opening = /(:root[^{};]*)\{/g;
  for (let m = opening.exec(clean); m; m = opening.exec(clean)) {
    // Brace-count to the end of the rule rather than to the first `}`.
    let depth = 1;
    let i = m.index + m[0].length;
    for (; i < clean.length && depth > 0; i++) {
      if (clean[i] === '{') depth++;
      else if (clean[i] === '}') depth--;
    }
    const body = clean.slice(m.index + m[0].length, i - 1);
    const declarations = new Map<string, string>();
    for (const piece of splitTopLevel(body, ';')) {
      const colon = piece.indexOf(':');
      if (colon < 0) continue;
      const name = piece.slice(0, colon).trim();
      if (name.startsWith('--'))
        declarations.set(name, piece.slice(colon + 1).trim());
    }
    blocks.push({ selector: m[1].trim(), declarations });
    opening.lastIndex = i;
  }
  return blocks;
}

const BLOCKS = readBlocks(CSS);

/** Which combinations a `:root…` selector applies to. Anything this does not
    recognise is a token block the resolver would silently skip, so it fails
    the suite instead. */
function applies(selector: string, theme: Theme, appearance: Appearance) {
  if (selector === ':root') return true;
  const themed = /^:root\[data-theme='(\w+)']$/.exec(selector);
  if (themed) return themed[1] === theme;
  const appeared = /^:root\[data-appearance='(\w+)']$/.exec(selector);
  if (appeared) return appeared[1] === appearance;
  return null;
}

/** The tokens as they stand on `<html>` for one theme and appearance, with
    the blocks overlaid in source order, which is what the cascade does when
    they have equal specificity. */
function tokensFor(theme: Theme, appearance: Appearance): Map<string, string> {
  const tokens = new Map<string, string>();
  for (const block of BLOCKS) {
    const hit = applies(block.selector, theme, appearance);
    expect(
      hit,
      `styles.css has a token block this test does not understand: ${block.selector}`,
    ).not.toBeNull();
    if (hit) for (const [k, v] of block.declarations) tokens.set(k, v);
  }
  return tokens;
}

/** Follows `var(--a)` chains wherever they sit in a value, so both
    `--accent-foreground: var(--button-ink)` and the two references inside
    `--accent-foreground-muted`'s `color-mix()` come out as literals. */
function resolve(tokens: Map<string, string>, name: string, depth = 0): string {
  expect(depth, `var() chain does not terminate at ${name}`).toBeLessThan(16);
  const value = tokens.get(name);
  expect(value, `styles.css declares no ${name}`).toBeDefined();
  return value!
    .trim()
    .replace(/var\(\s*(--[\w-]+)\s*\)/g, (_, reference: string) =>
      resolve(tokens, reference, depth + 1),
    );
}

// ---------------------------------------------------------------------------
// Colour
// ---------------------------------------------------------------------------

type Oklab = [L: number, a: number, b: number];

function number(text: string): number {
  const t = text.trim();
  const n = Number.parseFloat(t);
  expect(Number.isNaN(n), `cannot read a number from «${text}»`).toBe(false);
  return t.endsWith('%') ? n / 100 : n;
}

/** `oklch(L C H)` to OKLab. Alpha would make a contrast figure meaningless,
    so a translucent token is rejected rather than composited over a guess. */
function oklch(args: string): Oklab {
  expect(args, 'a colour under test carries an alpha').not.toContain('/');
  const [l, c, h] = splitTopLevel(args, ' ')
    .filter((p) => p.trim() !== '')
    .map(number);
  const radians = (h * Math.PI) / 180;
  return [l, c * Math.cos(radians), c * Math.sin(radians)];
}

function parseColor(value: string, depth = 0): Oklab {
  expect(depth, `colour function nests too deeply in «${value}»`).toBeLessThan(
    8,
  );
  // Newlines out first, so the pattern below needs no `s` flag: `--radius`'s
  // neighbours are one line each, but `color-mix()` is written over four.
  const text = value.trim().replace(/\s+/g, ' ');
  const fn = /^([\w-]+)\((.*)\)$/.exec(text);
  expect(fn, `not a colour this test can read: «${value}»`).not.toBeNull();
  const [, name, args] = fn!;
  if (name === 'oklch') return oklch(args);
  if (name === 'color-mix') {
    const parts = splitTopLevel(args, ',').map((p) => p.trim());
    expect(parts[0], 'only `in oklab` mixing is implemented').toBe('in oklab');
    const stops = parts.slice(1).map((stop) => {
      const pct = /\s(\d+(?:\.\d+)?)%$/.exec(stop);
      return {
        color: parseColor(pct ? stop.slice(0, pct.index) : stop, depth + 1),
        weight: pct ? Number.parseFloat(pct[1]) / 100 : null,
      };
    });
    expect(stops, 'color-mix() takes two colours').toHaveLength(2);
    // An omitted percentage is whatever the other one leaves.
    const first = stops[0].weight ?? 1 - (stops[1].weight ?? 0.5);
    const second = stops[1].weight ?? 1 - first;
    const total = first + second;
    return [0, 1, 2].map(
      (i) => (stops[0].color[i] * first + stops[1].color[i] * second) / total,
    ) as Oklab;
  }
  throw new Error(`unsupported colour function: ${name}()`);
}

/** OKLab to linear-light sRGB (Ottosson's matrices). */
function toLinearSrgb([L, a, b]: Oklab): [number, number, number] {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

const encode = (c: number) =>
  c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;

/** The 8-bit triple a browser composites, which is what the measurements
    below were read off. Out-of-gamut oklch is clipped here and gamut-mapped by
    Chrome, so the two only agree while nothing leaves sRGB by as much as half
    an 8-bit step; `--surface` in the light appearance is the one token that
    leaves it at all, by a fifth of a step. Anything further out would make
    this converter disagree with the browser silently, so it fails here. */
function composite(color: Oklab, label: string): [number, number, number] {
  const step = 0.5 / 255;
  const complaint = `${label} sits far enough outside sRGB that Chrome's gamut mapping and this test's clipping would disagree, which would make every figure here quietly wrong`;
  return toLinearSrgb(color).map((channel) => {
    const encoded = encode(channel);
    expect(encoded, complaint).toBeGreaterThan(-step);
    expect(encoded, complaint).toBeLessThan(1 + step);
    return Math.min(255, Math.max(0, Math.round(encoded * 255)));
  }) as [number, number, number];
}

/** WCAG 2.1 relative luminance. */
function luminance([r, g, b]: [number, number, number]): number {
  const [R, G, B] = [r, g, b].map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

function contrast(
  ink: [number, number, number],
  ground: [number, number, number],
): number {
  const a = luminance(ink);
  const b = luminance(ground);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

// ---------------------------------------------------------------------------
// The pairings
// ---------------------------------------------------------------------------

/** Every pairing the interface actually draws, with the floor it has to
    clear: 4.5 for text (WCAG 1.4.3 AA at this app's sizes) and 3.0 for the
    edge that identifies a control (WCAG 1.4.11). */
const PAIRINGS = [
  { ink: '--foreground', ground: '--background', needs: 4.5 },
  { ink: '--accent', ground: '--background', needs: 4.5 },
  { ink: '--accent', ground: '--surface', needs: 4.5 },
  { ink: '--muted-foreground', ground: '--background', needs: 4.5 },
  { ink: '--muted-foreground', ground: '--surface', needs: 4.5 },
  { ink: '--accent-foreground', ground: '--accent', needs: 4.5 },
  { ink: '--accent-foreground-muted', ground: '--accent', needs: 4.5 },
  { ink: '--control-border', ground: '--background', needs: 3 },
] as const;

/** Measured in Chrome as composited 8-bit sRGB, worst case of each pairing
    across the eight combinations. The same table is in AGENTS.md under Style;
    keep the two together. */
const MEASURED: Record<string, number> = {
  '--foreground on --background': 14.15,
  '--accent on --background': 6.01,
  '--accent on --surface': 6.32,
  '--muted-foreground on --background': 5.98,
  '--muted-foreground on --surface': 5.56,
  '--accent-foreground on --accent': 6.2,
  '--accent-foreground-muted on --accent': 4.95,
  '--control-border on --background': 3.24,
};

const COMBINATIONS = APPEARANCES.flatMap((appearance) =>
  THEMES.map((theme) => ({ theme, appearance })),
);

function ratios(theme: Theme, appearance: Appearance): Map<string, number> {
  const tokens = tokensFor(theme, appearance);
  const pixel = (name: string) =>
    composite(
      parseColor(resolve(tokens, name)),
      `${name} (${theme}, ${appearance})`,
    );
  const out = new Map<string, number>();
  for (const { ink, ground } of PAIRINGS)
    out.set(`${ink} on ${ground}`, contrast(pixel(ink), pixel(ground)));
  return out;
}

// ---------------------------------------------------------------------------

describe('the tokens in styles.css', () => {
  it('is read, not repeated: every combination resolves to real colours', () => {
    // If the parser quietly matched nothing, every assertion below would pass
    // on an empty stylesheet.
    expect(BLOCKS.map((b) => b.selector)).toEqual([
      ':root',
      ":root[data-theme='sage']",
      ":root[data-theme='blue']",
      ":root[data-theme='rose']",
      ":root[data-appearance='light']",
    ]);
    for (const { theme, appearance } of COMBINATIONS) {
      const tokens = tokensFor(theme, appearance);
      expect(resolve(tokens, '--accent'), `--accent, ${theme}`).toBe(
        resolve(tokens, `--${theme}`),
      );
      for (const { ink, ground } of PAIRINGS)
        for (const name of [ink, ground])
          expect(
            parseColor(resolve(tokens, name)).length,
            `${name} (${theme}, ${appearance})`,
          ).toBe(3);
    }
  });

  /* The converter is asserted against measurement before the requirement is
     asserted against the converter. Getting oklch, the oklab mix or the
     luminance weights subtly wrong would otherwise produce a test that is
     confidently wrong in both directions. */
  it('reproduces what was measured in Chrome, to within 0.05', () => {
    const worst = new Map<string, number>();
    for (const { theme, appearance } of COMBINATIONS)
      for (const [pairing, ratio] of ratios(theme, appearance))
        worst.set(pairing, Math.min(worst.get(pairing) ?? Infinity, ratio));
    for (const [pairing, measured] of Object.entries(MEASURED))
      expect(worst.get(pairing), `worst case of ${pairing}`).toBeCloseTo(
        measured,
        1,
      );

    /* Two individual readings rather than worst cases, so a converter that
       happened to land on the right minimum with the ordering inverted does
       not pass: `--accent-foreground-muted` on `--accent` is comfortable in
       the dark appearance and nearly at the floor in the light one. */
    const pairing = '--accent-foreground-muted on --accent';
    expect(
      ratios('gold', 'dark').get(pairing),
      `${pairing}, gold + dark`,
    ).toBeCloseTo(6.49, 1);
    expect(
      ratios('gold', 'light').get(pairing),
      `${pairing}, gold + light`,
    ).toBeCloseTo(4.95, 1);
  });

  describe.each(COMBINATIONS)(
    'meets WCAG in $theme + $appearance',
    ({ theme, appearance }) => {
      const measured = ratios(theme, appearance);
      it.each(PAIRINGS)('$ink on $ground', ({ ink, ground, needs }) => {
        const pairing = `${ink} on ${ground}`;
        expect(
          measured.get(pairing),
          `${pairing} in ${theme} + ${appearance} needs ${needs}:1`,
        ).toBeGreaterThanOrEqual(needs);
      });
    },
  );
});

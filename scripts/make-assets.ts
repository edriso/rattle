/* Offline generation of the share card and the installable icons.

   A link to this app used to preview as a bare line of text, and adding it to
   a phone's home screen took whatever the browser could scrape, because there
   was no manifest and iOS ignores an SVG icon. The five PNGs beside
   public/manifest.webmanifest are the answer, and this script is how they were
   drawn: HTML rendered in headless Chrome over the DevTools Protocol and
   screenshotted, so the card is set in the app's own typefaces, from the same
   Google Fonts stylesheet index.html links, rather than traced by hand.

   Run from the repository root:  npm run assets

   It needs Google Chrome installed (CHROME below, or $CHROME) and a network
   connection for the fonts. Nothing in the build or at run time calls it: its
   output is committed, the way the Quran text and the timings are. Re-run it
   only when the design changes, and commit what it writes.

   Two things it deliberately does not do. It adds no dependency: the DevTools
   Protocol is spoken over node:http and the WebSocket client Node 22 ships,
   which is the whole of the transport below. And it invents no colour and no
   copy: every colour is one this repository had already committed for the same
   job, named beside it, and the Arabic on the card is index.html's own og
   wording, so an asset cannot drift from the thing it mirrors.  */

import { spawn } from 'node:child_process';
import { createServer, get } from 'node:http';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const CHROME =
  process.env.CHROME ??
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const OUT = new URL('../public/', import.meta.url);

/** The faces index.html links, requested exactly as it requests them, so the
    card is set in the type the app itself loads. */
const FONTS =
  'https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&family=IBM+Plex+Sans+Arabic:wght@400;450;500;600&family=Reem+Kufi:wght@400;500;600&display=swap';

const INK = {
  /** index.html's `:root` background, its `theme-color` meta and the rect in
      public/favicon.svg: the one dark ground this app has. */
  ground: '#171918',
  /** The letter in public/favicon.svg. The icons here are that mark at the
      sizes a home screen and a manifest ask for. */
  mark: '#cfb574',
  /** index.html's `.boot-mark`, which is this same word in this same typeface,
      so the card and the app's first paint say it in one colour. */
  wordmark: '#c9a35f',
  /** index.html's `.boot-shell` text. */
  muted: '#b9b2a2',
  /** The mark colour a quarter of the way back to the ground. The share card
      stands the letter at its far end, where it has to be legible as the same
      mark and must not compete with the word beside it. */
  quiet: '#44402f',
  /** src/styles.css's own `--surface`, which Chrome resolves to this: measured
      by painting the token on a canvas and reading the pixel back. Used here
      for nothing but the glow under the mark. */
  surface: '#1c1f1d',
};

/* Worth knowing before anyone tidies the values above into the
   stylesheet's tokens: they are not the same colours. The tokens resolve to
   #151816 for the ground, #99958b for muted text and #d8b165 for the accent,
   a shade cleaner and lighter than what index.html and favicon.svg write by
   hand. These assets are that second family on purpose. A share card and an
   icon are seen beside the tab icon, the theme-colour bar and the first paint,
   never beside the running app, so they take their colours from the things
   they are actually next to. */

/** The word the app is called, and the line index.html already uses to say
    what it does (`og:description`, and the promise on the start screen). No
    Quran goes on a share card. */
const NAME = 'رَتِّل';
const LINE = 'اسمع، وردّد، واربط ما حفظت بما قبله.';
/** The single letter of the mark, as favicon.svg draws it. */
const MARK = 'ر';

/** Ink height of the mark as a fraction of a square icon's side, the same on
    every one of them. favicon.svg draws the letter a little smaller than this
    and sits it on a baseline two thirds down; an icon this size can afford a
    letter that is optically centred instead. */
const MARK_HEIGHT = 0.46;
/** The inset the share card's two poles keep from its edges. */
const CARD_PAD = 96;
/** favicon.svg's own corner: rx 18 on a 64 box. */
const MARK_RADIUS = (18 / 64) * 100;

/* ------------------------------------------------------------------ pages */

/** In-page helpers both pages need. Kept as one string so the card and the
    icons place the same letter by the same measurement. */
const HELPERS = String.raw`
const SVG = 'http://www.w3.org/2000/svg';

/* Waits for real faces and says so if they never came. A screenshot taken
   while a face is still in flight is set in a fallback and looks nothing like
   the app, and it fails silently, which is the whole reason this is a check
   and not a comment. */
async function waitForFonts(faces) {
  for (const face of faces) {
    const loaded = await document.fonts.load(face, NAME + MARK + LINE);
    if (!loaded.length) throw new Error('no font face matched ' + face);
    for (const font of loaded) {
      if (font.status !== 'loaded')
        throw new Error(face + ' is ' + font.status + ', not loaded');
    }
  }
  await document.fonts.ready;
}

/* The ink of a glyph, which is not the box the font reserves for it. That box
   holds room for an ascender this letter has not got and for marks it does not
   carry, so a «ر» centred by its line box is not centred at all. Canvas is the
   only place a browser will report the true extents. */
function inkOf(font, text) {
  const pen = document.createElement('canvas').getContext('2d');
  pen.font = font;
  // Said out loud, and said again on the element that gets drawn. These pages
  // are rtl documents, and a canvas outside the document is not: in rtl the
  // start of a run is its right edge, so the same letter measured one way and
  // drawn the other lands entirely outside the box measured for it. That is
  // not a hypothetical, it shipped an icon holding one thin sliver of a ر.
  pen.direction = 'ltr';
  const box = pen.measureText(text);
  return {
    left: box.actualBoundingBoxLeft,
    right: box.actualBoundingBoxRight,
    ascent: box.actualBoundingBoxAscent,
    descent: box.actualBoundingBoxDescent,
  };
}

/* Draws the text into the holder as an SVG whose viewBox is exactly that ink,
   so the element's own box and the letter coincide: after this, ordinary CSS
   centres the letter rather than the space around it. Returns the aspect, so
   the caller can size one axis and derive the other. */
function drawLetter(holder, text, family, weight) {
  // Measured large and scaled by the viewBox: only the ratio is used, and a
  // big measurement rounds better.
  const size = 400;
  const ink = inkOf(weight + ' ' + size + 'px ' + family, text);
  const width = ink.left + ink.right;
  const height = ink.ascent + ink.descent;
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute(
    'viewBox',
    -ink.left + ' ' + -ink.ascent + ' ' + width + ' ' + height,
  );
  const glyph = document.createElementNS(SVG, 'text');
  glyph.style.direction = 'ltr';
  glyph.setAttribute('font-family', family);
  glyph.setAttribute('font-size', String(size));
  glyph.setAttribute('font-weight', String(weight));
  glyph.setAttribute('fill', 'currentColor');
  glyph.textContent = text;
  svg.append(glyph);
  holder.append(svg);
  return width / height;
}
`;

const page = (css: string, body: string, script: string) => `<!doctype html>
<html lang="ar" dir="rtl">
  <head>
    <meta charset="UTF-8" />
    <link rel="stylesheet" href="${FONTS}" />
    <style>
      html, body { margin: 0; padding: 0; }
      svg { display: block; width: 100%; height: 100%; }
${css}
    </style>
  </head>
  <body>
${body}
    <script>
      const NAME = ${JSON.stringify(NAME)};
      const LINE = ${JSON.stringify(LINE)};
      const MARK = ${JSON.stringify(MARK)};
${HELPERS}
      window.ready = (async () => {
${script}
      })();
    </script>
  </body>
</html>
`;

/** 1200x630, the size every crawler crops from, and the only asset here that
    is read rather than tapped. Right to left: the name and its line stand at
    the start of the line, the mark stands at the end of it. */
const card = (width: number, height: number) =>
  page(
    `
      body {
        width: ${width}px;
        height: ${height}px;
        overflow: hidden;
        display: flex;
        align-items: center;
        /* A little warmth under the mark, so a flat field does not read as a
           placeholder. The stop is a physical percentage because it follows
           the mark, and the mark sits at the end of an rtl line. */
        background:
          radial-gradient(700px 580px at 22% 50%, ${INK.surface} 0%, ${INK.ground} 72%),
          ${INK.ground};
      }
      .lockup {
        flex: none;
        padding-inline-start: ${CARD_PAD}px;
      }
      .wordmark {
        font-family: 'Reem Kufi', sans-serif;
        font-weight: 500;
        font-size: 148px;
        /* Reem Kufi sets this word with a fatha and a shadda above it, and a
           tighter line box clips them. */
        line-height: 1.4;
        color: ${INK.wordmark};
      }
      .line {
        margin: 0;
        font-family: 'IBM Plex Sans Arabic', sans-serif;
        font-weight: 400;
        font-size: 42px;
        line-height: 1.7;
        color: ${INK.muted};
      }
      /* Centred in whatever the words leave, rather than held a fixed inset
         from the edge: the line of Arabic sets its own width, and a number
         here would have to be retuned every time the wording changed. */
      .mark {
        flex: 1;
        display: flex;
        justify-content: center;
        color: ${INK.quiet};
      }
`,
    `    <div class="lockup">
      <div class="wordmark"></div>
      <p class="line"></p>
    </div>
    <div class="mark"></div>`,
    `        await waitForFonts([
          "500 100px 'Reem Kufi'",
          "400 100px 'IBM Plex Sans Arabic'",
          '400 100px Amiri',
        ]);
        document.querySelector('.wordmark').textContent = NAME;
        document.querySelector('.line').textContent = LINE;
        const mark = document.querySelector('.mark');
        const aspect = drawLetter(mark, MARK, 'Amiri', 400);
        const tall = ${Math.round(height * 0.48)};
        const svg = mark.querySelector('svg');
        svg.style.height = tall + 'px';
        svg.style.width = tall * aspect + 'px';
        return 'mark ' + Math.round(tall * aspect) + 'x' + tall;`,
  );

/** One square icon. A maskable one is cropped to whatever shape the launcher
    fancies, so it gets no corner of its own and no transparency; every icon
    otherwise carries the same letter at the same size. */
const icon = (size: number, mask: boolean) =>
  page(
    `
      body {
        width: ${size}px;
        height: ${size}px;
        display: flex;
        overflow: hidden;
        /* Transparent outside the rounded tile, so an installer that draws the
           icon on a ground of its own does not get dark corners on it. A
           masked icon fills its square instead: the launcher owns the shape. */
        background: ${mask ? INK.ground : 'transparent'};
      }
      .tile {
        width: ${size}px;
        height: ${size}px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: ${INK.mark};
        background: ${INK.ground};
        border-radius: ${mask ? '0' : `${MARK_RADIUS}%`};
      }
`,
    '    <div class="tile"></div>',
    `        await waitForFonts(['400 100px Amiri']);
        const tile = document.querySelector('.tile');
        const aspect = drawLetter(tile, MARK, 'Amiri', 400);
        const tall = ${MARK_HEIGHT} * ${size};
        const wide = tall * aspect;
        /* All a maskable icon is promised is the circle of 80% of its side, so
           a letter whose diagonal fits that circle survives every shape a
           launcher might cut. Checked rather than fitted to, because the mark
           is one size on every icon and this says whether that size still
           clears the crop. */
        const safe = Math.hypot(wide, tall) / ${size};
        if (${mask} && safe > 0.8)
          throw new Error('the mark spans ' + safe.toFixed(2) +
            ' of the side and only 0.8 is safe under a mask');
        const svg = tile.querySelector('svg');
        svg.style.height = tall + 'px';
        svg.style.width = wide + 'px';
        return 'mark ' + Math.round(wide) + 'x' + Math.round(tall) +
          ', ' + safe.toFixed(2) + ' of the side across';`,
  );

type Asset = {
  file: string;
  width: number;
  height: number;
  html: string;
  /** Whether the corners are meant to come out transparent. */
  alpha: boolean;
};

const assets: Asset[] = [
  {
    file: 'og.png',
    width: 1200,
    height: 630,
    html: card(1200, 630),
    alpha: false,
  },
  // iOS masks this itself and has no use for an alpha channel, so it is the
  // one square that is drawn edge to edge without being a maskable icon.
  {
    file: 'apple-touch-icon.png',
    width: 180,
    height: 180,
    html: icon(180, true),
    alpha: false,
  },
  {
    file: 'icon-192.png',
    width: 192,
    height: 192,
    html: icon(192, false),
    alpha: true,
  },
  {
    file: 'icon-512.png',
    width: 512,
    height: 512,
    html: icon(512, false),
    alpha: true,
  },
  {
    file: 'icon-maskable-512.png',
    width: 512,
    height: 512,
    html: icon(512, true),
    alpha: false,
  },
];

/* -------------------------------------------------------------- transport */

type Json = Record<string, unknown>;

type Cdp = {
  send: (method: string, params?: Json, sessionId?: string) => Promise<Json>;
  once: (method: string, sessionId?: string) => Promise<Json>;
  close: () => void;
};

/** The DevTools Protocol, which is JSON over one WebSocket: a numbered call
    comes back with the same number, and anything without a number is an
    event. That is the entire protocol this script uses, which is why it does
    not carry a client library for it. */
export async function connect(url: string): Promise<Cdp> {
  const socket = new WebSocket(url);
  await new Promise<void>((resolve, reject) => {
    socket.addEventListener('open', () => resolve(), { once: true });
    socket.addEventListener(
      'error',
      () => reject(new Error(`cannot reach ${url}`)),
      { once: true },
    );
  });

  let last = 0;
  const calls = new Map<number, (message: Json) => void>();
  const watchers = new Set<(message: Json) => void>();
  socket.addEventListener('message', (event: MessageEvent) => {
    const message = JSON.parse(String(event.data)) as Json;
    if (typeof message.id === 'number') {
      const settle = calls.get(message.id);
      calls.delete(message.id);
      settle?.(message);
      return;
    }
    for (const watcher of [...watchers]) watcher(message);
  });

  return {
    send: (method, params = {}, sessionId) =>
      new Promise((resolve, reject) => {
        const id = ++last;
        calls.set(id, (message) => {
          const failure = message.error as { message?: string } | undefined;
          if (failure) reject(new Error(`${method}: ${failure.message}`));
          else resolve((message.result ?? {}) as Json);
        });
        socket.send(
          JSON.stringify({
            id,
            method,
            params,
            ...(sessionId && { sessionId }),
          }),
        );
      }),
    once: (method, sessionId) =>
      new Promise((resolve) => {
        const watcher = (message: Json) => {
          if (message.method !== method) return;
          if (sessionId !== undefined && message.sessionId !== sessionId)
            return;
          watchers.delete(watcher);
          resolve((message.params ?? {}) as Json);
        };
        watchers.add(watcher);
      }),
    close: () => socket.close(),
  };
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function getJson(url: string): Promise<Json> {
  return new Promise((resolve, reject) => {
    get(url, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => (body += chunk));
      response.on('end', () => {
        try {
          resolve(JSON.parse(body) as Json);
        } catch (error) {
          reject(error as Error);
        }
      });
    }).on('error', reject);
  });
}

export async function launch() {
  if (!existsSync(CHROME))
    throw new Error(`no Chrome at ${CHROME}. Set $CHROME to where yours is.`);
  const profile = mkdtempSync(join(tmpdir(), 'rattle-assets-'));
  const chrome = spawn(
    CHROME,
    [
      '--headless=new',
      // Port 0 means Chrome picks a free one and writes it to the file below,
      // so nothing here has to guess at a port that might be taken.
      '--remote-debugging-port=0',
      `--user-data-dir=${profile}`,
      // The screenshot has to be sRGB whatever screen it was taken on. Without
      // this a wide-gamut Mac renders and tags these in its own space, and the
      // committed PNGs come out of one machine looking unlike another's.
      '--force-color-profile=srgb',
      '--hide-scrollbars',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
    ],
    { stdio: 'ignore' },
  );

  const portFile = join(profile, 'DevToolsActivePort');
  let port = '';
  for (let attempt = 0; attempt < 200 && !port; attempt++) {
    await wait(100);
    if (!existsSync(portFile)) continue;
    // The file is written in two lines; a first read can catch it half done.
    const lines = readFileSync(portFile, 'utf8').split('\n');
    if (lines.length > 1 && lines[0]) port = lines[0];
  }
  if (!port) throw new Error('Chrome started but never published a port');

  const version = await getJson(`http://127.0.0.1:${port}/json/version`);
  const cdp = await connect(String(version.webSocketDebuggerUrl));
  return {
    cdp,
    // The profile goes only once Chrome has actually gone: it writes to that
    // directory on the way out, and removing it under a live process fails
    // with the directory not being empty.
    close: async () => {
      cdp.close();
      const ended = new Promise((resolve) => chrome.once('exit', resolve));
      chrome.kill();
      await ended;
      rmSync(profile, { recursive: true, force: true });
    },
  };
}

/** Serves the pages over http rather than from a file, so the document has an
    ordinary origin: a font file is a cross-origin request whichever way, and
    from `file:` some of them do not arrive. */
export function serve(pages: Map<string, string>) {
  const server = createServer((request, response) => {
    const html = pages.get(new URL(request.url ?? '/', 'http://x').pathname);
    if (html === undefined) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(html);
  });
  return new Promise<{ origin: string; close: () => void }>((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      resolve({
        origin: `http://127.0.0.1:${port}`,
        close: () => server.close(),
      });
    });
  });
}

async function shoot(cdp: Cdp, url: string, asset: Asset) {
  const { targetId } = await cdp.send('Target.createTarget', {
    url: 'about:blank',
  });
  const { sessionId } = (await cdp.send('Target.attachToTarget', {
    targetId,
    flatten: true,
  })) as { sessionId: string };
  try {
    await cdp.send('Page.enable', {}, sessionId);
    await cdp.send(
      'Emulation.setDeviceMetricsOverride',
      {
        width: asset.width,
        height: asset.height,
        deviceScaleFactor: 1,
        mobile: false,
      },
      sessionId,
    );
    if (asset.alpha)
      await cdp.send(
        'Emulation.setDefaultBackgroundColorOverride',
        { color: { r: 0, g: 0, b: 0, a: 0 } },
        sessionId,
      );
    // Registered before the navigation, or a page this small can load between
    // the two calls and the wait never ends.
    const loaded = cdp.once('Page.loadEventFired', sessionId);
    await cdp.send('Page.navigate', { url }, sessionId);
    await loaded;
    // The page reports its own readiness, because loading is not the whole of
    // it: the fonts have to arrive and the letter is placed from their
    // metrics. Anything the page throws surfaces here rather than being
    // screenshotted.
    let note = '';
    for (const expression of [
      'window.ready',
      'new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))',
    ]) {
      const result = await cdp.send(
        'Runtime.evaluate',
        { expression, awaitPromise: true, returnByValue: true },
        sessionId,
      );
      const thrown = result.exceptionDetails as
        | { exception?: { description?: string }; text?: string }
        | undefined;
      if (thrown)
        throw new Error(
          `${asset.file}: ${thrown.exception?.description ?? thrown.text}`,
        );
      // What the page made of the fonts it was given, so a run says where the
      // letter was actually put rather than only that it was put somewhere.
      const said = (result.result as { value?: unknown } | undefined)?.value;
      if (typeof said === 'string') note = said;
    }
    const shot = await cdp.send(
      'Page.captureScreenshot',
      { format: 'png', captureBeyondViewport: false },
      sessionId,
    );
    return { png: Buffer.from(String(shot.data), 'base64'), note };
  } finally {
    await cdp.send('Target.closeTarget', { targetId });
  }
}

/* ------------------------------------------------------------------ checks */

/** A PNG's own idea of its size, read out of the IHDR header, so the numbers
    reported below are the file's and not the request's. */
export function pngSize(png: Buffer) {
  const signature = '89504e470d0a1a0a';
  if (png.subarray(0, 8).toString('hex') !== signature)
    throw new Error('not a PNG');
  if (png.subarray(12, 16).toString('ascii') !== 'IHDR')
    throw new Error('PNG does not open with IHDR');
  return {
    width: png.readUInt32BE(16),
    height: png.readUInt32BE(20),
    alpha: (png.readUInt8(25) & 4) !== 0,
  };
}

/** The manifest names these files and their sizes, and a manifest that names a
    file that is not there installs an icon-less app. Checked here because this
    is the only place that knows what was actually written. */
function checkManifest() {
  const file = new URL('manifest.webmanifest', OUT);
  const manifest = JSON.parse(readFileSync(file, 'utf8')) as {
    icons: { src: string; sizes: string }[];
  };
  for (const entry of manifest.icons) {
    const named = new URL(entry.src, OUT);
    if (!existsSync(named))
      throw new Error(`manifest names ${entry.src}, which is not in public/`);
    if (!entry.src.endsWith('.png') || entry.sizes === 'any') continue;
    const { width, height } = pngSize(readFileSync(named));
    if (entry.sizes !== `${width}x${height}`)
      throw new Error(
        `manifest calls ${entry.src} ${entry.sizes}; it is ${width}x${height}`,
      );
  }
  console.log(
    `manifest.webmanifest    ${manifest.icons.length} icons, every one present and the size it claims`,
  );
}

/* -------------------------------------------------------------------- run */

async function generate() {
  const pages = new Map(assets.map((asset) => [`/${asset.file}`, asset.html]));
  const site = await serve(pages);
  const browser = await launch();
  try {
    for (const asset of assets) {
      const { png, note } = await shoot(
        browser.cdp,
        `${site.origin}/${asset.file}`,
        asset,
      );
      // The size is read back out of the PNG's own header rather than trusted
      // from the request: an emulation override that failed quietly would
      // otherwise ship an icon of the wrong size that looks right in a
      // preview of it.
      const size = pngSize(png);
      if (size.width !== asset.width || size.height !== asset.height)
        throw new Error(
          `${asset.file}: asked for ${asset.width}x${asset.height}, got ${size.width}x${size.height}`,
        );
      if (asset.alpha && !size.alpha)
        throw new Error(`${asset.file}: wanted transparent corners, got none`);
      writeFileSync(new URL(asset.file, OUT), png);
      console.log(
        `${asset.file.padEnd(23)} ${`${size.width}x${size.height}`.padEnd(9)} ` +
          `${(png.length / 1024).toFixed(1).padStart(5)} KB` +
          (size.alpha ? ', alpha' : '       ') +
          (note && `  ${note}`),
      );
    }
  } finally {
    await browser.close();
    site.close();
  }
  checkManifest();
}

/* Everything above is either a page or a way of talking to a browser, so a
   checker can import the transport and drive a page of its own. Only being
   run as a command writes anything. */
if (
  process.argv[1] !== undefined &&
  pathToFileURL(process.argv[1]).href === import.meta.url
)
  await generate();

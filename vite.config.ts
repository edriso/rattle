import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/postcss';
import { fileURLToPath, URL } from 'node:url';

const base = process.env.VITE_BASE_PATH || '/';

/* The share card needs an absolute address. Meta's own documentation for
   WhatsApp link previews says it in as many words, "an absolute URL for an
   image used as the thumbnail for the link preview", and that one scraper is
   what draws a link in WhatsApp, Messenger and Facebook; X, LinkedIn, Slack
   and Telegram are documented the same way. A relative path does work in an
   unfurler that runs a real browser, which is why this shipped and looked
   fine, but nothing promises it, and this card exists to survive being pasted
   into a group chat.

   No address is written down here, because none may be: this repository is
   0BSD and a fork must not inherit ours. `VITE_SITE_URL` comes from
   `actions/configure-pages`, which reports the address the deployment is
   actually going to, so a fork with no settings at all gets a card of its
   own. Unset, the path stays relative, which is right for a local build: it
   has no address to be absolute about. */
const siteUrl = process.env.VITE_SITE_URL?.trim();
const shareCard = siteUrl
  ? new URL('og.png', siteUrl.endsWith('/') ? siteUrl : `${siteUrl}/`).href
  : `${base}og.png`;

/** Vite substitutes `%BASE_URL%` itself and leaves anything else alone, so the
    card's address is put in by hand below. */
const TOKEN = '%SHARE_CARD%';

export default defineConfig({
  base,
  plugins: [
    react(),
    {
      name: 'share-card-address',
      transformIndexHtml(html: string) {
        // Loudly, rather than serving a card whose address is the token.
        if (!html.includes(TOKEN))
          throw new Error(
            `index.html no longer contains ${TOKEN}, so the share card would ship with no address.`,
          );
        return html.replaceAll(TOKEN, shareCard);
      },
    },
  ],
  css: { postcss: { plugins: [tailwindcss()] } },
  resolve: { alias: { '@': fileURLToPath(new URL('.', import.meta.url)) } },
});

import {
  createRootRoute,
  createRoute,
  HeadContent,
  Outlet,
} from '@tanstack/react-router';
import { App } from '../App';
export const rootRoute = createRootRoute({
  head: () => ({
    links: [],
  }),
  component: () => (
    <>
      <HeadContent />
      <Outlet />
    </>
  ),
});
export const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  head: () => ({
    meta: [
      { title: 'رَتِّلِ — رفيق حفظ القرآن' },
      {
        name: 'description',
        content:
          'مساحة هادئة لحفظ القرآن الكريم. استمع، وردّد، واختبر حفظك، آيةً آية.',
      },
      { property: 'og:title', content: 'رَتِّلِ — رفيق حفظ القرآن' },
      { property: 'og:description', content: 'رحلتك مع القرآن، آيةً آية.' },
      { property: 'og:locale', content: 'ar_AR' },
      { property: 'og:type', content: 'website' },
      { name: 'twitter:card', content: 'summary' },
      { name: 'twitter:title', content: 'رَتِّلِ — رفيق حفظ القرآن' },
    ],
  }),
  component: App,
});

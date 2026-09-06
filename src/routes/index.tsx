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
          'مساحة هادئة لحفظ القرآن الكريم. يُلقّنك المقطع، ثم يصله بما قبله، ثم يجدوله للمراجعة.',
      },
      { property: 'og:title', content: 'رَتِّلِ — رفيق حفظ القرآن' },
      {
        property: 'og:description',
        content: 'اسمع، وردّد، واربط ما حفظت بما قبله.',
      },
      { property: 'og:locale', content: 'ar_AR' },
      { property: 'og:type', content: 'website' },
      { name: 'twitter:card', content: 'summary' },
      { name: 'twitter:title', content: 'رَتِّلِ — رفيق حفظ القرآن' },
    ],
  }),
  component: App,
});

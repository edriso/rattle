import React from 'react';
import ReactDOM from 'react-dom/client';
import { createRouter, RouterProvider } from '@tanstack/react-router';
import { rootRoute, indexRoute } from './routes';
import './styles.css';
const router = createRouter({
  basepath: import.meta.env.BASE_URL,
  routeTree: rootRoute.addChildren([indexRoute]),
});
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
const app = (
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
);

// Keep the critical Arabic shell visible until the font stylesheet has settled.
// A short fallback prevents a blocked font request from holding the app hostage.
const fontsReady = document.fonts?.ready ?? Promise.resolve();
const fontTimeout = new Promise<void>((resolve) =>
  window.setTimeout(resolve, 1200),
);
void Promise.race([fontsReady, fontTimeout]).then(() => {
  ReactDOM.createRoot(document.getElementById('root')!).render(app);
});

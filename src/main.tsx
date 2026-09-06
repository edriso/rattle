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
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
);

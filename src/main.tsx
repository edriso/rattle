import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import './styles.css';
/* One screen, chosen from saved preferences rather than the URL, so there is
   no router here. The title and the social tags are static and live in
   index.html, where a crawler sees them without running any of this. */
const app = (
  <React.StrictMode>
    <App />
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

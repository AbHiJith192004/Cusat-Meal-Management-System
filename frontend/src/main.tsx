import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import {LegalView, LegalPage} from './views/LegalView.tsx';
import './index.css';

/**
 * The privacy notice and the terms must be readable WITHOUT signing in: a
 * policy you can only reach after logging in cannot inform the decision to log
 * in, and the university and the app stores both expect a link that works from
 * a signed-out browser.
 *
 * The app has no client-side router, so the path is matched here rather than
 * inside App. Doing it in App would mean returning before its hooks run, which
 * breaks the rules of hooks; deciding which tree to mount is this file's job.
 */
const LEGAL_PATHS: Record<string, LegalPage> = {
  '/privacy': 'privacy',
  '/terms': 'terms',
};

const path = window.location.pathname.replace(/\/+$/, '') || '/';
const legalPage = LEGAL_PATHS[path];

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {legalPage ? <LegalView page={legalPage} /> : <App />}
  </StrictMode>,
);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js');
  });
}

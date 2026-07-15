import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import LandingPage from './LandingPage.tsx';
import './index.css';

const path = window.location.pathname.replace(/\/$/, '') || '/';

const isDashboard = path === '/dashboard' || path.endsWith('/dashboard');
const isLegacySubscribe = path === '/subscribe' || path.endsWith('/subscribe');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isDashboard ? <App /> : <LandingPage />}
  </StrictMode>,
);

// Legacy /subscribe URLs scroll to pricing on landing
if (isLegacySubscribe && path !== '/') {
  window.history.replaceState(null, '', '/#pricing');
}

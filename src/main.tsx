import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import SubscribePage from './SubscribePage.tsx';
import './index.css';

const isSubscribeRoute =
  window.location.pathname === '/subscribe' ||
  window.location.pathname.endsWith('/subscribe');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isSubscribeRoute ? <SubscribePage /> : <App />}
  </StrictMode>,
);

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { api } from './api';
import { App } from './App';
import { AppProvider } from './state/app';
import './styles/tokens.css';
import './styles/app.css';

const root = createRoot(document.getElementById('root')!);

api.currentUser().then((user) =>
  root.render(
    <StrictMode>
      <AppProvider initialUser={user}>
        <App />
      </AppProvider>
    </StrictMode>
  )
);

if ('serviceWorker' in navigator && import.meta.env.PROD && location.protocol === 'https:' && !import.meta.env.VITE_SINGLE) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

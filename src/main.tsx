import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { api } from './api';
import { App } from './App';
import { AppProvider } from './state/app';
import { ReviewLink } from './screens/ReviewLink';
import './styles/tokens.css';
import './styles/app.css';

const root = createRoot(document.getElementById('root')!);
const params = new URLSearchParams(location.search);

if (params.get('review') && params.get('t')) {
  // Prüfseite aus der E-Mail: eigenständig, ohne Anmeldung
  root.render(<StrictMode><ReviewLink id={params.get('review')!} token={params.get('t')!} /></StrictMode>);
} else api.currentUser().then((user) =>
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

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Self-hosted Hebrew type (docs/spec/rendering.md, decision D22): Frank Ruhl
// Libre (editorial serif display) + Assistant (UI grotesque). Hebrew subsets
// only — bundled by Vite, no network/CDN at runtime.
import '@fontsource/frank-ruhl-libre/hebrew-700.css';
import '@fontsource/frank-ruhl-libre/hebrew-900.css';
import '@fontsource/assistant/hebrew-400.css';
import '@fontsource/assistant/hebrew-600.css';
import '@fontsource/assistant/hebrew-700.css';
import '@fontsource/assistant/hebrew-800.css';
import './styles/tokens.css';
import './styles/global.css';
import App from './App';

const container = document.getElementById('root');
if (!container) throw new Error('missing #root element');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

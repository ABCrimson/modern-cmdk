import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import { applyOsThemeDefault } from './theme.js';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element — ensure index.html has <div id="root"></div>');

applyOsThemeDefault();

if (location.pathname === '/bench') {
  // Browser bench page (benchmarks/browser/run.ts): loaded on demand so no other route ships it
  const { renderBench } = await import('./bench/bench-page.js');
  renderBench(root);
} else {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

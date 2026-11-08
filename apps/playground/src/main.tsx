import interUrl from '@fontsource-variable/inter/files/inter-latin-wght-normal.woff2?url';
import monoUrl from '@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2?url';
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
  // The fonts load before the first render so the first paint uses the final metrics and no
  // font swap moves the layout afterwards (the virtualized list would shift under a pointer).
  const faces: readonly [family: string, url: string, weight: string][] = [
    ['Inter Variable', interUrl, '100 900'],
    ['JetBrains Mono Variable', monoUrl, '100 800'],
  ];
  await Promise.all(
    faces.map(async ([family, url, weight]) => {
      try {
        const face = new FontFace(family, `url(${url}) format('woff2')`, {
          display: 'block',
          style: 'normal',
          weight,
        });
        document.fonts.add(await face.load());
      } catch (error) {
        console.error(`Font failed to load: ${family}`, error);
      }
    }),
  );
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

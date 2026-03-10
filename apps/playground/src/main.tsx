'use client';

// Temporal polyfill — WebKit/Safari don't ship Temporal yet (2026-03)
import { Temporal } from '@js-temporal/polyfill';
if (typeof globalThis.Temporal === 'undefined') {
  (globalThis as Record<string, unknown>).Temporal = Temporal;
}

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element — ensure index.html has <div id="root"></div>');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

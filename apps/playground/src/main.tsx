'use client';

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

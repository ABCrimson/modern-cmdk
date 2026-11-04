import { StrictMode } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { App } from './App';

const root = document.getElementById('root');
if (root === null) throw new Error('#root is missing');

hydrateRoot(
  root,
  <StrictMode>
    <App />
  </StrictMode>,
);

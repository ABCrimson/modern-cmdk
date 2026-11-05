import { StrictMode } from 'react';
import { renderToString } from 'react-dom/server';
import { App } from './App';

/** The server-rendered HTML of the app; the harness injects it into dist/client/index.html. */
export function render(): string {
  return renderToString(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

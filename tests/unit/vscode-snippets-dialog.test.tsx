// tests/unit/vscode-snippets-dialog.test.tsx
// CV-30: the cmd-dialog snippet, expanded with its defaults, opens on Ctrl+K and with Caps Lock on (key 'K').
// The expansion is written under tests/unit (the unit project aliases modern-cmdk/react to src) and removed afterwards.

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { act, type ComponentType } from 'react';
import { createRoot } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import snippets from '../../packages/vscode-modern-cmdk/src/snippets.json' with { type: 'json' };
import { expandBody } from '../../scripts/check-snippets.ts';

let dir: string;
let Palette: ComponentType;

beforeAll(async () => {
  dir = mkdtempSync(join(resolve(import.meta.dirname), '.snippet-'));
  const file: string = join(dir, 'cmd-dialog.tsx');
  writeFileSync(
    file,
    `${expandBody(snippets['Command Dialog'].body)}\nexport { CommandDialog };\n`,
  );
  Palette = (
    (await import(/* @vite-ignore */ pathToFileURL(file).href)) as { CommandDialog: ComponentType }
  ).CommandDialog;
});

afterEach(() => {
  document.body.replaceChildren();
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('cmd-dialog snippet', () => {
  it('CV-30: the expanded cmd-dialog opens on Ctrl+K and with Caps Lock (key K)', async () => {
    for (const key of ['k', 'K']) {
      const container: HTMLDivElement = document.createElement('div');
      document.body.appendChild(container);
      const root = createRoot(container);
      await act(async () => {
        root.render(<Palette />);
      });
      expect(document.querySelector('[role="dialog"]')).toBeNull();

      await act(async () => {
        document.dispatchEvent(new KeyboardEvent('keydown', { key, ctrlKey: true, bubbles: true }));
      });
      expect(document.querySelector('[role="dialog"]'), `key ${key}`).not.toBeNull();

      await act(async () => {
        root.unmount();
      });
      document.body.replaceChildren();
    }
  });
});

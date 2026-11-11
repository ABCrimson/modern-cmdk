// tests/unit/vscode-snippets-shortcut.test.tsx
// The cmd-shortcut snippet, expanded with its defaults, binds Mod+Shift+P on the item and shows it per platform.
// The expansion is written under tests/unit (the unit project aliases modern-cmdk/react to src) and removed afterwards.

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { act, type ComponentType } from 'react';
import { createRoot } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import snippets from '../../packages/vscode-modern-cmdk/src/snippets.json' with { type: 'json' };
import { expandBody } from '../../scripts/check-snippets.ts';

let dir: string;
let Palette: ComponentType;

beforeAll(async () => {
  dir = mkdtempSync(join(resolve(import.meta.dirname), '.snippet-'));
  const file: string = join(dir, 'cmd-shortcut.tsx');
  const body: string = expandBody(snippets['Command Shortcut'].body);
  writeFileSync(
    file,
    `import { Command } from 'modern-cmdk/react';\nexport function ShortcutPalette() {\n  return (\n<Command label="m"><Command.List>\n${body}\n</Command.List></Command>\n  );\n}\n`,
  );
  Palette = (
    (await import(/* @vite-ignore */ pathToFileURL(file).href)) as {
      ShortcutPalette: ComponentType;
    }
  ).ShortcutPalette;
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('cmd-shortcut snippet', () => {
  for (const [platform, label, modifier] of [
    ['Win32', 'Ctrl+Shift+P', { ctrlKey: true }],
    ['MacIntel', '⌘⇧P', { metaKey: true }],
  ] as const) {
    it(`on ${platform} the expanded snippet shows ${label} and Mod+Shift+P selects the item`, async () => {
      vi.spyOn(navigator, 'platform', 'get').mockReturnValue(platform);
      const log = vi.spyOn(console, 'log').mockImplementation(() => {});
      const container: HTMLDivElement = document.createElement('div');
      document.body.appendChild(container);
      const root = createRoot(container);
      await act(async () => {
        root.render(<Palette />);
      });
      expect(document.querySelector('[data-command-shortcut]')?.textContent).toBe(label);

      await act(async () => {
        document.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'P', shiftKey: true, ...modifier, bubbles: true }),
        );
      });
      expect(log).toHaveBeenCalledWith('selected');

      await act(async () => {
        root.unmount();
      });
    });
  }
});

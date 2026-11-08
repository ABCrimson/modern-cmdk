// tests/unit/vscode-snippets-optimistic.test.tsx
// CV-76: the cmd-optimistic snippet, expanded with its defaults, marks the selected item pending instead of appending
// a duplicate. The expansion is written under tests/unit (the unit project aliases modern-cmdk/react to src) and
// removed afterwards; `persist` stays pending until the test settles it, so the optimistic state is observable.

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { act, type ComponentType } from 'react';
import { createRoot } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import snippets from '../../packages/vscode-modern-cmdk/src/snippets-tsx.json' with {
  type: 'json',
};
import { expandBody } from '../../scripts/check-snippets.ts';
import { silenceConsoleError } from '../act-guard.ts';

interface Item {
  readonly id: string;
  readonly value: string;
  readonly label: string;
}

const persisted: Item[] = [];
let settle: (() => void) | undefined;

let dir: string;
let Palette: ComponentType<{ items: Item[] }>;

beforeAll(async () => {
  dir = mkdtempSync(join(resolve(import.meta.dirname), '.snippet-'));
  const file: string = join(dir, 'cmd-optimistic.tsx');
  // The snippet's default `persist` is the user's own function; the probe supplies one the test controls.
  Object.assign(globalThis, {
    __persist: (item: Item): Promise<void> => {
      persisted.push(item);
      return new Promise<void>((done) => {
        settle = done;
      });
    },
  });
  writeFileSync(
    file,
    [
      expandBody(snippets['Command with useOptimistic (React 19)'].body),
      'const persist = (item: Item) => (globalThis as unknown as { __persist(i: Item): Promise<void> }).__persist(item);',
      'interface Item { readonly id: string; readonly value: string; readonly label: string; readonly pending?: boolean }',
      'export { OptimisticCommand };',
      '',
    ].join('\n'),
  );
  Palette = (
    (await import(/* @vite-ignore */ pathToFileURL(file).href)) as {
      OptimisticCommand: ComponentType<{ items: Item[] }>;
    }
  ).OptimisticCommand;
});

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('cmd-optimistic snippet', () => {
  it('CV-76: selecting an item in cmd-optimistic renders one Command.Item per entry and no duplicate key', async () => {
    const errors = silenceConsoleError();
    const items: Item[] = [
      { id: 'a', value: 'a', label: 'Alpha' },
      { id: 'b', value: 'b', label: 'Beta' },
    ];
    const container: HTMLDivElement = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(<Palette items={items} />);
    });
    expect(container.querySelectorAll('[role="option"]')).toHaveLength(2);

    await act(async () => {
      container.querySelector<HTMLElement>('[role="option"]')?.click();
    });

    expect(persisted.map((item) => item.id)).toEqual(['a']);
    expect(container.querySelectorAll('[role="option"]')).toHaveLength(2);
    const duplicateKey = errors.mock.calls.filter((call) =>
      call.some((arg) => typeof arg === 'string' && /same key|duplicate key/i.test(arg)),
    );
    expect(duplicateKey).toEqual([]);
    expect(errors).not.toHaveBeenCalled();

    await act(async () => {
      settle?.();
    });
    await act(async () => {
      root.unmount();
    });
  });
});

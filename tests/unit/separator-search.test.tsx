// tests/unit/separator-search.test.tsx
// Command.Separator while a search is active (cluster C2): `alwaysRender` (cmdk's name) is `true` through 1.x;
// `false` hides the separator while the search is non-empty.

import type { CommandMachine } from 'modern-cmdk';
import { Command, CommandStableContext } from 'modern-cmdk/react';
import type { ReactNode } from 'react';
import { act, use } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';

let container: HTMLDivElement | undefined;
let root: Root | undefined;

afterEach(async () => {
  if (root) {
    await act(async () => {
      root?.unmount();
    });
  }
  container?.remove();
  root = undefined;
  container = undefined;
});

/** Mounts `ui` in a fresh container and flushes the first render. */
async function mount(ui: ReactNode): Promise<HTMLDivElement> {
  const host = document.createElement('div');
  container = host;
  document.body.appendChild(host);
  const current = createRoot(host);
  root = current;
  await act(async () => {
    current.render(ui);
  });
  return host;
}

/** Runs the scheduler frames and the effects that follow a state change. */
const settle = (): Promise<void> =>
  act(async () => {
    await new Promise<void>((resolve) => setTimeout(resolve, 50));
  });

/** Records the machine the subtree holds. */
let machine: CommandMachine | undefined;
const Probe = (): null => {
  machine = use(CommandStableContext)?.machine;
  return null;
};

async function search(query: string): Promise<void> {
  await act(async () => {
    machine?.send({ type: 'SEARCH_CHANGE', query });
  });
  await settle();
}

const separators = (host: ParentNode): number =>
  host.querySelectorAll('[data-command-separator]').length;

// A spread keeps the file type-checking before `alwaysRender` exists (a lone unknown key is a weak-type error, so `role` rides along)
const hideWhileSearching = { alwaysRender: false, role: 'none' } as const;

describe('Command.Separator alwaysRender (C2)', () => {
  it('RA-45: alwaysRender false hides the separator while the search is non-empty', async () => {
    const host = await mount(
      <Command>
        <Probe />
        <Command.Input />
        <Command.List>
          <Command.Item value="apple" forceId="apple">
            Apple
          </Command.Item>
          <Command.Separator {...hideWhileSearching} />
          <Command.Item value="banana" forceId="banana">
            Banana
          </Command.Item>
        </Command.List>
      </Command>,
    );
    await settle();
    expect(separators(host)).toBe(1);

    await search('app');
    expect(separators(host)).toBe(0);

    await search('');
    expect(separators(host)).toBe(1);
  });

  it('RA-45: the default keeps rendering the separator during a search', async () => {
    const host = await mount(
      <Command>
        <Probe />
        <Command.Input />
        <Command.List>
          <Command.Item value="apple" forceId="apple">
            Apple
          </Command.Item>
          <Command.Separator />
        </Command.List>
      </Command>,
    );
    await settle();
    await search('app');
    expect(separators(host)).toBe(1);
  });

  it('RA-45: a separator outside Command renders, with the default and with alwaysRender false', async () => {
    const host = await mount(
      <>
        <Command.Separator />
        <Command.Separator {...hideWhileSearching} />
      </>,
    );
    expect(separators(host)).toBe(2);
  });
});

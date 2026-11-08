// tests/unit/async-registration.test.tsx
// Command.AsyncItems registration (cluster C2): one registry entry and one search entry per id, a batch that a
// newer batch or an unmount replaces, and a promise held stable across renders suspends once.
// Helpers (`mount`, `update`, `settle`, `Spy`, `batchOf`) are shared by the tests of this file.

import type { CommandItem, CommandMachine, ItemId } from 'modern-cmdk';
import { itemId } from 'modern-cmdk';
import { Command, CommandStableContext } from 'modern-cmdk/react';
import type { ReactNode } from 'react';
import { act, use, useLayoutEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

let container: HTMLDivElement | undefined;
let root: Root | undefined;

/** Unmounts the mounted root, if any, and removes its container. */
async function teardown(): Promise<void> {
  const current = root;
  if (current) {
    await act(async () => {
      current.unmount();
    });
  }
  container?.remove();
  root = undefined;
  container = undefined;
}

afterEach(async () => {
  vi.restoreAllMocks();
  await teardown();
});

/** Mounts `ui` in a fresh container and flushes the first render. */
async function mount(ui: ReactNode): Promise<HTMLDivElement> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const current = root;
  await act(async () => {
    current.render(ui);
  });
  return container;
}

/** Renders `ui` again into the mounted root (same tree position, new props). */
async function update(ui: ReactNode): Promise<void> {
  const current = root;
  if (!current) throw new Error('nothing mounted');
  await act(async () => {
    current.render(ui);
  });
}

/** Runs the scheduler frames and effects that follow an interaction. */
const settle = (): Promise<void> =>
  act(async () => {
    await new Promise<void>((resolve) => setTimeout(resolve, 50));
  });

/** Records the machine the subtree holds; place `Probe` inside `<Command>`. */
class Spy {
  machine: CommandMachine | undefined;

  readonly Probe = (): null => {
    const stable = use(CommandStableContext);
    if (stable) this.machine = stable.machine;
    return null;
  };

  get current(): CommandMachine {
    if (!this.machine) throw new Error('probe never rendered');
    return this.machine;
  }

  /** The registered item ids, in registration order. */
  get ids(): string[] {
    return this.current
      .getRegistry()
      .getItems()
      .map((item) => item.id);
  }

  /** Sends `query` to the machine and returns the filtered ids once it settles. */
  async search(query: string): Promise<readonly ItemId[]> {
    await act(async () => {
      this.current.send({ type: 'SEARCH_CHANGE', query });
    });
    await settle();
    return this.current.getState().filteredIds;
  }
}

/** A batch of loaded items: `[id, value]` pairs, every one with the same raw `onSelect`. */
function batchOf(
  entries: readonly (readonly [string, string])[],
  onSelect: () => void,
): readonly CommandItem[] {
  return entries.map(([id, value]) => ({ id: itemId(id), value, onSelect }));
}

/** `<Command>` around one AsyncItems whose render prop is `render`. */
function palette(
  spy: Spy,
  items: Promise<readonly CommandItem[]>,
  render: (items: readonly CommandItem[]) => ReactNode,
  fallback: ReactNode = null,
): ReactNode {
  return (
    <Command>
      <spy.Probe />
      <Command.Input />
      <Command.List>
        <Command.AsyncItems items={items} fallback={fallback}>
          {render}
        </Command.AsyncItems>
      </Command.List>
    </Command>
  );
}

/** The render prop of a palette that renders every loaded item as `<Command.Item id={item.id}>`. */
const renderItems =
  (onSelect: () => void) =>
  (items: readonly CommandItem[]): ReactNode =>
    items.map((item) => (
      <Command.Item key={item.id} id={item.id} value={item.value} onSelect={onSelect}>
        {item.value}
      </Command.Item>
    ));

/** How many times FallbackProbe has mounted. */
let fallbackMounts = 0;

/** A Suspense fallback that counts its mounts. */
function FallbackProbe(): ReactNode {
  useLayoutEffect(() => {
    fallbackMounts += 1;
  }, []);
  return <span>loading</span>;
}

describe('Command.AsyncItems registration', () => {
  it('RA-17: a promise held stable across renders suspends once', async () => {
    fallbackMounts = 0;
    const spy = new Spy();
    const stable = Promise.resolve(batchOf([['one', 'Alpha']], vi.fn()));
    const render = renderItems(vi.fn());
    const tree = (tick: number): ReactNode => (
      <div data-tick={tick}>{palette(spy, stable, render, <FallbackProbe />)}</div>
    );
    await mount(tree(0));
    await settle();
    for (const tick of [1, 2, 3]) {
      await update(tree(tick));
      await settle();
    }
    expect(fallbackMounts).toBe(1);
    expect(spy.ids).toEqual(['one']);
  });
});

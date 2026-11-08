// tests/unit/async-registration.test.tsx
// Command.AsyncItems registration (cluster C2): one registry entry and one search entry per id, a batch that a
// newer batch or an unmount replaces, and a promise held stable across renders suspends once.
// Helpers (`mount`, `update`, `settle`, `Spy`, `batchOf`) are shared by the tests of this file.

import type { CommandItem, CommandMachine, ItemId } from 'modern-cmdk';
import { itemId } from 'modern-cmdk';
import { Command, CommandStableContext } from 'modern-cmdk/react';
import type { ReactNode } from 'react';
import { act, StrictMode, startTransition, use, useLayoutEffect, useState } from 'react';
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

/** The setter of a SwapHost's items promise. */
type SetItems = (items: Promise<readonly CommandItem[]>) => void;

/** A palette whose items promise is state; `expose` receives the setter on every render. */
function SwapHost({
  spy,
  initial,
  render,
  expose,
}: {
  readonly spy: Spy;
  readonly initial: Promise<readonly CommandItem[]>;
  readonly render: (items: readonly CommandItem[]) => ReactNode;
  readonly expose: (set: SetItems) => void;
}): ReactNode {
  const [items, setItems] = useState(initial);
  expose(setItems);
  return palette(spy, items, render, <span data-testid="fallback">loading</span>);
}

/** Runs `scenario` once plain and once inside StrictMode, each in a fresh tree. */
async function plainAndStrict(
  scenario: (wrap: (ui: ReactNode) => ReactNode) => Promise<void>,
): Promise<void> {
  await scenario((ui) => ui);
  await teardown();
  await scenario((ui) => <StrictMode>{ui}</StrictMode>);
}

describe('Command.AsyncItems registration', () => {
  it('ARCH-12: a loaded item rendered as Command.Item with its id counts once', async () => {
    await plainAndStrict(async (wrap) => {
      const raw = vi.fn();
      const rendered = vi.fn();
      const spy = new Spy();
      const batch = batchOf(
        [
          ['one', 'Alpha'],
          ['two', 'Beta'],
        ],
        raw,
      );
      await mount(wrap(palette(spy, Promise.resolve(batch), renderItems(rendered))));
      await settle();

      expect(spy.ids.sort()).toEqual(['one', 'two']);
      expect(spy.current.getRegistry().size).toBe(2);
      expect(spy.current.getState().filteredCount).toBe(2);

      await act(async () => {
        spy.current.send({ type: 'ITEM_SELECT', id: itemId('one') });
      });
      expect(rendered).toHaveBeenCalledTimes(1);
      expect(raw).not.toHaveBeenCalled();
    });
  });

  it('RA-18: unmounting AsyncItems unregisters every item it loaded', async () => {
    const withItems = renderItems(vi.fn());
    const withoutItems = (): ReactNode => null;
    for (const render of [withItems, withoutItems]) {
      const spy = new Spy();
      const batch = batchOf(
        [
          ['one', 'Alpha'],
          ['two', 'Beta'],
        ],
        vi.fn(),
      );
      await mount(palette(spy, Promise.resolve(batch), render));
      await settle();
      expect(spy.current.getRegistry().size).toBe(2);

      await update(
        <Command>
          <spy.Probe />
          <Command.Input />
          <Command.List />
        </Command>,
      );
      await settle();
      expect(spy.current.getRegistry().size).toBe(0);
      expect(await spy.search('Alpha')).toEqual([]);
      await teardown();
    }
  });

  it('DGX-ASYNC-4: a new items promise replaces the previous batch in the registry and the search index', async () => {
    await plainAndStrict(async (wrap) => {
      const raw = vi.fn();
      const rendered = vi.fn();
      const spy = new Spy();
      const first = Promise.resolve(
        batchOf(
          [
            ['old', 'Apple'],
            ['shared', 'Banana'],
          ],
          raw,
        ),
      );
      const second = Promise.resolve(
        batchOf(
          [
            ['shared', 'Banana'],
            ['fresh', 'Cherry'],
          ],
          raw,
        ),
      );
      // Only the shared id renders a Command.Item; the others live in the registry through the loaded batch alone.
      const renderShared = (items: readonly CommandItem[]): ReactNode =>
        items
          .filter((item) => item.id === 'shared')
          .map((item) => (
            <Command.Item key={item.id} id={item.id} value={item.value} onSelect={rendered}>
              {item.value}
            </Command.Item>
          ));

      await mount(wrap(palette(spy, first, renderShared)));
      await settle();
      expect(spy.ids.sort()).toEqual(['old', 'shared']);
      expect(await spy.search('Apple')).toEqual([itemId('old')]);
      await spy.search('');

      await update(wrap(palette(spy, second, renderShared)));
      await settle();
      expect(spy.ids.sort()).toEqual(['fresh', 'shared']);
      expect(spy.current.getRegistry().getItem(itemId('old'))).toBeUndefined();
      expect(await spy.search('Apple')).toEqual([]);
      expect(await spy.search('Cherry')).toEqual([itemId('fresh')]);
      await spy.search('');

      await act(async () => {
        spy.current.send({ type: 'ITEM_SELECT', id: itemId('shared') });
      });
      expect(rendered).toHaveBeenCalledTimes(1);
      expect(raw).not.toHaveBeenCalled();
    });
  });

  it("DGX-ASYNC-4: a transition-driven promise swap keeps a rendered Item's onSelect and keywords for an id in both batches", async () => {
    await plainAndStrict(async (wrap) => {
      const raw = vi.fn();
      const rendered = vi.fn();
      const spy = new Spy();
      const first = Promise.resolve(
        batchOf(
          [
            ['old', 'Apple'],
            ['shared', 'Banana'],
          ],
          raw,
        ),
      );
      let resolveSecond: ((items: readonly CommandItem[]) => void) | undefined;
      const pending = new Promise<readonly CommandItem[]>((resolve) => {
        resolveSecond = resolve;
      });
      // Only the shared id renders a Command.Item, with a keyword of its own that the loaded item lacks.
      const renderShared = (items: readonly CommandItem[]): ReactNode =>
        items
          .filter((item) => item.id === 'shared')
          .map((item) => (
            <Command.Item
              key={item.id}
              id={item.id}
              value={item.value}
              keywords={['gooseberry']}
              onSelect={rendered}
            >
              {item.value}
            </Command.Item>
          ));
      let setItems: SetItems | undefined;
      const host = await mount(
        wrap(
          <SwapHost
            spy={spy}
            initial={first}
            render={renderShared}
            expose={(set: SetItems): void => {
              setItems = set;
            }}
          />,
        ),
      );
      await settle();
      expect(spy.ids.sort()).toEqual(['old', 'shared']);

      // A swap inside a transition keeps the old batch on screen: nothing re-suspends, so no layout effect re-runs
      // by itself and the Item has to send its entry again once the new batch loads.
      await act(async () => {
        startTransition(() => setItems?.(pending));
      });
      await settle();
      expect(host.querySelector('[data-testid="fallback"]')).toBeNull();
      expect(spy.ids.sort()).toEqual(['old', 'shared']);

      await act(async () => {
        resolveSecond?.(
          batchOf(
            [
              ['shared', 'Banana'],
              ['fresh', 'Cherry'],
            ],
            raw,
          ),
        );
      });
      await settle();
      expect(spy.ids.sort()).toEqual(['fresh', 'shared']);
      expect(await spy.search('gooseberry')).toEqual([itemId('shared')]);
      await spy.search('');

      await act(async () => {
        spy.current.send({ type: 'ITEM_SELECT', id: itemId('shared') });
      });
      expect(rendered).toHaveBeenCalledTimes(1);
      expect(raw).not.toHaveBeenCalled();
    });
  });

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

  it('ARCH-12: an item without an id inside AsyncItems warns once in development', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const spy = new Spy();
    const batch = Promise.resolve(batchOf([['one', 'Alpha']], vi.fn()));
    const render = (items: readonly CommandItem[]): ReactNode =>
      items.map((item) => (
        <Command.Item key={item.id} value={item.value}>
          {item.value}
        </Command.Item>
      ));
    await mount(palette(spy, batch, render));
    await settle();
    await update(palette(spy, batch, render));
    await settle();

    const warnings = warn.mock.calls
      .map((args) => String(args[0]))
      .filter((text) => text.startsWith('[modern-cmdk]') && text.includes('AsyncItems'));
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('id={item.id}');
  });
});

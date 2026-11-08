// tests/unit/react-lifecycle.test.tsx
// React lifecycle of the <Command> root (cluster C1): which machine the subtree holds after
// StrictMode's simulated remount and <Activity> hide/show, and which callbacks a later prop reaches.
// The three exit-gate tests assert machine state and callback counts, never DOM item counts:
// with <Command.Item> children the root re-renders during mount and hides a lifecycle defect.
// Helpers (`mount`, `Spy`, `settle`, `typeInto`) are shared by the tests of this file.

import { setImmediate } from 'node:timers/promises';
import type { CommandItem, CommandMachine, FrecencyStorage } from 'modern-cmdk';
import { createSearchEngine, itemId } from 'modern-cmdk';
import { Command, CommandStableContext, useCommandState } from 'modern-cmdk/react';
import type { ReactNode } from 'react';
import { Activity, act, StrictMode, use } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

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

/** Types `text` into `input` the way a browser reports it: the native value setter, then a bubbling input event. */
async function typeInto(input: HTMLInputElement, text: string): Promise<void> {
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  await act(async () => {
    setValue?.call(input, text);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await settle();
}

/**
 * Records, from inside the subtree, every machine the stable context hands out (`machines`, one entry per
 * render of the probe) and every `search` value a `useCommandState` reader renders (`searches`).
 */
class Spy {
  readonly machines: CommandMachine[] = [];
  readonly searches: string[] = [];

  /** The machine the subtree holds right now: the one its latest render read from context. */
  get machine(): CommandMachine {
    const latest = this.machines.at(-1);
    if (!latest) throw new Error('probe never rendered');
    return latest;
  }

  /** Probe child: place it inside `<Command>`. */
  readonly Probe = (): null => {
    const stable = use(CommandStableContext);
    const search = useCommandState((state) => state.search);
    if (stable) this.machines.push(stable.machine);
    this.searches.push(search);
    return null;
  };
}

/** The most major collections one `collectGarbage` call runs while its predicate stays false. */
const MAX_COLLECTIONS = 20;

/**
 * Runs async major GCs until `settled()` is true, at most MAX_COLLECTIONS of them: the TUB-81 settle loop
 * of memory-leak.test.ts (see its `collectGarbage` for why each pass is async and followed by a `setImmediate` turn).
 */
async function collectGarbage(settled: () => boolean): Promise<void> {
  const gc = globalThis.gc;
  if (typeof gc !== 'function')
    throw new Error('gc() is missing: the unit project runs with --expose-gc');
  for (let pass = 0; pass < MAX_COLLECTIONS; pass++) {
    await gc({ type: 'major', execution: 'async', flavor: 'last-resort' });
    await setImmediate();
    if (settled()) return;
  }
}

/** Like `Spy`, but keeps only a WeakRef to the first machine it sees, so the probe itself never pins it. */
class WeakSpy {
  ref: WeakRef<CommandMachine> | undefined;

  /** Probe child: place it inside `<Command>`. */
  readonly Probe = (): null => {
    const stable = use(CommandStableContext);
    if (stable && this.ref === undefined) this.ref = new WeakRef(stable.machine);
    return null;
  };
}

/** Counts the renders of a `useCommandState` reader inside `<Command>`: one per machine tick that changes what it reads, plus the parent's. */
class RenderCounter {
  renders = 0;

  /** Probe child: place it inside `<Command>`. */
  readonly Probe = (): null => {
    useCommandState((state) => state.filteredCount);
    this.renders++;
    return null;
  };
}

const apple: CommandItem = { id: itemId('apple'), value: 'apple' };
const banana: CommandItem = { id: itemId('banana'), value: 'banana' };

const inputOf = (host: HTMLElement): HTMLInputElement => {
  const input = host.querySelector('input');
  if (!input) throw new Error('no input rendered');
  return input;
};

describe('React lifecycle (C1)', () => {
  it('query survives StrictMode remount', async () => {
    const spy = new Spy();
    const host = await mount(
      <StrictMode>
        <Command items={[apple, banana]}>
          <spy.Probe />
          <Command.Input />
        </Command>
      </StrictMode>,
    );
    await settle();

    await typeInto(inputOf(host), 'ap');

    // The machine the subtree holds took the query and filtered against its registered items.
    expect(spy.machine.getState().search).toBe('ap');
    expect(spy.machine.getState().filteredIds).toEqual([itemId('apple')]);
    // A subscriber of that machine saw the change.
    expect(spy.searches.at(-1)).toBe('ap');
  });

  it('registrations survive Activity hide/show', async () => {
    const spy = new Spy();
    const tree = (mode: 'visible' | 'hidden'): ReactNode => (
      <Activity mode={mode}>
        <Command>
          <spy.Probe />
          <Command.Input />
          <Command.List>
            <Command.Item value="apple">Apple</Command.Item>
            <Command.Item value="banana">Banana</Command.Item>
          </Command.List>
        </Command>
      </Activity>
    );
    const host = await mount(tree('visible'));
    await settle();
    const before = spy.machine;
    expect(
      before
        .getRegistry()
        .getItems()
        .map((item) => item.value),
    ).toEqual(['apple', 'banana']);

    await typeInto(inputOf(host), 'ap');
    expect(before.getState().search).toBe('ap');

    await update(tree('hidden'));
    await settle();
    await update(tree('visible'));
    await settle();

    // Same machine object, still live, still holding its registrations and its query.
    expect(spy.machine).toBe(before);
    expect(
      spy.machine
        .getRegistry()
        .getItems()
        .map((item) => item.value),
    ).toEqual(['apple', 'banana']);
    expect(spy.machine.getState().search).toBe('ap');
    const seenBefore = spy.searches.length;
    await act(async () => {
      spy.machine.send({ type: 'SEARCH_CHANGE', query: 'ban' });
    });
    await settle();
    expect(spy.machine.getState().search).toBe('ban');
    expect(spy.searches.slice(seenBefore)).toContain('ban');
  });

  it('onSelect prop change fires the new callback', async () => {
    const calls: string[] = [];
    const first = (id: string): void => {
      calls.push(`first:${id}`);
    };
    const second = (id: string): void => {
      calls.push(`second:${id}`);
    };
    const spy = new Spy();
    const tree = (onSelect: (id: string) => void): ReactNode => (
      <Command onSelect={onSelect}>
        <spy.Probe />
        <Command.Input />
        <Command.List>
          <Command.Item value="apple">Apple</Command.Item>
        </Command.List>
      </Command>
    );
    await mount(tree(first));
    await settle();
    await update(tree(second));
    await settle();

    const [registered] = spy.machine.getRegistry().getItems();
    if (!registered) throw new Error('item not registered');
    await act(async () => {
      spy.machine.send({ type: 'ITEM_SELECT', id: registered.id });
    });
    await settle();

    expect(calls).toEqual([`second:${registered.id}`]);
  });

  it('StrictMode: an item shortcut still fires after the double mount', async () => {
    const onSelect = vi.fn();
    await mount(
      <StrictMode>
        <Command items={[{ ...apple, shortcut: 'Ctrl+K', onSelect }]}>
          <Command.Input />
        </Command>
      </StrictMode>,
    );
    await settle();

    await act(async () => {
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }),
      );
    });
    await settle();

    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('StrictMode: a query typed before any re-render reaches the live machine', async () => {
    const spy = new Spy();
    const host = await mount(
      <StrictMode>
        <Command items={[apple, banana]}>
          <spy.Probe />
          <Command.Input />
        </Command>
      </StrictMode>,
    );

    // No settle: the query arrives before the root has re-rendered.
    await typeInto(inputOf(host), 'ap');

    expect(spy.machine.getState().search).toBe('ap');
    expect(spy.machine.getState().filteredIds).toEqual([itemId('apple')]);
    expect(inputOf(host).value).toBe('ap');
  });

  it('D102: StrictMode builds one machine per mount', async () => {
    // Construction loads the frecency storage once per machine, so the load count is the machine count.
    const load = vi.fn<FrecencyStorage['load']>(() => ({ records: new Map() }));
    const storage: FrecencyStorage = { load, save: async () => {}, [Symbol.dispose]: () => {} };
    await mount(
      <StrictMode>
        <Command items={[apple]} frecency={{ enabled: true, storage }}>
          <Command.Input />
        </Command>
      </StrictMode>,
    );
    await settle();

    expect(load).toHaveBeenCalledTimes(1);
  });

  it("D102: an unmounted Command's machine is collectable", async () => {
    using warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const weak = new WeakSpy();
    // A shortcut item gives the machine a global keydown listener, which a machine left resumed would keep reachable.
    await mount(
      <Command items={[{ ...apple, shortcut: 'Ctrl+K' }, banana]}>
        <weak.Probe />
        <Command.Input />
        <Command.List>
          <Command.Item value="cherry">Cherry</Command.Item>
        </Command.List>
      </Command>,
    );
    await settle();
    expect(weak.ref?.deref()).toBeDefined();

    const mounted = root;
    root = undefined;
    await act(async () => {
      mounted?.unmount();
    });
    // The children's UNREGISTER sends run on the next scheduler frame.
    await settle();
    await settle();

    await collectGarbage(() => weak.ref?.deref() === undefined);
    expect(weak.ref?.deref()).toBeUndefined();

    // The engine the machine created is disposed through the registry, never reported as undisposed.
    await collectGarbage(() => false);
    expect(warn.mock.calls.flat().join('\n')).not.toContain(
      'garbage collected without being disposed',
    );
  });

  it("D103: a caller's searchEngine is not disposed by the machine and keeps working after an Activity hide/show", async () => {
    const engine = createSearchEngine();
    using disposed = vi.spyOn(engine, Symbol.dispose);
    const search = vi.spyOn(engine, 'search');
    const spy = new Spy();
    const tree = (mode: 'visible' | 'hidden'): ReactNode => (
      <Activity mode={mode}>
        <Command searchEngine={engine}>
          <spy.Probe />
          <Command.Input />
          <Command.List>
            <Command.Item value="apple">Apple</Command.Item>
            <Command.Item value="banana">Banana</Command.Item>
          </Command.List>
        </Command>
      </Activity>
    );
    await mount(tree('visible'));
    await settle();
    await update(tree('hidden'));
    await settle();
    await update(tree('visible'));
    await settle();

    expect(disposed).not.toHaveBeenCalled();
    search.mockClear();
    await act(async () => {
      spy.machine.send({ type: 'SEARCH_CHANGE', query: 'ban' });
    });
    await settle();

    expect(search).toHaveBeenCalled();
    expect(spy.machine.getState().filteredIds.length).toBe(1);
  });

  it('an items prop change registers added items and unregisters removed ones', async () => {
    const cherry: CommandItem = { id: itemId('cherry'), value: 'cherry' };
    const spy = new Spy();
    const tree = (items: readonly CommandItem[]): ReactNode => (
      <Command items={items}>
        <spy.Probe />
      </Command>
    );
    await mount(tree([apple, banana]));
    await settle();
    expect(spy.machine.getState().filteredIds).toEqual([apple.id, banana.id]);

    await update(tree([banana, cherry]));
    await settle();
    expect(spy.machine.getRegistry().getItems()).toEqual([banana, cherry]);
    expect(spy.machine.getState().filteredIds).toEqual([banana.id, cherry.id]);

    const renamed: CommandItem = { ...banana, value: 'blueberry' };
    await update(tree([renamed, cherry]));
    await settle();
    expect(spy.machine.getRegistry().getItem(banana.id)).toBe(renamed);
    expect(
      spy.machine
        .getRegistry()
        .getItems()
        .map((item) => item.id),
    ).toEqual([banana.id, cherry.id]);
  });

  it('Command.Dialog: an onSearchChange prop change after mount reaches the new callback', async () => {
    const first = vi.fn();
    const second = vi.fn();
    const spy = new Spy();
    const tree = (onSearchChange: (query: string) => void): ReactNode => (
      <Command.Dialog open onSearchChange={onSearchChange}>
        <spy.Probe />
        <Command.Input />
      </Command.Dialog>
    );
    await mount(tree(first));
    await settle();
    await update(tree(second));
    await settle();
    await act(async () => {
      spy.machine.send({ type: 'SEARCH_CHANGE', query: 'ap' });
    });
    await settle();

    expect(first).not.toHaveBeenCalled();
    expect(second.mock.calls).toEqual([['ap']]);
  });

  it('a loop prop change after mount changes wrap-around', async () => {
    const spy = new Spy();
    const tree = (loop: boolean): ReactNode => (
      <Command items={[apple, banana]} loop={loop}>
        <spy.Probe />
      </Command>
    );
    await mount(tree(true));
    await settle();
    await update(tree(false));
    await settle();
    await act(async () => {
      spy.machine.send({ type: 'NAVIGATE', direction: 'last' });
    });
    await settle();
    await act(async () => {
      spy.machine.send({ type: 'NAVIGATE', direction: 'next' });
    });
    await settle();

    expect(spy.machine.getState().activeId).toBe(banana.id);
  });

  it('a disabledItems prop change refilters', async () => {
    const spy = new Spy();
    const items: readonly CommandItem[] = [apple, { ...banana, disabled: true }];
    const tree = (disabledItems: 'show' | 'hide'): ReactNode => (
      <Command items={items} disabledItems={disabledItems}>
        <spy.Probe />
      </Command>
    );
    await mount(tree('show'));
    await settle();
    expect(spy.machine.getState().filteredIds).toEqual([apple.id, banana.id]);

    await update(tree('hide'));
    await settle();
    expect(spy.machine.getState().filteredIds).toEqual([apple.id]);

    await update(tree('show'));
    await settle();
    expect(spy.machine.getState().filteredIds).toEqual([apple.id, banana.id]);
  });

  it('onSearchChange is not called twice for one query', async () => {
    const onSearchChange = vi.fn();
    const spy = new Spy();
    await mount(
      <Command items={[apple, banana]} onSearchChange={onSearchChange}>
        <spy.Probe />
      </Command>,
    );
    await settle();
    for (const query of ['ap', 'ap', 'ban', 'ban', 'ap']) {
      await act(async () => {
        spy.machine.send({ type: 'SEARCH_CHANGE', query });
      });
      await settle();
    }

    expect(onSearchChange.mock.calls).toEqual([['ap'], ['ban'], ['ap']]);
  });

  it('a parent that passes an inline items array does not loop', async () => {
    const counter = new RenderCounter();
    const tree = (tick: number): ReactNode => (
      <Command items={[{ ...apple }, { ...banana, value: `banana ${tick}` }]}>
        <counter.Probe />
      </Command>
    );
    await mount(tree(0));
    for (const tick of [1, 2, 3]) {
      await update(tree(tick));
      await settle();
    }
    const afterUpdates = counter.renders;
    await settle();
    await settle();

    expect(counter.renders).toBe(afterUpdates);
    expect(afterUpdates).toBeLessThan(30);
  });

  it('a shortcutAction prop change after mount warns once that the option is read at mount', async () => {
    using warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const tree = (shortcutAction: 'direct' | 'select'): ReactNode => (
      <Command items={[apple]} shortcutAction={shortcutAction}>
        <Command.List />
      </Command>
    );
    await mount(tree('direct'));
    await settle();
    expect(warn).not.toHaveBeenCalled();

    await update(tree('select'));
    await update(tree('direct'));
    await settle();

    const warnings = warn.mock.calls.map((call) => String(call[0]));
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('shortcutAction');
  });
});

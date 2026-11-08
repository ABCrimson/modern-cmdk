// tests/unit/react-lifecycle.test.tsx
// React lifecycle of the <Command> root (cluster C1): which machine the subtree holds after
// StrictMode's simulated remount and <Activity> hide/show, and which callbacks a later prop reaches.
// The three exit-gate tests assert machine state and callback counts, never DOM item counts:
// with <Command.Item> children the root re-renders during mount and hides a lifecycle defect.
// Helpers (`mount`, `Spy`, `settle`, `typeInto`) are shared by the tests of this file.

import type { CommandItem, CommandMachine } from 'modern-cmdk';
import { itemId } from 'modern-cmdk';
import { Command, CommandStableContext, useCommandState } from 'modern-cmdk/react';
import type { ReactNode } from 'react';
import { Activity, act, StrictMode, use } from 'react';
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

const apple: CommandItem = { id: itemId('apple'), value: 'apple' };
const banana: CommandItem = { id: itemId('banana'), value: 'banana' };

const inputOf = (host: HTMLElement): HTMLInputElement => {
  const input = host.querySelector('input');
  if (!input) throw new Error('no input rendered');
  return input;
};

describe('React lifecycle (C1)', () => {
  // The three tests are red until the C1 lifecycle fix; the fixing commit turns them into `it`.
  it.fails('query survives StrictMode remount', async () => {
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

  it.fails('registrations survive Activity hide/show', async () => {
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

  it.fails('onSelect prop change fires the new callback', async () => {
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
});

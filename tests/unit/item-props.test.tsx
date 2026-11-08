// tests/unit/item-props.test.tsx
// Command.Item and Command.Group props (cluster C2): the `id` prop and its deprecated alias `forceId`, `propsMerge`, live `data`.
// Helpers (`mount`, `update`, `settle`, `Spy`) are shared by the tests of this file.

import { fireEvent } from '@testing-library/react';
import type { CommandMachine } from 'modern-cmdk';
import { groupId, itemId } from 'modern-cmdk';
import { Command, CommandStableContext } from 'modern-cmdk/react';
import type { MouseEvent, ReactNode } from 'react';
import { act, use } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

let container: HTMLDivElement | undefined;
let root: Root | undefined;

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
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

/** Records the machine the subtree holds; place `Probe` inside `<Command>`. */
class Spy {
  machine: CommandMachine | undefined;

  readonly Probe = (): null => {
    const stable = use(CommandStableContext);
    if (stable) this.machine = stable.machine;
    return null;
  };

  get registry(): ReturnType<CommandMachine['getRegistry']> {
    if (!this.machine) throw new Error('probe never rendered');
    return this.machine.getRegistry();
  }
}

/** The [modern-cmdk] warnings a console.warn spy has recorded. */
function libraryWarnings(spy: {
  readonly mock: { readonly calls: readonly unknown[][] };
}): string[] {
  return spy.mock.calls
    .map((args) => String(args[0]))
    .filter((text) => text.startsWith('[modern-cmdk]'));
}

describe('Command.Item and Command.Group id', () => {
  it('D29: id sets the registration and DOM id; forceId is its deprecated alias', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const spy = new Spy();
    const tree = (item: ReactNode, tick = 0): ReactNode => (
      <Command>
        <spy.Probe />
        <Command.Input />
        <Command.List data-tick={tick}>{item}</Command.List>
      </Command>
    );

    // `id` alone: the registry entry, the DOM id and the input's aria-activedescendant are one id.
    const host = await mount(
      tree(
        <Command.Item value="alpha" id="by-id">
          Alpha
        </Command.Item>,
      ),
    );
    await settle();
    expect(spy.registry.getItem(itemId('by-id'))?.value).toBe('alpha');
    expect(spy.registry.size).toBe(1);
    expect(host.querySelector('[data-command-item]')?.id).toBe('by-id');
    expect(host.querySelector('input')?.getAttribute('aria-activedescendant')).toBe('by-id');

    // `forceId` alone: the same.
    await update(
      tree(
        <Command.Item value="beta" forceId="by-force">
          Beta
        </Command.Item>,
      ),
    );
    await settle();
    expect(spy.registry.getItem(itemId('by-force'))?.value).toBe('beta');
    expect(spy.registry.getItem(itemId('by-id'))).toBeUndefined();
    expect(host.querySelector('[data-command-item]')?.id).toBe('by-force');
    expect(host.querySelector('input')?.getAttribute('aria-activedescendant')).toBe('by-force');
    expect(libraryWarnings(warn)).toEqual([]);

    // Both given and different: the `id` wins, one warning, and a re-render does not warn again.
    const both = (
      <Command.Item value="gamma" id="wins" forceId="loses">
        Gamma
      </Command.Item>
    );
    await update(tree(both));
    await settle();
    expect(spy.registry.getItem(itemId('wins'))?.value).toBe('gamma');
    expect(spy.registry.getItem(itemId('loses'))).toBeUndefined();
    expect(host.querySelector('[data-command-item]')?.id).toBe('wins');
    expect(libraryWarnings(warn)).toHaveLength(1);
    expect(libraryWarnings(warn)[0]).toContain('forceId');
    await update(tree(both, 1));
    await settle();
    expect(libraryWarnings(warn)).toHaveLength(1);

    // Group: `id` is the registration id and stays on the group div.
    await update(
      <Command>
        <spy.Probe />
        <Command.List>
          <Command.Group heading="Letters" id="grp">
            <Command.Item value="delta">Delta</Command.Item>
          </Command.Group>
        </Command.List>
      </Command>,
    );
    await settle();
    expect(spy.registry.getGroup(groupId('grp'))?.heading).toBe('Letters');
    expect(host.querySelector('[data-command-group]')?.id).toBe('grp');
  });
});

/** Clicks `element` the way a pointer does and lets the machine process the selection. */
async function click(element: Element | null): Promise<void> {
  if (!element) throw new Error('nothing to click');
  await act(async () => {
    fireEvent.click(element);
  });
  await settle();
}

/** The item elements of `host`, in DOM order. */
const itemsOf = (host: HTMLElement): HTMLElement[] => [
  ...host.querySelectorAll<HTMLElement>('[data-command-item]'),
];

/** A ResizeObserver that reports a 400px box on observe: happy-dom lays nothing out, so the virtualizer sees no height without it. */
class SizedObserver {
  readonly #callback: ResizeObserverCallback;

  constructor(callback: ResizeObserverCallback) {
    this.#callback = callback;
  }

  observe(target: Element): void {
    this.#callback(
      [{ contentRect: { height: 400 }, target } as ResizeObserverEntry],
      this as unknown as ResizeObserver,
    );
  }

  unobserve(): void {}

  disconnect(): void {}
}

describe('Command.Item propsMerge', () => {
  it('RA-13: propsMerge compose calls the consumer onClick and still selects', async () => {
    const calls: string[] = [];
    const onSelect = vi.fn(() => calls.push('select'));
    const blocked = vi.fn();
    const host = await mount(
      <Command>
        <Command.Input />
        <Command.List>
          <Command.Item
            value="alpha"
            propsMerge="compose"
            onSelect={onSelect}
            onClick={(): number => calls.push('consumer')}
            onPointerMove={(): number => calls.push('move')}
            style={{ color: 'red' }}
          >
            Alpha
          </Command.Item>
          <Command.Item
            value="beta"
            propsMerge="compose"
            onSelect={blocked}
            onClick={(event: MouseEvent<HTMLDivElement>): void => event.preventDefault()}
            role="button"
            aria-selected={true}
            style={{ color: 'blue' }}
          >
            Beta
          </Command.Item>
        </Command.List>
      </Command>,
    );
    await settle();
    const [alpha, beta] = itemsOf(host);
    if (!alpha || !beta) throw new Error('items missing');

    // The consumer handler runs first, then the item selects.
    await click(alpha);
    expect(calls).toEqual(['consumer', 'select']);

    // preventDefault() in the consumer handler stops the selection.
    await click(beta);
    expect(blocked).not.toHaveBeenCalled();

    // The managed role and aria-selected win over the consumer's; the consumer style merges.
    expect(beta.getAttribute('role')).toBe('option');
    expect(beta.getAttribute('aria-selected')).toBe('false');
    expect(alpha.style.color).toBe('red');
    expect(beta.style.color).toBe('blue');

    // The consumer onPointerMove runs, and the item still activates.
    await act(async () => {
      fireEvent.pointerMove(beta);
    });
    await settle();
    expect(beta.getAttribute('aria-selected')).toBe('true');
    await act(async () => {
      fireEvent.pointerMove(alpha);
    });
    await settle();
    expect(calls).toContain('move');
    expect(alpha.getAttribute('aria-selected')).toBe('true');
  });

  it('RA-13: propsMerge override keeps the 1.x spread order', async () => {
    vi.stubGlobal('ResizeObserver', SizedObserver);
    const calls: string[] = [];
    const onSelect = vi.fn(() => calls.push('select'));
    const host = await mount(
      <Command>
        <Command.Input />
        <Command.List virtualize>
          <Command.Item
            value="alpha"
            propsMerge="override"
            onSelect={onSelect}
            onClick={(): number => calls.push('consumer')}
            style={{ color: 'red' }}
          >
            Alpha
          </Command.Item>
          <Command.Item value="beta" onSelect={onSelect}>
            Beta
          </Command.Item>
        </Command.List>
      </Command>,
    );
    await settle();
    const [alpha, beta] = itemsOf(host);
    if (!alpha || !beta) throw new Error('items missing');

    // A consumer onClick replaces the selection.
    await click(alpha);
    expect(calls).toEqual(['consumer']);
    expect(onSelect).not.toHaveBeenCalled();

    // A consumer style replaces the item's own (here the virtual position).
    expect(beta.getAttribute('style')).toContain('translate');
    expect(alpha.getAttribute('style')).not.toContain('translate');
    expect(alpha.style.color).toBe('red');
  });
});

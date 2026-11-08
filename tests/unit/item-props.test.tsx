// tests/unit/item-props.test.tsx
// Command.Item and Command.Group props (cluster C2): the `id` prop and its deprecated alias `forceId`.
// Helpers (`mount`, `update`, `settle`, `Spy`) are shared by the tests of this file.

import type { CommandMachine } from 'modern-cmdk';
import { groupId, itemId } from 'modern-cmdk';
import { Command, CommandStableContext } from 'modern-cmdk/react';
import type { ReactNode } from 'react';
import { act, use } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

let container: HTMLDivElement | undefined;
let root: Root | undefined;

afterEach(async () => {
  vi.restoreAllMocks();
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

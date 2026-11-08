// tests/unit/group-remount.test.tsx
// Command.Group renders one element tree whether or not any of its items match, so its children keep their identity
// across a no-match / match toggle: no remount, no UNREGISTER_ITEM / REGISTER_ITEM round trip.

import type { CommandMachine } from 'modern-cmdk';
import { Command, CommandStableContext } from 'modern-cmdk/react';
import type { ReactNode } from 'react';
import { act, use, useLayoutEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

let container: HTMLDivElement | undefined;
let root: Root | undefined;

afterEach(async () => {
  vi.restoreAllMocks();
  const current = root;
  if (current) {
    await act(async () => {
      current.unmount();
    });
  }
  container?.remove();
  root = undefined;
  container = undefined;
});

/** Runs the scheduler frames and effects that follow an interaction. */
const settle = (): Promise<void> =>
  act(async () => {
    await new Promise<void>((resolve) => setTimeout(resolve, 50));
  });

/** How many times `MountCounter` has mounted. */
let mounts = 0;

/** A group child that counts its mounts; a remount of the group's subtree mounts it again. */
function MountCounter(): null {
  useLayoutEffect(() => {
    mounts += 1;
  }, []);
  return null;
}

/** The machine the subtree holds, read from the stable context. */
let machine: CommandMachine | undefined;

function Probe(): null {
  machine = use(CommandStableContext)?.machine;
  return null;
}

describe('Command.Group', () => {
  it('RA-05: a group toggling between no match and match keeps its items mounted', async () => {
    mounts = 0;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    const current = root;
    const ui: ReactNode = (
      <Command>
        <Probe />
        <Command.Input />
        <Command.List>
          <Command.Group heading="Fruit">
            <MountCounter />
            <Command.Item value="apple">Apple</Command.Item>
          </Command.Group>
          <Command.Group heading="Other">
            <Command.Item value="banana">Banana</Command.Item>
          </Command.Group>
        </Command.List>
      </Command>
    );
    await act(async () => {
      current.render(ui);
    });
    await settle();
    const live = machine;
    if (!live) throw new Error('probe never rendered');
    const mountedAtStart = mounts;
    expect(container.querySelectorAll('[data-command-group]')).toHaveLength(2);

    const send = vi.spyOn(live, 'send');
    const search = async (query: string): Promise<void> => {
      await act(async () => {
        live.send({ type: 'SEARCH_CHANGE', query });
      });
      await settle();
    };

    // "ban" empties the Fruit group; clearing the query matches it again.
    await search('ban');
    expect(container.querySelector('[data-command-item][data-value="apple"]')).toBeNull();
    await search('');
    expect(container.querySelector('[data-command-item][data-value="apple"]')).not.toBeNull();
    await search('ban');
    await search('');

    // The toggles remount nothing, and the child mounted once from the start
    expect(mounts).toBe(mountedAtStart);
    expect(mounts).toBe(1);
    const registrations = send.mock.calls.filter(
      ([event]) => event.type === 'UNREGISTER_ITEM' || event.type === 'REGISTER_ITEM',
    );
    expect(registrations).toEqual([]);
  });
});

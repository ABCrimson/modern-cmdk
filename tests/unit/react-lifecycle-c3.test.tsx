// tests/unit/react-lifecycle-c3.test.tsx
// Cluster C3 additions to the <Command> root's lifecycle: the Activity re-activation that is
// pending when the held item is no longer registered (RA-79).

import type { CommandMachine, ItemId } from 'modern-cmdk';
import { itemId } from 'modern-cmdk';
import { Command, CommandStableContext } from 'modern-cmdk/react';
import type { ReactNode } from 'react';
import { Activity, act, use, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

/** The floor React (19.0.0) has no `Activity`; the tests that render it skip there. */
const itWithActivity = it.skipIf(Activity === undefined);

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

/** Renders `ui` into the mounted root, mounting it first when nothing is mounted. */
async function render(ui: ReactNode): Promise<void> {
  if (!root) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }
  const current = root;
  await act(async () => {
    current.render(ui);
  });
}

/** Runs the scheduler frames and effects that follow an interaction. */
const settle = (): Promise<void> =>
  act(async () => {
    await new Promise<void>((resolve) => setTimeout(resolve, 50));
  });

/** The machine the probe child last read from context. */
const held: { machine: CommandMachine | undefined } = { machine: undefined };

const Probe = (): null => {
  held.machine = use(CommandStableContext)?.machine;
  return null;
};

/** When armed, the next mount of `Poke` activates `fixed-a` from a passive effect. */
const poke = { armed: false };

const Poke = (): null => {
  useEffect(() => {
    if (!poke.armed) return;
    poke.armed = false;
    held.machine?.send({ type: 'ITEM_ACTIVATE', id: itemId('fixed-a') });
  }, []);
  return null;
};

describe('Activity re-activation of a held item (RA-79)', () => {
  const tree = (
    mode: 'visible' | 'hidden',
    values: readonly string[],
    onActiveChange: (id: ItemId | null) => void,
  ): ReactNode => (
    <Activity mode={mode}>
      <Command onActiveChange={onActiveChange}>
        <Probe />
        <Poke />
        <Command.Input />
        <Command.List>
          {values.map((value) => (
            <Command.Item key={value} value={value} forceId={value}>
              {value}
            </Command.Item>
          ))}
        </Command.List>
      </Command>
    </Activity>
  );

  itWithActivity(
    'RA-79: a held re-activation of a removed item does not swallow its later onActiveChange',
    async () => {
      const onActiveChange = vi.fn();
      await render(tree('visible', ['fixed-a'], onActiveChange));
      await settle();
      expect(held.machine?.getState().activeId).toBe('fixed-a');

      await render(tree('hidden', ['fixed-a'], onActiveChange));
      await settle();
      // The active item unmounts while the palette is hidden
      await render(tree('hidden', [], onActiveChange));
      await settle();
      await render(tree('visible', [], onActiveChange));
      await settle();
      // A show reports nothing
      expect(onActiveChange).not.toHaveBeenCalled();

      await render(tree('visible', ['fixed-a'], onActiveChange));
      await settle();
      await act(async () => {
        held.machine?.send({ type: 'ITEM_ACTIVATE', id: itemId('fixed-a') });
      });
      await settle();

      expect(onActiveChange.mock.calls).toEqual([['fixed-a']]);
    },
  );

  itWithActivity(
    'RA-79: a show that re-adds the held item and an activation of it in one batch report it once',
    async () => {
      const onActiveChange = vi.fn();
      await render(tree('visible', ['fixed-a'], onActiveChange));
      await settle();
      await render(tree('hidden', ['fixed-a'], onActiveChange));
      await settle();
      await render(tree('hidden', [], onActiveChange));
      await settle();
      expect(onActiveChange).not.toHaveBeenCalled();

      // The show and the item's re-mount commit together. Their sends (the item's registration,
      // then the setup's re-activation in the layout phase) wait in the machine's batch, and the
      // poke's passive effect queues the consumer's own activation of the item behind them in the
      // same commit, before the batch runs
      poke.armed = true;
      await render(tree('visible', ['fixed-a'], onActiveChange));
      await settle();

      expect(poke.armed).toBe(false);
      expect(held.machine?.getState().activeId).toBe('fixed-a');
      expect(onActiveChange.mock.calls).toEqual([['fixed-a']]);
    },
  );
});

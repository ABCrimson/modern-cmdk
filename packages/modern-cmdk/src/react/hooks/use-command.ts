// packages/modern-cmdk/src/react/hooks/use-command.ts
// Core hook — useSyncExternalStore (native React 19) and useId; the active item is the machine's own
// Isolated declarations: explicit return types on all exports
// Branded CommandRootId type for type-safe ID propagation

import type { CommandMachine, CommandState, ItemId } from 'modern-cmdk';
import { useCallback, useId, useMemo, useSyncExternalStore } from 'react';
import type { CommandRootId } from '../context.js';

/** What {@link useCommand} returns: the machine's state snapshot and the helpers that act on the machine. */
export interface UseCommandReturn {
  /** The machine's current state snapshot; the same object until the machine commits a change */
  readonly state: CommandState;
  /**
   * Always `false`: the active item is the machine's own, so no render is pending on it, and search updates run on the machine's scheduler tick, outside React.
   * @deprecated Read `state.loading` for the machine's loading state. Removed in 2.0.
   */
  readonly isPending: boolean;
  /** Queue a search query on the machine. Not a React update: Command.Input owns the urgent input value. */
  readonly updateSearch: (query: string) => void;
  /**
   * Sends `ITEM_ACTIVATE` for a non-null `id` and does nothing for `null`: no core event clears the active item.
   * @deprecated Send `ITEM_ACTIVATE` through the machine. Removed in 2.0.
   */
  readonly setOptimisticActiveId: (id: ItemId | null) => void;
  /** O(1) membership set for filtered items — used by Item component */
  readonly filteredIdSet: ReadonlySet<ItemId>;
  /** A stable id for this hook's caller, from React's `useId` */
  readonly id: CommandRootId;
}

/** Core hook that binds a CommandMachine to React via useSyncExternalStore; `state` is the machine's own snapshot. */
export function useCommand(machine: CommandMachine): UseCommandReturn {
  const id = useId() as CommandRootId;

  // Native useSyncExternalStore — machine.subscribe is already compatible (returns cleanup fn)
  const state: CommandState = useSyncExternalStore(
    machine.subscribe,
    machine.getState,
    machine.getState, // server snapshot (same — SSR safe)
  );

  // O(1) membership set — read directly from machine (already maintained in sync)
  // biome-ignore lint/correctness/useExhaustiveDependencies: state.filteredIds triggers re-read of machine's internal set
  const filteredIdSet: ReadonlySet<ItemId> = useMemo(
    () => machine.getFilteredIdSet(),
    [state.filteredIds, machine],
  );

  // ITEM_ACTIVATE is an event on the machine's scheduler like any other; null has no event, so it is a no-op.
  const setOptimisticActiveId = useCallback(
    (activeId: ItemId | null): void => {
      if (activeId !== null) machine.send({ type: 'ITEM_ACTIVATE', id: activeId });
    },
    [machine],
  );

  // machine.send only enqueues the event on the machine's scheduler (rAF in browsers); filtering
  // and the state update happen on that tick, outside React. A transition around it would wrap no
  // React update, so it is a plain call. The input's own value is urgent local state (Command.Input).
  const updateSearch = useCallback(
    (query: string): void => {
      machine.send({ type: 'SEARCH_CHANGE', query });
    },
    [machine],
  );

  return {
    state,
    isPending: false,
    updateSearch,
    setOptimisticActiveId,
    filteredIdSet,
    id,
  } satisfies UseCommandReturn;
}

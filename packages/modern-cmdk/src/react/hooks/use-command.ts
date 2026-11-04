'use client';

// packages/modern-cmdk/src/react/hooks/use-command.ts
// Core hook — useSyncExternalStore (native React 19), useTransition (optimistic active item only), useOptimistic, useId
// Isolated declarations: explicit return types on all exports
// Branded CommandRootId type for type-safe ID propagation

import {
  useCallback,
  useId,
  useMemo,
  useOptimistic,
  useSyncExternalStore,
  useTransition,
} from 'react';
import type { CommandMachine, CommandState, ItemId } from '../../core/index.js';
import type { CommandRootId } from '../context.js';

export interface UseCommandReturn {
  readonly state: CommandState;
  /** True while an optimistic active-item transition is in flight. Search updates never set it: the machine applies them on its own scheduler tick, outside React. */
  readonly isPending: boolean;
  /** Queue a search query on the machine. Not a React update: Command.Input owns the urgent input value. */
  readonly updateSearch: (query: string) => void;
  readonly setOptimisticActiveId: (id: ItemId | null) => void;
  /** O(1) membership set for filtered items — used by Item component */
  readonly filteredIdSet: ReadonlySet<ItemId>;
  readonly id: CommandRootId;
}

/** Core hook that binds a CommandMachine to React via useSyncExternalStore, useOptimistic, and a transition for optimistic active-item updates. */
export function useCommand(machine: CommandMachine): UseCommandReturn {
  const id = useId() as CommandRootId;
  const [isPending, startTransition] = useTransition();

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

  // Optimistic active item — instant visual feedback before filter completes
  const [optimisticActiveId, rawSetOptimisticActiveId] = useOptimistic<ItemId | null>(
    state.activeId,
  );

  // Wrap the optimistic setter in startTransition — React 19 requires useOptimistic
  // setters to be called inside a transition or action, not in plain event handlers
  const setOptimisticActiveId = useCallback(
    (id: ItemId | null): void => {
      startTransition(() => {
        rawSetOptimisticActiveId(id);
      });
    },
    [rawSetOptimisticActiveId],
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

  // Build merged state with optimistic activeId overlay
  const mergedState: CommandState =
    optimisticActiveId !== state.activeId ? { ...state, activeId: optimisticActiveId } : state;

  return {
    state: mergedState,
    isPending,
    updateSearch,
    setOptimisticActiveId,
    filteredIdSet,
    id,
  } satisfies UseCommandReturn;
}

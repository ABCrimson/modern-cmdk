'use client';

// packages/command-react/src/hooks/use-command.ts
// Core hook — useSyncExternalStore (native React 19), useTransition, useOptimistic, useId
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
  readonly isPending: boolean;
  readonly updateSearch: (query: string) => void;
  readonly setOptimisticActiveId: (id: ItemId | null) => void;
  /** O(1) membership set for filtered items — used by Item component */
  readonly filteredIdSet: ReadonlySet<ItemId>;
  readonly id: CommandRootId;
}

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
  const filteredIdSet: ReadonlySet<ItemId> = useMemo(
    () => machine.getFilteredIdSet(),
    [state.filteredIds, machine],
  );

  // Optimistic active item — instant visual feedback before filter completes
  const [optimisticActiveId, setOptimisticActiveId] = useOptimistic<ItemId | null>(state.activeId);

  // Search wrapped in transition — input stays responsive during re-render
  const updateSearch = useCallback(
    (query: string): void => {
      startTransition(() => {
        machine.send({ type: 'SEARCH_CHANGE', query });
      });
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

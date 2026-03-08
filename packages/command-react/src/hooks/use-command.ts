'use client';

// packages/command-react/src/hooks/use-command.ts
// Core hook — useSyncExternalStore (native React 19), useTransition, useOptimistic, useId
// Isolated declarations: explicit return types on all exports
// Branded CommandRootId type for type-safe ID propagation

import type { CommandMachine, CommandState, ItemId } from '@crimson_dev/command';
import { useCallback, useId, useOptimistic, useSyncExternalStore, useTransition } from 'react';
import type { CommandRootId } from '../context.js';

export interface UseCommandReturn {
  readonly state: CommandState;
  readonly isPending: boolean;
  readonly updateSearch: (query: string) => void;
  readonly setOptimisticActiveId: (id: ItemId | null) => void;
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
    id,
  } satisfies UseCommandReturn;
}

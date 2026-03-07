'use client';

// packages/command-react/src/hooks/use-command.ts
// Core hook — useSyncExternalStore (native React 19), useTransition, useOptimistic, useId

import {
  useCallback,
  useId,
  useOptimistic,
  useSyncExternalStore,
  useTransition,
} from 'react';
import type { CommandMachine, CommandState, ItemId } from '@crimson_dev/command';

export interface UseCommandReturn {
  readonly state: CommandState;
  readonly isPending: boolean;
  readonly updateSearch: (query: string) => void;
  readonly setOptimisticActiveId: (id: ItemId | null) => void;
  readonly id: string;
}

export function useCommand(machine: CommandMachine): UseCommandReturn {
  const id = useId();
  const [isPending, startTransition] = useTransition();

  // Native useSyncExternalStore — machine.subscribe is already compatible (returns cleanup fn)
  const state = useSyncExternalStore(
    machine.subscribe,
    machine.getState,
    machine.getState, // server snapshot (same — SSR safe)
  );

  // Optimistic active item — instant visual feedback before filter completes
  const [optimisticActiveId, setOptimisticActiveId] = useOptimistic(state.activeId);

  // Search wrapped in transition — input stays responsive during re-render
  const updateSearch = useCallback(
    (query: string) => {
      startTransition(() => {
        machine.send({ type: 'SEARCH_CHANGE', query });
      });
    },
    [machine, startTransition],
  );

  return {
    state: { ...state, activeId: optimisticActiveId },
    isPending,
    updateSearch,
    setOptimisticActiveId,
    id,
  } as const;
}

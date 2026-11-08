// packages/modern-cmdk/src/react/hooks/use-command-state.ts
// Derived state selectors — useSyncExternalStore for proper render optimization
// getSnapshot is memoized on [machine, selector] and caches its result by machine-state identity,
// so a selector that returns a fresh object still yields one value per machine state
// Isolated declarations: explicit return types on all exports

import type { CommandState } from 'modern-cmdk';
import { useMemo, useSyncExternalStore } from 'react';
import { useStableContext } from '../context.js';

/** Get the full command state with proper subscription */
export function useCommandState(): CommandState;
/** Get a selected slice of command state — re-renders when the selected value changes (Object.is); the selector runs once per machine state, so a selector returning a fresh object re-renders once per state change */
export function useCommandState<T>(selector: (state: CommandState) => T): T;
export function useCommandState<T>(selector?: (state: CommandState) => T): CommandState | T {
  const stable = useStableContext('useCommandState');
  const { machine } = stable;

  // The machine returns the same state object between ticks and a new one per tick, so the state object is the cache key.
  const getSnapshot = useMemo((): (() => CommandState | T) => {
    let cachedState: CommandState | null = null;
    let cachedValue: CommandState | T;
    return (): CommandState | T => {
      const state = machine.getState();
      if (state !== cachedState) {
        cachedState = state;
        cachedValue = selector ? selector(state) : state;
      }
      return cachedValue;
    };
  }, [machine, selector]);

  return useSyncExternalStore(machine.subscribe, getSnapshot, getSnapshot);
}

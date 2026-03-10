'use client';

// packages/command-react/src/hooks/use-command-state.ts
// Derived state selectors — useSyncExternalStore for proper render optimization
// Selector stabilized via ref to prevent unnecessary getSnapshot recreation
// Isolated declarations: explicit return types on all exports

import { use, useCallback, useRef, useSyncExternalStore } from 'react';
import type { CommandState } from '../../core/index.js';
import { CommandStableContext } from '../context.js';

/** Get the full command state with proper subscription */
export function useCommandState(): CommandState;
/** Get a selected slice of command state — only re-renders when selected value changes */
export function useCommandState<T>(selector: (state: CommandState) => T): T;
export function useCommandState<T>(selector?: (state: CommandState) => T): CommandState | T {
  const stable = use(CommandStableContext);
  if (!stable) {
    throw new Error('useCommandState must be used within a <Command> component');
  }

  // Stabilize selector via ref — inline arrow functions won't cause getSnapshot recreation
  const selectorRef = useRef(selector);
  selectorRef.current = selector;

  const getSnapshot = useCallback(
    (): CommandState | T =>
      selectorRef.current
        ? selectorRef.current(stable.machine.getState())
        : stable.machine.getState(),
    [stable.machine],
  );

  return useSyncExternalStore(stable.machine.subscribe, getSnapshot, getSnapshot);
}

'use client';

// packages/command-react/src/hooks/use-command-state.ts
// Derived state selectors — useSyncExternalStore for proper render optimization
// Isolated declarations: explicit return types on all exports

import type { CommandState } from '@crimson_dev/command';
import { use, useCallback, useSyncExternalStore } from 'react';
import { CommandContext } from '../context.js';

/** Get the full command state with proper subscription */
export function useCommandState(): CommandState;
/** Get a selected slice of command state — only re-renders when selected value changes */
export function useCommandState<T>(selector: (state: CommandState) => T): T;
export function useCommandState<T>(selector?: (state: CommandState) => T): CommandState | T {
  const ctx = use(CommandContext);
  if (!ctx) {
    throw new Error('useCommandState must be used within a <Command> component');
  }

  const getSnapshot = useCallback(
    (): CommandState | T => (selector ? selector(ctx.machine.getState()) : ctx.machine.getState()),
    [ctx.machine, selector],
  );

  return useSyncExternalStore(ctx.machine.subscribe, getSnapshot, getSnapshot);
}

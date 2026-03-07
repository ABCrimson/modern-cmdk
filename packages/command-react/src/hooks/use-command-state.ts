'use client';

// packages/command-react/src/hooks/use-command-state.ts
// Derived state selectors — React Compiler auto-memoizes

import type { CommandState } from '@crimson_dev/command';
import { use } from 'react';
import { CommandContext } from '../context.js';

/** Get the full command state from context */
export function useCommandState(): CommandState;
/** Get a selected slice of command state */
export function useCommandState<T>(selector: (state: CommandState) => T): T;
export function useCommandState<T>(selector?: (state: CommandState) => T): CommandState | T {
  const ctx = use(CommandContext);
  if (!ctx) {
    throw new Error('useCommandState must be used within a <Command> component');
  }

  return selector ? selector(ctx.state) : ctx.state;
}

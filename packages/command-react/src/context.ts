'use client';

// packages/command-react/src/context.ts
// React context definitions — use() for consuming in Suspense boundaries

import { createContext } from 'react';
import type { CommandMachine, CommandState, ItemId } from '@crimson_dev/command';

export interface CommandContextValue {
  readonly machine: CommandMachine;
  readonly state: CommandState;
  readonly isPending: boolean;
  readonly updateSearch: (query: string) => void;
  readonly setOptimisticActiveId: (id: ItemId | null) => void;
  readonly rootId: string;
  readonly listId: string;
  readonly inputId: string;
  readonly label: string;
}

export const CommandContext = createContext<CommandContextValue | null>(null);
CommandContext.displayName = 'CommandContext';

export interface CommandGroupContextValue {
  readonly groupId: string;
  readonly headingId: string;
}

export const CommandGroupContext = createContext<CommandGroupContextValue | null>(null);
CommandGroupContext.displayName = 'CommandGroupContext';

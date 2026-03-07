'use client';

// packages/command-react/src/context.ts
// React context definitions — use() for consuming in Suspense boundaries

import type { CommandMachine, CommandState, ItemId } from '@crimson_dev/command';
import { type Context, createContext } from 'react';

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

export const CommandContext: Context<CommandContextValue | null> =
  createContext<CommandContextValue | null>(null);
CommandContext.displayName = 'CommandContext';

export interface CommandGroupContextValue {
  readonly groupId: string;
  readonly headingId: string;
}

export const CommandGroupContext: Context<CommandGroupContextValue | null> =
  createContext<CommandGroupContextValue | null>(null);
CommandGroupContext.displayName = 'CommandGroupContext';

'use client';

// packages/command-react/src/context.ts
// React context definitions — use() for consuming in Suspense boundaries
// Branded types for IDs, isolated declarations with explicit return types

import type { CommandMachine, CommandState, ItemId } from '@crimson_dev/command';
import { type Context, createContext } from 'react';

/** Branded newtype for the root instance ID */
export type CommandRootId = string & { readonly __brand: 'CommandRootId' };

export interface CommandContextValue {
  readonly machine: CommandMachine;
  readonly state: CommandState;
  readonly isPending: boolean;
  readonly updateSearch: (query: string) => void;
  readonly setOptimisticActiveId: (id: ItemId | null) => void;
  /** O(1) membership check for filtered items — avoids O(n) Array.includes per item */
  readonly filteredIdSet: ReadonlySet<ItemId>;
  readonly rootId: CommandRootId;
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

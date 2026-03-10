'use client';

// packages/command-react/src/context.ts
// React context definitions — use() for consuming in Suspense boundaries
// Split into stable + state contexts to prevent unnecessary re-renders
// Branded types for IDs, isolated declarations with explicit return types

import { type Context, createContext, type RefObject } from 'react';
import type { CommandMachine, CommandState, ItemId } from '../core/index.js';

/** Branded newtype for the root instance ID */
export type CommandRootId = string & { readonly __brand: 'CommandRootId' };

/** Full context value — union of stable + state for convenience */
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

/** Stable context — values that never change after mount */
export interface CommandStableContextValue {
  readonly machine: CommandMachine;
  readonly rootId: CommandRootId;
  readonly listId: string;
  readonly inputId: string;
  readonly label: string;
  readonly updateSearch: (query: string) => void;
  readonly setOptimisticActiveId: (id: ItemId | null) => void;
}

/** State context — values that change on every search/navigation */
export interface CommandStateContextValue {
  readonly state: CommandState;
  readonly isPending: boolean;
  readonly filteredIdSet: ReadonlySet<ItemId>;
}

export const CommandStableContext: Context<CommandStableContextValue | null> =
  createContext<CommandStableContextValue | null>(null);
CommandStableContext.displayName = 'CommandStableContext';

export const CommandStateContext: Context<CommandStateContextValue | null> =
  createContext<CommandStateContextValue | null>(null);
CommandStateContext.displayName = 'CommandStateContext';

export interface CommandGroupContextValue {
  readonly groupId: string;
  readonly headingId: string;
}

export const CommandGroupContext: Context<CommandGroupContextValue | null> =
  createContext<CommandGroupContextValue | null>(null);
CommandGroupContext.displayName = 'CommandGroupContext';

/** Context for the status container rendered outside the listbox — used by Command.Empty */
export const CommandListStatusContext: Context<RefObject<HTMLDivElement | null> | null> =
  createContext<RefObject<HTMLDivElement | null> | null>(null);
CommandListStatusContext.displayName = 'CommandListStatusContext';

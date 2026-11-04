// tests/dist/cross-entry.types.ts
// Type-only: the core types the React entry exposes are the core entry's own types
// (one declaration, not a structurally unequal copy with its own unique-symbol brand).
// Checked by `tsc -p tests/dist/tsconfig.json`, which maps both entries to the built .d.mts.

import type { CommandItem, CommandMachine, ItemId } from 'modern-cmdk';
import type { CommandContextValue, useRegisterItem } from 'modern-cmdk/react';

type ReactItemId = ReturnType<typeof useRegisterItem>;

declare const coreId: ItemId;
declare const reactId: ReactItemId;
export const coreToReact: ReactItemId = coreId;
export const reactToCore: ItemId = reactId;

// A core machine is accepted where the React context value holds one.
declare const machine: CommandMachine;
declare const contextValue: CommandContextValue;
export const machineToContext: CommandContextValue['machine'] = machine;
export const contextToMachine: CommandMachine = contextValue.machine;

declare const item: CommandItem;
export const itemKeepsId: ItemId = item.id;

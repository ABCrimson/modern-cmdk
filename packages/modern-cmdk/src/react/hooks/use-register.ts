'use client';

// packages/command-react/src/hooks/use-register.ts
// Item/group registration — useLayoutEffect for registration before paint
// Isolated declarations: explicit return types on all exports
// Branded types: ItemId / GroupId from core

import { use, useId, useLayoutEffect } from 'react';
import type { CommandGroup, CommandItem, GroupId, ItemId } from '../../core/index.js';
import { groupId, itemId } from '../../core/index.js';
import { CommandStableContext } from '../context.js';

/** Options for item registration */
export interface RegisterItemOptions {
  readonly keywords?: readonly string[];
  readonly groupId?: string;
  readonly shortcut?: string;
  readonly disabled?: boolean;
  readonly onSelect?: () => void;
  readonly data?: Readonly<Record<string, unknown>>;
  readonly forceId?: string;
}

/** Register a command item with the machine — auto-deregisters on unmount */
export function useRegisterItem(value: string, options?: RegisterItemOptions): ItemId {
  const stable = use(CommandStableContext);
  if (!stable) {
    throw new Error('useRegisterItem must be used within a <Command> component');
  }

  const generatedId = useId();
  const id: ItemId = itemId(options?.forceId ?? generatedId);

  // useLayoutEffect ensures registration happens before paint
  useLayoutEffect(() => {
    const item: CommandItem = {
      id,
      value,
      keywords: options?.keywords,
      groupId: options?.groupId ? groupId(options.groupId) : undefined,
      shortcut: options?.shortcut,
      disabled: options?.disabled,
      onSelect: options?.onSelect,
      data: options?.data,
    };

    stable.machine.send({ type: 'REGISTER_ITEM', item });

    return (): void => {
      stable.machine.send({ type: 'UNREGISTER_ITEM', id });
    };
  }, [
    stable.machine,
    id,
    value,
    options?.groupId,
    options?.data,
    options?.disabled,
    options?.keywords,
    options?.onSelect,
    options?.shortcut,
  ]);

  return id;
}

/** Options for group registration */
export interface RegisterGroupOptions {
  readonly priority?: number;
  readonly forceId?: string;
}

/** Register a command group with the machine — auto-deregisters on unmount */
export function useRegisterGroup(heading?: string, options?: RegisterGroupOptions): GroupId {
  const stable = use(CommandStableContext);
  if (!stable) {
    throw new Error('useRegisterGroup must be used within a <Command> component');
  }

  const generatedId = useId();
  const id: GroupId = groupId(options?.forceId ?? generatedId);

  useLayoutEffect(() => {
    const group: CommandGroup = {
      id,
      heading,
      priority: options?.priority,
    };

    stable.machine.send({ type: 'REGISTER_GROUP', group });

    return (): void => {
      stable.machine.send({ type: 'UNREGISTER_GROUP', id });
    };
  }, [stable.machine, id, heading, options?.priority]);

  return id;
}

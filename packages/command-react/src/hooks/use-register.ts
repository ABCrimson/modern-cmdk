'use client';

// packages/command-react/src/hooks/use-register.ts
// Item/group registration — useInsertionEffect for paint-before-commit

import type { CommandGroup, CommandItem, GroupId, ItemId } from '@crimson_dev/command';
import { groupId, itemId } from '@crimson_dev/command';
import { use, useId, useInsertionEffect } from 'react';
import { CommandContext } from '../context.js';

/** Register a command item with the machine — auto-deregisters on unmount */
export function useRegisterItem(
  value: string,
  options?: {
    readonly keywords?: readonly string[];
    readonly groupId?: string;
    readonly shortcut?: string;
    readonly disabled?: boolean;
    readonly onSelect?: () => void;
    readonly data?: Readonly<Record<string, unknown>>;
    readonly forceId?: string;
  },
): ItemId {
  const ctx = use(CommandContext);
  if (!ctx) {
    throw new Error('useRegisterItem must be used within a <Command> component');
  }

  const generatedId = useId();
  const id = itemId(options?.forceId ?? generatedId);

  // useInsertionEffect ensures registration happens before paint
  useInsertionEffect(() => {
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

    ctx.machine.send({ type: 'REGISTER_ITEM', item });

    return () => {
      ctx.machine.send({ type: 'UNREGISTER_ITEM', id });
    };
  }, [
    ctx.machine,
    id,
    value,
    options.groupId,
    options?.data,
    options?.disabled,
    options?.keywords,
    options?.onSelect,
    options?.shortcut,
  ]);

  return id;
}

/** Register a command group with the machine — auto-deregisters on unmount */
export function useRegisterGroup(
  heading?: string,
  options?: { readonly priority?: number; readonly forceId?: string },
): GroupId {
  const ctx = use(CommandContext);
  if (!ctx) {
    throw new Error('useRegisterGroup must be used within a <Command> component');
  }

  const generatedId = useId();
  const id = groupId(options?.forceId ?? generatedId);

  useInsertionEffect(() => {
    const group: CommandGroup = {
      id,
      heading,
      priority: options?.priority,
    };

    ctx.machine.send({ type: 'REGISTER_GROUP', group });

    return () => {
      ctx.machine.send({ type: 'UNREGISTER_GROUP', id });
    };
  }, [ctx.machine, id, heading, options?.priority]);

  return id;
}

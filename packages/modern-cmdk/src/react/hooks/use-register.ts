// packages/modern-cmdk/src/react/hooks/use-register.ts
// Item/group registration — useLayoutEffect for registration before paint
// Isolated declarations: explicit return types on all exports
// Branded types: ItemId / GroupId from core

import type { CommandGroup, CommandItem, GroupId, ItemId } from 'modern-cmdk';
import { groupId, itemId } from 'modern-cmdk';
import { use, useId, useLayoutEffect, useRef } from 'react';
import { CommandAsyncItemsContext } from '../async-items.js';
import { useStableContext } from '../context.js';
import { dev } from '../env.js';

// Module-scoped declaration: no @types/node needed, and nothing global leaks.
declare const process: { readonly env: { readonly NODE_ENV?: string } };

/** Set once the `id` / `forceId` conflict warning has fired, so it fires once per page load. */
let warnedIdConflict = false;

/** Set once the missing-id warning for items inside AsyncItems has fired. */
let warnedAsyncWithoutId = false;

/** `id ?? forceId ?? generated`; in development, warns once when `id` and `forceId` are both given and differ. */
function resolveId(id: string | undefined, forceId: string | undefined, generated: string): string {
  if (dev && process.env.NODE_ENV !== 'production') {
    if (id !== undefined && forceId !== undefined && id !== forceId && !warnedIdConflict) {
      warnedIdConflict = true;
      // biome-ignore lint/suspicious/noConsole: development-only misuse diagnostic, gated on NODE_ENV
      console.warn(
        `[modern-cmdk] \`id\` ("${id}") and \`forceId\` ("${forceId}") are both set and differ; \`id\` is used. \`forceId\` is deprecated: pass only \`id\`.`,
      );
    }
  }
  return id ?? forceId ?? generated;
}

/** Options for item registration */
export interface RegisterItemOptions {
  readonly keywords?: readonly string[];
  readonly groupId?: string;
  readonly shortcut?: string;
  readonly disabled?: boolean;
  readonly onSelect?: () => void;
  readonly data?: Readonly<Record<string, unknown>>;
  /** The registration id; defaults to a `useId` id. Wins over the deprecated `forceId`. */
  readonly id?: string | undefined;
  /** @deprecated Use `id`. Removed in 2.0. */
  readonly forceId?: string;
}

/** Register a command item with the machine — auto-deregisters on unmount */
export function useRegisterItem(value: string, options?: RegisterItemOptions): ItemId {
  const stable = useStableContext('useRegisterItem');

  const generatedId = useId();
  const id: ItemId = itemId(resolveId(options?.id, options?.forceId, generatedId));

  // The batch of an enclosing Command.AsyncItems, or null
  const batch = use(CommandAsyncItemsContext);
  if (dev && process.env.NODE_ENV !== 'production') {
    if (
      batch !== null &&
      options?.id === undefined &&
      options?.forceId === undefined &&
      !warnedAsyncWithoutId
    ) {
      warnedAsyncWithoutId = true;
      // biome-ignore lint/suspicious/noConsole: development-only misuse diagnostic, gated on NODE_ENV
      console.warn(
        '[modern-cmdk] An item inside Command.AsyncItems has no `id`: it registers under a generated id, so the loaded item and the rendered item become two entries. Pass `id={item.id}` to Command.Item (or `id` to useRegisterItem).',
      );
    }
  }

  // Stabilize onSelect via ref — inline arrow functions won't cause re-registration
  const onSelectRef = useRef(options?.onSelect);
  onSelectRef.current = options?.onSelect;

  // Stabilize data via ref — inline objects won't cause re-registration, and the item reads the latest one
  const dataRef = useRef(options?.data);
  dataRef.current = options?.data;

  // Stable dep for keywords — join to string for identity comparison
  const keywordsDep = options?.keywords?.join('\x00');

  // Mounted and registered: the first effect unregisters on unmount or a change of machine or id,
  // the second registers on mount and then updates the item in place (position kept)
  const registeredRef = useRef(false);
  useLayoutEffect(
    () => (): void => {
      registeredRef.current = false;
      stable.machine.send({ type: 'UNREGISTER_ITEM', id });
    },
    [stable.machine, id],
  );

  // useLayoutEffect ensures registration happens before paint. A new AsyncItems batch is a dependency: the old
  // batch's cleanup unregistered this id, so the item sends its entry again after the new batch's ITEMS_LOADED.
  // biome-ignore lint/correctness/useExhaustiveDependencies: keywordsDep is a derived string for stable identity; options.keywords is read via ref-like pattern
  useLayoutEffect(() => {
    const item: CommandItem = {
      id,
      value,
      keywords: options?.keywords,
      groupId: options?.groupId ? groupId(options.groupId) : undefined,
      shortcut: options?.shortcut,
      disabled: options?.disabled,
      onSelect: (): void => onSelectRef.current?.(),
      // A getter over the ref: a custom filter reads the latest data object without a re-registration
      get data(): Readonly<Record<string, unknown>> | undefined {
        return dataRef.current;
      },
    };

    stable.machine.send({ type: registeredRef.current ? 'UPDATE_ITEM' : 'REGISTER_ITEM', item });
    registeredRef.current = true;
  }, [
    stable.machine,
    id,
    value,
    options?.groupId,
    options?.disabled,
    keywordsDep,
    options?.shortcut,
    batch,
  ]);

  return id;
}

/** Options for group registration */
export interface RegisterGroupOptions {
  readonly priority?: number;
  /** The registration id; defaults to a `useId` id. Wins over the deprecated `forceId`. */
  readonly id?: string | undefined;
  /** @deprecated Use `id`. Removed in 2.0. */
  readonly forceId?: string;
}

/** Register a command group with the machine — auto-deregisters on unmount */
export function useRegisterGroup(heading?: string, options?: RegisterGroupOptions): GroupId {
  const stable = useStableContext('useRegisterGroup');

  const generatedId = useId();
  const id: GroupId = groupId(resolveId(options?.id, options?.forceId, generatedId));

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

'use client';

// packages/command-react/src/item.tsx
// <Command.Item> — ref as prop (no forwardRef), useId for ARIA
// React 19: use() for context
// Isolated declarations: explicit return types on all exports

import type { ComponentPropsWithRef, ReactNode } from 'react';
import { use, useCallback, useRef } from 'react';
import { CommandGroupContext, useStableContext, useStateContext } from './context.js';
import { useRegisterItem } from './hooks/use-register.js';

export interface CommandItemProps extends Omit<ComponentPropsWithRef<'div'>, 'onSelect' | 'value'> {
  readonly value: string;
  readonly keywords?: readonly string[];
  readonly onSelect?: () => void;
  readonly disabled?: boolean;
  readonly shortcut?: string;
  readonly forceId?: string;
}

/** Individual selectable item in the command list with keyboard and pointer activation. */
export function CommandItem({
  ref,
  children,
  value,
  keywords,
  onSelect,
  disabled = false,
  shortcut,
  forceId,
  ...props
}: CommandItemProps): ReactNode {
  const stable = useStableContext('Command.Item');
  const stateCtx = useStateContext('Command.Item');

  // Read group context — items inside a <Command.Group> auto-inherit groupId
  const groupCtx = use(CommandGroupContext);

  const id = useRegisterItem(value, {
    ...(keywords !== undefined && { keywords }),
    ...(shortcut !== undefined && { shortcut }),
    disabled,
    ...(onSelect !== undefined && { onSelect }),
    ...(forceId !== undefined && { forceId }),
    ...(groupCtx !== null && { groupId: groupCtx.groupId }),
  });

  const isActive: boolean = stateCtx.state.activeId === id;
  // O(1) Set.has instead of O(n) Array.includes — critical for large lists
  const isFiltered: boolean = stateCtx.filteredIdSet.has(id);

  const handleSelect = useCallback((): void => {
    if (!disabled) {
      stable.machine.send({ type: 'ITEM_SELECT', id });
    }
  }, [stable.machine, id, disabled]);

  // Use ref for activeId to avoid re-creating callback on every active change
  const activeIdRef = useRef(stateCtx.state.activeId);
  activeIdRef.current = stateCtx.state.activeId;

  const handlePointerMove = useCallback((): void => {
    if (!disabled && activeIdRef.current !== id) {
      stable.setOptimisticActiveId(id);
      stable.machine.send({ type: 'ITEM_ACTIVATE', id });
    }
  }, [stable.machine, stable.setOptimisticActiveId, id, disabled]);

  if (!isFiltered) return null;

  return (
    <div
      ref={ref}
      data-command-item=""
      data-active={isActive ? '' : undefined}
      data-disabled={disabled ? '' : undefined}
      data-value={value}
      id={id}
      role="option"
      aria-selected={isActive}
      aria-disabled={disabled || undefined}
      aria-keyshortcuts={shortcut ?? undefined}
      onClick={handleSelect}
      onPointerMove={handlePointerMove}
      {...props}
    >
      {children}
    </div>
  );
}

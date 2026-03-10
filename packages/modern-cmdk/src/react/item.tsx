'use client';

// packages/command-react/src/item.tsx
// <Command.Item> — ref as prop (no forwardRef), useId for ARIA
// React 19: use() for context
// Isolated declarations: explicit return types on all exports

import type { ComponentPropsWithRef, ReactNode } from 'react';
import { use, useCallback, useRef } from 'react';
import { CommandStableContext, CommandStateContext } from './context.js';
import { useRegisterItem } from './hooks/use-register.js';

export interface CommandItemProps extends Omit<ComponentPropsWithRef<'div'>, 'onSelect' | 'value'> {
  readonly value: string;
  readonly keywords?: readonly string[];
  readonly onSelect?: () => void;
  readonly disabled?: boolean;
  readonly shortcut?: string;
  readonly forceId?: string;
}

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
  const stable = use(CommandStableContext);
  if (!stable) {
    throw new Error('Command.Item must be used within a <Command> component');
  }
  const stateCtx = use(CommandStateContext);
  if (!stateCtx) {
    throw new Error('Command.Item must be used within a <Command> component');
  }

  const id = useRegisterItem(value, {
    ...(keywords !== undefined && { keywords }),
    ...(shortcut !== undefined && { shortcut }),
    disabled,
    ...(onSelect !== undefined && { onSelect }),
    ...(forceId !== undefined && { forceId }),
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

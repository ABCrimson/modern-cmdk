'use client';

// packages/command-react/src/item.tsx
// <Command.Item> — ref as prop (no forwardRef), useId for ARIA
// React 19: use() for context
// Isolated declarations: explicit return types on all exports

import type { ComponentPropsWithRef, ReactNode } from 'react';
import { use, useCallback } from 'react';
import { CommandContext } from './context.js';
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
  const ctx = use(CommandContext);
  if (!ctx) {
    throw new Error('Command.Item must be used within a <Command> component');
  }

  const id = useRegisterItem(value, {
    keywords,
    shortcut,
    disabled,
    onSelect,
    forceId,
  });

  const isActive: boolean = ctx.state.activeId === id;
  const isFiltered: boolean = ctx.state.filteredIds.includes(id);

  const handleSelect = useCallback((): void => {
    if (!disabled) {
      ctx.machine.send({ type: 'ITEM_SELECT', id });
    }
  }, [ctx.machine, id, disabled]);

  const handlePointerMove = useCallback((): void => {
    if (!disabled && ctx.state.activeId !== id) {
      ctx.setOptimisticActiveId(id);
      ctx.machine.send({ type: 'ITEM_ACTIVATE', id });
    }
  }, [ctx.machine, ctx.setOptimisticActiveId, ctx.state.activeId, id, disabled]);

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

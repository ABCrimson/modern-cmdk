'use client';

// packages/command-react/src/input.tsx
// <Command.Input> — stable callbacks, ARIA combobox role
// React 19: use() for context, ref as prop (no forwardRef)
// Isolated declarations: explicit return types on all exports

import type { ComponentPropsWithRef, ReactNode } from 'react';
import { use, useCallback } from 'react';
import { CommandStableContext, CommandStateContext } from './context.js';

export interface CommandInputProps
  extends Omit<ComponentPropsWithRef<'input'>, 'value' | 'onChange' | 'type' | 'role'> {
  readonly onValueChange?: (value: string) => void;
}

export function CommandInput({
  ref,
  placeholder = 'Search...',
  onValueChange,
  ...props
}: CommandInputProps): ReactNode {
  const stable = use(CommandStableContext);
  if (!stable) {
    throw new Error('Command.Input must be used within a <Command> component');
  }
  const stateCtx = use(CommandStateContext);
  if (!stateCtx) {
    throw new Error('Command.Input must be used within a <Command> component');
  }

  const handleChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>): void => {
      const { value } = event.target;
      stable.updateSearch(value);
      onValueChange?.(value);
    },
    [stable.updateSearch, onValueChange],
  );

  return (
    <input
      ref={ref}
      data-command-input=""
      type="text"
      role="combobox"
      aria-expanded={stateCtx.state.filteredCount > 0}
      aria-controls={stable.listId}
      aria-activedescendant={stateCtx.state.activeId ?? undefined}
      aria-autocomplete="list"
      aria-label={stable.label}
      id={stable.inputId}
      autoComplete="off"
      autoCorrect="off"
      spellCheck={false}
      placeholder={placeholder}
      value={stateCtx.state.search}
      onChange={handleChange}
      {...props}
    />
  );
}

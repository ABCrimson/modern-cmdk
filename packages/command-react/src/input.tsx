'use client';

// packages/command-react/src/input.tsx
// <Command.Input> — stable callbacks, ARIA combobox role

import type { ComponentPropsWithRef, ReactNode } from 'react';
import { use, useCallback } from 'react';
import { CommandContext } from './context.js';

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
  const ctx = use(CommandContext);
  if (!ctx) {
    throw new Error('Command.Input must be used within a <Command> component');
  }

  const handleChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const value = event.target.value;
      ctx.updateSearch(value);
      onValueChange?.(value);
    },
    [ctx.updateSearch, onValueChange],
  );

  return (
    <input
      ref={ref}
      data-command-input=""
      type="text"
      role="combobox"
      aria-expanded={ctx.state.filteredCount > 0}
      aria-controls={ctx.listId}
      aria-activedescendant={ctx.state.activeId ?? undefined}
      aria-autocomplete="list"
      aria-label={ctx.label}
      id={ctx.inputId}
      autoComplete="off"
      autoCorrect="off"
      spellCheck={false}
      placeholder={placeholder}
      value={ctx.state.search}
      onChange={handleChange}
      {...props}
    />
  );
}

'use client';

// packages/command-react/src/input.tsx
// <Command.Input> — stable callbacks, ARIA combobox role
// React 19: use() for context, ref as prop (no forwardRef)
// Isolated declarations: explicit return types on all exports

import type { ComponentPropsWithRef, ReactNode } from 'react';
import { useCallback } from 'react';
import { useStableContext, useStateContext } from './context.js';

export interface CommandInputProps
  extends Omit<ComponentPropsWithRef<'input'>, 'value' | 'onChange' | 'type' | 'role'> {
  readonly onValueChange?: (value: string) => void;
}

/** Combobox input that drives the command palette search state. */
export function CommandInput({
  ref,
  placeholder = 'Search...',
  onValueChange,
  ...props
}: CommandInputProps): ReactNode {
  const stable = useStableContext('Command.Input');
  const stateCtx = useStateContext('Command.Input');

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
      aria-expanded={true}
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

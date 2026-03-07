'use client';

// packages/command-react/src/empty.tsx
// <Command.Empty> — role="status", aria-live="polite"

import type { ComponentPropsWithRef, ReactNode } from 'react';
import { use } from 'react';
import { CommandContext } from './context.js';

export interface CommandEmptyProps extends ComponentPropsWithRef<'div'> {}

export function CommandEmpty({ ref, children, ...props }: CommandEmptyProps): ReactNode {
  const ctx = use(CommandContext);
  if (!ctx) {
    throw new Error('Command.Empty must be used within a <Command> component');
  }

  // Only show when there's a search query but no results
  if (ctx.state.filteredCount > 0 || ctx.state.loading) return null;

  return (
    <div
      ref={ref}
      data-command-empty=""
      role="status"
      aria-live="polite"
      {...props}
    >
      {children}
    </div>
  );
}

'use client';

// packages/command-react/src/empty.tsx
// <Command.Empty> — role="status", aria-live="polite"
// React 19: use() for context, ref as prop
// Isolated declarations: explicit return types on all exports

import type { ComponentPropsWithRef, ReactNode } from 'react';
import { use } from 'react';
import { CommandStateContext } from './context.js';

export interface CommandEmptyProps extends ComponentPropsWithRef<'div'> {}

export function CommandEmpty({ ref, children, ...props }: CommandEmptyProps): ReactNode {
  const stateCtx = use(CommandStateContext);
  if (!stateCtx) {
    throw new Error('Command.Empty must be used within a <Command> component');
  }

  // Only show when there's a search query but no results
  if (stateCtx.state.filteredCount > 0 || stateCtx.state.loading) return null;

  return (
    <div ref={ref} data-command-empty="" role="status" aria-live="polite" {...props}>
      {children}
    </div>
  );
}

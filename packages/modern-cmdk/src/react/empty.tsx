'use client';

// packages/command-react/src/empty.tsx
// <Command.Empty> — role="status", aria-live="polite"
// Portals into a container outside the listbox for valid ARIA structure
// React 19: use() for context, ref as prop
// Isolated declarations: explicit return types on all exports

import type { ComponentPropsWithRef, ReactNode } from 'react';
import { use } from 'react';
import { createPortal } from 'react-dom';
import { CommandListStatusContext, useStateContext } from './context.js';

export interface CommandEmptyProps extends ComponentPropsWithRef<'div'> {}

/** Rendered when no items match the current search query. */
export function CommandEmpty({ ref, children, ...props }: CommandEmptyProps): ReactNode {
  const stateCtx = useStateContext('Command.Empty');

  const statusContainerRef = use(CommandListStatusContext);

  // Only show when there's a search query but no results
  if (stateCtx.state.filteredCount > 0 || stateCtx.state.loading) return null;

  const content = (
    <div ref={ref} data-command-empty="" role="status" aria-live="polite" {...props}>
      {children}
    </div>
  );

  // Portal into the status container outside the listbox for valid ARIA structure
  if (statusContainerRef?.current) {
    return createPortal(content, statusContainerRef.current);
  }

  // Fallback: render inline if no status container is available (e.g., outside Command.List)
  return content;
}

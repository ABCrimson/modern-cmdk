// packages/modern-cmdk/src/react/empty.tsx
// <Command.Empty> — role="status", aria-live="polite"
// Portals into a container outside the listbox for valid ARIA structure
// React 19: use() for context, ref as prop
// Isolated declarations: explicit return types on all exports

import type { ComponentPropsWithRef, ReactNode } from 'react';
import { use } from 'react';
import { createPortal } from 'react-dom';
import { CommandListStatusContext, useStateContext } from './context.js';
import { useHydrated } from './hooks/use-hydrated.js';

export interface CommandEmptyProps extends ComponentPropsWithRef<'div'> {}

/** Rendered when no items match the current search query; nothing renders before hydration or while a source is loading. */
export function CommandEmpty({ ref, children, ...props }: CommandEmptyProps): ReactNode {
  const stateCtx = useStateContext('Command.Empty');

  const statusContainerRef = use(CommandListStatusContext);
  const hydrated: boolean = useHydrated();

  // Show whenever nothing matches (an empty query included) and no source is loading. Before hydration filteredCount
  // may be 0 only because items register in layout effects, which says nothing about the query, so the server and the
  // hydration pass render nothing.
  if (!hydrated || stateCtx.state.filteredCount > 0 || stateCtx.state.loading) return null;

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

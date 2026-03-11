'use client';

// packages/command-react/src/page.tsx
// <Command.Page> — page stack management, View Transitions API
// React 19: use() for context
// Isolated declarations: explicit return types on all exports

import type { ReactNode } from 'react';
import { useStateContext } from './context.js';

/** Branded page identifier */
export type CommandPageId = string & { readonly __brand: 'CommandPageId' };

export interface CommandPageProps {
  /** Page identifier */
  readonly id: CommandPageId | string;
  readonly children?: ReactNode;
}

/** Page navigation container that only renders when its ID matches the active page. */
export function CommandPage({ id, children }: CommandPageProps): ReactNode {
  const stateCtx = useStateContext('Command.Page');

  // Only render the active page
  if (stateCtx.state.page !== id) return null;

  return (
    <div data-command-page="" data-command-page-id={id}>
      {children}
    </div>
  );
}

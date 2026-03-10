'use client';

// packages/command-react/src/page.tsx
// <Command.Page> — page stack management, View Transitions API
// React 19: use() for context
// Isolated declarations: explicit return types on all exports

import type { ReactNode } from 'react';
import { use } from 'react';
import { CommandStateContext } from './context.js';

/** Branded page identifier */
export type CommandPageId = string & { readonly __brand: 'CommandPageId' };

export interface CommandPageProps {
  /** Page identifier */
  readonly id: CommandPageId | string;
  readonly children?: ReactNode;
}

export function CommandPage({ id, children }: CommandPageProps): ReactNode {
  const stateCtx = use(CommandStateContext);
  if (!stateCtx) {
    throw new Error('Command.Page must be used within a <Command> component');
  }

  // Only render the active page
  if (stateCtx.state.page !== id) return null;

  return (
    <div data-command-page="" data-command-page-id={id}>
      {children}
    </div>
  );
}

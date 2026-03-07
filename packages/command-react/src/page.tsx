'use client';

// packages/command-react/src/page.tsx
// <Command.Page> — page stack management, View Transitions API

import type { ReactNode } from 'react';
import { use } from 'react';
import { CommandContext } from './context.js';

export interface CommandPageProps {
  /** Page identifier */
  readonly id: string;
  readonly children?: ReactNode;
}

export function CommandPage({ id, children }: CommandPageProps): ReactNode {
  const ctx = use(CommandContext);
  if (!ctx) {
    throw new Error('Command.Page must be used within a <Command> component');
  }

  // Only render the active page
  if (ctx.state.page !== id) return null;

  return (
    <div data-command-page="" data-command-page-id={id}>
      {children}
    </div>
  );
}

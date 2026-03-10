'use client';

// packages/command-react/src/loading.tsx
// <Command.Loading> — aria-busy, Suspense boundary integration
// React 19: use() for context, ref as prop
// Isolated declarations: explicit return types on all exports

import type { ComponentPropsWithRef, ReactNode } from 'react';
import { use } from 'react';
import { CommandStateContext } from './context.js';

export interface CommandLoadingProps extends ComponentPropsWithRef<'div'> {
  /** Override the loading state detection */
  readonly loading?: boolean;
}

export function CommandLoading({
  ref,
  children,
  loading: loadingOverride,
  ...props
}: CommandLoadingProps): ReactNode {
  const stateCtx = use(CommandStateContext);
  if (!stateCtx) {
    throw new Error('Command.Loading must be used within a <Command> component');
  }

  const isLoading: boolean = loadingOverride ?? stateCtx.state.loading ?? stateCtx.isPending;

  if (!isLoading) return null;

  return (
    <div ref={ref} data-command-loading="" aria-busy aria-live="assertive" role="status" {...props}>
      {children}
    </div>
  );
}

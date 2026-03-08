'use client';

// packages/command-react/src/async-items.tsx
// <Command.AsyncItems> — use() hook for resolving async item sources with Suspense
// React 19: use() for both context and promise resolution
// Isolated declarations: explicit return types on all exports

import type { CommandItem } from '@crimson_dev/command';
import type { ReactNode } from 'react';
import { Suspense, use, useEffect } from 'react';
import { CommandContext } from './context.js';

export interface CommandAsyncItemsProps {
  /** Promise that resolves to items */
  readonly items: Promise<readonly CommandItem[]>;
  /** Fallback content while loading */
  readonly fallback?: ReactNode;
  /** Render function for resolved items */
  readonly children: (items: readonly CommandItem[]) => ReactNode;
}

/** Inner component that suspends via use() until items resolve */
function AsyncItemsInner({
  items: itemsPromise,
  children,
}: {
  readonly items: Promise<readonly CommandItem[]>;
  readonly children: (items: readonly CommandItem[]) => ReactNode;
}): ReactNode {
  const ctx = use(CommandContext);
  if (!ctx) {
    throw new Error('Command.AsyncItems must be used within a <Command> component');
  }

  // React 19 use() — suspends until items resolve
  const items: readonly CommandItem[] = use(itemsPromise);

  // Register loaded items with the machine
  useEffect(() => {
    ctx.machine.send({ type: 'ITEMS_LOADED', items });
  }, [ctx.machine, items]);

  return <>{children(items)}</>;
}

export function CommandAsyncItems({
  items,
  fallback,
  children,
}: CommandAsyncItemsProps): ReactNode {
  return (
    <Suspense fallback={fallback}>
      <AsyncItemsInner items={items}>{children}</AsyncItemsInner>
    </Suspense>
  );
}

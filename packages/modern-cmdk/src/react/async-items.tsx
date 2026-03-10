'use client';

// packages/command-react/src/async-items.tsx
// <Command.AsyncItems> — use() hook for resolving async item sources with Suspense
// React 19: use() for both context and promise resolution
// Isolated declarations: explicit return types on all exports

import type { ReactNode } from 'react';
import { Suspense, use, useLayoutEffect, useRef } from 'react';
import type { CommandItem } from '../core/index.js';
import { CommandStableContext } from './context.js';

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
  const stable = use(CommandStableContext);
  if (!stable) {
    throw new Error('Command.AsyncItems must be used within a <Command> component');
  }

  // React 19 use() — suspends until items resolve
  const items: readonly CommandItem[] = use(itemsPromise);

  // Register loaded items with the machine — useLayoutEffect to update state before paint
  // (avoids 1-frame flash of empty items)
  useLayoutEffect(() => {
    stable.machine.send({ type: 'ITEMS_LOADED', items });
  }, [stable.machine, items]);

  return <>{children(items)}</>;
}

export function CommandAsyncItems({
  items,
  fallback,
  children,
}: CommandAsyncItemsProps): ReactNode {
  // Stabilize promise reference — only update when a genuinely new promise is passed
  // Prevents infinite re-suspension from unstable promise identity
  const stableRef = useRef(items);
  if (stableRef.current !== items) {
    stableRef.current = items;
  }

  return (
    <Suspense fallback={fallback}>
      <AsyncItemsInner items={stableRef.current}>{children}</AsyncItemsInner>
    </Suspense>
  );
}

// packages/modern-cmdk/src/react/async-items.tsx
// <Command.AsyncItems> — use() hook for resolving async item sources with Suspense
// React 19: use() for both context and promise resolution
// Isolated declarations: explicit return types on all exports

import type { CommandItem } from 'modern-cmdk';
import type { ReactNode } from 'react';
import { Suspense, use, useId, useLayoutEffect } from 'react';
import { useStableContext } from './context.js';

export interface CommandAsyncItemsProps {
  /** Promise that resolves to items; keep it stable across renders (state, a ref, or `useMemo`) or the boundary re-suspends on every render */
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
  const stable = useStableContext('Command.AsyncItems');

  // React 19 use() — suspends until items resolve
  const items: readonly CommandItem[] = use(itemsPromise);

  // Register loaded items with the machine — useLayoutEffect to update state before paint
  // (avoids 1-frame flash of empty items)
  useLayoutEffect(() => {
    stable.machine.send({ type: 'ITEMS_LOADED', items });
  }, [stable.machine, items]);

  return <>{children(items)}</>;
}

/**
 * Rendered next to the Suspense fallback: while it is mounted its source counts as pending,
 * so `state.loading` (Command.Loading, the list's aria-busy) follows the suspended promise.
 * The fallback unmounts when the items resolve, reject into an error boundary, or this
 * AsyncItems unmounts, and the cleanup then clears the source.
 */
function PendingSignal(): null {
  const stable = useStableContext('Command.AsyncItems');
  const source = useId();

  useLayoutEffect(() => {
    stable.machine.send({ type: 'LOADING', source, pending: true });
    return (): void => {
      stable.machine.send({ type: 'LOADING', source, pending: false });
    };
  }, [stable.machine, source]);

  return null;
}

/**
 * Suspense-based async item loader that resolves a promise of items using React 19 `use()`.
 *
 * The `items` promise must be kept stable across renders (held in state, a ref, or `useMemo`):
 * a new promise on every render, such as `items={fetchItems()}`, suspends again on every render.
 */
export function CommandAsyncItems({
  items,
  fallback,
  children,
}: CommandAsyncItemsProps): ReactNode {
  return (
    <Suspense
      fallback={
        <>
          {fallback}
          <PendingSignal />
        </>
      }
    >
      <AsyncItemsInner items={items}>{children}</AsyncItemsInner>
    </Suspense>
  );
}

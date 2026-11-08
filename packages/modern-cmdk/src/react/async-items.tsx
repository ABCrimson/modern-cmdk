// packages/modern-cmdk/src/react/async-items.tsx
// <Command.AsyncItems> — use() hook for resolving async item sources with Suspense
// React 19: use() for both context and promise resolution
// Isolated declarations: explicit return types on all exports

import type { CommandItem } from 'modern-cmdk';
import type { Context, ReactNode } from 'react';
import { createContext, Suspense, use, useId, useLayoutEffect } from 'react';
import { useStableContext } from './context.js';

/**
 * The batch an enclosing `Command.AsyncItems` has resolved, `null` outside one. Each resolution replaces the
 * previous batch in the registry and the search index. `useRegisterItem` reads it: an item registered inside the scope
 * should carry the id of its loaded item (`<Command.Item id={item.id}>`), so the rendered item and the loaded item are
 * one entry and the rendered item's `onSelect` and keywords win.
 */
export const CommandAsyncItemsContext: Context<readonly CommandItem[] | null> = createContext<
  readonly CommandItem[] | null
>(null);
CommandAsyncItemsContext.displayName = 'CommandAsyncItemsContext';

export interface CommandAsyncItemsProps {
  /** Promise that resolves to items; keep it stable across renders (state, a ref, or `useMemo`) or the boundary re-suspends on every render */
  readonly items: Promise<readonly CommandItem[]>;
  /** Fallback content while loading */
  readonly fallback?: ReactNode;
  /** Render function for resolved items */
  readonly children: (items: readonly CommandItem[]) => ReactNode;
}

/**
 * Registers the resolved batch with the machine and unregisters exactly its ids when the batch is replaced or this
 * AsyncItems unmounts (a re-suspend runs the cleanup too, because React cleans up hidden layout effects).
 */
function LoadedBatch({ items }: { readonly items: readonly CommandItem[] }): null {
  const stable = useStableContext('Command.AsyncItems');

  // useLayoutEffect updates state before paint (avoids a 1-frame flash of empty items)
  useLayoutEffect(() => {
    stable.machine.send({ type: 'ITEMS_LOADED', items });
    return (): void => {
      for (const item of items) stable.machine.send({ type: 'UNREGISTER_ITEM', id: item.id });
    };
  }, [stable.machine, items]);

  return null;
}

/** Inner component that suspends via use() until items resolve */
function AsyncItemsInner({
  items: itemsPromise,
  children,
}: {
  readonly items: Promise<readonly CommandItem[]>;
  readonly children: (items: readonly CommandItem[]) => ReactNode;
}): ReactNode {
  // React 19 use() — suspends until items resolve
  const items: readonly CommandItem[] = use(itemsPromise);

  // React runs layout-effect setups depth-first in tree order, so LoadedBatch, the first child, queues ITEMS_LOADED
  // before the REGISTER_ITEM of any Command.Item the render prop renders: the item's upsert (its onSelect and
  // keywords) wins over the loaded item with the same id.
  return (
    <CommandAsyncItemsContext value={items}>
      <LoadedBatch items={items} />
      {children(items)}
    </CommandAsyncItemsContext>
  );
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
 * Each resolution replaces the previous batch: the old batch's items leave the registry and the search index, and an
 * unmount removes the batch. Render `<Command.Item id={item.id}>` for a loaded item so the rendered item and the loaded
 * item are one entry; an item without an id gets a generated id and counts twice. A render prop that renders no
 * `Command.Item` keeps the loaded items searchable.
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

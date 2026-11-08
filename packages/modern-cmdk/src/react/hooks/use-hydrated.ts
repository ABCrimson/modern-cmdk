// packages/modern-cmdk/src/react/hooks/use-hydrated.ts
// false on the server and in the hydration pass, true on the client afterwards
// Isolated declarations: explicit return types on all exports

import { useSyncExternalStore } from 'react';

/** A subscribe for a snapshot that never changes while the page is open: there is nothing to subscribe to */
export const subscribeNever = (): (() => void) => (): void => {};

/**
 * False while the server renders and while the client hydrates, true once the client has hydrated.
 * Items register in layout effects, so the registry is empty in both of those passes: content that
 * describes the registry (the empty state, the result count) renders after this turns true.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false,
  );
}

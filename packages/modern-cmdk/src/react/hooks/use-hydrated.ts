// packages/modern-cmdk/src/react/hooks/use-hydrated.ts
// false on the server and in the hydration pass, true on the client afterwards
// Isolated declarations: explicit return types on all exports

import { useSyncExternalStore } from 'react';

/** A subscribe for a snapshot that never changes while the page is open: there is nothing to subscribe to */
export const subscribeNever = (): (() => void) => (): void => {};

/**
 * False while the server renders and while the client hydrates, true once the client has hydrated.
 * Items register in layout effects and the machine applies the registrations in its next frame batch, so the
 * registry is empty in both of those passes and still empty in the first commit after them: content that
 * describes the registry (the empty state, the result count) renders after this turns true, in one commit
 * against the empty registry, before the machine's batch. That commit and the batch share one frame, so the commit
 * is not painted (measured in Chromium).
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false,
  );
}

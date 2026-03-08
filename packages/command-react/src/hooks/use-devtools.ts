'use client';

// packages/command-react/src/hooks/use-devtools.ts
// Development-only devtools bridge — tree-shaken in production
// Isolated declarations: explicit return types on all exports

import { use, useEffect, useRef } from 'react';
import { CommandContext } from '../context.js';

declare const __DEV__: boolean;

interface DevtoolsState {
  readonly registeredItems: number;
  readonly filteredItems: number;
  readonly searchQuery: string;
  readonly activeId: string | null;
  readonly page: string;
  readonly pageStack: readonly string[];
  readonly open: boolean;
  readonly loading: boolean;
}

/** Branded key for the global devtools instance map */
const DEVTOOLS_KEY = '__CRIMSON_COMMAND_DEVTOOLS__' as const;

/** Type-safe global devtools registry */
type DevtoolsRegistry = Map<string, DevtoolsState>;

/**
 * Exposes command palette internals to browser devtools.
 * Only active in development — completely tree-shaken in production builds.
 *
 * @example
 * ```tsx
 * function MyPalette() {
 *   useCommandDevtools('main');
 *   return <Command>...</Command>;
 * }
 * ```
 */
export function useCommandDevtools(label = 'default'): void {
  if (!__DEV__) return;

  // eslint-disable-next-line react-hooks/rules-of-hooks -- __DEV__ is compile-time constant
  const ctx = use(CommandContext);
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const stateRef = useRef<DevtoolsState | null>(null);

  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    if (!ctx) return;

    const update = (): void => {
      const s = ctx.state;
      const devState: DevtoolsState = {
        registeredItems: s.filteredCount,
        filteredItems: s.filteredIds.length,
        searchQuery: s.search,
        activeId: s.activeId,
        page: s.page,
        pageStack: s.pageStack,
        open: s.open,
        loading: s.loading,
      } satisfies DevtoolsState;
      stateRef.current = devState;

      // Use Map.groupBy-style registry via global singleton
      const globals = globalThis as Record<string, unknown>;
      const instances: DevtoolsRegistry = (globals[DEVTOOLS_KEY] ??= new Map<
        string,
        DevtoolsState
      >()) as DevtoolsRegistry;
      instances.set(label, devState);

      globalThis.dispatchEvent?.(
        new CustomEvent('crimson-command-devtools', { detail: { label, state: devState } }),
      );
    };

    const unsub = ctx.machine.subscribe(update);
    update();

    return (): void => {
      unsub();
      const instances = (globalThis as Record<string, unknown>)[DEVTOOLS_KEY] as
        | DevtoolsRegistry
        | undefined;
      instances?.delete(label);
    };
  }, [ctx, label]);
}

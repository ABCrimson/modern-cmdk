'use client';

import { use, useEffect, useRef } from 'react';
import { CommandContext } from '../context.js';
import type { CommandContextValue } from '../context.js';

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

const DEVTOOLS_KEY = '__CRIMSON_COMMAND_DEVTOOLS__';

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

  const ctx = use(CommandContext);
  const stateRef = useRef<DevtoolsState | null>(null);

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
      };
      stateRef.current = devState;

      const instances = ((globalThis as Record<string, unknown>)[DEVTOOLS_KEY] ??= new Map<string, DevtoolsState>()) as Map<string, DevtoolsState>;
      instances.set(label, devState);

      globalThis.dispatchEvent?.(
        new CustomEvent('crimson-command-devtools', { detail: { label, state: devState } }),
      );
    };

    const unsub = ctx.machine.subscribe(update);
    update();

    return () => {
      unsub();
      const instances = (globalThis as Record<string, unknown>)[DEVTOOLS_KEY] as Map<string, DevtoolsState> | undefined;
      instances?.delete(label);
    };
  }, [ctx, label]);
}

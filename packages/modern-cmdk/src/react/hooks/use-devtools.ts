// packages/modern-cmdk/src/react/hooks/use-devtools.ts
// Development-only devtools bridge — gated on NODE_ENV, inert in production builds
// Isolated declarations: explicit return types on all exports

import { use, useEffect } from 'react';
import { CommandStableContext } from '../context.js';
import { dev } from '../env.js';

// Module-scoped declaration: no @types/node needed, nothing global leaks.
declare const process: { readonly env: { readonly NODE_ENV?: string } };

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
 * Development only: the effect is gated on `process.env.NODE_ENV` and returns early in
 * production builds (the hook itself still ships). Call it from a component rendered inside
 * `<Command>`: outside one there is no machine to inspect and the hook does nothing.
 *
 * @example
 * ```tsx
 * function DevtoolsBridge() {
 *   useCommandDevtools('main');
 *   return null;
 * }
 *
 * <Command label="Actions">
 *   <DevtoolsBridge />
 *   <Command.List>...</Command.List>
 * </Command>
 * ```
 */
export function useCommandDevtools(label: string = 'default'): void {
  const stable = use(CommandStableContext);

  useEffect(() => {
    // Guard inside effect body — hooks are always called (Rules of Hooks compliant)
    // `dev` (env.ts) is false where `process` does not exist, so an unbundled browser import does not throw and counts
    // as production; the inline comparison makes a consumer bundler that defines NODE_ENV as "production" fold the
    // guard to `!dev || true` and drop the registry code below.
    if (!dev || process.env.NODE_ENV === 'production') return;
    if (!stable) return;

    const update = (): void => {
      const s = stable.machine.getState();
      const devState: DevtoolsState = {
        registeredItems: stable.machine.getRegistry().size,
        filteredItems: s.filteredIds.length,
        searchQuery: s.search,
        activeId: s.activeId,
        page: s.page,
        pageStack: s.pageStack,
        open: s.open,
        loading: s.loading,
      } satisfies DevtoolsState;

      const globals = globalThis as Record<string, unknown>;
      if (!globals[DEVTOOLS_KEY]) {
        globals[DEVTOOLS_KEY] = new Map<string, DevtoolsState>();
      }
      const instances: DevtoolsRegistry = globals[DEVTOOLS_KEY] as DevtoolsRegistry;
      instances.set(label, devState);

      globalThis.dispatchEvent?.(
        new CustomEvent('crimson-command-devtools', { detail: { label, state: devState } }),
      );
    };

    const unsub = stable.machine.subscribe(update);
    update();

    return (): void => {
      unsub();
      const instances = (globalThis as Record<string, unknown>)[DEVTOOLS_KEY] as
        | DevtoolsRegistry
        | undefined;
      instances?.delete(label);
    };
  }, [stable, label]);
}

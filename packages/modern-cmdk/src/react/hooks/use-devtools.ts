// packages/modern-cmdk/src/react/hooks/use-devtools.ts
// Development-only devtools bridge: the hook and its effect ship in every build, and the effect returns at once in
// production, that is where process.env.NODE_ENV is 'production' and where no process global exists (an unbundled
// browser import). A bundle that defines NODE_ENV as "production" folds the guard and drops the registry code. In development the page-global registry and the CustomEvents carry the search query
// raw (unless redactQuery is set), readable by any script on the page.
// Isolated declarations: explicit return types on all exports

import { use, useEffect } from 'react';
import { CommandStableContext } from '../context.js';
import { dev } from '../env.js';

// Module-scoped declaration: no @types/node needed, nothing global leaks.
declare const process: { readonly env: { readonly NODE_ENV?: string } };

interface DevtoolsState {
  readonly registeredItems: number;
  readonly filteredItems: number;
  /** The raw query, or its length when `redactQuery` is set */
  readonly searchQuery: string | number;
  readonly activeId: string | null;
  readonly page: string;
  readonly pageStack: readonly string[];
  readonly open: boolean;
  readonly loading: boolean;
}

/** Key of the global devtools instance map */
const DEVTOOLS_KEY = '__MODERN_CMDK_DEVTOOLS__' as const;

/** Deprecated alias of `DEVTOOLS_KEY`: the same Map, removed in 2.0 */
const DEPRECATED_DEVTOOLS_KEY = '__CRIMSON_COMMAND_DEVTOOLS__' as const;

/** Type-safe global devtools registry */
type DevtoolsRegistry = Map<string, DevtoolsState>;

/**
 * The registry on `globalThis`, created on first use. An existing Map under either name is reused (another copy of
 * the library may have created the deprecated one), and both names end up holding the same Map.
 */
function registry(): DevtoolsRegistry {
  const globals = globalThis as Record<string, unknown>;
  const instances: DevtoolsRegistry =
    (globals[DEVTOOLS_KEY] as DevtoolsRegistry | undefined) ??
    (globals[DEPRECATED_DEVTOOLS_KEY] as DevtoolsRegistry | undefined) ??
    new Map<string, DevtoolsState>();
  globals[DEVTOOLS_KEY] = instances;
  globals[DEPRECATED_DEVTOOLS_KEY] = instances;
  return instances;
}

/**
 * Exposes command palette internals to browser devtools.
 * Development only: the hook and its effect ship in every build, and the effect returns at once in production,
 * that is where `process.env.NODE_ENV` is `'production'` and where no `process` global exists (an unbundled browser
 * import); a bundle that defines NODE_ENV as `"production"` folds the guard and the registry code leaves the bundle. Call it from a component rendered inside
 * `<Command>`: outside one there is no machine to inspect and the hook does nothing.
 *
 * In development the state is published on `globalThis.__MODERN_CMDK_DEVTOOLS__` (a Map keyed by label) and in a
 * `modern-cmdk-devtools` CustomEvent on `globalThis` (`detail`: `{ label, state }`), so any script on the page can
 * read it, the search query included. `options.redactQuery: true` publishes the query's length (a number) in place
 * of the query, in the Map and in both events. The default is `false` in 1.x and `true` in 2.0.
 *
 * `globalThis.__CRIMSON_COMMAND_DEVTOOLS__` (the same Map) and the `crimson-command-devtools` event (the same
 * `detail`) are deprecated aliases of the two names above and are removed in 2.0.
 *
 * @param label - The registry key of this palette
 * @param options - `redactQuery`: publish the query's length instead of the query
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
export function useCommandDevtools(
  label: string = 'default',
  options?: { readonly redactQuery?: boolean | undefined },
): void {
  const stable = use(CommandStableContext);
  const redactQuery = options?.redactQuery ?? false;

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
        searchQuery: redactQuery ? s.search.length : s.search,
        activeId: s.activeId,
        page: s.page,
        pageStack: s.pageStack,
        open: s.open,
        loading: s.loading,
      } satisfies DevtoolsState;

      const instances = registry();
      instances.set(label, devState);

      const detail = { label, state: devState };
      globalThis.dispatchEvent?.(new CustomEvent('modern-cmdk-devtools', { detail }));
      globalThis.dispatchEvent?.(new CustomEvent('crimson-command-devtools', { detail }));
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
  }, [stable, label, redactQuery]);
}

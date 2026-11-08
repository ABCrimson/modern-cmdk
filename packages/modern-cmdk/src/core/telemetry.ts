// Opt-in telemetry hooks for enterprise observability.
// The machine calls the hooks of its `telemetry` option (CommandMachineOptions; `<Command>` and
// `<Command.Dialog>` take it as a prop). createTelemetryMiddleware is for callers that drive the hooks themselves.
// Durations are differences of performance.now() readings, so a wall-clock step never changes them.
// With no `telemetry` option the machine calls no hook; its cost is one performance.now() read per SEARCH_CHANGE.

import type { ItemId } from './types.js';

export interface CommandTelemetryHooks {
  /**
   * Called when the machine's open state changes to open (`OPEN`, or `TOGGLE` of a closed palette). A machine
   * created with `open: true` reports no open: construction calls no callback, so its first close reports no
   * `onPaletteClose` either.
   */
  readonly onPaletteOpen?: (() => void) | undefined;
  /**
   * Called when the open state changes to closed after a reported open, with the milliseconds since that open.
   * An `OPEN` while open and a `CLOSE` while closed report nothing.
   */
  readonly onPaletteClose?: ((durationMs: number) => void) | undefined;
  /**
   * Called after each `SEARCH_CHANGE` refilter, with the query, the filtered count after it, and the
   * milliseconds the refilter took.
   */
  readonly onSearchComplete?:
    | ((query: string, resultCount: number, durationMs: number) => void)
    | undefined;
  /**
   * Called for each select of an enabled item, with its id, the query at the select, and the item's index in the
   * filtered list, or -1 when it is not listed (a shortcut can select a filtered-out item).
   */
  readonly onItemSelected?:
    | ((itemId: ItemId, searchQuery: string, position: number) => void)
    | undefined;
}

export interface TelemetryMiddleware {
  /** Starts the session clock and calls `onPaletteOpen`. */
  readonly onOpen: () => void;
  /** Calls `onPaletteClose` with the time since the last `onOpen`; reports nothing without one. */
  readonly onClose: () => void;
  /**
   * Calls `onSearchComplete` with the time since `startTime`, a `performance.now()` reading. Through 1.x a
   * `startTime` above 1e12 (an epoch reading from `Date.now()`) is
   * measured against `Date.now()`; a `performance.now()` reading never reaches that value.
   */
  readonly onSearch: (query: string, resultCount: number, startTime: number) => void;
  /** Calls `onItemSelected` with its arguments unchanged. */
  readonly onSelect: (itemId: ItemId, query: string, position: number) => void;
}

/**
 * Creates a telemetry middleware over fixed hooks, for callers that drive the hooks themselves. A machine takes
 * the hooks as its `telemetry` option and needs no middleware. Durations are `performance.now()` differences.
 *
 * @example
 * ```ts
 * const machine = createCommandMachine({
 *   items,
 *   telemetry: {
 *     onPaletteOpen: () => analytics.track('palette_opened'),
 *     // The raw query can hold personal data: report its result, not its text
 *     onSearchComplete: (_query, count, durationMs) =>
 *       analytics.track('search', { resultCount: count, durationMs }),
 *     onItemSelected: (id, _query, position) => analytics.track('item_selected', { id, position }),
 *   },
 * });
 * ```
 */
export function createTelemetryMiddleware(hooks: CommandTelemetryHooks): TelemetryMiddleware {
  return telemetryOver(() => hooks);
}

/**
 * The middleware over a reader of the hooks: the reader runs at each call, so a hooks object that changes
 * after creation takes effect at the next call. The machine reads its `telemetry` option through it.
 * Internal: not exported from the package entry.
 */
export function telemetryOver(read: () => CommandTelemetryHooks | undefined): TelemetryMiddleware {
  let openTimestamp: number | null = null;

  return {
    onOpen(): void {
      openTimestamp = performance.now();
      read()?.onPaletteOpen?.();
    },

    onClose(): void {
      if (openTimestamp != null) {
        const durationMs = performance.now() - openTimestamp;
        openTimestamp = null;
        read()?.onPaletteClose?.(durationMs);
      }
    },

    onSearch(query: string, resultCount: number, startTime: number): void {
      const durationMs = (startTime > 1e12 ? Date.now() : performance.now()) - startTime;
      read()?.onSearchComplete?.(query, resultCount, durationMs);
    },

    onSelect(itemId: ItemId, query: string, position: number): void {
      read()?.onItemSelected?.(itemId, query, position);
    },
  };
}

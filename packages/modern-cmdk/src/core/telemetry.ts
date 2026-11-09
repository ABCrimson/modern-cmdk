// Opt-in telemetry hooks for enterprise observability.
// The machine calls the hooks of its `telemetry` option (CommandMachineOptions; `<Command>` and
// `<Command.Dialog>` take it as a prop) at the end of each batch, after its state reports.
// createTelemetryMiddleware is the standalone helper for callers that drive the hooks themselves;
// the machine does not use it. Durations are differences of performance.now() readings, so a
// wall-clock step never changes them (`onSearch` with a `Date.now()` startTime excepted, see
// `TelemetryMiddleware.onSearch`). With no `telemetry` option the machine calls no hook. It still
// reads performance.now() once at a batch's first SEARCH_CHANGE and once at the end of a batch
// whose committed open state turned open; a duration is read at a batch's end only for a hook
// that is set.

import type { ItemId } from './types.js';

/**
 * The hooks the machine calls at the end of each batch, after its own state reports
 * (`onSearchChange`, `onActiveChange`, `onOpenChange` and the `stateChange` subscribers). Within
 * one batch the order is open, search, selects, close. A hook that throws loses only the later
 * telemetry calls of that batch, never a state report. A hook that flushes the machine
 * synchronously (for example `suspend()`) runs a nested batch inside the report: an open that batch
 * reports restamps the session, so the outer batch's close reports a shorter duration.
 */
export interface CommandTelemetryHooks {
  /**
   * Called when a batch ends with the committed open state turned open since the last report, which
   * starts closed (`OPEN`, or `TOGGLE` of a closed palette). A machine created with `open: true`
   * reports one `onPaletteOpen` at its first commit (for a React root, the batch its mount
   * schedules when it resumes the machine; for a machine never suspended, its first event). A
   * plain `<Command>` constructs `open` from its `open` prop, so it starts closed unless that prop
   * is true. A batch that opens and closes again reports nothing.
   */
  readonly onPaletteOpen?: (() => void) | undefined;
  /**
   * Called when a batch ends with the committed open state turned closed after a reported open,
   * with the milliseconds since that open. An `OPEN` while open and a `CLOSE` while closed report
   * nothing. A palette unmounted while open reports no close: a `Command.Dialog` rendered as
   * `{show && <Command.Dialog open>}` reports an open at each mount and no close.
   */
  readonly onPaletteClose?: ((durationMs: number) => void) | undefined;
  /**
   * Called once per batch in which a `SEARCH_CHANGE` changed the committed query, after the batch's
   * last refilter, with the query, the filtered count the batch ends with, and the milliseconds
   * from the batch's first `SEARCH_CHANGE` to the end of the batch. A `SEARCH_CHANGE` that repeats
   * the committed query reports nothing.
   */
  readonly onSearchComplete?:
    | ((query: string, resultCount: number, durationMs: number) => void)
    | undefined;
  /**
   * Called for each select of an enabled item in the batch, with its id, the query the batch ends
   * with, and the item's index in the filtered list the batch ends with, or -1 when it is not
   * listed (a shortcut can select a filtered-out item).
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
   * Calls `onSearchComplete` with the time since `startTime`, a `performance.now()` reading.
   * Through 1.x a `startTime` above 1e12 (an epoch reading from `Date.now()`) is measured against
   * `Date.now()`; a `performance.now()` reading never reaches that value.
   */
  readonly onSearch: (query: string, resultCount: number, startTime: number) => void;
  /** Calls `onItemSelected` with its arguments unchanged. */
  readonly onSelect: (itemId: ItemId, query: string, position: number) => void;
}

/**
 * Creates a telemetry middleware over fixed hooks, for callers that drive the hooks themselves. A
 * machine takes the hooks as its `telemetry` option and needs no middleware. Durations are
 * `performance.now()` differences.
 *
 * @example
 * ```ts
 * const middleware = createTelemetryMiddleware({
 *   onPaletteOpen: () => analytics.track('palette_opened'),
 *   onPaletteClose: (durationMs) => analytics.track('palette_closed', { durationMs }),
 *   // The raw query can hold personal data: report its result, not its text
 *   onSearchComplete: (_query, count, durationMs) =>
 *     analytics.track('search', { resultCount: count, durationMs }),
 * });
 *
 * const onOpenChange = (open: boolean): void =>
 *   open ? middleware.onOpen() : middleware.onClose();
 *
 * const start = performance.now();
 * // ...filter the items, then:
 * middleware.onSearch(query, results.length, start);
 * ```
 */
export function createTelemetryMiddleware(hooks: CommandTelemetryHooks): TelemetryMiddleware {
  let openTimestamp: number | null = null;

  return {
    onOpen(): void {
      openTimestamp = performance.now();
      hooks.onPaletteOpen?.();
    },

    onClose(): void {
      if (openTimestamp != null) {
        const durationMs = performance.now() - openTimestamp;
        openTimestamp = null;
        hooks.onPaletteClose?.(durationMs);
      }
    },

    onSearch(query: string, resultCount: number, startTime: number): void {
      const durationMs = (startTime > 1e12 ? Date.now() : performance.now()) - startTime;
      hooks.onSearchComplete?.(query, resultCount, durationMs);
    },

    onSelect(itemId: ItemId, query: string, position: number): void {
      hooks.onItemSelected?.(itemId, query, position);
    },
  };
}

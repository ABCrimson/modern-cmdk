// Opt-in telemetry hooks for enterprise observability
// Measures: open->select latency, search->result time, command usage frequency
// Zero overhead when not configured — all hooks are optional
// ES2026: Temporal.Now.instant() for all time measurements

export interface CommandTelemetryHooks {
  /** Called when the command palette opens */
  readonly onPaletteOpen?: () => void;
  /** Called when the command palette closes, with session duration in ms */
  readonly onPaletteClose?: (durationMs: number) => void;
  /** Called after each search completes, with query, result count, and latency */
  readonly onSearchComplete?: (query: string, resultCount: number, durationMs: number) => void;
  /** Called when an item is selected, with item ID, active query, and position in list */
  readonly onItemSelected?: (itemId: string, searchQuery: string, position: number) => void;
}

export interface TelemetryMiddleware {
  readonly onOpen: () => void;
  readonly onClose: () => void;
  readonly onSearch: (query: string, resultCount: number, startTime: Temporal.Instant) => void;
  readonly onSelect: (itemId: string, query: string, position: number) => void;
}

/**
 * Creates a telemetry middleware that measures command palette interactions.
 * Uses Temporal.Now.instant() (ES2026) for nanosecond-precision timestamps
 * and Temporal.Instant.since() for accurate duration computation.
 *
 * @example
 * ```ts
 * const telemetry = createTelemetryMiddleware({
 *   onPaletteOpen: () => analytics.track('palette_opened'),
 *   onItemSelected: (id, query, pos) => analytics.track('item_selected', { id, query, position: pos }),
 * });
 * ```
 */
export function createTelemetryMiddleware(hooks: CommandTelemetryHooks): TelemetryMiddleware {
  let openTimestamp: Temporal.Instant | null = null;

  return {
    onOpen(): void {
      openTimestamp = Temporal.Now.instant();
      hooks.onPaletteOpen?.();
    },

    onClose(): void {
      if (openTimestamp != null) {
        const elapsed = Temporal.Now.instant().since(openTimestamp);
        hooks.onPaletteClose?.(elapsed.total('milliseconds'));
        openTimestamp = null;
      }
    },

    onSearch(query: string, resultCount: number, startTime: Temporal.Instant): void {
      const elapsed = Temporal.Now.instant().since(startTime);
      hooks.onSearchComplete?.(query, resultCount, elapsed.total('milliseconds'));
    },

    onSelect(itemId: string, query: string, position: number): void {
      hooks.onItemSelected?.(itemId, query, position);
    },
  };
}

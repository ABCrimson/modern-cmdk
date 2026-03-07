// Opt-in telemetry hooks for enterprise observability
// Measures: open->select latency, search->result time, command usage frequency
// Zero overhead when not configured — all hooks are optional

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
  readonly onSearch: (query: string, resultCount: number, startTime: number) => void;
  readonly onSelect: (itemId: string, query: string, position: number) => void;
}

/**
 * Creates a telemetry middleware that measures command palette interactions.
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
  let openTimestamp: number | null = null;

  return {
    onOpen(): void {
      openTimestamp = performance.now();
      hooks.onPaletteOpen?.();
    },

    onClose(): void {
      if (openTimestamp != null) {
        hooks.onPaletteClose?.(performance.now() - openTimestamp);
        openTimestamp = null;
      }
    },

    onSearch(query: string, resultCount: number, startTime: number): void {
      hooks.onSearchComplete?.(query, resultCount, performance.now() - startTime);
    },

    onSelect(itemId: string, query: string, position: number): void {
      hooks.onItemSelected?.(itemId, query, position);
    },
  };
}

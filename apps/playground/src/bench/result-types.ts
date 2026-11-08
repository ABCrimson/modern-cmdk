// apps/playground/src/bench/result-types.ts
// The shape of the one result object the /bench page publishes on window.__cmdkBench. The browser
// harness (benchmarks/browser/run.ts) imports these types (type-only, erased by Node's type
// stripping) and awaits that object; this file has no imports so both sides can load it.

/** The two list sizes the page accepts through ?n= — any other value is a rejected result. */
export const BENCH_SIZES = [1000, 10000] as const;

export type BenchSize = (typeof BENCH_SIZES)[number];

/** Mount: the first REGISTER_ITEM to the first state emit whose filteredIds holds all N items. */
export interface BenchMountResult {
  readonly n: BenchSize;
  /** performance.measure duration between bench:mount:start and bench:mount:end, in ms. */
  readonly mount_ms: number;
  /** Sum of Profiler actualDuration over the commits from the first render through the first commit after the all-N emit, in ms. */
  readonly mount_commit_ms: number;
  /** Number of Profiler commits in that window. */
  readonly mount_commit_count: number;
  /** REGISTER_ITEM sends seen between the probe's install and the all-N emit (must equal n). */
  readonly register_sends: number;
  /** Registry size when the probe installed (must be 0: the probe's layout effect runs before any item's). */
  readonly registry_size_at_install: number;
  /** UNREGISTER_ITEM and REGISTER_ITEM sends after the all-N emit, up to the moment the page reports 'mounted'. */
  readonly sends_after_mount: number;
}

/** Filter: one keystroke to the first state emit whose search equals the new query. */
export interface BenchFilterResult {
  readonly query: string;
  /** performance.measure duration between bench:filter:start and bench:filter:end, in ms. */
  readonly filter_ms: number;
  /** The same keystroke to the requestAnimationFrame callback scheduled from that emit, in ms. */
  readonly keystroke_to_paint_ms: number;
  /** Sum of Profiler actualDuration over the commits from the keydown through the paint mark, in ms. */
  readonly filter_commit_ms: number;
  readonly filter_commit_count: number;
  /** state.filteredCount of the first emit whose search equals the query. */
  readonly filtered_count: number;
}

export type BenchState =
  | { readonly phase: 'loading' }
  | { readonly phase: 'error'; readonly message: string }
  | { readonly phase: 'mounted'; readonly mount: BenchMountResult }
  | {
      readonly phase: 'filtered';
      readonly mount: BenchMountResult;
      readonly filter: BenchFilterResult;
    };

declare global {
  interface Window {
    /** Written by the /bench page only; the harness polls it. */
    __cmdkBench?: BenchState;
  }
}

# Performance

modern-cmdk is engineered for speed at every layer.

## Benchmark Results

All benchmarks run on Node 25.8.0, Ubuntu 24.04, averaged over 3 runs.

### Search Performance

| Benchmark | modern-cmdk (TS) | modern-cmdk (WASM) | cmdk |
|-----------|--------------------------|----------------------------|------|
| 10K items | 8.2ms | N/A (overkill) | ~25ms |
| 100K items | 85ms | **0.8ms** | N/A (too slow) |

### State Update Latency

| Operation | Median | P99 | Budget |
|-----------|--------|-----|--------|
| Navigate (arrow key) | 0.05ms | 0.1ms | 1ms |
| Search change | 2.0ms | 3.5ms | 4ms |

### Bundle Size (gzip)

| Package | Size | Limit |
|---------|------|-------|
| modern-cmdk (core) | 2.8 KB | 3.5 KB |
| modern-cmdk/react | 4.2 KB | 5.0 KB |
| modern-cmdk-search-wasm (JS) | 1.5 KB | 2.0 KB |

### Filter Performance

| Dataset | Incremental Filter | Full Re-filter |
|---------|-------------------|----------------|
| 10K items | 1.2ms | 8.2ms |
| 100K items | 12ms | 85ms |

Incremental filtering uses `Set.difference()` (ES2026) to only re-score items that changed, achieving 7x speedup on subsequent keystrokes.

### Frecency

| Operation | Median |
|-----------|--------|
| Compute single bonus | 0.028ms |
| Get all bonuses (10K) | 3.5ms |
| Record selection (1K history) | 0.8ms |

## Why It's Fast

1. **Iterator Helpers** — Zero intermediate array allocations in filter/map pipelines
2. **Set.difference/intersection** — O(n) bulk operations instead of O(n*m) loops
3. **Incremental search** — Only re-scores candidates from previous result set
4. **Scheduler with yield** — Batches updates, yields to browser when input pending
5. **content-visibility: auto** — Skips rendering off-screen items
6. **GPU-composited animations** — `scale`, `translate`, `opacity` only (no layout thrash)
7. **WASM trigram index** — 100x faster than JavaScript for 100K+ items
8. **WeakRef listeners** — GC-safe subscriptions prevent memory leaks

## Regression Tracking

Every PR runs benchmarks in CI. Regressions above 5% trigger warnings; above 15% fail the build. Baselines are stored in `benchmarks/baseline.json`.

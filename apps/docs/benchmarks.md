# Performance

modern-cmdk is engineered for speed at every layer.

## Benchmark Results

All benchmarks run on Node 25.8.0, Ubuntu 24.04, averaged over 3 runs.

### Head-to-Head vs cmdk

Raw filter throughput across 15 scenarios (100 / 1K / 10K items x 5 query types):

| Dataset | Query | cmdk | modern-cmdk | Result |
|---------|-------|------|-------------|--------|
| 100 items | `"app"` | 0.091 ms | 0.058 ms | **1.6x faster** |
| 100 items | `"banana"` | 0.055 ms | 0.035 ms | **1.6x faster** |
| 100 items | `"open settings"` | 0.075 ms | 0.024 ms | **3.1x faster** |
| 100 items | `"dshbrd"` | 0.048 ms | 0.075 ms | cmdk 1.6x |
| 100 items | `"xyznotfound"` | 0.027 ms | 0.020 ms | **1.3x faster** |
| 1K items | `"app"` | 0.450 ms | 0.421 ms | **1.1x faster** |
| 1K items | `"banana"` | 1.150 ms | 0.193 ms | **5.9x faster** |
| 1K items | `"open settings"` | 0.455 ms | 0.215 ms | **2.1x faster** |
| 1K items | `"dshbrd"` | 0.292 ms | 0.211 ms | **1.4x faster** |
| 1K items | `"xyznotfound"` | 0.211 ms | 0.162 ms | **1.3x faster** |
| 10K items | `"app"` | 3.198 ms | 1.938 ms | **1.7x faster** |
| 10K items | `"banana"` | 2.853 ms | 1.770 ms | **1.6x faster** |
| 10K items | `"open settings"` | 4.254 ms | 1.355 ms | **3.1x faster** |
| 10K items | `"dshbrd"` | 2.342 ms | 1.986 ms | **1.2x faster** |
| 10K items | `"xyznotfound"` | 1.743 ms | 1.672 ms | **1.0x faster** |

**modern-cmdk wins 14 of 15 benchmarks**, up to **5.9x faster** at scale. Search accuracy: precision >= 80%, specificity >= 90%.

### Search Performance (Large Datasets)

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

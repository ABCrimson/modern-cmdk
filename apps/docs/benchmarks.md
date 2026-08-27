# Performance

modern-cmdk is engineered for speed at every layer.

## Benchmark Results

The search, filter, frecency and state-update figures on this page are the committed
baseline in [`benchmarks/baseline.json`](https://github.com/ABCrimson/modern-cmdk/blob/main/benchmarks/baseline.json),
recorded on **Node 25.8.0 / Ubuntu 24.04 / TypeScript 6.0.1-rc (2026-03-07, v0.9.0)**.
Every PR re-runs them and compares against that file — see [Regression Tracking](#regression-tracking).

Bundle sizes are measured fresh by `size-limit` on each run and are current for `1.2.1`.

> [!NOTE]
> The baseline is a *frozen record*, not a live reading. It is the reference the regression
> gate diffs against, so it is deliberately not re-recorded on every toolchain bump. Run
> `pnpm bench` locally to get numbers for your own machine.

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

| Package | Size | Limit | Headroom |
|---------|------|-------|----------|
| modern-cmdk (core) | 6.29 KB | 6.5 KB | 0.21 KB |
| modern-cmdk/react | 10.17 KB | 12 KB | 1.83 KB |
| modern-cmdk-search-wasm (JS) | 1.4 KB | 2.0 KB | target only -- unpublished, not in `size-limit` |

> `modern-cmdk/react` is measured as the adapter's **own** emitted code. React, React DOM, and `radix-ui` are externalized peer dependencies the consumer already ships, so they're excluded from the budget — keeping it meaningful and stable across peer version bumps.

### Filter Performance

| Dataset | Incremental Filter | Full Re-filter |
|---------|-------------------|----------------|
| 10K items | 1.2ms | 8.2ms |
| 100K items | 12ms | 85ms |

Incremental filtering uses `setDifference()` helper to only re-score items that changed, achieving 7x speedup on subsequent keystrokes.

### Frecency

| Operation | Median |
|-----------|--------|
| Compute single bonus | 0.028ms |
| Get all bonuses (10K) | 3.5ms |
| Record selection (1K history) | 0.8ms |

## Why It's Fast

1. **Iterator Helpers** — Zero intermediate array allocations in filter/map pipelines
2. **Set operation helpers** — O(n) bulk operations instead of O(n*m) loops
3. **Incremental search** — Only re-scores candidates from previous result set
4. **Scheduler with yield** — Batches updates, yields to browser when input pending
5. **content-visibility: auto** — Skips rendering off-screen items
6. **GPU-composited animations** — `scale`, `translate`, `opacity` only (no layout thrash)
7. **WASM trigram index** — 100x faster than JavaScript for 100K+ items
8. **WeakRef listeners** — GC-safe subscriptions prevent memory leaks

## Regression Tracking

Every PR runs benchmarks in CI. Regressions above 5% trigger warnings; above 15% fail the build. Baselines are stored in `benchmarks/baseline.json`.

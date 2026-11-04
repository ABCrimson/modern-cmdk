# Performance

This page lists only figures that come from a committed benchmark record. Nothing here is a live reading, and no figure for the WASM engine is published: no benchmark of it runs in CI.

## Benchmark Results

The figures below are copied by hand from [`benchmarks/baseline.json`](https://github.com/ABCrimson/modern-cmdk/blob/main/benchmarks/baseline.json) and the run it was taken from, [`benchmarks/history/2026-11-04-45a9134.json`](https://github.com/ABCrimson/modern-cmdk/blob/main/benchmarks/history/2026-11-04-45a9134.json).

| Field | Value |
|-------|-------|
| Date | 2026-11-04 |
| Commit | `45a9134` (version 1.2.3) |
| Node | v28.0.0-nightly2026110370074c6f98 |
| OS / runner | linux 7.0.0-1017-azure, GitHub-hosted `ubuntu26` (image 20261026.180.1) |
| CPU | AMD EPYC 7763 64-Core Processor, 4 cores |
| Method | 3 runs of 1000 samples each, averaged (3000 samples per task) |

> [!WARNING]
> Runner noise is +/-20-40 %. One CI run is one sample, so the 5 % and 15 % comparison below is a coarse tripwire, not a precise regression gate. Run `pnpm bench:compare` locally for numbers from your own machine.

### Gated tasks

Three tasks are gated. Median and P99 are the mean of the three runs’ medians and p99s, in milliseconds; the target is the budget recorded in the baseline.

| Task | Median | P99 | Target |
|------|--------|-----|--------|
| `search:ts-scorer-10k` (TypeScript scorer over 10K items) | 3.46 ms | 7.03 ms | 16 ms |
| `stateUpdate:navigate` (arrow-key navigation) | 0.00075 ms | 0.0078 ms | 1 ms |
| `stateUpdate:searchChange` (search change) | 0.37 ms | 0.61 ms | 4 ms |

The relative margin of error (tinybench `rme`, averaged over the three runs) of `stateUpdate:navigate` in that run was 11 %, so treat its figure as an order of magnitude.

### Bundle size (gzip)

`pnpm size` builds and measures the two entry points against these limits (from `size-limit` in the root `package.json`). Current sizes are whatever `pnpm size` prints; none is recorded on this page.

| Entry | Limit |
|-------|-------|
| `modern-cmdk` (core) | 6.5 kB |
| `modern-cmdk/react` | 12 kB |

`modern-cmdk/react` is measured as the adapter's own emitted code: `react`, `react-dom` and `radix-ui` are external peer dependencies and are ignored.

## Why It's Fast

What the code does, as of 1.2.3:

1. **Cached lowercase index.** The built-in search engine lowercases each item's value and keywords once at `index()` time, and lowercases the query once per search.
2. **Incremental search.** When a query extends the previous one, only the previous result set is re-scored.
3. **O(1) membership.** The machine keeps a `Set` of filtered ids and an id-to-index `Map`, so rendering checks visibility without scanning.
4. **Batched updates.** Events go through a scheduler that coalesces them into one pass per `requestAnimationFrame` (browsers) or microtask (Node.js). Only when a batch has more than 10 updates and `navigator.scheduling.isInputPending()` is available and reports pending input does it defer the batch, using `scheduler.yield()` when present.
5. **Iterator Helpers.** Pipelines use `.values().filter().map()`. Results are still materialised with `.toArray()` or `.sort()` where the code needs an array, so this does not mean zero intermediate arrays.
6. **`content-visibility: auto`** on `[data-command-item]` and `[data-command-virtual-item]` in the shipped stylesheet (`modern-cmdk/styles.css`), so the browser can skip rendering work for off-screen items.
7. **Set helpers for pruning.** `setDifference` removes deleted ids from the incremental cache and the registry order; it does not decide which items get re-scored.

## Regression Tracking

CI runs `pnpm bench:compare`, which re-measures the three gated tasks and compares their medians with `benchmarks/baseline.json`. A regression above 5 % prints a warning annotation; above 15 % (or a harness error) the job fails. Given the noise above, a single flagged run is a prompt to re-run, not proof of a regression. When the baseline's CPU or Node differs from the machine running the comparison, the tool says so before the table.

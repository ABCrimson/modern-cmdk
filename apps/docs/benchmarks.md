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
> Runner noise is +/-20-40 %. One CI run is one sample, so the 5 % and 15 % comparison below is a coarse tripwire, not a precise regression gate; the one sub-0.01 ms baseline (`stateUpdate:navigate`, 0.75 microseconds) is reported below a 0.01 ms floor instead of compared, and a median above its `target_ms` still fails. Run `pnpm bench:compare` locally for numbers from your own machine.

### Gated tasks

Three tasks are gated. Median and P99 are the mean of the three runs’ medians and p99s, in milliseconds; the target is the budget recorded in the baseline.

| Task | Median | P99 | Target |
|------|--------|-----|--------|
| `search:ts-scorer-10k` (TypeScript scorer over 10K items) | 3.46 ms | 7.03 ms | 16 ms |
| `stateUpdate:navigate` (arrow-key navigation) | 0.00075 ms | 0.0078 ms | 1 ms |
| `stateUpdate:searchChange` (search change) | 0.37 ms | 0.61 ms | 4 ms |

The relative margin of error (tinybench `rme`, averaged over the three runs) of `stateUpdate:navigate` in that run was 11 %, so treat its figure as an order of magnitude.

### Bundle size

The figures come from [`benchmarks/size-history/1.5.0.json`](https://github.com/ABCrimson/modern-cmdk/blob/8eb1557/benchmarks/size-history/1.5.0.json) (git blob `b041367`, committed in `8eb1557`), measured at commit `056ab43` on 2026-11-05 with size-limit 14.3.0 on Node v28.0.0-nightly20261104d36e9ba1f8 by `pnpm size` (`pnpm build && size-limit`). Each row is one entry of `size-limit` in the root `package.json`. Sizes are gzip bytes unless the method says otherwise; `react`, `react-dom`, `react/jsx-runtime`, `radix-ui` and, where listed, `modern-cmdk` are externals that size-limit ignores. The 1.4.0 record had one codemod row, 3325793 B for the whole bin. Run `pnpm size` for a reading from your own checkout.

| Entry | Size | Limit | Method |
|-------|------|-------|--------|
| `modern-cmdk` (core) | 6399 B | 6.5 kB | `dist/core/index.mjs`, minified and gzipped |
| `modern-cmdk/react` (adapter only) | 5558 B | 5.6 kB | `dist/react/index.mjs`, gzip; `modern-cmdk` is ignored, so the core is not counted |
| `modern-cmdk` + `modern-cmdk/react` | 10019 B | 10.1 kB | `dist/react/index.mjs`, gzip; `modern-cmdk` is not ignored, so the one core is counted once |
| `modern-cmdk/react/dialog` (adapter only) | 1422 B | 1.5 kB | `dist/react/dialog.mjs`, gzip; the `radix-ui` import is ignored |
| `modern-cmdk/react`: `CommandSeparator` only | 4830 B | 5 kB | `import { CommandSeparator }` from `dist/react/index.mjs`, gzip; the bundle still contains `CommandDialog`, `CommandRoot` and the `radix-ui` import because `Command` is a compound (see [SSR](/guide/ssr#tree-shaking)) |
| `modern-cmdk/styles.css` | 3959 B | 4 kB | `dist/react/styles.css`, gzip |
| `modern-cmdk` codemod bin (bundled) | 3150191 B (raw) | 3.4 MB | `dist/codemod/*.mjs` plus `dist/codemod/transforms/*.mjs` installed size, no compression; includes the 897 B shim |
| `modern-cmdk` codemod shim (`bin.mjs`) | 897 B (raw) | 1000 B | `dist/codemod/bin.mjs` installed size, no compression |
| `modern-cmdk-codemod` (own files) | 97921 B (raw) | 100000 B | `dist/*.mjs` plus `dist/transforms/*.mjs` of `packages/modern-cmdk-codemod`, jscodeshift excluded, no compression |

For comparison, 1.3 (commit `85a33bf`, size-limit at that commit, quoted from the `baseline_1_3` block of [`benchmarks/size-history/1.4.0.json`](https://github.com/ABCrimson/modern-cmdk/blob/5f1e01e/benchmarks/size-history/1.4.0.json) (git blob `4687fa7`)) measured `modern-cmdk` at 6355 B and `modern-cmdk/react` at 9844 B, where the React figure was `dist/react/index.mjs` with the core inlined: the pair summed to 16199 B because the core was counted twice. The 1.4.0 build keeps the core external to the adapter (`modern-cmdk` is imported by name): in 1.4.0 the adapter alone was 5403 B and the core plus the adapter together 9830 B (1.4.0 record), and 1.5.0 measures 5558 B and 10019 B.

## Why It's Fast

What the code does, as of 1.2.3:

1. **Cached lowercase index.** The built-in search engine lowercases each item's value and keywords once at `index()` time, and lowercases the query once per search.
2. **Incremental search.** When a query extends the previous one, only the previous result set is re-scored.
3. **O(1) membership.** The machine keeps a `Set` of filtered ids and an id-to-index `Map`, so rendering checks visibility without scanning.
4. **Batched updates.** Events go through a scheduler that coalesces them into one pass per `requestAnimationFrame` (browsers) or microtask (Node.js). Only when a batch has more than 10 updates and `navigator.scheduling.isInputPending()` is available and reports pending input does it defer the batch, using `scheduler.yield()` when present.
5. **Iterator Helpers.** Pipelines use `.values().filter().map()`. Results are still materialised with `.toArray()` or `.sort()` where the code needs an array, so this does not mean zero intermediate arrays.
6. **`content-visibility: auto`** on `[data-command-item]` (every item) in the shipped stylesheet (`modern-cmdk/styles.css`), so the browser can skip rendering work for off-screen items. The stylesheet's `[data-command-virtual-item]` rule is a reserved hook that no component emits.
7. **Set helpers for pruning.** `setDifference` removes deleted ids from the incremental cache and the registry order; it does not decide which items get re-scored.

## Regression Tracking

CI runs `pnpm bench:compare`, which re-measures the three gated tasks and compares their medians with `benchmarks/baseline.json`. A regression above 5 % prints a warning annotation; above 15 %, above a task's `target_ms`, or a harness error the job fails. A baseline below the 0.01 ms floor (only `stateUpdate:navigate`) is reported, not compared. Given the noise above, a single flagged run is a prompt to re-run, not proof of a regression. When the baseline's CPU or Node differs from the machine running the comparison, the tool says so before the table.

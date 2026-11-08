# Performance

This page lists only figures that come from a committed benchmark record. Nothing here is a live reading, and no figure for the WASM engine is published: no benchmark of it runs in CI.

## Benchmark Results

The figures below are copied by hand from [`benchmarks/baseline.json`](https://github.com/ABCrimson/modern-cmdk/blob/main/benchmarks/baseline.json) and the run it was taken from, [`benchmarks/history/2026-11-08-79e3c14.json`](https://github.com/ABCrimson/modern-cmdk/blob/main/benchmarks/history/2026-11-08-79e3c14.json): the record of the AMD EPYC 7763 in `benchmarks/baseline.json`.

| Field | Value |
|-------|-------|
| Date | 2026-11-08 |
| Commit | `79e3c14` (version 1.4.0) |
| Node | v28.0.0-nightly20261107a43bfb5bb2 |
| OS / runner | linux 7.0.0-1019-azure, GitHub-hosted `ubuntu26` (image 20261101.186.1) |
| CPU | AMD EPYC 7763 64-Core Processor, 4 cores |
| Method | 5 runs of 1000 samples each; the median of the runs' p50 and p99 (5000 samples per task) |

> [!WARNING]
> Runner noise is +/-20-40 %. Each CI comparison is the median of five runs on one shared runner, so the 5 % and 15 % comparison below is a coarse tripwire, not a precise regression gate, and CI goes red only when a re-run of the comparison also fails (see [Regression Tracking](#regression-tracking)); the one sub-0.01 ms baseline (`stateUpdate:navigate`, 1.02 microseconds) is reported below a 0.01 ms floor instead of compared, and a median above its `target_ms` still fails. Run `pnpm bench:compare` locally for numbers from your own machine.

### Gated tasks

Three tasks are gated. Median and P99 are the median of the five runs’ p50 and p99, in milliseconds; the target is the budget recorded in the baseline.

| Task | Median | P99 | Target |
|------|--------|-----|--------|
| `search:ts-scorer-10k` (TypeScript scorer over 10K items) | 3.80 ms | 7.42 ms | 16 ms |
| `stateUpdate:navigate` (arrow-key navigation) | 0.00102 ms | 0.0082 ms | 1 ms |
| `stateUpdate:searchChange` (search change) | 0.41 ms | 0.73 ms | 4 ms |

The relative margin of error (tinybench `rme`, the median over the five runs) of `stateUpdate:navigate` in that run was 10 %, so treat its figure as an order of magnitude.

### Bundle size

The figures come from [`benchmarks/size-history/1.7.0.json`](https://github.com/ABCrimson/modern-cmdk/blob/b42c483/benchmarks/size-history/1.7.0.json) (git blob `4b42cee`, committed in `b42c483`), measured at commit `a7838c9` on 2026-11-08 with size-limit 14.3.0 on Node v28.0.0-nightly20261107a43bfb5bb2 by `pnpm size` (`pnpm build && size-limit`). Each row is one entry of the root `.size-limit.mjs`. Sizes are gzip bytes unless the method says otherwise; `react`, `react-dom`, `react/jsx-runtime`, `radix-ui` and, where listed, `modern-cmdk` are externals that size-limit ignores. Run `pnpm size` for a reading from your own checkout.

| Entry | Size | Limit | Method |
|-------|------|-------|--------|
| `modern-cmdk` (core) | 7742 B | 7.84 kB | `dist/core/index.mjs`, minified and gzipped |
| `modern-cmdk/react` (adapter only) | 6491 B | 6.59 kB | `dist/react/index.mjs`, gzip; `modern-cmdk` is ignored, so the core is not counted |
| `modern-cmdk` + `modern-cmdk/react` | 12038 B | 12.13 kB | `dist/react/index.mjs`, gzip; `modern-cmdk` is not ignored, so the one core is counted once |
| `modern-cmdk/react/dialog` (adapter only) | 2104 B | 2.2 kB | `dist/react/dialog.mjs`, gzip; the `radix-ui` import is ignored |
| `modern-cmdk/react`: `CommandSeparator` only | 293 B | 390 B | `import { CommandSeparator }` from `dist/react/index.mjs`, gzip; `Command` is a `/* @__PURE__ */ Object.assign` (D116), so the bundle holds the separator and not `CommandDialog`, `CommandRoot` or the `radix-ui` import (see [SSR](/guide/ssr#tree-shaking)) |
| `modern-cmdk/styles.css` | 3986 B | 4 kB | `dist/react/styles.css`, gzip |
| `modern-cmdk` codemod bin (bundled) | 3153027 B (raw) | 3.4 MB | `dist/codemod/*.mjs` plus `dist/codemod/transforms/*.mjs` installed size, no compression; includes the 897 B shim |
| `modern-cmdk` codemod shim (`bin.mjs`) | 897 B (raw) | 1000 B | `dist/codemod/bin.mjs` installed size, no compression |
| `modern-cmdk-codemod` (own files) | 100685 B (raw) | 102000 B | `dist/*.mjs` plus `dist/transforms/*.mjs` of `packages/modern-cmdk-codemod`, jscodeshift excluded, no compression |

For comparison, 1.3 (commit `85a33bf`, size-limit at that commit, quoted from the `baseline_1_3` block of [`benchmarks/size-history/1.4.0.json`](https://github.com/ABCrimson/modern-cmdk/blob/5f1e01e/benchmarks/size-history/1.4.0.json) (git blob `4687fa7`)) measured `modern-cmdk` at 6355 B and `modern-cmdk/react` at 9844 B, where the React figure was `dist/react/index.mjs` with the core inlined: the pair summed to 16199 B because the core was counted twice. The build keeps the core external to the adapter (`modern-cmdk` is imported by name): in 1.6.0 the adapter alone was 5610 B and the core plus the adapter together 10764 B (1.6.0 record), and 1.7.0 measures 6491 B and 12038 B.

## Browser bench

The figures above time the headless machine in Node. The browser bench (`benchmarks/browser/run.ts`) times a full React mount in Chromium: it builds the playground (with `react-dom/profiling`, so React's Profiler reports commit durations), serves it, and drives its `/bench` route at 1000 and 10000 items. Each size runs 1 warm-up and 7 measured runs, every run a fresh page load, and a figure is the median of the 7. Only the 10K mount is checked, by a tripwire at 75 ms (D94), set from the runner's first measurement of 47.80 ms on an AMD EPYC 7763 (1.5x the 47.80 ms median, rounded up to the next 5 ms); the 1.7.0 RC measured 54.70 ms on an AMD EPYC 9V74 and the tripwire stands (D120); the other figures are recorded.

The figures below are the CI job "Browser bench (Chromium, 10K mount gate)" on GitHub-hosted ubuntu-26.04 runners (image 20261101.186.1, 4 cores, Linux 7.0.0-1019-azure, Node v28.0.0-nightly20261107a43bfb5bb2) with Chromium 158.0.8127.18, new headless mode. GitHub hands the job either of two CPUs, so each column names its CPU: the 1.7.0 RC record was measured at commit `79e3c14` on 2026-11-08 on an AMD EPYC 9V74 and is recorded in `benchmarks/browser/results/1.4.0-79e3c14.json`; the earlier record was measured at commit `8362840` on 2026-11-08 on an AMD EPYC 7763 and is recorded in `benchmarks/browser/results/1.4.0-8362840.json`. The `1.4.0` in the file names is the version in the package manifest when the run was made, not a release that was benchmarked. The items come from the shared `basic` dataset (`apps/playground/src/bench/dataset.ts`), the query is `g` (250 matches at 1K, 2500 at 10K), and times are in milliseconds.

| Metric | N = 1000, EPYC 9V74 | N = 10000, EPYC 9V74 | N = 1000, EPYC 7763 | N = 10000, EPYC 7763 |
|--------|----------|-----------|----------|-----------|
| Mount (first `REGISTER_ITEM` sent to the first state holding all N items) | 12.7 | 54.7 | 27.4 | 47.8 |
| Filter (keystroke to the first state with the new search) | 14.8 | 13.0 | 11.0 | 15.5 |
| Keystroke to paint (the keystroke to the animation frame after the one that shows the result) | 33.7 | 198.2 | 28.6 | 244.1 |
| React commit of the mount (sum of Profiler `actualDuration`) | 31.4 | 183.6 | 25.3 | 145.3 |
| React commit of the filter | 8.0 | 40.9 | 5.7 | 46.7 |

The seven 10K mount runs ranged from 47.7 to 65.7 ms around the 54.70 ms median on the EPYC 9V74, and from 40.7 to 59.7 ms around the 47.80 ms median on the EPYC 7763; the 54.70 ms median lies inside the range of the other CPU, so the 75 ms tripwire stands (D120). For context, the same harness on the development machine (Intel Core Ultra 9 290HX Plus, Windows) measured a 10K mount median of 18.80 ms on 2026-11-08; a shared CI runner is slower and noisier, so read the table above, not that line, as the reference.

## Why It's Fast

What the code does, as of 1.6.0:

1. **Cached lowercase index.** The built-in search engine lowercases each item's value and keywords once at `index()` time, and lowercases the query once per search.
2. **Incremental search.** With the built-in scorer, when the lowercased query extends the previous lowercased query, only the previous matches are re-scored. A custom scorer, and a `filter` function (which runs as one), rescan every item on every non-empty query.
3. **O(1) membership.** The machine keeps a `Set` of filtered ids and an id-to-index `Map`, so rendering checks visibility without scanning.
4. **Batched updates.** Events go through a scheduler that coalesces them into one pass per `requestAnimationFrame` (browsers) or microtask (Node.js). A batch always runs whole: there is no `isInputPending` or `scheduler.yield()` gate. Registry events (register, update, unregister, `ITEMS_LOADED`, group events) only mark the results dirty, so registering or removing N items in one batch refilters once, not N times (a `SEARCH_CHANGE`, `NAVIGATE` or `ITEM_ACTIVATE` in the same batch also refilters at that event), and `stateChange` fires at most once per batch.
5. **Iterator Helpers.** Pipelines use `.values().filter().map()`. Results are still materialised with `.toArray()` or `.sort()` where the code needs an array, so this does not mean zero intermediate arrays.
6. **`content-visibility: auto`** on `[data-command-item]` (every item) in the shipped stylesheet (`modern-cmdk/styles.css`), so the browser can skip rendering work for off-screen items. The stylesheet's `[data-command-virtual-item]` rule is a reserved hook that no component emits.
7. **Cheap removal.** Unregistering an item deletes its id from the registry order, the search index and the incremental cache with one `delete` each, so removing k ids costs O(k) and copies none of them; it does not decide which items get re-scored.

## Regression Tracking

CI runs `pnpm bench:compare`, which runs the three gated tasks five times, takes per task the median of the five runs' p50 and compares it with the record of the run's CPU model in `benchmarks/baseline.json`, which keeps one record per CPU model. A regression above 5 % prints a warning annotation; above 15 %, above a task's `target_ms`, or a harness error it exits 2. After a first exit 2 the CI step re-runs the comparison once: a passing re-run leaves a warning annotation, a second exit 2 fails the job. The baseline above is the median of five runs’ p50 (D93), and each record is re-recorded from the `benchmark-results` artifact of the first green run after each Node pin bump. A baseline below the 0.01 ms floor (only `stateUpdate:navigate`) is reported, not compared. Given the noise above, a single flagged run is a prompt to re-run, not proof of a regression. Thresholds judge a run only against the record of its own CPU: a run on a CPU without a record prints the comparison with every record, each row naming both CPUs, says that no threshold applies and exits 0. When the record's Node differs from the machine's, the tool says so before the table.

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
> Runner noise is +/-20-40 %. Each CI comparison is the median of five runs on one shared runner, so the 5 % and 15 % comparison below is a coarse tripwire, not a precise regression gate, and CI goes red only when a re-run of the comparison also fails (see [Regression Tracking](#regression-tracking)); the one sub-0.01 ms baseline (`stateUpdate:navigate`, 0.75 microseconds) is reported below a 0.01 ms floor instead of compared, and a median above its `target_ms` still fails. Run `pnpm bench:compare` locally for numbers from your own machine.

### Gated tasks

Three tasks are gated. Median and P99 are the mean of the three runs’ medians and p99s, in milliseconds; the target is the budget recorded in the baseline.

| Task | Median | P99 | Target |
|------|--------|-----|--------|
| `search:ts-scorer-10k` (TypeScript scorer over 10K items) | 3.46 ms | 7.03 ms | 16 ms |
| `stateUpdate:navigate` (arrow-key navigation) | 0.00075 ms | 0.0078 ms | 1 ms |
| `stateUpdate:searchChange` (search change) | 0.37 ms | 0.61 ms | 4 ms |

The relative margin of error (tinybench `rme`, averaged over the three runs) of `stateUpdate:navigate` in that run was 11 %, so treat its figure as an order of magnitude.

### Bundle size

The figures come from [`benchmarks/size-history/1.5.0.json`](https://github.com/ABCrimson/modern-cmdk/blob/4498a0f/benchmarks/size-history/1.5.0.json) (git blob `3df2e95`, committed in `4498a0f`), measured at commit `d5ce6ff` on 2026-11-07 with size-limit 14.3.0 on Node v28.0.0-nightly20261106ec4d4c2950 by `pnpm size` (`pnpm build && size-limit`). Each row is one entry of `size-limit` in the root `package.json`. Sizes are gzip bytes unless the method says otherwise; `react`, `react-dom`, `react/jsx-runtime`, `radix-ui` and, where listed, `modern-cmdk` are externals that size-limit ignores. The 1.4.0 record had one codemod row, 3325793 B for the whole bin. Run `pnpm size` for a reading from your own checkout.

| Entry | Size | Limit | Method |
|-------|------|-------|--------|
| `modern-cmdk` (core) | 6399 B | 7.4 kB | `dist/core/index.mjs`, minified and gzipped |
| `modern-cmdk/react` (adapter only) | 5539 B | 5.7 kB | `dist/react/index.mjs`, gzip; `modern-cmdk` is ignored, so the core is not counted |
| `modern-cmdk` + `modern-cmdk/react` | 10003 B | 10.85 kB | `dist/react/index.mjs`, gzip; `modern-cmdk` is not ignored, so the one core is counted once |
| `modern-cmdk/react/dialog` (adapter only) | 1422 B | 1.5 kB | `dist/react/dialog.mjs`, gzip; the `radix-ui` import is ignored |
| `modern-cmdk/react`: `CommandSeparator` only | 4812 B | 5 kB | `import { CommandSeparator }` from `dist/react/index.mjs`, gzip; the bundle still contains `CommandDialog`, `CommandRoot` and the `radix-ui` import because `Command` is a compound (see [SSR](/guide/ssr#tree-shaking)) |
| `modern-cmdk/styles.css` | 3959 B | 4 kB | `dist/react/styles.css`, gzip |
| `modern-cmdk` codemod bin (bundled) | 3150372 B (raw) | 3.4 MB | `dist/codemod/*.mjs` plus `dist/codemod/transforms/*.mjs` installed size, no compression; includes the 897 B shim |
| `modern-cmdk` codemod shim (`bin.mjs`) | 897 B (raw) | 1000 B | `dist/codemod/bin.mjs` installed size, no compression |
| `modern-cmdk-codemod` (own files) | 98030 B (raw) | 100000 B | `dist/*.mjs` plus `dist/transforms/*.mjs` of `packages/modern-cmdk-codemod`, jscodeshift excluded, no compression |

For comparison, 1.3 (commit `85a33bf`, size-limit at that commit, quoted from the `baseline_1_3` block of [`benchmarks/size-history/1.4.0.json`](https://github.com/ABCrimson/modern-cmdk/blob/5f1e01e/benchmarks/size-history/1.4.0.json) (git blob `4687fa7`)) measured `modern-cmdk` at 6355 B and `modern-cmdk/react` at 9844 B, where the React figure was `dist/react/index.mjs` with the core inlined: the pair summed to 16199 B because the core was counted twice. The 1.4.0 build keeps the core external to the adapter (`modern-cmdk` is imported by name): in 1.4.0 the adapter alone was 5403 B and the core plus the adapter together 9830 B (1.4.0 record), and 1.5.0 measures 5539 B and 10003 B.

## Browser bench

The figures above time the headless machine in Node. The browser bench (`benchmarks/browser/run.ts`) times a full React mount in Chromium: it builds the playground (with `react-dom/profiling`, so React's Profiler reports commit durations), serves it, and drives its `/bench` route at 1000 and 10000 items. Each size runs 1 warm-up and 7 measured runs, every run a fresh page load, and a figure is the median of the 7. Only the 10K mount is checked, by a tripwire at 75 ms (D94), set from the runner's first measurement of 47.80 ms; the other figures are recorded.

The figures below are the CI job "Browser bench (Chromium, 10K mount gate)" on a GitHub-hosted Ubuntu runner (AMD EPYC 7763, 4 cores, Linux 7.0.0-1019-azure, Node v28.0.0-nightly20261107a43bfb5bb2) with Chromium 158.0.8127.18, new headless mode, measured at commit `8362840` on 2026-11-08 and recorded in `benchmarks/browser/results/1.4.0-8362840.json`. The `1.4.0` in the file name is the version in the package manifest when the run was made, not a release that was benchmarked. The items come from the shared `basic` dataset (`apps/playground/src/bench/dataset.ts`), the query is `g` (250 matches at 1K, 2500 at 10K), and times are in milliseconds.

| Metric | N = 1000 | N = 10000 |
|--------|----------|-----------|
| Mount (first `REGISTER_ITEM` sent to the first state holding all N items) | 27.4 | 47.8 |
| Filter (keystroke to the first state with the new search) | 11.0 | 15.5 |
| Keystroke to paint (the keystroke to the animation frame after the one that shows the result) | 28.6 | 244.1 |
| React commit of the mount (sum of Profiler `actualDuration`) | 25.3 | 145.3 |
| React commit of the filter | 5.7 | 46.7 |

The seven 10K mount runs ranged from 40.7 to 59.7 ms around the 47.80 ms median. For context, the same harness on the development machine (Intel Core Ultra 9 290HX Plus, Windows) measured a 10K mount median of 18.80 ms on 2026-11-08; a shared CI runner is slower and noisier, so read the table above, not that line, as the reference.

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

CI runs `pnpm bench:compare`, which runs the three gated tasks five times, takes per task the median of the five runs' p50 and compares it with `benchmarks/baseline.json`. A regression above 5 % prints a warning annotation; above 15 %, above a task's `target_ms`, or a harness error it exits 2. After a first exit 2 the CI step re-runs the comparison once: a passing re-run leaves a warning annotation, a second exit 2 fails the job. The baseline above was recorded under the earlier rule (the mean of three runs) and is re-recorded from the `benchmark-results` artifact of the first green run after each Node pin bump. A baseline below the 0.01 ms floor (only `stateUpdate:navigate`) is reported, not compared. Given the noise above, a single flagged run is a prompt to re-run, not proof of a regression. When the baseline's CPU or Node differs from the machine running the comparison, the tool says so before the table.

// benchmarks/browser/run.ts
// The browser bench and the 1.6.0 mount gate (ruling R5): builds the playground in production mode,
// serves it, and drives its /bench route in Chromium at N = 1000 and 10000 (1 warm-up + 7 measured
// runs each, every run a fresh page load). It measures the mount, the filter keystroke, the
// keystroke-to-paint time and the React commit durations (recorded, not gated), writes
// benchmarks/browser/results/<version>-<sha>.json and fails when the 10K mount median is above 50 ms.
// Exit codes: 0 = the 10K mount median is at or below the threshold, 1 = it is above (the gate
// failed), 2 = harness error (build, server, browser or page error, timeout, a rejected page result,
// an unwritable results file). Nothing is retried.
// Runs under Node's native type stripping, no loader: `node benchmarks/browser/run.ts [--out <path>]`.
// Requires: pnpm build (the playground bundles packages/modern-cmdk/dist), the Playwright Chromium
// (`pnpm exec playwright install chromium`).
//
// Every metric is measured on ONE build: the playground's production build with `react-dom/client`
// aliased to `react-dom/profiling`, because React's <Profiler> reports no timings in the plain
// production build. The build goes to a fresh temp directory, never apps/playground/dist.

import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';
import type {
  BenchFilterResult,
  BenchMountResult,
  BenchSize,
} from '../../apps/playground/src/bench/result-types.ts';
import {
  GATE_METRIC,
  GATE_N,
  type GateVerdict,
  gateVerdict,
  SAMPLE_COUNT,
  type Summary,
  summarize,
} from './stats.ts';

// ── Constants ──────────────────────────────────────────────────────────────────

const SIZES: readonly BenchSize[] = [1000, 10000];
const WARMUP_RUNS = 1;
const QUERY = 'g';
const DATASET_VARIANT = 'basic';

/**
 * Bounds on every wait, in ms. A failed wait fails the whole run loudly (exit 2) naming N, run and
 * metric; nothing is retried and a bound is never raised to mask a slow run. The 10K mount registers
 * 10K items twice (the list switches to its virtual wrapper and remounts them), ~15 s on this
 * branch's unbatched path on a developer laptop (P05 measured ~9.9 s for the first registration
 * alone), so the 10K settle bound is 8x that; the 1K bound is the same factor of its ~1 s.
 */
const TIMEOUT_MS = {
  pageLoad: 30_000,
  mounted: { 1000: 30_000, 10000: 120_000 },
  frames: 10_000,
  focus: 10_000,
  filtered: 30_000,
} as const;

const METRICS = [
  'mount_ms',
  'filter_ms',
  'keystroke_to_paint_ms',
  'mount_commit_ms',
  'filter_commit_ms',
] as const;
type Metric = (typeof METRICS)[number];

const METRIC_DEFINITIONS: Readonly<Record<Metric, string>> = {
  mount_ms:
    'performance.measure from the first REGISTER_ITEM sent to the machine to the first state emit whose filteredIds holds all N items',
  filter_ms:
    'performance.measure from a keystroke (capturing keydown listener on the input) to the first state emit whose search equals the new query',
  keystroke_to_paint_ms:
    'performance.measure from the same keystroke to the requestAnimationFrame callback scheduled from that emit (runs at the start of the next frame, before it paints)',
  mount_commit_ms:
    "React commit, recorded not gated: the sum of Profiler onRender actualDuration over the mount's commits, from the first render through the first commit after the all-N emit",
  filter_commit_ms:
    "React commit, recorded not gated: the sum of Profiler onRender actualDuration over the filter's commits, from the keydown through the paint mark",
};

const BUILD_DESCRIPTION =
  "apps/playground production build (vite build, apps/playground/vite.config.ts) with resolve.alias 'react-dom/client' -> 'react-dom/profiling' so <Profiler> timings exist; one build serves every metric; served by vite preview; page /bench, no StrictMode";

const repoRoot = path.resolve(import.meta.dirname, '../..');
const appDir = path.join(repoRoot, 'apps/playground');

// ── Types ──────────────────────────────────────────────────────────────────────

interface RunSample {
  readonly run: number;
  readonly wall_ms: number;
  readonly mount: BenchMountResult;
  readonly filter: BenchFilterResult;
}

interface SizeResult {
  readonly n: BenchSize;
  readonly warmup: readonly RunSample[];
  readonly runs: readonly RunSample[];
  readonly stats: Readonly<Record<Metric, Summary>>;
}

/** The part of Vite's JS API the harness uses (vite is resolvable from apps/playground only, so its types are not importable here). */
interface ViteApi {
  build(config: object): Promise<unknown>;
  preview(config: object): Promise<{
    readonly resolvedUrls: { readonly local: readonly string[] } | null;
    close(): Promise<void>;
  }>;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function git(...args: string[]): string {
  return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf-8' }).trim();
}

function parseOut(argv: readonly string[]): string | null {
  const flag = argv.indexOf('--out');
  if (flag === -1) return null;
  const value = argv[flag + 1];
  if (value === undefined || value.startsWith('--')) throw new Error('--out needs a path');
  return path.resolve(value);
}

/** Reject after `ms`, naming `what`; the other promise is not cancelled, the run is over by then. */
async function bounded<T>(what: string, ms: number, work: Promise<T>): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${what}: no result within ${ms} ms`)), ms);
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

async function loadVite(): Promise<ViteApi> {
  // vite is a devDependency of the playground only: anchor the resolution there.
  const viteEntry = createRequire(path.join(appDir, 'package.json')).resolve('vite');
  return (await import(pathToFileURL(viteEntry).href)) as ViteApi;
}

function pick(sample: RunSample, metric: Metric): number {
  switch (metric) {
    case 'mount_ms':
      return sample.mount.mount_ms;
    case 'filter_ms':
      return sample.filter.filter_ms;
    case 'keystroke_to_paint_ms':
      return sample.filter.keystroke_to_paint_ms;
    case 'mount_commit_ms':
      return sample.mount.mount_commit_ms;
    case 'filter_commit_ms':
      return sample.filter.filter_commit_ms;
  }
}

// ── One run ────────────────────────────────────────────────────────────────────

async function measureRun(
  browser: Awaited<ReturnType<typeof chromium.launch>>,
  baseUrl: string,
  n: BenchSize,
  run: number,
): Promise<RunSample> {
  const label = `N=${n} run ${run}`;
  const started = performance.now();
  const context = await browser.newContext();
  // The full Chromium build asks for /favicon.ico (the playground ships none; the headless shell never asks):
  // answer it with an empty 204 so the one resource that is not part of the page cannot read as a page error
  await context.route('**/favicon.ico', (route) => route.fulfill({ status: 204 }));
  try {
    const page = await context.newPage();
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(`pageerror: ${error.message}`));
    page.on('console', (message) => {
      if (message.type() === 'error') {
        pageErrors.push(`console.error: ${message.text()} (${message.location().url})`);
      }
    });
    const failOnPageErrors = (): void => {
      if (pageErrors.length > 0) throw new Error(`${label}: ${pageErrors.join(' | ')}`);
    };

    await page.goto(`${baseUrl}bench?n=${n}`, { timeout: TIMEOUT_MS.pageLoad, waitUntil: 'load' });
    await page
      .waitForFunction(() => ['mounted', 'error'].includes(window.__cmdkBench?.phase ?? ''), null, {
        timeout: TIMEOUT_MS.mounted[n],
      })
      .catch((error: unknown) => {
        throw new Error(`${label}, metric mount: ${(error as Error).message}`);
      });
    failOnPageErrors();

    await bounded(
      `${label}: two animation frames`,
      TIMEOUT_MS.frames,
      page.evaluate(
        () =>
          new Promise<void>((resolve) => {
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
          }),
      ),
    );
    await page.locator('input[data-command-input]').focus({ timeout: TIMEOUT_MS.focus });
    await page.keyboard.press(QUERY);
    await page
      .waitForFunction(
        () => ['filtered', 'error'].includes(window.__cmdkBench?.phase ?? ''),
        null,
        {
          timeout: TIMEOUT_MS.filtered,
        },
      )
      .catch((error: unknown) => {
        throw new Error(
          `${label}, metrics filter and keystroke-to-paint: ${(error as Error).message}`,
        );
      });
    failOnPageErrors();

    const state = await page.evaluate(() => window.__cmdkBench);
    if (state?.phase === 'error') throw new Error(`${label}: page error: ${state.message}`);
    if (state?.phase !== 'filtered')
      throw new Error(`${label}: page ended in phase ${state?.phase}`);
    if (state.mount.n !== n) throw new Error(`${label}: the page measured N=${state.mount.n}`);
    if (state.mount.register_sends !== n || state.mount.registry_size_at_install !== 0) {
      throw new Error(
        `${label}: probe order broken: registry ${state.mount.registry_size_at_install} at install (want 0), ${state.mount.register_sends} sends at the all-N emit (want ${n})`,
      );
    }
    if (state.filter.query !== QUERY || state.filter.filtered_count < 1) {
      throw new Error(
        `${label}: query ${JSON.stringify(state.filter.query)} filtered to ${state.filter.filtered_count} items`,
      );
    }
    return { run, wall_ms: performance.now() - started, mount: state.mount, filter: state.filter };
  } finally {
    await context.close();
  }
}

// ── Reporting ──────────────────────────────────────────────────────────────────

function fmt(value: number): string {
  return value.toFixed(2);
}

function printTable(results: readonly SizeResult[]): void {
  const rows: string[][] = [['N', 'metric', 'median ms', 'min', 'max']];
  for (const result of results) {
    for (const metric of METRICS) {
      const stats = result.stats[metric];
      rows.push([String(result.n), metric, fmt(stats.median), fmt(stats.min), fmt(stats.max)]);
    }
  }
  const widths =
    rows[0]?.map((_, column) => Math.max(...rows.map((row) => row[column]?.length ?? 0))) ?? [];
  for (const row of rows) {
    console.log(row.map((cell, column) => cell.padStart(widths[column] ?? 0)).join('  '));
  }
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main(): Promise<number> {
  const outOverride = parseOut(process.argv.slice(2));
  const vite = await loadVite();
  const outDir = await mkdtemp(path.join(os.tmpdir(), 'cmdk-bench-'));
  let server: Awaited<ReturnType<ViteApi['preview']>> | null = null;
  let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;
  try {
    const configFile = path.join(appDir, 'vite.config.ts');
    console.log(`building the playground (profiling) into ${outDir}`);
    await vite.build({
      root: appDir,
      configFile,
      logLevel: 'warn',
      build: { outDir, emptyOutDir: true },
      resolve: { alias: { 'react-dom/client': 'react-dom/profiling' } },
    });

    server = await vite.preview({
      root: appDir,
      configFile,
      build: { outDir },
      preview: { host: '127.0.0.1', port: 0, strictPort: false },
    });
    const baseUrl = server.resolvedUrls?.local[0];
    if (baseUrl === undefined) throw new Error('vite preview is not listening on any URL');

    // channel 'chromium' is Playwright's new headless mode on the full Chromium build, the binary
    // chromium.executablePath() names (the default headless launch runs chromium_headless_shell instead)
    browser = await chromium.launch({ channel: 'chromium', headless: true });
    const chromiumVersion = browser.version();
    const executable = chromium.executablePath();
    console.log(
      `Chromium ${chromiumVersion} (new headless, channel chromium; ${executable}), ${baseUrl}`,
    );

    const results: SizeResult[] = [];
    const wallStart = performance.now();
    for (const n of SIZES) {
      const warmup: RunSample[] = [];
      const runs: RunSample[] = [];
      for (let run = 0; run < WARMUP_RUNS + SAMPLE_COUNT; run++) {
        const sample = await measureRun(browser, baseUrl, n, run);
        (run < WARMUP_RUNS ? warmup : runs).push(sample);
        console.log(
          `N=${n} run ${run}${run < WARMUP_RUNS ? ' (warm-up)' : ''}: mount ${fmt(sample.mount.mount_ms)} ms, filter ${fmt(sample.filter.filter_ms)} ms, paint ${fmt(sample.filter.keystroke_to_paint_ms)} ms, wall ${fmt(sample.wall_ms)} ms`,
        );
      }
      const stats = Object.fromEntries(
        METRICS.map((metric) => [metric, summarize(runs.map((sample) => pick(sample, metric)))]),
      ) as Record<Metric, Summary>;
      results.push({ n, warmup, runs, stats });
    }
    const totalWallMs = performance.now() - wallStart;

    const gateStats = results.find((result) => result.n === GATE_N)?.stats.mount_ms;
    if (gateStats === undefined) throw new Error(`no N=${GATE_N} result to gate`);
    const gate: GateVerdict = gateVerdict(GATE_METRIC, GATE_N, gateStats.median);

    const version = (
      JSON.parse(
        await readFile(path.join(repoRoot, 'packages/modern-cmdk/package.json'), 'utf-8'),
      ) as {
        version: string;
      }
    ).version;
    const sha = git('rev-parse', '--short', 'HEAD');
    // Untracked files under benchmarks/browser/results are the previous runs' own output, not the build's inputs
    const dirty =
      git('status', '--porcelain', '--', '.', ':(exclude)benchmarks/browser/results') !== '';
    const outPath =
      outOverride ?? path.join(import.meta.dirname, 'results', `${version}-${sha}.json`);

    const document = {
      date: new Date().toISOString(),
      version,
      sha,
      dirty,
      runner: {
        os: `${os.platform()} ${os.arch()}`,
        release: os.release(),
        cpu: os.cpus()[0]?.model ?? null,
        cores: os.availableParallelism(),
        total_memory_bytes: os.totalmem(),
        node: process.version,
        ci: process.env.CI === 'true',
      },
      browser: {
        name: 'chromium',
        version: chromiumVersion,
        headless: true,
        headless_mode:
          'new (channel chromium: the full Chromium build, not chromium_headless_shell)',
        executable: path.basename(path.dirname(path.dirname(executable))),
      },
      build: BUILD_DESCRIPTION,
      dataset_variant: DATASET_VARIANT,
      query: QUERY,
      runs: { warmup: WARMUP_RUNS, measured: SAMPLE_COUNT },
      timeouts_ms: TIMEOUT_MS,
      total_wall_ms: totalWallMs,
      metric_definitions: METRIC_DEFINITIONS,
      results,
      gate,
    };
    await mkdir(path.dirname(outPath), { recursive: true });
    await writeFile(outPath, `${JSON.stringify(document, null, 2)}\n`);

    printTable(results);
    console.log(`${gate.message}`);
    console.log(`results: ${outPath}`);
    return gate.verdict === 'pass' ? 0 : 1;
  } finally {
    await browser?.close();
    await server?.close();
    await rm(outDir, { recursive: true, force: true });
  }
}

try {
  process.exitCode = await main();
} catch (error: unknown) {
  console.error(
    `browser bench harness error: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`,
  );
  process.exitCode = 2;
}

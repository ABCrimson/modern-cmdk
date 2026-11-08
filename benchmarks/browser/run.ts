// benchmarks/browser/run.ts
// The browser bench and the 1.6.0 mount gate (ruling R5): builds the playground in production mode,
// serves it, and drives its /bench route in Chromium at N = 1000 and 10000 (1 warm-up + 7 measured
// runs each, every run a fresh page load). It measures the mount, the filter keystroke, the
// keystroke-to-paint time and the React commit durations (recorded, not gated), writes
// benchmarks/browser/results/<version>-<sha>.json and fails when the 10K mount median is above the
// tripwire threshold, MOUNT_GATE_THRESHOLD_MS in stats.ts (75 ms: 1.5x the 47.80 ms median CI run
// 42455685144 measured on the ubuntu-26.04 runner on 2026-11-08, rounded up to 5 ms; D94).
// Exit codes: 0 = the 10K mount median is at or below the threshold, 1 = it is above (the gate
// failed), 2 = harness error (build, server, browser or page error, timeout, a rejected page result,
// an unwritable results file, a checkout whose HEAD or dirty state changed during the run, a run past
// the harness deadline, a signal, a failed cleanup). Nothing is retried.
// The results file is written unformatted: run `pnpm exec biome format --write <file>` before committing it
// (the repository lint formats every JSON file).
// Runs under Node's native type stripping, no loader:
//   node benchmarks/browser/run.ts [--out <path>] [--modern-cmdk <package dir>]
// --out replaces the default results path (CI writes outside the checkout so a stale committed file can
// never stand in for this run). --modern-cmdk <dir> is a DIAGNOSTIC for measuring another tree's core
// before it lands, never used in CI: the build aliases `modern-cmdk` (every export of <dir>/package.json)
// to <dir>'s dist and dedupes react, and the results JSON records core_source (the path and that
// directory's `git rev-parse --short HEAD`). The directory's dist must already be built; this script
// never builds it.
// Requires: pnpm build (the playground bundles packages/modern-cmdk/dist), the Playwright Chromium
// (`pnpm exec playwright install chromium`).
//
// Every metric is measured on ONE build: the playground's production build with `react-dom/client`
// aliased to `react-dom/profiling`, because React's <Profiler> reports no timings in the plain
// production build. The build goes to a fresh temp directory, never apps/playground/dist.

import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
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
 * metric; nothing is retried and a bound is never raised to mask a slow run. Every bound is a hang
 * bound, far above what a run takes: on CI run 42455685144 (2026-11-08, ubuntu-26.04 runner,
 * benchmarks/browser/results/1.4.0-8362840.json) a measured run's wall was 1764 to 1974 ms at 10K and
 * 493 to 528 ms at 1K (the warm-up runs 1784 and 592 ms). The mounted wait is bounded at 120 s at
 * 10K (about 60x the slowest 10K run's wall) and 30 s at 1K (about 57x the slowest 1K run's wall);
 * the page load, key press and filter waits are 10 to 30 s against sub-second steps. Lowering a bound
 * buys nothing and risks a false failure on a slower runner.
 */
const TIMEOUT_MS = {
  build: 300_000,
  preview: 60_000,
  launch: 60_000,
  context: 30_000,
  pageLoad: 30_000,
  mounted: { 1000: 30_000, 10000: 120_000 },
  frames: 10_000,
  focus: 10_000,
  press: 10_000,
  filtered: 30_000,
  result: 10_000,
  cleanupStep: 30_000,
} as const;

/**
 * The worst case of the named bounds above is far past any real run: one 10K run can wait context 30 +
 * route 30 + page 30 + load 30 + mounted 120 + frames 10 + focus 10 + press 10 + filtered 30 + result 10 +
 * close 30 = 340 s, so an 8-run 10K series alone is ~45 minutes. A hang is bounded by this overall deadline
 * instead: it fails loudly (exit 2) naming where the harness was, before the CI job's own timeout. 5x the
 * 185 s a full run takes here.
 */
const HARNESS_DEADLINE_MS = 15 * 60_000;

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
    'performance.measure from the same keystroke to the requestAnimationFrame callback scheduled from that emit (fires one frame after the paint that shows the result: the machine emits inside its own rAF callback and React commits in that same frame)',
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

interface CoreSource {
  /** The package directory whose dist the build used; null = the workspace's own packages/modern-cmdk. */
  readonly path: string | null;
  /** `git rev-parse --short HEAD` of that directory when it is a git checkout. */
  readonly git_sha: string | null;
  /** That checkout has uncommitted changes (null when it is not a git checkout): its dist may differ from its source. */
  readonly dirty: boolean | null;
  /** ISO mtime of <dir>/dist/core/index.mjs, to compare with the source it was built from. */
  readonly dist_mtime: string;
}

interface Options {
  readonly out: string | null;
  readonly modernCmdk: string | null;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function git(...args: string[]): string {
  return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf-8' }).trim();
}

function parseOptions(argv: readonly string[]): Options {
  let out: string | null = null;
  let modernCmdk: string | null = null;
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag !== '--out' && flag !== '--modern-cmdk') throw new Error(`unknown argument ${flag}`);
    const value = argv[++i];
    if (value === undefined || value.startsWith('--')) throw new Error(`${flag} needs a path`);
    if (flag === '--out') out = path.resolve(value);
    else modernCmdk = path.resolve(value);
  }
  return { out, modernCmdk };
}

/** HEAD and the dirty flag. Untracked files under benchmarks/browser/results are earlier runs' own output, not the build's inputs. */
function repoState(): { readonly sha: string; readonly dirty: boolean } {
  return {
    sha: git('rev-parse', '--short', 'HEAD'),
    dirty: git('status', '--porcelain', '--', '.', ':(exclude)benchmarks/browser/results') !== '',
  };
}

/** Vite aliases for --modern-cmdk: every export of the package at `dir`, pointed at that dir's files. */
async function coreAliases(dir: string): Promise<{ find: RegExp; replacement: string }[]> {
  const manifest = JSON.parse(await readFile(path.join(dir, 'package.json'), 'utf-8')) as {
    name: string;
    exports: Record<string, string | { default?: string }>;
  };
  if (manifest.name !== 'modern-cmdk')
    throw new Error(`--modern-cmdk ${dir} is not the modern-cmdk package`);
  const aliases: { find: RegExp; replacement: string }[] = [];
  for (const [key, target] of Object.entries(manifest.exports)) {
    if (key === './package.json') continue;
    const file = typeof target === 'string' ? target : target.default;
    if (file === undefined) throw new Error(`export ${key} of ${dir} has no default target`);
    const absolute = path.join(dir, file);
    await readFile(absolute).catch(() => {
      throw new Error(`${absolute} is missing: build ${dir} first (this script never builds it)`);
    });
    const specifier = key === '.' ? 'modern-cmdk' : `modern-cmdk/${key.slice(2)}`;
    // Exact-match regex: the specifier holds only letters, '-', '.' and '/'
    const escaped = specifier.replace(/[./]/g, (character) => `\\${character}`);
    aliases.push({ find: new RegExp(`^${escaped}$`), replacement: absolute });
  }
  return aliases;
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

// ── Resources and cleanup ──────────────────────────────────────────────────────

type PreviewServer = Awaited<ReturnType<ViteApi['preview']>>;
type Browser = Awaited<ReturnType<typeof chromium.launch>>;

const resources: { browser: Browser | null; server: PreviewServer | null; outDir: string | null } =
  {
    browser: null,
    server: null,
    outDir: null,
  };
/** Failures of cleanup steps (a closed context, browser, server, the temp dir): exit 2 even when the measurement itself completed. */
const cleanupErrors: string[] = [];
/** Where the harness is, for the deadline and signal messages. */
let progress = 'starting';

/** Every step runs even if an earlier one throws; each is bounded. Idempotent. */
async function cleanup(): Promise<void> {
  const { browser, server, outDir } = resources;
  resources.browser = null;
  resources.server = null;
  resources.outDir = null;
  const step = async (name: string, work: () => Promise<unknown>): Promise<void> => {
    try {
      await bounded(`cleanup ${name}`, TIMEOUT_MS.cleanupStep, work());
    } catch (error: unknown) {
      cleanupErrors.push(error instanceof Error ? error.message : String(error));
    }
  };
  if (browser) await step('browser close', () => browser.close());
  if (server) await step('preview server close', () => server.close());
  if (outDir) {
    await step('temp dir removal', () =>
      rm(outDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }),
    );
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
  progress = label;
  const context = await bounded(`${label}: new context`, TIMEOUT_MS.context, browser.newContext());
  // The full Chromium build asks for /favicon.ico (the playground ships none; the headless shell never asks):
  // answer it with an empty 204 so the one resource that is not part of the page cannot read as a page error
  try {
    await bounded(
      `${label}: route`,
      TIMEOUT_MS.context,
      context.route('**/favicon.ico', (route) => route.fulfill({ status: 204 })),
    );
    const page = await bounded(`${label}: new page`, TIMEOUT_MS.context, context.newPage());
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
    await bounded(`${label}: key press`, TIMEOUT_MS.press, page.keyboard.press(QUERY));
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

    const state = await bounded(
      `${label}: reading the result`,
      TIMEOUT_MS.result,
      page.evaluate(() => window.__cmdkBench),
    );
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
    await bounded(`${label}: context close`, TIMEOUT_MS.cleanupStep, context.close()).catch(
      (error: unknown) => cleanupErrors.push(String(error)),
    );
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
  const options = parseOptions(process.argv.slice(2));
  if (options.modernCmdk !== null && options.out === null) {
    throw new Error(
      "--modern-cmdk needs --out: a diagnostic result measured on another tree's core must never take this tree's results name",
    );
  }
  const vite = await loadVite();
  // HEAD and dirty as the build sees them; re-read after the runs, and the run is void if either moved
  const before = repoState();
  const coreSource = await describeCore(options.modernCmdk);
  const alias = [
    { find: /^react-dom\/client$/, replacement: 'react-dom/profiling' },
    ...(options.modernCmdk === null ? [] : await coreAliases(options.modernCmdk)),
  ];
  const outDir = await mkdtemp(path.join(os.tmpdir(), 'cmdk-bench-'));
  resources.outDir = outDir;
  {
    const configFile = path.join(appDir, 'vite.config.ts');
    progress = 'vite build';
    console.log(`building the playground (profiling) into ${outDir}`);
    await bounded(
      'vite build',
      TIMEOUT_MS.build,
      vite.build({
        root: appDir,
        configFile,
        logLevel: 'warn',
        build: { outDir, emptyOutDir: true },
        // another tree's dist brings its own react copy when resolved from its own directory: one copy only
        resolve: {
          alias,
          ...(options.modernCmdk === null ? {} : { dedupe: ['react', 'react-dom'] }),
        },
      }),
    );

    progress = 'vite preview';
    const server = await bounded(
      'vite preview',
      TIMEOUT_MS.preview,
      vite.preview({
        root: appDir,
        configFile,
        build: { outDir },
        preview: { host: '127.0.0.1', port: 0, strictPort: false },
      }),
    );
    resources.server = server;
    const baseUrl = server.resolvedUrls?.local[0];
    if (baseUrl === undefined) throw new Error('vite preview is not listening on any URL');

    // channel 'chromium' is Playwright's new headless mode on the full Chromium build, the binary
    // chromium.executablePath() names (the default headless launch runs chromium_headless_shell instead)
    progress = 'browser launch';
    const browser = await bounded(
      'browser launch',
      TIMEOUT_MS.launch,
      chromium.launch({ channel: 'chromium', headless: true }),
    );
    resources.browser = browser;
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
    const after = repoState();
    if (after.sha !== before.sha || after.dirty !== before.dirty) {
      throw new Error(
        `the checkout changed during the run (HEAD ${before.sha} -> ${after.sha}, dirty ${before.dirty} -> ${after.dirty}): the result describes no single tree`,
      );
    }
    const { sha, dirty } = after;
    const outPath =
      options.out ?? path.join(import.meta.dirname, 'results', `${version}-${sha}.json`);

    const document = {
      date: new Date().toISOString(),
      version,
      sha,
      dirty,
      core_source: coreSource,
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
      timeouts_ms: { ...TIMEOUT_MS, harness_deadline: HARNESS_DEADLINE_MS },
      total_wall_ms: totalWallMs,
      metric_definitions: METRIC_DEFINITIONS,
      results,
      gate,
    };
    await mkdir(path.dirname(outPath), { recursive: true });
    await writeFile(outPath, `${JSON.stringify(document, null, 2)}\n`);

    printTable(results);
    console.log(gate.message);
    console.log(
      `core: ${coreSource.path ?? 'workspace packages/modern-cmdk'} @ ${coreSource.git_sha ?? 'not a git checkout'}${coreSource.dirty ? ' (dirty)' : ''}, dist built ${coreSource.dist_mtime}`,
    );
    console.log(`results: ${outPath}`);
    return gate.verdict === 'pass' ? 0 : 1;
  }
}

/** Where the core under test comes from: the workspace package (dir null) or another tree's package directory. */
async function describeCore(dir: string | null): Promise<CoreSource> {
  const root = dir ?? path.join(repoRoot, 'packages/modern-cmdk');
  const distMtime = (await stat(path.join(root, 'dist/core/index.mjs'))).mtime.toISOString();
  try {
    const gitIn = (...args: string[]): string =>
      execFileSync('git', ['-C', root, ...args], { encoding: 'utf-8' }).trim();
    return {
      path: dir,
      git_sha: gitIn('rev-parse', '--short', 'HEAD'),
      dirty: gitIn('status', '--porcelain') !== '',
      dist_mtime: distMtime,
    };
  } catch {
    return { path: dir, git_sha: null, dirty: null, dist_mtime: distMtime };
  }
}

/** Clean up, report what is left over, and turn a clean 0/1 into 2 when cleanup itself failed. */
async function finish(code: number): Promise<number> {
  await cleanup();
  if (cleanupErrors.length === 0) return code;
  console.error(`browser bench cleanup failed:\n  ${cleanupErrors.join('\n  ')}`);
  return 2;
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    console.error(`browser bench interrupted by ${signal} during: ${progress}`);
    void finish(2).then((exitCode) => process.exit(exitCode));
  });
}
const deadline = setTimeout(() => {
  console.error(
    `browser bench harness error: exceeded the ${HARNESS_DEADLINE_MS} ms deadline during: ${progress}`,
  );
  void finish(2).then((exitCode) => process.exit(exitCode));
}, HARNESS_DEADLINE_MS);
deadline.unref();

let code: number;
try {
  code = await main();
} catch (error: unknown) {
  console.error(
    `browser bench harness error (during ${progress}): ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`,
  );
  code = 2;
}
process.exitCode = await finish(code);

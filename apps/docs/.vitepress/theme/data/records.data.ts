import { readFileSync } from 'node:fs';
import { defineLoader } from 'vitepress';

// Build-time loader for the home page (design-final.md C6, 3.4). Every figure on the page is read here from a
// committed record, never typed: the size record with the highest semver in benchmarks/size-history/, the search
// median in benchmarks/baseline.json, and the version and runtime dependencies in packages/modern-cmdk/package.json.
// The globs resolve relative to this file (VitePress data loaders), five levels up is the repository root.
// A missing size or search record, or a missing entry in it, leaves that figure out (null or undefined) and logs
// console.warn; the build never fails on a missing record. Only the manifest is required.

/** What the home page reads. `sizes` and `search` are null when their record is missing or unreadable. */
export interface RecordsData {
  readonly version: string;
  readonly sizes: {
    /** File name inside benchmarks/size-history/, for example `1.5.0.json`. */
    readonly file: string;
    readonly sha: string;
    /** `YYYY-MM-DD`, the date part of the record's ISO timestamp. */
    readonly date: string;
    readonly sizeLimit: string;
    /** Gzip bytes, selected by the exact entry name; absent when the record has no such entry. */
    readonly core?: number;
    readonly react?: number;
    readonly dialog?: number;
    readonly coreReact?: number;
    readonly styles?: number;
  } | null;
  readonly search: {
    readonly medianMs: number;
    readonly cpu: string;
    readonly cpuCount: number;
    readonly node: string;
    readonly date: string;
    /** The full commit sha; the page shows the first seven characters. */
    readonly commit: string;
  } | null;
  /** Keys of `dependencies` in the manifest. */
  readonly deps: string[];
}

// Entry names in benchmarks/size-history/<version>.json, matched exactly and never by index.
const ENTRY_NAMES = {
  core: 'modern-cmdk (core)',
  react: 'modern-cmdk/react (adapter only)',
  dialog: 'modern-cmdk/react/dialog (adapter only)',
  coreReact: 'modern-cmdk + modern-cmdk/react',
  styles: 'modern-cmdk/styles.css',
} as const;

type SizeKey = keyof typeof ENTRY_NAMES;

const SEMVER = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

interface Version {
  readonly core: readonly [number, number, number];
  readonly pre: readonly string[];
}

function parseVersion(text: string): Version | null {
  const match = SEMVER.exec(text);
  if (!match) return null;
  return {
    core: [Number(match[1]), Number(match[2]), Number(match[3])],
    pre: match[4] ? match[4].split('.') : [],
  };
}

/** SemVer 2.0.0 precedence: the numeric core first, a release above its prereleases, then identifier by identifier. */
function compareVersions(a: Version, b: Version): number {
  for (let i = 0; i < 3; i++) {
    const diff = (a.core[i] ?? 0) - (b.core[i] ?? 0);
    if (diff !== 0) return diff;
  }
  if (a.pre.length === 0 || b.pre.length === 0) return b.pre.length - a.pre.length;
  for (let i = 0; i < Math.min(a.pre.length, b.pre.length); i++) {
    const left = a.pre[i] ?? '';
    const right = b.pre[i] ?? '';
    const leftNumeric = /^\d+$/.test(left);
    const rightNumeric = /^\d+$/.test(right);
    if (leftNumeric && rightNumeric) {
      const diff = Number(left) - Number(right);
      if (diff !== 0) return diff;
    } else if (leftNumeric !== rightNumeric) {
      return leftNumeric ? -1 : 1;
    } else if (left !== right) {
      return left < right ? -1 : 1;
    }
  }
  return a.pre.length - b.pre.length;
}

function warn(message: string): void {
  // biome-ignore lint/suspicious/noConsole: the build log is where a missing record is reported
  console.warn(`[records.data] ${message}`);
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined;
}

function finite(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function fileName(path: string): string {
  return path.replaceAll('\\', '/').split('/').at(-1) ?? path;
}

function inDirectory(path: string, directory: string): boolean {
  return path.replaceAll('\\', '/').split('/').at(-2) === directory;
}

function readSizes(paths: readonly string[]): RecordsData['sizes'] {
  const files = paths
    .flatMap((path) => {
      const name = fileName(path);
      const version = parseVersion(name.replace(/\.json$/, ''));
      return version ? [{ path, name, version }] : [];
    })
    .sort((a, b) => compareVersions(b.version, a.version));
  const latest = files[0];
  if (!latest) {
    warn('no benchmarks/size-history/<semver>.json record: the size figures are left out');
    return null;
  }
  let record: unknown;
  try {
    record = readJson(latest.path);
  } catch (error) {
    warn(
      `benchmarks/size-history/${latest.name} is unreadable (${String(error)}): the size figures are left out`,
    );
    return null;
  }
  if (!isRecord(record)) {
    warn(`benchmarks/size-history/${latest.name} is not an object: the size figures are left out`);
    return null;
  }
  const sha = text(record.sha);
  const iso = text(record.date);
  const sizeLimit = text(record.sizeLimit);
  if (!(sha && iso && sizeLimit)) {
    warn(
      `benchmarks/size-history/${latest.name} lacks sha, date or sizeLimit: the size figures are left out`,
    );
    return null;
  }
  const entries = Array.isArray(record.entries) ? record.entries.filter(isRecord) : [];
  const sizes: { -readonly [K in SizeKey]?: number } = {};
  for (const key of Object.keys(ENTRY_NAMES) as SizeKey[]) {
    const size = finite(entries.find((entry) => entry.name === ENTRY_NAMES[key])?.size);
    if (size === undefined) {
      warn(
        `benchmarks/size-history/${latest.name} has no usable entry "${ENTRY_NAMES[key]}": that figure is left out`,
      );
    } else {
      sizes[key] = size;
    }
  }
  return { file: latest.name, sha, date: iso.slice(0, 10), sizeLimit, ...sizes };
}

function readSearch(path: string | undefined): RecordsData['search'] {
  if (!path) {
    warn('no benchmarks/baseline.json: the search figure is left out');
    return null;
  }
  try {
    const record = readJson(path);
    const benchmarks = isRecord(record) && isRecord(record.benchmarks) ? record.benchmarks : {};
    const search = isRecord(benchmarks.search) ? benchmarks.search : {};
    const scorer = isRecord(search['ts-scorer-10k']) ? search['ts-scorer-10k'] : {};
    const environment = isRecord(record) && isRecord(record.environment) ? record.environment : {};
    const medianMs = finite(scorer.median_ms);
    const cpu = text(environment.cpu);
    const cpuCount = finite(environment.cpuCount);
    const node = text(environment.node);
    const date = isRecord(record) ? text(record.date) : undefined;
    const commit = isRecord(record) ? text(record.commit) : undefined;
    if (medianMs === undefined || cpuCount === undefined || !(cpu && node && date && commit)) {
      warn(
        'benchmarks/baseline.json lacks benchmarks.search["ts-scorer-10k"].median_ms or its environment: the search figure is left out',
      );
      return null;
    }
    return { medianMs, cpu, cpuCount, node, date, commit };
  } catch (error) {
    warn(
      `benchmarks/baseline.json is unreadable (${String(error)}): the search figure is left out`,
    );
    return null;
  }
}

declare const data: RecordsData;

export { data };

export default defineLoader({
  watch: [
    '../../../../../benchmarks/size-history/*.json',
    '../../../../../benchmarks/baseline.json',
    '../../../../../packages/modern-cmdk/package.json',
  ],
  load(watchedFiles: string[]): RecordsData {
    const manifestPath = watchedFiles.find((path) => fileName(path) === 'package.json');
    if (!manifestPath)
      throw new Error('[records.data] packages/modern-cmdk/package.json was not found');
    const manifest = readJson(manifestPath);
    const version = isRecord(manifest) ? text(manifest.version) : undefined;
    if (!version)
      throw new Error('[records.data] packages/modern-cmdk/package.json has no version');
    const dependencies =
      isRecord(manifest) && isRecord(manifest.dependencies) ? manifest.dependencies : {};
    return {
      version,
      sizes: readSizes(watchedFiles.filter((path) => inDirectory(path, 'size-history'))),
      search: readSearch(watchedFiles.find((path) => fileName(path) === 'baseline.json')),
      deps: Object.keys(dependencies),
    };
  },
});

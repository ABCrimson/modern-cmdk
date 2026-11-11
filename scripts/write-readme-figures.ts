// scripts/write-readme-figures.ts
// Writes the figures that the READMEs quote from the size and speed records, and checks that they are current. Runs
// with Node's native type stripping and needs no install, no build and no network:
//
//   node scripts/write-readme-figures.ts [--check] [--root <dir>] [--main-ref <ref>]
//
// Why: a README quotes sizes and a timing, and a hand-typed number drifts from its record (the 1.7.0 README quoted a
// release candidate's tarball as the published one). Every number below comes from a record this repository
// commits, and the README links the record at the commit that holds it.
//
// Sources:
//   - benchmarks/size-history/<version>.json, the newest by version: the size-limit entries 'modern-cmdk (core)',
//     'modern-cmdk + modern-cmdk/react', 'modern-cmdk/styles.css' (gzip bytes) and 'modern-cmdk codemod bin
//     (installed size)', and the tarball listing of modern-cmdk, which proves the bin is most of the unpacked size
//     (the bin figure is the only tarball figure a README may quote: it is the same in the release candidate and in
//     the published tarball, and a README cannot know its own tarball before the pack). Sizes print in kB or MB of
//     1,000 and 1,000,000 bytes.
//   - benchmarks/baseline.json (schemaVersion 2): the record with the newest date; the median of
//     search.ts-scorer-10k, the runner's CPU and core count, and the date.
//   - packages/modern-cmdk/package.json: the React floor (the lower bound of the react peer range) and
//     "type": "module" (ESM only). apps/docs/guide/installation.md: the measured TypeScript floor.
//   - git: RECORD_COMMIT, the last commit on the main ref (default origin/main) that touches the newest size record or
//     baseline.json; and, for the create-modern-cmdk README, the last commit on the main ref that touches
//     packages/create-modern-cmdk/src/versions.ts.
// The records are read from the working tree; the registry is not consulted (nothing the READMEs quote is registry
// data, and the check must give the same answer offline).
//
// What it writes, by file (a file that does not exist is skipped; at least one must exist):
//   - packages/modern-cmdk/README.md and README.md: the lines between <!-- figures-line:start --> and
//     <!-- figures-line:end -->, and between <!-- figures:start --> and <!-- figures:end --> (the sizes table with its
//     two footnotes). Each marker pair must occur exactly once, each marker on a line of its own; a README without
//     the pair is an error, not something the script inserts.
//   - packages/create-modern-cmdk/README.md: the commit in the link to packages/create-modern-cmdk/src/versions.ts
//     (https://github.com/ABCrimson/modern-cmdk/blob/<commit>/packages/create-modern-cmdk/src/versions.ts).
//
// --check writes nothing and exits 1 when a file differs from what it would write, naming the first differing line.
// The commit is compared only when it can be computed: in a shallow clone, or one without the main ref, git cannot
// tell the last commit that touched a file, so --check prints a note, accepts the commit the README already names
// and compares every other byte (scripts/check-repo-links.ts then proves that commit is an ancestor of origin/main).
//
// Idempotent: a second run changes nothing. Exit codes: 0 = written / up to date, 1 = stale (with --check), a missing
// marker pair or record, or a record whose method changed, 2 = usage error.

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

const ROOT: string = resolve(import.meta.dirname, '..');
const DEFAULT_MAIN_REF = 'origin/main';
const REPO_BLOB = 'https://github.com/ABCrimson/modern-cmdk/blob';
const BENCHMARKS_PAGE = 'https://abcrimson.github.io/modern-cmdk/benchmarks.html';
const VERSIONS_FILE = 'packages/create-modern-cmdk/src/versions.ts';

export type ReadmeKind = 'package' | 'root' | 'create';
export const TARGETS: readonly { readonly file: string; readonly kind: ReadmeKind }[] = [
  { file: 'packages/modern-cmdk/README.md', kind: 'package' },
  { file: 'README.md', kind: 'root' },
  { file: 'packages/create-modern-cmdk/README.md', kind: 'create' },
];

interface SizeRecord {
  readonly entries: readonly { readonly name: string; readonly size: number }[];
  readonly tarballs?: Readonly<Record<string, { readonly unpackedSize: number }>>;
}

interface BaselineRecord {
  readonly date: string;
  readonly note: string;
  readonly environment: {
    readonly os?: string;
    readonly runner?: string;
    readonly cpuCount: number;
  };
  readonly benchmarks: {
    readonly search: Readonly<Record<string, { readonly median_ms: number }>>;
  };
}

/** Everything the READMEs quote, read from the records; sha is the commit the links name. */
export interface Figures {
  readonly version: string;
  readonly coreBytes: number;
  readonly reactBytes: number;
  readonly stylesBytes: number;
  readonly binBytes: number;
  readonly searchMs: number;
  readonly cpu: string;
  readonly cores: number;
  readonly githubHosted: boolean;
  readonly recorded: string;
  readonly reactFloor: string;
  readonly typescriptFloor: string;
}

/** The newest record file name by version (1.10.0 is newer than 1.9.0). */
export function newestRecord(names: readonly string[]): string | undefined {
  return names
    .filter((name) => /^\d+\.\d+\.\d+\.json$/.test(name))
    .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))
    .at(-1);
}

/** Bytes as kB of 1,000 bytes, one decimal. */
export function kilobytes(bytes: number): string {
  return (bytes / 1000).toFixed(1);
}

/** Bytes as MB of 1,000,000 bytes, two decimals. */
export function megabytes(bytes: number): string {
  return (bytes / 1_000_000).toFixed(2);
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

/** Reads the figures from the records of a checkout. Throws an Error whose message says what is missing or has changed. */
export function readFigures(root: string): Figures {
  const dir: string = join(root, 'benchmarks/size-history');
  const file: string | undefined = newestRecord(readdirSync(dir));
  if (file === undefined) throw new Error(`no <version>.json record in ${dir}`);
  const version: string = file.slice(0, -'.json'.length);
  const record = readJson<SizeRecord>(join(dir, file));
  const size = (name: string): number => {
    const found = record.entries.find((entry) => entry.name === name);
    if (found === undefined)
      throw new Error(`benchmarks/size-history/${file} has no entry '${name}'`);
    return found.size;
  };
  const binBytes: number = size('modern-cmdk codemod bin (installed size)');
  const tarballKey: string | undefined = Object.keys(record.tarballs ?? {})
    .filter((key) => key.startsWith('modern-cmdk@'))
    .at(-1);
  const unpacked: number | undefined =
    tarballKey === undefined ? undefined : record.tarballs?.[tarballKey]?.unpackedSize;
  if (unpacked === undefined || binBytes <= unpacked / 2) {
    throw new Error(
      `benchmarks/size-history/${file}: the codemod bin (${binBytes} bytes) is not most of the unpacked size (${unpacked ?? 'no tarball listing'}), so the README sentence "Most of the unpacked size ... is the deprecated bin" is no longer true`,
    );
  }

  const baseline = readJson<{
    schemaVersion?: number;
    records?: Record<string, BaselineRecord>;
  }>(join(root, 'benchmarks/baseline.json'));
  if (baseline.schemaVersion !== 2 || baseline.records === undefined) {
    throw new Error('benchmarks/baseline.json is not schemaVersion 2 with a records map');
  }
  const [cpuKey, bench] =
    Object.entries(baseline.records).sort(([, a], [, b]) => b.date.localeCompare(a.date))[0] ?? [];
  if (cpuKey === undefined || bench === undefined)
    throw new Error('benchmarks/baseline.json has no record');
  const searchMs: number | undefined = bench.benchmarks.search['ts-scorer-10k']?.median_ms;
  if (searchMs === undefined) {
    throw new Error('benchmarks/baseline.json has no search.ts-scorer-10k median');
  }
  if (!bench.note.includes("median of the harness's 5 runs' p50")) {
    throw new Error(
      "benchmarks/baseline.json: the note no longer says the median is of 5 runs' p50, which the README footnote states",
    );
  }
  if (!bench.note.includes('+/-20-40 %')) {
    throw new Error(
      'benchmarks/baseline.json: the note no longer states the runner noise of +/-20-40 %, which the README footnote states',
    );
  }

  const manifest = readJson<{ type?: string; peerDependencies?: Record<string, string> }>(
    join(root, 'packages/modern-cmdk/package.json'),
  );
  if (manifest.type !== 'module')
    throw new Error('packages/modern-cmdk is no longer "type": "module"');
  const reactFloor: string | undefined = /^>=\s*(\d+)/.exec(
    manifest.peerDependencies?.react ?? '',
  )?.[1];
  if (reactFloor === undefined)
    throw new Error('the react peer range of modern-cmdk has no >= floor');
  const installation: string = readFileSync(join(root, 'apps/docs/guide/installation.md'), 'utf8');
  const typescriptFloor: string | undefined = /\*\*TypeScript\*\*\s*\|\s*>=\s*(\d+\.\d+)/.exec(
    installation,
  )?.[1];
  if (typescriptFloor === undefined) {
    throw new Error('apps/docs/guide/installation.md has no "| **TypeScript** | >= x.y |" row');
  }

  return {
    version,
    coreBytes: size('modern-cmdk (core)'),
    reactBytes: size('modern-cmdk + modern-cmdk/react'),
    stylesBytes: size('modern-cmdk/styles.css'),
    binBytes,
    searchMs,
    cpu: cpuKey.replace(/\s+(?:\d+-Core\s+)?Processor$/, ''),
    cores: bench.environment.cpuCount,
    githubHosted:
      bench.environment.runner !== undefined && (bench.environment.os ?? '').includes('azure'),
    recorded: bench.date,
    reactFloor,
    typescriptFloor,
  };
}

/** The one line between the figures-line markers; `requirements` is the link target of "Requirements". */
export function figuresLine(figures: Figures, requirements: string): string {
  return `**${kilobytes(figures.coreBytes)} kB** gzip core · **${kilobytes(figures.reactBytes)} kB** with the React adapter · ESM only · React ≥ ${figures.reactFloor} · TypeScript ≥ ${figures.typescriptFloor} · [Requirements](${requirements})`;
}

/** The lines between the figures markers: the sizes table, the bin sentence and the two footnotes. */
export function figuresBlock(figures: Figures, sha: string): string {
  const machine: string = figures.githubHosted
    ? `a GitHub-hosted runner (${figures.cpu}, ${figures.cores} cores)`
    : `a machine with ${figures.cpu} and ${figures.cores} cores`;
  return [
    '| Measure | Value |',
    '|---|--:|',
    `| Core, \`modern-cmdk\` | ${kilobytes(figures.coreBytes)} kB gzip[^size] |`,
    `| Core + \`modern-cmdk/react\` | ${kilobytes(figures.reactBytes)} kB gzip[^size] |`,
    `| \`modern-cmdk/styles.css\` | ${kilobytes(figures.stylesBytes)} kB gzip[^size] |`,
    `| Search 10,000 items for one query | ${figures.searchMs.toFixed(1)} ms median[^bench] |`,
    '',
    `Most of the unpacked size npm lists, ${megabytes(figures.binBytes)} MB, is the deprecated \`modern-cmdk\` bin and the packages it bundles; no application bundle imports it.`,
    '',
    `[^size]: size-limit with rolldown, minified with \`NODE_ENV=production\`, gzip; \`react\`, \`react-dom\` and \`radix-ui\` are not counted; 1 kB = 1,000 bytes. Record: [\`size-history/${figures.version}.json\`](${REPO_BLOB}/${sha}/benchmarks/size-history/${figures.version}.json).`,
    `[^bench]: \`createSearchEngine()\` searching an index of 10,000 items for \`'apple'\` and materialising the results; indexing is not timed. The median of five runs' p50 on ${machine}, recorded on ${figures.recorded}; runner noise is ±20–40 %. Record: [\`baseline.json\`](${REPO_BLOB}/${sha}/benchmarks/baseline.json). Method: [Benchmarks](${BENCHMARKS_PAGE}).`,
  ].join('\n');
}

/**
 * The text with the lines between `<!-- name:start -->` and `<!-- name:end -->` replaced by `content`. Throws unless
 * the pair occurs exactly once, start before end, each marker alone on its line.
 */
export function replaceBetween(text: string, name: string, content: string): string {
  const lines: string[] = text.split('\n');
  const starts: number[] = [];
  const ends: number[] = [];
  for (const [index, line] of lines.entries()) {
    if (line.trim() === `<!-- ${name}:start -->`) starts.push(index);
    if (line.trim() === `<!-- ${name}:end -->`) ends.push(index);
  }
  const [start, end] = [starts[0], ends[0]];
  if (
    starts.length !== 1 ||
    ends.length !== 1 ||
    start === undefined ||
    end === undefined ||
    start > end
  ) {
    throw new Error(
      `needs exactly one <!-- ${name}:start --> line followed by one <!-- ${name}:end --> line (found ${starts.length} start and ${ends.length} end markers)`,
    );
  }
  return [...lines.slice(0, start + 1), content, ...lines.slice(end)].join('\n');
}

const escapeDots = (text: string): string => text.replaceAll('.', '\\.');
/** The link to versions.ts in the create README: (head) the blob URL up to the commit, (commit), (tail) the path. */
const versionsLink = (flags: string): RegExp =>
  new RegExp(`(${escapeDots(REPO_BLOB)}/)([^/\\s)]+)(/${escapeDots(VERSIONS_FILE)})`, flags);
/** The commit a README names for its records, and for versions.ts; undefined when it names none. */
export const NAMED_RECORD_COMMIT = /blob\/([0-9a-f]{40})\/benchmarks\/baseline\.json/;
export const NAMED_VERSIONS_COMMIT =
  /blob\/([0-9a-f]{40})\/packages\/create-modern-cmdk\/src\/versions\.ts/;

/**
 * The README as it should read, with `sha` the commit its links name: the figure blocks of a modern-cmdk page
 * (sha: the last commit that touched the records), or the versions.ts commit of the create page (sha: the last commit
 * that touched versions.ts). Throws when the page lacks what it would write into.
 */
export function renderReadme(
  text: string,
  kind: ReadmeKind,
  figures: Figures,
  sha: string,
): string {
  if (kind === 'create') {
    if (!versionsLink('').test(text)) {
      throw new Error(`has no link to ${VERSIONS_FILE} to set the commit of`);
    }
    return text.replace(
      versionsLink('g'),
      (_whole, head: string, _old: string, tail: string) => `${head}${sha}${tail}`,
    );
  }
  const requirements: string =
    kind === 'root' ? 'packages/modern-cmdk/README.md#requirements' : '#requirements';
  return replaceBetween(
    replaceBetween(text, 'figures-line', figuresLine(figures, requirements)),
    'figures',
    figuresBlock(figures, sha),
  );
}

function git(root: string, args: readonly string[]): string | undefined {
  try {
    return execFileSync('git', [...args], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    }).trim();
  } catch {
    return undefined;
  }
}

export type LastCommit = { readonly sha: string } | { readonly reason: string };

/** The last commit on `mainRef` that touches any of `paths`, or why git cannot say (a shallow clone, no such ref, no such commit). */
export function lastCommit(root: string, mainRef: string, paths: readonly string[]): LastCommit {
  if (git(root, ['rev-parse', '--is-shallow-repository']) === 'true') {
    return { reason: 'this clone is shallow' };
  }
  const main: string | undefined = git(root, [
    'rev-parse',
    '--verify',
    '--quiet',
    '--end-of-options',
    `${mainRef}^{commit}`,
  ]);
  if (main === undefined || main === '') return { reason: `${mainRef} is not in this clone` };
  const sha: string | undefined = git(root, ['log', '-1', '--format=%H', main, '--', ...paths]);
  return sha === undefined || sha === ''
    ? { reason: `no commit on ${mainRef} touches ${paths.join(' or ')}` }
    : { sha };
}

/** The first line where two texts differ, as `line N: expected ... / found ...`, or undefined when equal. */
export function firstDifference(expected: string, found: string): string | undefined {
  if (expected === found) return undefined;
  const a: string[] = expected.split('\n');
  const b: string[] = found.split('\n');
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] !== b[i]) {
      return `line ${i + 1}: expected ${JSON.stringify(a[i] ?? '(end of file)')}, found ${JSON.stringify(b[i] ?? '(end of file)')}`;
    }
  }
  return undefined;
}

function main(): number {
  let values: { check?: boolean; root?: string; 'main-ref'?: string };
  try {
    ({ values } = parseArgs({
      options: {
        check: { type: 'boolean' },
        root: { type: 'string' },
        'main-ref': { type: 'string' },
      },
      strict: true,
      allowPositionals: false,
    }));
  } catch (error) {
    process.stderr.write(
      `write-readme-figures: ${(error as Error).message}\nusage: node scripts/write-readme-figures.ts [--check] [--root <dir>] [--main-ref <ref>]\n`,
    );
    return 2;
  }
  const root: string = values.root === undefined ? ROOT : resolve(values.root);
  const mainRef: string = values['main-ref'] ?? DEFAULT_MAIN_REF;
  const check: boolean = values.check === true;
  const targets = TARGETS.filter((target) => existsSync(join(root, target.file)));
  if (targets.length === 0) {
    process.stderr.write(
      `write-readme-figures: none of ${TARGETS.map((t) => t.file).join(', ')} exists under ${root}\n`,
    );
    return 2;
  }

  let figures: Figures;
  try {
    figures = readFigures(root);
  } catch (error) {
    process.stderr.write(`write-readme-figures: ${(error as Error).message}\n`);
    return 1;
  }
  const records: LastCommit = lastCommit(root, mainRef, [
    `benchmarks/size-history/${figures.version}.json`,
    'benchmarks/baseline.json',
  ]);
  const versions: LastCommit = lastCommit(root, mainRef, [VERSIONS_FILE]);

  let failed = false;
  for (const { file, kind } of targets) {
    const path: string = join(root, file);
    const text: string = readFileSync(path, 'utf8');
    const last: LastCommit = kind === 'create' ? versions : records;
    let sha: string;
    if ('sha' in last) {
      sha = last.sha;
    } else if (check) {
      // Git cannot say which commit touched the files last (a shallow clone, or no main ref): the commit the README
      // already names stands in, and every other byte is still compared.
      const named: RegExp = kind === 'create' ? NAMED_VERSIONS_COMMIT : NAMED_RECORD_COMMIT;
      sha = named.exec(text)?.[1] ?? 'UNSET';
      process.stdout.write(
        `write-readme-figures: ${file}: note: the commit in the links is not compared (${last.reason}); everything else is\n`,
      );
    } else {
      process.stderr.write(
        `write-readme-figures: cannot set the commit in ${file}: ${last.reason} (--main-ref <ref> names another ref)\n`,
      );
      return 1;
    }

    let next: string;
    try {
      next = renderReadme(text, kind, figures, sha);
    } catch (error) {
      process.stderr.write(`write-readme-figures: ${file}: ${(error as Error).message}\n`);
      failed = true;
      continue;
    }
    if (next === text) {
      process.stdout.write(`write-readme-figures: ${file}: up to date\n`);
    } else if (check) {
      process.stderr.write(
        `write-readme-figures: ${file}: stale, ${firstDifference(next, text)} (run: node scripts/write-readme-figures.ts)\n`,
      );
      failed = true;
    } else {
      writeFileSync(path, next);
      process.stdout.write(`write-readme-figures: ${file}: written\n`);
    }
  }
  return failed ? 1 : 0;
}

if (import.meta.main) process.exitCode = main();

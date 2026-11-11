// scripts/compose-release-notes.ts
// The release-notes tooling of .github/workflows/release.yml, run after `changeset publish` has created the releases.
// Node built-ins only, so the jobs that run it install nothing; run with native type stripping:
//
//   node scripts/compose-release-notes.ts compose --tag <name>@<version> --tags-file <file> --commit <sha>
//        [--repo <owner>/<repo>] [--root <dir>] [--summary-file <file>] [--out <file>]
//   node scripts/compose-release-notes.ts newest --package <name> --tags-file <file>
//   node scripts/compose-release-notes.ts probe-images [--published <json>] [--registry <url>]
//
// compose writes the body of one GitHub release (stdout, or --out) from four parts, in the order of the release-notes
// template: the summary file `.github/release-notes/<name>@<version>.md` that a person adds in a pull request to main before the Version PR, or on the Version PR itself (its
// first paragraph is the `**Upgrade:**` line, then the summary, `### Before you upgrade` and `### Highlights`); for
// modern-cmdk, the size line read from `benchmarks/size-history/<version>.json`; the package's CHANGELOG section
// inside <details>; and the footer links. For create-modern-cmdk a `**Scaffolds:**` line, the modern-cmdk version in
// the same checkout (what the build bakes in as MODERN_CMDK_VERSION), follows the Upgrade line. A release without a
// summary file, or without a CHANGELOG section, is an error: exit 1 with a `::error::` line, nothing written.
// --tags-file lists the repository's release tags, one per line; the previous tag of the Full diff link is the highest
// lower version of the same package in it (no link when there is none). --commit is the 40-hex commit of the checkout:
// the size record is linked at it. A version without a size record gets no size line (the records are per minor).
//
// newest prints the highest tag `<name>@<x.y.z>` of --tags-file (prereleases never count: GitHub cannot mark one Latest).
//
// probe-images reads the published packages ([{"name","version"}], --published or the PUBLISHED variable, the format of
// the changesets publish action's `published-packages` output), waits until the registry lists each version, takes the
// packument's `readme` (the README npm renders; the version manifests carry none), and requests every
// raw.githubusercontent.com URL in it without following redirects. Anything but HTTP 200 is a failure, after retries for
// a 429, a 5xx or a network error. A README without such a URL passes with a notice.
//
// Exit codes: 0 = done, 1 = a release has no summary or section, an invalid argument value, or a probe failure, 2 = usage error.

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

const ROOT = resolve(import.meta.dirname, '..');

/** The repository the links point at when --repo is not given. */
export const DEFAULT_REPO = 'ABCrimson/modern-cmdk';
/** The documentation site the footer links. */
export const DOCS_URL = 'https://abcrimson.github.io/modern-cmdk/';
const SIZE_PACKAGE = 'modern-cmdk';
const SCAFFOLD_PACKAGE = 'create-modern-cmdk';
const NPM_REGISTRY = 'https://registry.npmjs.org';
const COMMIT = /^[0-9a-f]{40}$/;
const RAW_URL = /https:\/\/raw\.githubusercontent\.com\/[^\s"'<>)\]]+/g;

/** A failure the release can act on: its message names the file or value to fix. */
export class ReleaseNotesError extends Error {
  override readonly name = 'ReleaseNotesError';
}

export interface Version {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
  /** The prerelease identifiers after the first `-`, or the empty string. */
  readonly pre: string;
}

/** Parses `x.y.z`, `x.y.z-pre` and `x.y.z+build` (the build metadata is dropped); undefined for anything else. */
export function parseVersion(text: string): Version | undefined {
  const m = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(text);
  if (m === null) return undefined;
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]), pre: m[4] ?? '' };
}

/** Semver order: the numbers first, then a release above its prereleases, then the prerelease text. */
export function compareVersions(a: Version, b: Version): number {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  if (a.patch !== b.patch) return a.patch - b.patch;
  if (a.pre === b.pre) return 0;
  if (a.pre === '') return 1;
  if (b.pre === '') return -1;
  return a.pre < b.pre ? -1 : 1;
}

export interface SplitTag {
  readonly name: string;
  readonly version: string;
}

/** `modern-cmdk@1.7.0` -> { name: 'modern-cmdk', version: '1.7.0' }; a scoped name keeps its own `@`. */
export function splitTag(tag: string): SplitTag | undefined {
  const at = tag.lastIndexOf('@');
  if (at <= 0 || at === tag.length - 1) return undefined;
  return { name: tag.slice(0, at), version: tag.slice(at + 1) };
}

interface PackageTag {
  readonly tag: string;
  readonly parsed: Version;
}

function tagsOf(tags: readonly string[], name: string): PackageTag[] {
  return tags.flatMap((raw): PackageTag[] => {
    const tag = raw.trim();
    const split = splitTag(tag);
    if (split === undefined || split.name !== name) return [];
    const parsed = parseVersion(split.version);
    return parsed === undefined ? [] : [{ tag, parsed }];
  });
}

function highest(candidates: readonly PackageTag[]): string | undefined {
  let best: PackageTag | undefined;
  for (const candidate of candidates) {
    if (best === undefined || compareVersions(candidate.parsed, best.parsed) > 0) best = candidate;
  }
  return best?.tag;
}

/** The highest non-prerelease tag of `name` in `tags`, the release to keep as GitHub's Latest. */
export function newestTag(tags: readonly string[], name: string): string | undefined {
  return highest(tagsOf(tags, name).filter((t) => t.parsed.pre === ''));
}

/** The highest tag of `name` whose version is lower than `version`, for the Full diff link. */
export function previousTag(
  tags: readonly string[],
  name: string,
  version: string,
): string | undefined {
  const current = parseVersion(version);
  if (current === undefined) return undefined;
  return highest(tagsOf(tags, name).filter((t) => compareVersions(t.parsed, current) < 0));
}

/** The body of the `## <version>` section of a changesets CHANGELOG, without its heading; undefined when absent. */
export function changelogSection(markdown: string, version: string): string | undefined {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const start = lines.findIndex((line) => line.trimEnd() === `## ${version}`);
  if (start === -1) return undefined;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if ((lines[i] ?? '').startsWith('## ')) {
      end = i;
      break;
    }
  }
  return lines
    .slice(start + 1, end)
    .join('\n')
    .trim();
}

export interface SizeEntry {
  readonly name: string;
  readonly size: number;
}

export interface SizeRecord {
  readonly entries: readonly SizeEntry[];
}

/** The three figures of the size line: the record entry that holds each. */
const SIZE_FIGURES: readonly (readonly [label: string, entry: string])[] = [
  ['core', 'modern-cmdk (core)'],
  ['core + React', 'modern-cmdk + modern-cmdk/react'],
  ['styles', 'modern-cmdk/styles.css'],
];

/** `**Size:** core 7.7 kB · core + React 12.0 kB · styles 4.0 kB, gzip ([record](...))`, from a size-history record. */
export function sizeLine(
  record: SizeRecord,
  version: string,
  repo: string,
  commit: string,
): string {
  const figures = SIZE_FIGURES.map(([label, entry]) => {
    const found = record.entries.find((e) => e.name === entry);
    if (found === undefined) {
      throw new ReleaseNotesError(
        `benchmarks/size-history/${version}.json has no entry named "${entry}"`,
      );
    }
    return `${label} ${(found.size / 1000).toFixed(1)} kB`;
  });
  const link = `https://github.com/${repo}/blob/${commit}/benchmarks/size-history/${version}.json`;
  return `**Size:** ${figures.join(' · ')}, gzip ([record](${link}))`;
}

export interface ComposeInput {
  /** The package name and the version of the release. */
  readonly name: string;
  readonly version: string;
  /** The package directory under packages/, for the changelog link. */
  readonly dir: string;
  readonly repo: string;
  /** The 40-hex commit the size record is linked at. */
  readonly commit: string;
  /** The text of the summary file, `summaryPath` (repository-relative) names it in errors. */
  readonly summary: string;
  readonly summaryPath: string;
  readonly changelog: string;
  /** The parsed size record of this version; absent when the version has none. */
  readonly record?: SizeRecord;
  readonly previousTag?: string;
  /** The modern-cmdk version a create-modern-cmdk release scaffolds. */
  readonly scaffoldsVersion?: string;
}

/** Checks the summary file against the template and returns it as LF text without outer blank lines. */
function checkedSummary(input: ComposeInput): string {
  const text = input.summary.replace(/\r\n/g, '\n').trim();
  const install = `\`npm install ${input.name}@${input.version}\``;
  const first = text.split(/\n\s*\n/, 1)[0] ?? '';
  if (!first.startsWith('**Upgrade:** ') || !first.includes(install)) {
    throw new ReleaseNotesError(
      `${input.summaryPath} must start with a paragraph "**Upgrade:** ${install} · **Breaking:** ... · **Deprecated:** ..."`,
    );
  }
  for (const heading of ['### Before you upgrade', '### Highlights']) {
    if (!text.split('\n').some((line) => line.trimEnd() === heading)) {
      throw new ReleaseNotesError(`${input.summaryPath} has no "${heading}" heading`);
    }
  }
  return text;
}

/** The body of one release: the summary file, the size line (modern-cmdk), the CHANGELOG section in <details>, the footer. */
export function composeBody(input: ComposeInput): string {
  let summary = checkedSummary(input);
  if (input.name === SCAFFOLD_PACKAGE) {
    if (input.scaffoldsVersion === undefined) {
      throw new ReleaseNotesError(`${SCAFFOLD_PACKAGE} needs the modern-cmdk version it scaffolds`);
    }
    const [head = '', ...rest] = summary.split(/\n\s*\n/);
    summary = [head, `**Scaffolds:** modern-cmdk ${input.scaffoldsVersion}`, ...rest].join('\n\n');
  }
  const tag = `${input.name}@${input.version}`;
  const base = `https://github.com/${input.repo}`;
  const links = [
    ...(input.previousTag === undefined
      ? []
      : [`[Full diff](${base}/compare/${input.previousTag}...${tag})`]),
    `[npm](https://www.npmjs.com/package/${input.name}/v/${input.version})`,
    `[Documentation](${DOCS_URL})`,
    `[Changelog](${base}/blob/main/packages/${input.dir}/CHANGELOG.md)`,
  ];
  const parts = [
    summary,
    ...(input.name === SIZE_PACKAGE && input.record !== undefined
      ? [sizeLine(input.record, input.version, input.repo, input.commit)]
      : []),
    `<details>\n<summary>Every change in this release</summary>\n\n${input.changelog}\n\n</details>`,
    links.join(' · '),
  ];
  return `${parts.join('\n\n')}\n`;
}

/** The directory name under packages/ whose package.json is named `name`. */
export function findPackageDir(root: string, name: string): string {
  const packages = join(root, 'packages');
  for (const entry of readdirSync(packages, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const manifest = join(packages, entry.name, 'package.json');
    if (!existsSync(manifest)) continue;
    const parsed = JSON.parse(readFileSync(manifest, 'utf8')) as { name?: string };
    if (parsed.name === name) return entry.name;
  }
  throw new ReleaseNotesError(`no packages/*/package.json is named ${name}`);
}

export interface ComposeOptions {
  readonly tag: string;
  readonly tags: readonly string[];
  readonly commit: string;
  readonly repo: string;
  readonly root: string;
  /** The summary file; defaults to `.github/release-notes/<tag>.md` under the root. */
  readonly summaryFile?: string;
}

/** Reads the files of one release under `root` and composes its body; throws ReleaseNotesError when a part is missing. */
export function composeFromRepository(options: ComposeOptions): string {
  const { tag, root } = options;
  const split = splitTag(tag);
  if (split === undefined || parseVersion(split.version) === undefined) {
    throw new ReleaseNotesError(`"${tag}" is not a <package>@<version> tag`);
  }
  if (!COMMIT.test(options.commit)) {
    throw new ReleaseNotesError(`--commit must be a 40-hex commit, got "${options.commit}"`);
  }
  const { name, version } = split;
  const dir = findPackageDir(root, name);
  const summaryPath = options.summaryFile ?? join(root, '.github', 'release-notes', `${tag}.md`);
  const summaryName =
    options.summaryFile === undefined ? `.github/release-notes/${tag}.md` : summaryPath;
  if (!existsSync(summaryPath)) {
    throw new ReleaseNotesError(
      `${summaryName} is missing: a release needs a summary file written by a person (see .github/release-notes/README.md)`,
    );
  }
  const changelogPath = join(root, 'packages', dir, 'CHANGELOG.md');
  const changelog = existsSync(changelogPath)
    ? changelogSection(readFileSync(changelogPath, 'utf8'), version)
    : undefined;
  if (changelog === undefined || changelog === '') {
    throw new ReleaseNotesError(`packages/${dir}/CHANGELOG.md has no "## ${version}" section`);
  }
  const recordPath = join(root, 'benchmarks', 'size-history', `${version}.json`);
  const record =
    name === SIZE_PACKAGE && existsSync(recordPath)
      ? (JSON.parse(readFileSync(recordPath, 'utf8')) as SizeRecord)
      : undefined;
  const previous = previousTag(options.tags, name, version);
  const scaffoldsVersion =
    name === SCAFFOLD_PACKAGE
      ? (
          JSON.parse(
            readFileSync(
              join(root, 'packages', findPackageDir(root, SIZE_PACKAGE), 'package.json'),
              'utf8',
            ),
          ) as { version: string }
        ).version
      : undefined;
  return composeBody({
    name,
    version,
    dir,
    repo: options.repo,
    commit: options.commit,
    summary: readFileSync(summaryPath, 'utf8'),
    summaryPath: summaryName,
    changelog,
    ...(record === undefined ? {} : { record }),
    ...(previous === undefined ? {} : { previousTag: previous }),
    ...(scaffoldsVersion === undefined ? {} : { scaffoldsVersion }),
  });
}

/** Every distinct raw.githubusercontent.com URL in a README, in order of first appearance. */
export function rawImageUrls(readme: string): string[] {
  const urls = [...readme.matchAll(RAW_URL)].map((m) => m[0].replace(/[.,;:]+$/, ''));
  return [...new Set(urls)];
}

export interface PublishedPackage {
  readonly name: string;
  readonly version: string;
}

/** Parses the changesets publish action's `published-packages` output; an empty string means nothing was published. */
export function parsePublished(json: string): PublishedPackage[] {
  if (json.trim() === '') return [];
  const value: unknown = JSON.parse(json);
  if (!Array.isArray(value)) throw new ReleaseNotesError('published-packages is not a JSON array');
  return value.map((item: unknown): PublishedPackage => {
    const { name, version } = (item ?? {}) as { name?: unknown; version?: unknown };
    if (typeof name !== 'string' || typeof version !== 'string') {
      throw new ReleaseNotesError('published-packages holds an entry without a name and a version');
    }
    return { name, version };
  });
}

export interface ProbeOptions {
  readonly published: readonly PublishedPackage[];
  readonly registry?: string;
  readonly fetchImpl?: typeof fetch;
  /** Pause between attempts, in milliseconds. */
  readonly sleep?: (ms: number) => Promise<void>;
  readonly log?: (line: string) => void;
}

// npm accepts an upload and lists the version later: 20 min 10 s for modern-cmdk 1.5.0 and 18 min 23 s for 1.7.0, from the
// end of the publish step to the packument's `time` entry, and the packument is served with max-age=300. One budget for
// the whole run, shared by the packages.
const REGISTRY_WAIT_MS = 26 * 60_000;
const REGISTRY_PAUSE_MS = 15_000;
const IMAGE_ATTEMPTS = 3;
const IMAGE_PAUSE_MS = 5_000;

/** A status worth another attempt: rate limiting and server errors; 404 and 3xx are final. */
function transient(status: number): boolean {
  return status === 429 || status >= 500;
}

/**
 * Requests every raw.githubusercontent.com URL in the readme of each published package's packument.
 * Returns the problems found (empty when every URL answered 200); throws nothing for an image that fails.
 */
export async function probeImages(options: ProbeOptions): Promise<string[]> {
  const registry = options.registry ?? NPM_REGISTRY;
  const request = options.fetchImpl ?? fetch;
  const sleep =
    options.sleep ?? ((ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms)));
  const log = options.log ?? ((line: string): void => void process.stdout.write(`${line}\n`));
  const problems: string[] = [];
  let waited = 0;
  for (const { name, version } of options.published) {
    const label = `${name}@${version}`;
    const url = `${registry}/${name.replace('/', '%2F')}`;
    let readme: unknown;
    let listed = false;
    while (!listed) {
      try {
        const response = await request(url, { headers: { accept: 'application/json' } });
        if (response.status === 200) {
          const packument = (await response.json()) as {
            versions?: Record<string, unknown>;
            readme?: unknown;
          };
          if (packument.versions !== undefined && version in packument.versions) {
            listed = true;
            readme = packument.readme;
          }
        } else {
          await response.body?.cancel();
        }
      } catch {
        // a network error is retried like a version the registry does not list yet
      }
      if (listed || waited >= REGISTRY_WAIT_MS) break;
      await sleep(REGISTRY_PAUSE_MS);
      waited += REGISTRY_PAUSE_MS;
    }
    if (!listed) {
      problems.push(
        `${label}: the registry did not list the version within ${REGISTRY_WAIT_MS / 60_000} minutes; npm can take longer, so re-run this job once ${url}/${version} answers 200`,
      );
      continue;
    }
    if (typeof readme !== 'string' || readme.trim() === '') {
      problems.push(`${label}: the packument has no readme`);
      continue;
    }
    const images = rawImageUrls(readme);
    if (images.length === 0) {
      log(`${label}: no raw.githubusercontent.com URL in the readme; nothing to probe`);
      continue;
    }
    for (const image of images) {
      let status = 0;
      for (let attempt = 1; attempt <= IMAGE_ATTEMPTS; attempt++) {
        try {
          const response = await request(image, { redirect: 'manual' });
          status = response.status;
          await response.body?.cancel();
        } catch {
          status = 0;
        }
        if (status === 200 || !(status === 0 || transient(status))) break;
        if (attempt < IMAGE_ATTEMPTS) await sleep(IMAGE_PAUSE_MS);
      }
      if (status === 200) {
        log(`${label}: 200 ${image}`);
      } else {
        log(`${label}: ${status === 0 ? 'no response' : status} ${image}`);
        problems.push(`${label}: ${image} answered ${status === 0 ? 'nothing' : status}, not 200`);
      }
    }
  }
  return problems;
}

function usage(message: string): never {
  process.stderr.write(`${message}\n`);
  process.stderr.write(
    'usage: node scripts/compose-release-notes.ts compose|newest|probe-images [options] (see the file header)\n',
  );
  process.exit(2);
}

function readTags(file: string): string[] {
  return readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '');
}

async function main(argv: readonly string[]): Promise<void> {
  const [command, ...rest] = argv;
  if (command === undefined) usage('missing command');
  let values: Record<string, string | undefined>;
  try {
    ({ values } = parseArgs({
      args: rest,
      options: {
        tag: { type: 'string' },
        'tags-file': { type: 'string' },
        commit: { type: 'string' },
        repo: { type: 'string' },
        root: { type: 'string' },
        'summary-file': { type: 'string' },
        out: { type: 'string' },
        package: { type: 'string' },
        published: { type: 'string' },
        registry: { type: 'string' },
      },
      strict: true,
    }));
  } catch (error) {
    return usage(error instanceof Error ? error.message : String(error));
  }
  try {
    if (command === 'compose') {
      const { tag, 'tags-file': tagsFile, commit } = values;
      if (tag === undefined || tagsFile === undefined || commit === undefined) {
        return usage('compose needs --tag, --tags-file and --commit');
      }
      const body = composeFromRepository({
        tag,
        tags: readTags(tagsFile),
        commit,
        repo: values.repo ?? DEFAULT_REPO,
        root: resolve(values.root ?? ROOT),
        ...(values['summary-file'] === undefined ? {} : { summaryFile: values['summary-file'] }),
      });
      if (values.out === undefined) process.stdout.write(body);
      else writeFileSync(values.out, body);
    } else if (command === 'newest') {
      const { package: name, 'tags-file': tagsFile } = values;
      if (name === undefined || tagsFile === undefined) {
        return usage('newest needs --package and --tags-file');
      }
      const tag = newestTag(readTags(tagsFile), name);
      if (tag === undefined) throw new ReleaseNotesError(`${tagsFile} lists no release of ${name}`);
      process.stdout.write(`${tag}\n`);
    } else if (command === 'probe-images') {
      const published = parsePublished(values.published ?? process.env.PUBLISHED ?? '');
      const problems = await probeImages({
        published,
        ...(values.registry === undefined ? {} : { registry: values.registry }),
      });
      for (const problem of problems) process.stderr.write(`::error::${problem}\n`);
      if (problems.length > 0) process.exit(1);
    } else {
      usage(`unknown command "${command}"`);
    }
  } catch (error) {
    if (!(error instanceof ReleaseNotesError)) throw error;
    process.stderr.write(`::error::${error.message}\n`);
    process.exit(1);
  }
}

if (import.meta.main) await main(process.argv.slice(2));

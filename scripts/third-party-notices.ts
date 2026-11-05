// scripts/third-party-notices.ts
// PKG-5 (F16's 1.x half): packages/modern-cmdk/THIRD-PARTY-NOTICES.md, the licence notices of the code that
// dist/codemod inlines until 2.0 (D17), generated from the built dist. Runs with Node's native type stripping:
//
//   node scripts/third-party-notices.ts [--check]
//
// Without --check it writes packages/modern-cmdk/THIRD-PARTY-NOTICES.md. With --check it exits 1 when the file
// differs from what it would write (or is missing). Exit codes: 0 = written / up to date, 1 = stale file, missing
// dist, or a bundled package without a licence text, 2 = usage error.
//
// Source of the package list: the comment line tsdown 0.23.5 (rolldown 1.2) writes above every bundled module of
// packages/modern-cmdk/dist/codemod/**/*.mjs, `// ../../node_modules/.pnpm/<pkg>@<v>/node_modules/<pkg>/<file>`
// (the `//#region <path>` form of other rolldown releases is read too). A line that names a node_modules path is
// one bundled module; the package is the LAST node_modules/<name> or node_modules/@scope/name in it, whose
// directory holds the package.json (name, version, license) and the LICENSE*, LICENCE* and COPYING* files copied
// verbatim (line endings normalised to LF). Regions outside node_modules are our own code and are left out. A
// package without a licence file takes the repository file that the `noticeFiles` pin for that exact version in
// tests/package/license-policy.json names (flow-parser and flow-estree 0.337.0: the facebook/flow LICENSE, fetched
// 2026-11-05 into tests/package/notices/). A section prints a "File: `<name>`" line for a file inside the package; a
// pinned section prints no File: line (the repository path is not in the published tarball) but one provenance
// line, source URL (which carries the commit), fetch date and reason, before the text; one with neither a file nor
// a pin is an error. The key is `noticeFiles`, not
// `licenseFiles`: scripts/check-licenses.ts owns that key for hash-pinned files inside installed packages. The unminified comments are required: minifying dist/codemod makes
// --check fail, never pass.
//
// Cross-check: the packages found equal BUNDLED_FOR_CODEMOD, the explicit bundle list of
// packages/modern-cmdk/tsdown.config.ts; any difference fails, so a newly inlined package fails until the list
// and this file are updated.

import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

const ROOT: string = resolve(import.meta.dirname, '..');
const PACKAGE_DIR: string = join(ROOT, 'packages/modern-cmdk');
const DIST_CODEMOD: string = join(PACKAGE_DIR, 'dist/codemod');
const OUTPUT: string = join(PACKAGE_DIR, 'THIRD-PARTY-NOTICES.md');
const TSDOWN_CONFIG: string = join(PACKAGE_DIR, 'tsdown.config.ts');
const POLICY: string = join(ROOT, 'tests/package/license-policy.json');

/** A bundled package: its name and its directory as written in the dist, from the first node_modules segment on. */
export interface BundledRef {
  readonly name: string;
  readonly dir: string;
}

export interface LicenseText {
  readonly file: string;
  readonly text: string;
  /** Set for a pinned repository file: where the text came from, rendered above it in place of the File: line. */
  readonly provenance?: string;
}

export interface Notice {
  readonly name: string;
  readonly version: string;
  readonly license: string;
  readonly texts: readonly LicenseText[];
}

/** A license-policy.json `noticeFiles` entry: a licence text kept in the repository for a package that ships none. */
export interface LicenseFilePin {
  readonly package: string;
  /** One exact version. */
  readonly version: string;
  /** Repo-relative path of the pinned text. */
  readonly file: string;
  /** The upstream URL of the text, `https://github.com/<owner>/<repo>/blob/<commit sha>/<file>`. */
  readonly source: string;
  /** The date the text was fetched (YYYY-MM-DD). */
  readonly fetched: string;
  readonly reason: string;
}

const COMMIT_IN_SOURCE: RegExp = /\/blob\/([0-9a-f]{40})\//;

/** The provenance line of a pinned text: source URL (its commit included), fetch date and the reason for the pin. */
export function provenanceLine(pin: LicenseFilePin): string {
  if (!COMMIT_IN_SOURCE.test(pin.source) || pin.fetched === '' || pin.reason === '') {
    throw new Error(
      `${pin.package}@${pin.version}: the noticeFiles pin needs a source URL with a 40-hex commit (/blob/<sha>/), a fetched date and a reason`,
    );
  }
  return `Licence text pinned in this repository, from ${pin.source}, fetched ${pin.fetched}, because ${pin.reason}.`;
}

// A whole comment line holding one path: `//#region <path>` or `// <path>`, the path with no whitespace.
const REGION_LINE: RegExp = /^\/\/(?:#region)? (\S*node_modules\/\S+)$/;
const NODE_MODULES: string = 'node_modules/';
const LICENSE_FILE: RegExp = /^(?:licen[sc]e|copying)/i;

/**
 * The packages named by the region lines of the given dist sources, sorted by name. The package of a line is the
 * last node_modules/<name> (or node_modules/@scope/name) in its path; lines outside node_modules, and comments that
 * only mention node_modules in prose, are ignored.
 */
export function bundledPackages(sources: readonly string[]): BundledRef[] {
  const found = new Map<string, BundledRef>();
  for (const source of sources) {
    for (const line of source.split(/\r?\n/)) {
      const path = REGION_LINE.exec(line)?.[1];
      if (path === undefined) continue;
      const at: number = path.lastIndexOf(NODE_MODULES);
      const segments: string[] = path.slice(at + NODE_MODULES.length).split('/');
      const scoped: boolean = (segments[0] ?? '').startsWith('@');
      const name: string = scoped ? segments.slice(0, 2).join('/') : (segments[0] ?? '');
      if (name === '' || (scoped && segments.length < 2)) continue;
      const first: number = path.indexOf(NODE_MODULES);
      const dir: string = path.slice(first, at + NODE_MODULES.length) + name;
      if (!found.has(dir)) found.set(dir, { name, dir });
    }
  }
  return [...found.values()].sort(
    (a, b) => a.name.localeCompare(b.name) || a.dir.localeCompare(b.dir),
  );
}

/**
 * The notice of one bundled package: name, version and licence from its package.json and every LICENSE*, LICENCE*
 * and COPYING* file verbatim. With no such file, the `pins` entry for that exact name@version names one; with
 * neither it throws (never a skip).
 */
export function collectNotice(
  root: string,
  ref: BundledRef,
  pins: readonly LicenseFilePin[],
): Notice {
  const dir: string = join(root, ref.dir);
  const manifestPath: string = join(dir, 'package.json');
  if (!existsSync(manifestPath))
    throw new Error(`${ref.name}: ${manifestPath} does not exist; run pnpm install`);
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
    name?: string;
    version?: string;
    license?: string | { type?: string };
  };
  const version: string = manifest.version ?? '';
  if (manifest.name !== ref.name || version === '') {
    throw new Error(
      `${ref.name}: ${manifestPath} names ${String(manifest.name)}@${version}, not ${ref.name}`,
    );
  }
  const license: string =
    typeof manifest.license === 'string' ? manifest.license : (manifest.license?.type ?? 'UNKNOWN');
  const files: string[] = readdirSync(dir)
    .filter((f) => LICENSE_FILE.test(f) && statSync(join(dir, f)).isFile())
    .sort();
  if (files.length === 0) {
    const pin = pins.find((p) => p.package === ref.name && p.version === version);
    if (pin === undefined) {
      throw new Error(
        `${ref.name}@${version} has no LICENSE, LICENCE or COPYING file and no noticeFiles pin in tests/package/license-policy.json`,
      );
    }
    const provenance: string = provenanceLine(pin);
    const text: string = readFileSync(join(root, pin.file), 'utf8').replaceAll('\r\n', '\n');
    return { name: ref.name, version, license, texts: [{ file: pin.file, text, provenance }] };
  }
  const texts: LicenseText[] = files.map((file) => ({
    file,
    text: readFileSync(join(dir, file), 'utf8').replaceAll('\r\n', '\n'),
  }));
  return { name: ref.name, version, license, texts };
}

/** The whole THIRD-PARTY-NOTICES.md: a header, then one section per package sorted by name@version. */
export function renderNotices(notices: readonly Notice[]): string {
  const sorted: Notice[] = [...notices].sort(
    (a, b) =>
      a.name.localeCompare(b.name) || a.version.localeCompare(b.version, 'en', { numeric: true }),
  );
  const parts: string[] = [
    '# Third-party notices',
    '',
    '<!-- Generated by `node scripts/third-party-notices.ts`; do not edit. `--check` fails when this file is stale. -->',
    '',
    'This file covers `dist/codemod` only. The deprecated `modern-cmdk` bin (`dist/codemod/bin.mjs`) bundles the code below, inlined by tsdown from the codemod package and jscodeshift with its parser tree, and it redistributes that code under the licences reproduced here. The bundle leaves `modern-cmdk` in 2.0, and so does this file.',
    '',
    'The `modern-cmdk-codemod` package bundles nothing: it declares jscodeshift as a dependency, so it needs no notices file.',
    '',
    'The rest of `modern-cmdk` (`dist/core`, `dist/react`) inlines no third-party code.',
    '',
  ];
  for (const n of sorted) {
    parts.push(`## ${n.name}@${n.version}`, '', `Licence: ${n.license}`, '');
    for (const t of n.texts) {
      parts.push(
        t.provenance ?? `File: \`${t.file}\``,
        '',
        '```text',
        t.text.replaceAll('\r\n', '\n').replace(/\n+$/, ''),
        '```',
        '',
      );
    }
  }
  return `${parts.join('\n').replace(/\n+$/, '')}\n`;
}

/** The names in `BUNDLED_FOR_CODEMOD` of packages/modern-cmdk/tsdown.config.ts, read from its source text. */
export function parseBundleList(config: string): string[] {
  const body = /\bBUNDLED_FOR_CODEMOD\b[^=]*=\s*\[([^\]]*)\]/.exec(config)?.[1];
  if (body === undefined) throw new Error('tsdown.config.ts has no BUNDLED_FOR_CODEMOD list');
  return [...body.matchAll(/'([^']+)'|"([^"]+)"/g)].map((m) => m[1] ?? m[2] ?? '').sort();
}

function distSources(dir: string): string[] {
  if (!existsSync(dir)) throw new Error(`${dir} does not exist; run pnpm build first`);
  const sources: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true, recursive: true })) {
    if (entry.isFile() && entry.name.endsWith('.mjs')) {
      sources.push(readFileSync(join(entry.parentPath, entry.name), 'utf8'));
    }
  }
  if (sources.length === 0) throw new Error(`${dir} holds no .mjs file; run pnpm build first`);
  return sources;
}

/** The generated file's text for the built dist, after the cross-check against the tsdown bundle list. */
export function generate(): string {
  const refs: BundledRef[] = bundledPackages(distSources(DIST_CODEMOD));
  const found: string[] = [...new Set(refs.map((r) => r.name))].sort();
  const listed: string[] = parseBundleList(readFileSync(TSDOWN_CONFIG, 'utf8'));
  const missing: string[] = listed.filter((n) => !found.includes(n));
  const extra: string[] = found.filter((n) => !listed.includes(n));
  if (missing.length > 0 || extra.length > 0) {
    throw new Error(
      `dist/codemod bundles ${found.join(', ')} but BUNDLED_FOR_CODEMOD in packages/modern-cmdk/tsdown.config.ts lists ${listed.join(', ')}` +
        (extra.length > 0 ? `; bundled but not listed: ${extra.join(', ')}` : '') +
        (missing.length > 0 ? `; listed but not bundled: ${missing.join(', ')}` : ''),
    );
  }
  const policy = JSON.parse(readFileSync(POLICY, 'utf8')) as { noticeFiles?: LicenseFilePin[] };
  return renderNotices(refs.map((r) => collectNotice(ROOT, r, policy.noticeFiles ?? [])));
}

/** Runs the CLI: 0 = ok, 1 = stale file or failure, 2 = usage error. */
export function main(argv: readonly string[] = process.argv.slice(2)): number {
  let check: boolean;
  try {
    const { values } = parseArgs({
      args: [...argv],
      options: { check: { type: 'boolean', default: false } },
      allowPositionals: false,
      strict: true,
    });
    check = values.check === true;
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\nusage: node scripts/third-party-notices.ts [--check]\n`,
    );
    return 2;
  }
  let text: string;
  try {
    text = generate();
  } catch (error) {
    process.stderr.write(
      `third-party notices: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    return 1;
  }
  if (check) {
    const current: string | undefined = existsSync(OUTPUT)
      ? readFileSync(OUTPUT, 'utf8')
      : undefined;
    if (current === text) {
      process.stdout.write('third-party notices: up to date\n');
      return 0;
    }
    process.stderr.write(
      'third-party notices: packages/modern-cmdk/THIRD-PARTY-NOTICES.md is stale or missing; run node scripts/third-party-notices.ts\n',
    );
    return 1;
  }
  writeFileSync(OUTPUT, text);
  process.stdout.write('third-party notices: wrote packages/modern-cmdk/THIRD-PARTY-NOTICES.md\n');
  return 0;
}

if (import.meta.main) process.exitCode = main();

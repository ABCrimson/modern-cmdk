// scripts/check-licenses.ts
// G4: lockfile licence audit. Runs `pnpm licenses list --json --recursive` over the whole workspace (dev
// dependencies included: tsdown inlines the codemod's devDependencies into dist/codemod/cli.mjs, which
// ships in the modern-cmdk tarball) and evaluates the report against tests/package/license-policy.json.
// Prints every violation and a census (licence -> count); exits 1 on any violation.
// The policy file is untrusted JSON with two sections. `exceptions`: every entry must be {package, license:
// non-empty strings, ships: boolean, reason: non-empty string}. `licenseFiles`: a package whose manifest has
// no licence field is resolved from a licence file by an entry {package, version, license, file, sha256,
// reason}; the file's SHA-256 must match the pin, and the declared licence then goes through the allowlist
// and exceptions like any other. This keeps the audit identical on Linux and Windows: pnpm's resolver opens
// the uppercase names it knows (LICENSE, LICENCE, LICENSE.md, ...) by exact name, which reaches a lowercase
// `license` file on case-insensitive NTFS and misses it on ext4.
// An exception may carry `platforms` (process.platform values): pnpm lists only the optional platform binaries it
// installed, so a binary that exists on one OS is absent from the report on another; elsewhere the entry grants
// nothing and is never stale.
// A malformed entry in either section is a violation (reported with its index and granting nothing),
// never a crash and never a pass.
// Node built-ins only; run with `node scripts/check-licenses.ts` (native type stripping).

import { spawnSync } from 'node:child_process';
import { hash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface LicensedPackage {
  readonly name: string;
  readonly versions: readonly string[];
  /** Installed paths: pnpm 12 prints one per installed copy, so a version installed under two peer sets has two (vue-tsc 3.3.14 here); index-aligned with `versions` only when the two lengths are equal. */
  readonly paths: readonly string[];
  readonly license: string;
}

/** Shape of `pnpm licenses list --json` (pnpm 12): licence string -> packages. */
export type LicenseReport = Readonly<Record<string, readonly LicensedPackage[]>>;

export interface LicenseException {
  /** Package name; a trailing `*` matches a prefix (platform binaries such as `lightningcss-*`). */
  readonly package: string;
  readonly license: string;
  /** True when the package is a dependency of a published package or appears in a built bundle. */
  readonly ships: boolean;
  /** The process.platform values where pnpm installs the package; absent means every platform; elsewhere the entry grants nothing and is never stale. */
  readonly platforms?: readonly string[];
  readonly reason: string;
}

export interface LicensePolicy {
  readonly allowed: readonly string[];
  readonly exceptions: readonly LicenseException[];
}

const UNKNOWN = new Set(['', 'unknown', 'unlicensed', 'see license in license']);
const COPYLEFT = /(?:^|[\s(])(?:(?:A|L)?GPL|SSPL|EUPL|MPL|EPL|CDDL|CPL|OSL|CC-BY-SA)\b/i;

/** argv of the report command: recursive (every workspace importer) and with dev dependencies (no `--prod`). */
export const LICENSES_ARGS: readonly string[] = ['licenses', 'list', '--json', '--recursive'];

/** Evaluates an SPDX expression: AND binds tighter than OR, parentheses group. Throws on malformed input. */
function satisfies(expression: string, allowed: ReadonlySet<string>): boolean {
  const tokens = expression.match(/\(|\)|[^\s()]+/g) ?? [];
  let pos = 0;

  const parseOr = (): boolean => {
    let result = parseAnd();
    while (tokens[pos]?.toUpperCase() === 'OR') {
      pos++;
      const rhs = parseAnd();
      result = result || rhs;
    }
    return result;
  };
  const parseAnd = (): boolean => {
    let result = parseAtom();
    while (tokens[pos]?.toUpperCase() === 'AND') {
      pos++;
      const rhs = parseAtom();
      result = result && rhs;
    }
    return result;
  };
  const parseAtom = (): boolean => {
    const token = tokens[pos++];
    if (token === undefined) throw new Error('unexpected end of expression');
    if (token === '(') {
      const inner = parseOr();
      if (tokens[pos++] !== ')') throw new Error('missing closing parenthesis');
      return inner;
    }
    if (token === ')' || /^(?:AND|OR|WITH)$/i.test(token)) throw new Error(`unexpected "${token}"`);
    let id = token;
    if (tokens[pos]?.toUpperCase() === 'WITH') {
      const exception = tokens[pos + 1];
      if (exception === undefined) throw new Error('WITH without an exception id');
      id = `${token} WITH ${exception}`;
      pos += 2;
    }
    return allowed.has(id);
  };

  const result = parseOr();
  if (pos !== tokens.length) throw new Error(`unexpected "${tokens[pos]}"`);
  return result;
}

function matchesPackage(pattern: string, name: string): boolean {
  return pattern.endsWith('*') ? name.startsWith(pattern.slice(0, -1)) : pattern === name;
}

/** The policy as parsed from JSON: exception entries are untrusted until `isValidException` accepts them. */
export interface LicensePolicyInput {
  readonly allowed: readonly string[];
  readonly exceptions: readonly unknown[];
  /** Untrusted until `isValidLicenseFile` accepts each entry; absent means none. */
  readonly licenseFiles?: readonly unknown[];
}

/** A licence read from a file inside the installed package, pinned by hash (see the header comment). */
export interface LicenseFileDeclaration {
  readonly package: string;
  /** One exact version. */
  readonly version: string;
  /** The SPDX id or expression the file carries; evaluated afterwards by the allowlist / exceptions. */
  readonly license: string;
  /** A bare file name inside the installed package. */
  readonly file: string;
  /** 64 lowercase hex characters. */
  readonly sha256: string;
  readonly reason: string;
}

const EXACT_VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const SHA256_HEX = /^[0-9a-f]{64}$/;

function isValidLicenseFile(value: unknown): value is LicenseFileDeclaration {
  if (typeof value !== 'object' || value === null) return false;
  const d = value as Partial<Record<keyof LicenseFileDeclaration, unknown>>;
  const text = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '';
  return (
    text(d.package) &&
    text(d.license) &&
    text(d.reason) &&
    typeof d.version === 'string' &&
    EXACT_VERSION.test(d.version) &&
    text(d.file) &&
    !/[/\\]/.test(d.file) &&
    typeof d.sha256 === 'string' &&
    SHA256_HEX.test(d.sha256)
  );
}

function isValidException(value: unknown): value is LicenseException {
  if (typeof value !== 'object' || value === null) return false;
  const e = value as Partial<Record<keyof LicenseException, unknown>>;
  return (
    typeof e.package === 'string' &&
    e.package !== '' &&
    typeof e.license === 'string' &&
    typeof e.ships === 'boolean' &&
    (e.platforms === undefined ||
      (Array.isArray(e.platforms) &&
        e.platforms.length > 0 &&
        e.platforms.every((p) => typeof p === 'string' && p !== ''))) &&
    typeof e.reason === 'string' &&
    e.reason.trim() !== ''
  );
}

/** Returns one message per violation; an empty array means the report satisfies the policy. */
export function evaluate(
  report: LicenseReport,
  policy: LicensePolicyInput,
  platform: string = process.platform,
): string[] {
  const allowed = new Set(policy.allowed);
  const violations: string[] = [];
  const used = new Array<boolean>(policy.exceptions.length).fill(false);
  const exceptions: (LicenseException | undefined)[] = [];
  const invalid = new Set<number>();

  for (const [i, e] of policy.exceptions.entries()) {
    if (isValidException(e)) {
      if (e.platforms !== undefined && !e.platforms.includes(platform)) used[i] = true;
      else exceptions[i] = e;
      continue;
    }
    const fields = (typeof e === 'object' && e !== null ? e : {}) as Record<string, unknown>;
    violations.push(
      `exception #${i} (${String(fields.package)}, ${String(fields.license)}) is malformed: package and license must be non-empty strings, ships a boolean, platforms (if present) a non-empty list of non-empty strings, and reason a non-empty string saying why it is acceptable and whether it ships`,
    );
    used[i] = true; // reported once above; a malformed exception grants nothing
    invalid.add(i);
  }
  const find = (entry: LicensedPackage): number =>
    exceptions.findIndex(
      (e, i) =>
        !invalid.has(i) &&
        e !== undefined &&
        matchesPackage(e.package, entry.name) &&
        e.license === entry.license,
    );

  for (const entry of Object.values(report).flat()) {
    const license = entry.license.trim();
    const ids = entry.versions.map((version) => `${entry.name}@${version}`).join(', ');

    if (UNKNOWN.has(license.toLowerCase())) {
      const idx = find(entry);
      if (idx >= 0) used[idx] = true;
      else violations.push(`${ids}: unknown or missing licence`);
      continue;
    }

    let ok: boolean;
    try {
      ok = satisfies(license, allowed);
    } catch (error) {
      violations.push(
        `${ids}: unparsable licence expression "${license}" (${(error as Error).message})`,
      );
      continue;
    }
    if (ok) continue;

    const idx = find(entry);
    const exception = idx >= 0 ? exceptions[idx] : undefined;
    if (idx >= 0) used[idx] = true;
    if (exception === undefined) {
      violations.push(`${ids}: licence "${license}" is not in the allowlist and has no exception`);
    } else if (exception.ships && COPYLEFT.test(license)) {
      violations.push(
        `${ids}: shipped copyleft licence "${license}" gets no exception (owner decision)`,
      );
    }
  }

  for (const [index, exception] of exceptions.entries()) {
    if (exception !== undefined && !used[index]) {
      violations.push(
        `stale exception: ${exception.package} (${exception.license}) matches no package in the report; remove it`,
      );
    }
  }
  return violations;
}

/**
 * Resolves Unknown packages named by a hash-pinned `licenseFiles` declaration: the file inside the installed
 * package is read through `readFile`, hashed, and on a match the version moves to the declared licence in the
 * returned report. Never mutates `report`. A malformed, stale, mismatching or unreadable declaration is a
 * violation and the version stays where the report put it.
 */
export function resolveLicenseFiles(
  report: LicenseReport,
  policy: LicensePolicyInput,
  readFile: (path: string) => Buffer = (path: string): Buffer => readFileSync(path),
): { report: LicenseReport; violations: string[] } {
  const working: Record<string, LicensedPackage[]> = {};
  for (const [bucket, packages] of Object.entries(report)) working[bucket] = [...packages];
  const violations: string[] = [];

  for (const [i, d] of (policy.licenseFiles ?? []).entries()) {
    if (!isValidLicenseFile(d)) {
      const fields = (typeof d === 'object' && d !== null ? d : {}) as Record<string, unknown>;
      violations.push(
        `licence-file declaration #${i} (${String(fields.package)}, ${String(fields.version)}) is malformed: package, license and reason must be non-empty strings, version one exact version, file a bare file name, and sha256 64 lowercase hex characters`,
      );
      continue;
    }
    const id = `${d.package}@${d.version}`;
    let found: { bucket: string; index: number; entry: LicensedPackage; at: number } | undefined;
    for (const [bucket, packages] of Object.entries(working)) {
      for (const [index, entry] of packages.entries()) {
        const at = entry.name === d.package ? entry.versions.indexOf(d.version) : -1;
        if (at >= 0) found ??= { bucket, index, entry, at };
      }
    }
    if (found === undefined) {
      violations.push(`stale licence-file declaration: ${id} is not in the report; remove it`);
      continue;
    }
    const { bucket, index, entry, at } = found;
    if (!UNKNOWN.has(bucket.trim().toLowerCase())) {
      if (bucket !== d.license) {
        violations.push(
          `${id}: the report says ${bucket}, the policy declares ${d.license}; fix the declaration`,
        );
      }
      continue; // already the declared licence (case-insensitive file systems): nothing to resolve
    }

    let dirs: string[];
    if (entry.versions.length === 1) dirs = [...entry.paths];
    else if (entry.paths.length === entry.versions.length) {
      dirs = [entry.paths[at]].filter((p): p is string => p !== undefined);
    } else {
      violations.push(
        `${id}: the report lists ${entry.paths.length} paths for ${entry.versions.length} versions; cannot tell which path holds ${d.version}`,
      );
      continue;
    }
    if (dirs.length === 0) {
      violations.push(
        `${id}: the report lists no installed path to read licence file ${d.file} from`,
      );
      continue;
    }
    let mismatch: string | undefined;
    for (const dir of dirs) {
      let actual: string;
      try {
        actual = hash('sha256', readFile(join(dir, d.file)), 'hex');
      } catch (error) {
        mismatch = error instanceof Error ? error.message : String(error);
        break;
      }
      if (actual !== d.sha256) {
        mismatch = actual;
        break;
      }
    }
    if (mismatch !== undefined) {
      violations.push(
        `${id}: licence file ${d.file} does not match the policy (sha256 ${mismatch} vs ${d.sha256})`,
      );
      continue;
    }

    const remaining = working[bucket] ?? [];
    if (entry.versions.length === 1) remaining.splice(index, 1);
    else {
      remaining[index] = {
        ...entry,
        versions: entry.versions.filter((_, k) => k !== at),
        paths: entry.paths.filter((_, k) => k !== at),
      };
    }
    if (remaining.length === 0) delete working[bucket];
    working[d.license] = [
      ...(working[d.license] ?? []),
      { ...entry, versions: [d.version], paths: [...dirs], license: d.license },
    ];
  }
  return { report: working, violations };
}

/** Licence -> package count (one per name@version), most common first. */
export function census(report: LicenseReport): [string, number][] {
  return Object.entries(report)
    .map(([license, packages]): [string, number] => [
      license,
      packages.reduce((sum, p) => sum + p.versions.length, 0),
    ])
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function loadReport(): LicenseReport {
  // pnpm is a .cmd shim on Windows, which Node only spawns through cmd.exe
  const [command, argv] =
    process.platform === 'win32'
      ? ['cmd.exe', ['/c', 'pnpm', ...LICENSES_ARGS]]
      : ['pnpm', [...LICENSES_ARGS]];
  const result = spawnSync(command, argv, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  if (result.error !== undefined) throw result.error;
  if (result.status !== 0) {
    throw new Error(`pnpm ${LICENSES_ARGS.join(' ')} exited ${result.status}\n${result.stderr}`);
  }
  return JSON.parse(result.stdout) as LicenseReport;
}

function main(): number {
  const policyPath = join(import.meta.dirname, '..', 'tests', 'package', 'license-policy.json');
  const policy = JSON.parse(readFileSync(policyPath, 'utf8')) as LicensePolicyInput;
  const resolved = resolveLicenseFiles(loadReport(), policy);
  const report = resolved.report;
  const violations = [...resolved.violations, ...evaluate(report, policy)];

  process.stdout.write('licence census (licence -> packages):\n');
  for (const [license, count] of census(report)) {
    process.stdout.write(`  ${license}: ${count}\n`);
  }
  if (violations.length === 0) {
    process.stdout.write(
      `licence audit: ok (${policy.exceptions.length} exceptions, ${policy.licenseFiles?.length ?? 0} licence files)\n`,
    );
    return 0;
  }
  process.stderr.write(`licence audit: ${violations.length} violation(s)\n`);
  for (const violation of violations) process.stderr.write(`  - ${violation}\n`);
  return 1;
}

if (import.meta.main) process.exitCode = main();

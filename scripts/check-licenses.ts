// scripts/check-licenses.ts
// G4: lockfile licence audit. Runs `pnpm licenses list --json --recursive` over the whole workspace (dev
// dependencies included: tsdown inlines the codemod's devDependencies into dist/codemod/cli.mjs, which
// ships in the modern-cmdk tarball) and evaluates the report against tests/package/license-policy.json.
// Prints every violation and a census (licence -> count); exits 1 on any violation.
// Node built-ins only; run with `node scripts/check-licenses.ts` (native type stripping).

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface LicensedPackage {
  readonly name: string;
  readonly versions: readonly string[];
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

/** Returns one message per violation; an empty array means the report satisfies the policy. */
export function evaluate(report: LicenseReport, policy: LicensePolicy): string[] {
  const allowed = new Set(policy.allowed);
  const violations: string[] = [];
  const used = new Array<boolean>(policy.exceptions.length).fill(false);

  for (const [index, exception] of policy.exceptions.entries()) {
    if (exception.reason.trim() === '') {
      violations.push(
        `exception for ${exception.package} (${exception.license}) has no reason: say why it is acceptable and whether it ships`,
      );
      used[index] = true; // reported once above; an exception without a reason grants nothing
    }
  }

  for (const entry of Object.values(report).flat()) {
    const license = entry.license.trim();
    const ids = entry.versions.map((version) => `${entry.name}@${version}`).join(', ');

    if (UNKNOWN.has(license.toLowerCase())) {
      const idx = policy.exceptions.findIndex(
        (e) => matchesPackage(e.package, entry.name) && e.license === entry.license,
      );
      if (idx >= 0) used[idx] = true;
      if (idx < 0 || policy.exceptions[idx]?.reason.trim() === '') {
        violations.push(`${ids}: unknown or missing licence`);
      }
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

    const idx = policy.exceptions.findIndex(
      (e) => matchesPackage(e.package, entry.name) && e.license === entry.license,
    );
    const exception = idx >= 0 ? policy.exceptions[idx] : undefined;
    if (idx >= 0) used[idx] = true;
    if (exception === undefined) {
      violations.push(`${ids}: licence "${license}" is not in the allowlist and has no exception`);
    } else if (exception.reason.trim() === '') {
      violations.push(`${ids}: the exception for "${license}" has no reason`);
    } else if (exception.ships && COPYLEFT.test(license)) {
      violations.push(
        `${ids}: shipped copyleft licence "${license}" gets no exception (owner decision)`,
      );
    }
  }

  for (const [index, exception] of policy.exceptions.entries()) {
    if (!used[index]) {
      violations.push(
        `stale exception: ${exception.package} (${exception.license}) matches no package in the report; remove it`,
      );
    }
  }
  return violations;
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
  const policy = JSON.parse(readFileSync(policyPath, 'utf8')) as LicensePolicy;
  const report = loadReport();
  const violations = evaluate(report, policy);

  process.stdout.write('licence census (licence -> packages):\n');
  for (const [license, count] of census(report)) {
    process.stdout.write(`  ${license}: ${count}\n`);
  }
  if (violations.length === 0) {
    process.stdout.write(`licence audit: ok (${policy.exceptions.length} exceptions)\n`);
    return 0;
  }
  process.stderr.write(`licence audit: ${violations.length} violation(s)\n`);
  for (const violation of violations) process.stderr.write(`  - ${violation}\n`);
  return 1;
}

if (import.meta.main) process.exitCode = main();

// scripts/check-release-notes.ts
// Keeps the repository's internal vocabulary out of text that becomes public: a changeset (it becomes a CHANGELOG
// section and a GitHub release body) and a release-notes summary file (it becomes the head of a release body). Runs
// with Node's native type stripping and needs no install:
//
//   node scripts/check-release-notes.ts [--stdin] [file ...]
//
// With no file it reads .changeset/*.md and .github/release-notes/*.md (a README.md among them is the folder's own
// guide and is skipped). With files it reads those; --stdin reads one text from standard input (`gh release view
// <tag> --json body --jq .body | node scripts/check-release-notes.ts --stdin` checks a published body).
//
// A line fails when it holds any of:
//   - a ledger id: /\b[A-Z]{1,6}(?:-[A-Z]{1,4})?-\d+\b/ (DT-19, SEC-13, TUB-82 ...; the spec's patterns do not catch the W4-03
//     and P03 shapes) or /\bD\d{2,3}\b/ (D109), except the allow-list UTF-8, UTF-16, SHA-256, SHA-512 and ISO-8601,
//     which name standards, and the public advisory ids CVE-2026-12345 and GHSA-xxxx-xxxx-xxxx, which are blanked first;
//   - a workflow id: wf_ followed by hex digits;
//   - a bare commit hash: seven to forty hex digits holding a digit and a letter a to f, outside a URL (a hash inside
//     a URL is the link to a commit or a record and is allowed; a count such as 3153027 and a word such as `defaced`
//     are not hashes).
// Output: one stderr line per problem, `file:line: <kind> <text>`, then on stdout
// `check-release-notes: N texts checked, M problems`. Exit codes: 0 = none, 1 = a problem, 2 = usage error.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

const ROOT: string = resolve(import.meta.dirname, '..');
const LEDGER_ID = /\b[A-Z]{1,6}(?:-[A-Z]{1,4})?-\d+\b|\bD\d{2,3}\b/g;
const ALLOWED_IDS: ReadonlySet<string> = new Set([
  'UTF-8',
  'UTF-16',
  'SHA-256',
  'SHA-512',
  'ISO-8601',
]);
const ADVISORY_ID = /\bCVE-\d{4}-\d{4,}\b|\bGHSA(?:-[0-9a-z]{4}){3}\b/g;
const WORKFLOW_ID = /\bwf_[0-9a-f]+/g;
const COMMIT_HASH =
  /(?<![0-9a-zA-Z_])(?=[0-9a-f]*[0-9])(?=[0-9a-f]*[a-f])[0-9a-f]{7,40}(?![0-9a-zA-Z_])/g;
const URL_TEXT = /https?:\/\/[^\s)>\]"'`]+/g;

export interface Problem {
  readonly line: number;
  readonly kind: 'ledger id' | 'workflow id' | 'commit hash';
  readonly text: string;
}

/** Every ledger id, workflow id and bare commit hash in a text, with its 1-based line. */
export function releaseNoteProblems(text: string): Problem[] {
  const problems: Problem[] = [];
  for (const [index, source] of text.split(/\r?\n/).entries()) {
    const at: number = index + 1;
    // A public advisory id (CVE-2026-12345, GHSA-xxxx-xxxx-xxxx) is not a ledger id: blank it, keep the offsets.
    const line: string = source.replace(ADVISORY_ID, (id) => ' '.repeat(id.length));
    for (const match of line.matchAll(LEDGER_ID)) {
      if (!ALLOWED_IDS.has(match[0]))
        problems.push({ line: at, kind: 'ledger id', text: match[0] });
    }
    for (const match of line.matchAll(WORKFLOW_ID)) {
      problems.push({ line: at, kind: 'workflow id', text: match[0] });
    }
    // A hash inside a URL is a link to a commit or a record: blank the URLs, keep the offsets.
    const outsideUrls: string = line.replace(URL_TEXT, (url) => ' '.repeat(url.length));
    for (const match of outsideUrls.matchAll(COMMIT_HASH)) {
      problems.push({ line: at, kind: 'commit hash', text: match[0] });
    }
  }
  return problems;
}

function defaultFiles(root: string): string[] {
  const files: string[] = [];
  for (const dir of ['.changeset', '.github/release-notes']) {
    const full: string = join(root, dir);
    if (!existsSync(full)) continue;
    for (const name of readdirSync(full).sort()) {
      if (name.endsWith('.md') && name !== 'README.md') files.push(join(full, name));
    }
  }
  return files;
}

function main(): number {
  let parsed: { values: { stdin?: boolean }; positionals: string[] };
  try {
    parsed = parseArgs({
      options: { stdin: { type: 'boolean' } },
      allowPositionals: true,
      strict: true,
    });
  } catch (error) {
    process.stderr.write(
      `check-release-notes: ${(error as Error).message}\nusage: node scripts/check-release-notes.ts [--stdin] [file ...]\n`,
    );
    return 2;
  }
  const texts: { name: string; text: string }[] = [];
  if (parsed.values.stdin === true) {
    texts.push({ name: '<stdin>', text: readFileSync(0, 'utf8') });
  }
  const files: string[] =
    parsed.positionals.length > 0
      ? parsed.positionals.map((p) => resolve(p))
      : parsed.values.stdin === true
        ? []
        : defaultFiles(ROOT);
  for (const file of files) {
    if (!existsSync(file)) {
      process.stderr.write(`check-release-notes: ${file} does not exist\n`);
      return 2;
    }
    texts.push({
      name: file.startsWith(ROOT) ? file.slice(ROOT.length + 1).replaceAll('\\', '/') : file,
      text: readFileSync(file, 'utf8'),
    });
  }

  let count = 0;
  for (const { name, text } of texts) {
    for (const problem of releaseNoteProblems(text)) {
      process.stderr.write(`${name}:${problem.line}: ${problem.kind} ${problem.text}\n`);
      count++;
    }
  }
  process.stdout.write(`check-release-notes: ${texts.length} texts checked, ${count} problems\n`);
  return count > 0 ? 1 : 0;
}

if (import.meta.main) process.exitCode = main();

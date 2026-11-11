// tests/unit/check-release-notes.test.ts
// scripts/check-release-notes.ts: the vocabulary that must not reach a changeset or a release body (ledger ids,
// workflow ids, bare commit hashes) as pure matching, and the script's own runs on files and on stdin.

import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { afterAll, describe, expect, it } from 'vitest';
import { releaseNoteProblems } from '../../scripts/check-release-notes.ts';

const run = promisify(execFile);
const SCRIPT: string = resolve(import.meta.dirname, '../../scripts/check-release-notes.ts');

const kinds = (text: string): string[] =>
  releaseNoteProblems(text).map((p) => `${p.line}:${p.kind}:${p.text}`);

describe('releaseNoteProblems', () => {
  it('passes a plain summary with versions, dates, sizes and standards', () => {
    const text = [
      '**Upgrade:** `npm install modern-cmdk@1.7.1` · **Breaking:** none · **Deprecated:** none',
      '',
      'The bin is 3153027 bytes, measured on 2026-11-08 with UTF-8 text, SHA-256 digests and ISO-8601 dates.',
      'Words such as defaced and decade are not hashes, and neither is 1234567.',
    ].join('\n');
    expect(kinds(text)).toEqual([]);
  });

  it('finds ledger ids of both shapes and reports the allow-listed standards as fine', () => {
    const text =
      'Fixes DT-19 and SEC-13 (see RP-23). D109 and D42 are decisions. UTF-16 and SHA-512 are fine.';
    expect(kinds(text)).toEqual([
      '1:ledger id:DT-19',
      '1:ledger id:SEC-13',
      '1:ledger id:RP-23',
      '1:ledger id:D109',
      '1:ledger id:D42',
    ]);
  });

  it('finds a ledger id whose number part starts with a letter, and not the standards next to it', () => {
    expect(kinds('Focuses the input in a shadow root (RA-X3), as UTF-8 and ISO-8601 do.')).toEqual([
      '1:ledger id:RA-X3',
    ]);
    expect(kinds('RA-X10 and B-Q6')).toEqual(['1:ledger id:RA-X10', '1:ledger id:B-Q6']);
    // A letter-and-digit token that is not an id: lower-case words and a quarter.
    expect(kinds('Lower-case x-y3, e-mail and Q3-2026')).toEqual([]);
  });

  it('finds a workflow id', () => {
    expect(kinds('run wf_0a1b2c3d4e5f was green')).toEqual(['1:workflow id:wf_0a1b2c3d4e5f']);
  });

  it('finds a bare commit hash, short or full, and lets a hash inside a URL pass', () => {
    const full = '380e25e826341cebc46c8a844a524542fd1f8337';
    expect(kinds(`Fixed in a7838c9 and \`${full}\`.`)).toEqual([
      `1:commit hash:a7838c9`,
      `1:commit hash:${full}`,
    ]);
    expect(
      kinds(
        `[record](https://github.com/ABCrimson/modern-cmdk/blob/${full}/benchmarks/baseline.json)`,
      ),
    ).toEqual([]);
    expect(kinds(`${full} and https://example.test/${full} and a7838c9`)).toEqual([
      `1:commit hash:${full}`,
      `1:commit hash:a7838c9`,
    ]);
  });

  it('bites on the 1.7.0 release-body habits: an id in prose, and a hash after a URL on the same line', () => {
    const text = [
      'Closes C-4 and C-6.',
      'See https://github.com/ABCrimson/modern-cmdk/commit/380e25e then 380e25e.',
    ].join('\n');
    expect(kinds(text)).toEqual(['1:ledger id:C-4', '1:ledger id:C-6', '2:commit hash:380e25e']);
  });

  it('numbers lines from 1 across CRLF and LF', () => {
    expect(kinds('a\r\nb\r\nSEC-1')).toEqual(['3:ledger id:SEC-1']);
  });

  it('lets a public advisory id pass and still finds a ledger id on the same line', () => {
    expect(
      kinds('Fixes CVE-2026-12345 (GHSA-ab12-cd34-ef56), reported once as CVE-2026-1234567.'),
    ).toEqual([]);
    expect(kinds('CVE-2026-12345 closes SEC-13')).toEqual(['1:ledger id:SEC-13']);
  });
});

describe('check-release-notes runs', () => {
  const dirs: string[] = [];
  afterAll(async () => {
    await Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true })));
  });

  async function exec(
    args: string[],
    input?: string,
  ): Promise<{ code: number; stdout: string; stderr: string }> {
    try {
      const child = run(process.execPath, [SCRIPT, ...args], { cwd: tmpdir() });
      if (input !== undefined) {
        child.child.stdin?.end(input);
      }
      const { stdout, stderr } = await child;
      return { code: 0, stdout, stderr };
    } catch (error) {
      const e = error as { code: number; stdout: string; stderr: string };
      return { code: e.code, stdout: e.stdout, stderr: e.stderr };
    }
  }

  it('exits 0 for a clean file and 1 for a file with an id, naming file and line', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'check-release-notes-'));
    dirs.push(dir);
    const clean = join(dir, 'clean.md');
    const dirty = join(dir, 'dirty.md');
    await writeFile(clean, 'The stylesheet gains a rule.\n');
    await writeFile(dirty, 'Fine line.\nFixes SEC-13.\n');

    const ok = await exec([clean]);
    expect(ok.code).toBe(0);
    expect(ok.stdout).toContain('check-release-notes: 1 texts checked, 0 problems');

    const bad = await exec([clean, dirty]);
    expect(bad.code).toBe(1);
    expect(bad.stderr).toContain(`${dirty}:2: ledger id SEC-13`);
    expect(bad.stdout).toContain('check-release-notes: 2 texts checked, 1 problems');
  });

  it('--stdin checks a published body piped in', async () => {
    const clean = await exec(['--stdin'], 'A body with nothing internal.\n');
    expect(clean.code).toBe(0);
    expect(clean.stdout).toContain('1 texts checked, 0 problems');

    const dirty = await exec(['--stdin'], 'Body\nwith wf_abc123 inside\n');
    expect(dirty.code).toBe(1);
    expect(dirty.stderr).toContain('<stdin>:2: workflow id wf_abc123');
  });

  it('reads the changesets and release notes of the repository by default, and the repository passes', async () => {
    const result = await run(process.execPath, [SCRIPT], {
      cwd: resolve(import.meta.dirname, '../..'),
    }).then(
      (r) => ({ code: 0, ...r }),
      (e: { code: number; stdout: string; stderr: string }) => e,
    );
    expect(result.stderr, 'a changeset or release-notes summary carries internal vocabulary').toBe(
      '',
    );
    expect(result.code).toBe(0);
  });

  it('exits 2 for a missing file and for an unknown flag', async () => {
    expect((await exec([join(tmpdir(), 'check-release-notes-missing.md')])).code).toBe(2);
    expect((await exec(['--bogus'])).code).toBe(2);
  });
});

// tests/unit/bench-record.test.ts
// D93: benchmarks/standalone/record-baseline.ts re-records benchmarks/baseline.json from a
// `benchmark-results` artifact. The recorded file must be one compare-baseline.ts accepts and reads the
// same medians from; targets and thresholds carry over; a new key needs --target (exit 2); the note
// names D93 and the source. Fixtures: benchmarks/standalone/fixtures/ (baseline.json is the existing
// baseline, record-results*.json the artifacts).

import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const standalone = resolve(import.meta.dirname, '../../benchmarks/standalone');
const fixtures = resolve(standalone, 'fixtures');
const recorder = resolve(standalone, 'record-baseline.ts');
const comparer = resolve(standalone, 'compare-baseline.ts');
const SOURCE = 'https://github.com/ABCrimson/modern-cmdk/actions/runs/42455685144';

interface RecordedRow {
  readonly median_ms: number;
  readonly p99_ms: number;
  readonly target_ms: number;
}
interface Recorded {
  readonly date: string;
  readonly commit: string;
  readonly source: string;
  readonly note: string;
  readonly environment: Record<string, unknown>;
  readonly regressionThresholds: Record<string, number>;
  readonly benchmarks: Record<string, Record<string, RecordedRow>>;
}

function run(
  script: string,
  args: readonly string[],
): {
  status: number | null;
  stdout: string;
  stderr: string;
} {
  const r = spawnSync(process.execPath, [script, ...args], { encoding: 'utf-8', timeout: 30_000 });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

describe('D93: record-baseline.ts', () => {
  let dir: string;
  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'cmdk-record-'));
  });
  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const record = (
    results: string,
    out: string,
    extra: readonly string[] = [],
  ): ReturnType<typeof run> =>
    run(recorder, [
      resolve(fixtures, results),
      '--source',
      SOURCE,
      '--baseline',
      resolve(fixtures, 'baseline.json'),
      '--out',
      out,
      ...extra,
    ]);

  it('records a baseline that compare-baseline.ts accepts and compares at the same medians, exit 0', async () => {
    const out = join(dir, 'baseline.json');
    const recorded = record('record-results.json', out);
    expect(recorded.status).toBe(0);
    expect(recorded.stdout).toContain('recorded 3 rows');

    const compared = run(comparer, [
      '--baseline',
      out,
      '--current',
      resolve(fixtures, 'record-results.json'),
    ]);
    expect(compared.status).toBe(0);
    expect(compared.stderr).toBe('');
    // the table shows the recorded medians as both baseline and current: every delta is +0.0 %
    expect(compared.stdout.match(/\+0\.0%/g)).toHaveLength(3);
  });

  it('writes the results file medians, p99s, commit, date and environment', async () => {
    const out = join(dir, 'fields.json');
    expect(record('record-results.json', out).status).toBe(0);
    const file = JSON.parse(await readFile(out, 'utf-8')) as Recorded;
    expect(file.benchmarks['search']?.['ts-scorer-10k']).toMatchObject({
      median_ms: 3.5,
      p99_ms: 6.25,
    });
    expect(file.benchmarks['stateUpdate']?.['navigate']).toMatchObject({ median_ms: 0.0009 });
    expect(file.commit).toBe('836284049a6df5902bacbadf8ca777c9fae1906e');
    expect(file.date).toBe('2026-11-08');
    expect(file.environment).toMatchObject({ runner: 'ubuntu26', cpuCount: 4 });
    expect(file.source).toBe(SOURCE);
  });

  it('carries each existing row target_ms and the thresholds, floor included, over', async () => {
    const out = join(dir, 'carried.json');
    expect(record('record-results.json', out).status).toBe(0);
    const file = JSON.parse(await readFile(out, 'utf-8')) as Recorded;
    expect(file.benchmarks['search']?.['ts-scorer-10k']?.target_ms).toBe(16);
    expect(file.benchmarks['stateUpdate']?.['navigate']?.target_ms).toBe(1);
    expect(file.benchmarks['stateUpdate']?.['searchChange']?.target_ms).toBe(4);
    expect(file.regressionThresholds).toEqual({ warning: 0.05, failure: 0.15, floor_ms: 0.01 });
  });

  it('a task with no existing row and no --target exits 2 with a usage line and writes nothing', async () => {
    const out = join(dir, 'untargeted.json');
    const r = record('record-results-new-key.json', out);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('search:ts-scorer-100k');
    expect(r.stderr).toContain('--target search:ts-scorer-100k=<ms>');
    expect(r.stderr).toContain('usage: node benchmarks/standalone/record-baseline.ts');
    await expect(readFile(out, 'utf-8')).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('--target gives the new row its target_ms and the file is accepted by compare-baseline.ts', async () => {
    const out = join(dir, 'targeted.json');
    const r = record('record-results-new-key.json', out, ['--target', 'search:ts-scorer-100k=80']);
    expect(r.status).toBe(0);
    const file = JSON.parse(await readFile(out, 'utf-8')) as Recorded;
    expect(file.benchmarks['search']?.['ts-scorer-100k']).toEqual({
      median_ms: 40,
      p99_ms: 55,
      target_ms: 80,
    });
    const compared = run(comparer, [
      '--baseline',
      out,
      '--current',
      resolve(fixtures, 'record-results-new-key.json'),
    ]);
    expect(compared.status).toBe(0);
  });

  it('a --target that names no task is a usage error, exit 2', () => {
    const r = record('record-results.json', join(dir, 'stray.json'), ['--target', 'search:nope=3']);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('search:nope');
    expect(r.stderr).toContain('usage:');
  });

  it('a malformed --target and a missing --source are usage errors, exit 2', () => {
    const malformed = record('record-results.json', join(dir, 'm.json'), ['--target', 'search']);
    expect(malformed.status).toBe(2);
    expect(malformed.stderr).toContain('<category>:<key>=<ms>');
    const noSource = run(recorder, [resolve(fixtures, 'record-results.json')]);
    expect(noSource.status).toBe(2);
    expect(noSource.stderr).toContain('missing --source');
  });

  it('an existing row that the results file lacks is an error, never a silent drop', () => {
    const r = run(recorder, [
      resolve(fixtures, 'record-results-missing-row.json'),
      '--source',
      SOURCE,
      '--baseline',
      resolve(fixtures, 'baseline.json'),
      '--out',
      join(dir, 'dropped.json'),
    ]);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('never drops a row silently');
  });

  it('the note is present tense and names D93, the source, the runner, Node and the thresholds', async () => {
    const out = join(dir, 'note.json');
    expect(record('record-results.json', out).status).toBe(0);
    const { note } = JSON.parse(await readFile(out, 'utf-8')) as Recorded;
    expect(note).toContain('D93');
    expect(note).toContain(SOURCE);
    expect(note).toContain("median of the harness's 5 runs' p50");
    expect(note).toContain('ubuntu26 image 20261101.186.1');
    expect(note).toContain('Node v28.0.0-nightly20261107a43bfb5bb2');
    expect(note).toContain('5 %');
    expect(note).toContain('15 %');
    expect(note).toContain('floor of 0.01 ms');
    expect(note).toContain('rewritten at each re-record');
  });
});

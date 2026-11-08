// tests/unit/bench-record.test.ts
// D93, D27: benchmarks/standalone/record-baseline.ts re-records benchmarks/baseline.json from a
// committed history file (benchmarks/history/<YYYY-MM-DD>-<sha7>.json, a copy of the benchmark-results
// artifact). The recorded file must be one compare-baseline.ts accepts and reads the same medians from;
// targets and thresholds carry over; `source` is the history file's path, never a run id; `version`
// comes from the commit's manifest; five runs are required; a new key needs --target (exit 2).
// TEB-103, D97: the baseline keeps one record per CPU model; a recording replaces or creates the record
// of the history file's `environment.cpu` and leaves every other record and the thresholds as they were.
//
// Hermetic: every test records against a throwaway git repository (`--repo`) whose one commit holds a
// packages/modern-cmdk/package.json at version 9.9.9, and whose benchmarks/history/ the test fills from
// the fixtures in benchmarks/standalone/fixtures/ (record-artifact*.json, baseline.json is the existing
// baseline) with the commit rewritten to that repository's HEAD. Nothing depends on this checkout's HEAD.

import { execFileSync, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const standalone = resolve(import.meta.dirname, '../../benchmarks/standalone');
const fixtures = resolve(standalone, 'fixtures');
const recorder = resolve(standalone, 'record-baseline.ts');
const comparer = resolve(standalone, 'compare-baseline.ts');
const DATE = '2026-11-08T06:42:04.263Z';
const DAY = '2026-11-08';

interface RecordedRow {
  readonly median_ms: number;
  readonly p99_ms: number;
  readonly target_ms: number;
}
/** The record of one CPU model. */
interface Recorded {
  readonly version: string;
  readonly date: string;
  readonly commit: string;
  readonly source: string;
  readonly note: string;
  readonly environment: Record<string, unknown>;
  readonly benchmarks: Record<string, Record<string, RecordedRow>>;
}
interface RecordedFile {
  readonly schemaVersion: number;
  readonly regressionThresholds: Record<string, number>;
  readonly records: Record<string, Recorded>;
}

/** The CPU model of the fixtures' history files and of baseline.json's one record. */
const CPU_A = 'Fixture CPU A';

async function loadFile(path: string): Promise<RecordedFile> {
  return JSON.parse(await readFile(path, 'utf-8')) as RecordedFile;
}

/** The record of CPU A in a written baseline. */
async function recordOf(path: string): Promise<Recorded> {
  const record = (await loadFile(path)).records[CPU_A];
  if (record === undefined) throw new Error(`${path} has no record for ${CPU_A}`);
  return record;
}

// A hook's GIT_DIR (a pre-push from a linked worktree sets it) must not reach the throwaway repository
const env = Object.fromEntries(
  Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_')),
);

function run(
  script: string,
  args: readonly string[],
  extraEnv: Readonly<Record<string, string>> = {},
): {
  status: number | null;
  stdout: string;
  stderr: string;
} {
  const r = spawnSync(process.execPath, [script, ...args], {
    encoding: 'utf-8',
    timeout: 30_000,
    env: { ...env, ...extraEnv },
  });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

describe('D93, D27: record-baseline.ts', () => {
  let dir: string;
  let commit: string;
  let sha7: string;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'cmdk-record-'));
    const git = (...args: string[]): string =>
      execFileSync('git', ['-C', dir, ...args], { encoding: 'utf-8', env }).trim();
    git('init', '-q');
    await mkdir(join(dir, 'packages/modern-cmdk'), { recursive: true });
    await writeFile(
      join(dir, 'packages/modern-cmdk/package.json'),
      `${JSON.stringify({ name: 'modern-cmdk', version: '9.9.9' })}\n`,
    );
    git('add', '-A');
    git(
      '-c',
      'user.name=test',
      '-c',
      'user.email=test@example.com',
      '-c',
      'commit.gpgsign=false',
      'commit',
      '-q',
      '-m',
      'fixture',
    );
    commit = git('rev-parse', 'HEAD');
    sha7 = commit.slice(0, 7);
  });
  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  /** Writes a fixture into the repository's benchmarks/history/ (commit = its HEAD) and returns the path. */
  async function place(
    fixture: string,
    mutate: (file: Record<string, unknown>) => void = () => {},
    name = `${DAY}-${sha7}.json`,
  ): Promise<string> {
    const file = JSON.parse(await readFile(resolve(fixtures, fixture), 'utf-8')) as Record<
      string,
      unknown
    >;
    file.commit = commit;
    file.date = DATE;
    mutate(file);
    const path = join(dir, 'benchmarks/history', name);
    await mkdir(join(dir, 'benchmarks/history'), { recursive: true });
    await writeFile(path, `${JSON.stringify(file, null, 2)}\n`);
    return path;
  }

  const record = (
    history: string,
    out: string,
    extra: readonly string[] = [],
  ): ReturnType<typeof run> =>
    run(recorder, [
      history,
      '--repo',
      dir,
      '--baseline',
      resolve(fixtures, 'baseline.json'),
      '--out',
      out,
      ...extra,
    ]);

  it('records a baseline that compare-baseline.ts accepts and compares at the same medians, exit 0', async () => {
    const history = await place('record-artifact.json');
    const out = join(dir, 'baseline-ok.json');
    const recorded = record(history, out);
    expect(recorded.status).toBe(0);
    expect(recorded.stdout).toContain('recorded 3 rows');

    const compared = run(comparer, ['--baseline', out, '--current', history]);
    expect(compared.status).toBe(0);
    expect(compared.stderr).toBe('');
    // the table shows the recorded medians as both baseline and current: every delta is +0.0 %
    expect(compared.stdout.match(/\+0\.0%/g)).toHaveLength(3);
  });

  it('writes the file medians, p99s, commit, date and environment', async () => {
    const history = await place('record-artifact.json');
    const out = join(dir, 'fields.json');
    expect(record(history, out).status).toBe(0);
    const file = await recordOf(out);
    expect(file.benchmarks.search?.['ts-scorer-10k']).toMatchObject({
      median_ms: 3.5,
      p99_ms: 6.25,
    });
    expect(file.benchmarks.stateUpdate?.navigate).toMatchObject({ median_ms: 0.0009 });
    expect(file.commit).toBe(commit);
    expect(file.date).toBe(DAY);
    expect(file.environment).toMatchObject({ runner: 'ubuntu26', cpuCount: 4 });
  });

  it('D27: source is the history file path, forward slashes, never a run id; the note names it', async () => {
    const history = await place('record-artifact.json');
    const out = join(dir, 'source.json');
    expect(record(history, out).status).toBe(0);
    const file = await recordOf(out);
    expect(file.source).toBe(`benchmarks/history/${DAY}-${sha7}.json`);
    expect(file.note).toContain(file.source);
    expect(file.note).not.toMatch(/runs\/\d|run id/);
  });

  it("the version is the manifest's at the commit (9.9.9 here), not carried over from the old baseline", async () => {
    const history = await place('record-artifact.json');
    const out = join(dir, 'version.json');
    expect(record(history, out).status).toBe(0);
    const file = await recordOf(out);
    expect(file.version).toBe('9.9.9');
  });

  it('a commit git cannot resolve exits 2 and writes nothing', async () => {
    const history = await place('record-artifact.json', (f) => {
      f.commit = `${sha7}${'0'.repeat(33)}`;
    });
    const out = join(dir, 'unresolved.json');
    const r = record(history, out);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('git cannot read packages/modern-cmdk/package.json');
    await expect(readFile(out, 'utf-8')).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('carries each existing row target_ms and the thresholds, floor included, over', async () => {
    const history = await place('record-artifact.json');
    const out = join(dir, 'carried.json');
    expect(record(history, out).status).toBe(0);
    const file = await recordOf(out);
    expect(file.benchmarks.search?.['ts-scorer-10k']?.target_ms).toBe(16);
    expect(file.benchmarks.stateUpdate?.navigate?.target_ms).toBe(1);
    expect(file.benchmarks.stateUpdate?.searchChange?.target_ms).toBe(4);
    expect((await loadFile(out)).regressionThresholds).toEqual({
      warning: 0.05,
      failure: 0.15,
      floor_ms: 0.01,
    });
  });

  it("TEB-103: bench:record writes only the record of the history file's CPU", async () => {
    const twoCpus = resolve(fixtures, 'baseline-two-cpus.json');
    const before = JSON.parse(await readFile(twoCpus, 'utf-8')) as RecordedFile;
    const recordWith = (history: string, out: string): ReturnType<typeof run> =>
      run(recorder, [history, '--repo', dir, '--baseline', twoCpus, '--out', out]);

    // A CPU that has a record: that record is replaced, the other and the thresholds are untouched
    const onB = await place('record-artifact.json', (f) => {
      (f.environment as Record<string, unknown>).cpu = 'Fixture CPU B';
    });
    const replacedOut = join(dir, 'two-cpus-replaced.json');
    expect(recordWith(onB, replacedOut).status).toBe(0);
    const replaced = await loadFile(replacedOut);
    expect(Object.keys(replaced.records)).toEqual([CPU_A, 'Fixture CPU B']);
    expect(replaced.records[CPU_A]).toEqual(before.records[CPU_A]);
    expect(replaced.records['Fixture CPU B']?.commit).toBe(commit);
    expect(replaced.records['Fixture CPU B']?.benchmarks.stateUpdate?.searchChange?.median_ms).toBe(
      0.4,
    );
    expect(replaced.regressionThresholds).toEqual(before.regressionThresholds);

    // A CPU without a record: a record is created after the existing ones, which stay as they were
    const onC = await place('record-artifact.json', (f) => {
      (f.environment as Record<string, unknown>).cpu = 'Fixture CPU C';
    });
    const createdOut = join(dir, 'two-cpus-created.json');
    expect(recordWith(onC, createdOut).status).toBe(0);
    const created = await loadFile(createdOut);
    expect(Object.keys(created.records)).toEqual([CPU_A, 'Fixture CPU B', 'Fixture CPU C']);
    expect(created.records[CPU_A]).toEqual(before.records[CPU_A]);
    expect(created.records['Fixture CPU B']).toEqual(before.records['Fixture CPU B']);
    expect(created.records['Fixture CPU C']?.environment).toMatchObject({ cpu: 'Fixture CPU C' });
    // the target_ms of a row the new CPU never had come from the records that have it
    expect(created.records['Fixture CPU C']?.benchmarks.search?.['ts-scorer-10k']?.target_ms).toBe(
      16,
    );
    expect(created.regressionThresholds).toEqual(before.regressionThresholds);
  });

  it('TEB-103: a history file without environment.cpu is refused, nothing written', async () => {
    const history = await place('record-artifact.json', (f) => {
      delete (f.environment as Record<string, unknown>).cpu;
    });
    const out = join(dir, 'no-cpu.json');
    const r = record(history, out);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('"environment.cpu"');
    expect(r.stderr).toContain('usage: node benchmarks/standalone/record-baseline.ts');
    await expect(readFile(out, 'utf-8')).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it.each([0, 3, undefined])(
    'runs = %s exits 2 naming what was found (D93 needs 5)',
    async (runs) => {
      const history = await place('record-artifact.json', (f) => {
        if (runs === undefined) delete f.runs;
        else f.runs = runs;
      });
      const r = record(history, join(dir, 'runs.json'));
      expect(r.status).toBe(2);
      expect(r.stderr).toContain(`"runs" is ${runs === undefined ? 'undefined' : runs}, not 5`);
    },
  );

  it('a name whose date or sha7 does not match the file exits 2 with the usage line', async () => {
    const wrongDay = await place('record-artifact.json', () => {}, `2026-11-07-${sha7}.json`);
    const a = record(wrongDay, join(dir, 'name.json'));
    expect(a.status).toBe(2);
    expect(a.stderr).toContain(`which is ${DAY}-${sha7}.json for this file`);
    expect(a.stderr).toContain('usage: node benchmarks/standalone/record-baseline.ts');
    const wrongSha = await place('record-artifact.json', () => {}, `${DAY}-abcdef0.json`);
    expect(record(wrongSha, join(dir, 'name.json')).status).toBe(2);
  });

  it.each(['HEAD', '-x', 'ABCDEF0123456789ABCDEF0123456789ABCDEF01', 'abcdef0'])(
    'a commit that is not a 40-character lower-case hex sha (%j) exits 2 before git sees it',
    async (bad) => {
      const history = await place('record-artifact.json', (f) => {
        f.commit = bad;
      });
      const r = record(history, join(dir, 'bad-commit.json'));
      expect(r.status).toBe(2);
      expect(r.stderr).toContain('"commit" must be a 40-character lower-case hex sha');
      expect(r.stderr).toContain('usage: node benchmarks/standalone/record-baseline.ts');
    },
  );

  it('the date is the UTC day: 2026-11-07T23:30Z is 2026-11-07 even where the local day is later or earlier', async () => {
    const history = await place(
      'record-artifact.json',
      (f) => {
        f.date = '2026-11-07T23:30:00.000Z';
      },
      `2026-11-07-${sha7}.json`,
    );
    for (const tz of ['America/Chicago', 'Pacific/Auckland']) {
      const out = join(dir, `utc-day-${tz.replace('/', '-')}.json`);
      const r = run(
        recorder,
        [history, '--repo', dir, '--baseline', resolve(fixtures, 'baseline.json'), '--out', out],
        { TZ: tz },
      );
      expect(r.status, r.stderr).toBe(0);
      expect((await recordOf(out)).date).toBe('2026-11-07');
    }
  });

  it('a file outside benchmarks/history/ exits 2', async () => {
    const elsewhere = join(dir, `${DAY}-${sha7}.json`);
    await writeFile(elsewhere, await readFile(await place('record-artifact.json'), 'utf-8'));
    const r = record(elsewhere, join(dir, 'outside.json'));
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('is not a file directly under');
  });

  it('a task with no existing row and no --target exits 2 with a usage line and writes nothing', async () => {
    const history = await place('record-artifact-new-key.json');
    const out = join(dir, 'untargeted.json');
    const r = record(history, out);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('search:ts-scorer-100k');
    expect(r.stderr).toContain('--target search:ts-scorer-100k=<ms>');
    expect(r.stderr).toContain('usage: node benchmarks/standalone/record-baseline.ts');
    await expect(readFile(out, 'utf-8')).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('--target gives the new row its target_ms and the file is accepted by compare-baseline.ts', async () => {
    const history = await place('record-artifact-new-key.json');
    const out = join(dir, 'targeted.json');
    const r = record(history, out, ['--target', 'search:ts-scorer-100k=80']);
    expect(r.status).toBe(0);
    const file = await recordOf(out);
    expect(file.benchmarks.search?.['ts-scorer-100k']).toEqual({
      median_ms: 40,
      p99_ms: 55,
      target_ms: 80,
    });
    expect(run(comparer, ['--baseline', out, '--current', history]).status).toBe(0);
  });

  it('a --target that names no task is a usage error, exit 2', async () => {
    const history = await place('record-artifact.json');
    const r = record(history, join(dir, 'stray.json'), ['--target', 'search:nope=3']);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('search:nope');
    expect(r.stderr).toContain('usage:');
  });

  it.each([
    'search',
    'search:ts-scorer-10k=',
    'search:ts-scorer-10k=0',
    'search:ts-scorer-10k=-4',
    'search:ts-scorer-10k=Infinity',
    'search:ts-scorer-10k=abc',
    'search:ts-scorer-10k=0x10',
    'search:ts-scorer-10k=1e3',
    'search:ts-scorer-10k= 5',
  ])('the --target value %j is a usage error, exit 2', async (target) => {
    const history = await place('record-artifact.json');
    const r = record(history, join(dir, 'bad-target.json'), ['--target', target]);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('<category>:<key>=<ms> with a finite ms > 0');
  });

  it('a missing <history-file> and the removed --source are usage errors, exit 2', async () => {
    const none = run(recorder, ['--repo', dir]);
    expect(none.status).toBe(2);
    expect(none.stderr).toContain('missing <history-file>');
    const history = await place('record-artifact.json');
    const source = run(recorder, [history, '--repo', dir, '--source', '42455685144']);
    expect(source.status).toBe(2);
    expect(source.stderr).toContain('usage:');
  });

  it('an existing row that the file lacks is an error, never a silent drop', async () => {
    const history = await place('record-artifact-missing-row.json');
    const r = record(history, join(dir, 'dropped.json'));
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('never drops a row silently');
  });

  it('the note is present tense and names D93, the file, the runner, Node and the thresholds', async () => {
    const history = await place('record-artifact.json');
    const out = join(dir, 'note.json');
    expect(record(history, out).status).toBe(0);
    const { note } = await recordOf(out);
    expect(note).toContain('D93');
    expect(note).toContain("median of the harness's 5 runs' p50");
    expect(note).toContain('ubuntu26 image 20261101.186.1');
    expect(note).toContain('Node v28.0.0-nightly20261107a43bfb5bb2');
    expect(note).toContain('warns above 5 % and fails above 15 %');
    expect(note).toContain('floor of 0.01 ms');
    expect(note).toContain(
      'Runner noise (+/-20-40 %) makes the 5 %/15 % compare a coarse tripwire, not a verdict, until the 1.9 CodSpeed gate.',
    );
    expect(note).toContain('rewritten at each re-record');
  });
});

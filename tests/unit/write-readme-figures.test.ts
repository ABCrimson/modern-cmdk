// tests/unit/write-readme-figures.test.ts
// scripts/write-readme-figures.ts: the pure parts (record choice, number formatting, the text of the figures line and
// block, the marker replacement) and the script's own runs on a temporary git repository (--root, --main-ref): what it
// writes, that a second run changes nothing, that --check exits 1 on a stale file, which commit the links name, and
// what it does when git cannot say.

import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { afterAll, describe, expect, it } from 'vitest';
import {
  type Figures,
  figuresBlock,
  figuresLine,
  firstDifference,
  kilobytes,
  megabytes,
  newestRecord,
  readFigures,
  renderReadme,
  replaceBetween,
} from '../../scripts/write-readme-figures.ts';

const run = promisify(execFile);
const SCRIPT: string = resolve(import.meta.dirname, '../../scripts/write-readme-figures.ts');
const SHA = '380e25e826341cebc46c8a844a524542fd1f8337';

const FIGURES: Figures = {
  version: '1.7.0',
  coreBytes: 7742,
  reactBytes: 12038,
  stylesBytes: 3986,
  binBytes: 3153027,
  searchMs: 3.8038170000008904,
  cpu: 'AMD EPYC 7763',
  cores: 4,
  githubHosted: true,
  recorded: '2026-11-08',
  reactFloor: '19',
  typescriptFloor: '5.6',
};

describe('newestRecord, kilobytes, megabytes', () => {
  it('orders versions numerically, so 1.10.0 is newer than 1.9.0, and skips other files', () => {
    expect(
      newestRecord(['1.4.0.json', '1.10.0.json', '1.9.0.json', 'README.md', 'notes.json']),
    ).toBe('1.10.0.json');
    expect(newestRecord(['README.md'])).toBeUndefined();
  });

  it('prints SI kB with one decimal and MB with two', () => {
    expect(kilobytes(7742)).toBe('7.7');
    expect(kilobytes(12038)).toBe('12.0');
    expect(kilobytes(3986)).toBe('4.0');
    expect(megabytes(3153027)).toBe('3.15');
  });
});

describe('figuresLine and figuresBlock', () => {
  it('writes the spec line for the package README and for the root README, which differ in the link only', () => {
    expect(figuresLine(FIGURES, '#requirements')).toBe(
      '**7.7 kB** gzip core · **12.0 kB** with the React adapter · ESM only · React ≥ 19 · TypeScript ≥ 5.6 · [Requirements](#requirements)',
    );
    expect(figuresLine(FIGURES, 'packages/modern-cmdk/README.md#requirements')).toContain(
      '[Requirements](packages/modern-cmdk/README.md#requirements)',
    );
  });

  it('writes the table, the bin sentence and the two footnotes, each record linked at the commit', () => {
    const lines = figuresBlock(FIGURES, SHA).split('\n');
    expect(lines.slice(0, 6)).toEqual([
      '| Measure | Value |',
      '|---|--:|',
      '| Core, `modern-cmdk` | 7.7 kB gzip[^size] |',
      '| Core + `modern-cmdk/react` | 12.0 kB gzip[^size] |',
      '| `modern-cmdk/styles.css` | 4.0 kB gzip[^size] |',
      '| Search 10,000 items for one query | 3.8 ms median[^bench] |',
    ]);
    expect(lines[7]).toBe(
      'Most of the unpacked size npm lists is the deprecated `modern-cmdk` bin and the packages it bundles (3.15 MB); no application bundle imports it.',
    );
    expect(lines[9]).toContain(
      '[^size]: size-limit, gzip: the JavaScript entries bundled with rolldown and minified with `NODE_ENV=production`, the stylesheet as shipped; `react`, `react-dom` and `radix-ui` are not counted; 1 kB = 1,000 bytes.',
    );
    expect(lines[9]).toContain(
      `Record: [\`size-history/1.7.0.json\`](https://github.com/ABCrimson/modern-cmdk/blob/${SHA}/benchmarks/size-history/1.7.0.json).`,
    );
    expect(lines[10]).toContain(
      "The median of five runs' p50 on a GitHub-hosted runner (AMD EPYC 7763, 4 cores), recorded on 2026-11-08; runner noise is ±20–40 %.",
    );
    expect(lines[10]).toContain(`blob/${SHA}/benchmarks/baseline.json`);
    expect(lines).toHaveLength(11);
  });

  it('does not call a machine GitHub-hosted unless the record says it ran on a runner', () => {
    const block = figuresBlock({ ...FIGURES, githubHosted: false }, SHA);
    expect(block).toContain('on a machine with AMD EPYC 7763 and 4 cores');
    expect(block).not.toContain('GitHub-hosted');
  });
});

describe('replaceBetween', () => {
  const text = ['before', '<!-- a:start -->', 'old', 'lines', '<!-- a:end -->', 'after'].join('\n');

  it('replaces the lines between the markers and keeps everything else, markers included', () => {
    expect(replaceBetween(text, 'a', 'new\ntext')).toBe(
      ['before', '<!-- a:start -->', 'new\ntext', '<!-- a:end -->', 'after'].join('\n'),
    );
  });

  it('is idempotent', () => {
    const once = replaceBetween(text, 'a', 'x');
    expect(replaceBetween(once, 'a', 'x')).toBe(once);
  });

  it('throws when the pair is missing, doubled, reversed or half there', () => {
    expect(() => replaceBetween('no markers', 'a', 'x')).toThrow(/exactly one <!-- a:start -->/);
    expect(() => replaceBetween(`${text}\n${text}`, 'a', 'x')).toThrow(/2 start and 2 end/);
    expect(() => replaceBetween('<!-- a:end -->\n<!-- a:start -->', 'a', 'x')).toThrow();
    expect(() => replaceBetween('<!-- a:start -->', 'a', 'x')).toThrow(/1 start and 0 end/);
  });

  it('does not take a marker inside a line of prose for a marker', () => {
    expect(() => replaceBetween('text <!-- a:start --> text\n<!-- a:end -->', 'a', 'x')).toThrow();
  });
});

describe('firstDifference', () => {
  it('names the first differing line and is undefined for equal texts', () => {
    expect(firstDifference('a\nb\nc', 'a\nb\nc')).toBeUndefined();
    expect(firstDifference('a\nb\nc', 'a\nX\nc')).toBe('line 2: expected "b", found "X"');
    expect(firstDifference('a', 'a\nb')).toBe('line 2: expected "(end of file)", found "b"');
  });
});

describe('renderReadme', () => {
  it('rewrites a page that holds both marker pairs and sets the commit of the create page link', () => {
    const page = [
      '<!-- figures-line:start -->',
      'stale',
      '<!-- figures-line:end -->',
      '<!-- figures:start -->',
      'RECORD_COMMIT',
      '<!-- figures:end -->',
    ].join('\n');
    const out = renderReadme(page, 'package', FIGURES, SHA);
    expect(out).toContain('**7.7 kB** gzip core');
    expect(out).toContain(`blob/${SHA}/benchmarks/baseline.json`);
    expect(out).not.toContain('RECORD_COMMIT');
    expect(renderReadme(out, 'package', FIGURES, SHA)).toBe(out);

    const create =
      'see [`src/versions.ts`](https://github.com/ABCrimson/modern-cmdk/blob/main/packages/create-modern-cmdk/src/versions.ts) and [x](https://github.com/ABCrimson/modern-cmdk/blob/main/LICENSE)';
    const set = renderReadme(create, 'create', FIGURES, SHA);
    expect(set).toContain(`/blob/${SHA}/packages/create-modern-cmdk/src/versions.ts)`);
    expect(set).toContain('/blob/main/LICENSE');
    expect(() => renderReadme('no link', 'create', FIGURES, SHA)).toThrow(/versions\.ts/);
  });
});

describe('write-readme-figures runs', () => {
  const dirs: string[] = [];
  afterAll(async () => {
    await Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true })));
  });

  const git = (cwd: string, ...args: string[]): Promise<{ stdout: string; stderr: string }> =>
    run('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', ...args], { cwd });
  const head = async (cwd: string): Promise<string> =>
    (await git(cwd, 'rev-parse', 'HEAD')).stdout.trim();

  const record = (core: number, bin: number): string =>
    `${JSON.stringify({
      entries: [
        { name: 'modern-cmdk (core)', size: core },
        { name: 'modern-cmdk + modern-cmdk/react', size: 12038 },
        { name: 'modern-cmdk/styles.css', size: 3986 },
        { name: 'modern-cmdk codemod bin (installed size)', size: bin },
      ],
      tarballs: { 'modern-cmdk@1.7-rc': { unpackedSize: 3377805 } },
    })}\n`;
  const baseline = (
    note = "the median of the harness's 5 runs' p50, runner noise (+/-20-40 %)",
  ): string =>
    `${JSON.stringify({
      schemaVersion: 2,
      records: {
        'Old CPU 9 Core Processor': {
          date: '2026-01-01',
          note,
          environment: { runner: 'ubuntu26', os: 'linux 7-azure', cpuCount: 2 },
          benchmarks: { search: { 'ts-scorer-10k': { median_ms: 99 } } },
        },
        'AMD EPYC 7763 64-Core Processor': {
          date: '2026-11-08',
          note,
          environment: { runner: 'ubuntu26', os: 'linux 7.0.0-1019-azure', cpuCount: 4 },
          benchmarks: { search: { 'ts-scorer-10k': { median_ms: 3.8038170000008904 } } },
        },
      },
    })}\n`;

  const PACKAGE_README = [
    'Lead',
    '<!-- figures-line:start -->',
    'RECORD_COMMIT',
    '<!-- figures-line:end -->',
    'Middle',
    '<!-- figures:start -->',
    'RECORD_COMMIT',
    '<!-- figures:end -->',
    'Tail',
    '',
  ].join('\n');
  const CREATE_README =
    'Pins: [`src/versions.ts`](https://github.com/ABCrimson/modern-cmdk/blob/VERSIONS_COMMIT/packages/create-modern-cmdk/src/versions.ts).\n';

  /** A repository with the records, the manifest, the docs row, a package README and a create README, committed on `main`. */
  async function fixture(): Promise<string> {
    const root: string = await mkdtemp(join(tmpdir(), 'write-readme-figures-'));
    dirs.push(root);
    await git(root, 'init', '-q', '-b', 'main');
    for (const dir of [
      'benchmarks/size-history',
      'packages/modern-cmdk',
      'packages/create-modern-cmdk/src',
      'apps/docs/guide',
    ]) {
      await mkdir(join(root, dir), { recursive: true });
    }
    await writeFile(join(root, 'benchmarks/size-history/1.9.0.json'), record(1, 1));
    await writeFile(join(root, 'benchmarks/size-history/1.10.0.json'), record(7742, 3153027));
    await writeFile(join(root, 'benchmarks/baseline.json'), baseline());
    await writeFile(
      join(root, 'packages/modern-cmdk/package.json'),
      `${JSON.stringify({ type: 'module', peerDependencies: { react: '>=19.0.0 <21.0.0' } })}\n`,
    );
    await writeFile(
      join(root, 'apps/docs/guide/installation.md'),
      '| **TypeScript** | >= 5.6 | floor |\n',
    );
    await writeFile(join(root, 'packages/create-modern-cmdk/src/versions.ts'), 'export {};\n');
    await writeFile(join(root, 'packages/modern-cmdk/README.md'), PACKAGE_README);
    await writeFile(join(root, 'packages/create-modern-cmdk/README.md'), CREATE_README);
    await git(root, 'add', '.');
    await git(root, 'commit', '-q', '-m', 'records');
    return root;
  }

  async function script(
    root: string,
    ...args: string[]
  ): Promise<{ code: number; stdout: string; stderr: string }> {
    try {
      const { stdout, stderr } = await run(
        process.execPath,
        [SCRIPT, '--root', root, '--main-ref', 'main', ...args],
        { cwd: root },
      );
      return { code: 0, stdout, stderr };
    } catch (error) {
      const e = error as { code: number; stdout: string; stderr: string };
      return { code: e.code, stdout: e.stdout, stderr: e.stderr };
    }
  }

  it('readFigures takes the newest record, the newest-dated baseline and the floors from the manifest and the docs', async () => {
    const root = await fixture();
    expect(readFigures(root)).toEqual({
      version: '1.10.0',
      coreBytes: 7742,
      reactBytes: 12038,
      stylesBytes: 3986,
      binBytes: 3153027,
      searchMs: 3.8038170000008904,
      cpu: 'AMD EPYC 7763',
      cores: 4,
      githubHosted: true,
      recorded: '2026-11-08',
      reactFloor: '19',
      typescriptFloor: '5.6',
    });
  });

  it('readFigures refuses a record that no longer supports a sentence the README makes', async () => {
    const root = await fixture();
    await writeFile(join(root, 'benchmarks/size-history/1.10.0.json'), record(7742, 100));
    expect(() => readFigures(root)).toThrow(/is not most of the unpacked size/);
    await writeFile(join(root, 'benchmarks/size-history/1.10.0.json'), record(7742, 3153027));
    await writeFile(join(root, 'benchmarks/baseline.json'), baseline('a note that says nothing'));
    expect(() => readFigures(root)).toThrow(/median is of 5 runs/);
    await writeFile(
      join(root, 'benchmarks/baseline.json'),
      baseline("median of the harness's 5 runs' p50"),
    );
    expect(() => readFigures(root)).toThrow(/runner noise/);
    await writeFile(join(root, 'apps/docs/guide/installation.md'), 'nothing\n');
    await writeFile(join(root, 'benchmarks/baseline.json'), baseline());
    expect(() => readFigures(root)).toThrow(/TypeScript/);
  });

  it('writes both blocks and the versions link, names the commit that last touched the records, and a second run changes nothing', async () => {
    const root = await fixture();
    const records = await head(root);
    // A later commit that touches neither the newest record nor baseline.json does not move the commit.
    await writeFile(join(root, 'unrelated.txt'), 'x\n');
    await git(root, 'add', '.');
    await git(root, 'commit', '-q', '-m', 'unrelated');

    const first = await script(root);
    expect(first.stderr).toBe('');
    expect(first.code).toBe(0);
    expect(first.stdout).toContain('packages/modern-cmdk/README.md: written');
    expect(first.stdout).toContain('packages/create-modern-cmdk/README.md: written');
    const readme = await readFile(join(root, 'packages/modern-cmdk/README.md'), 'utf8');
    expect(readme).toContain('**7.7 kB** gzip core');
    expect(readme).toContain(`blob/${records}/benchmarks/size-history/1.10.0.json`);
    expect(readme).toContain(`blob/${records}/benchmarks/baseline.json`);
    expect(readme.startsWith('Lead\n')).toBe(true);
    expect(readme.endsWith('Tail\n')).toBe(true);
    const create = await readFile(join(root, 'packages/create-modern-cmdk/README.md'), 'utf8');
    expect(create).toContain(`/blob/${records}/packages/create-modern-cmdk/src/versions.ts)`);

    const second = await script(root);
    expect(second.code).toBe(0);
    expect(second.stdout).toContain('packages/modern-cmdk/README.md: up to date');
    expect(second.stdout).toContain('packages/create-modern-cmdk/README.md: up to date');
    expect(await readFile(join(root, 'packages/modern-cmdk/README.md'), 'utf8')).toBe(readme);

    // The commit moves when baseline.json changes again.
    await writeFile(
      join(root, 'benchmarks/baseline.json'),
      baseline().replace('"cpuCount":4', '"cpuCount":8'),
    );
    await git(root, 'add', '.');
    await git(root, 'commit', '-q', '-m', 'rebaseline');
    const moved = await head(root);
    expect((await script(root, '--check')).code).toBe(1);
    expect((await script(root)).code).toBe(0);
    expect(await readFile(join(root, 'packages/modern-cmdk/README.md'), 'utf8')).toContain(
      `blob/${moved}/benchmarks/baseline.json`,
    );
    expect((await script(root, '--check')).code).toBe(0);
  });

  it('--check writes nothing, exits 1 on a stale block and names the line', async () => {
    const root = await fixture();
    expect((await script(root)).code).toBe(0);
    const path = join(root, 'packages/modern-cmdk/README.md');
    const good = await readFile(path, 'utf8');
    expect((await script(root, '--check')).code).toBe(0);

    const stale = good.replace('7.7 kB gzip', '7.6 kB gzip');
    expect(stale).not.toBe(good);
    await writeFile(path, stale);
    const result = await script(root, '--check');
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('packages/modern-cmdk/README.md: stale, line ');
    expect(result.stderr).toContain('7.7 kB gzip');
    expect(await readFile(path, 'utf8')).toBe(stale);
  });

  it('A1-1: a hand-typed figure outside the markers is left alone, and one inside them is corrected', async () => {
    const root = await fixture();
    const path = join(root, 'packages/modern-cmdk/README.md');
    await writeFile(path, PACKAGE_README.replace('Middle', 'Typed by hand: 3.38 MB'));
    expect((await script(root)).code).toBe(0);
    const out = await readFile(path, 'utf8');
    expect(out).toContain('Typed by hand: 3.38 MB');
    expect(out).toContain('3.15 MB');
  });

  it('exits 1 for a README without the marker pair, naming the file, and writes the others', async () => {
    const root = await fixture();
    await writeFile(join(root, 'README.md'), 'No markers here.\n');
    const result = await script(root);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('README.md: needs exactly one <!-- figures-line:start -->');
    expect(await readFile(join(root, 'packages/modern-cmdk/README.md'), 'utf8')).toContain(
      '7.7 kB',
    );
  });

  it('with --check and no usable main ref compares everything but the commit and says so; without --check it fails', async () => {
    const root = await fixture();
    expect((await script(root)).code).toBe(0);
    const noRef = async (
      ...args: string[]
    ): Promise<{ code: number; stdout: string; stderr: string }> => {
      try {
        const { stdout, stderr } = await run(
          process.execPath,
          [SCRIPT, '--root', root, '--main-ref', 'origin/main', ...args],
          { cwd: root },
        );
        return { code: 0, stdout, stderr };
      } catch (error) {
        const e = error as { code: number; stdout: string; stderr: string };
        return { code: e.code, stdout: e.stdout, stderr: e.stderr };
      }
    };
    const checked = await noRef('--check');
    expect(checked.code).toBe(0);
    expect(checked.stdout).toContain(
      'the commit in the links is not compared (origin/main is not in this clone)',
    );

    const path = join(root, 'packages/modern-cmdk/README.md');
    await writeFile(path, (await readFile(path, 'utf8')).replace('7.7 kB gzip', '7.6 kB gzip'));
    expect((await noRef('--check')).code).toBe(1);

    const write = await noRef();
    expect(write.code).toBe(1);
    expect(write.stderr).toContain('origin/main is not in this clone');
  });

  it('a placeholder commit in the links is stale even when the commit cannot be computed', async () => {
    const root = await fixture();
    const result = await run(
      process.execPath,
      [SCRIPT, '--root', root, '--main-ref', 'origin/main', '--check'],
      { cwd: root },
    ).then(
      () => 0,
      (e: { code: number }) => e.code,
    );
    expect(result).toBe(1);
  });

  it('exits 2 on an unknown flag and on a root with no README', async () => {
    const root = await mkdtemp(join(tmpdir(), 'write-readme-figures-empty-'));
    dirs.push(root);
    expect((await script(root)).code).toBe(2);
    const bogus = await run(process.execPath, [SCRIPT, '--bogus']).then(
      () => 0,
      (e: { code: number }) => e.code,
    );
    expect(bogus).toBe(2);
  });
});

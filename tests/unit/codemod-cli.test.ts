import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { availableParallelism, tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { Writable } from 'node:stream';
import { stripVTControlCharacters } from 'node:util';
import type { API, FileInfo } from 'jscodeshift';
import jscodeshift from 'jscodeshift';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type CliDeps,
  defaultConcurrency,
  run,
  type TransformModule,
} from '../../packages/modern-cmdk-codemod/src/cli.js';
import importRewrite from '../../packages/modern-cmdk-codemod/src/transforms/import-rewrite.js';
import { git, gitEnv } from './git-fixture.js';

// The bundled bin imports ./transforms/<name>.mjs next to itself; from source there is no such
// file, so the tests inject the real transform (dist/codemod is covered by tests/dist/cli-smoke).
const deps: CliDeps = {
  // The deprecated bin's profile (the bundled shim passes it): the lenient 1.x titles below keep their meaning. run() without a program is the strict modern-cmdk-codemod (PKG-1 below).
  program: 'modern-cmdk',
  loadTransform: async (name: string): Promise<TransformModule> => {
    if (name === 'should-filter') {
      return {
        default: (): string => {
          throw new Error('boom');
        },
      };
    }
    return { default: importRewrite };
  },
};

/** The new bin's profile: strict by default, dirty-tree refusal, gitignore-aware discovery. */
const codemodDeps: CliDeps = { ...deps, program: 'modern-cmdk-codemod' };

/** Deps with a loader and no program: what run() defaults to. */
const { program: _program, ...defaultProgramDeps }: CliDeps = deps;

const SOURCE = `import { Command } from 'cmdk';\n`;

interface Captured {
  readonly io: { stdout: NodeJS.WritableStream; stderr: NodeJS.WritableStream };
  readonly out: () => string;
  readonly err: () => string;
}

function capture(): Captured {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const writer = (sink: string[]): NodeJS.WritableStream =>
    new Writable({
      write(chunk: Buffer, _enc: BufferEncoding, done: (error?: Error | null) => void): void {
        sink.push(chunk.toString());
        done();
      },
    });
  return {
    io: { stdout: writer(stdout), stderr: writer(stderr) },
    out: () => stripVTControlCharacters(stdout.join('')),
    err: () => stripVTControlCharacters(stderr.join('')),
  };
}

let dir: string;
let configDir: string;
let glob: string;
let file: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'modern-cmdk-cli-'));
  await mkdir(join(dir, 'src'));
  file = join(dir, 'src', 'a.tsx');
  await writeFile(file, SOURCE);
  await writeFile(join(dir, 'src', 'b.tsx'), `export const b = 1;\n`);
  glob = `${dir.replaceAll('\\', '/')}/src/*.tsx`;
  vi.spyOn(process, 'cwd').mockReturnValue(dir);
  // The CLI's own git calls run in this process: cut them off from the machine's git config.
  configDir = await mkdtemp(join(tmpdir(), 'modern-cmdk-cli-git-'));
  for (const [name, value] of Object.entries(gitEnv(configDir))) vi.stubEnv(name, value);
});

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await rm(dir, { recursive: true, force: true });
  await rm(configDir, { recursive: true, force: true });
});

describe('codemod CLI: help and usage', () => {
  it.each(['--help', '-h'])('%s writes usage to stdout and resolves 0', async (flag) => {
    const c = capture();
    expect(await run([flag], c.io, deps)).toBe(0);
    for (const name of ['import-rewrite', 'data-attrs', 'forward-ref', 'should-filter']) {
      expect(c.out()).toContain(name);
    }
    expect(c.out()).toContain('Rewrites cmdk imports to modern-cmdk/react');
    expect(c.out()).toContain('--strict');
    expect(c.out()).toMatch(/--concurrency=N {2,}Files processed/);
    expect(c.err()).toBe('');
  });

  it('--help names the Node floor in exactly one line (D14: a documented fact, not an engines field)', async () => {
    const c = capture();
    expect(await run(['--help'], c.io, deps)).toBe(0);
    const lines = c
      .out()
      .split('\n')
      .filter((l) => l.includes('Node >= 26.4.0'));
    expect(lines).toEqual([
      "Node >= 26.4.0 (the floor modern-cmdk's toolchain and create-modern-cmdk declare; modern-cmdk itself declares no engines)",
    ]);
  });

  it('PKG-1: run() without deps.program is strict (modern-cmdk-codemod)', async () => {
    const help = capture();
    expect(await run(['--help'], help.io, defaultProgramDeps)).toBe(0);
    expect(help.out()).toContain('Usage: modern-cmdk-codemod <transform>');
    expect(help.out()).not.toContain('is deprecated');
    expect(help.out()).toContain('Node >= 26.4.0 (the engines.node of modern-cmdk-codemod)');

    const unknown = capture();
    expect(await run(['--bogus'], unknown.io, defaultProgramDeps)).toBe(2);
    expect(unknown.err()).toContain('unknown option --bogus');

    expect(await run([], capture().io, defaultProgramDeps)).toBe(2);
    expect(await run(['--lenient', '--bogus'], capture().io, defaultProgramDeps)).toBe(0);
  });

  it('no arguments writes usage to stderr and resolves 0 (strict: 2)', async () => {
    const c = capture();
    expect(await run([], c.io, deps)).toBe(0);
    expect(c.err()).toContain('Usage:');
    expect(c.err()).toContain('import-rewrite');
    expect(c.out()).toBe('');

    expect(await run(['--strict'], capture().io, deps)).toBe(2);
  });

  it('an unknown option is a usage error: exit 0, strict 2', async () => {
    const c = capture();
    expect(await run(['--bogus'], c.io, deps)).toBe(0);
    expect(c.err()).toContain('unknown option --bogus');
    expect(c.err()).toContain('Usage:');
    expect(await run(['--strict', '--bogus'], capture().io, deps)).toBe(2);
  });

  it('an unknown option with no matching files still exits 1 and says so on stderr', async () => {
    const missing = `${dir.replaceAll('\\', '/')}/nothing/*.tsx`;
    const c = capture();
    expect(await run(['import-rewrite', missing, '--verbose'], c.io, deps)).toBe(1);
    expect(c.err()).toContain('unknown option --verbose');
    expect(c.err()).toContain(`no files matched "${missing}"`);
  });

  it('an unknown option with the positionals present warns, is ignored, and the run goes on', async () => {
    const c = capture();
    expect(await run(['import-rewrite', glob, '--verbose'], c.io, deps)).toBe(0);
    expect(c.err()).toContain('warning: unknown option --verbose ignored');
    expect(c.err()).toContain('--strict makes this exit 2');
    expect(await readFile(file, 'utf-8')).toContain('modern-cmdk/react');
  });

  it('an unknown option with --strict exits 2 and touches nothing', async () => {
    const c = capture();
    expect(await run(['import-rewrite', glob, '--verbose', '--strict'], c.io, deps)).toBe(2);
    expect(c.err()).toContain('unknown option --verbose');
    expect(await readFile(file, 'utf-8')).toBe(SOURCE);
  });

  it('an unknown option does not hide an unknown transform (exit 1)', async () => {
    expect(await run(['nope', glob, '--verbose'], capture().io, deps)).toBe(1);
  });

  it('a boolean option given a value (--dry-run=yes) is a usage error and writes nothing', async () => {
    const c = capture();
    expect(await run(['import-rewrite', glob, '--dry-run=yes'], c.io, deps)).toBe(0);
    expect(c.err()).toContain("Option '--dry-run' does not take an argument");
    expect(await readFile(file, 'utf-8')).toBe(SOURCE);
  });

  it('a lone -- ends option parsing and the run goes on', async () => {
    const c = capture();
    expect(await run(['import-rewrite', glob, '--'], c.io, deps)).toBe(0);
    expect(c.err()).toBe('');
    expect(c.out()).toContain('1 changed, 1 unchanged, 0 errors');
    expect(await readFile(file, 'utf-8')).toContain('modern-cmdk/react');
  });

  it('an unknown option does not let --dry-run=yes slip through (nothing written)', async () => {
    const c = capture();
    expect(await run(['import-rewrite', glob, '--verbose', '--dry-run=yes'], c.io, deps)).toBe(0);
    expect(c.err()).toContain("Option '--dry-run' does not take an argument");
    expect(await readFile(file, 'utf-8')).toBe(SOURCE);
  });

  it('an unknown option does not let --strict=yes slip through (nothing written)', async () => {
    const c = capture();
    expect(await run(['import-rewrite', glob, '--verbose', '--strict=yes'], c.io, deps)).toBe(0);
    expect(c.err()).toContain("Option '--strict' does not take an argument");
    expect(await readFile(file, 'utf-8')).toBe(SOURCE);
  });

  it('an unknown option does not let a valueless --concurrency slip through (nothing written)', async () => {
    const c = capture();
    expect(await run(['import-rewrite', glob, '--verbose', '--concurrency'], c.io, deps)).toBe(0);
    expect(c.err()).toContain("Option '--concurrency <value>' argument missing");
    expect(await readFile(file, 'utf-8')).toBe(SOURCE);
    expect(
      await run(
        ['import-rewrite', glob, '--verbose', '--concurrency', '--strict'],
        capture().io,
        deps,
      ),
    ).toBe(2);
  });

  it('a dash-led space-form --concurrency value is ambiguous beside an unknown option (nothing written)', async () => {
    const c = capture();
    expect(
      await run(['import-rewrite', glob, '--verbose', '--concurrency', '--dry-run'], c.io, deps),
    ).toBe(0);
    expect(c.err()).toContain("Option '--concurrency' argument is ambiguous.");
    expect(await readFile(file, 'utf-8')).toBe(SOURCE);
  });

  it('an empty --concurrency= is rejected by the positive-integer check', async () => {
    const c = capture();
    expect(await run(['import-rewrite', glob, '--concurrency='], c.io, deps)).toBe(0);
    expect(c.err()).toContain('--concurrency must be a positive integer');
    expect(await readFile(file, 'utf-8')).toBe(SOURCE);
  });

  it('a bad --concurrency is a usage error: exit 0, strict 2', async () => {
    const c = capture();
    expect(await run(['import-rewrite', glob, '--concurrency=abc'], c.io, deps)).toBe(0);
    expect(c.err()).toContain('--concurrency');
    expect(
      await run(['import-rewrite', glob, '--concurrency=abc', '--strict'], capture().io, deps),
    ).toBe(2);
    expect(await readFile(file, 'utf-8')).toBe(SOURCE);
  });
});

describe('codemod CLI: --concurrency', () => {
  it.each([
    ['0', '--concurrency=0'],
    ['a negative value', '--concurrency=-3'],
    ['a non-integer', '--concurrency=1.5'],
  ])(
    'CLI-PERF: %s is a usage error (exit 0 lenient, 2 strict; nothing written)',
    async (_label, flag) => {
      const c = capture();
      expect(await run(['import-rewrite', glob, flag], c.io, deps)).toBe(0);
      expect(c.err()).toContain('--concurrency must be a positive integer');
      expect(await run(['import-rewrite', glob, flag], capture().io, codemodDeps)).toBe(2);
      expect(await readFile(file, 'utf-8')).toBe(SOURCE);
    },
  );

  it('CLI-PERF: the default is min(8, availableParallelism())', () => {
    expect(defaultConcurrency()).toBe(Math.min(8, availableParallelism()));
    expect(defaultConcurrency(1)).toBe(1);
    expect(defaultConcurrency(4)).toBe(4);
    expect(defaultConcurrency(8)).toBe(8);
    expect(defaultConcurrency(64)).toBe(8);
  });

  it('CLI-PERF: the --help concurrency line reads "Files processed at once (default: min(8, available cores))"', async () => {
    const c = capture();
    expect(await run(['--help'], c.io, deps)).toBe(0);
    expect(c.out()).toMatch(
      /--concurrency=N {2,}Files processed at once \(default: min\(8, available cores\)\)/,
    );
  });

  it('CLI-12: --help says --lenient keeps the lenient exit codes and skips the clean-git-tree check', async () => {
    const c = capture();
    expect(await run(['--help'], c.io, deps)).toBe(0);
    const lines = c
      .out()
      .split('\n')
      .filter((l) => /^ {2}--lenient\b/.test(l));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('Lenient exit codes');
    expect(lines[0]).toContain('git check');
  });

  it('DG-134: --help says a directory argument excludes dot paths', async () => {
    for (const d of [deps, codemodDeps]) {
      const c = capture();
      expect(await run(['--help'], c.io, d)).toBe(0);
      const line = c
        .out()
        .split('\n')
        .filter((l) => l.includes('A directory argument covers'));
      expect(line).toHaveLength(1);
      expect(line[0]).toContain('(dot paths excluded)');
    }
  });

  it('CLI-13: --help names the clean-git-tree check as modern-cmdk-codemod only on the --lenient line and the strict exit-code row', async () => {
    for (const d of [deps, codemodDeps]) {
      const c = capture();
      expect(await run(['--help'], c.io, d)).toBe(0);
      const lines = c.out().split('\n');
      const lenient = lines.filter((l) => /^ {2}--lenient\b/.test(l));
      expect(lenient).toHaveLength(1);
      expect(lenient[0]).toContain("skips modern-cmdk-codemod's git check");
      const dirty = lines.filter((l) => l.includes('refused dirty tree'));
      expect(dirty).toHaveLength(1);
      expect(dirty[0]).toContain('refused dirty tree (modern-cmdk-codemod only)');
    }
  });

  it('CLI-PERF: --help says files run on worker threads above --concurrency=1 and on the main thread at 1', async () => {
    const c = capture();
    expect(await run(['--help'], c.io, deps)).toBe(0);
    expect(c.out()).toContain(
      'Files run on worker threads when --concurrency is above 1; --concurrency=1 runs them on the main thread.',
    );
  });

  it('CLI-PERF: with an injected loader (the main-thread seam), --concurrency=1 and --concurrency=3 print the same stdout', async () => {
    for (let i = 0; i < 6; i++) await writeFile(join(dir, 'src', `c${i}.tsx`), SOURCE);
    const one = capture();
    const three = capture();
    expect(await run(['import-rewrite', glob, '--dry-run', '--concurrency=1'], one.io, deps)).toBe(
      0,
    );
    expect(
      await run(['import-rewrite', glob, '--dry-run', '--concurrency=3'], three.io, deps),
    ).toBe(0);
    expect(three.out()).toBe(one.out());
    expect(one.out()).toContain('7 changed');
  });
});

describe('codemod CLI: errors', () => {
  it('an unknown transform names it and the valid list, exit 1 (strict 2)', async () => {
    const c = capture();
    expect(await run(['nope', glob], c.io, deps)).toBe(1);
    expect(c.err()).toContain('unknown transform "nope"');
    expect(c.err()).toContain('should-filter, forward-ref, data-attrs, import-rewrite');
    expect(await run(['nope', glob, '--strict'], capture().io, deps)).toBe(2);
  });

  it('no matched files names the glob and exits 1', async () => {
    const c = capture();
    const missing = `${dir.replaceAll('\\', '/')}/nothing/*.tsx`;
    expect(await run(['import-rewrite', missing], c.io, deps)).toBe(1);
    expect(c.err()).toContain(`no files matched "${missing}"`);
  });

  it('a transform that throws on a file reports "path: message", exit 0, strict 1', async () => {
    const c = capture();
    expect(await run(['should-filter', glob], c.io, deps)).toBe(0);
    expect(c.err()).toContain('src/a.tsx: boom');
    expect(c.err()).toContain('src/b.tsx: boom');
    expect(c.out()).toContain('0 changed, 0 unchanged, 2 errors');

    expect(await run(['should-filter', glob, '--strict'], capture().io, deps)).toBe(1);
  });
});

describe('codemod CLI: runs', () => {
  it('--dry-run lists would-change files and leaves the bytes alone', async () => {
    const c = capture();
    expect(await run(['import-rewrite', glob, '--dry-run'], c.io, deps)).toBe(0);
    expect(c.out()).toMatch(/would change src\/a\.tsx\n/);
    expect(c.out()).not.toContain('b.tsx');
    expect(c.out()).toContain('1 changed, 1 unchanged, 0 errors');
    expect(await readFile(file, 'utf-8')).toBe(SOURCE);
  });

  it('a real run rewrites, lists changed files and prints the summary line', async () => {
    const c = capture();
    expect(await run(['import-rewrite', glob, '--strict'], c.io, deps)).toBe(0);
    expect(c.out()).toMatch(/changed src\/a\.tsx\n/);
    expect(c.out()).toContain('1 changed, 1 unchanged, 0 errors');
    expect(c.err()).toBe('');
    expect(await readFile(file, 'utf-8')).toContain('modern-cmdk/react');
  });
});

// --- 1.5.0 wave 1 (W1-02): program profiles, parsers, discovery, routing, diff, dirty tree -----

const JSX_SOURCE = `import { Command } from 'cmdk';\nexport const x = <Command />;\n`;

/** Commit everything in `dir` through the hermetic helper. */
async function commitAll(cwd: string): Promise<void> {
  await git(cwd, ['init', '-q']);
  await git(cwd, ['add', '-A']);
  await git(cwd, ['commit', '-q', '-m', 'fixture']);
}

describe('codemod CLI: parsers and routing', () => {
  it('CLI-3, RP-16: a .js file containing JSX is rewritten (babel parser)', async () => {
    const jsx = join(dir, 'src', 'c.js');
    await writeFile(jsx, JSX_SOURCE);
    const c = capture();
    expect(await run(['import-rewrite', `${dir.replaceAll('\\', '/')}/src/*.js`], c.io, deps)).toBe(
      0,
    );
    expect(c.err()).toBe('');
    expect(c.out()).toContain('1 changed, 0 unchanged, 0 errors');
    const written = await readFile(jsx, 'utf-8');
    expect(written).toContain('modern-cmdk/react');
    expect(written).toContain('export const x = <Command />;');
  });

  it('CLI-3, RP-16: .jsx and .mjs go through babel, .mts through ts', async () => {
    const seen: string[] = [];
    const probe: CliDeps = {
      ...deps,
      loadTransform: async () => ({
        default: (info: FileInfo, api: API): string => {
          // The ts parser rejects JSX and the babel parser accepts it; parse proves which one ran.
          api.jscodeshift(info.source);
          seen.push(info.path);
          return info.source;
        },
      }),
    };
    await writeFile(join(dir, 'src', 'd.jsx'), JSX_SOURCE);
    await writeFile(join(dir, 'src', 'e.mjs'), JSX_SOURCE);
    await writeFile(join(dir, 'src', 'f.mts'), 'export const f: number = 1;\n');
    const c = capture();
    expect(await run(['import-rewrite', `${dir.replaceAll('\\', '/')}/src/*`], c.io, probe)).toBe(
      0,
    );
    expect(seen.map((p) => p.slice(p.lastIndexOf('src') + 4)).sort()).toEqual([
      'a.tsx',
      'b.tsx',
      'd.jsx',
      'e.mjs',
      'f.mts',
    ]);
    expect(c.err()).toBe('');
  });

  it('CLI-4: a directory named x.ts and the pattern src/** never reach a transform', async () => {
    await mkdir(join(dir, 'src', 'x.ts'));
    await writeFile(join(dir, 'src', 'x.ts', 'inner.ts'), 'export const inner = 1;\n');
    const seen: string[] = [];
    const probe: CliDeps = {
      ...deps,
      loadTransform: async () => ({
        default: (info: FileInfo): string => {
          seen.push(info.path.replaceAll('\\', '/'));
          return info.source;
        },
      }),
    };
    const c = capture();
    expect(await run(['import-rewrite', 'src/**'], c.io, probe)).toBe(0);
    expect(c.err()).toBe('');
    expect(seen.map((p) => p.slice(dir.replaceAll('\\', '/').length + 1)).sort()).toEqual([
      'src/a.tsx',
      'src/b.tsx',
      'src/x.ts/inner.ts',
    ]);
  });

  it('CLI-4: a directory argument covers script files and skips every other extension', async () => {
    await writeFile(join(dir, 'src', 'data.json'), '{}\n');
    await writeFile(join(dir, 'src', 'readme.md'), '# hi\n');
    const c = capture();
    expect(await run(['import-rewrite', 'src', '--strict'], c.io, deps)).toBe(0);
    expect(c.err()).toBe('');
    expect(c.out()).toContain('1 changed, 1 unchanged, 0 errors');
    expect(c.out()).not.toContain('skipped');
    expect(await readFile(file, 'utf-8')).toContain('modern-cmdk/react');
  });

  it('CLI-4: an explicit pattern that matches a non-script file counts it as skipped, never parsed', async () => {
    await writeFile(join(dir, 'src', 'data.json'), '{ not js\n');
    const c = capture();
    expect(await run(['import-rewrite', 'src/*.json', '--strict'], c.io, deps)).toBe(0);
    expect(c.err()).toBe('');
    expect(c.out()).toContain('0 changed, 0 unchanged, 0 errors, 1 skipped');
  });

  it('CLI-4: .css and .scss go to transformStylesheet when the module exports it, else are skipped', async () => {
    const css = join(dir, 'src', 's.css');
    await writeFile(css, '[cmdk-item] { color: red; }\n');
    await writeFile(join(dir, 'src', 't.scss'), '[cmdk-input] { color: blue; }\n');
    const withStyles: CliDeps = {
      ...deps,
      loadTransform: async () => ({
        default: (info: FileInfo): string => info.source,
        transformStylesheet: (source: string, report: (message: string) => void): string => {
          report('stylesheet seen');
          return source.replace('cmdk-', 'data-command-');
        },
      }),
    };
    const pattern = 'src/*ss';
    const c = capture();
    expect(await run(['data-attrs', pattern], c.io, withStyles)).toBe(0);
    expect(await readFile(css, 'utf-8')).toBe('[data-command-item] { color: red; }\n');
    expect(c.out()).toContain('2 changed, 0 unchanged, 0 errors, 2 reported');
    expect(c.err()).toContain('src/s.css: stylesheet seen');
    expect(c.err()).toContain('src/t.scss: stylesheet seen');

    const without = capture();
    expect(await run(['data-attrs', pattern], without.io, deps)).toBe(0);
    expect(without.out()).toContain('0 changed, 0 unchanged, 0 errors, 2 skipped');
  });

  it('CLI-9: one jscodeshift API per parser per run (three .tsx files make one withParser call)', async () => {
    await writeFile(join(dir, 'src', 'c.tsx'), `export const c = 1;\n`);
    const spy = vi.spyOn(jscodeshift, 'withParser');
    const c = capture();
    expect(await run(['import-rewrite', glob], c.io, deps)).toBe(0);
    expect(c.out()).toContain('1 changed, 2 unchanged, 0 errors');
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith('tsx');
  });

  it('CLI-9: api.report lines go to stderr as "<rel>: <message>" and count as reported', async () => {
    const reporting: CliDeps = {
      ...deps,
      loadTransform: async () => ({
        default: (info: FileInfo, api: API): string => {
          api.report('looked at this');
          return info.source;
        },
      }),
    };
    const c = capture();
    expect(await run(['import-rewrite', glob, '--strict'], c.io, reporting)).toBe(0);
    expect(c.err()).toBe('src/a.tsx: looked at this\nsrc/b.tsx: looked at this\n');
    expect(c.out()).toBe('0 changed, 2 unchanged, 0 errors, 2 reported\n');
  });
});

describe('codemod CLI: dry-run diff', () => {
  it('--dry-run prints a unified diff after each would-change line and writes nothing', async () => {
    const c = capture();
    expect(await run(['import-rewrite', glob, '--dry-run'], c.io, deps)).toBe(0);
    expect(c.out()).toBe(
      [
        'would change src/a.tsx',
        '--- a/src/a.tsx',
        '+++ b/src/a.tsx',
        '@@ -1 +1 @@',
        "-import { Command } from 'cmdk';",
        "+import { Command } from 'modern-cmdk/react';",
        '1 changed, 1 unchanged, 0 errors (dry run, nothing written)',
        '',
      ].join('\n'),
    );
    expect(await readFile(file, 'utf-8')).toBe(SOURCE);
  });

  it('a real run prints no diff', async () => {
    const c = capture();
    expect(await run(['import-rewrite', glob], c.io, deps)).toBe(0);
    expect(c.out()).toBe('changed src/a.tsx\n1 changed, 1 unchanged, 0 errors\n');
  });
});

describe('codemod CLI: program profiles', () => {
  it('CLI-ARGS: --version and -v print "<name> <version>" from the package.json', async () => {
    const pkg = JSON.parse(
      await readFile(
        join(import.meta.dirname, '../../packages/modern-cmdk-codemod/package.json'),
        'utf-8',
      ),
    ) as { name: string; version: string };
    for (const flag of ['--version', '-v']) {
      const c = capture();
      expect(await run([flag], c.io, deps)).toBe(0);
      expect(c.out()).toBe(`${pkg.name} ${pkg.version}\n`);
      expect(c.err()).toBe('');
    }
  });

  it('CLI-ARGS: --strict together with --lenient is a usage error that exits 2 in both programs', async () => {
    for (const d of [deps, codemodDeps]) {
      const c = capture();
      expect(await run(['import-rewrite', glob, '--strict', '--lenient'], c.io, d)).toBe(2);
      expect(c.err()).toContain('--strict and --lenient cannot be combined');
      expect(await readFile(file, 'utf-8')).toBe(SOURCE);
    }
  });

  it('CLI-ARGS: --help names the program, both exit-code modes and the Node floor', async () => {
    const legacy = capture();
    expect(await run(['--help'], legacy.io, deps)).toBe(0);
    expect(legacy.out()).toContain('Usage: modern-cmdk <transform>');
    expect(legacy.out()).toContain('is deprecated');
    expect(legacy.out()).toContain('runs with --lenient unless --strict is given');
    expect(legacy.out()).toContain('npx modern-cmdk-codemod');
    for (const needle of ['--lenient', '--force', '-v, --version', 'strict   0', 'lenient  0']) {
      expect(legacy.out()).toContain(needle);
    }
    const fresh = capture();
    expect(await run(['--help'], fresh.io, codemodDeps)).toBe(0);
    expect(fresh.out()).toContain('Usage: modern-cmdk-codemod <transform>');
    expect(fresh.out()).not.toContain('is deprecated');
    expect(fresh.out()).toContain('strict unless --lenient is given');
    expect(fresh.out()).toContain('A strict run without --dry-run');
    expect(
      fresh
        .out()
        .split('\n')
        .filter((l) => l.includes('Node >= 26.4.0')),
    ).toHaveLength(1);
  });

  it('CLI-ARGS: the --dry-run, --strict and -h help lines read as pinned here', async () => {
    const c = capture();
    expect(await run(['--help'], c.io, deps)).toBe(0);
    const lines = c.out().split('\n');
    expect(lines).toContain(
      '  --dry-run        Write nothing; print a unified diff of every file that would change',
    );
    expect(lines).toContain(
      '  --strict         Exit 2 on usage errors (incl. unknown options), 1 on file errors',
    );
    expect(lines).toContain('  -h, --help       Show this help');
  });

  it('--help promises --dry-run once: its option line says it prints the diff and no later line repeats it', async () => {
    for (const d of [deps, codemodDeps]) {
      const c = capture();
      expect(await run(['--help'], c.io, d)).toBe(0);
      const lines = c.out().split('\n');
      expect(lines.filter((l) => l.includes('unified diff'))).toHaveLength(1);
      expect(lines.some((l) => l.startsWith('--dry-run also'))).toBe(false);
    }
  });

  it('--help numbers the transforms in the order to run them, import-rewrite last, in both programs', async () => {
    for (const d of [deps, codemodDeps]) {
      const c = capture();
      expect(await run(['--help'], c.io, d)).toBe(0);
      const lines = c.out().split('\n');
      const at = lines.indexOf('Transforms, in the order to run them (one per run):');
      expect(at).toBeGreaterThan(-1);
      expect(lines.slice(at + 1, at + 5)).toEqual([
        '  1. should-filter    Converts the shouldFilter prop to filter',
        '  2. forward-ref      Removes React.forwardRef wrappers (React 19)',
        '  3. data-attrs       Converts [cmdk-*] selectors to [data-command-*]',
        '  4. import-rewrite   Rewrites cmdk imports to modern-cmdk/react',
      ]);
    }
  });

  it('--help lists the options in the order of the README Options table, and the README pastes no help block', async () => {
    const c = capture();
    expect(await run(['--help'], c.io, codemodDeps)).toBe(0);
    const start = c.out().indexOf('Options:\n');
    const section = c.out().slice(start, c.out().indexOf('\n\n', start));
    const longest = (names: readonly string[]): string =>
      [...names].sort((x, y) => y.length - x.length)[0]?.replace(/=N$/, '') ?? '';
    const inHelp = [...section.matchAll(/^ {2}(-[\w-]+(?:=N)?(?:, -[\w-]+)?)/gm)].map((m) =>
      longest((m[1] as string).split(', ')),
    );
    const readme = await readFile(
      join(import.meta.dirname, '../../packages/modern-cmdk-codemod/README.md'),
      'utf-8',
    );
    const table = readme.slice(readme.indexOf('| Option | Effect |'));
    const inReadme = table
      .slice(0, table.indexOf('\n\n'))
      .split('\n')
      .slice(2)
      .map((row) =>
        longest([...(row.split('|')[1] ?? '').matchAll(/`([^`]+)`/g)].map((m) => m[1] as string)),
      );
    expect(inHelp).toEqual([
      '--dry-run',
      '--force',
      '--strict',
      '--lenient',
      '--concurrency',
      '--help',
      '--version',
    ]);
    expect(inReadme).toEqual(inHelp);
    expect(readme).not.toContain('Usage: modern-cmdk-codemod');
  });

  it('RP-19, SEC-07: --dry under modern-cmdk-codemod exits 2 and writes nothing', async () => {
    const c = capture();
    expect(await run(['import-rewrite', glob, '--dry'], c.io, codemodDeps)).toBe(2);
    expect(c.err()).toContain('unknown option --dry');
    expect(await readFile(file, 'utf-8')).toBe(SOURCE);
  });

  it('RP-19, SEC-07: --dry under modern-cmdk still warns and runs (1.x contract, LD-05)', async () => {
    const c = capture();
    expect(await run(['import-rewrite', glob, '--dry'], c.io, deps)).toBe(0);
    expect(c.err()).toContain('warning: unknown option --dry ignored');
    expect(await readFile(file, 'utf-8')).toContain('modern-cmdk/react');
  });

  it('CLI-ARGS: modern-cmdk-codemod is strict by default: usage errors 2, no files 1, file errors 1', async () => {
    expect(await run([], capture().io, codemodDeps)).toBe(2);
    expect(await run(['import-rewrite'], capture().io, codemodDeps)).toBe(2);
    expect(await run(['nope', glob], capture().io, codemodDeps)).toBe(2);
    expect(
      await run(['import-rewrite', glob, '--concurrency=abc'], capture().io, codemodDeps),
    ).toBe(2);
    const missing = `${dir.replaceAll('\\', '/')}/nothing/*.tsx`;
    expect(await run(['import-rewrite', missing], capture().io, codemodDeps)).toBe(1);
    expect(await run(['should-filter', glob, '--force'], capture().io, codemodDeps)).toBe(1);
  });

  it('CLI-ARGS: --lenient gives modern-cmdk-codemod the 1.x exit codes', async () => {
    expect(await run(['--lenient'], capture().io, codemodDeps)).toBe(0);
    expect(
      await run(
        ['import-rewrite', glob, '--lenient', '--verbose', '--dry-run'],
        capture().io,
        codemodDeps,
      ),
    ).toBe(0);
    expect(await run(['should-filter', glob, '--lenient'], capture().io, codemodDeps)).toBe(0);
    expect(await readFile(file, 'utf-8')).toBe(SOURCE);
  });

  it('CLI-ARGS: strict reports exit 0 (a report is not an error)', async () => {
    const reporting: CliDeps = {
      ...codemodDeps,
      loadTransform: async () => ({
        default: (info: FileInfo, api: API): string => {
          api.report('note');
          return info.source;
        },
      }),
    };
    expect(await run(['import-rewrite', glob, '--force'], capture().io, reporting)).toBe(0);
  });
});

describe('codemod CLI: dirty-tree refusal (modern-cmdk-codemod only)', () => {
  it('SEC-07: a modified tracked file refuses with exit 2, lists the path, names --force, writes nothing', async () => {
    await commitAll(dir);
    await writeFile(file, `${SOURCE}// edited\n`);
    const c = capture();
    expect(await run(['import-rewrite', glob], c.io, codemodDeps)).toBe(2);
    expect(c.err()).toContain('1 matched file has uncommitted changes');
    expect(c.err()).toContain('  src/a.tsx');
    expect(c.err()).not.toContain('src/b.tsx');
    expect(c.err()).toContain('--force');
    expect(await readFile(file, 'utf-8')).toBe(`${SOURCE}// edited\n`);
  });

  it('SEC-07: a matched file outside the work tree refuses with exit 2 and writes nothing', async () => {
    const other = await mkdtemp(join(tmpdir(), 'modern-cmdk-cli-other-'));
    try {
      await mkdir(join(other, 'src'));
      const victim = join(other, 'src', 'x.tsx');
      await writeFile(victim, SOURCE);
      await commitAll(dir);
      await commitAll(other);
      await writeFile(victim, `${SOURCE}// uncommitted\n`);
      const arg = `../${basename(other)}/src`;
      const c = capture();
      expect(await run(['import-rewrite', arg], c.io, codemodDeps)).toBe(2);
      expect(c.err()).toContain('1 matched file lies outside this git work tree');
      expect(c.err()).toContain('--force');
      expect(await readFile(victim, 'utf-8')).toBe(`${SOURCE}// uncommitted\n`);

      const forced = capture();
      expect(await run(['import-rewrite', arg, '--force'], forced.io, codemodDeps)).toBe(0);
      expect(await readFile(victim, 'utf-8')).toContain('modern-cmdk/react');
    } finally {
      await rm(other, { recursive: true, force: true });
    }
  });

  it('SEC-07: a matched file inside a nested git repository (an untracked directory to git status) refuses with exit 2 and writes nothing', async () => {
    await commitAll(dir);
    await mkdir(join(dir, 'nested'));
    const inner = join(dir, 'nested', 'n.tsx');
    await writeFile(inner, SOURCE);
    await git(join(dir, 'nested'), ['init', '-q']);
    await git(join(dir, 'nested'), ['add', '-A']);
    await git(join(dir, 'nested'), ['commit', '-q', '-m', 'inner']);
    await writeFile(
      inner,
      `${SOURCE}// uncommitted
`,
    );
    const c = capture();
    expect(await run(['import-rewrite', 'nested'], c.io, codemodDeps)).toBe(2);
    expect(c.err()).toContain('  nested/n.tsx');
    expect(c.err()).toContain('--force');
    expect(await readFile(inner, 'utf-8')).toBe(`${SOURCE}// uncommitted
`);
  });

  it('CLI-ARGS: a third positional under modern-cmdk-codemod exits 2 and writes nothing', async () => {
    const second = join(dir, 'src', 'b.tsx');
    const c = capture();
    expect(await run(['import-rewrite', file, second, '--force'], c.io, codemodDeps)).toBe(2);
    expect(c.err()).toContain('unexpected argument');
    expect(await readFile(file, 'utf-8')).toBe(SOURCE);
    expect(await run(['import-rewrite', file, second, '--force'], capture().io, deps)).toBe(0);
  });

  it('SEC-07: a clean committed tree is rewritten', async () => {
    await commitAll(dir);
    const c = capture();
    expect(await run(['import-rewrite', glob], c.io, codemodDeps)).toBe(0);
    expect(c.out()).toContain('changed src/a.tsx');
    expect(await readFile(file, 'utf-8')).toContain('modern-cmdk/react');
  });

  it('SEC-07: an untracked matched file counts as dirty', async () => {
    await git(dir, ['init', '-q']);
    const c = capture();
    expect(await run(['import-rewrite', glob], c.io, codemodDeps)).toBe(2);
    expect(c.err()).toContain('2 matched files have uncommitted changes');
    expect(await readFile(file, 'utf-8')).toBe(SOURCE);
  });

  it('SEC-07: the refusal lists up to 10 paths plus a count', async () => {
    for (let i = 0; i < 12; i++)
      await writeFile(join(dir, 'src', `n${i}.tsx`), `export const n = ${i};\n`);
    await git(dir, ['init', '-q']);
    const c = capture();
    expect(await run(['import-rewrite', glob], c.io, codemodDeps)).toBe(2);
    expect(c.err()).toContain('14 matched files have uncommitted changes');
    expect(c.err().match(/^ {2}src\//gm)).toHaveLength(10);
    expect(c.err()).toContain('... and 4 more');
  });

  it('SEC-07: --force writes into a dirty tree', async () => {
    await commitAll(dir);
    await writeFile(file, `${SOURCE}// edited\n`);
    const c = capture();
    expect(await run(['import-rewrite', glob, '--force'], c.io, codemodDeps)).toBe(0);
    expect(await readFile(file, 'utf-8')).toContain('modern-cmdk/react');
  });

  it('SEC-07: --dry-run needs no clean tree and writes nothing', async () => {
    await git(dir, ['init', '-q']);
    const c = capture();
    expect(await run(['import-rewrite', glob, '--dry-run'], c.io, codemodDeps)).toBe(0);
    expect(c.out()).toContain('would change src/a.tsx');
    expect(await readFile(file, 'utf-8')).toBe(SOURCE);
  });

  it('SEC-07: outside a git work tree it refuses with exit 2 and names --force', async () => {
    vi.stubEnv('GIT_CEILING_DIRECTORIES', dirname(dir));
    const c = capture();
    expect(await run(['import-rewrite', glob], c.io, codemodDeps)).toBe(2);
    expect(c.err()).toContain('outside a git work tree');
    expect(c.err()).toContain('--force');
    expect(await readFile(file, 'utf-8')).toBe(SOURCE);

    expect(await run(['import-rewrite', glob, '--force'], capture().io, codemodDeps)).toBe(0);
    expect(await readFile(file, 'utf-8')).toContain('modern-cmdk/react');
  });

  it('SEC-07: --lenient skips the check, and the modern-cmdk program never runs it', async () => {
    vi.stubEnv('GIT_CEILING_DIRECTORIES', dirname(dir));
    expect(await run(['import-rewrite', glob, '--lenient'], capture().io, codemodDeps)).toBe(0);
    await writeFile(file, SOURCE);
    expect(await run(['import-rewrite', glob, '--strict'], capture().io, deps)).toBe(0);
    expect(await readFile(file, 'utf-8')).toContain('modern-cmdk/react');
  });

  it('SEC-07: git missing from PATH refuses with exit 2 under the strict codemod profile', async () => {
    vi.stubEnv('PATH', configDir);
    const c = capture();
    expect(await run(['import-rewrite', glob], c.io, codemodDeps)).toBe(2);
    expect(c.err()).toContain('warning: git not found; .gitignore is not applied');
    expect(c.err()).toContain('git not found');
    expect(c.err()).toContain('--force');
    expect(await readFile(file, 'utf-8')).toBe(SOURCE);
  });
});

describe('codemod CLI: discovery by program', () => {
  it("CLI-10, SEC-29: modern-cmdk-codemod drops gitignored files; modern-cmdk keeps 1.4's excludes (no .gitignore)", async () => {
    await mkdir(join(dir, 'generated'));
    await writeFile(join(dir, 'generated', 'g.tsx'), SOURCE);
    await writeFile(join(dir, '.gitignore'), 'generated/\n');
    await git(dir, ['init', '-q']);
    const all = `${dir.replaceAll('\\', '/')}/**/*.tsx`;

    const fresh = capture();
    expect(await run(['import-rewrite', all, '--dry-run'], fresh.io, codemodDeps)).toBe(0);
    expect(fresh.out()).toContain('1 changed, 1 unchanged, 0 errors');
    expect(fresh.out()).not.toContain('generated/g.tsx');

    const legacy = capture();
    expect(await run(['import-rewrite', all, '--dry-run'], legacy.io, deps)).toBe(0);
    expect(legacy.out()).toContain('would change generated/g.tsx');
    expect(legacy.out()).toContain('2 changed, 1 unchanged, 0 errors');
  });

  it('CLI-10, SEC-29, RP-20: the codemod profile never reaches build output directories', async () => {
    for (const name of ['coverage', '.turbo', 'out', 'storybook-static', '.vercel']) {
      await mkdir(join(dir, 'src', name));
      await writeFile(join(dir, 'src', name, 'z.tsx'), SOURCE);
    }
    const all = `${dir.replaceAll('\\', '/')}/src/**/*.tsx`;
    const fresh = capture();
    expect(await run(['import-rewrite', all, '--dry-run'], fresh.io, codemodDeps)).toBe(0);
    expect(fresh.out()).toContain('1 changed, 1 unchanged, 0 errors');

    // roadmap call :236 (CLI-10, SEC-29): the modern-cmdk bin keeps 1.4's four ignores only. fs.glob
    // and globby 16 both leave dot directories out of `**`, so .turbo and .vercel stay unreached here.
    const legacy = capture();
    expect(await run(['import-rewrite', all, '--dry-run'], legacy.io, deps)).toBe(0);
    expect(legacy.out()).toContain('4 changed, 1 unchanged, 0 errors');
  });
});

// tests/dist/cli-exec.test.ts
// CLI-TEST, SEC-52 (create half), RP-35, RP-18: the BUILT bins, spawned the way users run them
// (execFile on process.execPath), over temp copies of the fixtures. The repository's own files are
// only ever read. Needs: pnpm --filter modern-cmdk --filter modern-cmdk-codemod --filter create-modern-cmdk run build
//
// Bins: packages/modern-cmdk-codemod/dist/cli.mjs (strict by default), packages/modern-cmdk/dist/codemod/bin.mjs
// (the deprecated shim, lenient unless --strict) and packages/create-modern-cmdk/dist/index.mjs.
//
// The mixed fixture (tests/fixtures/codemod-cli/mixed) commits its ignore file as _gitignore (a committed
// .gitignore would hide its siblings from this repository); every test renames it after the copy. The
// gitignored directories (gen/, dist/, node_modules/, coverage/) are written at test time from IGNORED.

import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import {
  cp,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { git, gitEnv } from '../unit/git-fixture.ts';

const repoRoot = resolve(import.meta.dirname, '../..');
const BIN = {
  codemod: resolve(repoRoot, 'packages/modern-cmdk-codemod/dist/cli.mjs'),
  shim: resolve(repoRoot, 'packages/modern-cmdk/dist/codemod/bin.mjs'),
  create: resolve(repoRoot, 'packages/create-modern-cmdk/dist/index.mjs'),
} as const;
const built: boolean = Object.values(BIN).every((bin) => existsSync(bin));

if (!built && process.env.CI) {
  // A silent skip would hide a missing build: fail the whole file loudly in CI.
  throw new Error(`a bin under ${repoRoot}/packages/*/dist is missing; run pnpm build first`);
}

const FIXTURES = resolve(repoRoot, 'tests/fixtures');
const CLI_FIXTURES = join(FIXTURES, 'codemod-cli');
const MIXED = join(CLI_FIXTURES, 'mixed');
const CASES = join(FIXTURES, 'codemod');

const TRANSFORMS = ['import-rewrite', 'data-attrs', 'forward-ref', 'should-filter'] as const;
type Transform = (typeof TRANSFORMS)[number];

const DEPRECATION = 'warning: the modern-cmdk bin is deprecated';

/** The committed files of mixed/, relative to it. */
const MIXED_FILES: readonly string[] = [
  '_gitignore',
  'data/config.json',
  'docs/guide.md',
  'package.json',
  'src/clean.ts',
  'src/double.tsx',
  'src/filter.tsx',
  'src/forward.tsx',
  'src/nested/deep/palette.tsx',
  'src/quotes.ts',
  'src/shell.js',
  'src/single.tsx',
  'styles/theme.css',
  'styles/theme.scss',
];

/** The files of mixed.expected/<transform>/ (those a strict run changes), relative to mixed.expected. */
const CHANGED: Readonly<Record<Transform, readonly string[]>> = {
  'import-rewrite': ['src/double.tsx', 'src/nested/deep/palette.tsx', 'src/single.tsx'],
  'data-attrs': ['src/quotes.ts', 'src/shell.js', 'styles/theme.css', 'styles/theme.scss'],
  'forward-ref': ['src/forward.tsx'],
  'should-filter': ['src/filter.tsx'],
};

/** Every committed file the suite expects under tests/fixtures/codemod-cli, relative to it. */
const EXPECTED_FIXTURE_FILES: readonly string[] = [
  ...MIXED_FILES.map((file) => `mixed/${file}`),
  ...TRANSFORMS.flatMap((transform) => [
    ...CHANGED[transform].map((file) => `mixed.expected/${transform}/${file}`),
    `mixed.expected/${transform}.dry-run.stdout`,
    `mixed.expected/${transform}.shim.dry-run.stdout`,
    `mixed.expected/${transform}.stderr`,
  ]),
].sort();

const GENERATED =
  'import Command from \'cmdk\';\n\nexport const G = () => <Command label="g" />;\n';
const GENERATED_REWRITTEN =
  'import { Command } from \'modern-cmdk/react\';\n\nexport const G = () => <Command label="g" />;\n';

/**
 * Written into the temp copy at test time (the repository's .gitignore would drop them). All four
 * are gitignored by mixed/_gitignore. `legacy` is whether the shim's 1.4 discovery (it ignores no
 * .gitignore and skips only node_modules, dist, build and .next) still reaches the file.
 */
const IGNORED: readonly { readonly path: string; readonly legacy: boolean }[] = [
  { path: 'gen/generated.tsx', legacy: true },
  { path: 'dist/bundle.js', legacy: false },
  { path: 'node_modules/dep/index.js', legacy: false },
  { path: 'coverage/lcov-report/block.js', legacy: true },
];

/** The summary line (without the dry-run suffix) of a run over mixed/, per bin profile and transform. */
const SUMMARY: Readonly<Record<'strict' | 'shim', Readonly<Record<Transform, string>>>> = {
  strict: {
    'import-rewrite': '3 changed, 5 unchanged, 0 errors, 2 skipped',
    'data-attrs': '4 changed, 6 unchanged, 0 errors, 2 reported',
    'forward-ref': '1 changed, 7 unchanged, 0 errors, 2 skipped',
    'should-filter': '1 changed, 7 unchanged, 0 errors, 2 skipped',
  },
  shim: {
    'import-rewrite': '5 changed, 5 unchanged, 0 errors, 2 skipped',
    'data-attrs': '4 changed, 8 unchanged, 0 errors, 2 reported',
    'forward-ref': '1 changed, 9 unchanged, 0 errors, 2 skipped',
    'should-filter': '1 changed, 9 unchanged, 0 errors, 2 skipped',
  },
};

// --- helpers ---------------------------------------------------------------

interface Ran {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

let execEnv: NodeJS.ProcessEnv = {};

/** Run a built bin on process.execPath in `cwd`; resolves on any exit code. */
function exec(bin: string, args: readonly string[], cwd: string): Promise<Ran> {
  const { promise, resolve: done, reject } = Promise.withResolvers<Ran>();
  execFile(
    process.execPath,
    [bin, ...args],
    { cwd, env: execEnv, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, windowsHide: true },
    (error, stdout, stderr) => {
      if (error === null) return done({ code: 0, stdout, stderr });
      const code = (error as NodeJS.ErrnoException).code;
      if (typeof code === 'number') return done({ code, stdout, stderr });
      reject(error);
    },
  );
  return promise;
}

/** Every file under `dir` (the .git directory excepted) as relative '/' path to its text. */
async function readTree(dir: string): Promise<Record<string, string>> {
  const tree: Record<string, string> = {};
  for (const entry of await readdir(dir, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const path = join(entry.parentPath, entry.name);
    const rel = path.slice(dir.length + 1).replaceAll('\\', '/');
    if (rel === '.git' || rel.startsWith('.git/')) continue;
    tree[rel] = await readFile(path, 'utf8');
  }
  return Object.fromEntries(Object.entries(tree).sort(([a], [b]) => (a < b ? -1 : 1)));
}

const sorted = (tree: Record<string, string>): Record<string, string> =>
  Object.fromEntries(Object.entries(tree).sort(([a], [b]) => (a < b ? -1 : 1)));

const toCrlf = (text: string): string => text.replace(/\r?\n/g, '\r\n');

/** Run `body` with a fresh temp root, removed afterwards. */
async function withTemp<T>(body: (root: string) => Promise<T>): Promise<T> {
  const root = await mkdtemp(join(tmpdir(), 'cmdk-exec-'));
  try {
    return await body(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

interface StageOptions {
  /** git init and commit the work tree. */
  readonly repo?: boolean;
  /** Write the gitignored files of IGNORED. */
  readonly ignored?: boolean;
  /** Turn every LF of every file but the ignore file into CRLF. */
  readonly crlf?: boolean;
}

/** Copy mixed/ to <root>/work, rename _gitignore, and optionally add the ignored files, CRLF and a commit. */
async function stageMixed(root: string, options: StageOptions = {}): Promise<string> {
  const work = join(root, 'work');
  await cp(MIXED, work, { recursive: true });
  await rename(join(work, '_gitignore'), join(work, '.gitignore'));
  if (options.crlf === true) {
    for (const [rel, text] of Object.entries(await readTree(work))) {
      if (rel !== '.gitignore') await writeFile(join(work, rel), toCrlf(text));
    }
  }
  if (options.ignored === true) {
    for (const { path } of IGNORED) {
      await mkdir(dirname(join(work, path)), { recursive: true });
      await writeFile(join(work, path), GENERATED);
    }
  }
  if (options.repo === true) {
    await git(work, ['init', '-q']);
    await git(work, ['add', '-A']);
    await git(work, ['commit', '-q', '-m', 'init']);
  }
  return work;
}

let committed: Record<string, string> = {};

/** The expected tree of a real run of `transform` over a staged mixed/ with the ignored files. */
function expectedTree(transform: Transform, flavour: 'strict' | 'shim'): Record<string, string> {
  const tree: Record<string, string> = {};
  for (const file of MIXED_FILES) {
    tree[file === '_gitignore' ? '.gitignore' : file] = committed[`mixed/${file}`] as string;
  }
  for (const file of CHANGED[transform]) {
    tree[file] = committed[`mixed.expected/${transform}/${file}`] as string;
  }
  for (const { path, legacy } of IGNORED) {
    tree[path] =
      flavour === 'shim' && legacy && transform === 'import-rewrite'
        ? GENERATED_REWRITTEN
        : GENERATED;
  }
  return sorted(tree);
}

const lastLine = (text: string): string => text.trimEnd().split('\n').at(-1) as string;
const withoutDeprecation = (stderr: string): string =>
  stderr
    .split('\n')
    .filter((line) => !line.startsWith(DEPRECATION))
    .join('\n');
const deprecationLines = (stderr: string): string[] =>
  stderr.split('\n').filter((line) => line.startsWith(DEPRECATION));

// --- suite -----------------------------------------------------------------

describe.skipIf(!built)('CLI-TEST: built bins over temp copies', () => {
  let envDir = '';

  beforeAll(async () => {
    envDir = await mkdtemp(join(tmpdir(), 'cmdk-exec-env-'));
    // No system or global git config, for the test's own git() calls and (inherited) for the bins' git.
    vi.stubEnv('GIT_CONFIG_NOSYSTEM', gitEnv(envDir).GIT_CONFIG_NOSYSTEM as string);
    vi.stubEnv('GIT_CONFIG_GLOBAL', gitEnv(envDir).GIT_CONFIG_GLOBAL as string);
    // A temp dir outside any repository stays outside one, whatever sits above the temp root.
    vi.stubEnv('GIT_CEILING_DIRECTORIES', await realpath(tmpdir()));
    execEnv = { ...process.env };

    // Every committed file the suite expects exists and git knows it (an ignored one would be absent here).
    const listed = (
      await git(repoRoot, [
        'ls-files',
        '--cached',
        '--others',
        '--exclude-standard',
        '-z',
        '--',
        'tests/fixtures/codemod-cli',
      ])
    )
      .split('\0')
      .filter((file) => file !== '')
      .map((file) => file.slice('tests/fixtures/codemod-cli/'.length))
      .sort();
    expect(listed).toEqual(EXPECTED_FIXTURE_FILES);
    committed = {};
    for (const file of EXPECTED_FIXTURE_FILES) {
      expect(existsSync(join(CLI_FIXTURES, file)), `fixture ${file} exists`).toBe(true);
      committed[file] = await readFile(join(CLI_FIXTURES, file), 'utf8');
    }
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    if (envDir !== '') await rm(envDir, { recursive: true, force: true });
  });

  // --- every wave-2 fixture through both bins ------------------------------

  describe.each([
    ['modern-cmdk-codemod (strict, --force)', BIN.codemod, ['--force']],
    ['modern-cmdk shim (lenient)', BIN.shim, []],
  ] as const)('CLI-TEST: %s', (_name, bin, extra) => {
    it.each(TRANSFORMS)(
      'CLI-TEST: %s: every fixture case of the transform rewrites to its output.<ext>',
      async (transform) => {
        const cases: { file: string; output: string; reports: string[] }[] = [];
        await withTemp(async (root) => {
          const work = join(root, 'work');
          await mkdir(join(work, 'src'), { recursive: true });
          for (const entry of await readdir(join(CASES, transform), { withFileTypes: true })) {
            if (!entry.isDirectory()) continue;
            const dir = join(CASES, transform, entry.name);
            const input = (await readdir(dir)).find((name) => name.startsWith('input.'));
            expect(input, `${transform}/${entry.name} has an input file`).toBeDefined();
            const ext = (input as string).slice('input'.length);
            const reportsPath = join(dir, 'reports.json');
            const file = `src/${entry.name}${ext}`;
            await cp(join(dir, input as string), join(work, file));
            cases.push({
              file,
              output: await readFile(join(dir, `output${ext}`), 'utf8'),
              reports: existsSync(reportsPath)
                ? (JSON.parse(await readFile(reportsPath, 'utf8')) as string[])
                : [],
            });
          }
          cases.sort((a, b) => (a.file < b.file ? -1 : 1));
          const ran = await exec(bin, [transform, 'src', ...extra], work);
          expect({ code: ran.code, stderr: withoutDeprecation(ran.stderr) }).toEqual({
            code: 0,
            stderr: cases.flatMap((c) => c.reports.map((r) => `${c.file}: ${r}\n`)).join(''),
          });
          const tree = await readTree(work);
          expect(tree).toEqual(sorted(Object.fromEntries(cases.map((c) => [c.file, c.output]))));
          expect(lastLine(ran.stdout)).toMatch(/^\d+ changed, \d+ unchanged, 0 errors/);
        });
      },
    );
  });

  // --- the mixed tree, both bins, dry-run and real -------------------------

  describe.each([
    ['modern-cmdk-codemod', BIN.codemod, 'strict'],
    ['modern-cmdk shim', BIN.shim, 'shim'],
  ] as const)('CLI-TEST, RP-35: %s on mixed/', (_name, bin, flavour) => {
    it.each(TRANSFORMS)(
      'RP-35: %s --dry-run leaves the tree byte-identical and prints the expected diff',
      async (transform) => {
        await withTemp(async (root) => {
          const work = await stageMixed(root, { repo: true, ignored: true });
          const before = await readTree(work);
          const ran = await exec(bin, [transform, '.', '--dry-run'], work);
          expect(ran.code).toBe(0);
          expect(await readTree(work)).toEqual(before);
          expect(lastLine(ran.stdout)).toBe(
            `${SUMMARY[flavour][transform]} (dry run, nothing written)`,
          );
          const wouldChange = ran.stdout
            .split('\n')
            .filter((line) => line.startsWith('would change '));
          const expectedTreeNow = expectedTree(transform, flavour);
          expect(wouldChange).toEqual(
            Object.keys(expectedTreeNow)
              .filter((path) => expectedTreeNow[path] !== before[path])
              .map((path) => `would change ${path}`),
          );
          expect(deprecationLines(ran.stderr)).toHaveLength(flavour === 'shim' ? 1 : 0);
          expect(withoutDeprecation(ran.stderr)).toBe(
            committed[`mixed.expected/${transform}.stderr`],
          );
        });
      },
    );

    it.each(TRANSFORMS)(
      'RP-35: %s writes the expected tree and the exact summary',
      async (transform) => {
        await withTemp(async (root) => {
          const work = await stageMixed(root, { repo: true, ignored: true });
          const ran = await exec(bin, [transform, '.'], work);
          expect(ran.code).toBe(0);
          expect(await readTree(work)).toEqual(expectedTree(transform, flavour));
          expect(lastLine(ran.stdout)).toBe(SUMMARY[flavour][transform]);
          expect(withoutDeprecation(ran.stderr)).toBe(
            committed[`mixed.expected/${transform}.stderr`],
          );
        });
      },
    );
  });

  describe.each([
    ['modern-cmdk-codemod', BIN.codemod, 'dry-run.stdout'],
    ['modern-cmdk shim', BIN.shim, 'shim.dry-run.stdout'],
  ] as const)('RP-35: %s dry-run diff', (_name, bin, suffix) => {
    it.each(TRANSFORMS)(
      'RP-35: %s --dry-run stdout equals the committed expected diff',
      async (transform) => {
        await withTemp(async (root) => {
          const work = await stageMixed(root, { repo: true, ignored: true });
          const ran = await exec(bin, [transform, '.', '--dry-run'], work);
          expect(ran.stdout).toBe(committed[`mixed.expected/${transform}.${suffix}`]);
        });
      },
    );
  });

  it('CLI-TEST: the strict bin skips the gitignored and excluded files, the shim keeps 1.4 discovery (gen/ and coverage/ are reached, dist/ and node_modules/ are not)', async () => {
    await withTemp(async (root) => {
      const strict = await stageMixed(await mkdtemp(join(root, 'a-')), {
        repo: true,
        ignored: true,
      });
      const shim = await stageMixed(await mkdtemp(join(root, 'b-')), { repo: true, ignored: true });
      const a = await exec(BIN.codemod, ['import-rewrite', '.'], strict);
      const b = await exec(BIN.shim, ['import-rewrite', '.'], shim);
      const touched = async (work: string): Promise<string[]> =>
        Object.entries(await readTree(work))
          .filter(([path, text]) => IGNORED.some((i) => i.path === path) && text !== GENERATED)
          .map(([path]) => path);
      expect([a.code, b.code]).toEqual([0, 0]);
      expect(await touched(strict)).toEqual([]);
      expect(await touched(shim)).toEqual(['coverage/lcov-report/block.js', 'gen/generated.tsx']);
    });
  });

  // --- RP-18: EOL and quotes ----------------------------------------------

  describe.each([
    ['modern-cmdk-codemod', BIN.codemod, ['--force']],
    ['modern-cmdk shim', BIN.shim, []],
  ] as const)('RP-18: %s', (_name, bin, extra) => {
    it('RP-18: all four transforms on a CRLF copy keep every touched file CRLF and each file keeps its quote style', async () => {
      await withTemp(async (root) => {
        const work = await stageMixed(root, { crlf: true });
        for (const transform of TRANSFORMS) {
          const ran = await exec(bin, [transform, '.', ...extra], work);
          expect(ran.code, `${transform}: ${ran.stderr}`).toBe(0);
        }
        const expected: Record<string, string> = {};
        for (const file of MIXED_FILES) {
          if (file === '_gitignore') {
            expected['.gitignore'] = committed[`mixed/${file}`] as string;
          } else {
            expected[file] = toCrlf(committed[`mixed/${file}`] as string);
          }
        }
        for (const transform of TRANSFORMS) {
          for (const file of CHANGED[transform]) {
            expected[file] = toCrlf(committed[`mixed.expected/${transform}/${file}`] as string);
          }
        }
        const tree = await readTree(work);
        expect(tree).toEqual(sorted(expected));
        for (const file of Object.values(CHANGED).flat()) {
          expect(tree[file]?.replace(/\r\n/g, ''), `${file} has no bare LF`).not.toContain('\n');
        }
        // One single-quoted and one double-quoted file keep their import quotes.
        expect(tree['src/single.tsx']).toContain("from 'modern-cmdk/react'");
        expect(tree['src/double.tsx']).toContain('from "modern-cmdk/react"');
      });
    });
  });

  // --- exit codes ----------------------------------------------------------

  describe('CLI-TEST: exit codes of the strict bin', () => {
    it.each([
      ['--bogus alone', ['--bogus']],
      ['--bogus beside both positionals', ['import-rewrite', 'src', '--bogus']],
      ['an unknown transform', ['no-such-transform', 'src']],
      ['--strict --lenient', ['--strict', '--lenient', 'import-rewrite', 'src']],
    ])('CLI-TEST: modern-cmdk-codemod exits 2 on %s and writes nothing', async (_name, args) => {
      await withTemp(async (root) => {
        const work = await stageMixed(root, { repo: true });
        const before = await readTree(work);
        const ran = await exec(BIN.codemod, args, work);
        expect(ran.code).toBe(2);
        expect(ran.stderr).toMatch(/Usage:|unknown transform/);
        expect(await readTree(work)).toEqual(before);
      });
    });

    it('CLI-TEST: modern-cmdk-codemod --help exits 0 and names the strict default', async () => {
      await withTemp(async (root) => {
        const ran = await exec(BIN.codemod, ['--help'], root);
        expect(ran.code).toBe(0);
        expect(ran.stdout).toContain('Usage: modern-cmdk-codemod');
        expect(ran.stdout).toContain('runs with --strict unless --lenient is given');
      });
    });

    it('CLI-TEST: a file that fails to parse exits 1 through the strict bin (with --force) and 0 through the shim', async () => {
      await withTemp(async (root) => {
        const strict = join(root, 'strict');
        const lenient = join(root, 'lenient');
        for (const work of [strict, lenient]) {
          await mkdir(join(work, 'src'), { recursive: true });
          await cp(join(MIXED, 'src/nested/deep/palette.tsx'), join(work, 'src/ok.tsx'));
          await writeFile(
            join(work, 'src/broken.ts'),
            "import Command from 'cmdk';\nexport const x = (\n",
          );
        }
        const a = await exec(BIN.codemod, ['import-rewrite', 'src', '--force'], strict);
        const b = await exec(BIN.shim, ['import-rewrite', 'src'], lenient);
        expect(a.code).toBe(1);
        expect(a.stderr).toContain('src/broken.ts:');
        expect(lastLine(a.stdout)).toBe('1 changed, 0 unchanged, 1 errors');
        expect(b.code).toBe(0);
        expect(b.stderr).toContain('src/broken.ts:');
        expect(lastLine(b.stdout)).toBe('1 changed, 0 unchanged, 1 errors');
        // The good file is rewritten either way.
        expect(await readFile(join(strict, 'src/ok.tsx'), 'utf8')).toBe(
          committed['mixed.expected/import-rewrite/src/nested/deep/palette.tsx'],
        );
        expect(await readFile(join(lenient, 'src/ok.tsx'), 'utf8')).toBe(
          committed['mixed.expected/import-rewrite/src/nested/deep/palette.tsx'],
        );
      });
    });
  });

  describe('CLI-TEST: exit codes of the deprecated shim keep 1.4', () => {
    it.each([
      ['--bogus alone', ['--bogus'], 0],
      [
        '--bogus beside both positionals (warns, carries on)',
        ['import-rewrite', 'src', '--bogus', '--dry-run'],
        0,
      ],
      ['an unknown transform', ['no-such-transform', 'src'], 1],
      ['--strict --bogus', ['--strict', '--bogus'], 2],
    ] as const)(
      'CLI-TEST: the shim exits as 1.4 did on %s, with exactly one deprecation line',
      async (_name, args, code) => {
        await withTemp(async (root) => {
          const work = await stageMixed(root, { repo: true });
          const ran = await exec(BIN.shim, args, work);
          expect(ran.code).toBe(code);
          expect(deprecationLines(ran.stderr)).toHaveLength(1);
        });
      },
    );

    it('CLI-TEST: the shim --help names the deprecation and the new package', async () => {
      await withTemp(async (root) => {
        const ran = await exec(BIN.shim, ['--help'], root);
        expect(ran.code).toBe(0);
        expect(ran.stdout).toContain('Usage: modern-cmdk');
        expect(ran.stdout).toContain('npx modern-cmdk-codemod');
      });
    });
  });

  // --- dirty tree ----------------------------------------------------------

  describe('CLI-TEST: dirty and missing git trees', () => {
    const edit = '// edited\n';

    it('CLI-TEST: a dirty tree makes the strict bin exit 2 and write nothing; --force writes', async () => {
      await withTemp(async (root) => {
        const refused = await stageMixed(join(await mkdtemp(join(root, 'a-')), ''), { repo: true });
        const forced = await stageMixed(await mkdtemp(join(root, 'b-')), { repo: true });
        for (const work of [refused, forced]) {
          await writeFile(
            join(work, 'src/single.tsx'),
            `${committed['mixed/src/single.tsx']}${edit}`,
          );
        }
        const before = await readTree(refused);
        const no = await exec(BIN.codemod, ['import-rewrite', '.'], refused);
        expect(no.code).toBe(2);
        expect(no.stderr).toContain('uncommitted changes');
        expect(no.stderr).toContain('src/single.tsx');
        expect(no.stderr).toContain('--force');
        expect(await readTree(refused)).toEqual(before);

        const yes = await exec(BIN.codemod, ['import-rewrite', '.', '--force'], forced);
        expect(yes.code).toBe(0);
        expect(await readFile(join(forced, 'src/single.tsx'), 'utf8')).toBe(
          `${committed['mixed.expected/import-rewrite/src/single.tsx']}${edit}`,
        );
      });
    });

    it('CLI-TEST: the shim writes into a dirty tree', async () => {
      await withTemp(async (root) => {
        const work = await stageMixed(root, { repo: true });
        await writeFile(
          join(work, 'src/single.tsx'),
          `${committed['mixed/src/single.tsx']}${edit}`,
        );
        const ran = await exec(BIN.shim, ['import-rewrite', '.'], work);
        expect(ran.code).toBe(0);
        expect(await readFile(join(work, 'src/single.tsx'), 'utf8')).toBe(
          `${committed['mixed.expected/import-rewrite/src/single.tsx']}${edit}`,
        );
      });
    });

    it('CLI-TEST: with no git work tree the strict bin exits 2 naming --force and writes nothing', async () => {
      await withTemp(async (root) => {
        const work = await stageMixed(root);
        const before = await readTree(work);
        const ran = await exec(BIN.codemod, ['import-rewrite', '.'], work);
        expect(ran.code).toBe(2);
        expect(ran.stderr).toContain('--force');
        expect(await readTree(work)).toEqual(before);
      });
    });
  });

  // --- version, globs, concurrency -----------------------------------------

  describe('CLI-TEST: --version, backslash globs and concurrency', () => {
    it.each([
      ['modern-cmdk-codemod', BIN.codemod, 'packages/modern-cmdk-codemod/package.json'],
      ['modern-cmdk (shim)', BIN.shim, 'packages/modern-cmdk/package.json'],
    ] as const)(
      'CLI-TEST: %s --version prints the manifest name and version',
      async (_name, bin, manifest) => {
        const { name, version } = JSON.parse(await readFile(join(repoRoot, manifest), 'utf8')) as {
          name: string;
          version: string;
        };
        await withTemp(async (root) => {
          const ran = await exec(bin, ['--version'], root);
          expect(ran.code).toBe(0);
          expect(ran.stdout).toBe(`${name} ${version}\n`);
        });
      },
    );

    it.runIf(process.platform === 'win32').each([
      ['modern-cmdk-codemod', BIN.codemod, ['--force']],
      ['modern-cmdk (shim)', BIN.shim, []],
    ] as const)('CLI-TEST: %s matches a backslash glob on win32', async (_name, bin, extra) => {
      await withTemp(async (root) => {
        const work = await stageMixed(root);
        const ran = await exec(bin, ['import-rewrite', 'src\\*.tsx', ...extra], work);
        expect(ran.code).toBe(0);
        expect(lastLine(ran.stdout)).toBe('2 changed, 2 unchanged, 0 errors');
        const tree = await readTree(work);
        expect(tree['src/single.tsx']).toBe(
          committed['mixed.expected/import-rewrite/src/single.tsx'],
        );
        expect(tree['src/double.tsx']).toBe(
          committed['mixed.expected/import-rewrite/src/double.tsx'],
        );
        expect(tree['src/nested/deep/palette.tsx']).toBe(
          committed['mixed/src/nested/deep/palette.tsx'],
        );
      });
    });

    it('CLI-TEST: --concurrency=4 and --concurrency=1 give identical trees and stdout over 60 files', async () => {
      const results = await Promise.all(
        [4, 1].map((concurrency) =>
          withTemp(async (root) => {
            const work = join(root, 'work');
            await mkdir(join(work, 'src'), { recursive: true });
            for (let n = 0; n < 60; n++) {
              await writeFile(
                join(work, `src/f${String(n).padStart(2, '0')}.tsx`),
                `import Command from 'cmdk';\n\nexport const C${n} = () => <Command label="${n}" />;\n`,
              );
            }
            const ran = await exec(
              BIN.codemod,
              ['import-rewrite', 'src', '--force', `--concurrency=${concurrency}`],
              work,
            );
            return { ran, tree: await readTree(work) };
          }),
        ),
      );
      const [four, one] = results as [(typeof results)[number], (typeof results)[number]];
      expect([four.ran.code, one.ran.code]).toEqual([0, 0]);
      expect(four.tree).toEqual(one.tree);
      expect(four.ran.stdout).toBe(one.ran.stdout);
      expect(lastLine(one.ran.stdout)).toBe('60 changed, 0 unchanged, 0 errors');
      expect(one.tree['src/f07.tsx']).toBe(
        `import { Command } from 'modern-cmdk/react';\n\nexport const C7 = () => <Command label="7" />;\n`,
      );
    });
  });

  // --- create-modern-cmdk (SEC-52, create half) -----------------------------

  describe('SEC-52: create-modern-cmdk', () => {
    const SCAFFOLD = [
      'index.html',
      'package.json',
      'src/App.tsx',
      'src/main.tsx',
      'tsconfig.app.json',
      'tsconfig.json',
      'tsconfig.node.json',
      'vite.config.ts',
    ];

    it('SEC-52: a non-empty target is listed on stderr, then scaffolded, exit 0', async () => {
      await withTemp(async (root) => {
        await mkdir(join(root, 'app'));
        await writeFile(join(root, 'app/package.json'), '{"keep":true}\n');
        await writeFile(join(root, 'app/notes.txt'), 'mine\n');
        const ran = await exec(BIN.create, ['app'], root);
        expect(ran.code).toBe(0);
        expect(ran.stderr).toContain('is not empty; this run will overwrite 1 file:');
        expect(ran.stderr).toContain('  package.json');
        const tree = await readTree(join(root, 'app'));
        expect(Object.keys(tree).sort()).toEqual([...SCAFFOLD, 'notes.txt'].sort());
        expect(tree['notes.txt']).toBe('mine\n');
        expect((JSON.parse(tree['package.json'] as string) as { name: string }).name).toBe('app');
      });
    });

    it('SEC-52: --no-overwrite refuses a non-empty target with exit 1 and leaves every byte', async () => {
      await withTemp(async (root) => {
        await mkdir(join(root, 'app'));
        await writeFile(join(root, 'app/package.json'), '{"keep":true}\n');
        const before = await readTree(root);
        const ran = await exec(BIN.create, ['app', '--no-overwrite'], root);
        expect(ran.code).toBe(1);
        expect(ran.stderr).toContain('nothing was written (--no-overwrite)');
        expect(await readTree(root)).toEqual(before);
      });
    });

    it.runIf(process.platform === 'win32')(
      'SEC-52: "Bad<Name" creates nothing and exits 1 on win32',
      async () => {
        await withTemp(async (root) => {
          const ran = await exec(BIN.create, ['Bad<Name'], root);
          expect(ran.code).toBe(1);
          expect(ran.stderr).toContain('Windows cannot use');
          expect(await readdir(root)).toEqual([]);
        });
      },
    );

    it.skipIf(process.platform === 'win32')(
      'SEC-52: "Bad<Name" scaffolds with the package name bad-name elsewhere',
      async () => {
        await withTemp(async (root) => {
          const ran = await exec(BIN.create, ['Bad<Name'], root);
          expect(ran.code).toBe(0);
          const tree = await readTree(join(root, 'Bad<Name'));
          expect((JSON.parse(tree['package.json'] as string) as { name: string }).name).toBe(
            'bad-name',
          );
        });
      },
    );

    it('SEC-52: "..." derives no package name, creates nothing and exits 1', async () => {
      await withTemp(async (root) => {
        const ran = await exec(BIN.create, ['...'], root);
        expect(ran.code).toBe(1);
        expect(ran.stderr).toContain('cannot derive a package name');
        expect(await readdir(root)).toEqual([]);
      });
    });

    it('SEC-52: "My App" gets the package name my-app and a quoted cd', async () => {
      await withTemp(async (root) => {
        const ran = await exec(BIN.create, ['My App'], root);
        expect(ran.code).toBe(0);
        expect(ran.stdout).toContain('  cd "My App"');
        const tree = await readTree(join(root, 'My App'));
        expect(Object.keys(tree).sort()).toEqual(SCAFFOLD);
        expect((JSON.parse(tree['package.json'] as string) as { name: string }).name).toBe(
          'my-app',
        );
      });
    });

    it('SEC-52: --template=react-full warns that it is a deprecated alias and exits 0', async () => {
      await withTemp(async (root) => {
        const ran = await exec(BIN.create, ['app', '--template=react-full'], root);
        expect(ran.code).toBe(0);
        expect(ran.stderr).toContain(
          'warning: the react-full template is a deprecated alias of react-basic',
        );
        expect(Object.keys(await readTree(join(root, 'app'))).sort()).toEqual(SCAFFOLD);
      });
    });
  });
});

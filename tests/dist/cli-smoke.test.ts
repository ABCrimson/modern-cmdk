import { execFile } from 'node:child_process';
import { cp, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

// Needs: pnpm --filter modern-cmdk --filter modern-cmdk-codemod --filter create-modern-cmdk run build
const execFileAsync = promisify(execFile);
const root = resolve(import.meta.dirname, '../..');

const BINS = {
  'modern-cmdk (shim)': resolve(root, 'packages/modern-cmdk/dist/codemod/bin.mjs'),
  'modern-cmdk (bundled cli.mjs, direct)': resolve(
    root,
    'packages/modern-cmdk/dist/codemod/cli.mjs',
  ),
  'modern-cmdk-codemod': resolve(root, 'packages/modern-cmdk-codemod/dist/cli.mjs'),
  'create-modern-cmdk': resolve(root, 'packages/create-modern-cmdk/dist/index.mjs'),
} as const;

/** The bins that keep the 1.x lenient exit codes by default (modern-cmdk-codemod is strict by default). */
const LENIENT_BINS = [
  ['modern-cmdk (shim)', BINS['modern-cmdk (shim)']],
  ['modern-cmdk (bundled cli.mjs, direct)', BINS['modern-cmdk (bundled cli.mjs, direct)']],
  ['create-modern-cmdk', BINS['create-modern-cmdk']],
] as const;

const DEPRECATION = 'warning: the modern-cmdk bin is deprecated';

async function runBin(
  bin: string,
  args: string[],
): Promise<{ code: number; stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, [bin, ...args]);
    return { code: 0, stdout, stderr };
  } catch (err) {
    const e = err as { code: number; stdout: string; stderr: string };
    return { code: e.code, stdout: e.stdout, stderr: e.stderr };
  }
}

describe.each(Object.entries(BINS))('built bin: %s', (_name, bin) => {
  it('--help prints usage to stdout and exits 0', async () => {
    const r = await runBin(bin, ['--help']);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('Usage:');
    expect(r.stdout.trim().length).toBeGreaterThan(0);
  });

  it('--strict --bogus exits 2 with the error on stderr', async () => {
    const r = await runBin(bin, ['--strict', '--bogus']);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain('unknown option --bogus');
  });
});

describe.each(LENIENT_BINS)('built bin: %s keeps the 1.x defaults', (_name, bin) => {
  it('--bogus keeps the 1.2 exit code 0', async () => {
    const r = await runBin(bin, ['--bogus']);
    expect(r.code).toBe(0);
    expect(r.stderr).toContain('unknown option --bogus');
  });
});

describe('PKG-1: the modern-cmdk bin is a shim over the bundled codemod', () => {
  it('F16, PKG-1: the shim warns once', async () => {
    for (const args of [['--help'], ['--bogus'], ['--strict', '--bogus']]) {
      const r = await runBin(BINS['modern-cmdk (shim)'], args);
      const warnings = r.stderr.split('\n').filter((line) => line.startsWith(DEPRECATION));
      expect(warnings, args.join(' ')).toHaveLength(1);
      expect(r.stderr.startsWith(DEPRECATION), args.join(' ')).toBe(true);
    }
    const help = await runBin(BINS['modern-cmdk (shim)'], ['--help']);
    expect(help.stderr.trimEnd().split('\n')).toHaveLength(1);
  });

  it('PKG-1: modern-cmdk --strict --bogus exits 2 through the shim', async () => {
    const r = await runBin(BINS['modern-cmdk (shim)'], ['--strict', '--bogus']);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain('unknown option --bogus');
  });

  it('PKG-1: modern-cmdk-codemod --bogus exits 2', async () => {
    const r = await runBin(BINS['modern-cmdk-codemod'], ['--bogus']);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain('unknown option --bogus');
    expect(r.stderr).not.toContain(DEPRECATION);
  });

  it('PKG-1: the shim names itself modern-cmdk and the new bin names itself modern-cmdk-codemod', async () => {
    const shim = await runBin(BINS['modern-cmdk (shim)'], ['--help']);
    expect(shim.stdout).toContain('Usage: modern-cmdk <transform>');
    const codemod = await runBin(BINS['modern-cmdk-codemod'], ['--help']);
    expect(codemod.stdout).toContain('Usage: modern-cmdk-codemod <transform>');
  });
});

/** The name and version a package's package.json declares. */
async function readPackage(dir: string): Promise<{ name: string; version: string }> {
  return JSON.parse(await readFile(resolve(root, dir, 'package.json'), 'utf-8')) as {
    name: string;
    version: string;
  };
}

describe('W3-01b: a bundled cli.mjs follows the package it ships in', () => {
  it('W3-01b: the bundled cli.mjs run directly inside modern-cmdk uses the modern-cmdk profile: Usage: modern-cmdk, --version prints modern-cmdk and its version, an unknown option exits 0 (lenient)', async () => {
    const bin = BINS['modern-cmdk (bundled cli.mjs, direct)'];
    const pkg = await readPackage('packages/modern-cmdk');
    expect(pkg.name).toBe('modern-cmdk');
    const help = await runBin(bin, ['--help']);
    expect(help.stdout).toContain('Usage: modern-cmdk <transform>');
    expect(help.stdout).not.toContain('Usage: modern-cmdk-codemod');
    const version = await runBin(bin, ['--version']);
    expect(version.stdout).toBe(`modern-cmdk ${pkg.version}
`);
    const unknown = await runBin(bin, ['--bogus']);
    expect(unknown.code).toBe(0);
  });

  it('W3-01b: the modern-cmdk-codemod dist/cli.mjs uses the modern-cmdk-codemod profile: Usage: modern-cmdk-codemod, --version prints modern-cmdk-codemod and its version, an unknown option exits 2', async () => {
    const bin = BINS['modern-cmdk-codemod'];
    const pkg = await readPackage('packages/modern-cmdk-codemod');
    expect(pkg.name).toBe('modern-cmdk-codemod');
    const help = await runBin(bin, ['--help']);
    expect(help.stdout).toContain('Usage: modern-cmdk-codemod <transform>');
    const version = await runBin(bin, ['--version']);
    expect(version.stdout).toBe(`modern-cmdk-codemod ${pkg.version}
`);
    const unknown = await runBin(bin, ['--bogus']);
    expect(unknown.code).toBe(2);
  });
});

/** Every .mjs file below dir. */
async function distFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.mjs'))
    .map((entry) => join(entry.parentPath, entry.name));
}

/**
 * The specifiers a built .mjs file imports: static import and export-from statements (rolldown prints each on its own
 * line), and awaited dynamic imports of a string literal. Comment lines are skipped (a JSDoc `import("ast-types")` type
 * reference is not an import), and so is text inside a string (the import-rewrite report message names `import('cmdk')`).
 */
function importedSpecifiers(source: string): string[] {
  const found: string[] = [];
  for (const line of source.split('\n')) {
    const text = line.trim();
    if (text.startsWith('*') || text.startsWith('//') || text.startsWith('/*')) continue;
    const from = /^(?:import|export)\b[^'"]*?\bfrom\s*(['"])([^'"]+)\1/.exec(text);
    const bare = /^import\s*(['"])([^'"]+)\1/.exec(text);
    if (from?.[2]) found.push(from[2]);
    else if (bare?.[2]) found.push(bare[2]);
    for (const dynamic of text.matchAll(/\bawait\s+import\(\s*(['"])([^'"]+)\1\s*\)/g)) {
      if (dynamic[2]) found.push(dynamic[2]);
    }
  }
  return found;
}

/** The distinct bare specifiers (neither node: builtins nor relative paths) the .mjs files below dir import. */
async function bareImports(dir: string): Promise<string[]> {
  const files = await distFiles(dir);
  expect(files.length).toBeGreaterThan(0);
  const bare = new Set<string>();
  for (const file of files) {
    for (const specifier of importedSpecifiers(await readFile(file, 'utf-8'))) {
      if (!specifier.startsWith('node:') && !specifier.startsWith('.')) bare.add(specifier);
    }
  }
  return [...bare].sort();
}

describe('SEC-33, RP-28: what the built codemod files import', () => {
  it('SEC-33, RP-28: modern-cmdk-codemod dist imports only jscodeshift and node: builtins', async () => {
    expect(await bareImports(resolve(root, 'packages/modern-cmdk-codemod/dist'))).toEqual([
      'jscodeshift',
    ]);
  });

  it('SEC-33, RP-28: modern-cmdk dist/codemod imports only node: builtins', async () => {
    expect(await bareImports(resolve(root, 'packages/modern-cmdk/dist/codemod'))).toEqual([]);
  });

  it('SEC-33, RP-28: modern-cmdk dist/codemod runs from a copy with no node_modules above it', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'cmdk-isolated-'));
    try {
      const copy = join(tmp, 'codemod');
      await cp(resolve(root, 'packages/modern-cmdk/dist/codemod'), copy, { recursive: true });
      const input = join(tmp, 'input.tsx');
      await writeFile(input, "import { Command } from 'cmdk';\n");
      const r = await runBin(join(copy, 'bin.mjs'), ['import-rewrite', input, '--dry-run']);
      expect(r.code).toBe(0);
      expect(r.stdout).toContain('would change');
      expect(r.stdout).toContain('1 changed, 0 unchanged, 0 errors');
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it('SEC-33, RP-28: the shim imports nothing statically, so jscodeshift loads only once the CLI runs', async () => {
    const shim = await readFile(BINS['modern-cmdk (shim)'], 'utf-8');
    expect(importedSpecifiers(shim)).toEqual([]);
  });
});

describe('built bins: unknown options keep the 1.2.2 behaviour', () => {
  it('codemod: an unknown option with a transform and a glob warns and still reports no files (exit 1)', async () => {
    const r = await runBin(BINS['modern-cmdk (shim)'], [
      'import-rewrite',
      'nomatch-smoke/*.tsx',
      '--verbose',
    ]);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('warning: unknown option --verbose ignored');
    expect(r.stderr).toContain('no files matched');
  });

  it('create: an unknown option with a project name warns and still scaffolds', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'cmdk-smoke-'));
    try {
      const target = join(tmp, 'app');
      const r = await runBin(BINS['create-modern-cmdk'], [target, '--typescript']);
      expect(r.code).toBe(0);
      expect(r.stderr).toContain('warning: unknown option --typescript ignored');
      expect(JSON.parse(await readFile(join(target, 'package.json'), 'utf-8')).type).toBe('module');
      const strictTarget = join(tmp, 'strict');
      const s = await runBin(BINS['create-modern-cmdk'], [
        strictTarget,
        '--typescript',
        '--strict',
      ]);
      expect(s.code).toBe(2);
      await expect(readFile(join(strictTarget, 'package.json'))).rejects.toThrow();
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });
});

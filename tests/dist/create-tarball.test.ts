import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { listTarEntries } from '../../scripts/check-package.ts';

// Needs: pnpm --filter create-modern-cmdk run build
// The packed tarball is read in-process (listTarEntries of scripts/check-package.ts), never through a
// child process: the archiver on PATH differs per host and per hook environment (Windows bsdtar
// accepts C:\ paths, GNU's reads "C:" as a remote host), and that must not decide this result.

const root = resolve(import.meta.dirname, '../..');
const TIMEOUT_MS = 60_000;

let packDir = '';
let tarball = '';

/** Regular-file entries (name to content) of the packed tarball, via the unit-tested reader of scripts/check-package.ts. */
function readTarball(file: string): Map<string, Buffer> {
  return new Map(listTarEntries(readFileSync(file)).map((entry) => [entry.name, entry.data]));
}

beforeAll(async () => {
  packDir = await mkdtemp(join(tmpdir(), 'create-modern-cmdk-pack-'));
  // One command string through the shell: pnpm is a .cmd shim on Windows; packDir is mkdtemp output.
  execSync(`pnpm --filter create-modern-cmdk pack --pack-destination "${packDir}"`, {
    cwd: root,
    encoding: 'utf8',
    timeout: TIMEOUT_MS,
  });
  const [file] = (await readdir(packDir)).filter((f) => f.endsWith('.tgz'));
  if (file === undefined) throw new Error(`pnpm pack produced no tarball in ${packDir}`);
  tarball = join(packDir, file);
}, TIMEOUT_MS * 2);

afterAll(async () => {
  if (packDir !== '') await rm(packDir, { recursive: true, force: true });
});

describe('packed create-modern-cmdk', () => {
  it('the packed create-modern-cmdk tarball holds only the bin, the manifest, README and LICENSE', () => {
    expect([...readTarball(tarball).keys()].sort()).toEqual([
      'package/LICENSE',
      'package/README.md',
      'package/dist/index.mjs',
      'package/package.json',
    ]);
  });

  it('dist/index.mjs carries no sourceMappingURL', () => {
    const source = readTarball(tarball).get('package/dist/index.mjs')?.toString('utf8');
    expect(source).toBeDefined();
    expect(source).not.toMatch(/sourceMappingURL/);
  });

  it('the packed manifest carries homepage, bugs and keywords', () => {
    const manifest = JSON.parse(
      readTarball(tarball).get('package/package.json')?.toString('utf8') ?? '',
    ) as {
      description?: string;
      homepage?: string;
      bugs?: { url?: string };
      keywords?: string[];
      repository?: { type?: string; url?: string; directory?: string };
      engines?: { node?: string };
    };
    expect(manifest.description).toBe(
      'Scaffold a Vite, React 19 and TypeScript project with a modern-cmdk command palette.',
    );
    expect(manifest.homepage).toBe(
      'https://abcrimson.github.io/modern-cmdk/guide/getting-started.html',
    );
    expect(manifest.bugs).toEqual({ url: 'https://github.com/ABCrimson/modern-cmdk/issues' });
    expect(manifest.keywords).toEqual([
      'create',
      'scaffold',
      'vite',
      'react',
      'react-19',
      'typescript',
      'modern-cmdk',
      'command-palette',
      'cmdk',
    ]);
    expect(manifest.repository).toEqual({
      type: 'git',
      url: 'git+https://github.com/ABCrimson/modern-cmdk.git',
      directory: 'packages/create-modern-cmdk',
    });
    expect(manifest.engines?.node).toBe('>=26.4.0');
  });
});

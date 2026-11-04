import { execFileSync, execSync } from 'node:child_process';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Needs: pnpm --filter create-modern-cmdk run build
const root = resolve(import.meta.dirname, '../..');
const TIMEOUT_MS = 60_000;

let packDir = '';
let tarball = '';

function tar(...args: string[]): string {
  return execFileSync('tar', args, { encoding: 'utf8', timeout: TIMEOUT_MS });
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
    const entries = tar('-tzf', tarball)
      .split(/\r?\n/)
      .filter((l) => l !== '' && !l.endsWith('/'))
      .sort();
    expect(entries).toEqual([
      'package/LICENSE',
      'package/README.md',
      'package/dist/index.mjs',
      'package/package.json',
    ]);
  });

  it('dist/index.mjs carries no sourceMappingURL', () => {
    const source = tar('-xzOf', tarball, 'package/dist/index.mjs');
    expect(source).not.toMatch(/sourceMappingURL/);
  });

  it('the packed manifest carries homepage, bugs and keywords', () => {
    const manifest = JSON.parse(tar('-xzOf', tarball, 'package/package.json')) as {
      homepage?: string;
      bugs?: { url?: string };
      keywords?: string[];
      repository?: { directory?: string };
      engines?: { node?: string };
    };
    expect(manifest.homepage).toBe(
      'https://github.com/ABCrimson/modern-cmdk/tree/main/packages/create-modern-cmdk#readme',
    );
    expect(manifest.bugs).toEqual({ url: 'https://github.com/ABCrimson/modern-cmdk/issues' });
    expect(manifest.keywords).toEqual(
      expect.arrayContaining(['create', 'scaffold', 'modern-cmdk']),
    );
    expect(manifest.repository?.directory).toBe('packages/create-modern-cmdk');
    expect(manifest.engines?.node).toBe('>=26.4.0');
  });
});

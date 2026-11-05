import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Needs: pnpm --filter create-modern-cmdk run build
const execFileAsync = promisify(execFile);
const root = resolve(import.meta.dirname, '../..');
const bin = resolve(root, 'packages/create-modern-cmdk/dist/index.mjs');

let target = '';

beforeAll(async () => {
  target = await mkdtemp(join(tmpdir(), 'create-modern-cmdk-version-'));
});

afterAll(async () => {
  if (target !== '') await rm(target, { recursive: true, force: true });
});

describe('built create-modern-cmdk bin', () => {
  it('SEC-13: writes modern-cmdk at exactly the version of packages/modern-cmdk', async () => {
    const { version } = JSON.parse(
      await readFile(resolve(root, 'packages/modern-cmdk/package.json'), 'utf-8'),
    ) as { version: string };
    const app = join(target, 'app');
    await execFileAsync(process.execPath, [bin, app]);
    const pkg = JSON.parse(await readFile(join(app, 'package.json'), 'utf-8')) as {
      dependencies: Record<string, string>;
    };
    expect(pkg.dependencies['modern-cmdk']).toBe(version);
  });

  it('SEC-13: dist/index.mjs holds the version literal and reads no package.json at run time', async () => {
    const { version } = JSON.parse(
      await readFile(resolve(root, 'packages/modern-cmdk/package.json'), 'utf-8'),
    ) as { version: string };
    const source = await readFile(bin, 'utf-8');
    expect(source).toContain(JSON.stringify(version));
    expect(source).not.toContain('modern-cmdk/package.json');
    expect(source).not.toContain('import.meta.env');
  });
});

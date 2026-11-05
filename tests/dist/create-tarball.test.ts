import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Needs: pnpm --filter create-modern-cmdk run build
// The packed tarball is read in-process (node:zlib plus a small POSIX archive walk), never through a
// child process: the archiver on PATH differs per host and per hook environment (Windows bsdtar
// accepts C:\ paths, GNU's reads "C:" as a remote host), and that must not decide this result.
const root = resolve(import.meta.dirname, '../..');
const TIMEOUT_MS = 60_000;
const BLOCK = 512;

let packDir = '';
let tarball = '';

/** Octal numeric header field (NUL/space padded) as a number. */
function octal(header: Buffer, start: number, end: number): number {
  const text = header.toString('utf8', start, end).replace(/[\0 ]+/g, '');
  return text === '' ? 0 : Number.parseInt(text, 8);
}

/** NUL-terminated string header field. */
function cString(header: Buffer, start: number, end: number): string {
  const nul = header.indexOf(0, start);
  return header.toString('utf8', start, nul === -1 || nul > end ? end : nul);
}

/** The `path` record of a pax extended header ("<len> <key>=<value>\n" records), if any. */
function paxPath(data: Buffer): string | undefined {
  let offset = 0;
  while (offset < data.length) {
    const space = data.indexOf(0x20, offset);
    const length = Number.parseInt(data.toString('utf8', offset, space), 10);
    if (space === -1 || !(length > 0)) throw new Error('malformed pax record');
    const record = data.toString('utf8', space + 1, offset + length - 1);
    if (record.startsWith('path=')) return record.slice('path='.length);
    offset += length;
  }
  return undefined;
}

/** Regular-file entries (name to content) of a gzip-compressed POSIX ustar/pax archive. */
function readTarball(file: string): Map<string, Buffer> {
  const archive = gunzipSync(readFileSync(file));
  const files = new Map<string, Buffer>();
  let nextName: string | undefined;
  let offset = 0;
  while (offset + BLOCK <= archive.length) {
    const header = archive.subarray(offset, offset + BLOCK);
    if (header.every((byte) => byte === 0)) break;
    const size = octal(header, 124, 136);
    const type = String.fromCharCode(header[156] ?? 0);
    const data = archive.subarray(offset + BLOCK, offset + BLOCK + size);
    offset += BLOCK + Math.ceil(size / BLOCK) * BLOCK;
    if (type === 'x') {
      nextName = paxPath(data) ?? nextName;
    } else if (type === 'L') {
      nextName = cString(data, 0, data.length);
    } else if (type === '0' || type === '\0') {
      const prefix = cString(header, 345, 500);
      const name = cString(header, 0, 100);
      files.set(nextName ?? (prefix === '' ? name : `${prefix}/${name}`), Buffer.from(data));
      nextName = undefined;
    }
  }
  return files;
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
      homepage?: string;
      bugs?: { url?: string };
      keywords?: string[];
      repository?: { type?: string; url?: string; directory?: string };
      engines?: { node?: string };
    };
    expect(manifest.homepage).toBe(
      'https://github.com/ABCrimson/modern-cmdk/tree/main/packages/create-modern-cmdk#readme',
    );
    expect(manifest.bugs).toEqual({ url: 'https://github.com/ABCrimson/modern-cmdk/issues' });
    expect(manifest.keywords).toEqual(
      expect.arrayContaining(['create', 'scaffold', 'modern-cmdk']),
    );
    expect(manifest.repository).toEqual({
      type: 'git',
      url: 'git+https://github.com/ABCrimson/modern-cmdk.git',
      directory: 'packages/create-modern-cmdk',
    });
    expect(manifest.engines?.node).toBe('>=26.4.0');
  });
});

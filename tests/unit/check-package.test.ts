// tests/unit/check-package.test.ts
// The pure helpers of scripts/check-package.ts: file-list diff, the 'use client' directive test and
// the in-process tarball reader. The reader is exercised on archives built here byte by byte, so no
// archiver binary runs (see the host tar rule in the script header).

import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { diffFileList, listTarEntries, startsWithUseClient } from '../../scripts/check-package.ts';

const BLOCK = 512;

interface RawEntry {
  readonly name: string;
  readonly data: string;
  readonly type?: string;
  readonly prefix?: string;
}

function field(text: string, length: number): Buffer {
  const out = Buffer.alloc(length);
  out.write(text, 0, 'utf8');
  return out;
}

function entry({ name, data, type = '0', prefix = '' }: RawEntry): Buffer {
  const body = Buffer.from(data, 'utf8');
  const header = Buffer.alloc(BLOCK);
  field(name, 100).copy(header, 0);
  field(`${body.length.toString(8).padStart(11, '0')}\0`, 12).copy(header, 124);
  header.write(type, 156, 'utf8');
  field(prefix, 155).copy(header, 345);
  const padded = Buffer.alloc(Math.ceil(body.length / BLOCK) * BLOCK);
  body.copy(padded);
  return Buffer.concat([header, padded]);
}

/** A pax extended-header body holding one `path` record ("<len> path=<value>\n", len counts itself). */
function pax(path: string): string {
  const record = ` path=${path}\n`;
  let length = record.length + 1;
  while (`${length}${record}`.length !== length) length = `${length}${record}`.length;
  return `${length}${record}`;
}

function archive(...entries: readonly RawEntry[]): Buffer {
  return gzipSync(Buffer.concat([...entries.map(entry), Buffer.alloc(BLOCK * 2)]));
}

describe('diffFileList', () => {
  it('returns two empty lists when the lists are equal', () => {
    expect(diffFileList(['b', 'a'], ['a', 'b'])).toEqual({ missing: [], extra: [] });
  });

  it('reports names only in expected as missing and names only in actual as extra, sorted', () => {
    expect(diffFileList(['z', 'a', 'keep'], ['y', 'keep', 'b'])).toEqual({
      missing: ['a', 'z'],
      extra: ['b', 'y'],
    });
  });
});

describe('startsWithUseClient', () => {
  it.each([
    ["'use client';\nimport x from 'y';"],
    ['"use client"\nexport const a = 1;'],
    ["  \n\t'use client';"],
    ["// banner\n/* block */\n'use client';\nconst a = 1;"],
  ])('accepts a leading directive: %j', (code) => {
    expect(startsWithUseClient(code)).toBe(true);
  });

  it.each([
    ["import x from 'y';\n'use client';"],
    ['const a = 1;'],
    ["'use server';"],
    ["'use client-ish';"],
    ['`use client`;'],
    [''],
  ])('rejects anything else: %j', (code) => {
    expect(startsWithUseClient(code)).toBe(false);
  });
});

describe('listTarEntries', () => {
  it('lists regular files with their content and skips directories', () => {
    const entries = listTarEntries(
      archive(
        { name: 'package/', data: '', type: '5' },
        { name: 'package/a.txt', data: 'alpha' },
        { name: 'package/dist/b.mjs', data: 'x'.repeat(700) },
      ),
    );
    expect(entries.map((e) => e.name)).toEqual(['package/a.txt', 'package/dist/b.mjs']);
    expect(entries[0]?.data.toString('utf8')).toBe('alpha');
    expect(entries[1]?.data.length).toBe(700);
  });

  it('joins the ustar prefix field to the name', () => {
    const [only] = listTarEntries(archive({ name: 'file.txt', prefix: 'package/deep', data: 'x' }));
    expect(only?.name).toBe('package/deep/file.txt');
  });

  it('lets a pax path record rename the next entry only', () => {
    const long = `package/${'d/'.repeat(80)}long.txt`;
    const entries = listTarEntries(
      archive(
        { name: 'PaxHeader', type: 'x', data: pax(long) },
        { name: 'truncated', data: 'one' },
        { name: 'package/next.txt', data: 'two' },
      ),
    );
    expect(entries.map((e) => e.name)).toEqual([long, 'package/next.txt']);
  });
});

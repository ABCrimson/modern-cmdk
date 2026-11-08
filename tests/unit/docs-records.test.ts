import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import { loadRecords, readSizes } from '../../apps/docs/.vitepress/theme/data/records';

// Which size record the home page prints (hostile verifier finding 3): the one whose version equals the manifest's, else the
// highest not above it, else none. Fixture records live in a temp directory shaped like benchmarks/size-history/.

let root: string;
let sizeHistory: string;
let warn: MockInstance<(message: string) => void>;

function record(version: string, coreBytes: number): string {
  const path = join(sizeHistory, `${version}.json`);
  writeFileSync(
    path,
    JSON.stringify({
      sha: `sha-${version}`,
      date: '2026-11-01T00:00:00Z',
      sizeLimit: '12.0.0',
      entries: [{ name: 'modern-cmdk (core)', size: coreBytes }],
    }),
  );
  return path;
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'docs-records-'));
  sizeHistory = join(root, 'size-history');
  mkdirSync(sizeHistory);
  warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(root, { recursive: true, force: true });
});

describe('readSizes', () => {
  it('takes the record whose version equals the manifest version, even when a newer one exists', () => {
    const paths = [record('1.4.0', 4000), record('1.5.0', 5000), record('1.3.0', 3000)];
    const sizes = readSizes(paths, '1.4.0');
    expect(sizes?.version).toBe('1.4.0');
    expect(sizes?.file).toBe('1.4.0.json');
    expect(sizes?.core).toBe(4000);
  });

  it('takes the highest record not above the manifest version when there is no record of that version', () => {
    const paths = [record('1.3.0', 3000), record('1.5.0', 5000), record('1.4.0', 4000)];
    const sizes = readSizes(paths, '1.4.2');
    expect(sizes?.version).toBe('1.4.0');
    expect(sizes?.core).toBe(4000);
  });

  it('leaves the figures out, with a warning, when every record is above the manifest version', () => {
    const paths = [record('1.4.0', 4000), record('1.5.0', 5000)];
    expect(readSizes(paths, '1.2.3')).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('at or below 1.2.3'));
  });
});

describe('loadRecords', () => {
  it('names the selected record in the data the page reads, not the highest one on disk', () => {
    const manifest = join(root, 'package.json');
    writeFileSync(
      manifest,
      JSON.stringify({ version: '1.4.0', dependencies: { 'idb-keyval': '6.3.0' } }),
    );
    const data = loadRecords([record('1.4.0', 4000), record('1.5.0', 5000), manifest]);
    expect(data.version).toBe('1.4.0');
    expect(data.sizes?.version).toBe('1.4.0');
    expect(data.deps).toEqual(['idb-keyval']);
  });
});

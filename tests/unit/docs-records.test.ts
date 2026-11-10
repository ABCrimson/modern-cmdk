import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import { loadRecords, readSearch, readSizes } from '../../apps/docs/.vitepress/theme/data/records';

// The search record: benchmarks/baseline.json (schemaVersion 2) keeps one record per CPU model; the page prints the newest.
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

describe('readSearch', () => {
  function baseline(records: Record<string, { date: string; median: number }>): string {
    const path = join(root, 'baseline.json');
    const entries = Object.entries(records).map(([cpu, { date, median }]) => [
      cpu,
      {
        version: '1.4.0',
        date,
        commit: `commit-${cpu}`,
        environment: { node: 'v28.0.0', cpu, cpuCount: 4 },
        benchmarks: {
          search: { 'ts-scorer-10k': { median_ms: median, p99_ms: 9, target_ms: 16 } },
        },
      },
    ]);
    writeFileSync(
      path,
      JSON.stringify({
        schemaVersion: 2,
        regressionThresholds: {},
        records: Object.fromEntries(entries),
      }),
    );
    return path;
  }

  it('reads the one record of a schemaVersion 2 baseline', () => {
    const search = readSearch(baseline({ 'EPYC 7763': { date: '2026-11-08', median: 3.8 } }));
    expect(search).toEqual({
      medianMs: 3.8,
      cpu: 'EPYC 7763',
      cpuCount: 4,
      node: 'v28.0.0',
      date: '2026-11-08',
      commit: 'commit-EPYC 7763',
    });
  });

  it('takes the newest record when the baseline keeps several CPU models, whatever the key order', () => {
    const search = readSearch(
      baseline({
        'B CPU': { date: '2026-11-09', median: 2 },
        'A CPU': { date: '2026-11-08', median: 1 },
        'C CPU': { date: '2026-11-09', median: 3 },
      }),
    );
    expect(search?.cpu).toBe('B CPU');
    expect(search?.medianMs).toBe(2);
  });

  it('leaves the figure out, with a warning, for the retired single-record shape', () => {
    const path = join(root, 'baseline.json');
    writeFileSync(path, JSON.stringify({ version: '1.2.3', benchmarks: { search: {} } }));
    expect(readSearch(path)).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('lacks a record'));
  });
});

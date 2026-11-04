// tests/unit/bug-matrix.test.ts
// G17 skeleton: every BUG ledger row that 1.3.0 closes maps to the test that proves it.
// A "covered" entry names "path::title"; the file must exist and contain the title string,
// so renaming or deleting a test breaks the matrix instead of silently orphaning the row.

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

interface MatrixEntry {
  readonly id: string;
  readonly test: string | null;
  readonly status: 'covered' | 'pending';
}

interface LedgerRow {
  readonly id: string;
  readonly category: string;
  readonly release: string;
}

const root: string = resolve(import.meta.dirname, '../..');

function readJson<T>(relativePath: string): T {
  return JSON.parse(readFileSync(resolve(root, relativePath), 'utf8')) as T;
}

const matrix: readonly MatrixEntry[] = readJson<readonly MatrixEntry[]>('tests/bug-matrix.json');
const ledger: readonly LedgerRow[] = readJson<{ readonly findings: readonly LedgerRow[] }>(
  'docs/ledger/findings.json',
).findings;

describe('BUG-to-test matrix', () => {
  it('has unique ids and only known statuses', () => {
    const ids = matrix.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const entry of matrix) {
      expect.soft(['covered', 'pending'], entry.id).toContain(entry.status);
      expect.soft(entry.status === 'covered', entry.id).toBe(entry.test !== null);
    }
  });

  it('lists every BUG ledger row that 1.3.0 closes', () => {
    const closing = ledger
      .filter((row) => row.category === 'BUG' && row.release === '1.3.0')
      .map((row) => row.id)
      .toSorted();
    expect(matrix.map((entry) => entry.id).toSorted()).toEqual(closing);
  });

  const covered = matrix.filter(
    (entry): entry is MatrixEntry & { readonly test: string } =>
      entry.status === 'covered' && entry.test !== null,
  );

  it.for(covered)('$id: its test file exists and contains the title', ({ id, test }) => {
    const [file, title] = test.split('::');
    if (!file || !title) throw new Error(`${id}: test must be "path::title", got "${test}"`);
    expect(existsSync(resolve(root, file)), `${id}: ${file} does not exist`).toBe(true);
    expect(
      readFileSync(resolve(root, file), 'utf8'),
      `${id}: title not found in ${file}`,
    ).toContain(title);
  });
});

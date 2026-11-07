// tests/unit/bug-matrix.test.ts
// G17: every FIXED BUG ledger row of 1.3.0, 1.4.0 and 1.5.0 maps to a vitest title ("covered") or to a gate line
// ("gate": a CI step, script or config line), except the ids in PENDING_BY_DECISION below.
// An entry names "path::string"; the file must exist and contain the string exactly once, so renaming or
// deleting the test or gate line breaks the matrix instead of silently orphaning the row.
// A row proved by a fixture-driven suite names its case's expected output or reports file, so deleting the case breaks the matrix.

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Closed rows with no mapped check. DT-03, DT-04, F6, PG-14, RDG-05 and RDG-33 are listed in DECISIONS.md
// G-22 (D46), which re-armed DG-71 and DG-72 through the docs-samples gate (scripts/check-doc-samples.ts,
// TEB-84), so they are no longer listed here. RDG-68 (1.4.0) is named by DECISIONS.md G-32.
const PENDING_BY_DECISION: readonly string[] = [
  'DT-03',
  'DT-04',
  'F6',
  'PG-14',
  'RDG-05',
  'RDG-33',
  // 1.4.0: the labels are remote repository state (D53) that nothing in the repository proves.
  'RDG-68',
];

interface MatrixEntry {
  readonly id: string;
  readonly test: string | null;
  readonly status: 'covered' | 'gate' | 'pending';
}

interface LedgerRow {
  readonly id: string;
  readonly category: string;
  readonly release: string;
  readonly status: string;
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
      expect.soft(['covered', 'gate', 'pending'], entry.id).toContain(entry.status);
      expect.soft(entry.status !== 'pending', entry.id).toBe(entry.test !== null);
    }
  });

  it('lists every BUG ledger row that 1.3.0, 1.4.0 and 1.5.0 close', () => {
    const closing = ledger
      .filter((row) => row.category === 'BUG' && ['1.3.0', '1.4.0', '1.5.0'].includes(row.release))
      .map((row) => row.id)
      .toSorted();
    expect(matrix.map((entry) => entry.id).toSorted()).toEqual(closing);
  });

  it('no FIXED ledger row is still pending in the matrix', () => {
    const fixed = new Set(ledger.filter((row) => row.status === 'FIXED').map((row) => row.id));
    expect(
      matrix
        .filter(
          (entry) =>
            entry.status === 'pending' &&
            fixed.has(entry.id) &&
            !PENDING_BY_DECISION.includes(entry.id),
        )
        .map((entry) => entry.id),
    ).toEqual([]);
  });

  it('every PENDING_BY_DECISION id is a FIXED row still pending in the matrix', () => {
    const fixed = new Set(ledger.filter((row) => row.status === 'FIXED').map((row) => row.id));
    const pending = new Set(
      matrix.filter((entry) => entry.status === 'pending').map((entry) => entry.id),
    );
    expect(PENDING_BY_DECISION.filter((id) => !fixed.has(id) || !pending.has(id))).toEqual([]);
  });

  const covered = matrix.filter(
    (entry): entry is MatrixEntry & { readonly test: string } =>
      entry.status !== 'pending' && entry.test !== null,
  );

  it.for(covered)(
    '$id: its test or gate file exists and contains the string exactly once',
    ({ id, test }) => {
      const [file, title] = test.split('::');
      if (!file || !title) throw new Error(`${id}: test must be "path::string", got "${test}"`);
      expect(existsSync(resolve(root, file)), `${id}: ${file} does not exist`).toBe(true);
      const text = readFileSync(resolve(root, file), 'utf8');
      expect(text, `${id}: string not found in ${file}`).toContain(title);
      expect(text.split(title).length - 1, `${id}: string not unique in ${file}`).toBe(1);
    },
  );
});

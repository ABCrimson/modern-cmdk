#!/usr/bin/env node
// Coverage ratchet: coverage-thresholds.json may only go up relative to the base branch.
// Usage: node scripts/coverage-ratchet.mjs [--base <file>]
// Without --base the base is `git show origin/main:coverage-thresholds.json`.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

const METRICS = ['lines', 'functions', 'branches', 'statements'];
const { values } = parseArgs({ options: { base: { type: 'string' } } });

const current = JSON.parse(readFileSync('coverage-thresholds.json', 'utf8'));

let baseText;
if (values.base) {
  baseText = readFileSync(values.base, 'utf8');
} else {
  try {
    baseText = execFileSync('git', ['show', 'origin/main:coverage-thresholds.json'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    const stderr = String(error.stderr ?? '');
    // Only "the file is not on main" is first adoption; any other git failure is real.
    if (/does not exist in|exists on disk, but not in/.test(stderr)) {
      process.stdout.write('no thresholds on main yet: first adoption\n');
      process.exit(0);
    }
    process.stderr.write(`cannot read origin/main:coverage-thresholds.json: ${stderr.trim()}\n`);
    process.exit(2);
  }
}

const base = JSON.parse(baseText);
const failures = METRICS.filter((m) => typeof base[m] === 'number' && !(current[m] >= base[m]));
for (const m of failures) {
  process.stderr.write(
    `coverage ratchet: ${m} threshold ${current[m]} is lower than main's ${base[m]}\n`,
  );
}
if (failures.length > 0) process.exit(1);
process.stdout.write(
  `coverage ratchet: ok (${METRICS.map((m) => `${m} ${current[m]}`).join(', ')})\n`,
);

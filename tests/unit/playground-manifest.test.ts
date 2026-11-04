// tests/unit/playground-manifest.test.ts
// PG-16 / PG-17: the playground manifest declares what its sources import, and nothing else.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repo = resolve(import.meta.dirname, '../..');
interface Manifest {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}
const read = (p: string): Manifest =>
  JSON.parse(readFileSync(resolve(repo, p), 'utf8')) as Manifest;
const playground = read('apps/playground/package.json');
const core = read('packages/modern-cmdk/package.json');

describe('playground manifest', () => {
  it('does not declare the unused @js-temporal/polyfill', () => {
    expect(playground.dependencies?.['@js-temporal/polyfill']).toBeUndefined();
    expect(playground.devDependencies?.['@js-temporal/polyfill']).toBeUndefined();
  });

  it('declares radix-ui at the modern-cmdk devDependency pin', () => {
    const pin = core.devDependencies?.['radix-ui'];
    expect(pin).toBeTruthy();
    expect(playground.dependencies?.['radix-ui']).toBe(pin);
  });
});

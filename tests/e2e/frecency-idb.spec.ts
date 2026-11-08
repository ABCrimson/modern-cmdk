// tests/e2e/frecency-idb.spec.ts
// CE-112, D108: IdbFrecencyStorage from the BUILT core (packages/modern-cmdk/dist/core/index.mjs) in Chromium.
// The page does not use the playground: page.route fulfils an HTML page on http://cmdk.test/ and serves the built
// core and its one dependency, idb-keyval's ESM file, from disk through an import map. Needs `pnpm build` first.
//
// Each storage opens its database per operation (openStore in src/core/frecency/idb-storage.ts), so storages created
// in one tick race to open the same database name; the unit test in tests/unit/frecency-idb.test.ts runs the same
// scenario in happy-dom's IndexedDB, this spec runs it against Chromium's.

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { expect, test } from '@playwright/test';

const ORIGIN = 'http://cmdk.test';
const coreFile: string = resolve(
  import.meta.dirname,
  '../../packages/modern-cmdk/dist/core/index.mjs',
);
// idb-keyval is a dependency of packages/modern-cmdk: resolve it from there, as the built core would. require.resolve
// picks the "default" (CommonJS) export condition, so the ESM file ("import" condition) is its sibling index.js.
const idbKeyvalFile: string = resolve(
  dirname(
    createRequire(resolve(import.meta.dirname, '../../packages/modern-cmdk/package.json')).resolve(
      'idb-keyval',
    ),
  ),
  'index.js',
);

const PAGE = `<!doctype html>
<meta charset="utf-8">
<title>CE-112</title>
<script type="importmap">
{ "imports": { "modern-cmdk": "${ORIGIN}/core.mjs", "idb-keyval": "${ORIGIN}/idb-keyval.mjs" } }
</script>
<script type="module">
  import * as core from 'modern-cmdk';
  globalThis.core = core;
</script>`;

/** The slice of the built core the page script uses, read from `globalThis.core` in the page. */
interface PageStorage {
  save(namespace: string, data: { readonly records: ReadonlyMap<string, unknown> }): Promise<void>;
  load(namespace: string): Promise<{ readonly records: ReadonlyMap<string, unknown> }>;
  [Symbol.dispose](): void;
}
interface PageCore {
  readonly IdbFrecencyStorage: new (dbName: string, storeName: string) => PageStorage;
  readonly itemId: (id: string) => string;
}

const MODULE_HEADERS = { 'content-type': 'text/javascript; charset=utf-8' } as const;

/** What one round reports: the records each storage read back, as `[id, frequency, lastUsed]` rows per storage. */
interface Round {
  readonly label: string;
  readonly expected: readonly (readonly (readonly [string, number, number])[])[];
  readonly viaSaving: readonly (readonly (readonly [string, number, number])[])[];
  readonly viaFresh: readonly (readonly (readonly [string, number, number])[])[];
}

test.describe('CE-112: IdbFrecencyStorage in Chromium', () => {
  test.beforeEach(async ({ page }) => {
    await page.route(`${ORIGIN}/**`, async (route) => {
      const { pathname } = new URL(route.request().url());
      if (pathname === '/core.mjs') {
        await route.fulfill({ body: readFileSync(coreFile), headers: MODULE_HEADERS });
      } else if (pathname === '/idb-keyval.mjs') {
        await route.fulfill({ body: readFileSync(idbKeyvalFile), headers: MODULE_HEADERS });
      } else {
        await route.fulfill({ body: PAGE, contentType: 'text/html; charset=utf-8' });
      }
    });
    await page.goto(`${ORIGIN}/`);
    await page.waitForFunction(() => 'core' in globalThis);
  });

  test('CE-112: three frecency storages on one database name opened in one tick all save and load in Chromium', async ({
    page,
  }) => {
    const rounds = await page.evaluate(async (): Promise<readonly Round[]> => {
      const { IdbFrecencyStorage, itemId } = (globalThis as unknown as { core: PageCore }).core;
      const names = ['one', 'two', 'three'] as const;
      type Rows = readonly (readonly [string, number, number])[];
      const rowsOf = (data: { readonly records: ReadonlyMap<string, unknown> }): Rows =>
        [...data.records].map(([id, record]) => {
          const { frequency, lastUsed } = record as { frequency: number; lastUsed: number };
          return [id, frequency, lastUsed] as const;
        });
      const dataFor = (
        round: number,
        i: number,
      ): { readonly records: ReadonlyMap<string, unknown> } => ({
        records: new Map([
          [itemId(`r${round}-${names[i]}`), { frequency: i + 1, lastUsed: 10 * (i + 1) }],
        ]),
      });
      const expectedFor = (round: number): readonly Rows[] =>
        names.map((name, i) => [[`r${round}-${name}`, i + 1, 10 * (i + 1)] as const]);
      const nextMacrotask = (): Promise<void> => new Promise((done) => setTimeout(done, 0));

      const results: Round[] = [];
      // Round 0 opens all three in one tick; round 1 staggers the opens by a macrotask; round 2 repeats round 0.
      for (const [round, label] of [
        [0, 'same tick'],
        [1, 'staggered by a macrotask'],
        [2, 'same tick, third database'],
      ] as const) {
        const db = `ce112-${round}-${Date.now()}`;
        const storages = names.map((name) => new IdbFrecencyStorage(db, name));
        const fresh: PageStorage[] = [];
        try {
          if (label === 'staggered by a macrotask') {
            for (const [i, storage] of storages.entries()) {
              await storage.save('ns', dataFor(round, i));
              await nextMacrotask();
            }
          } else {
            await Promise.all(storages.map((storage, i) => storage.save('ns', dataFor(round, i))));
          }
          const viaSaving = await Promise.all(storages.map((storage) => storage.load('ns')));
          for (const name of names) fresh.push(new IdbFrecencyStorage(db, name));
          const viaFresh = await Promise.all(fresh.map((storage) => storage.load('ns')));
          results.push({
            label,
            expected: expectedFor(round),
            viaSaving: viaSaving.map(rowsOf),
            viaFresh: viaFresh.map(rowsOf),
          });
        } finally {
          for (const storage of [...storages, ...fresh]) storage[Symbol.dispose]();
        }
      }
      return results;
    });

    expect(rounds).toHaveLength(3);
    for (const round of rounds) {
      expect(round.viaSaving, `${round.label}: loaded through the saving storages`).toEqual(
        round.expected,
      );
      expect(
        round.viaFresh,
        `${round.label}: loaded through fresh storages on the same name`,
      ).toEqual(round.expected);
    }
  });
});

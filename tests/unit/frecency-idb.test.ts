import { createStore, get, set } from 'idb-keyval';
import type { FrecencyData, FrecencyRecord, ItemId } from 'modern-cmdk';
import { IdbFrecencyStorage, itemId } from 'modern-cmdk';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Each test gets a unique DB name to avoid cross-test contamination
let dbCounter = 0;
function uniqueDb(): string {
  return `test-db-${++dbCounter}-${Date.now()}`;
}

// Each test uses a unique DB name (uniqueDb), so the default within-file
// sequential execution is all these IDB tests need (no shared cross-test state).
describe('IdbFrecencyStorage', () => {
  describe('load', () => {
    it('should return empty data for a new namespace', async () => {
      using storage = new IdbFrecencyStorage(uniqueDb());
      const data = await storage.load('test-ns');

      expect(data.records).toBeInstanceOf(Map);
      expect(data.records.size).toBe(0);
    });

    it('should return empty data when disposed although the namespace holds a row', async () => {
      const db = uniqueDb();
      await using live = new IdbFrecencyStorage(db);
      await live.save('test-ns', {
        records: new Map([[itemId('stored'), { frequency: 1, lastUsed: Date.now() }]]),
      });
      const disposed = new IdbFrecencyStorage(db);
      disposed[Symbol.dispose]();

      expect((await disposed.load('test-ns')).records.size).toBe(0);
      expect((await live.load('test-ns')).records.size).toBe(1);
    });
  });

  describe('save and load round-trip', () => {
    it('should persist and reload frecency data', async () => {
      const db = uniqueDb();
      using storage = new IdbFrecencyStorage(db);
      const now = Date.now();

      const records = new Map<ItemId, FrecencyRecord>([
        [itemId('cmd-copy'), { frequency: 5, lastUsed: now }],
        [itemId('cmd-paste'), { frequency: 3, lastUsed: now - 2 * 3_600_000 }],
      ]);
      const data: FrecencyData = { records };

      await storage.save('my-app', data);
      const loaded = await storage.load('my-app');

      expect(loaded.records.size).toBe(2);

      const copyRecord = loaded.records.get(itemId('cmd-copy'));
      expect(copyRecord).toBeDefined();
      expect(copyRecord?.frequency).toBe(5);
      expect(copyRecord?.lastUsed).toBe(now);

      const pasteRecord = loaded.records.get(itemId('cmd-paste'));
      expect(pasteRecord).toBeDefined();
      expect(pasteRecord?.frequency).toBe(3);
    });
  });

  describe('namespace isolation', () => {
    it('should isolate data between different namespaces', async () => {
      using storage = new IdbFrecencyStorage(uniqueDb());
      const now = Date.now();

      const dataA: FrecencyData = {
        records: new Map<ItemId, FrecencyRecord>([
          [itemId('item-a'), { frequency: 10, lastUsed: now }],
        ]),
      };

      const dataB: FrecencyData = {
        records: new Map<ItemId, FrecencyRecord>([
          [itemId('item-b'), { frequency: 20, lastUsed: now }],
        ]),
      };

      await storage.save('app-one', dataA);
      await storage.save('app-two', dataB);

      const loadedA = await storage.load('app-one');
      const loadedB = await storage.load('app-two');

      // Vitest — soft assertions to report all isolation failures at once
      expect.soft(loadedA.records.size).toBe(1);
      expect.soft(loadedA.records.has(itemId('item-a'))).toBe(true);
      expect.soft(loadedA.records.has(itemId('item-b'))).toBe(false);

      expect.soft(loadedB.records.size).toBe(1);
      expect.soft(loadedB.records.has(itemId('item-b'))).toBe(true);
      expect.soft(loadedB.records.has(itemId('item-a'))).toBe(false);
    });
  });

  describe('timestamp serialization', () => {
    it('should correctly serialize and deserialize epoch-ms timestamps', async () => {
      using storage = new IdbFrecencyStorage(uniqueDb());
      const precise = 1_709_251_200_123; // epoch ms

      await storage.save('timestamp-test', {
        records: new Map<ItemId, FrecencyRecord>([
          [itemId('precise'), { frequency: 1, lastUsed: precise }],
        ]),
      });

      const loaded = await storage.load('timestamp-test');
      const record = loaded.records.get(itemId('precise'));

      expect(record).toBeDefined();
      expect(record?.lastUsed).toBe(1_709_251_200_123);
    });

    it('should handle timestamp at epoch zero', async () => {
      using storage = new IdbFrecencyStorage(uniqueDb());
      const epoch = 0;

      await storage.save('epoch', {
        records: new Map([[itemId('zero'), { frequency: 1, lastUsed: epoch }]]),
      });

      const loaded = await storage.load('epoch');
      const record = loaded.records.get(itemId('zero'));
      expect(record?.lastUsed).toBe(0);
    });
  });

  describe('Disposable cleanup', () => {
    it('should implement Symbol.asyncDispose', async () => {
      const db = uniqueDb();
      await using live = new IdbFrecencyStorage(db);
      await live.save('kept-ns', {
        records: new Map([[itemId('kept'), { frequency: 2, lastUsed: 1 }]]),
      });
      const storage = new IdbFrecencyStorage(db);
      await expect(storage[Symbol.asyncDispose]()).resolves.toBeUndefined();

      expect((await storage.load('kept-ns')).records.size).toBe(0);
      await storage.save('post-dispose', {
        records: new Map([[itemId('x'), { frequency: 1, lastUsed: 1 }]]),
      });
      await storage.delete('kept-ns');
      // the asyncDisposed instance wrote nothing and deleted nothing
      expect((await live.load('post-dispose')).records.size).toBe(0);
      expect((await live.load('kept-ns')).records.get(itemId('kept'))?.frequency).toBe(2);
    });

    it('should work with using declaration', async () => {
      const db = uniqueDb();
      let loadedInside: FrecencyData | undefined;
      let ref: IdbFrecencyStorage | undefined;

      {
        using storage = new IdbFrecencyStorage(db);
        ref = storage;
        const now = Date.now();

        await storage.save('dispose-test', {
          records: new Map([[itemId('d'), { frequency: 1, lastUsed: now }]]),
        });

        loadedInside = await storage.load('dispose-test');
      }

      expect(loadedInside?.records.size).toBe(1);
      // TUB-72: leaving the block disposed the instance, so it no longer reads the stored row
      expect((await ref?.load('dispose-test'))?.records.size).toBe(0);
    });

    it('should no-op operations after dispose', async () => {
      const db = uniqueDb();
      const kept = new Map([[itemId('kept'), { frequency: 2, lastUsed: Date.now() }]]);
      await using live = new IdbFrecencyStorage(db);
      await live.save('kept-ns', { records: kept });
      const storage = new IdbFrecencyStorage(db);
      storage[Symbol.dispose]();

      await expect(
        storage.save('post-dispose', {
          records: new Map([[itemId('x'), { frequency: 1, lastUsed: Date.now() }]]),
        }),
      ).resolves.toBeUndefined();
      await expect(storage.delete('kept-ns')).resolves.toBeUndefined();

      expect((await storage.load('kept-ns')).records.size).toBe(0);
      // the disposed instance wrote nothing and deleted nothing
      expect((await live.load('post-dispose')).records.size).toBe(0);
      expect((await live.load('kept-ns')).records.get(itemId('kept'))?.frequency).toBe(2);
    });
  });

  describe('delete', () => {
    it('should remove data for a specific namespace', async () => {
      using storage = new IdbFrecencyStorage(uniqueDb());
      const now = Date.now();

      await storage.save('to-delete', {
        records: new Map([[itemId('gone'), { frequency: 5, lastUsed: now }]]),
      });

      const before = await storage.load('to-delete');
      expect(before.records.size).toBe(1);

      await storage.delete('to-delete');

      const after = await storage.load('to-delete');
      expect(after.records.size).toBe(0);
    });
  });

  describe('edge cases', () => {
    it('should handle empty records map', async () => {
      using storage = new IdbFrecencyStorage(uniqueDb());

      await storage.save('empty', { records: new Map() });
      const loaded = await storage.load('empty');

      expect(loaded.records.size).toBe(0);
    });

    it('should handle overwriting existing data', async () => {
      using storage = new IdbFrecencyStorage(uniqueDb());
      const now = Date.now();

      await storage.save('overwrite', {
        records: new Map([[itemId('a'), { frequency: 1, lastUsed: now }]]),
      });

      await storage.save('overwrite', {
        records: new Map([[itemId('b'), { frequency: 2, lastUsed: now }]]),
      });

      const loaded = await storage.load('overwrite');
      expect(loaded.records.size).toBe(1);
      expect(loaded.records.has(itemId('a'))).toBe(false);
      expect(loaded.records.has(itemId('b'))).toBe(true);
      expect(loaded.records.get(itemId('b'))?.frequency).toBe(2);
    });
  });

  // Raw-payload helpers: plant and read the persisted value under the storage key
  // with idb-keyval's own store, bypassing IdbFrecencyStorage.
  const plant = (db: string, namespace: string, value: unknown): Promise<void> =>
    set(`frecency:${namespace}`, value, createStore(db, 'frecency'));
  const row = (id: unknown, frequency: unknown, lastUsedMs: unknown): unknown[] => [
    id,
    { frequency, lastUsedMs },
  ];

  afterEach((): void => {
    vi.restoreAllMocks();
  });

  describe('persisted-data validation', () => {
    it('SEC-26: drops invalid rows, keeps valid ones and warns once with the dropped count', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const db = uniqueDb();
      await plant(db, 'ns', {
        records: [
          row('ok', 2, 1_700_000_000_000),
          row('zero', 0, 0),
          row('nan', Number.NaN, 1),
          row('inf', Number.POSITIVE_INFINITY, 1),
          row('neg-frequency', -1, 1),
          row('neg-last-used', 1, -5),
          row('string-number', '3', 1),
          row('missing-field', 1, undefined),
          ['null-record', null],
          'not-an-array-row',
          row(42, 1, 1),
        ],
      });

      using storage = new IdbFrecencyStorage(db);
      const loaded = await storage.load('ns');

      expect([...loaded.records.keys()]).toEqual([itemId('ok'), itemId('zero')]);
      expect(loaded.records.get(itemId('ok'))).toEqual({
        frequency: 2,
        lastUsed: 1_700_000_000_000,
      });
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0]?.[1]).toBe(9);
    });

    it.each([
      ['records is not an array', { records: 'nope' }],
      ['payload is a string', 'corrupt'],
      ['payload is null', null],
      ['payload is a number', 7],
      ['version is 3', { version: 3, records: [row('a', 1, 1)] }],
    ])('SEC-26: %s -> empty data, no throw, one warning', async (_label, payload) => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const db = uniqueDb();
      await plant(db, 'ns', payload);

      using storage = new IdbFrecencyStorage(db);
      const loaded = await storage.load('ns');

      expect(loaded.records.size).toBe(0);
      expect(warn).toHaveBeenCalledTimes(1);
    });

    it('CE-60: a valid v1 payload (no version field) loads without a warning', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const db = uniqueDb();
      await plant(db, 'ns', { records: [row('a', 4, 100), row('b', 1, 200)] });

      using storage = new IdbFrecencyStorage(db);
      const loaded = await storage.load('ns');

      expect(loaded.records.get(itemId('a'))).toEqual({ frequency: 4, lastUsed: 100 });
      expect(loaded.records.get(itemId('b'))).toEqual({ frequency: 1, lastUsed: 200 });
      expect(warn).not.toHaveBeenCalled();
    });

    it('CE-60: a valid v2 payload { version: 2, records } loads the same as v1', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const db = uniqueDb();
      await plant(db, 'ns', { version: 2, records: [row('a', 4, 100), row('b', 1, 200)] });

      using storage = new IdbFrecencyStorage(db);
      const loaded = await storage.load('ns');

      expect([...loaded.records]).toEqual([
        [itemId('a'), { frequency: 4, lastUsed: 100 }],
        [itemId('b'), { frequency: 1, lastUsed: 200 }],
      ]);
      expect(warn).not.toHaveBeenCalled();
    });

    it('SEC-26: save still writes the v1 shape (no version key)', async () => {
      const db = uniqueDb();
      using storage = new IdbFrecencyStorage(db);
      await storage.save('ns', {
        records: new Map([[itemId('a'), { frequency: 1, lastUsed: 5 }]]),
      });

      const raw = await get('frecency:ns', createStore(db, 'frecency'));

      expect(raw).toEqual({ records: [['a', { frequency: 1, lastUsedMs: 5 }]] });
      expect(raw).not.toHaveProperty('version');
    });
  });

  describe('multiple stores in one database', () => {
    it('SEC-35: a second storeName in an existing database saves and loads, and the first keeps its data', async () => {
      const db = uniqueDb();
      const dataA: FrecencyData = {
        records: new Map([[itemId('in-a'), { frequency: 1, lastUsed: 10 }]]),
      };
      const dataB: FrecencyData = {
        records: new Map([[itemId('in-b'), { frequency: 2, lastUsed: 20 }]]),
      };

      using a = new IdbFrecencyStorage(db, 'a');
      await a.save('ns', dataA);

      using b = new IdbFrecencyStorage(db, 'b');
      await b.save('ns', dataB);
      expect((await b.load('ns')).records.get(itemId('in-b'))).toEqual({
        frequency: 2,
        lastUsed: 20,
      });
      expect((await b.load('ns')).records.has(itemId('in-a'))).toBe(false);

      expect((await a.load('ns')).records.get(itemId('in-a'))).toEqual({
        frequency: 1,
        lastUsed: 10,
      });

      using freshA = new IdbFrecencyStorage(db, 'a');
      expect((await freshA.load('ns')).records.get(itemId('in-a'))).toEqual({
        frequency: 1,
        lastUsed: 10,
      });
    });

    it('CE-112: three storages on one database name opened in one tick all save and load', async () => {
      const db = uniqueDb();
      const names = ['one', 'two', 'three'];
      const storages = names.map((name) => new IdbFrecencyStorage(db, name));
      try {
        // All three open the database in the same tick: each must create its own store
        await Promise.all(
          storages.map((storage, i) =>
            storage.save('ns', {
              records: new Map([
                [itemId(`in-${names[i]}`), { frequency: i + 1, lastUsed: 10 * (i + 1) }],
              ]),
            }),
          ),
        );
        const loaded = await Promise.all(storages.map((storage) => storage.load('ns')));
        expect(loaded.map((data) => [...data.records])).toEqual(
          names.map((name, i) => [
            [itemId(`in-${name}`), { frequency: i + 1, lastUsed: 10 * (i + 1) }],
          ]),
        );
      } finally {
        for (const storage of storages) storage[Symbol.dispose]();
      }
    });
  });

  describe('cross-instance persistence', () => {
    it('TUB-24: data saved by one instance is loaded by a new instance on the same database after dispose', async () => {
      const db = uniqueDb();
      const records = new Map<ItemId, FrecencyRecord>([
        [itemId('x'), { frequency: 3, lastUsed: 30 }],
        [itemId('y'), { frequency: 7, lastUsed: 70 }],
      ]);

      const first = new IdbFrecencyStorage(db);
      await first.save('ns', { records });
      await first[Symbol.asyncDispose]();

      using second = new IdbFrecencyStorage(db);
      const loaded = await second.load('ns');

      expect([...loaded.records]).toEqual([...records]);
    });
  });
});

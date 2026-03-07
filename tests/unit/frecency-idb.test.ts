import { describe, it, expect, beforeEach } from 'vitest';
import { IdbFrecencyStorage } from '@crimson_dev/command';
import { itemId } from '@crimson_dev/command';
import type { FrecencyData, FrecencyRecord, ItemId } from '@crimson_dev/command';

// Each test gets a unique DB name to avoid cross-test contamination
let dbCounter = 0;
function uniqueDb(): string {
  return `test-db-${++dbCounter}-${Date.now()}`;
}

describe('IdbFrecencyStorage', () => {
  describe('load', () => {
    it('should return empty data for a new namespace', async () => {
      using storage = new IdbFrecencyStorage(uniqueDb());
      const data = await storage.load('test-ns');

      expect(data.records).toBeInstanceOf(Map);
      expect(data.records.size).toBe(0);
    });

    it('should return empty data when disposed', async () => {
      const storage = new IdbFrecencyStorage(uniqueDb());
      storage[Symbol.dispose]();

      const data = await storage.load('test-ns');
      expect(data.records.size).toBe(0);
    });
  });

  describe('save and load round-trip', () => {
    it('should persist and reload frecency data', async () => {
      const db = uniqueDb();
      using storage = new IdbFrecencyStorage(db);
      const now = Temporal.Now.instant();

      const records = new Map<ItemId, FrecencyRecord>([
        [itemId('cmd-copy'), { frequency: 5, lastUsed: now }],
        [itemId('cmd-paste'), { frequency: 3, lastUsed: now.subtract({ hours: 2 }) }],
      ]);
      const data: FrecencyData = { records };

      await storage.save('my-app', data);
      const loaded = await storage.load('my-app');

      expect(loaded.records.size).toBe(2);

      const copyRecord = loaded.records.get(itemId('cmd-copy'));
      expect(copyRecord).toBeDefined();
      expect(copyRecord!.frequency).toBe(5);
      expect(copyRecord!.lastUsed.equals(now)).toBe(true);

      const pasteRecord = loaded.records.get(itemId('cmd-paste'));
      expect(pasteRecord).toBeDefined();
      expect(pasteRecord!.frequency).toBe(3);
    });

    it('should handle single-item data', async () => {
      using storage = new IdbFrecencyStorage(uniqueDb());
      const instant = Temporal.Instant.fromEpochNanoseconds(1_700_000_000_000_000_000n);

      const records = new Map<ItemId, FrecencyRecord>([
        [itemId('solo'), { frequency: 1, lastUsed: instant }],
      ]);

      await storage.save('ns', { records });
      const loaded = await storage.load('ns');

      expect(loaded.records.size).toBe(1);
      const record = loaded.records.get(itemId('solo'));
      expect(record!.lastUsed.epochNanoseconds).toBe(1_700_000_000_000_000_000n);
    });
  });

  describe('namespace isolation', () => {
    it('should isolate data between different namespaces', async () => {
      using storage = new IdbFrecencyStorage(uniqueDb());
      const now = Temporal.Now.instant();

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

      expect(loadedA.records.size).toBe(1);
      expect(loadedA.records.has(itemId('item-a'))).toBe(true);
      expect(loadedA.records.has(itemId('item-b'))).toBe(false);

      expect(loadedB.records.size).toBe(1);
      expect(loadedB.records.has(itemId('item-b'))).toBe(true);
      expect(loadedB.records.has(itemId('item-a'))).toBe(false);
    });
  });

  describe('Temporal.Instant serialization', () => {
    it('should correctly serialize and deserialize via epochNanoseconds', async () => {
      using storage = new IdbFrecencyStorage(uniqueDb());
      const precise = Temporal.Instant.fromEpochNanoseconds(1_709_251_200_123_456_789n);

      await storage.save('temporal-test', {
        records: new Map<ItemId, FrecencyRecord>([
          [itemId('precise'), { frequency: 1, lastUsed: precise }],
        ]),
      });

      const loaded = await storage.load('temporal-test');
      const record = loaded.records.get(itemId('precise'));

      expect(record).toBeDefined();
      expect(record!.lastUsed.epochNanoseconds).toBe(1_709_251_200_123_456_789n);
      expect(record!.lastUsed.equals(precise)).toBe(true);
    });

    it('should handle Temporal.Instant at epoch zero', async () => {
      using storage = new IdbFrecencyStorage(uniqueDb());
      const epoch = Temporal.Instant.fromEpochNanoseconds(0n);

      await storage.save('epoch', {
        records: new Map([[itemId('zero'), { frequency: 1, lastUsed: epoch }]]),
      });

      const loaded = await storage.load('epoch');
      const record = loaded.records.get(itemId('zero'));
      expect(record!.lastUsed.epochNanoseconds).toBe(0n);
    });
  });

  describe('Disposable cleanup', () => {
    it('should implement Symbol.dispose', () => {
      const storage = new IdbFrecencyStorage(uniqueDb());
      expect(typeof storage[Symbol.dispose]).toBe('function');
      storage[Symbol.dispose]();
    });

    it('should implement Symbol.asyncDispose', async () => {
      const storage = new IdbFrecencyStorage(uniqueDb());
      expect(typeof storage[Symbol.asyncDispose]).toBe('function');
      await storage[Symbol.asyncDispose]();
    });

    it('should work with using declaration', async () => {
      const db = uniqueDb();
      let loadedOutside: FrecencyData | undefined;

      {
        using storage = new IdbFrecencyStorage(db);
        const now = Temporal.Now.instant();

        await storage.save('dispose-test', {
          records: new Map([[itemId('d'), { frequency: 1, lastUsed: now }]]),
        });

        loadedOutside = await storage.load('dispose-test');
      }

      expect(loadedOutside!.records.size).toBe(1);
    });

    it('should reject operations after dispose', async () => {
      const storage = new IdbFrecencyStorage(uniqueDb());
      storage[Symbol.dispose]();

      await storage.save('post-dispose', {
        records: new Map([[itemId('x'), { frequency: 1, lastUsed: Temporal.Now.instant() }]]),
      });

      const data = await storage.load('post-dispose');
      expect(data.records.size).toBe(0);
    });
  });

  describe('delete', () => {
    it('should remove data for a specific namespace', async () => {
      using storage = new IdbFrecencyStorage(uniqueDb());
      const now = Temporal.Now.instant();

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
      const now = Temporal.Now.instant();

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
      expect(loaded.records.get(itemId('b'))!.frequency).toBe(2);
    });
  });
});

import type { FrecencyData, FrecencyOptions, FrecencyStorage } from 'modern-cmdk';
import { FrecencyEngine, IdbFrecencyStorage, itemId, MemoryFrecencyStorage } from 'modern-cmdk';
import type { Mock } from 'vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const A = itemId('a');
const B = itemId('b');
const C = itemId('c');

const empty = (): FrecencyData => ({ records: new Map() });

/** A vi.fn-backed storage whose calls the tests assert on. */
interface MockStorage {
  load: Mock<FrecencyStorage['load']>;
  save: Mock<FrecencyStorage['save']>;
  [Symbol.dispose]: Mock<() => void>;
}

function makeStorage(): MockStorage {
  return {
    load: vi.fn<FrecencyStorage['load']>(empty),
    save: vi.fn<FrecencyStorage['save']>(async () => {}),
    [Symbol.dispose]: vi.fn<() => void>(),
  };
}

const engines: FrecencyEngine[] = [];
function makeEngine(options: FrecencyOptions = {}): FrecencyEngine {
  const engine = new FrecencyEngine(options);
  engines.push(engine);
  return engine;
}

/**
 * An engine that created its storage: it gets no `storage` option, so it builds a
 * MemoryFrecencyStorage, whose methods the mock stands in for on the prototype.
 */
function installOwnedStorage(storage: MockStorage): void {
  vi.spyOn(MemoryFrecencyStorage.prototype, 'load').mockImplementation(
    storage.load as (namespace: string) => FrecencyData, // the engine awaits a promise as well
  );
  vi.spyOn(MemoryFrecencyStorage.prototype, 'save').mockImplementation(storage.save);
  vi.spyOn(MemoryFrecencyStorage.prototype, Symbol.dispose).mockImplementation(
    storage[Symbol.dispose],
  );
}

function makeOwningEngine(storage: MockStorage): FrecencyEngine {
  installOwnedStorage(storage);
  return makeEngine();
}

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  for (const engine of engines.splice(0)) engine[Symbol.dispose]();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const tick = (): Promise<unknown> => vi.advanceTimersByTimeAsync(0);

describe('FrecencyEngine debounced save', () => {
  it('SEC-02: three selections at 0/400/800 ms give one save at 1800 ms with all three counted', async () => {
    const storage = makeStorage();
    const engine = makeEngine({ storage });

    engine.recordSelection(A);
    await vi.advanceTimersByTimeAsync(400);
    engine.recordSelection(B);
    await vi.advanceTimersByTimeAsync(400);
    engine.recordSelection(A);

    await vi.advanceTimersByTimeAsync(999);
    expect(storage.save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);

    expect(storage.save).toHaveBeenCalledTimes(1);
    const [namespace, data] = storage.save.mock.calls[0] ?? [];
    expect(namespace).toBe('default');
    expect(data?.records.get(A)?.frequency).toBe(2);
    expect(data?.records.get(B)?.frequency).toBe(1);

    await vi.advanceTimersByTimeAsync(5000);
    expect(storage.save).toHaveBeenCalledTimes(1);
  });

  it('SEC-02: nothing recorded means no save', async () => {
    const storage = makeStorage();
    makeEngine({ storage });

    await vi.advanceTimersByTimeAsync(5000);

    expect(storage.save).not.toHaveBeenCalled();
  });

  it('SEC-02: a save that rejects on the timer is reported once through console.warn', async () => {
    const storage = makeStorage();
    const failure = new Error('quota');
    storage.save.mockRejectedValue(failure);
    const engine = makeEngine({ storage });

    engine.recordSelection(A);
    await vi.advanceTimersByTimeAsync(1000);

    expect(storage.save).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toEqual(expect.stringContaining('[modern-cmdk]'));
    expect(warn.mock.calls[0]?.[1]).toBe(failure);
  });
});

describe('FrecencyEngine flush', () => {
  it('TUB-23: flush saves once when dirty and not when clean', async () => {
    const storage = makeStorage();
    const engine = makeEngine({ storage });

    await engine.flush();
    expect(storage.save).not.toHaveBeenCalled();

    engine.recordSelection(A);
    await engine.flush();
    await engine.flush();
    expect(storage.save).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(2000);
    expect(storage.save).toHaveBeenCalledTimes(1);
  });

  it('TUB-23: a save that rejects leaves the engine dirty and the next flush retries', async () => {
    const storage = makeStorage();
    const failure = new Error('offline');
    storage.save.mockRejectedValueOnce(failure);
    const engine = makeEngine({ storage });

    engine.recordSelection(A);
    await expect(engine.flush()).rejects.toBe(failure);
    await engine.flush();

    expect(storage.save).toHaveBeenCalledTimes(2);
  });

  it('TUB-23: a selection recorded while a save is pending is saved by the following flush', async () => {
    const storage = makeStorage();
    const pending = Promise.withResolvers<void>();
    storage.save.mockReturnValueOnce(pending.promise);
    const engine = makeEngine({ storage });

    engine.recordSelection(A);
    const first = engine.flush();
    engine.recordSelection(B);
    pending.resolve();
    await first;
    await engine.flush();

    expect(storage.save).toHaveBeenCalledTimes(2);
  });
});

describe('FrecencyEngine page lifecycle', () => {
  it('SEC-02: pagehide saves and cancels the pending timer', async () => {
    const storage = makeStorage();
    const engine = makeEngine({ storage });

    engine.recordSelection(A);
    window.dispatchEvent(new Event('pagehide'));
    await tick();
    expect(storage.save).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(2000);
    expect(storage.save).toHaveBeenCalledTimes(1);
  });

  it('SEC-02: visibilitychange to hidden saves and to visible does not', async () => {
    const storage = makeStorage();
    const engine = makeEngine({ storage });
    const state = vi.spyOn(document, 'hidden', 'get');

    engine.recordSelection(A);
    state.mockReturnValue(false);
    document.dispatchEvent(new Event('visibilitychange'));
    await tick();
    expect(storage.save).not.toHaveBeenCalled();

    state.mockReturnValue(true);
    document.dispatchEvent(new Event('visibilitychange'));
    await tick();
    expect(storage.save).toHaveBeenCalledTimes(1);
  });

  it('SEC-02: after dispose neither pagehide nor visibilitychange saves', async () => {
    const storage = makeStorage();
    const engine = makeEngine({ storage });
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);

    engine[Symbol.dispose]();
    await tick();
    // Dirty again after the dispose settled: only the removed listeners could save it
    engine.recordSelection(A);

    window.dispatchEvent(new Event('pagehide'));
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(2000);

    expect(storage.save).not.toHaveBeenCalled();
  });
});

describe('FrecencyEngine load', () => {
  it('CE-15: selections recorded before an async load resolves are merged, not dropped', async () => {
    const storage = makeStorage();
    const loading = Promise.withResolvers<FrecencyData>();
    storage.load.mockReturnValueOnce(loading.promise);
    const engine = makeEngine({ storage });
    const persisted = new Map([
      [A, { frequency: 5, lastUsed: 1000 }],
      [B, { frequency: 3, lastUsed: 7 }],
      [C, { frequency: 1, lastUsed: Date.now() + 1_000_000 }],
    ]);
    const newerPersisted = persisted.get(C)?.lastUsed ?? 0;

    const loaded = engine.load();
    const before = Date.now();
    engine.recordSelection(A);
    engine.recordSelection(A);
    engine.recordSelection(C);
    loading.resolve({ records: persisted });
    await loaded;

    const records = engine.getData().records;
    expect(records.get(A)?.frequency).toBe(7);
    expect(records.get(A)?.lastUsed).toBeGreaterThanOrEqual(before);
    expect(records.get(C)).toEqual({ frequency: 2, lastUsed: newerPersisted });
    expect(records.get(B)).toEqual({ frequency: 3, lastUsed: 7 });
  });

  it('CE-15: load never adopts or mutates the storage map object', async () => {
    const storage = makeStorage();
    const persisted = new Map([[A, { frequency: 5, lastUsed: 1000 }]]);
    storage.load.mockReturnValueOnce({ records: persisted });
    const engine = makeEngine({ storage });

    engine.recordSelection(A);
    engine.recordSelection(B);
    await engine.load();

    expect(engine.getData().records).not.toBe(persisted);
    expect(persisted.size).toBe(1);
    expect(persisted.get(A)).toEqual({ frequency: 5, lastUsed: 1000 });
  });

  it('CE-15: load leaves a clean engine clean and a dirty engine dirty', async () => {
    const storage = makeStorage();
    storage.load.mockReturnValue({ records: new Map([[A, { frequency: 1, lastUsed: 1 }]]) });
    const engine = makeEngine({ storage });

    await engine.load();
    await engine.flush();
    expect(storage.save).not.toHaveBeenCalled();

    engine.recordSelection(B);
    await engine.load();
    await engine.flush();
    expect(storage.save).toHaveBeenCalledTimes(1);
  });
});

describe('FrecencyEngine dispose', () => {
  it('CE-01: sync dispose disposes the storage only after the save settled', async () => {
    const storage = makeStorage();
    const pending = Promise.withResolvers<void>();
    storage.save.mockReturnValueOnce(pending.promise);
    const engine = makeOwningEngine(storage);

    engine.recordSelection(A);
    engine[Symbol.dispose]();
    await tick();

    expect(storage.save).toHaveBeenCalledTimes(1);
    expect(storage[Symbol.dispose]).not.toHaveBeenCalled();

    pending.resolve();
    await tick();

    expect(storage[Symbol.dispose]).toHaveBeenCalledTimes(1);
    expect(storage.save.mock.invocationCallOrder[0]).toBeLessThan(
      storage[Symbol.dispose].mock.invocationCallOrder[0] ?? 0,
    );
  });

  it('CE-01: sync dispose of a dirty engine does not repopulate a disposed MemoryFrecencyStorage', async () => {
    const save = vi.spyOn(MemoryFrecencyStorage.prototype, 'save');
    const dispose = vi.spyOn(MemoryFrecencyStorage.prototype, Symbol.dispose);
    const engine = makeEngine();

    engine.recordSelection(A);
    engine[Symbol.dispose]();
    await tick();

    expect(save).toHaveBeenCalledTimes(1);
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(save.mock.invocationCallOrder[0]).toBeLessThan(dispose.mock.invocationCallOrder[0] ?? 0);
    expect((save.mock.contexts[0] as MemoryFrecencyStorage).toJSON()).toEqual({});
  });

  it('CE-115, D95: a storage the caller passes is left undisposed by both disposals, after the last save', async () => {
    const sync = makeStorage();
    const syncEngine = makeEngine({ storage: sync });
    syncEngine.recordSelection(A);
    syncEngine[Symbol.dispose]();
    await tick();
    expect(sync.save).toHaveBeenCalledTimes(1);
    expect(sync[Symbol.dispose]).not.toHaveBeenCalled();

    const async = makeStorage();
    const asyncEngine = makeEngine({ storage: async });
    asyncEngine.recordSelection(B);
    await asyncEngine[Symbol.asyncDispose]();
    expect(async.save).toHaveBeenCalledTimes(1);
    expect(async[Symbol.dispose]).not.toHaveBeenCalled();
  });

  it('CE-01: sync dispose with a failing save still disposes the storage and warns once', async () => {
    const storage = makeStorage();
    const failure = new Error('blocked');
    storage.save.mockRejectedValue(failure);
    const engine = makeOwningEngine(storage);

    engine.recordSelection(A);
    engine[Symbol.dispose]();
    await tick();

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[1]).toBe(failure);
    expect(storage[Symbol.dispose]).toHaveBeenCalledTimes(1);
  });

  it('CE-01: disposing twice is harmless and saves once', async () => {
    const storage = makeStorage();
    const engine = makeOwningEngine(storage);

    engine.recordSelection(A);
    engine[Symbol.dispose]();
    await tick();
    engine[Symbol.dispose]();
    await tick();

    expect(storage.save).toHaveBeenCalledTimes(1);
  });

  it('TUB-23: await using saves once when dirty and disposes the storage', async () => {
    const storage = makeStorage();
    installOwnedStorage(storage);
    {
      await using engine = new FrecencyEngine({});
      engine.recordSelection(A);
    }

    expect(storage.save).toHaveBeenCalledTimes(1);
    expect(storage[Symbol.dispose]).toHaveBeenCalledTimes(1);
  });

  it('TUB-23: await using saves nothing when clean but still disposes the storage', async () => {
    const storage = makeStorage();
    installOwnedStorage(storage);
    {
      await using _engine = new FrecencyEngine({});
    }

    expect(storage.save).not.toHaveBeenCalled();
    expect(storage[Symbol.dispose]).toHaveBeenCalledTimes(1);
  });

  it('TUB-23: a rejecting save rejects asyncDispose and still disposes the storage', async () => {
    const storage = makeStorage();
    const failure = new Error('disk full');
    storage.save.mockRejectedValue(failure);
    const engine = makeOwningEngine(storage);

    engine.recordSelection(A);
    await expect(engine[Symbol.asyncDispose]()).rejects.toBe(failure);

    expect(storage[Symbol.dispose]).toHaveBeenCalledTimes(1);
  });
});

describe('FrecencyEngine saves in flight', () => {
  it('CE-01: asyncDispose waits for a timer save in flight before it disposes the storage', async () => {
    const storage = makeStorage();
    const pending = Promise.withResolvers<void>();
    const engine = makeOwningEngine(storage);
    const order: string[] = [];
    storage.save.mockImplementationOnce(() => {
      order.push('save start');
      return pending.promise.then(() => {
        order.push('save settled');
      });
    });
    storage[Symbol.dispose].mockImplementation(() => {
      order.push('storage disposed');
    });

    engine.recordSelection(A);
    await vi.advanceTimersByTimeAsync(1000);
    const disposed = engine[Symbol.asyncDispose]().then(() => order.push('asyncDispose resolved'));
    await tick();
    expect(storage[Symbol.dispose]).not.toHaveBeenCalled();

    pending.resolve();
    await disposed;

    expect(order).toEqual([
      'save start',
      'save settled',
      'storage disposed',
      'asyncDispose resolved',
    ]);
  });

  it('CE-01: sync dispose after a pagehide save in flight disposes the storage only after it settled', async () => {
    const storage = makeStorage();
    const pending = Promise.withResolvers<void>();
    storage.save.mockReturnValueOnce(pending.promise);
    const engine = makeOwningEngine(storage);

    engine.recordSelection(A);
    window.dispatchEvent(new Event('pagehide'));
    await tick();
    engine[Symbol.dispose]();
    await tick();
    expect(storage.save).toHaveBeenCalledTimes(1);
    expect(storage[Symbol.dispose]).not.toHaveBeenCalled();

    pending.resolve();
    await tick();
    expect(storage[Symbol.dispose]).toHaveBeenCalledTimes(1);
  });

  it('CE-01: flush resolves only after a timer save in flight settled', async () => {
    const storage = makeStorage();
    const pending = Promise.withResolvers<void>();
    storage.save.mockReturnValueOnce(pending.promise);
    const engine = makeEngine({ storage });
    let flushed = false;

    engine.recordSelection(A);
    await vi.advanceTimersByTimeAsync(1000);
    const flush = engine.flush().then(() => {
      flushed = true;
    });
    await tick();
    expect(flushed).toBe(false);

    pending.resolve();
    await flush;
    expect(flushed).toBe(true);
    expect(storage.save).toHaveBeenCalledTimes(1);
  });

  it('CE-01: saves run one after another and a rejected save rethrows only to the flush that started it', async () => {
    const storage = makeStorage();
    const first = Promise.withResolvers<void>();
    storage.save.mockReturnValueOnce(first.promise);
    const engine = makeEngine({ storage });

    engine.recordSelection(A);
    const one = engine.flush();
    engine.recordSelection(B);
    const two = engine.flush();
    await tick();
    expect(storage.save).toHaveBeenCalledTimes(1);

    const failure = new Error('disk full');
    first.reject(failure);
    await expect(one).rejects.toBe(failure);
    await two;
    expect(storage.save).toHaveBeenCalledTimes(2);
  });

  it('CE-01: a storage whose dispose throws warns after a sync dispose and raises no unhandled rejection', async () => {
    const storage = makeStorage();
    const failure = new Error('dispose failed');
    storage[Symbol.dispose].mockImplementation(() => {
      throw failure;
    });
    const engine = makeOwningEngine(storage);

    engine.recordSelection(A);
    engine[Symbol.dispose]();
    await tick();

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[1]).toBe(failure);
  });

  it('CE-01: a selection recorded after dispose schedules no save and leaves a memory storage empty', async () => {
    const memory = new MemoryFrecencyStorage();
    const save = vi.spyOn(memory, 'save');
    const engine = makeEngine({ storage: memory });

    engine[Symbol.dispose]();
    await tick();
    engine.recordSelection(A);
    await vi.advanceTimersByTimeAsync(5000);

    expect(save).not.toHaveBeenCalled();
    expect(memory.toJSON()).toEqual({});
  });

  it('TUB-24: a selection left in an await using block is stored and a new IdbFrecencyStorage loads it', async () => {
    const db = `frecency-engine-${crypto.randomUUID()}`;
    {
      await using engine = new FrecencyEngine({
        enabled: true,
        storage: new IdbFrecencyStorage(db),
      });
      engine.recordSelection(A);
    }

    using second = new IdbFrecencyStorage(db);
    const { records } = await second.load('default');
    expect(records.get(A)?.frequency).toBe(1);
  });
});

describe('FrecencyEngine config and namespace', () => {
  it('TUB-23: getConfig returns the decay config and setConfig merges into it', () => {
    const engine = makeEngine({ decayConfig: { hourWeight: 8 } });
    expect(engine.getConfig()).toEqual({ hourWeight: 8 });

    engine.setConfig({ dayWeight: 3 });
    expect(engine.getConfig()).toEqual({ hourWeight: 8, dayWeight: 3 });

    engine.recordSelection(A);
    expect(engine.getBonus(A)).toBe(8);
  });

  it('TUB-23: a custom namespace reaches storage.load and storage.save', async () => {
    const storage = makeStorage();
    const engine = makeEngine({ storage, namespace: 'palette-1' });

    await engine.load();
    engine.recordSelection(A);
    await engine.flush();

    expect(storage.load).toHaveBeenCalledWith('palette-1');
    expect(storage.save).toHaveBeenCalledWith('palette-1', expect.anything());
  });
});

describe('FrecencyEngine save and load ordering', () => {
  it('CE-114: a save triggered before the load settles writes the merged history once', async () => {
    const storage = makeStorage();
    const loading = Promise.withResolvers<FrecencyData>();
    storage.load.mockReturnValueOnce(loading.promise);
    const engine = makeEngine({ storage });

    const loaded = engine.load();
    engine.recordSelection(A);
    await vi.advanceTimersByTimeAsync(1000);
    expect(storage.save).not.toHaveBeenCalled();

    loading.resolve({ records: new Map([[B, { frequency: 4, lastUsed: 9 }]]) });
    await loaded;
    await tick();

    expect(storage.save).toHaveBeenCalledTimes(1);
    const written = storage.save.mock.calls[0]?.[1].records;
    expect(written?.get(B)).toEqual({ frequency: 4, lastUsed: 9 });
    expect(written?.get(A)?.frequency).toBe(1);
  });

  it('CE-114: flush and dispose wait for the load in flight and write the merged history', async () => {
    const storage = makeStorage();
    const loading = Promise.withResolvers<FrecencyData>();
    storage.load.mockReturnValueOnce(loading.promise);
    const engine = makeOwningEngine(storage);

    void engine.load();
    engine.recordSelection(A);
    engine.recordSelection(B);
    const disposed = engine[Symbol.asyncDispose]();
    await tick();
    expect(storage.save).not.toHaveBeenCalled();
    expect(storage[Symbol.dispose]).not.toHaveBeenCalled();

    loading.resolve({ records: new Map([[A, { frequency: 2, lastUsed: 1 }]]) });
    await disposed;

    expect(storage.save).toHaveBeenCalledTimes(1);
    expect(storage.save.mock.calls[0]?.[1].records.get(A)?.frequency).toBe(3);
    expect(storage[Symbol.dispose]).toHaveBeenCalledTimes(1);
  });

  it('D96: a rejected load turns persistence off: flush and dispose settle and nothing is written', async () => {
    const storage = makeStorage();
    const loading = Promise.withResolvers<FrecencyData>();
    storage.load.mockReturnValueOnce(loading.promise);
    const engine = makeEngine({ storage });

    const loaded = engine.load();
    const rejection = expect(loaded).rejects.toThrow('idb blocked');
    engine.recordSelection(A);
    await vi.advanceTimersByTimeAsync(1000);
    expect(storage.save).not.toHaveBeenCalled();

    loading.reject(new Error('idb blocked'));
    await rejection;
    await tick();

    await engine.flush();
    engine.recordSelection(B);
    await engine[Symbol.asyncDispose]();

    expect(storage.save).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });
});

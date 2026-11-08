// tests/unit/frecency-machine.test.ts
// The machine's side of frecency persistence (1.6.0 cluster CORE/frecency): hydration refilter,
// a reported load failure, async disposal and the machine-level IndexedDB round trip.
// Fake timers fake only setTimeout/clearTimeout: fake-indexeddb schedules with setImmediate.

import type {
  CommandEvent,
  CommandItem,
  CommandMachine,
  CommandState,
  FrecencyData,
  FrecencyRecord,
  FrecencyStorage,
  ItemId,
} from 'modern-cmdk';
import {
  computeFrecencyBonus,
  createCommandMachine,
  createSearchEngine,
  IdbFrecencyStorage,
  itemId,
  MemoryFrecencyStorage,
} from 'modern-cmdk';
import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import { FRECENCY_FIXTURE_COUNT, generateFrecencyRecords } from '../fixtures/frecency/generate.ts';

let dbCounter = 0;
const uniqueDb = (): string => `frecency-machine-${++dbCounter}-${crypto.randomUUID()}`;

/** A real macrotask: setImmediate is not faked, and fake-indexeddb runs on it. */
const macrotask = (): Promise<void> => new Promise<void>((resolve) => setImmediate(resolve));

/** Let the machine's scheduler (rAF or microtask) and pending promise chains run. */
async function settle(): Promise<void> {
  await vi.advanceTimersByTimeAsync(20);
  await macrotask();
}

/** Poll a condition across real macrotasks; resolves to its last value (never hangs). */
async function until(condition: () => boolean | Promise<boolean>): Promise<boolean> {
  for (let i = 0; i < 500; i++) {
    if (await condition()) return true;
    await macrotask();
  }
  return false;
}

/** An IdbFrecencyStorage that exposes its load promise and the settled state of its save and dispose. */
class SpyStorage extends IdbFrecencyStorage {
  loaded: Promise<FrecencyData> | undefined;
  saved = false;
  disposed = false;

  override load(namespace: string): Promise<FrecencyData> {
    this.loaded = super.load(namespace);
    return this.loaded;
  }

  override async save(namespace: string, data: FrecencyData): Promise<void> {
    await super.save(namespace, data);
    this.saved = true;
  }

  override [Symbol.dispose](): void {
    this.disposed = true;
    super[Symbol.dispose]();
  }
}

/** A storage whose load resolves or rejects when the test says so. */
function deferredStorage(): {
  readonly storage: FrecencyStorage & { readonly save: ReturnType<typeof vi.fn> };
  readonly resolve: (records: Map<ItemId, FrecencyRecord>) => void;
} {
  const { promise, resolve } = Promise.withResolvers<FrecencyData>();
  const save = vi.fn<FrecencyStorage['save']>(async () => {});
  return {
    storage: { load: () => promise, save, [Symbol.dispose]: vi.fn() },
    resolve: (records: Map<ItemId, FrecencyRecord>) => resolve({ records }),
  };
}

const items = (...values: readonly string[]): CommandItem[] =>
  values.map((value) => ({ id: itemId(value), value }));

/** Read the frecency data of `db` through a fresh instance. */
async function readDb(db: string): Promise<FrecencyData> {
  return new IdbFrecencyStorage(db).load('default');
}

const machines: Disposable[] = [];
let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  for (const machine of machines.splice(0)) machine[Symbol.dispose]();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function track<T extends Disposable>(machine: T): T {
  machines.push(machine);
  return machine;
}

describe('machine frecency persistence', () => {
  it('DG-63: a machine saves its selections to IndexedDB and a second machine ranks by them (TUB-24, CE-31, SEC-02, DG-08)', async () => {
    const db = uniqueDb();
    const now = Date.now();
    const seeded = generateFrecencyRecords(FRECENCY_FIXTURE_COUNT, { now });
    await new IdbFrecencyStorage(db).save('default', { records: seeded });

    const seededIds = Array.from({ length: 19 }, (_, i) => `item-${i}`);
    const target = itemId('fresh-target');
    const list = [...seededIds, 'fresh-target'].map((id) => ({ id: itemId(id), value: 'deploy' }));
    const maxSeeded = Math.max(
      ...seededIds.map((id) => computeFrecencyBonus(seeded.get(itemId(id)) as FrecencyRecord, now)),
    );
    // Each selection inside the hour weighs 4: outrank the strongest seeded item
    const selections = Math.ceil(maxSeeded / 4) + 1;

    const storageA = new SpyStorage(db);
    const a = track(
      createCommandMachine({
        items: list,
        frecency: { enabled: true, storage: storageA },
      }),
    );
    await storageA.loaded;
    await settle();
    for (let i = 0; i < selections; i++) a.send({ type: 'ITEM_SELECT', id: target });
    await settle();
    a.send({ type: 'SEARCH_CHANGE', query: 'deploy' });
    await settle();
    const orderA = a.getState().filteredIds;
    expect(orderA[0]).toBe(target);
    expect(orderA).toHaveLength(20);

    await vi.advanceTimersByTimeAsync(1000);
    expect(await until(() => storageA.saved)).toBe(true);
    const persisted = await readDb(db);
    expect(persisted.records.size).toBe(FRECENCY_FIXTURE_COUNT + 1);
    expect(persisted.records.get(target)?.frequency).toBe(selections);

    a[Symbol.dispose]();
    await settle();
    expect(storageA.disposed).toBe(false);
    storageA[Symbol.dispose]();

    const storageB = new SpyStorage(db);
    const b = track(
      createCommandMachine({ items: list, frecency: { enabled: true, storage: storageB } }),
    );
    await storageB.loaded;
    await settle();
    b.send({ type: 'SEARCH_CHANGE', query: 'deploy' });
    await settle();
    expect(b.getState().filteredIds[0]).toBe(target);
    expect(b.getState().filteredIds).toEqual(orderA);
  });

  it('CE-14: hydration re-ranks the current results without another event', async () => {
    const one = itemId('app one');
    const two = itemId('app two');
    const { storage, resolve } = deferredStorage();
    const machine = track(
      createCommandMachine({
        items: items('app one', 'app two'),
        frecency: { enabled: true, storage },
      }),
    );
    machine.send({ type: 'SEARCH_CHANGE', query: 'app' });
    await settle();
    expect(machine.getState().filteredIds).toEqual([one, two]);

    resolve(new Map([[two, { frequency: 5, lastUsed: Date.now() }]]));
    await settle();

    expect(machine.getState().filteredIds).toEqual([two, one]);
  });

  it('CE-109: hydration at an empty query emits no stateChange', async () => {
    const { storage, resolve } = deferredStorage();
    const machine = track(
      createCommandMachine({
        items: items('app one', 'app two'),
        frecency: { enabled: true, storage },
      }),
    );
    const listener = vi.fn();
    machine.subscribe(listener);
    await settle();
    expect(listener).not.toHaveBeenCalled();

    resolve(new Map([[itemId('app two'), { frequency: 5, lastUsed: Date.now() }]]));
    await settle();

    expect(listener).not.toHaveBeenCalled();
    expect(machine.getState().filteredIds).toEqual([itemId('app one'), itemId('app two')]);
  });

  it('CE-109: hydration under filter: false emits no stateChange and keeps registration order', async () => {
    const { storage, resolve } = deferredStorage();
    const machine = track(
      createCommandMachine({
        items: items('app one', 'app two'),
        filter: false,
        frecency: { enabled: true, storage },
      }),
    );
    machine.send({ type: 'SEARCH_CHANGE', query: 'app' });
    await settle();
    const listener = vi.fn();
    machine.subscribe(listener);

    resolve(new Map([[itemId('app two'), { frequency: 50, lastUsed: Date.now() }]]));
    await settle();

    expect(listener).not.toHaveBeenCalled();
    expect(machine.getState().filteredIds).toEqual([itemId('app one'), itemId('app two')]);
  });

  it('CE-14: a load that settles after dispose does not search or emit', async () => {
    const two = itemId('app two');
    const { storage, resolve } = deferredStorage();
    const search = createSearchEngine();
    const searchSpy = vi.spyOn(search, 'search');
    const machine = createCommandMachine({
      items: items('app one', 'app two'),
      search,
      frecency: { enabled: true, storage },
    });
    const listener = vi.fn();
    machine.subscribe(listener);
    machine.send({ type: 'SEARCH_CHANGE', query: 'app' });
    await settle();
    expect(searchSpy).toHaveBeenCalled();
    expect(listener).toHaveBeenCalled();
    const searches = searchSpy.mock.calls.length;
    const emits = listener.mock.calls.length;

    machine[Symbol.dispose]();
    resolve(new Map([[two, { frequency: 5, lastUsed: Date.now() }]]));
    await settle();

    expect(searchSpy).toHaveBeenCalledTimes(searches);
    expect(listener).toHaveBeenCalledTimes(emits);
  });

  it('SEC-27: a rejecting load is reported once and the machine keeps working', async () => {
    const failure = new Error('blocked');
    const storage: FrecencyStorage = {
      load: () => Promise.reject(failure),
      save: async () => {},
      [Symbol.dispose]: () => {},
    };
    const onSelect = vi.fn();
    const machine = track(
      createCommandMachine({
        items: [
          { id: itemId('app one'), value: 'app one' },
          { id: itemId('app two'), value: 'app two', onSelect },
        ],
        frecency: { enabled: true, storage },
      }),
    );
    await settle();

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith('[modern-cmdk] frecency load failed:', failure);

    machine.send({ type: 'SEARCH_CHANGE', query: 'app two' });
    await settle();
    expect(machine.getState().filteredIds[0]).toBe(itemId('app two'));
    machine.send({ type: 'ITEM_SELECT', id: itemId('app two') });
    await settle();
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('CE-02: await using flushes the pending save before the block ends', async () => {
    const db = uniqueDb();
    const storage = new SpyStorage(db);
    const target = itemId('app two');
    {
      await using machine = createCommandMachine({
        items: items('app one', 'app two'),
        frecency: { enabled: true, storage },
      });
      expect(Symbol.asyncDispose in machine).toBe(true);
      await storage.loaded;
      machine.send({ type: 'ITEM_SELECT', id: target });
      await settle();
      // the 1000 ms debounce has not elapsed
      expect(storage.saved).toBe(false);
    }
    expect(storage.saved).toBe(true);
    expect((await readDb(db)).records.get(target)?.frequency).toBe(1);
  });

  it('CE-02: a synchronous dispose of a dirty machine still persists the selection', async () => {
    const db = uniqueDb();
    const storage = new SpyStorage(db);
    const target = itemId('app two');
    const machine = createCommandMachine({
      items: items('app one', 'app two'),
      frecency: { enabled: true, storage },
    });
    machine.send({ type: 'ITEM_SELECT', id: target });
    await settle();
    machine[Symbol.dispose]();

    expect(await until(async () => (await readDb(db)).records.has(target))).toBe(true);
    expect((await readDb(db)).records.get(target)?.frequency).toBe(1);
  });

  it('CE-15: a selection made before the load resolved survives hydration', async () => {
    const one = itemId('app one');
    const two = itemId('app two');
    const { storage, resolve } = deferredStorage();
    const machine = track(
      createCommandMachine({
        items: items('app one', 'app two'),
        frecency: { enabled: true, storage },
      }),
    );
    machine.send({ type: 'ITEM_SELECT', id: two });
    await settle();

    const lastUsed = Date.now();
    resolve(
      new Map([
        [one, { frequency: 5, lastUsed }],
        [two, { frequency: 5, lastUsed }],
      ]),
    );
    await settle();
    machine.send({ type: 'SEARCH_CHANGE', query: 'app' });
    await settle();
    // 5 + 1 selection outranks 5; an overwrite would tie and leave `one` first
    expect(machine.getState().filteredIds).toEqual([two, one]);

    await vi.advanceTimersByTimeAsync(1000);
    expect(storage.save).toHaveBeenCalledTimes(1);
    expect(storage.save.mock.calls[0]?.[1].records.get(two)?.frequency).toBe(6);
  });

  it('TUB-07: after a selection a query matching several items ranks the selected item first', async () => {
    const six = itemId('app six');
    const machine = track(
      createCommandMachine({
        items: items('app one', 'app two', 'app six'),
        frecency: { enabled: true, storage: new MemoryFrecencyStorage() },
      }),
    );
    machine.send({ type: 'SEARCH_CHANGE', query: 'app' });
    await settle();
    expect(machine.getState().filteredIds).toHaveLength(3);
    expect(machine.getState().filteredIds[0]).not.toBe(six);

    machine.send({ type: 'ITEM_SELECT', id: six });
    await settle();
    machine.send({ type: 'SEARCH_CHANGE', query: 'app' });
    await settle();

    expect(machine.getState().filteredIds).toHaveLength(3);
    expect(machine.getState().filteredIds[0]).toBe(six);
  });

  it('CE-115, D95: the machine leaves the storage the caller passed in undisposed, after its last save', async () => {
    const db = uniqueDb();
    const storage = new SpyStorage(db);
    const target = itemId('app two');
    const machine = createCommandMachine({
      items: items('app one', 'app two'),
      frecency: { enabled: true, storage },
    });
    machine.send({ type: 'ITEM_SELECT', id: target });
    await settle();
    machine[Symbol.dispose]();

    expect(await until(() => storage.saved)).toBe(true);
    await settle();
    expect(storage.disposed).toBe(false);
    // The storage still works: the caller's later save to the same namespace replaces the machine's records
    await storage.save('default', {
      records: new Map([[itemId('late'), { frequency: 9, lastUsed: Date.now() }]]),
    });
    const persisted = await readDb(db);
    expect([...persisted.records.keys()]).toEqual([itemId('late')]);
    storage[Symbol.dispose]();
  });

  it('CE-115, D95: a machine that created its own storage disposes it', async () => {
    const dispose = vi.spyOn(MemoryFrecencyStorage.prototype, Symbol.dispose);
    const machine = createCommandMachine({
      items: items('app one'),
      frecency: { enabled: true },
    });
    machine.send({ type: 'ITEM_SELECT', id: itemId('app one') });
    await settle();
    await machine[Symbol.asyncDispose]();
    await settle();
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('LD-05: CommandMachine stays implementable without Symbol.asyncDispose and the machine still has one', () => {
    // Compile-time: the interface does not require Symbol.asyncDispose...
    expectTypeOf<typeof Symbol.asyncDispose>().not.toExtend<keyof CommandMachine>();
    // ...so a hand-written object of the 1.5 shape is still a CommandMachine
    const real = track(createCommandMachine());
    const legacy: CommandMachine = {
      getState: () => real.getState(),
      send: (event: CommandEvent) => real.send(event),
      subscribe: (listener: () => void) => real.subscribe(listener),
      subscribeState: (listener: (state: CommandState) => void) => real.subscribeState(listener),
      getRegistry: () => real.getRegistry(),
      getKeyboardRegistry: () => real.getKeyboardRegistry(),
      getFilteredIdSet: () => real.getFilteredIdSet(),
      getFilteredIdIndex: () => real.getFilteredIdIndex(),
      [Symbol.dispose]: () => {},
    };
    expect(Symbol.asyncDispose in legacy).toBe(false);
    // Runtime: the machine the factory returns still has an asyncDispose
    expect(typeof (real as Partial<AsyncDisposable>)[Symbol.asyncDispose]).toBe('function');
  });
});

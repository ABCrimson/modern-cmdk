// packages/command/src/frecency/idb-storage.ts
// IndexedDB-backed frecency persistence — idb-keyval 6.2.2 (lazy-loaded)
// Implements both Disposable and AsyncDisposable for await using support
// ES2026: Iterator Helpers, Temporal, using/await using

import type { UseStore } from 'idb-keyval';
import type { FrecencyData, FrecencyRecord, FrecencyStorage, ItemId } from '../types.js';

/** JSON-safe serialized form of a FrecencyRecord */
interface SerializedFrecencyRecord {
  readonly frequency: number;
  /** Temporal.Instant epochNanoseconds as string (bigint serialization) */
  readonly lastUsedNs: string;
}

/** JSON-safe serialized form of FrecencyData stored in IndexedDB */
interface SerializedFrecencyData {
  readonly records: ReadonlyArray<readonly [string, SerializedFrecencyRecord]>;
}

/** Serialize a FrecencyRecord to a JSON-safe format */
function serializeRecord(record: FrecencyRecord): SerializedFrecencyRecord {
  return {
    frequency: record.frequency,
    lastUsedNs: record.lastUsed.epochNanoseconds.toString(),
  };
}

/** Deserialize a FrecencyRecord from its JSON-safe form */
function deserializeRecord(serialized: SerializedFrecencyRecord): FrecencyRecord {
  return {
    frequency: serialized.frequency,
    lastUsed: Temporal.Instant.fromEpochNanoseconds(BigInt(serialized.lastUsedNs)),
  };
}

/** Serialize FrecencyData for IndexedDB storage — uses Iterator Helpers */
function serializeData(data: FrecencyData): SerializedFrecencyData {
  return {
    records: data.records
      .entries()
      .map(([id, record]) => [id, serializeRecord(record)] as const)
      .toArray(),
  };
}

/** Deserialize FrecencyData from IndexedDB storage — Iterator passed directly to Map (no .toArray()) */
function deserializeData(serialized: SerializedFrecencyData): FrecencyData {
  return {
    records: new Map(
      serialized.records
        .values()
        .map(([id, record]) => [id as ItemId, deserializeRecord(record)] as const),
    ),
  };
}

/** Build the namespaced IDB key — String.toWellFormed() (ES2026) ensures valid Unicode in key */
function storageKey(namespace: string): string {
  const safeNamespace = namespace.isWellFormed() ? namespace : namespace.toWellFormed();
  return `frecency:${safeNamespace}`;
}

// Cached dynamic import — avoids repeated module resolution across instances
let idbModule: Promise<typeof import('idb-keyval')> | undefined;

/**
 * IndexedDB-backed frecency storage using idb-keyval 6.2.2.
 *
 * Persists frecency data across browser sessions. Implements both
 * `Disposable` and `AsyncDisposable` for use with `using` and `await using`.
 *
 * idb-keyval is lazy-loaded on first method call — consumers who import
 * the core module without using IDB frecency pay zero cost.
 *
 * @example
 * ```ts
 * await using storage = new IdbFrecencyStorage();
 * const data = await storage.load('my-app');
 * ```
 */
export class IdbFrecencyStorage implements FrecencyStorage, AsyncDisposable {
  readonly #dbName: string;
  readonly #storeName: string;
  #store: UseStore | undefined;
  #disposed = false;

  /**
   * Create an IDB-backed frecency storage.
   *
   * @param dbName — IndexedDB database name (default: 'modern-cmdk')
   * @param storeName — IndexedDB object store name (default: 'frecency')
   */
  constructor(dbName: string = 'modern-cmdk', storeName: string = 'frecency') {
    this.#dbName = dbName;
    this.#storeName = storeName;
  }

  /** Lazy-load idb-keyval module — cached across all instances */
  async #idb(): Promise<typeof import('idb-keyval')> {
    idbModule ??= import('idb-keyval');
    return idbModule;
  }

  /** Lazy-create the IDB store on first access */
  async #getStore(): Promise<UseStore> {
    if (!this.#store) {
      const { createStore } = await this.#idb();
      this.#store = createStore(this.#dbName, this.#storeName);
    }
    return this.#store;
  }

  /** Load frecency data from IndexedDB for the given namespace */
  async load(namespace: string): Promise<FrecencyData> {
    if (this.#disposed) {
      return { records: new Map<ItemId, FrecencyRecord>() };
    }

    const { get } = await this.#idb();
    const store = await this.#getStore();
    const serialized = await get<SerializedFrecencyData>(storageKey(namespace), store);

    if (!serialized) {
      return { records: new Map<ItemId, FrecencyRecord>() };
    }

    return deserializeData(serialized);
  }

  /** Save frecency data to IndexedDB for the given namespace */
  async save(namespace: string, data: FrecencyData): Promise<void> {
    if (this.#disposed) return;

    const { set } = await this.#idb();
    const store = await this.#getStore();
    await set(storageKey(namespace), serializeData(data), store);
  }

  /** Delete frecency data for a namespace from IndexedDB */
  async delete(namespace: string): Promise<void> {
    if (this.#disposed) return;

    const { del } = await this.#idb();
    const store = await this.#getStore();
    await del(storageKey(namespace), store);
  }

  /** Synchronous dispose — marks as disposed (best-effort cleanup) */
  [Symbol.dispose](): void {
    this.#disposed = true;
  }

  /** Async dispose — marks as disposed, suitable for `await using` */
  async [Symbol.asyncDispose](): Promise<void> {
    this.#disposed = true;
  }
}

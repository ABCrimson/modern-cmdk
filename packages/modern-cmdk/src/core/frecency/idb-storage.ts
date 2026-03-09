// packages/command/src/frecency/idb-storage.ts
// IndexedDB-backed frecency persistence — idb-keyval 6.2.2
// Implements both Disposable and AsyncDisposable for await using support
// ES2026: Iterator Helpers, Temporal, using/await using

import { createStore, del, get, set, type UseStore } from 'idb-keyval';
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

/** Deserialize FrecencyData from IndexedDB storage — uses Iterator Helpers */
function deserializeData(serialized: SerializedFrecencyData): FrecencyData {
  const entries = serialized.records
    .values()
    .map(([id, record]) => [id as ItemId, deserializeRecord(record)] as const)
    .toArray();

  return {
    records: new Map<ItemId, FrecencyRecord>(entries),
  };
}

/** Build the namespaced IDB key — String.toWellFormed() (ES2026) ensures valid Unicode in key */
function storageKey(namespace: string): string {
  const safeNamespace = namespace.isWellFormed() ? namespace : namespace.toWellFormed();
  return `frecency:${safeNamespace}`;
}

/**
 * IndexedDB-backed frecency storage using idb-keyval 6.2.2.
 *
 * Persists frecency data across browser sessions. Implements both
 * `Disposable` and `AsyncDisposable` for use with `using` and `await using`.
 *
 * @example
 * ```ts
 * await using storage = new IdbFrecencyStorage();
 * const data = await storage.load('my-app');
 * ```
 */
export class IdbFrecencyStorage implements FrecencyStorage, AsyncDisposable {
  readonly #store: UseStore | undefined;
  #disposed = false;

  /**
   * Create an IDB-backed frecency storage.
   *
   * @param dbName — IndexedDB database name (default: 'modern-cmdk')
   * @param storeName — IndexedDB object store name (default: 'frecency')
   */
  constructor(dbName: string = 'modern-cmdk', storeName: string = 'frecency') {
    this.#store = createStore(dbName, storeName);
  }

  /** Load frecency data from IndexedDB for the given namespace */
  async load(namespace: string): Promise<FrecencyData> {
    if (this.#disposed) {
      return { records: new Map<ItemId, FrecencyRecord>() };
    }

    const key = storageKey(namespace);
    const serialized = await get<SerializedFrecencyData>(key, this.#store);

    if (!serialized) {
      return { records: new Map<ItemId, FrecencyRecord>() };
    }

    return deserializeData(serialized);
  }

  /** Save frecency data to IndexedDB for the given namespace */
  async save(namespace: string, data: FrecencyData): Promise<void> {
    if (this.#disposed) return;

    const key = storageKey(namespace);
    const serialized = serializeData(data);
    await set(key, serialized, this.#store);
  }

  /** Delete frecency data for a namespace from IndexedDB */
  async delete(namespace: string): Promise<void> {
    if (this.#disposed) return;

    const key = storageKey(namespace);
    await del(key, this.#store);
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

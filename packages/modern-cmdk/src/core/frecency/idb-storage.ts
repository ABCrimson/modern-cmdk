// packages/modern-cmdk/src/core/frecency/idb-storage.ts
// IndexedDB-backed frecency persistence — idb-keyval get/set/del (lazy-loaded), own per-operation store opener
// Implements both Disposable and AsyncDisposable for await using support
// ES2025: Iterator Helpers; ESNext: Explicit Resource Management (using/await using, TS lib esnext.disposable)

import type { UseStore } from 'idb-keyval';
import type { FrecencyData, FrecencyRecord, FrecencyStorage, ItemId } from '../types.js';
import { ensureWellFormed } from '../utils/string-wellformed.js';

/**
 * v1 payload: a bare record map of `[id, { frequency, lastUsedMs }]` rows with
 * no version field. Written through 1.10; read from every release.
 */
interface SerializedFrecencyDataV1 {
  readonly records: ReadonlyArray<
    readonly [string, { readonly frequency: number; readonly lastUsedMs: number }]
  >;
}

/** v2 payload: the v1 map plus `version: 2`. Read from 1.6.0; written from 1.11. */
interface SerializedFrecencyDataV2 extends SerializedFrecencyDataV1 {
  readonly version: 2;
}

/** Every payload shape the reader accepts */
type SerializedFrecencyData = SerializedFrecencyDataV1 | SerializedFrecencyDataV2;

/** Serialize FrecencyData as v1 for IndexedDB storage — uses Iterator Helpers */
function serializeData(data: FrecencyData): SerializedFrecencyDataV1 {
  return {
    records: data.records
      .entries()
      .map(([id, { frequency, lastUsed }]) => [id, { frequency, lastUsedMs: lastUsed }] as const)
      .toArray(),
  };
}

const isNonNegative = (n: unknown): n is number => Number.isFinite(n) && (n as number) >= 0;

/**
 * Validate a persisted payload (untrusted: it may be corrupt, foreign or from a
 * newer schema). Keeps the rows that are `[string, { frequency, lastUsedMs }]`
 * with finite numbers >= 0 and counts the rest in a single warning; a repeated id
 * counts toward that number and the last row with it wins. A payload
 * that is not a v1 or v2 record map counts as one dropped row and yields empty
 * data; `undefined` (nothing stored) is not a warning.
 */
function deserializeData(raw: unknown): FrecencyData {
  const payload = raw as
    | (Partial<SerializedFrecencyData> & { version?: unknown })
    | null
    | undefined;
  const rows: readonly unknown[] =
    raw === undefined
      ? []
      : Array.isArray(payload?.records) &&
          ([undefined, 1, 2] as unknown[]).includes(payload.version)
        ? payload.records
        : [null];
  const records = new Map(
    rows
      .values()
      .filter(
        (row): row is SerializedFrecencyDataV1['records'][number] =>
          Array.isArray(row) &&
          typeof row[0] === 'string' &&
          isNonNegative(row[1]?.frequency) &&
          isNonNegative(row[1].lastUsedMs),
      )
      .map(([id, { frequency, lastUsedMs }]) => [
        id as ItemId,
        { frequency, lastUsed: lastUsedMs },
      ]),
  );
  if (records.size < rows.length) {
    // biome-ignore lint/suspicious/noConsole: Diagnostic for corrupt persisted data, like the engine's dispose warning
    console.warn('[modern-cmdk] dropped invalid frecency rows:', rows.length - records.size);
  }
  return { records };
}

/**
 * Open `storeName` in `dbName` per operation, creating the store when missing.
 * idb-keyval 6.3.0's createStore does `request.onupgradeneeded = () =>
 * request.result.createObjectStore(storeName)`, which runs only when the database
 * is new, so a second storeName in an existing database fails with NotFoundError
 * (SEC-35). Here a database without the store is reopened at `version + 1`, whose
 * upgrade creates it. The connection closes right after the transaction starts (the
 * transaction still finishes), so it delays another instance's upgrade only until that
 * transaction is done. An upgrade blocked by a connection that is never closed (for example an
 * idb-keyval createStore connection held by app code, which has no versionchange handler)
 * waits for it, so that load or save does not settle until the connection closes.
 */
function openStore(dbName: string, storeName: string): UseStore {
  const open = async (version?: number): Promise<IDBDatabase> => {
    const request = indexedDB.open(dbName, version);
    request.onupgradeneeded = (): IDBObjectStore => request.result.createObjectStore(storeName);
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = (): void => resolve(request.result);
      request.onerror = (): void => reject(request.error);
    });
    if (db.objectStoreNames.contains(storeName)) return db;
    db.close();
    return open(db.version + 1);
  };
  return async <T>(
    mode: IDBTransactionMode,
    callback: (idbStore: IDBObjectStore) => T | PromiseLike<T>,
  ): Promise<T> => {
    const db = await open();
    const transaction = db.transaction(storeName, mode);
    db.close();
    return callback(transaction.objectStore(storeName));
  };
}

/** Build the namespaced IDB key — ensures valid Unicode in key */
function storageKey(namespace: string): string {
  const safeNamespace = ensureWellFormed(namespace);
  return `frecency:${safeNamespace}`;
}

// Cached dynamic import — avoids repeated module resolution across instances
let idbModule: Promise<typeof import('idb-keyval')> | undefined;

/**
 * IndexedDB-backed frecency storage using idb-keyval's get, set and del.
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

  /** Lazy-create the store opener on first access */
  #getStore(): UseStore {
    this.#store ??= openStore(this.#dbName, this.#storeName);
    return this.#store;
  }

  /** Load frecency data from IndexedDB for the given namespace */
  async load(namespace: string): Promise<FrecencyData> {
    if (this.#disposed) {
      return { records: new Map<ItemId, FrecencyRecord>() };
    }

    const { get } = await this.#idb();
    const store = this.#getStore();
    return deserializeData(await get<unknown>(storageKey(namespace), store));
  }

  /** Save frecency data to IndexedDB for the given namespace */
  async save(namespace: string, data: FrecencyData): Promise<void> {
    if (this.#disposed) return;

    const { set } = await this.#idb();
    const store = this.#getStore();
    await set(storageKey(namespace), serializeData(data), store);
  }

  /** Delete frecency data for a namespace from IndexedDB */
  async delete(namespace: string): Promise<void> {
    if (this.#disposed) return;

    const { del } = await this.#idb();
    const store = this.#getStore();
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

// packages/modern-cmdk/src/core/frecency/index.ts
// Uses: Date.now() for timestamps, setTimeout for the debounced save, pagehide/visibilitychange for the page-exit save

import type {
  FrecencyData,
  FrecencyDecayConfig,
  FrecencyOptions,
  FrecencyRecord,
  FrecencyStorage,
  ItemId,
} from '../types.js';
import { DEFAULT_FRECENCY_DECAY } from '../types.js';
import { MemoryFrecencyStorage } from './memory-storage.js';

/** Shared empty bonus map — avoids allocation when no frecency records exist */
const EMPTY_BONUS_MAP: ReadonlyMap<ItemId, number> = new Map();

/**
 * Computes a frecency bonus for an item based on usage frequency and recency.
 * Uses hour/day/week/month bucket boundaries with
 * configurable step weights per recency bucket (hour/day/week/month/older).
 */
export function computeFrecencyBonus(
  history: FrecencyRecord,
  now: number = Date.now(),
  config: FrecencyDecayConfig = DEFAULT_FRECENCY_DECAY,
): number {
  const hours = (now - history.lastUsed) / 3_600_000;

  const {
    hourWeight = 4.0,
    dayWeight = 2.0,
    weekWeight = 1.5,
    monthWeight = 1.0,
    olderWeight = 0.5,
  } = config;

  // Step weight by recency bucket; boundaries in hours: 1, 24 (day), 168 (week), 720 (month)
  const recencyWeight =
    hours < 1
      ? hourWeight
      : hours < 24
        ? dayWeight
        : hours < 168
          ? weekWeight
          : hours < 720
            ? monthWeight
            : olderWeight;

  return history.frequency * recencyWeight;
}

/** Trailing debounce in milliseconds between the last `recordSelection` and the save it schedules */
const FLUSH_DELAY_MS = 1000;

/**
 * Stateful frecency engine that tracks item selection history and provides
 * ranking boosts for search results. Supports pluggable storage backends.
 * Dirty data is saved 1000 ms after the last `recordSelection`, when the page
 * becomes hidden or is hidden for good (`visibilitychange`, `pagehide`), on
 * `flush()` and on dispose; a save waits for a `load()` in flight, so it writes the merged
 * history. Dispose disposes the storage only when the engine created it (no `storage`
 * option): a storage the caller passes is the caller's to dispose. `suspend()` and `resume()` release and
 * re-take the page-exit listeners without ending the engine. Uses Date.now() for timestamps.
 */
export class FrecencyEngine implements Disposable, AsyncDisposable {
  #storage: FrecencyStorage;
  /** True when the engine created its storage, so dispose disposes it; a caller's storage is left alone */
  #ownsStorage: boolean;
  #namespace: string;
  #data: FrecencyData;
  #config: FrecencyDecayConfig;
  #dirty = false;
  #timer: ReturnType<typeof setTimeout> | undefined;
  /** The last started save, never rejecting: saves queue behind it and flush awaits it */
  #pending: Promise<unknown> = Promise.resolve();
  /** The last started load, never rejecting: a save starts only after it settles */
  #loading: Promise<unknown> = Promise.resolve();
  /** Set by a rejected load: the engine writes nothing afterwards */
  #loadFailed = false;
  /** Set by dispose, which is final: suspend and resume then do nothing */
  #disposed = false;
  /** Aborting it removes the page-exit listeners; undefined while suspended or disposed */
  #listening: AbortController | undefined;

  constructor(options: FrecencyOptions) {
    this.#ownsStorage = options.storage === undefined;
    this.#storage = options.storage ?? new MemoryFrecencyStorage();
    this.#namespace = options.namespace ?? 'default';
    this.#config = options.decayConfig ?? DEFAULT_FRECENCY_DECAY;
    this.#data = { records: new Map() };
    // Page Lifecycle guidance (read 2026-11-08):
    // https://developer.chrome.com/docs/web-platform/page-lifecycle-api — "consider the hidden
    // state the last reliable time to save app and user data"; "it's recommended to always use
    // the pagehide event to detect possible page unloads".
    // https://developer.mozilla.org/en-US/docs/Web/API/Window/pagehide_event — "In browsers that
    // don't support visibilitychange the pagehide event is the next-best alternative."
    // Node and SSR have neither target; the dirty flag makes both listeners idempotent.
    this.#listen();
  }

  #listen(): void {
    if (this.#listening) return;
    this.#listening = new AbortController();
    const { signal } = this.#listening;
    globalThis.addEventListener?.('pagehide', this.#save, { signal });
    globalThis.document?.addEventListener(
      'visibilitychange',
      () => document.hidden && this.#save(),
      { signal },
    );
  }

  #unlisten(): void {
    this.#listening?.abort();
    this.#listening = undefined;
  }

  /**
   * Release every global hold: start the save of pending data (through the failure-reporting path, never
   * throwing; it also clears the debounce timer) and remove the `pagehide` and `visibilitychange` listeners.
   * Records and storage stay. A selection recorded while suspended stays dirty and schedules no timer: the next
   * page-exit save after `resume()`, `flush()`, dispose or a later `recordSelection` saves it.
   * Idempotent; does nothing after dispose.
   */
  suspend(): void {
    if (!this.#listening) return;
    this.#unlisten();
    if (this.#dirty) void this.#save();
  }

  /** Re-attach the page-exit listeners `suspend()` removed. Idempotent; does nothing after dispose. */
  resume(): void {
    if (!this.#disposed) this.#listen();
  }

  /**
   * Merge the data in storage into the engine: frequencies add, `lastUsed` takes the later
   * time, and selections recorded before the load resolves are kept. Call it once per
   * engine; a second load would add the persisted frequencies again. A save started while
   * the load is in flight waits for it, so the history it writes is the merged one, and a load
   * that never settles holds every save, and `await using`, forever. A failed load rejects here
   * and turns persistence off for this engine: saving would replace a history it could not read.
   */
  load(): Promise<void> {
    const merged = this.#merge();
    this.#loading = merged.catch(() => {
      this.#loadFailed = true;
    });
    return merged;
  }

  async #merge(): Promise<void> {
    const { records } = await this.#storage.load(this.#namespace);
    const mine = this.#data.records as Map<ItemId, FrecencyRecord>;
    for (const [id, loaded] of records) {
      const m = mine.get(id);
      mine.set(
        id,
        m
          ? {
              frequency: m.frequency + loaded.frequency,
              lastUsed: Math.max(m.lastUsed, loaded.lastUsed),
            }
          : loaded,
      );
    }
  }

  /** Record a selection event for an item and schedule a save 1000 ms after the last one */
  recordSelection(itemId: ItemId): void {
    const now = Date.now();
    const existing = this.#data.records.get(itemId);

    const updated: FrecencyRecord = {
      frequency: (existing?.frequency ?? 0) + 1,
      lastUsed: now,
    };

    // Mutate internal map directly — ReadonlyMap is a compile-time constraint only
    (this.#data.records as Map<ItemId, FrecencyRecord>).set(itemId, updated);
    this.#dirty = true;
    clearTimeout(this.#timer);
    // Suspended or disposed: keep the record, schedule nothing
    if (this.#listening) this.#timer = setTimeout(this.#save, FLUSH_DELAY_MS);
  }

  /** Get frecency bonus for an item */
  getBonus(itemId: ItemId, now?: number): number {
    const record = this.#data.records.get(itemId);
    if (!record) return 0;
    return computeFrecencyBonus(record, now, this.#config);
  }

  /** Get all frecency bonuses as a map — for...of for hot ranking path (no closure overhead) */
  getAllBonuses(now: number = Date.now()): ReadonlyMap<ItemId, number> {
    if (this.#data.records.size === 0) return EMPTY_BONUS_MAP;
    const bonuses = new Map<ItemId, number>();
    for (const [id, record] of this.#data.records) {
      bonuses.set(id, computeFrecencyBonus(record, now, this.#config));
    }
    return bonuses;
  }

  /** Get the decay configuration */
  getConfig(): FrecencyDecayConfig {
    return this.#config;
  }

  /** Update decay configuration at runtime */
  setConfig(config: FrecencyDecayConfig): void {
    this.#config = { ...this.#config, ...config };
  }

  /**
   * Flush dirty data to storage and wait for every save in flight; saves run one after
   * another, each after the load in flight (one that never settles holds them all), none after a
   * rejected load, and a rejected save leaves the data dirty and rethrows to the flush that started it
   */
  async flush(): Promise<void> {
    clearTimeout(this.#timer);
    const dirty = this.#dirty;
    // Clear before awaiting so a selection recorded during the save stays dirty
    this.#dirty = false;
    const save = Promise.all([this.#pending, this.#loading]).then(
      () => dirty && !this.#loadFailed && this.#storage.save(this.#namespace, this.#data),
    );
    this.#pending = save.catch(() => {});
    try {
      await save;
    } catch (error) {
      this.#dirty = true;
      throw error;
    }
  }

  /** Flush for the timer and the page listeners: a failure is reported, never thrown */
  #save = (): Promise<void> => this.flush().catch(this.#warn);

  #warn = (error: unknown): void => {
    // biome-ignore lint/suspicious/noConsole: Save-time diagnostic for production debugging
    console.warn('[modern-cmdk] save failed:', error);
  };

  /** Get the raw frecency data */
  getData(): FrecencyData {
    return this.#data;
  }

  /**
   * Async dispose — flushes dirty data, then disposes the storage the engine created, even
   * when the save rejects (the rejection propagates). Use with `await using`.
   */
  [Symbol.asyncDispose](): Promise<void> {
    this.#end();
    return this.flush().finally(this.#disposeStorage);
  }

  /** Sync dispose — starts the flush without awaiting it and disposes the storage the engine created once it settles */
  [Symbol.dispose](): void {
    this.#end();
    this.#save().finally(this.#disposeStorage).catch(this.#warn);
  }

  #end(): void {
    this.#disposed = true;
    this.#unlisten();
  }

  #disposeStorage = (): void => {
    if (this.#ownsStorage) this.#storage[Symbol.dispose]();
  };
}

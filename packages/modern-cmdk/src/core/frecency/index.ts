// packages/command/src/frecency/index.ts
// Uses: Temporal (ES2026), Iterator Helpers, Temporal.Duration for readable bucket boundaries

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

/** Pre-computed bucket boundaries in hours — avoids Duration.total() per call */
const BUCKET_HOURS = {
  hour: 1,
  day: 24,
  week: 7 * 24,
  month: 30 * 24,
} as const;

/**
 * Computes a frecency bonus for an item based on usage frequency and recency.
 * Uses Temporal.Duration bucket boundaries (hour/day/week/month) with
 * configurable exponential decay weights per time bucket.
 */
export function computeFrecencyBonus(
  history: FrecencyRecord,
  now: Temporal.Instant = Temporal.Now.instant(),
  config: FrecencyDecayConfig = DEFAULT_FRECENCY_DECAY,
): number {
  const elapsed = now.since(history.lastUsed);
  const hours = elapsed.total('hours');

  const {
    hourWeight = 4.0,
    dayWeight = 2.0,
    weekWeight = 1.5,
    monthWeight = 1.0,
    olderWeight = 0.5,
  } = config;

  // Exponential decay with pre-computed bucket boundaries
  const recencyWeight =
    hours < BUCKET_HOURS.hour
      ? hourWeight
      : hours < BUCKET_HOURS.day
        ? dayWeight
        : hours < BUCKET_HOURS.week
          ? weekWeight
          : hours < BUCKET_HOURS.month
            ? monthWeight
            : olderWeight;

  return history.frequency * recencyWeight;
}

/**
 * Stateful frecency engine that tracks item selection history and provides
 * ranking boosts for search results. Supports pluggable storage backends
 * and automatic flush on dispose. Uses Temporal.Now.instant() for timestamps.
 */
export class FrecencyEngine implements Disposable, AsyncDisposable {
  #storage: FrecencyStorage;
  #namespace: string;
  #data: FrecencyData;
  #config: FrecencyDecayConfig;
  #dirty = false;

  constructor(options: FrecencyOptions) {
    this.#storage = options.storage ?? new MemoryFrecencyStorage();
    this.#namespace = options.namespace ?? 'default';
    this.#config = options.decayConfig ?? DEFAULT_FRECENCY_DECAY;
    this.#data = { records: new Map() };
  }

  /** Load frecency data from storage */
  async load(): Promise<void> {
    const data = await this.#storage.load(this.#namespace);
    this.#data = data;
  }

  /** Record a selection event for an item */
  recordSelection(itemId: ItemId): void {
    const now = Temporal.Now.instant();
    const existing = this.#data.records.get(itemId);

    const updated: FrecencyRecord = {
      frequency: (existing?.frequency ?? 0) + 1,
      lastUsed: now,
    };

    // Mutate internal map directly — ReadonlyMap is a compile-time constraint only
    (this.#data.records as Map<ItemId, FrecencyRecord>).set(itemId, updated);
    this.#dirty = true;
  }

  /** Get frecency bonus for an item */
  getBonus(itemId: ItemId, now?: Temporal.Instant): number {
    const record = this.#data.records.get(itemId);
    if (!record) return 0;
    return computeFrecencyBonus(record, now, this.#config);
  }

  /** Get all frecency bonuses as a map — for...of for hot ranking path (no closure overhead) */
  getAllBonuses(now: Temporal.Instant = Temporal.Now.instant()): ReadonlyMap<ItemId, number> {
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

  /** Flush dirty data to storage */
  async flush(): Promise<void> {
    if (!this.#dirty) return;
    await this.#storage.save(this.#namespace, this.#data);
    this.#dirty = false;
  }

  /** Get the raw frecency data */
  getData(): FrecencyData {
    return this.#data;
  }

  /** Async dispose — flushes dirty data before cleanup. Use with `await using`. */
  async [Symbol.asyncDispose](): Promise<void> {
    if (this.#dirty) {
      await this.#storage.save(this.#namespace, this.#data);
      this.#dirty = false;
    }
    this.#storage[Symbol.dispose]();
  }

  [Symbol.dispose](): void {
    // Attempt to flush synchronously (best effort for memory storage)
    if (this.#dirty) {
      const result = this.#storage.save(this.#namespace, this.#data);
      if (result instanceof Promise) {
        // Can't await in dispose — fire and forget for async storage
        result.catch(() => {
          // Silently ignore — data loss is acceptable on dispose
        });
      }
    }
    this.#storage[Symbol.dispose]();
  }
}

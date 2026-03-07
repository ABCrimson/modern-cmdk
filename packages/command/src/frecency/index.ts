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

/** Human-readable duration boundaries using Temporal.Duration */
const DURATION_BUCKETS = {
  hour: Temporal.Duration.from({ hours: 1 }),
  day: Temporal.Duration.from({ hours: 24 }),
  week: Temporal.Duration.from({ days: 7 }),
  month: Temporal.Duration.from({ days: 30 }),
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

  const hourBound = DURATION_BUCKETS.hour.total('hours');
  const dayBound = DURATION_BUCKETS.day.total('hours');
  const weekBound = DURATION_BUCKETS.week.total('hours');
  const monthBound = DURATION_BUCKETS.month.total('hours');

  const {
    hourWeight = 4.0,
    dayWeight = 2.0,
    weekWeight = 1.5,
    monthWeight = 1.0,
    olderWeight = 0.5,
  } = config;

  // Exponential decay with Temporal.Duration-based bucket boundaries
  const recencyWeight =
    hours < hourBound ? hourWeight :
    hours < dayBound ? dayWeight :
    hours < weekBound ? weekWeight :
    hours < monthBound ? monthWeight :
    olderWeight;

  return history.frequency * recencyWeight;
}

/**
 * Stateful frecency engine that tracks item selection history and provides
 * ranking boosts for search results. Supports pluggable storage backends
 * and automatic flush on dispose. Uses Temporal.Now.instant() for timestamps.
 */
export class FrecencyEngine implements Disposable {
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

    // Create new map with updated record (immutable pattern)
    const newRecords = new Map(this.#data.records);
    newRecords.set(itemId, updated);
    this.#data = { records: newRecords };
    this.#dirty = true;
  }

  /** Get frecency bonus for an item */
  getBonus(itemId: ItemId, now?: Temporal.Instant): number {
    const record = this.#data.records.get(itemId);
    if (!record) return 0;
    return computeFrecencyBonus(record, now, this.#config);
  }

  /** Get all frecency bonuses as a map — Iterator Helpers pipeline (ES2026) */
  getAllBonuses(now: Temporal.Instant = Temporal.Now.instant()): ReadonlyMap<ItemId, number> {
    return new Map(
      this.#data.records
        .entries()
        .map(([id, record]) => [id, computeFrecencyBonus(record, now, this.#config)] as const),
    );
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

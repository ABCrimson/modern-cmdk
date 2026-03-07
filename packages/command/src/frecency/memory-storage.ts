// packages/command/src/frecency/memory-storage.ts
// In-memory storage (default) — Map with Iterator.prototype.toArray()

import type { FrecencyData, FrecencyStorage, ItemId, FrecencyRecord } from '../types.js';

/**
 * In-memory implementation of FrecencyStorage using a Map.
 * Data does not persist across page reloads. Suitable for ephemeral
 * sessions or as the default when no persistent storage is configured.
 */
export class MemoryFrecencyStorage implements FrecencyStorage {
  #store = new Map<string, FrecencyData>();

  load(namespace: string): FrecencyData {
    return this.#store.get(namespace) ?? { records: new Map<ItemId, FrecencyRecord>() };
  }

  save(namespace: string, data: FrecencyData): void {
    this.#store.set(namespace, data);
  }

  /** Serialize all stored data — Iterator Helpers pipeline (ES2026) */
  toJSON(): Record<string, { records: Array<[string, FrecencyRecord]> }> {
    return Object.fromEntries(
      this.#store
        .entries()
        .map(([namespace, data]) => [
          namespace,
          { records: data.records.entries().toArray() },
        ]),
    );
  }

  [Symbol.dispose](): void {
    this.#store.clear();
  }
}

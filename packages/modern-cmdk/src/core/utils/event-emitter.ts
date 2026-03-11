// packages/command/src/utils/event-emitter.ts
// Type-safe event emitter — strong refs for reliable delivery, `using` for auto-unsub
// Performance: for...of in hot emit() path, Iterator Helpers for listenerCount()

type EventMap = { [key: string]: unknown };

/**
 * Type-safe event emitter with strong references and Disposable subscriptions.
 * Returns Disposable from `on()` for automatic unsubscription via `using`.
 */
export class TypedEmitter<T extends EventMap> implements Disposable {
  #listeners = new Map<keyof T, Set<(data: never) => void>>();

  /** Subscribe to an event. Returns a Disposable that removes the listener when disposed. */
  on<K extends keyof T>(event: K, listener: (data: T[K]) => void): Disposable {
    let set = this.#listeners.get(event);
    if (!set) {
      set = new Set();
      this.#listeners.set(event, set);
    }
    const fn = listener as (data: never) => void;
    set.add(fn);

    return {
      [Symbol.dispose]: (): void => {
        set.delete(fn);
      },
    };
  }

  /** Emit an event to all listeners. Snapshots the set to prevent live-iteration issues. */
  emit<K extends keyof T>(event: K, data: T[K]): void {
    const set = this.#listeners.get(event);
    if (!set || set.size === 0) return;

    // Snapshot via spread — prevents listeners added/removed during emit from
    // affecting the current iteration pass (ES Set iterators are live)
    for (const fn of [...set]) {
      fn(data as never);
    }
  }

  /** Check if any listeners exist for an event */
  has<K extends keyof T>(event: K): boolean {
    const set = this.#listeners.get(event);
    return set !== undefined && set.size > 0;
  }

  /** Get count of listeners for an event */
  listenerCount<K extends keyof T>(event: K): number {
    return this.#listeners.get(event)?.size ?? 0;
  }

  /** Remove all listeners */
  removeAll(): void {
    this.#listeners.clear();
  }

  [Symbol.dispose](): void {
    this.#listeners.clear();
  }
}

// packages/command/src/utils/event-emitter.ts
// Uses: WeakRef for GC-safe listeners, Iterator Helpers (ES2026) for pipeline, `using` for auto-unsub

type EventMap = Record<string, unknown>;

/**
 * Type-safe event emitter with WeakRef-based listeners for GC-safe subscriptions.
 * Returns Disposable from `on()` for automatic unsubscription via `using`.
 */
export class TypedEmitter<T extends EventMap> implements Disposable {
  #listeners = new Map<keyof T, Set<WeakRef<(data: never) => void>>>();

  /** Subscribe to an event. Returns a Disposable that removes the listener when disposed. */
  on<K extends keyof T>(event: K, listener: (data: T[K]) => void): Disposable {
    const set = this.#listeners.get(event) ?? new Set();
    const ref = new WeakRef(listener as (data: never) => void);
    set.add(ref);
    this.#listeners.set(event, set);

    return {
      [Symbol.dispose]: (): void => {
        set.delete(ref);
      },
    };
  }

  /** Emit an event to all live listeners, pruning garbage-collected refs. */
  emit<K extends keyof T>(event: K, data: T[K]): void {
    const set = this.#listeners.get(event);
    if (!set) return;

    // Iterator Helpers (ES2026) — filter dead refs, deref, execute
    const dead: WeakRef<(data: never) => void>[] = [];

    set
      .values()
      .forEach((ref) => {
        const fn = ref.deref();
        if (fn != null) {
          fn(data as never);
        } else {
          dead.push(ref);
        }
      });

    // Prune GC'd refs in a separate pass to avoid mutation during iteration
    dead.values().forEach((ref) => set.delete(ref));
  }

  /** Check if any listeners exist for an event */
  has<K extends keyof T>(event: K): boolean {
    const set = this.#listeners.get(event);
    if (!set) return false;
    return set.values().some((ref) => ref.deref() != null);
  }

  /** Get count of live listeners for an event — Iterator Helpers pipeline */
  listenerCount<K extends keyof T>(event: K): number {
    const set = this.#listeners.get(event);
    if (!set) return 0;
    return set.values().filter((ref) => ref.deref() != null).toArray().length;
  }

  /** Remove all listeners */
  removeAll(): void {
    this.#listeners.clear();
  }

  [Symbol.dispose](): void {
    this.#listeners.clear();
  }
}

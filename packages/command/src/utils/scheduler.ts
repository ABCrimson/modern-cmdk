// packages/command/src/utils/scheduler.ts
// Uses Promise.withResolvers (ES2024) + requestAnimationFrame batching
// Falls back to queueMicrotask in non-browser environments (Node.js, tests)

/**
 * Batched update scheduler that coalesces state updates into a single tick.
 * Uses requestAnimationFrame in browsers, queueMicrotask in Node.js/tests.
 */
export interface Scheduler extends Disposable {
  schedule(update: () => void): void;
  flush(): Promise<void>;
  [Symbol.dispose](): void;
}

/** Whether we're in a browser environment with rAF available */
const hasRAF = typeof requestAnimationFrame === 'function';

/** Feature detection for cutting-edge scheduling APIs */
const canYield = typeof globalThis.scheduler?.yield === 'function';
const hasInputPending = typeof navigator?.scheduling?.isInputPending === 'function';

/**
 * Creates a batched update scheduler. Coalesces rapid state updates into a single
 * execution pass using rAF (browser) or queueMicrotask (Node.js).
 * Uses Promise.withResolvers (ES2024) for flush coordination.
 */
export function createScheduler(): Scheduler {
  let pending: Array<() => void> = [];
  let rafId: number | null = null;
  let microtaskScheduled = false;

  function executeBatch(): void {
    const batch = pending;
    pending = [];
    rafId = null;
    microtaskScheduled = false;

    // For large batches, check if the browser has pending user input
    // and yield to the main thread to keep the UI responsive
    if (batch.length > 10 && hasInputPending && navigator.scheduling?.isInputPending?.()) {
      // Re-queue unprocessed updates so user input is handled first
      pending = batch;
      if (canYield) {
        void globalThis.scheduler?.yield?.().then(() => void executeBatch());
      } else {
        rafId ??= requestAnimationFrame(() => void executeBatch());
      }
      return;
    }

    batch.values().forEach((update) => update());
  }

  function flush(): Promise<void> {
    const { promise, resolve } = Promise.withResolvers<void>();
    executeBatch();
    resolve();
    return promise;
  }

  return {
    schedule(update: () => void): void {
      pending.push(update);

      if (hasRAF) {
        // Browser: coalesce into a single rAF for visual sync
        rafId ??= requestAnimationFrame(() => void executeBatch());
      } else if (!microtaskScheduled) {
        // Node.js/test: use queueMicrotask for fast synchronous-like execution
        microtaskScheduled = true;
        queueMicrotask(executeBatch);
      }
    },

    flush,

    [Symbol.dispose](): void {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      microtaskScheduled = false;
      pending = [];
    },
  };
}

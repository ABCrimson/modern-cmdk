// packages/command/src/utils/scheduler.ts
// Batched update scheduler — rAF in browsers, queueMicrotask in Node.js/tests
// Uses scheduler.yield() when available for input-responsive large batches

/**
 * Batched update scheduler that coalesces state updates into a single tick.
 * Uses requestAnimationFrame in browsers, queueMicrotask in Node.js/tests.
 */
export interface Scheduler extends Disposable {
  schedule(update: () => void): void;
  flush(): void;
  [Symbol.dispose](): void;
}

/** Whether we're in a browser environment with rAF available */
const hasRAF: boolean = typeof requestAnimationFrame === 'function';

/** Feature detection for cutting-edge scheduling APIs */
const canYield: boolean = typeof globalThis.scheduler?.yield === 'function';
const hasInputPending: boolean = typeof navigator?.scheduling?.isInputPending === 'function';

/**
 * Creates a batched update scheduler. Coalesces rapid state updates into a single
 * execution pass using rAF (browser) or queueMicrotask (Node.js).
 */
export function createScheduler(): Scheduler {
  let pending: Array<() => void> = [];
  let rafId: number | null = null;
  let microtaskScheduled = false;

  function executeBatch(): void {
    // Snapshot and clear BEFORE execution — new updates during execution
    // go into a fresh array, preventing the race condition
    const batch = pending;
    pending = [];
    rafId = null;
    microtaskScheduled = false;

    // For large batches, check if the browser has pending user input
    // and yield to the main thread to keep the UI responsive
    if (batch.length > 10 && hasInputPending && navigator.scheduling?.isInputPending?.()) {
      // Re-queue unprocessed updates so user input is handled first
      pending = [...batch, ...pending];
      if (canYield) {
        void globalThis.scheduler?.yield?.().then(() => void executeBatch());
      } else {
        rafId ??= requestAnimationFrame(() => void executeBatch());
      }
      return;
    }

    // Execute each update with error isolation — one failing update
    // must not kill the rest of the batch
    for (const update of batch) {
      try {
        update();
      } catch (error: unknown) {
        // Report without breaking the batch — use queueMicrotask to throw
        // asynchronously so the error is surfaced but doesn't halt processing
        queueMicrotask(() => {
          throw error;
        });
      }
    }
  }

  function flush(): void {
    executeBatch();
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

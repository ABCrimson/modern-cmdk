// packages/modern-cmdk/src/core/utils/scheduler.ts
// Batched update scheduler — rAF in browsers, queueMicrotask where requestAnimationFrame is absent (Node.js, SSR)
// No isInputPending/scheduler.yield() gate. MDN (read 2026-11-07) marks isInputPending deprecated and experimental, Chromium-only
// (https://developer.mozilla.org/en-US/docs/Web/API/Scheduling/isInputPending), and scheduler.yield() not Baseline (no Safari).
// The gate re-queued whole batches, so flush() could apply nothing; a batch now always runs whole.

/**
 * Batched update scheduler that coalesces state updates into a single tick.
 * Uses requestAnimationFrame in browsers, queueMicrotask where requestAnimationFrame is absent (Node.js, SSR).
 * flush() synchronously applies the updates pending when it is called, in the order scheduled; one scheduled during the flush runs on the next frame or microtask.
 * After dispose, schedule() queues nothing and flush() runs nothing.
 */
export interface Scheduler extends Disposable {
  schedule(update: () => void): void;
  flush(): void;
  [Symbol.dispose](): void;
}

/** Whether we're in a browser environment with rAF available */
const hasRAF: boolean = typeof requestAnimationFrame === 'function';

/**
 * Creates a batched update scheduler. Coalesces rapid state updates into a single
 * execution pass using rAF (browser) or queueMicrotask (where rAF is absent: Node.js, SSR).
 */
export function createScheduler(): Scheduler {
  let pending: Array<() => void> = [];
  let rafId: number | null = null;
  let microtaskScheduled = false;
  let disposed = false;

  function executeBatch(): void {
    // Snapshot and clear BEFORE execution — new updates during execution
    // go into a fresh array, preventing the race condition
    const batch = pending;
    pending = [];
    rafId = null;
    microtaskScheduled = false;

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
    if (disposed) return;
    // Cancel pending rAF to prevent stale callback from executing after flush
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    microtaskScheduled = false;
    executeBatch();
  }

  return {
    schedule(update: () => void): void {
      if (disposed) return;
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
      disposed = true;
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      microtaskScheduled = false;
      pending = [];
    },
  };
}

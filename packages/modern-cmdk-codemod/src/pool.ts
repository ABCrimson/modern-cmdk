// modern-cmdk — Codemod: the pool scheduler.
//
// A sliding window over one shared iterator: `concurrency` runners each take the next item the
// moment they finish the last, so no slot idles while work is left (a fixed batch would wait for
// its slowest member). Results are slotted by input index, so their order never depends on which
// task finished first. A rejected task is recorded in its slot; the others carry on.
//
// Pure: no imports. worker.ts runs the actual file work; cli.ts decides whether that is a
// worker thread or the main thread.

/**
 * Run `task` over `items` with at most `concurrency` calls in flight.
 * Resolves, once every item has settled, to one `PromiseSettledResult` per item in input order.
 */
export async function runPool<T, R>(
  items: readonly T[],
  concurrency: number,
  task: (item: T, index: number) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results = new Array<PromiseSettledResult<R>>(items.length);
  const next = items.entries();
  const runner = async (): Promise<void> => {
    for (const [index, item] of next) {
      try {
        results[index] = { status: 'fulfilled', value: await task(item, index) };
      } catch (reason) {
        results[index] = { status: 'rejected', reason };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, runner));
  return results;
}

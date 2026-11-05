import { describe, expect, it } from 'vitest';
import { runPool } from '../../packages/modern-cmdk/src/codemod/pool.js';

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

describe('codemod pool: the scheduler', () => {
  it('CLI-PERF: at most N tasks run at once and no slot idles while work is left', async () => {
    const limit = 3;
    let running = 0;
    let peak = 0;
    const started: number[] = [];
    let startedWhenSlowDone = -1;
    // Uneven delays: a batch-and-wait scheduler would idle slots behind the slow items.
    const delays = [40, 5, 5, 5, 5, 5, 40, 5, 5, 5, 5, 5];
    const results = await runPool(delays, limit, async (delay, index) => {
      running++;
      peak = Math.max(peak, running);
      started.push(index);
      await sleep(delay);
      if (index === 0) startedWhenSlowDone = started.length;
      running--;
      return index;
    });
    expect(peak).toBe(limit);
    // A sliding window has started items past the limit before the slow item 0 (40 ms) ends; a batch-and-wait
    // scheduler leaves this at the limit.
    expect(startedWhenSlowDone).toBeGreaterThan(limit);
    // Every item started, in input order, on a free slot.
    expect(started).toEqual(delays.map((_, i) => i));
    expect(results.every((r) => r.status === 'fulfilled')).toBe(true);
  });

  it('CLI-PERF: a slot that frees up takes the next item at once (no batch barrier)', async () => {
    // Slot A holds item 0 for a long time; items 1..4 must run on slot B without waiting for it.
    let slowDone = false;
    const finishedBeforeSlow: number[] = [];
    await runPool([0, 1, 2, 3, 4], 2, async (item) => {
      if (item === 0) {
        await sleep(80);
        slowDone = true;
        return;
      }
      await sleep(2);
      if (!slowDone) finishedBeforeSlow.push(item);
    });
    expect(finishedBeforeSlow).toEqual([1, 2, 3, 4]);
  });

  it('CLI-8, RP-38: results come back in input order', async () => {
    // Later items finish first; the result array still follows the input.
    const items = [30, 1, 20, 2, 10];
    const results = await runPool(items, 5, async (delay) => {
      await sleep(delay);
      return delay;
    });
    expect(results).toEqual(items.map((value) => ({ status: 'fulfilled', value })));
  });

  it('CLI-PERF: a failing task yields its error in place and the others finish', async () => {
    const results = await runPool(['a', 'b', 'c', 'd'], 2, async (item) => {
      await sleep(1);
      if (item === 'b') throw new Error('boom b');
      return item.toUpperCase();
    });
    expect(results.map((r) => r.status)).toEqual([
      'fulfilled',
      'rejected',
      'fulfilled',
      'fulfilled',
    ]);
    const failed = results[1] as PromiseRejectedResult;
    expect((failed.reason as Error).message).toBe('boom b');
    expect((results[3] as PromiseFulfilledResult<string>).value).toBe('D');
  });

  it('CLI-PERF: an empty input resolves to an empty array, and N above the item count is fine', async () => {
    expect(await runPool([], 4, async () => 1)).toEqual([]);
    expect(await runPool([1, 2], 16, async (n) => n * 2)).toEqual([
      { status: 'fulfilled', value: 2 },
      { status: 'fulfilled', value: 4 },
    ]);
  });
});

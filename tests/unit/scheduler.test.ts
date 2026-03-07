import { createScheduler } from '@crimson_dev/command';
import { describe, expect, it, vi } from 'vitest';

describe('Scheduler (0.0.3)', () => {
  it('should create a scheduler', () => {
    using scheduler = createScheduler();
    expect(scheduler).toBeDefined();
    expect(typeof scheduler.schedule).toBe('function');
    expect(typeof scheduler.flush).toBe('function');
  });

  it('should execute scheduled updates', async () => {
    using scheduler = createScheduler();
    const fn = vi.fn();

    scheduler.schedule(fn);

    // Wait for microtask/rAF to execute
    await vi.waitFor(() => {
      expect(fn).toHaveBeenCalledOnce();
    });
  });

  it('should batch multiple updates into one execution', async () => {
    using scheduler = createScheduler();
    const fn1 = vi.fn();
    const fn2 = vi.fn();
    const fn3 = vi.fn();

    scheduler.schedule(fn1);
    scheduler.schedule(fn2);
    scheduler.schedule(fn3);

    await vi.waitFor(() => {
      expect(fn1).toHaveBeenCalledOnce();
      expect(fn2).toHaveBeenCalledOnce();
      expect(fn3).toHaveBeenCalledOnce();
    });
  });

  it('should flush pending updates synchronously', async () => {
    using scheduler = createScheduler();
    const fn = vi.fn();

    scheduler.schedule(fn);
    await scheduler.flush();

    expect(fn).toHaveBeenCalledOnce();
  });

  it('should clean up on dispose', () => {
    const scheduler = createScheduler();
    const fn = vi.fn();

    scheduler.schedule(fn);
    scheduler[Symbol.dispose]();

    // After dispose, the scheduled function should not run
    // (it was in pending but cleared on dispose)
  });

  it('should support the Disposable interface', () => {
    using scheduler = createScheduler();
    expect(typeof scheduler[Symbol.dispose]).toBe('function');
  });

  it('should auto-dispose via using declaration', async () => {
    const fn = vi.fn();

    {
      using scheduler = createScheduler();
      scheduler.schedule(fn);
      await scheduler.flush();
    }

    expect(fn).toHaveBeenCalledOnce();
  });

  it('should handle rapid sequential scheduling', async () => {
    using scheduler = createScheduler();
    let counter = 0;

    for (let i = 0; i < 50; i++) {
      scheduler.schedule(() => {
        counter++;
      });
    }

    await scheduler.flush();
    expect(counter).toBe(50);
  });

  it('should handle flush with no pending updates', async () => {
    using scheduler = createScheduler();
    // Should not throw
    await scheduler.flush();
  });

  it('should execute updates in FIFO order', async () => {
    using scheduler = createScheduler();
    const order: number[] = [];

    scheduler.schedule(() => order.push(1));
    scheduler.schedule(() => order.push(2));
    scheduler.schedule(() => order.push(3));

    await scheduler.flush();
    expect(order).toEqual([1, 2, 3]);
  });
});

import { createScheduler } from 'modern-cmdk';
import { describe, expect, it, type MockInstance, vi } from 'vitest';

describe('Scheduler', () => {
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

  it('should clean up on dispose', async () => {
    const scheduler = createScheduler();
    const fn = vi.fn();

    scheduler.schedule(fn);
    scheduler[Symbol.dispose]();

    // After dispose, the scheduled function must never run: pending updates are
    // cleared and the rAF/microtask is cancelled. Give both a chance to fire.
    await new Promise<void>((resolve) => setTimeout(resolve, 20));
    scheduler.flush();
    expect(fn).not.toHaveBeenCalled();
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

  it('should handle flush with no pending updates', () => {
    using scheduler = createScheduler();
    // Flushing an empty queue must complete without throwing
    expect(() => scheduler.flush()).not.toThrow();
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
  it('loads on a runtime without a navigator global (feature detection must not throw)', async () => {
    // Node 21+ and every browser define navigator; older runtimes and embedded engines do not.
    // `typeof navigator?.x` throws a ReferenceError there, because typeof guards only a bare identifier.
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    Reflect.deleteProperty(globalThis, 'navigator');
    try {
      expect(typeof navigator, 'the test could not remove the navigator global').toBe('undefined');
      vi.resetModules();
      const fresh = await import('modern-cmdk');
      using scheduler = fresh.createScheduler();
      const fn = vi.fn();
      scheduler.schedule(fn);
      scheduler.flush();
      expect(fn).toHaveBeenCalledOnce();
    } finally {
      if (descriptor) Object.defineProperty(globalThis, 'navigator', descriptor);
      vi.resetModules();
    }
  });

  it('flush() applies every update synchronously and in order on a Chromium with input pending (ARCH-44, DAE-76, SPEC-32, CE-34)', async () => {
    const isInputPending = vi.fn(() => true);
    const yieldToMain = vi.fn(() => Promise.resolve());
    vi.stubGlobal('navigator', { scheduling: { isInputPending } });
    vi.stubGlobal('scheduler', { yield: yieldToMain });
    try {
      vi.resetModules();
      const fresh = await import('modern-cmdk');
      using scheduler = fresh.createScheduler();
      const order: number[] = [];
      for (let i = 0; i < 25; i++) scheduler.schedule(() => order.push(i));

      scheduler.flush();

      // No await: the whole batch must already be applied when flush() returns.
      expect(order).toEqual(Array.from({ length: 25 }, (_, i) => i));
      expect(isInputPending).not.toHaveBeenCalled();
      expect(yieldToMain).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
      vi.resetModules();
    }
  });

  it('runs a scheduled batch after one microtask turn where requestAnimationFrame is absent (TUB-13)', async () => {
    vi.stubGlobal('requestAnimationFrame', undefined);
    vi.stubGlobal('cancelAnimationFrame', undefined);
    let queue: MockInstance<typeof queueMicrotask> | undefined;
    try {
      vi.resetModules();
      const fresh = await import('modern-cmdk');
      queue = vi.spyOn(globalThis, 'queueMicrotask');
      using scheduler = fresh.createScheduler();
      const order: number[] = [];
      scheduler.schedule(() => order.push(1));
      scheduler.schedule(() => order.push(2));
      scheduler.schedule(() => order.push(3));

      expect(order, 'the update must not run synchronously').toEqual([]);
      expect(queue).toHaveBeenCalledOnce();

      // The batch microtask was queued before this await's continuation, so it runs first.
      await Promise.resolve();
      expect(order).toEqual([1, 2, 3]);
      expect(queue).toHaveBeenCalledOnce();
    } finally {
      queue?.mockRestore();
      vi.unstubAllGlobals();
      vi.resetModules();
    }
  });

  it('isolates a throwing update and rethrows its error through queueMicrotask (TUB-13)', () => {
    const rethrown: Array<() => void> = [];
    const queue = vi.spyOn(globalThis, 'queueMicrotask').mockImplementation((callback) => {
      rethrown.push(callback);
    });
    try {
      using scheduler = createScheduler();
      const boom = new Error('update failed');
      const before = vi.fn();
      const after = vi.fn();
      scheduler.schedule(before);
      scheduler.schedule(() => {
        throw boom;
      });
      scheduler.schedule(after);

      scheduler.flush();

      expect(before).toHaveBeenCalledOnce();
      expect(after).toHaveBeenCalledOnce();
      expect(rethrown).toHaveLength(1);
      let thrown: unknown;
      try {
        rethrown[0]?.();
      } catch (error: unknown) {
        thrown = error;
      }
      expect(thrown).toBe(boom);
    } finally {
      queue.mockRestore();
    }
  });
});

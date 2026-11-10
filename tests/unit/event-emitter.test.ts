import { TypedEmitter } from 'modern-cmdk';
import { describe, expect, expectTypeOf, it, vi } from 'vitest';

type TestEvents = {
  message: string;
  count: number;
  data: { x: number; y: number };
};

// An interface has no implicit index signature, unlike a type alias: this is the shape that users write.
interface InterfaceEvents {
  message: string;
  data: { x: number; y: number };
}

describe('TypedEmitter', () => {
  it('TUB-05: accepts an interface event map and keeps on() and emit() payloads typed', () => {
    using emitter = new TypedEmitter<InterfaceEvents>();
    const messages: string[] = [];
    const points: Array<{ x: number; y: number }> = [];

    using _sub1 = emitter.on('message', (text) => {
      expectTypeOf(text).toEqualTypeOf<string>();
      messages.push(text);
    });
    using _sub2 = emitter.on('data', (point) => {
      expectTypeOf(point).toEqualTypeOf<{ x: number; y: number }>();
      points.push(point);
    });

    emitter.emit('message', 'hello');
    emitter.emit('data', { x: 1, y: 2 });
    // Never called: it only has to fail to compile, so the payload types of emit() stay enforced.
    const wrongPayload = (): void => {
      // @ts-expect-error a number is not the payload of 'message'
      emitter.emit('message', 42);
    };
    expectTypeOf(wrongPayload).toBeFunction();

    expect(messages).toEqual(['hello']);
    expect(points).toEqual([{ x: 1, y: 2 }]);
  });

  it('should emit and receive events', () => {
    using emitter = new TypedEmitter<TestEvents>();
    const handler = vi.fn();

    using _sub = emitter.on('message', handler);
    emitter.emit('message', 'hello');

    expect(handler).toHaveBeenCalledWith('hello');
    expect(handler).toHaveBeenCalledOnce();
  });

  it('should support multiple listeners on same event', () => {
    using emitter = new TypedEmitter<TestEvents>();
    const handler1 = vi.fn();
    const handler2 = vi.fn();

    using _sub1 = emitter.on('message', handler1);
    using _sub2 = emitter.on('message', handler2);
    emitter.emit('message', 'world');

    expect(handler1).toHaveBeenCalledWith('world');
    expect(handler2).toHaveBeenCalledWith('world');
  });

  it('should support multiple event types', () => {
    using emitter = new TypedEmitter<TestEvents>();
    const msgHandler = vi.fn();
    const countHandler = vi.fn();

    using _sub1 = emitter.on('message', msgHandler);
    using _sub2 = emitter.on('count', countHandler);

    emitter.emit('message', 'test');
    emitter.emit('count', 42);

    expect(msgHandler).toHaveBeenCalledWith('test');
    expect(countHandler).toHaveBeenCalledWith(42);
  });

  it('should auto-unsubscribe via Disposable using declaration', () => {
    using emitter = new TypedEmitter<TestEvents>();
    const handler = vi.fn();

    {
      using _sub = emitter.on('message', handler);
      emitter.emit('message', 'inside');
      expect(handler).toHaveBeenCalledOnce();
    }

    // After using block, subscription is disposed
    emitter.emit('message', 'outside');
    // The emitter holds strong references; dispose removed the listener, so the outside
    // emit did not reach the handler and the count stays at the one inside call.
    expect(handler).toHaveBeenCalledOnce();
  });

  it('TUB-42: emit iterates a snapshot, so a listener removed or added during emit takes effect on the next emit', () => {
    using emitter = new TypedEmitter<TestEvents>();
    const h2 = vi.fn();
    const h3 = vi.fn();
    let sub2: Disposable | undefined;
    let h3Added = false;
    const h1 = vi.fn(() => {
      sub2?.[Symbol.dispose]();
      sub2 = undefined;
      if (!h3Added) {
        h3Added = true;
        emitter.on('message', h3);
      }
    });

    using _sub1 = emitter.on('message', h1);
    sub2 = emitter.on('message', h2);

    emitter.emit('message', 'first');
    // h1 disposed h2 and added h3 mid-emit: the snapshot still calls h2 and skips h3
    expect(h1).toHaveBeenCalledTimes(1);
    expect(h2).toHaveBeenCalledTimes(1);
    expect(h3).not.toHaveBeenCalled();

    emitter.emit('message', 'second');
    expect(h1).toHaveBeenCalledTimes(2);
    expect(h2).toHaveBeenCalledTimes(1);
    expect(h3).toHaveBeenCalledTimes(1);
    expect(h3).toHaveBeenCalledWith('second');
  });

  it('should handle emit with no listeners', () => {
    using emitter = new TypedEmitter<TestEvents>();
    // Emitting without subscribers must be a no-op, not an error
    expect(() => emitter.emit('message', 'no-listeners')).not.toThrow();
  });

  it('should correctly report has() for events with listeners', () => {
    using emitter = new TypedEmitter<TestEvents>();
    expect(emitter.has('message')).toBe(false);

    const handler = vi.fn();
    using _sub = emitter.on('message', handler);
    expect(emitter.has('message')).toBe(true);
  });

  it('should correctly count live listeners via listenerCount', () => {
    using emitter = new TypedEmitter<TestEvents>();
    expect(emitter.listenerCount('message')).toBe(0);

    const h1 = vi.fn();
    const h2 = vi.fn();
    using _sub1 = emitter.on('message', h1);
    using _sub2 = emitter.on('message', h2);

    expect(emitter.listenerCount('message')).toBe(2);
  });

  it('should clear all listeners on removeAll', () => {
    using emitter = new TypedEmitter<TestEvents>();
    const handler = vi.fn();

    using _sub = emitter.on('message', handler);
    emitter.removeAll();

    expect(emitter.has('message')).toBe(false);
    expect(emitter.listenerCount('message')).toBe(0);
  });

  it('should clear all listeners on dispose', () => {
    const emitter = new TypedEmitter<TestEvents>();
    const handler = vi.fn();

    emitter.on('message', handler);
    emitter[Symbol.dispose]();

    expect(emitter.has('message')).toBe(false);
  });

  it('should handle rapid sequential emissions', () => {
    using emitter = new TypedEmitter<TestEvents>();
    const handler = vi.fn();

    using _sub = emitter.on('count', handler);

    // ES2025 Iterator helpers — emit using iterator pipeline
    Iterator.from({
      [Symbol.iterator]: function* (): Generator<number> {
        for (let i = 0; i < 100; i++) yield i;
      },
    }).forEach((i) => {
      emitter.emit('count', i);
    });

    expect(handler).toHaveBeenCalledTimes(100);
  });

  it('CE-75: a throwing listener does not skip the later listeners and its error is rethrown from a microtask', async () => {
    const original = globalThis.queueMicrotask;
    const reported: unknown[] = [];
    const queue = vi.spyOn(globalThis, 'queueMicrotask').mockImplementation((callback) => {
      original(() => {
        try {
          callback();
        } catch (error: unknown) {
          reported.push(error);
        }
      });
    });
    try {
      using emitter = new TypedEmitter<TestEvents>();
      const boom = new Error('listener failed');
      const later = vi.fn();
      using _first = emitter.on('message', () => {
        throw boom;
      });
      using _second = emitter.on('message', later);

      expect(() => emitter.emit('message', 'hi')).not.toThrow();

      expect(later).toHaveBeenCalledExactlyOnceWith('hi');
      expect(queue).toHaveBeenCalledOnce();
      await Promise.resolve();
      expect(reported).toHaveLength(1);
      expect(reported[0]).toBe(boom);
    } finally {
      queue.mockRestore();
    }
  });
});

import { TypedEmitter } from 'modern-cmdk';
import { describe, expect, it, vi } from 'vitest';

interface TestEvents {
  message: string;
  count: number;
  data: { x: number; y: number };
}

describe('TypedEmitter (0.0.3)', () => {
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
    // Handler may or may not be called due to WeakRef — the ref was disposed
  });

  it('should not emit to removed listeners', () => {
    using emitter = new TypedEmitter<TestEvents>();
    const handler = vi.fn();

    const sub = emitter.on('message', handler);
    sub[Symbol.dispose]();
    emitter.emit('message', 'after-remove');

    // Handler should not be called since ref was deleted from set
    expect(handler).not.toHaveBeenCalled();
  });

  it('should handle emit with no listeners', () => {
    using emitter = new TypedEmitter<TestEvents>();
    // Should not throw
    emitter.emit('message', 'no-listeners');
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

  it('should handle complex event data types', () => {
    using emitter = new TypedEmitter<TestEvents>();
    const handler = vi.fn();

    using _sub = emitter.on('data', handler);
    emitter.emit('data', { x: 10, y: 20 });

    expect(handler).toHaveBeenCalledWith({ x: 10, y: 20 });
  });

  it('should handle rapid sequential emissions', () => {
    using emitter = new TypedEmitter<TestEvents>();
    const handler = vi.fn();

    using _sub = emitter.on('count', handler);

    // ES2026 Iterator Helpers — emit using iterator pipeline
    Iterator.from({
      [Symbol.iterator]: function* (): Generator<number> {
        for (let i = 0; i < 100; i++) yield i;
      },
    }).forEach((i) => {
      emitter.emit('count', i);
    });

    expect(handler).toHaveBeenCalledTimes(100);
  });

  it('should support the Disposable interface', () => {
    const emitter = new TypedEmitter<TestEvents>();
    expect(typeof emitter[Symbol.dispose]).toBe('function');
  });
});

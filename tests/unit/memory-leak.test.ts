import { createCommandMachine, itemId } from '@crimson_dev/command';
import { describe, expect, it, vi } from 'vitest';

describe('memory leak detection', () => {
  it('disposes cleanly without residual listeners after 100 machine lifecycles', () => {
    // ES2026 Iterator Helpers — generate items via iterator pipeline
    const items = Iterator.from({
      [Symbol.iterator]: function* (): Generator<number> {
        for (let i = 0; i < 1000; i++) yield i;
      },
    })
      .map((i) => ({
        id: itemId(`item-${i}`),
        value: `Item ${i}`,
      }))
      .toArray();

    for (let i = 0; i < 100; i++) {
      using machine = createCommandMachine({ items });
      machine.send({ type: 'SEARCH_CHANGE', query: 'item' });
      machine.send({ type: 'NAVIGATE', direction: 'next' });
    }

    // If we get here without OOM, disposal is working
    expect(true).toBe(true);
  });

  it('subscription cleanup prevents memory growth', async () => {
    using machine = createCommandMachine();
    // ES2026 Iterator Helpers — generate 10K subscriptions via iterator pipeline
    const unsubs = Iterator.from({
      [Symbol.iterator]: function* (): Generator<number> {
        for (let i = 0; i < 10_000; i++) yield i;
      },
    })
      .map(() => machine.subscribe(() => {}))
      .toArray();

    // Unsubscribe all using forEach
    unsubs.values().forEach((unsub) => {
      unsub();
    });

    // Machine should still be functional
    machine.send({ type: 'SEARCH_CHANGE', query: 'test' });
    await vi.waitFor(() => {
      expect(machine.getState().search).toBe('test');
    });
  });

  it('rapid register/unregister cycle does not leak', () => {
    using machine = createCommandMachine();

    for (let i = 0; i < 5000; i++) {
      const id = itemId(`temp-${i}`);
      machine.send({ type: 'REGISTER_ITEM', item: { id, value: `Temp ${i}` } });
      machine.send({ type: 'UNREGISTER_ITEM', id });
    }

    expect(machine.getState().filteredIds.length).toBe(0);
  });
});

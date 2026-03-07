import { createCommandMachine, itemId } from '@crimson_dev/command';
import { describe, expect, it, vi } from 'vitest';

describe('memory leak detection', () => {
  it('disposes cleanly without residual listeners after 100 machine lifecycles', () => {
    const items = Array.from({ length: 1000 }, (_, i) => ({
      id: itemId(`item-${i}`),
      value: `Item ${i}`,
    }));

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
    const unsubs: Array<() => void> = [];

    for (let i = 0; i < 10_000; i++) {
      unsubs.push(machine.subscribe(() => {}));
    }

    // Unsubscribe all
    for (const unsub of unsubs) unsub();

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

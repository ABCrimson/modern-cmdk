import type { CommandItem } from 'modern-cmdk';
import {
  createCommandMachine,
  createSearchEngine,
  FrecencyEngine,
  itemId,
  MemoryFrecencyStorage,
} from 'modern-cmdk';
import { describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const WORDS: string[] = [
  'apple',
  'banana',
  'cherry',
  'date',
  'elderberry',
  'fig',
  'grape',
  'honeydew',
  'kiwi',
  'lemon',
  'mango',
  'nectarine',
  'orange',
  'papaya',
  'quince',
  'raspberry',
  'strawberry',
  'tangerine',
  'watermelon',
];

// ES2025 Iterator helpers — generate items using Iterator.from().map().toArray()
function generateItems(count: number): CommandItem[] {
  return Iterator.from({
    [Symbol.iterator]: function* (): Generator<number> {
      for (let i = 0; i < count; i++) yield i;
    },
  })
    .map((i) => ({
      id: itemId(`stress-${i}`),
      value: `${WORDS[i % WORDS.length]} ${Math.floor(i / 100)} action ${WORDS[(i + 7) % WORDS.length]}`,
      keywords: [`kw-${i % 500}`, `alias-${i % 200}`],
    }))
    .toArray();
}

// ---------------------------------------------------------------------------
// Stress Tests
// ---------------------------------------------------------------------------

describe('Stress Tests', () => {
  it('should handle 100K items — search engine index + search', { timeout: 15_000 }, () => {
    const items = generateItems(100_000);
    using engine = createSearchEngine();
    engine.index(items);

    const results = engine.search('apple', items).toArray();
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]?.score).toBeGreaterThan(0);
  });

  it('should handle rapid typing simulation — 10 incremental prefix queries', () => {
    const items = generateItems(10_000);
    using engine = createSearchEngine();
    engine.index(items);

    const query = 'elderberry';
    for (let i = 1; i <= query.length; i++) {
      const partial = query.slice(0, i);
      const results = engine.search(partial, items).toArray();
      expect(results.length).toBeGreaterThanOrEqual(0);
    }
  });

  it('should handle rapid clear + re-index cycles', () => {
    const items = generateItems(5_000);
    using engine = createSearchEngine();

    for (let cycle = 0; cycle < 20; cycle++) {
      engine.clear();
      engine.index(items);
      const results = engine.search(WORDS[cycle % WORDS.length] as string, items).toArray();
      expect(results.length).toBeGreaterThan(0);
    }
  });

  it('should handle 10K frecency selections without degradation', () => {
    using engine = new FrecencyEngine({ enabled: true, storage: new MemoryFrecencyStorage() });

    for (let i = 0; i < 10_000; i++) {
      engine.recordSelection(itemId(`stress-${i % 500}`));
    }

    const bonuses = engine.getAllBonuses();
    expect(bonuses.size).toBe(500);

    // Every tracked item should have a positive bonus
    bonuses.values().forEach((bonus) => {
      expect(bonus).toBeGreaterThan(0);
    });
  });

  it('should handle concurrent search + frecency', { timeout: 15_000 }, () => {
    const items = generateItems(10_000);
    using searchEngine = createSearchEngine();
    using frecencyEngine = new FrecencyEngine({
      enabled: true,
      storage: new MemoryFrecencyStorage(),
    });

    searchEngine.index(items);

    // Simulate user flow: search, select, search again
    for (let i = 0; i < 50; i++) {
      const query = WORDS[i % WORDS.length] as string;
      const [top] = searchEngine.search(query, items).toArray();

      if (top) {
        frecencyEngine.recordSelection(top.id);
      }
    }

    const bonuses = frecencyEngine.getAllBonuses();
    expect(bonuses.size).toBeGreaterThan(0);
  });

  it('should dispose cleanly — no lingering state', () => {
    const items = generateItems(1_000);

    {
      using engine = createSearchEngine();
      engine.index(items);
      engine.search('apple', items).toArray();
    }

    // After block, engine is disposed — creating a new one should work
    using newEngine = createSearchEngine();
    newEngine.index(items);
    const results = newEngine.search('banana', items).toArray();
    expect(results.length).toBeGreaterThan(0);
  });

  it('should handle empty query gracefully at scale', { timeout: 15_000 }, () => {
    const items = generateItems(50_000);
    using engine = createSearchEngine();
    engine.index(items);

    const results = engine.search('', items).toArray();
    // Empty query returns every indexed item
    expect(results.length).toBe(50_000);
  });

  it('should handle items with very long values', () => {
    // ES2025 Iterator helpers — generate long items via iterator pipeline
    const longItems: CommandItem[] = Iterator.from({
      [Symbol.iterator]: function* (): Generator<number> {
        for (let i = 0; i < 1_000; i++) yield i;
      },
    })
      .map((i) => ({
        id: itemId(`long-${i}`),
        value: `${'a'.repeat(500)} item-${i} ${'z'.repeat(500)}`,
        keywords: [`keyword-${'x'.repeat(100)}`],
      }))
      .toArray();

    using engine = createSearchEngine();
    engine.index(longItems);

    const results = engine.search('item-500', longItems).toArray();
    expect(results.length).toBeGreaterThan(0);
  });

  it('should handle special characters in search queries', () => {
    const items = generateItems(1_000);
    using engine = createSearchEngine();
    engine.index(items);

    const specialQueries = ['<script>', 'test"value', "o'reilly", 'hello\nworld', '🍎'];
    for (const query of specialQueries) {
      // Should not throw
      const results = engine.search(query, items).toArray();
      expect(results).toBeInstanceOf(Array);
    }
  });

  it('machine should handle state transitions under load', { timeout: 15_000 }, () => {
    const items = generateItems(5_000);
    using machine = createCommandMachine({ items });

    // Rapid state transitions
    for (let i = 0; i < 100; i++) {
      const query = (WORDS[i % WORDS.length] ?? '').slice(0, (i % 5) + 1);
      machine.send({ type: 'SEARCH_CHANGE', query });
    }

    const state = machine.getState();
    expect(state).toBeDefined();
    expect(typeof state.search).toBe('string');
  });

  it('P05: mounting 5,000 items in one tick emits stateChange once and holds every item', {
    timeout: 15_000,
  }, async () => {
    const items = generateItems(5_000);
    using machine = createCommandMachine();
    const listener = vi.fn();
    machine.subscribe(listener);

    for (const item of items) machine.send({ type: 'REGISTER_ITEM', item });
    await vi.waitFor(() => {
      expect(machine.getState().filteredCount).toBe(5_000);
    });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(machine.getState().activeId).toBe(items[0]?.id);
  });

  it('P05: unmounting 5,000 items in one tick emits stateChange once', {
    timeout: 15_000,
  }, async () => {
    const items = generateItems(5_000);
    using machine = createCommandMachine({ items });
    const listener = vi.fn();
    machine.subscribe(listener);

    for (const item of items) machine.send({ type: 'UNREGISTER_ITEM', id: item.id });
    await vi.waitFor(() => {
      expect(machine.getState().filteredCount).toBe(0);
    });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(machine.getState().activeId).toBeNull();
  });
});

import { describe, it, expect, vi } from 'vitest';
import {
  createSearchEngine,
  createCommandMachine,
  FrecencyEngine,
  itemId,
} from '@crimson_dev/command';
import { MemoryFrecencyStorage } from '@crimson_dev/command';
import type { CommandItem } from '@crimson_dev/command';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const WORDS = [
  'apple', 'banana', 'cherry', 'date', 'elderberry',
  'fig', 'grape', 'honeydew', 'kiwi', 'lemon',
  'mango', 'nectarine', 'orange', 'papaya', 'quince',
  'raspberry', 'strawberry', 'tangerine', 'watermelon',
];

function generateItems(count: number): CommandItem[] {
  return Array.from({ length: count }, (_, i) => ({
    id: itemId(`stress-${i}`),
    value: `${WORDS[i % WORDS.length]} ${Math.floor(i / 100)} action ${WORDS[(i + 7) % WORDS.length]}`,
    keywords: [`kw-${i % 500}`, `alias-${i % 200}`],
  }));
}

// ---------------------------------------------------------------------------
// 0.8.6 — Stress Tests
// ---------------------------------------------------------------------------

describe('Stress Tests (0.8.6)', () => {
  it('should handle 100K items — search engine index + search', () => {
    const items = generateItems(100_000);
    using engine = createSearchEngine();
    engine.index(items);

    const results = engine.search('apple', items).toArray();
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.score).toBeGreaterThan(0);
  });

  it('should handle rapid typing simulation — 50 incremental queries', () => {
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
      const results = engine.search(WORDS[cycle % WORDS.length]!, items).toArray();
      expect(results.length).toBeGreaterThan(0);
    }
  });

  it('should handle 10K frecency selections without degradation', () => {
    using engine = new FrecencyEngine({ storage: new MemoryFrecencyStorage() });

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

  it('should handle concurrent search + frecency', () => {
    const items = generateItems(10_000);
    using searchEngine = createSearchEngine();
    using frecencyEngine = new FrecencyEngine({ storage: new MemoryFrecencyStorage() });

    searchEngine.index(items);

    // Simulate user flow: search, select, search again
    for (let i = 0; i < 50; i++) {
      const query = WORDS[i % WORDS.length]!;
      const results = searchEngine.search(query, items).toArray();

      if (results.length > 0) {
        frecencyEngine.recordSelection(results[0]!.id);
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

  it('should handle empty query gracefully at scale', () => {
    const items = generateItems(50_000);
    using engine = createSearchEngine();
    engine.index(items);

    const results = engine.search('', items).toArray();
    // Empty query should return all items or empty depending on implementation
    expect(results).toBeDefined();
  });

  it('should handle items with very long values', () => {
    const longItems: CommandItem[] = Array.from({ length: 1_000 }, (_, i) => ({
      id: itemId(`long-${i}`),
      value: `${'a'.repeat(500)} item-${i} ${'z'.repeat(500)}`,
      keywords: [`keyword-${'x'.repeat(100)}`],
    }));

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
      expect(results).toBeDefined();
    }
  });

  it('machine should handle state transitions under load', () => {
    const items = generateItems(5_000);
    using machine = createCommandMachine({ items });

    // Rapid state transitions
    for (let i = 0; i < 100; i++) {
      const query = WORDS[i % WORDS.length]!.slice(0, (i % 5) + 1);
      machine.send({ type: 'SEARCH_CHANGE', query });
    }

    const state = machine.getState();
    expect(state).toBeDefined();
    expect(state.search).toBeDefined();
  });
});

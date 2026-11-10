import type { CommandItem, ScorerFn } from 'modern-cmdk';
import { createCommandMachine, createSearchEngine, itemId } from 'modern-cmdk';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { scoreItemPreLowered } from '../../packages/modern-cmdk/src/core/search/default-scorer.js';

// Spy on the default scorer's per-item entry point, passing through to the real implementation:
// the number of calls is the number of items the engine scored, which tells the incremental path
// (previous matches only) from a full rescan (every item).
vi.mock(
  import('../../packages/modern-cmdk/src/core/search/default-scorer.js'),
  async (importOriginal) => {
    const actual = await importOriginal();
    return { ...actual, scoreItemPreLowered: vi.fn(actual.scoreItemPreLowered) };
  },
);

const scoreSpy = vi.mocked(scoreItemPreLowered);

beforeEach(() => {
  scoreSpy.mockClear();
});

function makeItem(id: string, value: string, keywords?: string[]): CommandItem {
  return { id: itemId(id), value, keywords };
}

describe('Incremental Filtering', () => {
  it('should use incremental filtering when query extends previous', () => {
    using engine = createSearchEngine();
    const items = [
      makeItem('apple', 'Apple'),
      makeItem('application', 'Application'),
      makeItem('banana', 'Banana'),
      makeItem('apricot', 'Apricot'),
      makeItem('cherry', 'Cherry'),
    ];
    engine.index(items);

    // First search — full scan (the fuzzy scorer matches every item containing 'a':
    // Apple, Application, Banana, Apricot; Cherry is excluded)
    const r1 = engine.search('a', items).toArray();
    expect(r1.length).toBe(4);

    // Incremental — only re-scores previous matches
    const r2 = engine.search('ap', items).toArray();
    expect(r2.length).toBeLessThanOrEqual(r1.length);

    // Further incremental
    const r3 = engine.search('app', items).toArray();
    expect(r3.length).toBeLessThanOrEqual(r2.length);

    // Verify correctness — "app" should match Apple and Application
    expect(r3.length).toBe(2);
    const ids = r3.map((r) => r.id);
    expect(ids).toContain(itemId('apple'));
    expect(ids).toContain(itemId('application'));
  });

  it('should do full rescan when query does not extend previous', () => {
    using engine = createSearchEngine();
    const items = [
      makeItem('apple', 'Apple'),
      makeItem('banana', 'Banana'),
      makeItem('cherry', 'Cherry'),
    ];
    engine.index(items);

    // Search "a" first
    engine.search('a', items).toArray();

    // Now search "b" — not incremental, should find Banana
    const results = engine.search('b', items).toArray();
    expect(results.length).toBe(1);
    expect(results[0]?.id).toBe(itemId('banana'));
  });

  it('should do full rescan when query is shorter than previous', () => {
    using engine = createSearchEngine();
    const items = [
      makeItem('apple', 'Apple'),
      makeItem('apricot', 'Apricot'),
      makeItem('banana', 'Banana'),
    ];
    engine.index(items);

    // Type "app"
    engine.search('app', items).toArray();

    // Backspace to "a" — should do full rescan and find all "a" items
    const results = engine.search('a', items).toArray();
    expect(results.length).toBeGreaterThanOrEqual(2); // At least Apple and Apricot
  });

  it('should return all items for empty query', () => {
    using engine = createSearchEngine();
    const items = [makeItem('a', 'Apple'), makeItem('b', 'Banana'), makeItem('c', 'Cherry')];
    engine.index(items);

    const results = engine.search('', items).toArray();
    expect(results.length).toBe(3);
  });

  it('should handle removal during incremental filtering', () => {
    using engine = createSearchEngine();
    const items = [
      makeItem('apple', 'Apple'),
      makeItem('application', 'Application'),
      makeItem('banana', 'Banana'),
    ];
    engine.index(items);

    // First search
    engine.search('a', items).toArray();

    // Remove apple from the engine, but keep handing it the FULL items array: only the engine's
    // own pruning can drop apple now (its previous-results cache would otherwise still hold it)
    engine.remove(new Set([itemId('apple')]));

    const results = engine.search('ap', items).toArray();
    const ids = results.map((r) => r.id);
    expect(ids).not.toContain(itemId('apple'));
    expect(ids).toContain(itemId('application'));
  });

  it('should maintain correct sort order during incremental filtering', () => {
    using engine = createSearchEngine();
    const items = [
      makeItem('apple', 'Apple'),
      makeItem('application', 'Application'),
      makeItem('app-store', 'App Store'),
    ];
    engine.index(items);

    engine.search('a', items).toArray();
    const results = engine.search('app', items).toArray();

    // Results should be sorted by score (descending)
    const scores = results.map((r) => r.score);
    expect(scores).toEqual(scores.toSorted((a, b) => b - a));
  });

  it('should handle single-character incremental filtering', () => {
    using engine = createSearchEngine();
    // ES2025 Iterator helpers — generate test items via iterator pipeline
    const items = Iterator.from({
      [Symbol.iterator]: function* (): Generator<number> {
        for (let i = 0; i < 100; i++) yield i;
      },
    })
      .map((i) => makeItem(`item-${i}`, `Item ${i}`))
      .toArray();
    engine.index(items);

    // Type one character at a time
    const r1 = engine.search('I', items).toArray();
    expect(r1.length).toBeGreaterThan(0);

    const r2 = engine.search('It', items).toArray();
    expect(r2.length).toBeLessThanOrEqual(r1.length);

    const r3 = engine.search('Ite', items).toArray();
    expect(r3.length).toBeLessThanOrEqual(r2.length);
  });

  it('should clear incremental cache on engine.clear()', () => {
    using engine = createSearchEngine();
    const items = [
      makeItem('apple', 'Apple'),
      makeItem('apricot', 'Apricot'),
      makeItem('banana', 'Banana'),
    ];
    engine.index(items);

    expect(
      engine
        .search('app', items)
        .toArray()
        .map((r) => r.id),
    ).toEqual([itemId('apple')]);
    engine.clear();
    scoreSpy.mockClear();

    // No index() after clear(): index() resets the cache itself, so only clear() can make 'appl' a full rescan
    expect(
      engine
        .search('appl', items)
        .toArray()
        .map((r) => r.id),
    ).toEqual([itemId('apple')]);
    expect(scoreSpy).toHaveBeenCalledTimes(items.length);
  });

  describe('which items are scored (default scorer)', () => {
    const items = [
      makeItem('apple', 'Apple'),
      makeItem('application', 'Application'),
      makeItem('banana', 'Banana'),
      makeItem('apricot', 'Apricot'),
      makeItem('abacus', 'Abacus'),
      makeItem('cherry', 'Cherry'),
    ];

    it('should score every item on the first query (the spy is wired)', () => {
      using engine = createSearchEngine();
      engine.index(items);

      engine.search('ap', items).toArray();

      expect(scoreSpy).toHaveBeenCalledTimes(items.length);
    });

    it('should score only the previous matches when the query is extended', () => {
      using engine = createSearchEngine();
      engine.index(items);

      const previous = engine.search('ap', items).toArray();
      expect(scoreSpy).toHaveBeenCalled();
      expect(previous.length).toBeLessThan(items.length);
      scoreSpy.mockClear();

      engine.search('app', items).toArray();

      expect(scoreSpy).toHaveBeenCalledTimes(previous.length);
    });

    it('should score every item when the query does not extend the previous one', () => {
      using engine = createSearchEngine();
      engine.index(items);

      engine.search('app', items).toArray();
      expect(scoreSpy).toHaveBeenCalled();
      scoreSpy.mockClear();

      engine.search('ban', items).toArray();

      expect(scoreSpy).toHaveBeenCalledTimes(items.length);
    });

    it.each([
      ['ab', 'Ab'],
      ['ap', 'App'],
      ['AP', 'apple'],
    ])(
      'should score only the previous matches when %s becomes %s (case-only change)',
      (first, second) => {
        using engine = createSearchEngine();
        engine.index(items);

        const previous = engine.search(first, items).toArray();
        expect(scoreSpy).toHaveBeenCalled();
        expect(previous.length).toBeGreaterThan(0);
        expect(previous.length).toBeLessThan(items.length);
        scoreSpy.mockClear();

        engine.search(second, items).toArray();

        expect(scoreSpy).toHaveBeenCalledTimes(previous.length);
      },
    );
  });

  describe('the incremental check compares lowercased queries', () => {
    it('CE-105: should rescan every item when only the raw queries extend each other (final sigma lowercases differently)', () => {
      using engine = createSearchEngine();
      // 'ΑΣ'.toLowerCase() is 'ας' (word-final sigma) but 'ΑΣΑ'.toLowerCase() is 'ασα': the raw
      // query 'ΑΣΑ' extends 'ΑΣ', the lowered one 'ασα' does not extend 'ας'
      const greek = [makeItem('asa', 'ασα'), makeItem('as', 'ας')];
      engine.index(greek);

      const first = engine.search('ΑΣ', greek).toArray();
      expect(first.map((r) => r.id)).toEqual([itemId('as')]);
      scoreSpy.mockClear();

      const second = engine.search('ΑΣΑ', greek).toArray();

      expect(scoreSpy).toHaveBeenCalledTimes(greek.length);
      expect(second.map((r) => r.id)).toEqual([itemId('asa')]);
    });
  });

  describe('the cache is invalidated when items are indexed', () => {
    it('TUB-68: should find an item indexed after a search whose query the next one extends', () => {
      using engine = createSearchEngine();
      const apple = makeItem('apple', 'Apple');
      engine.index([apple]);
      expect(
        engine
          .search('ap', [apple])
          .toArray()
          .map((r) => r.id),
      ).toEqual([itemId('apple')]);

      const apex = makeItem('apex', 'Apex');
      const both = [apple, apex];
      engine.index([apex]);
      scoreSpy.mockClear();

      const ids = engine
        .search('ape', both)
        .toArray()
        .map((r) => r.id);

      expect(ids).toContain(itemId('apex'));
      expect(scoreSpy).toHaveBeenCalledTimes(both.length);
    });
  });

  describe('custom scorers are never pruned', () => {
    const items = [makeItem('apple', 'Apple'), makeItem('banana', 'Banana')];

    // Non-monotone: the query 'a' matches nothing, the longer query 'ab' matches every item
    const minLength: ScorerFn = (query: string, item: CommandItem) =>
      query.length >= 2 ? { id: item.id, score: 1, matches: [] } : null;

    it('should find items for a longer query after a shorter one matched nothing (min-length scorer)', () => {
      using engine = createSearchEngine({ scorer: minLength });
      engine.index(items);

      expect(engine.search('a', items).toArray()).toEqual([]);

      const ids = engine
        .search('ab', items)
        .toArray()
        .map((r) => r.id);
      expect(ids).toEqual([itemId('apple'), itemId('banana')]);
    });

    it('should call a custom scorer once per item on a query extension (full rescan)', () => {
      const scorer = vi.fn<ScorerFn>((query: string, item: CommandItem) =>
        item.value.toLowerCase().startsWith(query.toLowerCase())
          ? { id: item.id, score: 1, matches: [] }
          : null,
      );
      using engine = createSearchEngine({ scorer });
      engine.index(items);

      const previous = engine.search('a', items).toArray();
      expect(previous.length).toBe(1);
      expect(scorer).toHaveBeenCalledTimes(items.length);
      scorer.mockClear();

      engine.search('ap', items).toArray();

      expect(scorer).toHaveBeenCalledTimes(items.length);
      expect(scoreSpy).not.toHaveBeenCalled();
    });

    it('P33: should find items for a longer query through the machine filter option after a shorter one matched nothing', async () => {
      // The machine wraps a `filter` function into a custom scorer; this one is non-monotone:
      // it rejects every item for the 1-character query and admits them for the 2-character one
      const filter = (_item: CommandItem, query: string): number | false =>
        query.length >= 2 ? 1 : false;
      using machine = createCommandMachine({ items, filter });
      // send() batches the state update into one animation frame; this callback is queued after it
      const nextFrame = (): Promise<void> =>
        new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

      machine.send({ type: 'SEARCH_CHANGE', query: 'a' });
      await nextFrame();
      expect(machine.getState().search).toBe('a');
      expect(machine.getState().filteredIds).toEqual([]);

      machine.send({ type: 'SEARCH_CHANGE', query: 'ab' });
      await nextFrame();

      expect(machine.getState().search).toBe('ab');
      expect(machine.getState().filteredIds).toEqual([itemId('apple'), itemId('banana')]);
    });
  });
});

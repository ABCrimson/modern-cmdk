import type { CommandItem } from 'modern-cmdk';
import { createSearchEngine, itemId } from 'modern-cmdk';
import { describe, expect, it } from 'vitest';

function makeItem(id: string, value: string, keywords?: string[]): CommandItem {
  return { id: itemId(id), value, keywords };
}

describe('Incremental Filtering (0.0.6)', () => {
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

    // First search — full scan (fuzzy scorer matches 'a' in all items including Banana/Cherry)
    const r1 = engine.search('a', items).toArray();
    expect(r1.length).toBeGreaterThanOrEqual(3); // At least Apple, Application, Apricot

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

    // Remove apple from index
    engine.remove(new Set([itemId('apple')]));

    // Incremental search — should not include removed item
    const remaining = items.filter((i) => i.id !== itemId('apple'));
    const results = engine.search('ap', remaining).toArray();
    expect(results.every((r) => r.id !== itemId('apple'))).toBe(true);
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
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1]?.score).toBeGreaterThanOrEqual(results[i]?.score);
    }
  });

  it('should handle single-character incremental filtering', () => {
    using engine = createSearchEngine();
    // ES2026 Iterator Helpers — generate test items via iterator pipeline
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
    const items = [makeItem('a', 'Apple'), makeItem('b', 'Banana')];
    engine.index(items);

    engine.search('a', items).toArray();
    engine.clear();
    engine.index(items);

    // Should do full rescan after clear
    const results = engine.search('ap', items).toArray();
    expect(results.length).toBe(1);
  });
});

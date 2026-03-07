import type { CommandItem } from '@crimson_dev/command';
import { createSearchEngine, itemId, scoreItem } from '@crimson_dev/command';
import { describe, expect, it } from 'vitest';

function makeItem(value: string, keywords?: string[]): CommandItem {
  return { id: itemId(value.toLowerCase().replace(/\s/g, '-')), value, keywords };
}

describe('scoreItem', () => {
  it('should return score 1 for empty query', () => {
    const result = scoreItem('', makeItem('Apple'));
    expect(result).not.toBeNull();
    expect(result?.score).toBe(1);
    expect(result?.matches).toEqual([]);
  });

  it('should return highest score for exact match', () => {
    const result = scoreItem('apple', makeItem('Apple'));
    expect(result).not.toBeNull();
    expect(result?.score).toBe(1);
  });

  it('should score starts-with match very high', () => {
    const result = scoreItem('app', makeItem('Apple Pie'));
    expect(result).not.toBeNull();
    expect(result?.score).toBeGreaterThan(0.9);
  });

  it('should score substring match', () => {
    const result = scoreItem('pie', makeItem('Apple Pie'));
    expect(result).not.toBeNull();
    expect(result?.score).toBeGreaterThan(0.5);
  });

  it('should return null for no match', () => {
    const result = scoreItem('xyz', makeItem('Apple'));
    expect(result).toBeNull();
  });

  it('should match keywords', () => {
    const result = scoreItem('duplicate', makeItem('Copy', ['duplicate', 'clone']));
    expect(result).not.toBeNull();
    expect(result?.score).toBe(1); // Exact match on keyword
  });

  it('should handle single character queries', () => {
    const result = scoreItem('a', makeItem('Apple'));
    expect(result).not.toBeNull();
    expect(result?.score).toBeGreaterThan(0);
  });

  it('should handle Unicode characters', () => {
    const result = scoreItem('café', makeItem('Café Latte'));
    expect(result).not.toBeNull();
    expect(result?.score).toBeGreaterThan(0.9);
  });

  it('should provide match ranges', () => {
    const result = scoreItem('app', makeItem('Apple'));
    expect(result).not.toBeNull();
    expect(result?.matches.length).toBeGreaterThan(0);
    expect(result?.matches[0]?.[0]).toBe(0); // Start at 0
    expect(result?.matches[0]?.[1]).toBe(3); // End at 3
  });

  it('should score word boundary matches', () => {
    const wordBoundary = scoreItem('fc', makeItem('File Copy'));
    expect(wordBoundary).not.toBeNull();
    expect(wordBoundary?.score).toBeGreaterThan(0.3);
  });

  it('should score fuzzy character matches', () => {
    const fuzzy = scoreItem('ale', makeItem('Apple'));
    expect(fuzzy).not.toBeNull();
    expect(fuzzy?.score).toBeGreaterThan(0);
  });

  it('should give higher score to contiguous matches', () => {
    const contiguous = scoreItem('app', makeItem('Application'));
    const scattered = scoreItem('aon', makeItem('Application'));

    if (contiguous && scattered) {
      expect(contiguous.score).toBeGreaterThan(scattered.score);
    }
  });

  it('should prefer earlier matches', () => {
    const early = scoreItem('test', makeItem('Test Application'));
    const late = scoreItem('test', makeItem('Application Test'));

    if (early && late) {
      expect(early.score).toBeGreaterThanOrEqual(late.score);
    }
  });
});

describe('createSearchEngine', () => {
  it('should create a search engine', () => {
    using engine = createSearchEngine();
    expect(engine).toBeDefined();
  });

  it('should search items and return ordered results', () => {
    using engine = createSearchEngine();
    const items = [makeItem('Apple'), makeItem('Banana'), makeItem('Apricot')];
    engine.index(items);

    const results = engine.search('ap', items).toArray();
    expect(results.length).toBe(2); // Apple and Apricot
    expect(results[0]?.score).toBeGreaterThanOrEqual(results[1]?.score);
  });

  it('should return all items for empty query', () => {
    using engine = createSearchEngine();
    const items = [makeItem('Apple'), makeItem('Banana')];
    engine.index(items);

    const results = engine.search('', items).toArray();
    expect(results.length).toBe(2);
  });

  it('should support incremental filtering', () => {
    using engine = createSearchEngine();
    const items = [
      makeItem('Apple'),
      makeItem('Application'),
      makeItem('Banana'),
      makeItem('Apricot'),
    ];
    engine.index(items);

    // First search
    const r1 = engine.search('a', items).toArray();
    expect(r1.length).toBeGreaterThanOrEqual(3); // At least Apple, Application, Apricot (fuzzy may match more)

    // Incremental — extends previous query
    const r2 = engine.search('ap', items).toArray();
    expect(r2.length).toBeLessThanOrEqual(r1.length);
  });

  it('should remove items from index', () => {
    using engine = createSearchEngine();
    const items = [makeItem('Apple'), makeItem('Banana')];
    engine.index(items);

    engine.remove(new Set([items[0]?.id]));
    const results = engine.search('a', [items[1]!]).toArray();
    expect(results.every((r) => r.id !== items[0]?.id)).toBe(true);
  });

  it('should support custom scorer', () => {
    const customScorer = (query: string, item: CommandItem) => {
      if (item.value.includes(query)) {
        return { id: item.id, score: 42, matches: [] as const };
      }
      return null;
    };

    using engine = createSearchEngine({ scorer: customScorer });
    const items = [makeItem('Hello World')];
    engine.index(items);

    const results = engine.search('World', items).toArray();
    expect(results[0]?.score).toBe(42);
  });
});

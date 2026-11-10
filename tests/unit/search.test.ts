import type { CommandItem, SearchResult } from 'modern-cmdk';
import {
  batchScoreItems,
  createSearchEngine,
  itemId,
  scoreItem,
  scoreItemAsync,
} from 'modern-cmdk';
import { describe, expect, it } from 'vitest';

function makeItem(value: string, keywords?: string[]): CommandItem {
  return { id: itemId(value.toLowerCase().replace(/\s/g, '-')), value, keywords };
}

describe('scoreItem', () => {
  it('should return score 1 for empty query', () => {
    const result = scoreItem('', makeItem('Apple'));
    expect(result).not.toBeNull();
    // Vitest — soft assertions for multi-property result checks
    expect.soft(result?.score).toBe(1);
    expect.soft(result?.matches).toEqual([]);
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
    // Vitest — soft assertions to check all range properties
    expect.soft(result?.matches.length).toBeGreaterThan(0);
    expect.soft(result?.matches[0]?.[0]).toBe(0); // Start at 0
    expect.soft(result?.matches[0]?.[1]).toBe(3); // End at 3
  });

  it('should give higher score to contiguous matches', () => {
    const contiguous = scoreItem('app', makeItem('Application'));
    const scattered = scoreItem('aon', makeItem('Application'));

    expect(contiguous).not.toBeNull();
    expect(scattered).not.toBeNull();
    expect(contiguous?.score).toBeGreaterThan(scattered?.score ?? Number.POSITIVE_INFINITY);
  });

  it('should prefer earlier matches', () => {
    const early = scoreItem('test', makeItem('Test Application'));
    const late = scoreItem('test', makeItem('Application Test'));

    expect(early).not.toBeNull();
    expect(late).not.toBeNull();
    expect(early?.score).toBeGreaterThanOrEqual(late?.score ?? Number.POSITIVE_INFINITY);
  });
});

describe('scoreItem word-boundary tier', () => {
  // Each target is not matched by the exact, prefix or substring tiers, so only the
  // word-boundary tier (or, on a miss, the fuzzy tier) can produce the result.
  const notSubstring = (query: string, value: string): void => {
    expect(value.toLowerCase().includes(query)).toBe(false);
  };

  it('should score a word-boundary hit by contiguity and coverage (CE-35)', () => {
    notSubstring('gc', 'git commit');
    const result = scoreItem('gc', makeItem('git commit'));
    // c = (1 + 1) / 2^2 = 0.5; 0.65 + 0.03 * 0.5 + 0.02 * (2 / 10)
    expect(result?.score).toBeCloseTo(0.669, 10);
  });

  it('should rank word-boundary hits against each other (CE-35)', () => {
    notSubstring('gcl', 'git commit log');
    notSubstring('gic', 'git commit log');
    const scattered = scoreItem('gcl', makeItem('git commit log'));
    const contiguous = scoreItem('gic', makeItem('git commit log'));
    expect(scattered?.matches).toEqual([
      [0, 1],
      [4, 5],
      [11, 12],
    ]);
    expect(contiguous?.matches).toEqual([
      [0, 2],
      [4, 5],
    ]);
    // same query length and target: a more contiguous cover scores higher
    expect(contiguous?.score).toBeGreaterThan(scattered?.score ?? Number.POSITIVE_INFINITY);
    expect(scattered?.score).toBeCloseTo(0.65 + 0.03 * (3 / 9) + 0.02 * (3 / 14), 10);
    expect(contiguous?.score).toBeCloseTo(0.65 + 0.03 * (5 / 9) + 0.02 * (3 / 14), 10);
  });

  it('should keep every word-boundary score in (0.65, 0.7) (CE-35)', () => {
    // each case is a word-boundary cover (its matches are the cover), not a fuzzy result
    const cases: ReadonlyArray<
      readonly [string, string, ReadonlyArray<readonly [number, number]>]
    > = [
      [
        'gc',
        'git commit',
        [
          [0, 1],
          [4, 5],
        ],
      ],
      [
        'gcl',
        'git commit log',
        [
          [0, 1],
          [4, 5],
          [11, 12],
        ],
      ],
      [
        'gic',
        'git commit log',
        [
          [0, 2],
          [4, 5],
        ],
      ],
      [
        'fc',
        'file copy',
        [
          [0, 1],
          [5, 6],
        ],
      ],
      [
        'gico',
        'git commit',
        [
          [0, 2],
          [4, 6],
        ],
      ],
      [
        'abc',
        'ab bc',
        [
          [0, 1],
          [3, 5],
        ],
      ],
      [
        'bcd',
        'bx bc d',
        [
          [3, 5],
          [6, 7],
        ],
      ],
    ];
    for (const [query, value, matches] of cases) {
      notSubstring(query, value);
      const result = scoreItem(query, makeItem(value));
      expect.soft(result?.matches, `${query} on ${value}`).toEqual(matches);
      expect.soft(result?.score, `${query} on ${value}`).toBeGreaterThan(0.65);
      expect.soft(result?.score, `${query} on ${value}`).toBeLessThan(0.7);
    }
  });

  it('should rank a word-boundary hit above a fuzzy hit (tier order)', () => {
    notSubstring('gs', 'git: stage all changes');
    notSubstring('gs', 'gas');
    const wordBoundary = scoreItem('gs', makeItem('Git: Stage All Changes'));
    const fuzzy = scoreItem('gs', makeItem('Gas'));
    expect(wordBoundary?.matches).toEqual([
      [0, 1],
      [5, 6],
    ]);
    expect(fuzzy?.matches).toEqual([
      [0, 1],
      [2, 3],
    ]);
    expect(wordBoundary?.score).toBeGreaterThan(fuzzy?.score ?? Number.POSITIVE_INFINITY);
  });

  it('should backtrack to a shorter run so a later word start can finish the cover (CE-36)', () => {
    notSubstring('abc', 'ab bc');
    const result = scoreItem('abc', makeItem('ab bc'));
    expect(result?.matches).toEqual([
      [0, 1],
      [3, 5],
    ]);
    // c = (1 + 2^2) / 3^2; 0.65 + 0.03 * c + 0.02 * (3 / 5)
    expect(result?.score).toBeCloseTo(0.65 + 0.03 * (5 / 9) + 0.02 * (3 / 5), 10);
  });

  it('should skip a matching word start that leads nowhere (CE-36)', () => {
    notSubstring('bcd', 'bx bc d');
    const result = scoreItem('bcd', makeItem('bx bc d'));
    // the first word start 'bx' matches only 'b' and no later word starts with 'c'
    expect(result?.matches).toEqual([
      [3, 5],
      [6, 7],
    ]);
    expect(result?.score).toBeCloseTo(0.65 + 0.03 * (5 / 9) + 0.02 * (3 / 7), 10);
  });

  it('should fall through to the fuzzy tier when no word-boundary cover exists (CE-36)', () => {
    notSubstring('ac', 'abc d');
    const fuzzy = scoreItem('ac', makeItem('abc d'));
    expect(fuzzy?.matches).toEqual([
      [0, 1],
      [2, 3],
    ]);
    // fuzzy: 0.1 + 0.3 * (2 / 4) + 0.15 * (1 - 0 / 5) + 0.1 * (2 / 5)
    expect(fuzzy?.score).toBeCloseTo(0.44, 10);
    expect(scoreItem('abz', makeItem('ab bc'))).toBeNull();
  });

  it('should cache failed covers so a near-miss stays fast (CE-36)', () => {
    // 2000 one-letter words and 100 a's then a 'b' that never occurs: without the cache
    // every choice of 100 of the 2000 words would be tried
    const value = Array.from({ length: 2000 }, () => 'a').join(' ');
    expect(scoreItem(`${'a'.repeat(100)}b`, makeItem(value))).toBeNull();
  });

  it('should not throw on a query longer than the recursion bound (CE-36)', () => {
    const value = Array.from({ length: 8000 }, () => 'a').join(' ');
    expect(scoreItem('a'.repeat(8000), makeItem(value))?.matches).toHaveLength(8000);
  });

  it('should not hang on a query with a separator against doubled separators', () => {
    // a word-boundary segment never contains a separator, so the query's space cannot be
    // covered and this falls through to fuzzy
    const result = scoreItem('a b', makeItem('a  b'));
    expect(result?.matches).toEqual([
      [0, 2],
      [3, 4],
    ]);
  });
});

describe('scorer public API', () => {
  it('should return the exact multi-range fuzzy matches (TUB-34)', () => {
    expect(scoreItem('aon', makeItem('Application'))?.matches).toEqual([
      [0, 1],
      [9, 11],
    ]);
  });

  it('should score items in batch sorted by score descending with misses dropped (TUB-34)', async () => {
    const items = [
      makeItem('Banana'),
      makeItem('A big pie'),
      makeItem('Pineapple'),
      makeItem('Apple'),
    ];
    expect(scoreItem('ap', items[0] as CommandItem)).toBeNull();

    const results = await batchScoreItems('ap', items);

    expect(results.map((r) => r.id)).toEqual(['apple', 'pineapple', 'a-big-pie']);
    expect(results.map((r) => r.score)).toEqual(
      results.map((r) => r.score).toSorted((a, b) => b - a),
    );
  });

  it('should resolve scoreItemAsync to the scoreItem result (TUB-34)', async () => {
    const item = makeItem('Application');
    expect(await scoreItemAsync('aon', item)).toEqual(scoreItem('aon', item));
    expect(await scoreItemAsync('xyz', item)).toBeNull();
  });
});

describe('createSearchEngine', () => {
  it('should search items and return ordered results', () => {
    using engine = createSearchEngine();
    const items = [makeItem('Apple'), makeItem('Banana'), makeItem('Apricot')];
    engine.index(items);

    const results = engine.search('ap', items).toArray();
    expect(results.length).toBe(2); // Apple and Apricot
    const scores = results.map((r) => r.score);
    expect(scores).toEqual(scores.toSorted((a, b) => b - a));
  });

  it('should return all items for empty query', () => {
    using engine = createSearchEngine();
    const items = [makeItem('Apple'), makeItem('Banana')];
    engine.index(items);

    const results = engine.search('', items).toArray();
    expect(results.length).toBe(2);
  });

  it('should support custom scorer', () => {
    const customScorer = (query: string, item: CommandItem): SearchResult | null => {
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

  it('CE-106: indexing an id again replaces the item', () => {
    using engine = createSearchEngine();
    const id = itemId('fruit');
    const first: CommandItem = { id, value: 'Apple', keywords: ['pome'] };
    const updated: CommandItem = { id, value: 'Zebra' };
    const other = makeItem('Banana');
    engine.index([first, other]);
    engine.index([updated]);

    const items = [updated, other];
    expect(
      engine
        .search('zeb', items)
        .toArray()
        .map((r) => r.id),
    ).toEqual([id]);
    expect(engine.search('app', items).toArray()).toEqual([]);
    expect(engine.search('pome', items).toArray()).toEqual([]);
    expect(
      engine
        .search('ban', items)
        .toArray()
        .map((r) => r.id),
    ).toEqual([other.id]);
  });
});

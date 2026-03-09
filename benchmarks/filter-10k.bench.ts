import type { CommandItem } from 'modern-cmdk';
import { createSearchEngine, itemId, scoreItem } from 'modern-cmdk';
import { bench, describe } from 'vitest';

const WORDS = ['apple', 'banana', 'cherry', 'date', 'elderberry', 'fig', 'grape', 'honeydew'];

// ES2026 Iterator Helpers — generate benchmark items via iterator pipeline
function generateItems(count: number): CommandItem[] {
  return Iterator.from({
    [Symbol.iterator]: function* () {
      for (let i = 0; i < count; i++) yield i;
    },
  })
    .map((i) => ({
      id: itemId(`item-${i}`),
      value: `${WORDS[i % WORDS.length]} ${i} action`,
      keywords: [`kw-${i}`],
    }))
    .toArray();
}

const items10K = generateItems(10_000);

describe('Filter 10K Items', () => {
  bench('default scorer — scoreItem per item', () => {
    for (const item of items10K) {
      scoreItem('apple', item);
    }
  });

  bench('search engine — full search pipeline', () => {
    using engine = createSearchEngine();
    engine.index(items10K);
    const _results = engine.search('apple', items10K).toArray();
  });

  bench('search engine — incremental append', () => {
    using engine = createSearchEngine();
    engine.index(items10K);

    // Simulate typing "a" then "ap" then "app"
    engine.search('a', items10K).toArray();
    engine.search('ap', items10K).toArray();
    engine.search('app', items10K).toArray();
  });
});

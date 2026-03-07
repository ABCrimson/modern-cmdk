import { bench, describe } from 'vitest';
import { createSearchEngine, scoreItem, itemId } from '@crimson_dev/command';
import type { CommandItem } from '@crimson_dev/command';

function generateItems(count: number): CommandItem[] {
  const words = ['apple', 'banana', 'cherry', 'date', 'elderberry', 'fig', 'grape', 'honeydew'];
  return Array.from({ length: count }, (_, i) => ({
    id: itemId(`item-${i}`),
    value: `${words[i % words.length]} ${i} action`,
    keywords: [`kw-${i}`],
  }));
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
    const results = engine.search('apple', items10K).toArray();
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

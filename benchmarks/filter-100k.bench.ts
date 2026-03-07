import type { CommandItem } from '@crimson_dev/command';
import { createSearchEngine, itemId } from '@crimson_dev/command';
import { bench, describe } from 'vitest';

function generateItems(count: number): CommandItem[] {
  const words = [
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
  return Array.from({ length: count }, (_, i) => ({
    id: itemId(`item-${i}`),
    value: `${words[i % words.length]} ${Math.floor(i / 100)} action ${words[(i + 7) % words.length]}`,
    keywords: [`kw-${i % 500}`, `alias-${i % 200}`],
  }));
}

const items100K = generateItems(100_000);

describe('Filter 100K Items (TS scorer)', () => {
  bench('search engine — full pipeline', () => {
    using engine = createSearchEngine();
    engine.index(items100K);
    engine.search('apple', items100K).toArray();
  });

  bench('search engine — incremental', () => {
    using engine = createSearchEngine();
    engine.index(items100K);
    engine.search('a', items100K).toArray();
    engine.search('ap', items100K).toArray();
    engine.search('app', items100K).toArray();
    engine.search('appl', items100K).toArray();
  });
});

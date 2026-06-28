import type { CommandItem } from 'modern-cmdk';
import { createSearchEngine, itemId } from 'modern-cmdk';
import { describe, test } from 'vitest';

const WORDS = [
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

// ES2026 Iterator Helpers — generate benchmark items via iterator pipeline
function generateItems(count: number): CommandItem[] {
  return Iterator.from({
    [Symbol.iterator]: function* () {
      for (let i = 0; i < count; i++) yield i;
    },
  })
    .map((i) => ({
      id: itemId(`item-${i}`),
      value: `${WORDS[i % WORDS.length]} ${Math.floor(i / 100)} action ${WORDS[(i + 7) % WORDS.length]}`,
      keywords: [`kw-${i % 500}`, `alias-${i % 200}`],
    }))
    .toArray();
}

const items100K = generateItems(100_000);

// Vitest 5 — `bench` is a fixture factory; .run() executes/measures the task.
describe('Filter 100K Items (TS scorer)', () => {
  test('search engine — full pipeline', async ({ bench }) => {
    await bench('search engine — full pipeline', () => {
      using engine = createSearchEngine();
      engine.index(items100K);
      engine.search('apple', items100K).toArray();
    }).run();
  });

  test('search engine — incremental', async ({ bench }) => {
    await bench('search engine — incremental', () => {
      using engine = createSearchEngine();
      engine.index(items100K);
      engine.search('a', items100K).toArray();
      engine.search('ap', items100K).toArray();
      engine.search('app', items100K).toArray();
      engine.search('appl', items100K).toArray();
    }).run();
  });
});

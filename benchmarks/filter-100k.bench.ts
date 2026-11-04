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

// ES2025 Iterator Helpers — generate benchmark items via iterator pipeline
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

  // beforeAll builds the 100K index once per tinybench phase (warmup, then the measured run), so only the four searches are timed.
  let incrementalEngine: ReturnType<typeof createSearchEngine> | undefined;

  test('search engine — incremental', async ({ bench }) => {
    await bench(
      'search engine — incremental',
      {
        beforeAll() {
          incrementalEngine = createSearchEngine();
          incrementalEngine.index(items100K);
        },
        afterAll() {
          incrementalEngine?.[Symbol.dispose]();
          incrementalEngine = undefined;
        },
      },
      () => {
        if (!incrementalEngine) throw new Error('engine fixture missing: beforeAll did not run');
        incrementalEngine.search('a', items100K).toArray();
        incrementalEngine.search('ap', items100K).toArray();
        incrementalEngine.search('app', items100K).toArray();
        incrementalEngine.search('appl', items100K).toArray();
      },
    ).run();
  });
});

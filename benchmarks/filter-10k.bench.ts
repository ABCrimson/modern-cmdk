import { createSearchEngine, itemId, scoreItem } from 'modern-cmdk';
import { describe, test } from 'vitest';
import { generateItems } from './fixtures.ts';

const items10K = generateItems(10_000, 'basic', itemId);

// Vitest 5 — `bench` is a test-context fixture FACTORY: bench(name, fn) registers,
// and .run() actually executes/measures the task.
describe('Filter 10K Items', () => {
  test('default scorer — scoreItem per item', async ({ bench }) => {
    await bench('default scorer — scoreItem per item', () => {
      for (const item of items10K) {
        scoreItem('apple', item);
      }
    }).run();
  });

  test('search engine — full search pipeline', async ({ bench }) => {
    await bench('search engine — full search pipeline', () => {
      using engine = createSearchEngine();
      engine.index(items10K);
      const _results = engine.search('apple', items10K).toArray();
    }).run();
  });

  test('search engine — incremental append', async ({ bench }) => {
    await bench('search engine — incremental append', () => {
      using engine = createSearchEngine();
      engine.index(items10K);

      // Simulate typing "a" then "ap" then "app"
      engine.search('a', items10K).toArray();
      engine.search('ap', items10K).toArray();
      engine.search('app', items10K).toArray();
    }).run();
  });
});

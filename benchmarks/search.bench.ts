import type { CommandItem } from 'modern-cmdk';
import { createCommandMachine, itemId } from 'modern-cmdk';
import { describe, test } from 'vitest';

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
      value: `${WORDS[i % WORDS.length]} ${i} ${WORDS[(i + 3) % WORDS.length]} action`,
      keywords: [`keyword-${i}`, `alias-${i % 100}`],
    }))
    .toArray();
}

const items1K = generateItems(1_000);
const items10K = generateItems(10_000);

// Vitest 5 — `bench` is a fixture factory; .run() executes/measures the task.
describe('Search Scoring', () => {
  test('filter 1K items (default scorer)', async ({ bench }) => {
    await bench('filter 1K items (default scorer)', () => {
      using machine = createCommandMachine({ items: items1K });
      machine.send({ type: 'SEARCH_CHANGE', query: 'apple' });
    }).run();
  });

  test('filter 10K items (default scorer)', async ({ bench }) => {
    await bench('filter 10K items (default scorer)', () => {
      using machine = createCommandMachine({ items: items10K });
      machine.send({ type: 'SEARCH_CHANGE', query: 'banana' });
    }).run();
  });

  test('create machine with 1K items', async ({ bench }) => {
    await bench('create machine with 1K items', () => {
      using machine = createCommandMachine({ items: items1K });
      machine.getState();
    }).run();
  });

  test('create machine with 10K items', async ({ bench }) => {
    await bench('create machine with 10K items', () => {
      using machine = createCommandMachine({ items: items10K });
      machine.getState();
    }).run();
  });
});

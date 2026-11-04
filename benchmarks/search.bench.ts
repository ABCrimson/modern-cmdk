import type { CommandItem } from 'modern-cmdk';
import { createCommandMachine, itemId } from 'modern-cmdk';
import { describe, test } from 'vitest';

const WORDS = ['apple', 'banana', 'cherry', 'date', 'elderberry', 'fig', 'grape', 'honeydew'];

// ES2025 Iterator Helpers — generate benchmark items via iterator pipeline
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

/**
 * A machine whose SEARCH_CHANGE is awaited to completion. `machine.send` only schedules the
 * event, so the work runs once the scheduler processes it; `search` resolves when `subscribeState`
 * reports the new query, which makes the bench time the filtering itself.
 */
function createSearchFixture(items: CommandItem[]) {
  const machine = createCommandMachine({ items });
  let waiting: { readonly query: string; readonly resolve: () => void } | undefined;
  const subscription = machine.subscribeState((state) => {
    if (waiting && state.search === waiting.query) {
      const { resolve } = waiting;
      waiting = undefined;
      resolve();
    }
  });
  return {
    search(query: string): Promise<void> {
      const { promise, resolve } = Promise.withResolvers<void>();
      waiting = { query, resolve };
      machine.send({ type: 'SEARCH_CHANGE', query });
      return promise;
    },
    [Symbol.dispose](): void {
      subscription[Symbol.dispose]();
      machine[Symbol.dispose]();
    },
  };
}

type SearchFixture = ReturnType<typeof createSearchFixture>;

// Vitest 5 — `bench` is a fixture factory; .run() executes/measures the task.
describe('Search Scoring', () => {
  // beforeAll creates the machine once per tinybench phase (warmup, then the measured run); every iteration alternates between two queries so
  // each SEARCH_CHANGE changes the search string and filters the whole item set.
  let fixture: SearchFixture | undefined;
  let flip = false;

  const filterBench = (items: CommandItem[], queries: readonly [string, string]) => ({
    options: {
      beforeAll() {
        fixture = createSearchFixture(items);
      },
      afterAll() {
        fixture?.[Symbol.dispose]();
        fixture = undefined;
      },
    },
    fn: async (): Promise<void> => {
      if (!fixture) throw new Error('machine fixture missing: beforeAll did not run');
      flip = !flip;
      await fixture.search(queries[flip ? 0 : 1]);
    },
  });

  test('filter 1K items (default scorer)', async ({ bench }) => {
    const { options, fn } = filterBench(items1K, ['apple', 'banana']);
    await bench('filter 1K items (default scorer)', options, fn).run();
  });

  test('filter 10K items (default scorer)', async ({ bench }) => {
    const { options, fn } = filterBench(items10K, ['banana', 'cherry']);
    await bench('filter 10K items (default scorer)', options, fn).run();
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

// Standalone tinybench 6.0.0 script for CI regression tracking
// ES2026: using/Symbol.dispose, Iterator Helpers
import './setup.js';
import { Bench } from 'tinybench';

const bench = new Bench({
  warmupIterations: 100,
  iterations: 1000,
});

// Note: These benchmarks import from built dist — run after `pnpm build`
async function run(): Promise<void> {
  const { createSearchEngine, createCommandMachine, itemId } = await import(
    '../../packages/modern-cmdk/dist/core/index.mjs'
  );

  const words = ['apple', 'banana', 'cherry', 'date', 'elderberry', 'fig', 'grape', 'honeydew'];

  // ES2026 Iterator Helpers — generate items via iterator pipeline
  const items10K = Iterator.from({
    [Symbol.iterator]: function* () {
      for (let i = 0; i < 10_000; i++) yield i;
    },
  })
    .map((i: number) => ({
      id: itemId(`item-${i}`),
      value: `${words[i % words.length]} ${i} action`,
      keywords: [`kw-${i}`],
    }))
    .toArray();

  bench.add('filter 10K items (search engine)', () => {
    // ES2026 — using declaration for automatic disposal
    using engine = createSearchEngine();
    engine.index(items10K);
    engine.search('apple', items10K).toArray();
  });

  const items1K = items10K.slice(0, 1_000);

  bench.add('create machine + filter 1K', () => {
    using machine = createCommandMachine({ items: items1K });
    machine.send({ type: 'SEARCH_CHANGE', query: 'apple' });
  });

  const results = await bench.run();
  // ES2026 Iterator Helpers — use .values().forEach() for result iteration
  results.values().forEach((task) => {
    if (task.result) {
      const median = task.result.latency?.p50 ?? task.result.mean ?? 0;
      console.log(`${task.name}: ${median.toFixed(3)} ms (median)`);
    }
  });
}

run().catch(console.error);

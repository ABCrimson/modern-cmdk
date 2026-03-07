// Standalone tinybench 6.0.0 script for CI regression tracking
import './setup.js';
import { Bench } from 'tinybench';

const bench = new Bench({
  warmupIterations: 100,
  iterations: 1000,
});

// Note: These benchmarks import from built dist — run after `pnpm build`
async function run(): Promise<void> {
  const { createSearchEngine, createCommandMachine, itemId } = await import(
    '../../packages/command/dist/index.js'
  );

  const words = ['apple', 'banana', 'cherry', 'date', 'elderberry', 'fig', 'grape', 'honeydew'];
  const items10K = Array.from({ length: 10_000 }, (_, i) => ({
    id: itemId(`item-${i}`),
    value: `${words[i % words.length]} ${i} action`,
    keywords: [`kw-${i}`],
  }));

  bench.add('filter 10K items (search engine)', () => {
    const engine = createSearchEngine();
    engine.index(items10K);
    engine.search('apple', items10K).toArray();
    engine[Symbol.dispose]();
  });

  bench.add('create machine + filter 1K', () => {
    const items1K = items10K.slice(0, 1000);
    const machine = createCommandMachine({ items: items1K });
    machine.send({ type: 'SEARCH_CHANGE', query: 'apple' });
    machine[Symbol.dispose]();
  });

  const results = await bench.run();
  for (const task of results) {
    if (task.result) {
    }
  }
}

run().catch(console.error);

import type { CommandItem } from '@crimson_dev/command';
import { createSearchEngine, itemId } from '@crimson_dev/command';
import { createWasmSearchEngine } from '@crimson_dev/command-search-wasm';
import { bench, describe } from 'vitest';

// ---------------------------------------------------------------------------
// Item generation
// ---------------------------------------------------------------------------

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

// ES2026 Iterator Helpers — generate benchmark items via iterator pipeline
function generateItems(count: number): CommandItem[] {
  return Iterator.from({
    [Symbol.iterator]: function* () {
      for (let i = 0; i < count; i++) yield i;
    },
  })
    .map((i) => ({
      id: itemId(`item-${i}`),
      value: `${words[i % words.length]} ${Math.floor(i / 100)} action ${words[(i + 7) % words.length]}`,
      keywords: [`kw-${i % 500}`, `alias-${i % 200}`],
    }))
    .toArray();
}

const items100 = generateItems(100);
const items1K = generateItems(1_000);
const items10K = generateItems(10_000);

// ---------------------------------------------------------------------------
// Pre-initialize a shared WASM engine (async, resolved before benches run)
// ---------------------------------------------------------------------------

let wasmEngine: Awaited<ReturnType<typeof createWasmSearchEngine>>;

const wasmReady = createWasmSearchEngine().then((engine) => {
  wasmEngine = engine;
});

// ---------------------------------------------------------------------------
// 1. WASM index build time at each scale
// ---------------------------------------------------------------------------

describe('WASM Index Build', async () => {
  await wasmReady;

  bench('index 100 items', () => {
    wasmEngine.clear();
    wasmEngine.index(items100);
  });

  bench('index 1K items', () => {
    wasmEngine.clear();
    wasmEngine.index(items1K);
  });

  bench('index 10K items', () => {
    wasmEngine.clear();
    wasmEngine.index(items10K);
  });
});

// ---------------------------------------------------------------------------
// 2. WASM search vs default JS scorer — 1K items
// ---------------------------------------------------------------------------

describe('WASM vs JS Search — 1K Items', async () => {
  await wasmReady;

  bench('JS scorer — full pipeline', () => {
    using engine = createSearchEngine();
    engine.index(items1K);
    engine.search('apple', items1K).toArray();
  });

  bench('WASM scorer — full pipeline', () => {
    wasmEngine.clear();
    wasmEngine.index(items1K);
    wasmEngine.search('apple', items1K).toArray();
  });

  bench('JS scorer — incremental (a -> ap -> app)', () => {
    using engine = createSearchEngine();
    engine.index(items1K);
    engine.search('a', items1K).toArray();
    engine.search('ap', items1K).toArray();
    engine.search('app', items1K).toArray();
  });

  bench('WASM scorer — incremental (a -> ap -> app)', () => {
    wasmEngine.clear();
    wasmEngine.index(items1K);
    wasmEngine.search('a', items1K).toArray();
    wasmEngine.search('ap', items1K).toArray();
    wasmEngine.search('app', items1K).toArray();
  });
});

// ---------------------------------------------------------------------------
// 3. WASM vs JS Search — 10K Items
// ---------------------------------------------------------------------------

describe('WASM vs JS Search — 10K Items', async () => {
  await wasmReady;

  bench('JS scorer — full pipeline', () => {
    using engine = createSearchEngine();
    engine.index(items10K);
    engine.search('banana', items10K).toArray();
  });

  bench('WASM scorer — full pipeline', () => {
    wasmEngine.clear();
    wasmEngine.index(items10K);
    wasmEngine.search('banana', items10K).toArray();
  });

  bench('JS scorer — incremental (b -> ba -> ban -> bana)', () => {
    using engine = createSearchEngine();
    engine.index(items10K);
    engine.search('b', items10K).toArray();
    engine.search('ba', items10K).toArray();
    engine.search('ban', items10K).toArray();
    engine.search('bana', items10K).toArray();
  });

  bench('WASM scorer — incremental (b -> ba -> ban -> bana)', () => {
    wasmEngine.clear();
    wasmEngine.index(items10K);
    wasmEngine.search('b', items10K).toArray();
    wasmEngine.search('ba', items10K).toArray();
    wasmEngine.search('ban', items10K).toArray();
    wasmEngine.search('bana', items10K).toArray();
  });
});

// ---------------------------------------------------------------------------
// 4. WASM trigram search with various query lengths
// ---------------------------------------------------------------------------

describe('WASM Trigram Query Lengths — 10K Items', async () => {
  await wasmReady;

  // Pre-index once; each bench re-indexes to isolate measurement
  const queries = {
    '2-char query': 'ap',
    '5-char query': 'apple',
    '10-char query': 'elderberry',
  } as const;

  for (const [label, query] of Object.entries(queries)) {
    bench(`WASM search — ${label} ("${query}")`, () => {
      wasmEngine.clear();
      wasmEngine.index(items10K);
      wasmEngine.search(query, items10K).toArray();
    });

    bench(`JS search — ${label} ("${query}")`, () => {
      using engine = createSearchEngine();
      engine.index(items10K);
      engine.search(query, items10K).toArray();
    });
  }
});

// ---------------------------------------------------------------------------
// 5. WASM clear + re-index cycle time
// ---------------------------------------------------------------------------

describe('WASM Clear + Re-index Cycle', async () => {
  await wasmReady;

  bench('clear + re-index 100 items', () => {
    wasmEngine.clear();
    wasmEngine.index(items100);
  });

  bench('clear + re-index 1K items', () => {
    wasmEngine.clear();
    wasmEngine.index(items1K);
  });

  bench('clear + re-index 10K items', () => {
    wasmEngine.clear();
    wasmEngine.index(items10K);
  });

  bench('clear + re-index + search 1K items', () => {
    wasmEngine.clear();
    wasmEngine.index(items1K);
    wasmEngine.search('cherry', items1K).toArray();
  });

  bench('clear + re-index + search 10K items', () => {
    wasmEngine.clear();
    wasmEngine.index(items10K);
    wasmEngine.search('cherry', items10K).toArray();
  });

  // Multi-cycle: simulate rapid filter changes requiring full re-index
  bench('3x clear + re-index cycle — 1K items', () => {
    for (const query of ['fig', 'grape', 'honeydew']) {
      wasmEngine.clear();
      wasmEngine.index(items1K);
      wasmEngine.search(query, items1K).toArray();
    }
  });
});

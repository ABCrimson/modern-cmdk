// apps/playground/src/bench/dataset.ts
// The one benchmark dataset (TEB-33). Every measured item set in the repository comes from
// itemSeeds(): the vitest benches and the standalone `pnpm bench:compare` harness through
// benchmarks/fixtures.ts, and the playground's browser bench page directly.
//
// The table lives here, not in benchmarks/, because the playground's tsconfig has rootDir `src`: the
// playground cannot import anything under benchmarks/, while benchmarks/ can import this file. For the
// same reason this file has no imports (it cannot name modern-cmdk's ItemId or CommandItem types);
// benchmarks/fixtures.ts turns the seeds into CommandItem values.
//
// Each variant reproduces, byte for byte, the generator it replaced:
//   'basic'  8 words; the dataset of benchmarks/filter-10k.bench.ts and of
//            benchmarks/standalone/compare-baseline.ts, the dataset benchmarks/baseline.json was
//            recorded on (tests/unit/bench-compare-rules.test.ts pins its hash).
//            id `item-${i}`, value `${word} ${i} action`, keywords [`kw-${i}`].
//   'wide'   19 words; the dataset of benchmarks/filter-100k.bench.ts and
//            benchmarks/wasm-search.bench.ts. Values repeat every 100 items and carry a second word,
//            keywords repeat (500 and 200 distinct), which is what makes the 100K index heavy.
//            id `item-${i}`, value `${word} ${floor(i / 100)} action ${word2}`,
//            keywords [`kw-${i % 500}`, `alias-${i % 200}`].
//   'search' 8 words; the dataset of benchmarks/search.bench.ts (owned by the SEARCH cluster, which
//            switches to this variant with a one-line import).
//            id `item-${i}`, value `${word} ${i} ${word3} action`,
//            keywords [`keyword-${i}`, `alias-${i % 100}`].

export type DatasetVariant = 'basic' | 'wide' | 'search';

export interface ItemSeed {
  readonly id: string;
  readonly value: string;
  readonly keywords: readonly string[];
}

const WORDS_8: readonly string[] = [
  'apple',
  'banana',
  'cherry',
  'date',
  'elderberry',
  'fig',
  'grape',
  'honeydew',
];

const WORDS_19: readonly string[] = [
  ...WORDS_8,
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

function seed(i: number, variant: DatasetVariant): ItemSeed {
  const id = `item-${i}`;
  switch (variant) {
    case 'basic':
      return { id, value: `${WORDS_8[i % WORDS_8.length]} ${i} action`, keywords: [`kw-${i}`] };
    case 'wide':
      return {
        id,
        value: `${WORDS_19[i % WORDS_19.length]} ${Math.floor(i / 100)} action ${WORDS_19[(i + 7) % WORDS_19.length]}`,
        keywords: [`kw-${i % 500}`, `alias-${i % 200}`],
      };
    case 'search':
      return {
        id,
        value: `${WORDS_8[i % WORDS_8.length]} ${i} ${WORDS_8[(i + 3) % WORDS_8.length]} action`,
        keywords: [`keyword-${i}`, `alias-${i % 100}`],
      };
  }
}

/** The first `count` seeds of `variant`; the same call always returns equal data. */
export function itemSeeds(count: number, variant: DatasetVariant): ItemSeed[] {
  return Array.from({ length: count }, (_, i) => seed(i, variant));
}

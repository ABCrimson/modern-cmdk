// benchmarks/cmdk-head-to-head.bench.ts
// modern-cmdk against cmdk 1.1.1 (the original), measured with Vitest 5.1's bench.compare: both sides of a
// comparison are registered in one test, tinybench warms each side before it measures it, and the table
// prints the two results side by side. These timings used to run inside tests/unit/cmdk-performance-accuracy.test.tsx
// as one performance.now() sample per side; they live here because a timing cannot fail a unit test (PERF-6, T18).
//
// No assertion on speed: a verdict belongs to the pnpm bench:compare gate and the real-layout browser benches, and
// what the other library does is not ours to pin (PERF-13). What the unit file keeps is the correctness that sat beside
// those timings: tests/unit/cmdk-performance-accuracy.test.tsx.
//
// Equal work on both sides (T19): the same items, the same queries, the same keywords, every item visited per call.
// The items are the shared 'basic' dataset of benchmarks/fixtures.ts; cmdk receives each item's value as a plain
// string. On this dataset "app" and "banana" match (cmdk's looser fuzzy tier also matches "app" inside later
// values), while "open settings", "dshbrd" and "xyznotfound" match nothing in either library: those three are the
// miss path, which scans every item and finds none.
//
//   1. raw filter     cmdk defaultFilter(value, query, keywords) per item against scoreItem(query, item) per item
//   2. pipeline       cmdk filter + sort against an indexed engine's search(...).toArray()
//   3. typing         the five keystrokes "a" .. "apple", cmdk refiltering every item per keystroke against one
//                     indexed engine searching per keystroke
//   5. render         initial render of <Command> with 50 and 200 items in happy-dom, a fresh root per iteration,
//                     once with cmdk measured first and once with modern-cmdk first
//
// The engine benches create and index the engine in beforeAll, outside the timed function, and clear its incremental
// cache in beforeEach: search("") sets the previous query to "", so the next "apple" scores every item. Without that
// reset each iteration after the first would extend the previous query and re-score only its matches, a fraction of the
// work cmdk does. A synchronous task that has hooks sets `async: false`; otherwise tinybench calls it once while
// registering the task, outside the hooks, to find out whether it is async.

import { Command as CmdkCommand, defaultFilter as cmdkDefaultFilter } from 'cmdk';
import type { CommandItem, SearchEngine } from 'modern-cmdk';
import { createSearchEngine, itemId, scoreItem } from 'modern-cmdk';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { describe, test } from 'vitest';
// Not 'modern-cmdk/react': benchmarks/tsconfig.json maps only 'modern-cmdk' (to the built core declarations), so the
// type-check would not resolve that name. The perf project aliases 'modern-cmdk/react' to this very file, so the
// module the bench measures is the same one.
import { Command } from '../packages/modern-cmdk/src/react/index.ts';
import { generateItems } from './fixtures.ts';

/** The values and keywords cmdk filters: the same data as the CommandItems modern-cmdk scores. */
interface PlainItem {
  readonly value: string;
  readonly keywords: string[];
}

function toPlain(items: readonly CommandItem[]): PlainItem[] {
  return items.map((item) => ({ value: item.value, keywords: [...(item.keywords ?? [])] }));
}

/** What the last timed call matched. The functions write it so that no call is a pure discard. */
const sink = { matched: 0 };

// Read once: the perf project runs modules through Vite's module runner, where every read of an imported binding
// is an export-getter call, and a read per item would be measured as part of scoreItem (Vitest warns about it).
const score = scoreItem;

/** cmdk's work for one query: score every item. */
function cmdkFilterAll(plain: readonly PlainItem[], query: string): void {
  let matched = 0;
  for (const item of plain) {
    if (cmdkDefaultFilter(item.value, query, item.keywords) > 0) matched++;
  }
  sink.matched = matched;
}

/** modern-cmdk's work for one query without an engine: score every item. */
function scoreAll(items: readonly CommandItem[], query: string): void {
  let matched = 0;
  for (const item of items) {
    if (score(query, item) !== null) matched++;
  }
  sink.matched = matched;
}

/** cmdk's work for a search: score every item, keep the matches, sort them best first. */
function cmdkFilterAndSort(plain: readonly PlainItem[], query: string): void {
  const results: Array<{ value: string; score: number }> = [];
  for (const item of plain) {
    const score = cmdkDefaultFilter(item.value, query, item.keywords);
    if (score > 0) results.push({ value: item.value, score });
  }
  results.sort((a, b) => b.score - a.score);
  sink.matched = results.length;
}

/**
 * The tinybench hooks of a bench that searches one indexed engine: the engine is built once per phase and its
 * incremental cache is cleared before every iteration, so each iteration starts from a full scan.
 */
function engineHooks(items: readonly CommandItem[]) {
  let engine: SearchEngine | undefined;
  return {
    options: {
      async: false,
      beforeAll() {
        engine = createSearchEngine();
        engine.index(items);
      },
      beforeEach() {
        engine?.search('', items);
      },
      afterAll() {
        engine?.[Symbol.dispose]();
        engine = undefined;
      },
    },
    engine(): SearchEngine {
      if (!engine) throw new Error('search engine missing: beforeAll did not run');
      return engine;
    },
  };
}

// ─────────────────────────────────────────────────────────────
// 1. Raw filter throughput: scoreItem against defaultFilter
// ─────────────────────────────────────────────────────────────

describe('1. raw filter throughput (scoreItem vs defaultFilter)', () => {
  const queries = ['app', 'banana', 'open settings', 'dshbrd', 'xyznotfound'] as const;

  for (const size of [100, 1_000, 10_000] as const) {
    const items = generateItems(size, 'basic', itemId);
    const plain = toPlain(items);

    describe(`${size.toLocaleString()} items`, () => {
      for (const query of queries) {
        test(`query "${query}" — scoreItem vs cmdk defaultFilter`, async ({ bench }) => {
          await bench.compare(
            bench('cmdk', { async: false }, () => cmdkFilterAll(plain, query)),
            bench('modern-cmdk', { async: false }, () => scoreAll(items, query)),
          );
        });
      }
    });
  }
});

// ─────────────────────────────────────────────────────────────
// 2. Search pipeline: cmdk filter + sort against an indexed engine
// ─────────────────────────────────────────────────────────────

describe('2. search pipeline throughput', () => {
  for (const size of [1_000, 10_000] as const) {
    const items = generateItems(size, 'basic', itemId);
    const plain = toPlain(items);

    test(`${size.toLocaleString()} items — search "apple" and collect`, async ({ bench }) => {
      const { options, engine } = engineHooks(items);
      await bench.compare(
        bench('cmdk', { async: false }, () => cmdkFilterAndSort(plain, 'apple')),
        bench('modern-cmdk', options, () => {
          sink.matched = engine().search('apple', items).toArray().length;
        }),
      );
    });
  }
});

// ─────────────────────────────────────────────────────────────
// 3. Typing: five keystrokes, "a" .. "apple"
// ─────────────────────────────────────────────────────────────

describe('3. incremental search (simulated typing)', () => {
  const items = generateItems(10_000, 'basic', itemId);
  const plain = toPlain(items);
  const typingSequence = ['a', 'ap', 'app', 'appl', 'apple'] as const;

  test('10,000 items — five keystrokes', async ({ bench }) => {
    const { options, engine } = engineHooks(items);
    await bench.compare(
      bench('cmdk', { async: false }, () => {
        for (const query of typingSequence) cmdkFilterAll(plain, query);
      }),
      bench('modern-cmdk', options, () => {
        for (const query of typingSequence) {
          sink.matched = engine().search(query, items).toArray().length;
        }
      }),
    );
  });
});

// ─────────────────────────────────────────────────────────────
// 5. React initial render, happy-dom
// ─────────────────────────────────────────────────────────────

describe('5. React render performance (happy-dom)', () => {
  type Library = 'cmdk' | 'modern-cmdk';

  /**
   * A bench of one library's initial render. The root is created in beforeEach and unmounted in afterEach, so
   * every iteration mounts into a fresh container. One animation frame sits inside the timed region on purpose:
   * the machine's scheduler batches with requestAnimationFrame (happy-dom's is setImmediate-backed), so the frame
   * waits for modern-cmdk's batch, while cmdk is not rAF-batched and has rendered by the act() before it.
   */
  function renderBench(library: Library, items: readonly CommandItem[]) {
    let container: HTMLDivElement | undefined;
    let root: Root | undefined;

    const tree = () =>
      library === 'cmdk'
        ? createElement(
            CmdkCommand,
            null,
            createElement(CmdkCommand.Input, { placeholder: 'search...' }),
            createElement(
              CmdkCommand.List,
              null,
              items.map((item) =>
                createElement(CmdkCommand.Item, { key: item.id, value: item.value }, item.value),
              ),
            ),
          )
        : createElement(
            Command,
            null,
            createElement(Command.Input, { placeholder: 'search...' }),
            createElement(
              Command.List,
              null,
              items.map((item) =>
                createElement(Command.Item, { key: item.id, value: item.value }, item.value),
              ),
            ),
          );

    return {
      options: {
        beforeEach() {
          container = document.createElement('div');
          document.body.appendChild(container);
          root = createRoot(container);
        },
        async afterEach() {
          await act(async () => {
            root?.unmount();
          });
          container?.remove();
          container = undefined;
          root = undefined;
        },
      },
      async fn(): Promise<void> {
        if (!(container && root)) throw new Error('render root missing: beforeEach did not run');
        const mounted = root;
        const target = container;
        await act(async () => {
          mounted.render(tree());
        });
        await act(async () => {
          await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        });
        // A component that renders nothing would time as the fastest of all
        if (target.children.length === 0) throw new Error(`${library} rendered no element`);
      },
    };
  }

  for (const count of [50, 200] as const) {
    const items = generateItems(count, 'basic', itemId);

    // Both orders, so that neither library always measures second, after the other's allocations
    for (const order of [
      ['cmdk', 'modern-cmdk'],
      ['modern-cmdk', 'cmdk'],
    ] as const) {
      test(`initial render with ${count} items — ${order[0]} first`, async ({ bench }) => {
        const [first, second] = order;
        const a = renderBench(first, items);
        const b = renderBench(second, items);
        await bench.compare(bench(first, a.options, a.fn), bench(second, b.options, b.fn));
      });
    }
  }
});

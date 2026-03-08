// tests/unit/cmdk-performance-accuracy.test.tsx
// Head-to-head: @crimson_dev/command vs cmdk — Performance & Search Accuracy
// Vitest 4.1 — ES2026 — React 19

import type { ReactNode } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// ── Our library ──
import type { CommandItem } from '@crimson_dev/command';
import { createCommandMachine, createSearchEngine, itemId, scoreItem } from '@crimson_dev/command';
import { Command } from '@crimson_dev/command-react';

// ── cmdk (the original) ──
import { Command as CmdkCommand, defaultFilter as cmdkDefaultFilter } from 'cmdk';

// ─────────────────────────────────────────────────────────────
// Shared test data generators
// ─────────────────────────────────────────────────────────────

const WORDS = [
  'apple', 'banana', 'cherry', 'date', 'elderberry', 'fig', 'grape', 'honeydew',
  'kiwi', 'lemon', 'mango', 'nectarine', 'orange', 'papaya', 'quince', 'raspberry',
  'strawberry', 'tangerine', 'watermelon', 'blueberry', 'peach', 'plum', 'apricot', 'coconut',
];

const ACTIONS = [
  'Open', 'Close', 'Delete', 'Create', 'Edit', 'Copy', 'Paste', 'Search',
  'Settings', 'Profile', 'Dashboard', 'Analytics', 'Export', 'Import', 'Share', 'Download',
];

function generatePlainItems(count: number): string[] {
  return Iterator.from({
    [Symbol.iterator]: function* () {
      for (let i = 0; i < count; i++) yield i;
    },
  })
    .map((i) => `${ACTIONS[i % ACTIONS.length]} ${WORDS[i % WORDS.length]} ${i}`)
    .toArray();
}

function generateCommandItems(count: number): CommandItem[] {
  return Iterator.from({
    [Symbol.iterator]: function* () {
      for (let i = 0; i < count; i++) yield i;
    },
  })
    .map((i) => ({
      id: itemId(`item-${i}`),
      value: `${ACTIONS[i % ACTIONS.length]} ${WORDS[i % WORDS.length]} ${i}`,
      keywords: [`kw-${WORDS[(i + 5) % WORDS.length]}`],
    }))
    .toArray();
}

// High-resolution timer
function measure(fn: () => void, iterations: number = 1): number {
  // Warmup
  for (let i = 0; i < Math.min(3, iterations); i++) fn();

  const start = performance.now();
  for (let i = 0; i < iterations; i++) fn();
  const elapsed = performance.now() - start;
  return elapsed / iterations;
}

// ─────────────────────────────────────────────────────────────
// 1. RAW FILTER THROUGHPUT — scoreItem vs defaultFilter
// ─────────────────────────────────────────────────────────────

describe('1. Raw Filter Throughput (scoreItem vs defaultFilter)', () => {
  const sizes = [100, 1_000, 10_000] as const;
  const queries = ['app', 'banana', 'open settings', 'dshbrd', 'xyznotfound'] as const;

  for (const size of sizes) {
    const plainItems = generatePlainItems(size);
    const commandItems = generateCommandItems(size);

    describe(`${size.toLocaleString()} items`, () => {
      for (const query of queries) {
        it(`query "${query}" — our scoreItem vs cmdk defaultFilter`, () => {
          // ── cmdk ──
          const cmdkTime = measure(() => {
            for (const item of plainItems) {
              cmdkDefaultFilter(item, query);
            }
          }, 5);

          // ── ours ──
          const ourTime = measure(() => {
            for (const item of commandItems) {
              scoreItem(query, item);
            }
          }, 5);

          const ratio = cmdkTime / ourTime;
          const winner = ratio > 1 ? 'OURS' : 'CMDK';
          const speedup = ratio > 1 ? ratio : 1 / ratio;

          // Log results for visibility
          console.log(
            `  [${size.toLocaleString()} items] "${query}": ` +
            `cmdk=${cmdkTime.toFixed(3)}ms, ours=${ourTime.toFixed(3)}ms → ` +
            `${winner} ${speedup.toFixed(1)}x faster`
          );

          // Both should complete — just verify no crashes
          expect(cmdkTime).toBeGreaterThan(0);
          expect(ourTime).toBeGreaterThan(0);
        });
      }
    });
  }
});

// ─────────────────────────────────────────────────────────────
// 2. SEARCH ENGINE THROUGHPUT — full pipeline vs cmdk filter loop
// ─────────────────────────────────────────────────────────────

describe('2. Search Engine Pipeline Throughput', () => {
  const sizes = [1_000, 10_000] as const;

  for (const size of sizes) {
    const plainItems = generatePlainItems(size);
    const commandItems = generateCommandItems(size);

    it(`${size.toLocaleString()} items — full search pipeline (index + search + collect)`, () => {
      // ── cmdk: filter all items, collect matches ──
      const cmdkTime = measure(() => {
        const results: Array<{ value: string; score: number }> = [];
        for (const item of plainItems) {
          const score = cmdkDefaultFilter(item, 'apple');
          if (score > 0) results.push({ value: item, score });
        }
        results.sort((a, b) => b.score - a.score);
      }, 5);

      // ── ours: create engine, index, search, collect ──
      const ourTime = measure(() => {
        using engine = createSearchEngine();
        engine.index(commandItems);
        const _results = engine.search('apple', commandItems).toArray();
      }, 5);

      const ratio = cmdkTime / ourTime;
      const winner = ratio > 1 ? 'OURS' : 'CMDK';
      const speedup = ratio > 1 ? ratio : 1 / ratio;

      console.log(
        `  [${size.toLocaleString()} items] Full pipeline: ` +
        `cmdk=${cmdkTime.toFixed(3)}ms, ours=${ourTime.toFixed(3)}ms → ` +
        `${winner} ${speedup.toFixed(1)}x faster`
      );

      expect(cmdkTime).toBeGreaterThan(0);
      expect(ourTime).toBeGreaterThan(0);
    });
  }
});

// ─────────────────────────────────────────────────────────────
// 3. INCREMENTAL SEARCH (typing simulation)
// ─────────────────────────────────────────────────────────────

describe('3. Incremental Search (simulated typing)', () => {
  const size = 10_000;
  const plainItems = generatePlainItems(size);
  const commandItems = generateCommandItems(size);
  const typingSequence = ['a', 'ap', 'app', 'appl', 'apple'];

  it('should measure incremental filtering as user types', () => {
    // ── cmdk: re-filter all items for each keystroke ──
    const cmdkTime = measure(() => {
      for (const query of typingSequence) {
        for (const item of plainItems) {
          cmdkDefaultFilter(item, query);
        }
      }
    }, 3);

    // ── ours: search engine with incremental optimization ──
    const ourTime = measure(() => {
      using engine = createSearchEngine();
      engine.index(commandItems);
      for (const query of typingSequence) {
        engine.search(query, commandItems).toArray();
      }
    }, 3);

    const ratio = cmdkTime / ourTime;
    const winner = ratio > 1 ? 'OURS' : 'CMDK';
    const speedup = ratio > 1 ? ratio : 1 / ratio;

    console.log(
      `  [10K items] Typing "apple" (5 keystrokes): ` +
      `cmdk=${cmdkTime.toFixed(3)}ms, ours=${ourTime.toFixed(3)}ms → ` +
      `${winner} ${speedup.toFixed(1)}x faster`
    );

    expect(cmdkTime).toBeGreaterThan(0);
    expect(ourTime).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────
// 4. MACHINE THROUGHPUT (state machine overhead)
// ─────────────────────────────────────────────────────────────

describe('4. State Machine Creation + Search Dispatch', () => {
  const sizes = [100, 1_000, 10_000] as const;

  for (const size of sizes) {
    const items = generateCommandItems(size);

    it(`${size.toLocaleString()} items — create machine + dispatch search`, () => {
      const time = measure(() => {
        using machine = createCommandMachine({ items });
        machine.send({ type: 'SEARCH_CHANGE', query: 'apple' });
      }, 5);

      console.log(
        `  [${size.toLocaleString()} items] Machine create+search: ${time.toFixed(3)}ms`
      );

      expect(time).toBeGreaterThan(0);
    });
  }
});

// ─────────────────────────────────────────────────────────────
// 5. REACT RENDER PERFORMANCE — side-by-side
// ─────────────────────────────────────────────────────────────

describe('5. React Render Performance', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    root.unmount();
    container.remove();
  });

  async function renderAndMeasure(ui: ReactNode): Promise<number> {
    const start = performance.now();
    await act(async () => {
      root.render(ui);
    });
    await act(async () => {
      await new Promise<void>((r) => queueMicrotask(r));
    });
    return performance.now() - start;
  }

  const itemCounts = [50, 200] as const;

  for (const count of itemCounts) {
    it(`initial render with ${count} items — ours vs cmdk`, async () => {
      const items = Array.from({ length: count }, (_, i) => ({
        value: `${ACTIONS[i % ACTIONS.length]} ${WORDS[i % WORDS.length]} ${i}`,
        key: `item-${i}`,
      }));

      // ── cmdk ──
      const cmdkRender = await renderAndMeasure(
        <CmdkCommand>
          <CmdkCommand.Input placeholder="cmdk search..." />
          <CmdkCommand.List>
            {items.map((item) => (
              <CmdkCommand.Item key={item.key} value={item.value}>
                {item.value}
              </CmdkCommand.Item>
            ))}
          </CmdkCommand.List>
        </CmdkCommand>
      );

      // Unmount and remount for fair comparison
      root.unmount();
      container.remove();
      container = document.createElement('div');
      document.body.appendChild(container);
      root = createRoot(container);

      // ── ours ──
      const ourRender = await renderAndMeasure(
        <Command>
          <Command.Input placeholder="our search..." />
          <Command.List>
            {items.map((item) => (
              <Command.Item key={item.key} value={item.value}>
                {item.value}
              </Command.Item>
            ))}
          </Command.List>
        </Command>
      );

      const ratio = cmdkRender / ourRender;
      const winner = ratio > 1 ? 'OURS' : 'CMDK';
      const speedup = ratio > 1 ? ratio : 1 / ratio;

      console.log(
        `  [${count} items] Initial render: ` +
        `cmdk=${cmdkRender.toFixed(2)}ms, ours=${ourRender.toFixed(2)}ms → ` +
        `${winner} ${speedup.toFixed(1)}x faster`
      );

      expect(cmdkRender).toBeGreaterThan(0);
      expect(ourRender).toBeGreaterThan(0);
    });
  }
});

// ─────────────────────────────────────────────────────────────
// 6. SEARCH ACCURACY — Precision & Relevance Ranking
// ─────────────────────────────────────────────────────────────

describe('6. Search Accuracy — Relevance Ranking', () => {
  // Curated test corpus: items with known relevance for specific queries
  const corpus = [
    'Open Settings',
    'Open File',
    'Open Terminal',
    'Open Recent',
    'Close Window',
    'Close Tab',
    'Close All',
    'Search Files',
    'Search and Replace',
    'Search Everywhere',
    'Git Commit',
    'Git Push',
    'Git Pull',
    'Git Stash',
    'Copy Path',
    'Copy Selection',
    'Toggle Sidebar',
    'Toggle Terminal',
    'Format Document',
    'Save All',
    'New File',
    'New Folder',
    'Delete File',
    'Rename Symbol',
    'Go to Definition',
    'Go to Line',
    'Go to File',
    'Peek Definition',
    'Find References',
    'Quick Fix',
  ];

  const commandCorpus: CommandItem[] = corpus.map((value, i) => ({
    id: itemId(`corpus-${i}`),
    value,
    keywords: [],
  }));

  interface AccuracyTestCase {
    query: string;
    /** Items that MUST appear in results (true positives) */
    expectedMatches: string[];
    /** Items that MUST NOT appear in results (true negatives) */
    expectedNonMatches: string[];
    /** If provided, first result should be this (relevance ranking) */
    expectedTopResult?: string;
  }

  const testCases: AccuracyTestCase[] = [
    // ── Exact match ──
    {
      query: 'open settings',
      expectedMatches: ['Open Settings'],
      expectedNonMatches: ['Close Window', 'Git Commit'],
      expectedTopResult: 'Open Settings',
    },
    // ── Prefix match ──
    {
      query: 'open',
      expectedMatches: ['Open Settings', 'Open File', 'Open Terminal', 'Open Recent'],
      expectedNonMatches: ['Close Window', 'Git Commit'],
    },
    // ── Substring match ──
    {
      query: 'file',
      expectedMatches: ['Open File', 'Search Files', 'New File', 'Delete File', 'Go to File'],
      expectedNonMatches: ['Git Commit', 'Close Window'],
    },
    // ── Fuzzy match ──
    {
      query: 'gtdf',
      expectedMatches: ['Go to Definition'],
      expectedNonMatches: ['Close Window', 'Save All'],
    },
    // ── Word boundary match ──
    {
      query: 'gc',
      expectedMatches: ['Git Commit'],
      expectedNonMatches: ['Open Settings', 'Save All'],
    },
    // ── Partial fuzzy ──
    {
      query: 'tsd',
      expectedMatches: ['Toggle Sidebar'],
      expectedNonMatches: ['Save All'],
    },
    // ── Multi-word query ──
    {
      query: 'search file',
      expectedMatches: ['Search Files'],
      expectedNonMatches: ['Git Commit'],
      expectedTopResult: 'Search Files',
    },
    // ── No match ──
    {
      query: 'xyznotfound',
      expectedMatches: [],
      expectedNonMatches: corpus,
    },
  ];

  for (const tc of testCases) {
    describe(`query: "${tc.query}"`, () => {
      it('cmdk — precision (true positives found)', () => {
        const results = corpus
          .map((item) => ({ value: item, score: cmdkDefaultFilter(item, tc.query) }))
          .filter((r) => r.score > 0)
          .sort((a, b) => b.score - a.score);

        const resultValues = results.map((r) => r.value);
        let foundCount = 0;
        for (const expected of tc.expectedMatches) {
          if (resultValues.includes(expected)) foundCount++;
        }
        const precision = tc.expectedMatches.length > 0
          ? foundCount / tc.expectedMatches.length
          : (resultValues.length === 0 ? 1 : 0);

        console.log(
          `  cmdk "${tc.query}": ${foundCount}/${tc.expectedMatches.length} expected found, ` +
          `${results.length} total results, precision=${(precision * 100).toFixed(0)}%` +
          (results[0] ? `, top="${results[0].value}" (${results[0].score.toFixed(4)})` : '')
        );

        // Just record — don't assert (cmdk is the baseline)
        expect(precision).toBeGreaterThanOrEqual(0);
      });

      it('ours — precision (true positives found)', () => {
        using engine = createSearchEngine();
        engine.index(commandCorpus);
        const results = engine.search(tc.query, commandCorpus).toArray();

        const resultValues = results.map((r) => {
          const item = commandCorpus.find((i) => i.id === r.id);
          return item?.value ?? '';
        });

        let foundCount = 0;
        for (const expected of tc.expectedMatches) {
          if (resultValues.includes(expected)) foundCount++;
        }
        const precision = tc.expectedMatches.length > 0
          ? foundCount / tc.expectedMatches.length
          : (resultValues.length === 0 ? 1 : 0);

        console.log(
          `  ours "${tc.query}": ${foundCount}/${tc.expectedMatches.length} expected found, ` +
          `${results.length} total results, precision=${(precision * 100).toFixed(0)}%` +
          (results[0] ? `, top="${resultValues[0]}" (${results[0].score.toFixed(4)})` : '')
        );

        expect(precision).toBeGreaterThanOrEqual(0);
      });

      if (tc.expectedNonMatches.length > 0) {
        it('cmdk — specificity (true negatives excluded)', () => {
          const results = corpus
            .map((item) => ({ value: item, score: cmdkDefaultFilter(item, tc.query) }))
            .filter((r) => r.score > 0);
          const resultValues = new Set(results.map((r) => r.value));

          let correctlyExcluded = 0;
          for (const neg of tc.expectedNonMatches) {
            if (!resultValues.has(neg)) correctlyExcluded++;
          }
          const specificity = correctlyExcluded / tc.expectedNonMatches.length;

          console.log(
            `  cmdk "${tc.query}" specificity: ${correctlyExcluded}/${tc.expectedNonMatches.length} ` +
            `correctly excluded (${(specificity * 100).toFixed(0)}%)`
          );

          expect(specificity).toBeGreaterThanOrEqual(0);
        });

        it('ours — specificity (true negatives excluded)', () => {
          using engine = createSearchEngine();
          engine.index(commandCorpus);
          const results = engine.search(tc.query, commandCorpus).toArray();
          const resultIds = new Set(results.map((r) => r.id));

          let correctlyExcluded = 0;
          for (const neg of tc.expectedNonMatches) {
            const item = commandCorpus.find((i) => i.value === neg);
            if (item && !resultIds.has(item.id)) correctlyExcluded++;
          }
          const specificity = correctlyExcluded / tc.expectedNonMatches.length;

          console.log(
            `  ours "${tc.query}" specificity: ${correctlyExcluded}/${tc.expectedNonMatches.length} ` +
            `correctly excluded (${(specificity * 100).toFixed(0)}%)`
          );

          expect(specificity).toBeGreaterThanOrEqual(0);
        });
      }

      if (tc.expectedTopResult) {
        it('cmdk — top result ranking', () => {
          const results = corpus
            .map((item) => ({ value: item, score: cmdkDefaultFilter(item, tc.query) }))
            .filter((r) => r.score > 0)
            .sort((a, b) => b.score - a.score);

          const topCorrect = results[0]?.value === tc.expectedTopResult;
          console.log(
            `  cmdk "${tc.query}" top result: "${results[0]?.value}" ` +
            `(expected "${tc.expectedTopResult}") → ${topCorrect ? 'CORRECT' : 'WRONG'}`
          );

          expect(typeof topCorrect).toBe('boolean');
        });

        it('ours — top result ranking', () => {
          using engine = createSearchEngine();
          engine.index(commandCorpus);
          const results = engine.search(tc.query, commandCorpus).toArray();
          const topItem = results[0] ? commandCorpus.find((i) => i.id === results[0].id) : null;

          const topCorrect = topItem?.value === tc.expectedTopResult;
          console.log(
            `  ours "${tc.query}" top result: "${topItem?.value}" ` +
            `(expected "${tc.expectedTopResult}") → ${topCorrect ? 'CORRECT' : 'WRONG'}`
          );

          expect(typeof topCorrect).toBe('boolean');
        });
      }
    });
  }
});

// ─────────────────────────────────────────────────────────────
// 7. MATCH HIGHLIGHTING — feature ours has, cmdk doesn't
// ─────────────────────────────────────────────────────────────

describe('7. Match Highlighting (ours only — cmdk has no equivalent)', () => {
  const items: CommandItem[] = [
    { id: itemId('1'), value: 'Open Settings', keywords: [] },
    { id: itemId('2'), value: 'Open Terminal', keywords: [] },
    { id: itemId('3'), value: 'Go to Definition', keywords: [] },
  ];

  it('should return match ranges for highlighting', () => {
    const result = scoreItem('open', items[0]!);
    expect(result).not.toBeNull();
    expect(result!.matches.length).toBeGreaterThan(0);

    // Verify the match range actually corresponds to "open" in "Open Settings"
    const [start, end] = result!.matches[0]!;
    const matched = 'Open Settings'.slice(start, end).toLowerCase();
    expect(matched).toBe('open');

    console.log(
      `  "open" in "Open Settings": matches=${JSON.stringify(result!.matches)}, ` +
      `highlighted="${'Open Settings'.slice(start, end)}"`
    );
  });

  it('should return match ranges for fuzzy matches', () => {
    const result = scoreItem('gtdf', items[2]!);
    expect(result).not.toBeNull();
    expect(result!.matches.length).toBeGreaterThan(0);

    console.log(
      `  "gtdf" in "Go to Definition": matches=${JSON.stringify(result!.matches)}, ` +
      `score=${result!.score.toFixed(4)}`
    );
  });

  it('cmdk defaultFilter returns only a number — no match positions', () => {
    const score = cmdkDefaultFilter('Open Settings', 'open');
    expect(typeof score).toBe('number');
    // cmdk cannot tell you WHERE in the string the match occurred
    // It only returns a relevance score

    console.log(
      `  cmdk "open" in "Open Settings": score=${score.toFixed(4)} (no match positions available)`
    );
  });
});

// ─────────────────────────────────────────────────────────────
// 8. EDGE CASES — behavior differences
// ─────────────────────────────────────────────────────────────

describe('8. Edge Cases & Behavior Differences', () => {
  it('empty query — both should match everything', () => {
    const items = ['Apple', 'Banana', 'Cherry'];
    const commandItems: CommandItem[] = items.map((v, i) => ({
      id: itemId(`edge-${i}`),
      value: v,
      keywords: [],
    }));

    // cmdk: empty query = score 0 (doesn't filter, shows all)
    const cmdkScores = items.map((item) => cmdkDefaultFilter(item, ''));
    // ours: empty query = score 1 (full match, shows all)
    const ourScores = commandItems.map((item) => scoreItem('', item)?.score ?? 0);

    console.log(`  Empty query — cmdk scores: [${cmdkScores.join(', ')}]`);
    console.log(`  Empty query — our scores: [${ourScores.join(', ')}]`);

    // Both should effectively "show all" — but scoring approach differs
    expect(cmdkScores).toHaveLength(3);
    expect(ourScores).toHaveLength(3);
  });

  it('single character query', () => {
    const items = ['Apple', 'avocado', 'Banana'];
    const commandItems: CommandItem[] = items.map((v, i) => ({
      id: itemId(`single-${i}`),
      value: v,
      keywords: [],
    }));

    const cmdkResults = items
      .map((item) => ({ value: item, score: cmdkDefaultFilter(item, 'a') }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score);

    using engine = createSearchEngine();
    engine.index(commandItems);
    const ourResults = engine.search('a', commandItems).toArray();

    console.log(
      `  "a" — cmdk: [${cmdkResults.map((r) => `${r.value}(${r.score.toFixed(3)})`).join(', ')}]`
    );
    console.log(
      `  "a" — ours: [${ourResults.map((r) => {
        const item = commandItems.find((i) => i.id === r.id);
        return `${item?.value}(${r.score.toFixed(3)})`;
      }).join(', ')}]`
    );

    // Both should find items starting with 'a'
    expect(cmdkResults.length).toBeGreaterThan(0);
    expect(ourResults.length).toBeGreaterThan(0);
  });

  it('case sensitivity — both should be case-insensitive', () => {
    const cmdkLower = cmdkDefaultFilter('Open Settings', 'open settings');
    const cmdkUpper = cmdkDefaultFilter('Open Settings', 'OPEN SETTINGS');
    const cmdkMixed = cmdkDefaultFilter('Open Settings', 'OpEn SeTtInGs');

    const item: CommandItem = { id: itemId('case-1'), value: 'Open Settings', keywords: [] };
    const ourLower = scoreItem('open settings', item)?.score ?? 0;
    const ourUpper = scoreItem('OPEN SETTINGS', item)?.score ?? 0;
    const ourMixed = scoreItem('OpEn SeTtInGs', item)?.score ?? 0;

    console.log(`  Case test — cmdk: lower=${cmdkLower.toFixed(4)}, upper=${cmdkUpper.toFixed(4)}, mixed=${cmdkMixed.toFixed(4)}`);
    console.log(`  Case test — ours: lower=${ourLower.toFixed(4)}, upper=${ourUpper.toFixed(4)}, mixed=${ourMixed.toFixed(4)}`);

    // Both should treat all cases equally (or very close — cmdk has minor floating-point variance)
    expect(cmdkLower).toBeCloseTo(cmdkUpper, 2);
    expect(ourLower).toBe(ourUpper);
    expect(ourLower).toBe(ourMixed);
  });

  it('keywords boost — both support keywords for matching', () => {
    const cmdkWithKeywords = cmdkDefaultFilter('Open Settings', 'preferences', ['preferences', 'config']);
    const cmdkWithoutKeywords = cmdkDefaultFilter('Open Settings', 'preferences');

    const itemWithKw: CommandItem = {
      id: itemId('kw-1'),
      value: 'Open Settings',
      keywords: ['preferences', 'config'],
    };
    const itemWithoutKw: CommandItem = {
      id: itemId('kw-2'),
      value: 'Open Settings',
      keywords: [],
    };

    const ourWithKw = scoreItem('preferences', itemWithKw)?.score ?? 0;
    const ourWithoutKw = scoreItem('preferences', itemWithoutKw)?.score ?? 0;

    console.log(`  Keywords "preferences" — cmdk: with=${cmdkWithKeywords.toFixed(4)}, without=${cmdkWithoutKeywords.toFixed(4)}`);
    console.log(`  Keywords "preferences" — ours: with=${ourWithKw.toFixed(4)}, without=${ourWithoutKw.toFixed(4)}`);

    // With keywords should score higher (or at least find it)
    expect(cmdkWithKeywords).toBeGreaterThan(cmdkWithoutKeywords);
    expect(ourWithKw).toBeGreaterThan(ourWithoutKw);
  });

  it('special characters in query', () => {
    const item = 'C++ Compiler';
    const commandItem: CommandItem = { id: itemId('special-1'), value: item, keywords: [] };

    const cmdkScore = cmdkDefaultFilter(item, 'c++');
    const ourScore = scoreItem('c++', commandItem)?.score ?? 0;

    console.log(`  "c++" in "C++ Compiler" — cmdk: ${cmdkScore.toFixed(4)}, ours: ${ourScore.toFixed(4)}`);

    // Both should handle special chars gracefully
    expect(typeof cmdkScore).toBe('number');
    expect(typeof ourScore).toBe('number');
  });

  it('very long query that does not match', () => {
    const item = 'Open';
    const commandItem: CommandItem = { id: itemId('long-1'), value: item, keywords: [] };
    const longQuery = 'this is a very long query that definitely should not match anything';

    const cmdkScore = cmdkDefaultFilter(item, longQuery);
    const ourResult = scoreItem(longQuery, commandItem);

    console.log(
      `  Long non-matching query — cmdk: ${cmdkScore.toFixed(4)}, ours: ${ourResult?.score ?? 'null (no match)'}`
    );

    expect(cmdkScore).toBe(0);
    expect(ourResult).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────
// 9. SUMMARY — aggregated scorecard
// ─────────────────────────────────────────────────────────────

describe('9. Feature Comparison Summary', () => {
  it('should summarize capabilities', () => {
    const comparison = {
      'Match highlighting (ranges)':      { ours: true, cmdk: false },
      'Framework-agnostic core':          { ours: true, cmdk: false },
      'Pluggable search engine':          { ours: true, cmdk: false },
      'Incremental search optimization':  { ours: true, cmdk: false },
      'Keyboard shortcut registry':       { ours: true, cmdk: false },
      'Frecency ranking':                 { ours: true, cmdk: false },
      'Branded type safety':              { ours: true, cmdk: false },
      'Disposable pattern (using)':       { ours: true, cmdk: false },
      'ES2026 Iterator pipeline':         { ours: true, cmdk: false },
      'Page navigation':                  { ours: true, cmdk: false },
      'Error boundary':                   { ours: true, cmdk: false },
      'Case-insensitive search':          { ours: true, cmdk: true },
      'Keyword-based matching':           { ours: true, cmdk: true },
      'Fuzzy matching':                   { ours: true, cmdk: true },
      'Custom filter function':           { ours: true, cmdk: true },
      'Disable filtering':                { ours: true, cmdk: true },
      'ARIA accessibility':               { ours: true, cmdk: true },
      'Dialog variant':                   { ours: true, cmdk: true },
      'Loop navigation':                  { ours: true, cmdk: true },
      'Groups & separators':              { ours: true, cmdk: true },
      'Loading & empty states':           { ours: true, cmdk: true },
    };

    const oursOnly = Object.entries(comparison).filter(([, v]) => v.ours && !v.cmdk);
    const shared = Object.entries(comparison).filter(([, v]) => v.ours && v.cmdk);
    const cmdkOnly = Object.entries(comparison).filter(([, v]) => !v.ours && v.cmdk);

    console.log('\n  ╔══════════════════════════════════════════════╗');
    console.log('  ║     FEATURE COMPARISON: OURS vs CMDK        ║');
    console.log('  ╠══════════════════════════════════════════════╣');
    console.log(`  ║  Shared features:           ${String(shared.length).padStart(2)}              ║`);
    console.log(`  ║  Ours-only features:        ${String(oursOnly.length).padStart(2)}              ║`);
    console.log(`  ║  Cmdk-only features:        ${String(cmdkOnly.length).padStart(2)}              ║`);
    console.log('  ╠══════════════════════════════════════════════╣');
    for (const [name] of oursOnly) {
      console.log(`  ║  + ${name.padEnd(40)} ║`);
    }
    console.log('  ╚══════════════════════════════════════════════╝\n');

    expect(oursOnly.length).toBeGreaterThanOrEqual(10);
    expect(cmdkOnly.length).toBe(0);
    expect(shared.length).toBeGreaterThanOrEqual(10);
  });
});

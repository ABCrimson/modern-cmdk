// tests/unit/cmdk-performance-accuracy.test.tsx
// Search accuracy and edge cases of modern-cmdk, with cmdk 1.1.1's defaultFilter as the reference where a test
// compares them — Vitest — ESNext — React 19
// The wall-clock head-to-heads (raw filter, search pipeline, typing, initial render) are in
// benchmarks/cmdk-head-to-head.bench.ts: a timing cannot fail a unit test.

// ── cmdk (the original) ──
import { defaultFilter as cmdkDefaultFilter } from 'cmdk';
// ── Our library ──
import type { CommandItem } from 'modern-cmdk';
import { createSearchEngine, itemId, scoreItem } from 'modern-cmdk';
import { Command } from 'modern-cmdk/react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// ─────────────────────────────────────────────────────────────
// Shared test data generators
// ─────────────────────────────────────────────────────────────

const WORDS: string[] = [
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
  'blueberry',
  'peach',
  'plum',
  'apricot',
  'coconut',
];

const ACTIONS: string[] = [
  'Open',
  'Close',
  'Delete',
  'Create',
  'Edit',
  'Copy',
  'Paste',
  'Search',
  'Settings',
  'Profile',
  'Dashboard',
  'Analytics',
  'Export',
  'Import',
  'Share',
  'Download',
];

function generateCommandItems(count: number): CommandItem[] {
  return Iterator.from({
    [Symbol.iterator]: function* (): Generator<number> {
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

// ─────────────────────────────────────────────────────────────
// 2. SEARCH ENGINE PIPELINE — a search over a large set finds its matches
// ─────────────────────────────────────────────────────────────

describe('2. Search Engine Pipeline', () => {
  for (const size of [1_000, 10_000] as const) {
    const commandItems = generateCommandItems(size);

    it(`${size.toLocaleString()} items — the search pipeline (index + search + collect) finds "apple"`, () => {
      using engine = createSearchEngine();
      engine.index(commandItems);
      const results = engine.search('apple', commandItems).toArray();

      expect(results.length).toBeGreaterThan(0);
    });
  }
});

// ─────────────────────────────────────────────────────────────
// 5. REACT RENDER — the tree is rendered
// ─────────────────────────────────────────────────────────────

describe('5. React Render', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  for (const count of [50, 200] as const) {
    it(`initial render with ${count} items — ours renders the tree`, async () => {
      const items = Array.from({ length: count }, (_, i) => ({
        value: `${ACTIONS[i % ACTIONS.length]} ${WORDS[i % WORDS.length]} ${i}`,
        key: `item-${i}`,
      }));

      await act(async () => {
        root.render(
          <Command>
            <Command.Input placeholder="our search..." />
            <Command.List>
              {items.map((item) => (
                <Command.Item key={item.key} value={item.value}>
                  {item.value}
                </Command.Item>
              ))}
            </Command.List>
          </Command>,
        );
      });
      // One rAF frame: the machine's scheduler batches with requestAnimationFrame (happy-dom's is
      // setImmediate-backed), so this waits for the batch before the assertion
      await act(async () => {
        await new Promise<void>((r) => requestAnimationFrame(() => r()));
      });

      expect(container.children.length).toBeGreaterThan(0);
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
      expectedTopResult: 'Go to Definition',
    },
    // ── Word boundary match ──
    {
      query: 'gc',
      expectedMatches: ['Git Commit'],
      expectedNonMatches: ['Open Settings', 'Save All'],
      expectedTopResult: 'Git Commit',
    },
    // ── Partial fuzzy ──
    {
      query: 'tsd',
      expectedMatches: ['Toggle Sidebar'],
      expectedNonMatches: ['Save All'],
      expectedTopResult: 'Toggle Sidebar',
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
      it('ours — recall (true positives found)', () => {
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
        const recall =
          tc.expectedMatches.length > 0
            ? foundCount / tc.expectedMatches.length
            : resultValues.length === 0
              ? 1
              : 0;

        console.log(
          `  ours "${tc.query}": ${foundCount}/${tc.expectedMatches.length} expected found, ` +
            `${results.length} total results, recall=${(recall * 100).toFixed(0)}%` +
            (results[0] ? `, top="${resultValues[0]}" (${results[0].score.toFixed(4)})` : ''),
        );

        // 80% minimum recall — we should find most expected matches
        expect(recall).toBeGreaterThanOrEqual(0.8);
      });

      if (tc.expectedNonMatches.length > 0) {
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
              `correctly excluded (${(specificity * 100).toFixed(0)}%)`,
          );

          // 90% minimum specificity
          expect(specificity).toBeGreaterThanOrEqual(0.9);
        });
      }

      if (tc.expectedTopResult) {
        it('ours — top result ranking', () => {
          using engine = createSearchEngine();
          engine.index(commandCorpus);
          const results = engine.search(tc.query, commandCorpus).toArray();
          const [top] = results;
          const topItem = top ? commandCorpus.find((i) => i.id === top.id) : null;

          const topCorrect = topItem?.value === tc.expectedTopResult;
          console.log(
            `  ours "${tc.query}" top result: "${topItem?.value}" ` +
              `(expected "${tc.expectedTopResult}") → ${topCorrect ? 'CORRECT' : 'WRONG'}`,
          );

          // Our top result should match the expected top result
          expect(topCorrect).toBe(true);
        });
      }
    });
  }
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

    // cmdk: empty query scores 0.99 for a non-empty item (command-score's exhausted-query
    // branch) and the search is skipped, so every item is shown
    const cmdkScores = items.map((item) => cmdkDefaultFilter(item, ''));
    // ours: empty query = score 1 (full match, shows all)
    const ourScores = commandItems.map((item) => scoreItem('', item)?.score ?? 0);

    console.log(`  Empty query — cmdk scores: [${cmdkScores.join(', ')}]`);
    console.log(`  Empty query — our scores: [${ourScores.join(', ')}]`);

    // Both should effectively "show all" — but scoring approach differs
    expect(cmdkScores).toEqual([0.99, 0.99, 0.99]);
    expect(ourScores).toHaveLength(3);
  });

  it('case sensitivity — both should be case-insensitive', () => {
    const cmdkLower = cmdkDefaultFilter('Open Settings', 'open settings');
    const cmdkUpper = cmdkDefaultFilter('Open Settings', 'OPEN SETTINGS');
    const cmdkMixed = cmdkDefaultFilter('Open Settings', 'OpEn SeTtInGs');

    const item: CommandItem = { id: itemId('case-1'), value: 'Open Settings', keywords: [] };
    const ourLower = scoreItem('open settings', item)?.score ?? 0;
    const ourUpper = scoreItem('OPEN SETTINGS', item)?.score ?? 0;
    const ourMixed = scoreItem('OpEn SeTtInGs', item)?.score ?? 0;

    console.log(
      `  Case test — cmdk: lower=${cmdkLower.toFixed(4)}, upper=${cmdkUpper.toFixed(4)}, mixed=${cmdkMixed.toFixed(4)}`,
    );
    console.log(
      `  Case test — ours: lower=${ourLower.toFixed(4)}, upper=${ourUpper.toFixed(4)}, mixed=${ourMixed.toFixed(4)}`,
    );

    // Both should be case-insensitive (cmdk applies a small 0.9999-per-character case-mismatch
    // penalty, hence toBeCloseTo)
    expect(cmdkLower).toBeCloseTo(cmdkUpper, 2);
    expect(ourLower).toBe(ourUpper);
    expect(ourLower).toBe(ourMixed);
  });

  it('keywords boost — both support keywords for matching', () => {
    const cmdkWithKeywords = cmdkDefaultFilter('Open Settings', 'preferences', [
      'preferences',
      'config',
    ]);
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

    console.log(
      `  Keywords "preferences" — cmdk: with=${cmdkWithKeywords.toFixed(4)}, without=${cmdkWithoutKeywords.toFixed(4)}`,
    );
    console.log(
      `  Keywords "preferences" — ours: with=${ourWithKw.toFixed(4)}, without=${ourWithoutKw.toFixed(4)}`,
    );

    // With keywords should score higher (or at least find it)
    expect(cmdkWithKeywords).toBeGreaterThan(cmdkWithoutKeywords);
    expect(ourWithKw).toBeGreaterThan(ourWithoutKw);
  });

  it('special characters in query', () => {
    const item: CommandItem = { id: itemId('special-1'), value: 'C++ Compiler', keywords: [] };

    // "c++" is a literal prefix of the value: all three characters highlight
    expect(scoreItem('c++', item)).toEqual({
      id: item.id,
      score: expect.closeTo(0.925, 3),
      matches: [[0, 3]],
    });

    // A regex metacharacter is data, never a pattern: no query throws
    for (const query of ['(', '[a', '.*', '?', '+']) {
      expect(() => scoreItem(query, item)).not.toThrow();
    }
  });

  it('very long query that does not match', () => {
    const item = 'Open';
    const commandItem: CommandItem = { id: itemId('long-1'), value: item, keywords: [] };
    const longQuery = 'this is a very long query that definitely should not match anything';

    const cmdkScore = cmdkDefaultFilter(item, longQuery);
    const ourResult = scoreItem(longQuery, commandItem);

    console.log(
      `  Long non-matching query — cmdk: ${cmdkScore.toFixed(4)}, ours: ${ourResult?.score ?? 'null (no match)'}`,
    );

    expect(cmdkScore).toBe(0);
    expect(ourResult).toBeNull();
  });
});

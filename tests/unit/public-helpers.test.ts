// tests/unit/public-helpers.test.ts
// CE-79: pins the public helpers the row names that no other file covers (scoreItemAsync and
// batchScoreItems), and maps every helper of the row to the tests that pin it.
//
// createTelemetryMiddleware
//   tests/unit/telemetry.test.ts, tests/unit/telemetry-machine.test.ts,
//   tests/unit/telemetry-react.test.tsx
// findMatchingShortcut, hit (tests/unit/keyboard.test.ts)
//   "T11: returns the parsed shortcut itself (same reference) that the event matches"
// findMatchingShortcut, miss (tests/unit/keyboard.test.ts)
//   "T11: returns null when no shortcut matches, and for an empty list"
// KeyboardShortcutRegistry.getConflicts (tests/unit/keyboard.test.ts)
//   "CE-08: a second item under the same normalized shortcut is reported by getConflicts()"
// symmetricDifferenceWith (tests/unit/registry.test.ts)
//   "symmetricDifferenceWith returns the ids that are in exactly one of the two sets"
//   "CE-79: differenceFrom and symmetricDifferenceWith differ on the same inputs"
// differenceFrom (tests/unit/registry.test.ts)
//   "CE-79: differenceFrom returns the registered ids absent from the given set and none of the
//   given set's own ids"
//   "CE-79: differenceFrom and symmetricDifferenceWith differ on the same inputs"
// scoreItemAsync, batchScoreItems
//   this file
//
// D33: differenceFrom and symmetricDifferenceWith are pinned here; CE-121 (1.12.0) decides
// whether differenceFrom stays.

import type { CommandItem } from 'modern-cmdk';
import { batchScoreItems, itemId, scoreItem, scoreItemAsync } from 'modern-cmdk';
import { describe, expect, it } from 'vitest';

const item = (id: string, value: string): CommandItem => ({ id: itemId(id), value });

describe('scoreItemAsync (CE-79)', () => {
  it('CE-79: scoreItemAsync resolves to what scoreItem returns for a match, a non-match and an empty query', async () => {
    const apple = item('apple', 'Apple Pie');
    for (const query of ['app', 'pie', 'ap', 'zzz', '']) {
      expect(await scoreItemAsync(query, apple)).toEqual(scoreItem(query, apple));
    }
    expect(await scoreItemAsync('app', apple)).not.toBeNull();
    expect(await scoreItemAsync('zzz', apple)).toBeNull();
    expect(await scoreItemAsync('', apple)).toEqual({ id: apple.id, score: 1, matches: [] });
  });
});

describe('batchScoreItems (CE-79)', () => {
  // Input order is the reverse of score order: a substring hit, a non-match, then a prefix hit
  const items: readonly CommandItem[] = [
    item('sub', 'Open profile'),
    item('none', 'Settings'),
    item('prefix', 'Profile'),
  ];

  it('CE-79: batchScoreItems drops non-matches and sorts the results by score descending', async () => {
    const results = await batchScoreItems('pro', items);
    expect(results.map((r) => r.id)).toEqual(['prefix', 'sub']);
    expect(results).toEqual(
      items
        .map((i) => scoreItem('pro', i))
        .filter((r) => r !== null)
        .toSorted((a, b) => b.score - a.score),
    );
    expect(results[0]?.score).toBeGreaterThan(results[1]?.score ?? Number.POSITIVE_INFINITY);
  });

  it('CE-79: batchScoreItems leaves the input array untouched', async () => {
    const input = [...items];
    await batchScoreItems('pro', input);
    expect(input).toEqual(items);
    expect(input.map((i) => i.id)).toEqual(['sub', 'none', 'prefix']);
  });

  it('CE-79: batchScoreItems resolves to [] for no items and for no match', async () => {
    expect(await batchScoreItems('pro', [])).toEqual([]);
    expect(await batchScoreItems('qqq', items)).toEqual([]);
  });
});

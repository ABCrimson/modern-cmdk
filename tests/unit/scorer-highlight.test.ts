import { createSearchEngine, itemId } from 'modern-cmdk';
import { describe, expect, it } from 'vitest';
import { scoreItem } from '../../packages/modern-cmdk/src/core/search/default-scorer.js';

/** The substrings of `value` that `matches` marks, joined */
function marked(value: string, matches: ReadonlyArray<readonly [number, number]>): string {
  return matches.map(([start, end]) => value.slice(start, end)).join('');
}

describe('Highlight ranges index the original value', () => {
  it('P20: a mixed-case match reports ranges on the original string', () => {
    const item = { id: itemId('open'), value: 'Open File' };
    const result = scoreItem('FIL', item);
    expect(result?.matches).toEqual([[5, 8]]);
    expect(marked(item.value, result?.matches ?? [])).toBe('Fil');
  });

  it("P20: 'İstanbul' queried with 'ist' marks 'İst', not the lowercased offsets", () => {
    // 'İ'.toLowerCase() is 'i' + U+0307: the lowered text is one unit longer
    const item = { id: itemId('ist'), value: 'İstanbul' };
    expect('İstanbul'.toLowerCase().length).toBe(9);
    const result = scoreItem('ist', item);
    expect(result).not.toBeNull();
    expect(marked(item.value, result?.matches ?? [])).toBe('İst');

    const inner = scoreItem('stan', item);
    expect(inner?.matches).toEqual([[1, 5]]);

    const engine = createSearchEngine();
    engine.index([item]);
    const [viaEngine] = engine.search('stan', [item]);
    expect(viaEngine?.matches).toEqual([[1, 5]]);
    engine[Symbol.dispose]();
  });

  it('P20: a final sigma keeps ranges on the original value', () => {
    const item = { id: itemId('sigma'), value: 'ΟΔΟΣ ΜΕΝΟΥ' };
    const result = scoreItem('μεν', item);
    expect(marked(item.value, result?.matches ?? [])).toBe('ΜΕΝ');
  });

  it('P20: a keyword-only match has no value ranges', () => {
    const item = { id: itemId('kw'), value: 'Settings', keywords: ['preferences'] };
    const result = scoreItem('pref', item);
    expect(result).not.toBeNull();
    expect(result?.matches).toEqual([]);

    const engine = createSearchEngine();
    engine.index([item]);
    const [viaEngine] = engine.search('pref', [item]);
    expect(viaEngine?.matches).toEqual([]);
    engine[Symbol.dispose]();
  });
});

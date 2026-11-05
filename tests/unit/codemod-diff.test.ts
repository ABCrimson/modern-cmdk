import { diff } from 'node:util';
import { describe, expect, it } from 'vitest';
import { unifiedDiff } from '../../packages/modern-cmdk/src/codemod/diff.js';

const numbered = (count: number): string =>
  `${Array.from({ length: count }, (_, i) => `line ${i + 1}`).join('\n')}\n`;

describe('codemod diff: util.diff contract', () => {
  it('util.diff reports a line only in its first argument as 1 and only in its second as -1', () => {
    // The docs in @types/node describe the codes the other way round; unifiedDiff relies on this.
    expect(diff(['a', 'b'], ['a', 'c'])).toEqual([
      [0, 'a'],
      [1, 'b'],
      [-1, 'c'],
    ]);
  });
});

describe('codemod diff: unifiedDiff', () => {
  it('equal inputs give an empty string', () => {
    expect(unifiedDiff('src/a.ts', 'x\ny\n', 'x\ny\n')).toBe('');
  });

  it('one changed line in the middle carries 3 lines of context each side', () => {
    const before = numbered(10);
    const after = before.replace('line 5\n', 'LINE 5\n');
    expect(unifiedDiff('src/a.ts', before, after)).toBe(
      [
        '--- a/src/a.ts',
        '+++ b/src/a.ts',
        '@@ -2,7 +2,7 @@',
        ' line 2',
        ' line 3',
        ' line 4',
        '-line 5',
        '+LINE 5',
        ' line 6',
        ' line 7',
        ' line 8',
      ].join('\n'),
    );
  });

  it('two changes more than 6 lines apart make two hunks; closer ones share one', () => {
    const before = numbered(30);
    const apart = before.replace('line 3\n', 'X\n').replace('line 28\n', 'Y\n');
    expect(unifiedDiff('f', before, apart).match(/^@@ /gm)).toHaveLength(2);
    const near = before.replace('line 10\n', 'X\n').replace('line 17\n', 'Y\n');
    expect(unifiedDiff('f', before, near).match(/^@@ /gm)).toHaveLength(1);
    const far = before.replace('line 10\n', 'X\n').replace('line 18\n', 'Y\n');
    expect(unifiedDiff('f', before, far).match(/^@@ /gm)).toHaveLength(2);
  });

  it('a change at the first line starts the hunk at line 1', () => {
    expect(unifiedDiff('f', 'a\nb\nc\n', 'A\nb\nc\n')).toBe(
      ['--- a/f', '+++ b/f', '@@ -1,3 +1,3 @@', '-a', '+A', ' b', ' c'].join('\n'),
    );
  });

  it('a single-line file prints ranges without counts', () => {
    expect(unifiedDiff('f', 'a\n', 'b\n')).toBe(
      ['--- a/f', '+++ b/f', '@@ -1 +1 @@', '-a', '+b'].join('\n'),
    );
  });

  it('an empty before names line 0 and an empty after likewise', () => {
    expect(unifiedDiff('f', '', 'a\n')).toBe(
      ['--- a/f', '+++ b/f', '@@ -0,0 +1 @@', '+a'].join('\n'),
    );
    expect(unifiedDiff('f', 'a\n', '')).toBe(
      ['--- a/f', '+++ b/f', '@@ -1 +0,0 @@', '-a'].join('\n'),
    );
  });

  it('CRLF input is split on CRLF: no carriage return reaches the output', () => {
    const out = unifiedDiff('f', 'a\r\nb\r\n', 'a\r\nc\r\n');
    expect(out).toBe(['--- a/f', '+++ b/f', '@@ -1,2 +1,2 @@', ' a', '-b', '+c'].join('\n'));
    expect(out).not.toContain('\r');
  });

  it('a missing final newline is marked on the side that lacks it', () => {
    expect(unifiedDiff('f', 'a\nb\n', 'a\nb')).toBe(
      [
        '--- a/f',
        '+++ b/f',
        '@@ -1,2 +1,2 @@',
        ' a',
        '-b',
        '+b',
        '\\ No newline at end of file',
      ].join('\n'),
    );
  });

  it('additions and removals update the new-side line numbers of later hunks', () => {
    const before = numbered(40);
    const after = before
      .replace('line 2\n', 'line 2\nextra 1\nextra 2\n')
      .replace('line 38\n', 'Z\n');
    const out = unifiedDiff('f', before, after);
    expect(out).toContain('@@ -1,5 +1,7 @@');
    expect(out).toContain('@@ -35,6 +37,6 @@');
  });
});

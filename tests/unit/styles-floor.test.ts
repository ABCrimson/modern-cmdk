import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Parses the SOURCE stylesheet (packages/modern-cmdk/src/react/styles.css), not the built one:
// the build only minifies it. Every declaration is recorded with the stack of at-rule/selector
// preludes that enclose it, in source order.
const source = readFileSync(
  resolve(import.meta.dirname, '../../packages/modern-cmdk/src/react/styles.css'),
  'utf8',
).replaceAll(/\/\*[\s\S]*?\*\//g, '');

interface Declaration {
  readonly prop: string;
  readonly value: string;
  readonly path: readonly string[];
  readonly block: number;
}

function parse(css: string): Declaration[] {
  const out: Declaration[] = [];
  const path: string[] = [];
  const blocks: number[] = [0];
  let nextBlock = 1;
  let buf = '';
  const flush = (): void => {
    const text = buf.trim();
    buf = '';
    const colon = text.indexOf(':');
    if (text !== '' && colon > 0 && !text.startsWith('@')) {
      out.push({
        prop: text.slice(0, colon).trim(),
        value: text.slice(colon + 1).trim(),
        path: [...path],
        block: blocks.at(-1) ?? 0,
      });
    }
  };
  for (const ch of css) {
    if (ch === '{') {
      path.push(buf.trim().replaceAll(/\s+/g, ' '));
      buf = '';
      blocks.push(nextBlock++);
    } else if (ch === '}') {
      flush();
      path.pop();
      blocks.pop();
    } else if (ch === ';') {
      flush();
    } else {
      buf += ch;
    }
  }
  return out;
}

const declarations = parse(source);
const SUPPORTS = '@supports (animation-timeline: scroll())';

describe('styles.css at the Safari 18.4 / Firefox 131 floor', () => {
  it('RA-76: every user-select declaration is preceded by its -webkit- prefixed twin', () => {
    const indexes = declarations.flatMap((d, i) => (d.prop === 'user-select' ? [i] : []));
    expect(indexes.length).toBeGreaterThanOrEqual(2);
    for (const i of indexes) {
      const twin = declarations[i - 1];
      expect(twin?.prop).toBe('-webkit-user-select');
      expect(twin?.value).toBe(declarations[i]?.value);
      expect(twin?.block).toBe(declarations[i]?.block);
    }
  });

  it('RA-77: animation-timeline declarations sit inside an @supports (animation-timeline: scroll()) block', () => {
    const scrollDriven = declarations.filter(
      (d) =>
        ['animation-timeline', 'animation-range', 'scroll-timeline'].includes(d.prop) ||
        (d.prop === 'animation' && /fade-edge|scroll-progress/.test(d.value)),
    );
    expect(scrollDriven.length).toBeGreaterThanOrEqual(7);
    for (const d of scrollDriven) {
      expect(d.path, `${d.prop}: ${d.value}`).toContain(SUPPORTS);
    }
    // Static fallback: outside the block (keyframes aside) no fade pseudo-element is left at its
    // animated rest value, so an unsupporting browser shows no fade and no stuck state
    const stuck = declarations.filter(
      (d) =>
        d.prop === 'opacity' &&
        d.value === '0.08' &&
        !d.path.includes(SUPPORTS) &&
        !d.path.some((p) => p.startsWith('@keyframes')),
    );
    expect(stuck).toEqual([]);
  });
});

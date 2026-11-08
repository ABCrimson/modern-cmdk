// tests/unit/activity-floor-guard.test.ts
// React 19.0, the peer floor, exports no Activity: a test that renders <Activity> fails there with
// "Element type is invalid ... got: undefined". The floor lane runs the unit suite on 19.0, so
// every test that renders <Activity> is declared with `itWithActivity`, which skips when the
// import is undefined. This check parses every tests/**/*.test.tsx and reports
// - a test call (`it`, `test`, and their `.only`, `.each(...)` and other forms) with an argument
//   that contains an opening element named `Activity`, unless the call is made through
//   `itWithActivity`;
// - a file that renders <Activity> without `const itWithActivity = it.skipIf(Activity === undefined)`.
// `CommandActivity`, the library component, is another identifier and is not flagged.
//
// Parser: `@babel/parser`, resolved from where jscodeshift lives, as render-ref-writes.test.ts does.

import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/** The slice of a Babel AST node this check reads. */
interface AstNode {
  readonly type: string;
  readonly loc: { readonly start: { readonly line: number } };
  readonly [key: string]: unknown;
}

interface BabelParser {
  parse(
    code: string,
    options: { readonly sourceType: 'module'; readonly plugins: readonly string[] },
  ): AstNode;
}

const nodeRequire = createRequire(import.meta.url);
const { parse } = createRequire(nodeRequire.resolve('jscodeshift/package.json'))(
  '@babel/parser',
) as BabelParser;

const TESTS_DIR: string = path.resolve(import.meta.dirname, '..');
const REPO_ROOT: string = path.resolve(TESTS_DIR, '..');
const HELPER = 'itWithActivity';
const HELPER_DECLARATION = 'const itWithActivity = it.skipIf(Activity === undefined);';

const isNode = (value: unknown): value is AstNode =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as { type?: unknown }).type === 'string';

/** Every child node of `node`. */
function* children(node: AstNode): Generator<AstNode> {
  for (const [key, value] of Object.entries(node)) {
    if (key === 'loc') continue;
    for (const item of Array.isArray(value) ? value : [value]) if (isNode(item)) yield item;
  }
}

/** `true` for the opening element `<Activity ...>`. */
const isActivityElement = (node: AstNode): boolean =>
  node.type === 'JSXOpeningElement' &&
  isNode(node.name) &&
  node.name.type === 'JSXIdentifier' &&
  node.name.name === 'Activity';

/** `true` when the subtree of `node` holds an `<Activity>` element. */
function rendersActivity(node: AstNode): boolean {
  if (isActivityElement(node)) return true;
  for (const child of children(node)) if (rendersActivity(child)) return true;
  return false;
}

/** The identifier at the root of a callee: `it` for `it`, `it.only` and `it.each([...])`. */
function rootIdentifier(callee: unknown): string | undefined {
  let current = callee;
  while (isNode(current)) {
    if (current.type === 'Identifier') return current.name as string;
    if (current.type === 'MemberExpression') current = current.object;
    else if (current.type === 'CallExpression') current = current.callee;
    else return undefined;
  }
  return undefined;
}

/** The lines of the test calls that render `<Activity>` without going through `itWithActivity`. */
function unguardedTests(root: AstNode): number[] {
  const lines: number[] = [];
  const visit = (node: AstNode): void => {
    if (node.type === 'CallExpression') {
      const name = rootIdentifier(node.callee);
      if (
        (name === 'it' || name === 'test') &&
        (node.arguments as readonly unknown[]).some((arg) => isNode(arg) && rendersActivity(arg))
      ) {
        lines.push(node.loc.start.line);
      }
    }
    for (const child of children(node)) visit(child);
  };
  visit(root);
  return lines;
}

/** The problems of one test file, each as `<file>:<line>: <message>`. */
function activityFloorProblems(code: string, file: string): string[] {
  const ast = parse(code, { sourceType: 'module', plugins: ['typescript', 'jsx'] });
  const problems = unguardedTests(ast).map(
    (line) => `${file}:${line}: renders <Activity> outside ${HELPER}`,
  );
  if (rendersActivity(ast) && !code.includes(HELPER_DECLARATION)) {
    problems.push(`${file}:1: renders <Activity> without "${HELPER_DECLARATION}"`);
  }
  return problems;
}

/** Every `*.test.tsx` file under `dir`, as absolute paths. */
function testFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : testFiles(full);
    return entry.name.endsWith('.test.tsx') ? [full] : [];
  });
}

describe('Activity floor guard', () => {
  it('every test that renders <Activity> declares the React 19.0 floor skip', () => {
    const problems = testFiles(TESTS_DIR).flatMap((file) =>
      activityFloorProblems(
        readFileSync(file, 'utf8'),
        path.relative(REPO_ROOT, file).replaceAll('\\', '/'),
      ),
    );
    expect(problems).toEqual([]);
  });
});

describe('Activity floor guard fixtures', () => {
  const helper = `import { Activity } from 'react';\n${HELPER_DECLARATION}\n`;
  const body = '() => { render(<Activity mode="hidden" />); }';

  it('flags a plain it that renders <Activity>', () => {
    const code = `${helper}it('a', ${body});\n`;
    expect(activityFloorProblems(code, 'f.tsx')).toEqual([
      `f.tsx:3: renders <Activity> outside ${HELPER}`,
    ]);
  });

  it('flags it.only, test.only and it.each forms', () => {
    const code = `${helper}it.only('a', ${body});\ntest.only('b', ${body});\nit.each([1])('c', ${body});\n`;
    expect(activityFloorProblems(code, 'f.tsx').map((p) => p.split(': ')[0])).toEqual([
      'f.tsx:3',
      'f.tsx:4',
      'f.tsx:5',
    ]);
  });

  it('allows a test declared through itWithActivity', () => {
    const code = `${helper}${HELPER}('a', ${body});\n`;
    expect(activityFloorProblems(code, 'f.tsx')).toEqual([]);
  });

  it('does not flag CommandActivity or a test without Activity', () => {
    const code = `it('a', () => { render(<CommandActivity />); });\nit('b', () => {});\n`;
    expect(activityFloorProblems(code, 'f.tsx')).toEqual([]);
  });

  it('flags a file that renders <Activity> without the helper declaration', () => {
    const code = `import { Activity } from 'react';\n${HELPER}('a', ${body});\n`;
    expect(activityFloorProblems(code, 'f.tsx')).toEqual([
      `f.tsx:1: renders <Activity> without "${HELPER_DECLARATION}"`,
    ]);
  });
});

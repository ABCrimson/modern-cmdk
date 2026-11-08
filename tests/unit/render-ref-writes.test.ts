// tests/unit/render-ref-writes.test.ts
// Rules of React: a component or hook body does not write `ref.current` while it renders. The writes belong in an
// effect, an event handler or a ref callback. This source check parses every file of the React adapter and reports the
// assignments whose nearest enclosing function is a module-level function (a component or a hook), not a function
// nested in one. The one exemption is react.dev's lazy initializer, `if (ref.current === null) { ... ref.current = x }`.
//
// Every file parses with JSX enabled: primitives.ts holds JSX in a .ts file.
//
// Parser: `@babel/parser`, which `jscodeshift` (a root devDependency) depends on; TypeScript 7 has no JS API. The
// package is not a dependency of this repository itself, so it is resolved from where jscodeshift lives.

import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/** The slice of a Babel AST node this check reads. */
interface AstNode {
  readonly type: string;
  readonly start: number;
  readonly end: number;
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

const REACT_DIR: string = path.resolve(import.meta.dirname, '../../packages/modern-cmdk/src/react');
const REPO_ROOT: string = path.resolve(import.meta.dirname, '../..');

const FUNCTION_TYPES: ReadonlySet<string> = new Set([
  'FunctionDeclaration',
  'FunctionExpression',
  'ArrowFunctionExpression',
  'ObjectMethod',
  'ClassMethod',
  'ClassPrivateMethod',
]);

const isNode = (value: unknown): value is AstNode =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as { type?: unknown }).type === 'string';

/** `true` for `<object>.current` (not computed). */
const isCurrentMember = (node: unknown): node is AstNode & { readonly object: AstNode } =>
  isNode(node) &&
  node.type === 'MemberExpression' &&
  node.computed === false &&
  isNode(node.property) &&
  node.property.type === 'Identifier' &&
  node.property.name === 'current';

interface Site {
  readonly where: string;
  readonly exempt: boolean;
}

/** Every `.current` assignment in a module-level function of `code`, flagged when it is the lazy initializer. */
function sitesOfSource(code: string, relative: string): Site[] {
  const ast = parse(code, {
    sourceType: 'module',
    plugins: ['typescript', 'jsx'],
  });
  const sites: Site[] = [];

  const walk = (node: AstNode, ancestors: readonly AstNode[]): void => {
    if (
      node.type === 'AssignmentExpression' &&
      isCurrentMember(node.left) &&
      ancestors.filter((ancestor) => FUNCTION_TYPES.has(ancestor.type)).length === 1
    ) {
      const target = code.slice(node.left.object.start, node.left.object.end);
      // The lazy initializer: inside the consequent of `if (<same ref>.current === null)`
      const exempt = ancestors.some(
        (ancestor, index) =>
          ancestor.type === 'IfStatement' &&
          ancestors[index + 1] === ancestor.consequent &&
          isNode(ancestor.test) &&
          ancestor.test.type === 'BinaryExpression' &&
          ancestor.test.operator === '===' &&
          isCurrentMember(ancestor.test.left) &&
          code.slice(ancestor.test.left.object.start, ancestor.test.left.object.end) === target &&
          isNode(ancestor.test.right) &&
          ancestor.test.right.type === 'NullLiteral',
      );
      sites.push({ where: `${relative}:${node.loc.start.line}`, exempt });
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) {
        for (const child of value) if (isNode(child)) walk(child, [...ancestors, node]);
      } else if (isNode(value)) {
        walk(value, [...ancestors, node]);
      }
    }
  };
  walk(ast, []);
  return sites;
}

/** The sites of `file`, located by its repository-relative path. */
function sitesOf(file: string): Site[] {
  const relative = path.relative(REPO_ROOT, file).split(path.sep).join('/');
  return sitesOfSource(readFileSync(file, 'utf8'), relative);
}

const files: string[] = readdirSync(REACT_DIR, { recursive: true, encoding: 'utf8' })
  .filter((name) => /\.tsx?$/.test(name))
  .map((name) => path.join(REACT_DIR, name));

describe('React adapter source', () => {
  it('RA-58: no ref .current assignment runs in a component or hook body outside an effect or callback', () => {
    expect(files.length).toBeGreaterThan(10);
    const sites = files.flatMap(sitesOf);

    // The exemption matches exactly one site, so it cannot widen silently.
    const exempt = sites.filter((site) => site.exempt);
    expect(exempt.map((site) => site.where.replace(/:\d+$/, ''))).toEqual([
      'packages/modern-cmdk/src/react/hooks/use-command-setup.ts',
    ]);

    const violations = sites.filter((site) => !site.exempt).map((site) => site.where);
    expect(
      violations,
      `ref .current assigned while a component or hook renders:\n${violations.join('\n')}`,
    ).toEqual([]);
  });
});

/** A component whose body is `body`; `r` is a ref. */
const component = (body: string): string =>
  [
    "import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react';",
    'export function C() {',
    '  const r = useRef<number | null>(null);',
    body,
    '  return <div />;',
    '}',
  ].join('\n');

/** Write forms that run while the component renders, by name. */
const RENDER_WRITES: Readonly<Record<string, string>> = {
  'an assignment in the body': 'r.current = 1;',
  'a compound assignment': 'r.current += 1;',
  'a write in a useMemo callback': 'const v = useMemo(() => { r.current = 1; return 2; }, []);',
  'a write in a useState initializer': 'const [v] = useState(() => { r.current = 1; return 0; });',
  'a write in the initializer of useReducer':
    'const [v] = useReducer((s: number) => s, 0, () => { r.current = 1; return 0; });',
  'a write in the reducer of useReducer':
    'const [v] = useReducer((s: number) => { r.current = s; return s; }, 0);',
  'a write in an immediately invoked arrow': '(() => { r.current = 1; })();',
  'a write in an immediately invoked function expression': '(function () { r.current = 1; })();',
  'an increment': 'r.current++;',
  'a decrement': '--r.current;',
  'an array destructuring target': '[r.current] = [1];',
  'an object destructuring target': '({ a: r.current } = { a: 1 });',
  'a computed current member': "r['current'] = 1;",
  'Object.assign with a current property': 'Object.assign(r, { current: 1 });',
  'a call of an arrow helper declared in the body':
    'const bump = () => { r.current = 1; }; bump();',
  'a call of a function declaration declared in the body':
    'function bump() { r.current = 1; } bump();',
};

/** Write forms that run later (an effect, a handler, a ref callback) or are the exempt lazy initializer. */
const LATER_WRITES: Readonly<Record<string, string>> = {
  'a write in useEffect': 'useEffect(() => { r.current = 1; });',
  'a write in useLayoutEffect': 'useLayoutEffect(() => { r.current = 1; });',
  'a write in useCallback': 'const f = useCallback(() => { r.current = 1; }, []);',
  'a write in an event handler': 'const onClick = () => { r.current = 1; }; void onClick;',
  'a write in a useMemo callback inside an effect':
    'useEffect(() => { useMemo(() => { r.current = 1; }, []); });',
  'a helper that is only called in an effect':
    'const bump = () => { r.current = 1; }; useEffect(() => { bump(); });',
  'a helper that is only returned as a handler':
    'const bump = () => { r.current = 1; }; void [bump];',
  'a write in a ref callback':
    'const setRef = (el: number | null) => { r.current = el; }; void setRef;',
};

describe('RA-58 walker fixtures', () => {
  it.each(Object.entries(RENDER_WRITES))('RA-58: the check flags %s', (_name, body) => {
    const sites = sitesOfSource(component(body), 'fixture.tsx').filter((site) => !site.exempt);
    expect(sites).toHaveLength(1);
  });

  it.each(Object.entries(LATER_WRITES))('RA-58: the check ignores %s', (_name, body) => {
    expect(sitesOfSource(component(body), 'fixture.tsx')).toEqual([]);
  });

  it('RA-58: the check exempts only the lazy initializer', () => {
    const lazy = 'if (r.current === null) { r.current = 1; }';
    expect(sitesOfSource(component(lazy), 'fixture.tsx')).toEqual([
      { where: 'fixture.tsx:4', exempt: true },
    ]);
    const other = 'if (r.current === 0) { r.current = 1; }';
    expect(sitesOfSource(component(other), 'fixture.tsx').map((site) => site.exempt)).toEqual([
      false,
    ]);
  });
});

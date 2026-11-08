// tests/unit/render-ref-writes.test.ts
// Rules of React: a component or hook body does not write `ref.current` while it renders. The writes belong in an
// effect, an event handler or a ref callback. This source check parses every file of the React adapter and reports the
// `.current` writes that run while a module-level function (a component or a hook) renders.
//
// What counts as a write: an assignment (`=`, `+=`, ...), an increment or decrement, a destructuring assignment whose
// target holds a `.current` member, and `Object.assign(<target>, { current: ... })`; the member may be written
// `.current` or `['current']`, with a TypeScript wrapper (`!`, `as`) around it.
// What counts as render time: the module-level function's own body; the callbacks that run during render, that is the
// first argument of `useMemo` and `useState` and the first and third of `useReducer`; an immediately invoked function;
// and a call, in that body, of a helper declared in that body whose own body writes `.current`. Any other nested
// function (an effect, a `useCallback` callback, an event handler, a ref callback) runs later and is not flagged.
// The one exemption is react.dev's lazy initializer, `if (ref.current === null) { ... ref.current = x }`.
// The walker is itself tested on source strings at the end of this file.
//
// Blind spots: a helper that reaches a write only through another helper, a write through `Reflect.set`,
// `Object.defineProperty` or a `for (ref.current of ...)` head, and a class property arrow, which is flagged although
// it runs in a handler, because a class is not a function.
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

/** The hooks whose callback runs while the component renders, with the argument positions of those callbacks. */
const RENDER_CALLBACKS: ReadonlyMap<string, readonly number[]> = new Map([
  ['useMemo', [0]],
  ['useState', [0]],
  ['useReducer', [0, 2]],
]);

/** The TypeScript wrappers and parentheses around an assignment target. */
const WRAPPERS: ReadonlySet<string> = new Set([
  'TSNonNullExpression',
  'TSAsExpression',
  'TSSatisfiesExpression',
  'TSTypeAssertion',
  'ParenthesizedExpression',
]);

const isNode = (value: unknown): value is AstNode =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as { type?: unknown }).type === 'string';

/** `node` without the wrappers around it (`x!`, `x as T`, `(x)`). */
const unwrap = (node: unknown): unknown => {
  let current = node;
  while (isNode(current) && WRAPPERS.has(current.type)) current = current.expression;
  return current;
};

/** `true` for `<object>.current` and `<object>['current']`. */
const isCurrentMember = (node: unknown): node is AstNode & { readonly object: AstNode } => {
  if (!isNode(node) || node.type !== 'MemberExpression' || !isNode(node.property)) return false;
  return node.computed === false
    ? node.property.type === 'Identifier' && node.property.name === 'current'
    : node.property.type === 'StringLiteral' && node.property.value === 'current';
};

/** `true` when assigning to `target` writes a `.current` member, directly or inside a destructuring pattern. */
function targetsCurrent(target: unknown): boolean {
  const node = unwrap(target);
  if (!isNode(node)) return false;
  switch (node.type) {
    case 'MemberExpression':
      return isCurrentMember(node);
    case 'ArrayPattern':
      return (node.elements as readonly unknown[]).some((element) => targetsCurrent(element));
    case 'ObjectPattern':
      return (node.properties as readonly AstNode[]).some((property) =>
        targetsCurrent(property.type === 'RestElement' ? property.argument : property.value),
      );
    case 'AssignmentPattern':
      return targetsCurrent(node.left);
    case 'RestElement':
      return targetsCurrent(node.argument);
    default:
      return false;
  }
}

/** `true` for `Object.assign(<target>, { current: ... })`: an object argument after the first with a `current` key. */
const isObjectAssignOfCurrent = (node: AstNode): boolean =>
  node.type === 'CallExpression' &&
  isNode(node.callee) &&
  node.callee.type === 'MemberExpression' &&
  node.callee.computed === false &&
  isNode(node.callee.object) &&
  node.callee.object.type === 'Identifier' &&
  node.callee.object.name === 'Object' &&
  isNode(node.callee.property) &&
  node.callee.property.name === 'assign' &&
  (node.arguments as readonly unknown[])
    .slice(1)
    .some(
      (argument) =>
        isNode(argument) &&
        argument.type === 'ObjectExpression' &&
        (argument.properties as readonly AstNode[]).some(
          (property) =>
            property.type === 'ObjectProperty' &&
            property.computed !== true &&
            isNode(property.key) &&
            (property.key.type === 'Identifier'
              ? property.key.name === 'current'
              : property.key.type === 'StringLiteral' && property.key.value === 'current'),
        ),
    );

/** `true` for a node that writes `.current`: an assignment, an increment or decrement, or an `Object.assign`. */
const isRefWrite = (node: AstNode): boolean =>
  (node.type === 'AssignmentExpression' && targetsCurrent(node.left)) ||
  (node.type === 'UpdateExpression' && isCurrentMember(unwrap(node.argument))) ||
  isObjectAssignOfCurrent(node);

/** `useMemo` for `useMemo(...)` and `React.useMemo(...)`. */
function calleeName(callee: unknown): string | undefined {
  if (!isNode(callee)) return undefined;
  if (callee.type === 'Identifier') return callee.name as string;
  if (callee.type === 'MemberExpression' && callee.computed === false && isNode(callee.property)) {
    return callee.property.name as string;
  }
  return undefined;
}

/** `true` for a function that runs during the render of its parent: an immediately invoked one, or a render callback. */
function runsWhileRendering(fn: AstNode, parent: AstNode | undefined): boolean {
  if (parent?.type !== 'CallExpression') return false;
  if (parent.callee === fn) return true;
  const name = calleeName(parent.callee);
  return (
    name !== undefined &&
    (RENDER_CALLBACKS.get(name)?.includes((parent.arguments as readonly unknown[]).indexOf(fn)) ??
      false)
  );
}

/** The functions among `ancestors` that open a new level: every function except a render-time one. */
const levelsOf = (ancestors: readonly AstNode[]): AstNode[] =>
  ancestors.filter(
    (ancestor, index) =>
      FUNCTION_TYPES.has(ancestor.type) && !runsWhileRendering(ancestor, ancestors[index - 1]),
  );

/** The name a function declaration or a `const name = <function>` binds, if any. */
function boundName(fn: AstNode, parent: AstNode | undefined): string | undefined {
  if (fn.type === 'FunctionDeclaration' && isNode(fn.id)) return fn.id.name as string;
  if (parent?.type === 'VariableDeclarator' && parent.init === fn && isNode(parent.id)) {
    return parent.id.type === 'Identifier' ? (parent.id.name as string) : undefined;
  }
  return undefined;
}

interface Site {
  readonly where: string;
  readonly exempt: boolean;
}

interface Visit {
  readonly node: AstNode;
  readonly ancestors: readonly AstNode[];
}

/**
 * Every `.current` write that runs while a module-level function of `code` renders, flagged when it is the lazy
 * initializer. A write counts when exactly one function encloses it once the render-time callbacks and the
 * immediately invoked functions are set aside. A call, in the render body, of a helper declared in that body counts
 * as a write when the helper's own body writes `.current`.
 */
function sitesOfSource(code: string, relative: string): Site[] {
  const ast = parse(code, {
    sourceType: 'module',
    plugins: ['typescript', 'jsx'],
  });
  const visits: Visit[] = [];
  const walk = (node: AstNode, ancestors: readonly AstNode[]): void => {
    visits.push({ node, ancestors });
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) {
        for (const child of value) if (isNode(child)) walk(child, [...ancestors, node]);
      } else if (isNode(value)) {
        walk(value, [...ancestors, node]);
      }
    }
  };
  walk(ast, []);

  // The helpers declared in each render body (component -> name -> function), and the helpers that write `.current`
  const helpers = new Map<AstNode, Map<string, AstNode>>();
  const writingHelpers = new Set<AstNode>();
  for (const { node, ancestors } of visits) {
    const levels = levelsOf(ancestors);
    const [component, helper] = levels;
    if (component === undefined) continue;
    if (levels.length === 1 && FUNCTION_TYPES.has(node.type)) {
      const parent = ancestors.at(-1);
      const name = runsWhileRendering(node, parent) ? undefined : boundName(node, parent);
      if (name !== undefined) {
        const declared = helpers.get(component) ?? new Map<string, AstNode>();
        declared.set(name, node);
        helpers.set(component, declared);
      }
    } else if (levels.length === 2 && helper !== undefined && isRefWrite(node)) {
      writingHelpers.add(helper);
    }
  }

  const sites: Site[] = [];
  for (const { node, ancestors } of visits) {
    const [component, ...nested] = levelsOf(ancestors);
    if (component === undefined || nested.length > 0) continue;
    const where = `${relative}:${node.loc.start.line}`;
    if (isRefWrite(node)) {
      const left = node.type === 'AssignmentExpression' ? unwrap(node.left) : undefined;
      const target = isCurrentMember(left)
        ? code.slice(left.object.start, left.object.end)
        : undefined;
      // The lazy initializer: inside the consequent of `if (<same ref>.current === null)`
      const exempt =
        target !== undefined &&
        ancestors.some(
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
      sites.push({ where, exempt });
    } else if (
      node.type === 'CallExpression' &&
      isNode(node.callee) &&
      node.callee.type === 'Identifier'
    ) {
      const helper = helpers.get(component)?.get(node.callee.name as string);
      if (helper !== undefined && writingHelpers.has(helper)) sites.push({ where, exempt: false });
    }
  }
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

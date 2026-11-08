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

/** Every `.current` assignment in a module-level function of `file`, flagged when it is the lazy initializer. */
function sitesOf(file: string): Site[] {
  const code = readFileSync(file, 'utf8');
  const ast = parse(code, {
    sourceType: 'module',
    plugins: ['typescript', 'jsx'],
  });
  const relative = path.relative(REPO_ROOT, file).split(path.sep).join('/');
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

// modern-cmdk/codemod — Transform: should-filter
// Migrates cmdk's filtering props to modern-cmdk's single `filter` prop.
//
// Scope (SF-DOC). Only a JSX element whose name resolves to `Command`, `CommandRoot` or
// `CommandDialog` imported from 'cmdk' or 'modern-cmdk/react' (under any local alias), or to
// `<X.Dialog>` where X is such an import (`<Command.Dialog>`), is rewritten. Every other element
// (`<MyList shouldFilter={false} />`, a `Command` from another package) is left alone without a
// report. A type-only import binds nothing.
//
// Rewrites, on an element in scope:
//   shouldFilter, shouldFilter={true}  ->  (removed: filtering is on by default)
//   shouldFilter={false}               ->  filter={false}
//   shouldFilter={expr}                ->  filter={expr ? undefined : false}
//   shouldFilter together with filter  ->  left unchanged, one report naming both props
//   filter={fn}, bound to 'cmdk'       ->  filter={(item, query) => { ... adapter ... }} for a function
//                                         literal; for a name or member expression (which may be
//                                         undefined, meaning cmdk's default filter) the adapter is
//                                         guarded: filter={fn === undefined ? undefined : adapter}
//   filter={x!}, filter={x as F}, filter={o?.f}, filter={super.f} -> left unchanged, with the report
//                                         of a computed value below: isNamePath rejects these forms, so
//                                         they are not adapted. The assertion and the cast hide the
//                                         undefined the guard exists for, and `?.` says the object itself
//                                         may be missing
//   filter={call()}, filter={useFilters().byName} or another computed value -> left unchanged, one report: the adapter would
//                                         re-evaluate it on every item, outside React render
//   filter={fn}, bound to 'modern-cmdk/react' -> left alone: it is already migrated, or the
//                                         documented order (should-filter before import-rewrite)
//                                         was not followed.
// Run should-filter before import-rewrite: once the import reads 'modern-cmdk/react' the cmdk
// filter signature can no longer be told from a migrated one.
//
// The adapter keeps a cmdk filter working. cmdk's filter is (value, search, keywords) => number
// and 0 hides the item (node_modules/cmdk/dist/index.d.ts:7, `CommandFilter`). modern-cmdk calls
// filter(item, query) and reads `false` as "exclude" and any number, 0 included, as a score
// (core/machine.ts:66-80; core/types.ts `CommandMachineOptions.filter`), so the adapter maps a
// score of 0 (or less) to `false`.

import type {
  API,
  ArrowFunctionExpression,
  ASTPath,
  FileInfo,
  FunctionExpression,
  Identifier,
  JSCodeshift,
  JSXOpeningElement,
} from 'jscodeshift';
import { printOptions } from '../print-options.js';

type ExpressionKind = Parameters<JSCodeshift['tsAsExpression']>[0];
type TSTypeKind = Parameters<JSCodeshift['tsTypeAnnotation']>[0];
type Origin = 'cmdk' | 'modern-cmdk/react';

const SOURCES: ReadonlyMap<string, Origin> = new Map<string, Origin>([
  ['cmdk', 'cmdk'],
  ['modern-cmdk/react', 'modern-cmdk/react'],
]);
const COMPONENTS: ReadonlySet<string> = new Set(['Command', 'CommandRoot', 'CommandDialog']);

// The adapter, written as source so recast prints it as the statement list it is. `__fn` stands
// for the user's filter expression. Its three locals are renamed with a trailing underscore when
// the user's expression already uses the name, so the adapter never captures it.
//
// A function literal is called with only the arguments it declares: TypeScript rejects a call that
// passes more arguments than a literal has parameters, and a cmdk filter written as a literal
// usually declares (value, search). A literal with a rest parameter or an `arguments` read gets
// all three. A name or member expression (the only other filters adaptFilter adapts) gets all three, as cmdk would pass them.
const adapterSource = (item: string, query: string, score: string, argCount: number): string => {
  const args = [
    `${item}.value`,
    query,
    `${item}.keywords === undefined ? undefined : [...${item}.keywords]`,
  ].slice(0, argCount);
  return `(${item}, ${query}) => { const ${score} = __fn(${args.join(', ')}); return ${score} > 0 ? ${score} : false; }`;
};

function isFunctionLiteral(node: unknown): node is ArrowFunctionExpression | FunctionExpression {
  const type = (node as { type?: string }).type;
  return type === 'ArrowFunctionExpression' || type === 'FunctionExpression';
}

function argCountOf(j: JSCodeshift, fn: unknown): number {
  if (!isFunctionLiteral(fn)) return 3;
  if (fn.params.some((param) => param.type === 'RestElement')) return 3;
  if (j(fn).find(j.Identifier, { name: 'arguments' }).size() > 0) return 3;
  return Math.min(3, fn.params.length);
}

function freeName(name: string, used: ReadonlySet<string>): string {
  let candidate = name;
  while (used.has(candidate)) candidate += '_';
  return candidate;
}

/**
 * jscodeshift transform — migrates cmdk's shouldFilter/filter props on cmdk-bound elements.
 */
export default function transform(fileInfo: FileInfo, api: API): string {
  const hasShouldFilter = fileInfo.source.includes('shouldFilter');
  const hasFilter = fileInfo.source.includes('filter');
  if (!hasShouldFilter && !hasFilter) return fileInfo.source;

  const j = api.jscodeshift;
  const root = j(fileInfo.source);

  // local name -> where the Command component came from
  const bindings = new Map<string, Origin>();
  let firstRaw: string | undefined;
  root.find(j.ImportDeclaration).forEach((path) => {
    const decl = path.node;
    const origin = SOURCES.get(String(decl.source.value));
    if (origin === undefined || decl.importKind === 'type') return;
    firstRaw ??= (decl.source as { extra?: { raw?: string } }).extra?.raw;
    for (const spec of decl.specifiers ?? []) {
      if (spec.type !== 'ImportSpecifier') continue;
      const imported = String(spec.imported.name);
      if (!COMPONENTS.has(imported)) continue;
      if ((spec as { importKind?: string }).importKind === 'type') continue;
      bindings.set(String(spec.local?.name ?? imported), origin);
    }
  });
  if (bindings.size === 0) return fileInfo.source;

  const originOf = (path: ASTPath<JSXOpeningElement>): Origin | undefined => {
    const name = path.node.name;
    let n: string;
    if (name.type === 'JSXIdentifier') {
      n = name.name;
    } else if (
      name.type === 'JSXMemberExpression' &&
      name.object.type === 'JSXIdentifier' &&
      name.property.name === 'Dialog'
    ) {
      n = name.object.name;
    } else {
      return undefined;
    }
    // A local binding that shadows the import is the user's own component.
    const declaring = path.scope?.lookup(n);
    if (declaring !== null && declaring !== undefined && !declaring.isGlobal) return undefined;
    return bindings.get(n);
  };

  let changed = false;
  const typed = /.[cm]?tsx?$/.test(fileInfo.path);

  root.find(j.JSXOpeningElement).forEach((path) => {
    const origin = originOf(path);
    if (origin === undefined) return;

    const attrs = path.node.attributes ?? [];
    const named = (n: string): (typeof attrs)[number] | undefined =>
      attrs.find(
        (a) => a.type === 'JSXAttribute' && a.name.type === 'JSXIdentifier' && a.name.name === n,
      );
    const shouldFilter = named('shouldFilter');
    const filter = named('filter');
    const line = path.node.loc?.start.line;
    const where = `<${elementName(path.node)}> at line ${line ?? '?'}`;

    if (shouldFilter?.type === 'JSXAttribute' && filter !== undefined) {
      api.report(
        `${where} has both shouldFilter and filter; left unchanged for manual migration (filter={false} replaces shouldFilter={false}; a filter takes (item, query) and returns a number or false)`,
      );
      return;
    }

    if (shouldFilter?.type === 'JSXAttribute') {
      changed = rewriteShouldFilter(j, api, path, shouldFilter, where) || changed;
      return;
    }

    if (filter?.type === 'JSXAttribute' && origin === 'cmdk') {
      changed = adaptFilter(j, api, filter, where, typed) || changed;
    }
  });

  return changed ? root.toSource(printOptions(fileInfo.source, firstRaw)) : fileInfo.source;
}

type Attribute = NonNullable<JSXOpeningElement['attributes']>[number] & { type: 'JSXAttribute' };

function elementName(node: JSXOpeningElement): string {
  const name = node.name;
  if (name.type === 'JSXIdentifier') return name.name;
  if (name.type === 'JSXMemberExpression' && name.object.type === 'JSXIdentifier') {
    return `${name.object.name}.${name.property.name}`;
  }
  return '?';
}

function rewriteShouldFilter(
  j: JSCodeshift,
  api: API,
  path: ASTPath<JSXOpeningElement>,
  attr: Attribute,
  where: string,
): boolean {
  const value = attr.value;
  const manual = (why: string): false => {
    api.report(`${where} has ${why}; left unchanged for manual migration`);
    return false;
  };

  if (value === null || value === undefined) return remove(path, attr);
  if (value.type !== 'JSXExpressionContainer') return manual('a non-expression shouldFilter value');

  const expr = value.expression;
  if (expr.type === 'JSXEmptyExpression') return manual('an empty shouldFilter value');
  if (isBoolean(expr, true)) return remove(path, attr);
  if (isBoolean(expr, false)) {
    attr.name = j.jsxIdentifier('filter');
    return true;
  }
  attr.name = j.jsxIdentifier('filter');
  attr.value = j.jsxExpressionContainer(
    j.conditionalExpression(expr, j.identifier('undefined'), j.booleanLiteral(false)),
  );
  return true;
}

function isBoolean(expr: { type: string; value?: unknown }, want: boolean): boolean {
  return (expr.type === 'BooleanLiteral' || expr.type === 'Literal') && expr.value === want;
}

function remove(path: ASTPath<JSXOpeningElement>, attr: Attribute): boolean {
  path.node.attributes = (path.node.attributes ?? []).filter((a) => a !== attr);
  return true;
}

// The exact shape rewriteShouldFilter emits for shouldFilter={expr}: `expr ? undefined : false`.
function isShouldFilterOutput(fn: ExpressionKind): boolean {
  return (
    fn.type === 'ConditionalExpression' &&
    fn.consequent.type === 'Identifier' &&
    fn.consequent.name === 'undefined' &&
    isBoolean(fn.alternate, false)
  );
}

// The adapter's own shape: (a, b) => { const s = f(a.value, ...); return s > 0 ? s : false; }.
// Running the transform on its own output must not wrap the adapter again.
function isAdapterOutput(fn: ExpressionKind): boolean {
  if (fn.type !== 'ArrowFunctionExpression') return false;
  const [first, second, ...rest] = fn.body.type === 'BlockStatement' ? fn.body.body : [];
  const [p0, p1, ...moreParams] = fn.params;
  if (p0?.type !== 'Identifier' || p1?.type !== 'Identifier' || moreParams.length > 0) return false;
  if (first?.type !== 'VariableDeclaration' || first.kind !== 'const') return false;
  if (second?.type !== 'ReturnStatement' || rest.length > 0) return false;
  const [decl, ...moreDecls] = first.declarations;
  if (decl?.type !== 'VariableDeclarator' || moreDecls.length > 0) return false;
  if (decl.id.type !== 'Identifier' || decl.init?.type !== 'CallExpression') return false;
  const arg0 = decl.init.arguments[0];
  if (
    arg0?.type !== 'MemberExpression' ||
    arg0.object.type !== 'Identifier' ||
    arg0.object.name !== p0.name ||
    arg0.property.type !== 'Identifier' ||
    arg0.property.name !== 'value'
  ) {
    return false;
  }
  const id = decl.id.name;
  const ret = second.argument;
  return (
    ret?.type === 'ConditionalExpression' &&
    ret.test.type === 'BinaryExpression' &&
    ret.test.operator === '>' &&
    ret.test.left.type === 'Identifier' &&
    ret.test.left.name === id &&
    ret.consequent.type === 'Identifier' &&
    ret.consequent.name === id &&
    isBoolean(ret.alternate, false)
  );
}

// The guarded form adaptFilter emits for a name or member expression: `x === undefined ? undefined :
// adapter`. A re-run neither wraps it again nor reports it.
function isGuardedAdapterOutput(fn: ExpressionKind): boolean {
  return (
    fn.type === 'ConditionalExpression' &&
    fn.test.type === 'BinaryExpression' &&
    fn.test.operator === '===' &&
    fn.test.right.type === 'Identifier' &&
    fn.test.right.name === 'undefined' &&
    fn.consequent.type === 'Identifier' &&
    fn.consequent.name === 'undefined' &&
    isAdapterOutput(fn.alternate)
  );
}

// A name, or plain property reads off one, yields the same function each read.
function isNamePath(node: ExpressionKind): boolean {
  if (node.type === 'Identifier' || node.type === 'ThisExpression') return true;
  if (node.type !== 'MemberExpression') return false;
  const key = (node.property as { type: string }).type;
  if (node.computed && key !== 'StringLiteral' && key !== 'NumericLiteral') return false;
  return isNamePath(node.object as ExpressionKind);
}

// A fresh copy of a name path isNamePath accepted, so that no AST node object appears twice. A
// re-parse of its source would throw on `this.#f`, which parses only inside its class.
function cloneNamePath(j: JSCodeshift, node: ExpressionKind): ExpressionKind {
  if (node.type === 'Identifier') return j.identifier(node.name);
  if (node.type !== 'MemberExpression') return j.thisExpression();
  const key = node.property;
  const property =
    key.type === 'Identifier'
      ? j.identifier(key.name)
      : key.type === 'PrivateName'
        ? j.privateName(j.identifier(String(key.id.name)))
        : key.type === 'StringLiteral'
          ? j.stringLiteral(key.value)
          : j.numericLiteral((key as { value: number }).value);
  return j.memberExpression(
    cloneNamePath(j, node.object as ExpressionKind),
    property,
    node.computed,
  );
}

function adaptFilter(
  j: JSCodeshift,
  api: API,
  attr: Attribute,
  where: string,
  typed: boolean,
): boolean {
  const value = attr.value;
  if (value?.type !== 'JSXExpressionContainer' || value.expression.type === 'JSXEmptyExpression') {
    api.report(
      `${where} has a filter value the transform cannot adapt; left unchanged for manual migration`,
    );
    return false;
  }
  const fn = value.expression;
  if (isBoolean(fn, false) || isBoolean(fn, true)) return false;
  if (isShouldFilterOutput(fn) || isAdapterOutput(fn) || isGuardedAdapterOutput(fn)) return false;
  // `filter={undefined}` means the default filter in cmdk and in modern-cmdk.
  if (fn.type === 'Identifier' && fn.name === 'undefined') return false;
  const type = fn.type as string;
  if (
    type === 'NullLiteral' ||
    (type === 'Literal' && (fn as { value?: unknown }).value === null) ||
    type === 'ConditionalExpression' ||
    type === 'LogicalExpression'
  ) {
    api.report(
      `${where} has a filter expression that may not be a function; left unchanged for manual migration`,
    );
    return false;
  }

  // A call, `new`, a computed key, also inside a member chain (`useFilters().byName`), or any other
  // computed value would run once per item per query inside the core machine's scorer
  // (core/machine.ts:69-77), outside React render, instead of once per render.
  if (!isFunctionLiteral(fn) && (fn.type === 'ThisExpression' || !isNamePath(fn))) {
    api.report(
      `${where} has a filter expression that is computed where it stands (a call or other computed value), which the adapter would re-evaluate on every item outside render; left unchanged for manual migration: hoist it to a const and pass the name`,
    );
    return false;
  }

  const used = new Set<string>();
  if (fn.type === 'Identifier') used.add(fn.name);
  j(fn)
    .find(j.Identifier)
    .forEach((id) => {
      used.add(id.node.name);
    });
  const adapter = j(
    adapterSource(
      freeName('item', used),
      freeName('query', used),
      freeName('score', used),
      argCountOf(j, fn),
    ),
  )
    .find(j.ArrowFunctionExpression)
    .get().node;
  j(adapter)
    .find(j.Identifier, { name: '__fn' })
    .replaceWith(() => (typed && !isFunctionLiteral(fn) ? castToCmdkFilter(j, fn) : fn));
  // `filter={x}` with x undefined means the default filter in cmdk; calling it would throw. A name or
  // member expression therefore keeps that meaning behind `x === undefined ? undefined : adapter`.
  // The test gets a structural copy of the expression: no AST node object appears twice.
  if (isFunctionLiteral(fn)) {
    attr.value = j.jsxExpressionContainer(adapter);
  } else {
    const copy = cloneNamePath(j, fn);
    attr.value = j.jsxExpressionContainer(
      j.conditionalExpression(
        j.binaryExpression('===', copy, j.identifier('undefined')),
        j.identifier('undefined'),
        adapter,
      ),
    );
  }
  return true;
}

// `(fn as (value: string, search: string, keywords?: string[]) => number)`: a cmdk filter passed by
// name may declare fewer than three parameters, which TypeScript rejects at a three-argument call.
function castToCmdkFilter(j: JSCodeshift, fn: ExpressionKind): ExpressionKind {
  const param = (name: string, type: TSTypeKind, optional = false): Identifier => {
    const id = j.identifier(name);
    id.typeAnnotation = j.tsTypeAnnotation(type);
    if (optional) id.optional = true;
    return id;
  };
  const signature = j.tsFunctionType([
    param('value', j.tsStringKeyword()),
    param('search', j.tsStringKeyword()),
    param('keywords', j.tsArrayType(j.tsStringKeyword()), true),
  ]);
  signature.typeAnnotation = j.tsTypeAnnotation(j.tsNumberKeyword());
  const cast = j.tsAsExpression(fn, signature);
  // recast does not parenthesize an `as` callee itself; this is the flag it reads to print them.
  (cast as { extra?: { parenthesized: boolean } }).extra = { parenthesized: true };
  return cast;
}

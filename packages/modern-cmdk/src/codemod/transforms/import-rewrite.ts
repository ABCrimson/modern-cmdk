// modern-cmdk — Transform: import-rewrite
// Rewrites imports from 'cmdk' to 'modern-cmdk/react', and only to names that modern-cmdk/react
// exports (KNOWN_EXPORTS). Everything else in the file keeps its bytes.
//
// Module specifiers equal to 'cmdk' are rewritten in:
//   import … from 'cmdk' (named, default, namespace, side-effect, type-only), export … from 'cmdk',
//   export * from 'cmdk', export * as K from 'cmdk', import('cmdk'), require('cmdk'),
//   import k = require('cmdk'), typeof import('cmdk'), and the first argument of
//   vi.mock/doMock/unmock/doUnmock/importActual/importMock and
//   jest.mock/doMock/unmock/doUnmock/requireActual/requireMock.
//
// Names are checked against modern-cmdk/react, never assumed:
//   - CommandRoot and a default import become `Command` (`Command as <local>`): cmdk exports its
//     root as both `Command` and `CommandRoot`, and has no default export at all.
//   - A name in KNOWN_EXPORTS keeps its name. useCommandState is rewritten and reported: its state
//     is modern-cmdk's CommandState, not cmdk's.
//   - Any other name (defaultFilter, CommandProps, …) stays on a 'cmdk' import, split off from the
//     rewritten specifiers, with one report per name. The file keeps depending on cmdk until the
//     reported site is migrated by hand.
//   - A namespace import is rewritten; each `K.name` member access, `<K.name>` JSX tag or `K.name` type reference whose name is outside
//     KNOWN_EXPORTS is reported. So is the qualifier of `import('cmdk').Name`, and `export * from 'cmdk'`
//     is reported once, because the names cmdk has and modern-cmdk/react lacks no longer pass through it.
//   - The same check covers the other bindings: `import k = require('cmdk')`, and a variable bound
//     to require / import() / await import() / jest.requireActual / vi.importActual of 'cmdk'
//     (member reads), and a destructured `const { … } = require('cmdk')` (renamed or missing names).
//
// Left unchanged and reported: `declare module 'cmdk'`, and any 'cmdk/<subpath>' specifier.
// A mock factory that names CommandRoot or defaultFilter is reported; its body is not rewritten.
// A source written as a template literal with no expressions (`cmdk`) is a plain string source: its
// quasi is rewritten, the backticks stay, and the same member and mock checks run.
// 'cmdk-extra' and every other specifier are not touched and not reported.
//
// A file whose text has no 'cmdk' in it returns before it is parsed. A rewritten declaration is
// printed by recast, so it follows recast's layout (it ends in a semicolon, and a split declaration
// that carries a leading comment gets a blank line between its two halves).

import type { API, ASTPath, FileInfo } from 'jscodeshift';
import { printOptions } from '../print-options.js';

const OLD_PACKAGE = 'cmdk';
const NEW_PACKAGE = 'modern-cmdk/react';

/**
 * The names modern-cmdk/react exports: the value exports and the `export type` names of
 * src/react/index.ts. tests/unit/codemod-import-rewrite.test.ts compares this set to that file,
 * so it fails when the library changes.
 */
export const KNOWN_EXPORTS: ReadonlySet<string> = new Set([
  'ActivityMode',
  'Command',
  'CommandActivity',
  'CommandActivityProps',
  'CommandAsyncItems',
  'CommandAsyncItemsProps',
  'CommandBadge',
  'CommandBadgeProps',
  'CommandContextValue',
  'CommandDialog',
  'CommandDialogProps',
  'CommandEmpty',
  'CommandEmptyProps',
  'CommandErrorBoundary',
  'CommandErrorBoundaryProps',
  'CommandGroup',
  'CommandGroupContextValue',
  'CommandGroupProps',
  'CommandHighlight',
  'CommandHighlightProps',
  'CommandInput',
  'CommandInputProps',
  'CommandItem',
  'CommandItemProps',
  'CommandList',
  'CommandListProps',
  'CommandLoading',
  'CommandLoadingProps',
  'CommandPage',
  'CommandPageId',
  'CommandPageProps',
  'CommandRootId',
  'CommandRootProps',
  'CommandSeparator',
  'CommandSeparatorProps',
  'CommandShortcut',
  'CommandShortcutProps',
  'CommandStableContext',
  'CommandStableContextValue',
  'CommandStateContext',
  'CommandStateContextValue',
  'RegisterGroupOptions',
  'RegisterItemOptions',
  'UseCommandReturn',
  'VirtualItem',
  'VirtualizerOptions',
  'VirtualizerReturn',
  'createKeydownHandler',
  'useCommand',
  'useCommandDevtools',
  'useCommandState',
  'useRegisterGroup',
  'useRegisterItem',
  'useVirtualizer',
]);

/**
 * cmdk names that modern-cmdk/react exports under another name. cmdk's d.ts ends with
 * `export { pkg as Command, …, Command as CommandRoot, … }`: both are the root component. cmdk has
 * no default export; a default import (and `default as X`) is read as the root too.
 */
const RENAMED: ReadonlyMap<string, string> = new Map([
  ['CommandRoot', 'Command'],
  ['default', 'Command'],
]);

/** cmdk exports that have no modern-cmdk/react counterpart under the same name. */
const CMDK_ONLY_NAMES: ReadonlySet<string> = new Set(['CommandRoot', 'defaultFilter']);

const MOCK_OBJECTS: ReadonlySet<string> = new Set(['vi', 'jest']);
const MOCK_METHODS: ReadonlySet<string> = new Set([
  'mock',
  'doMock',
  'unmock',
  'doUnmock',
  'importActual',
  'importMock',
  'requireActual',
  'requireMock',
]);

/** The modern-cmdk/react name for a cmdk name, or undefined when there is none. */
function mapName(name: string): string | undefined {
  const renamed = RENAMED.get(name);
  if (renamed !== undefined) return renamed;
  return KNOWN_EXPORTS.has(name) ? name : undefined;
}

interface Literalish {
  type: string;
  value: string;
  extra?: { raw?: unknown } | null;
  raw?: unknown;
}

/** A string literal node (Babel StringLiteral or ESTree Literal), or undefined. */
function asStringLiteral(node: unknown): Literalish | undefined {
  if (typeof node !== 'object' || node === null) return undefined;
  const lit = node as { type?: unknown; value?: unknown };
  if (lit.type !== 'StringLiteral' && lit.type !== 'Literal') return undefined;
  return typeof lit.value === 'string' ? (node as Literalish) : undefined;
}

interface PlainTemplate {
  type: 'TemplateLiteral';
  expressions: unknown[];
  quasis: { value: { raw: string; cooked?: string | null } }[];
}

/** A template literal with no expressions and one quasi (`cmdk`), or undefined. */
function asPlainTemplate(node: unknown): PlainTemplate | undefined {
  if (typeof node !== 'object' || node === null) return undefined;
  const t = node as Partial<PlainTemplate>;
  if (t.type !== 'TemplateLiteral' || t.expressions?.length !== 0 || t.quasis?.length !== 1) {
    return undefined;
  }
  return node as PlainTemplate;
}

/** The text of a string-literal or plain-template module source, or undefined. */
function sourceText(node: unknown): string | undefined {
  const lit = asStringLiteral(node);
  if (lit !== undefined) return lit.value;
  return asPlainTemplate(node)?.quasis[0]?.value.cooked ?? undefined;
}

/** The name of an Identifier, JSXIdentifier or string-literal module-export name. */
function nameOf(node: unknown): string | undefined {
  if (typeof node !== 'object' || node === null) return undefined;
  const n = node as { type?: unknown; name?: unknown };
  if ((n.type === 'Identifier' || n.type === 'JSXIdentifier') && typeof n.name === 'string') {
    return n.name;
  }
  return asStringLiteral(node)?.value;
}

/**
 * jscodeshift transform — rewrites cmdk imports to modern-cmdk/react, checking every imported
 * name against modern-cmdk/react's exports.
 */
export default function transform(fileInfo: FileInfo, api: API): string {
  // Early bail: nothing to rewrite without the text 'cmdk'; the parse never runs.
  if (!fileInfo.source.includes(OLD_PACKAGE)) return fileInfo.source;

  const j = api.jscodeshift;
  const root = j(fileInfo.source);
  let changed = false;
  let firstRaw: string | undefined;

  const subpathReport = (specifier: string): void => {
    api.report(
      `'${specifier}' is a cmdk subpath with no modern-cmdk/react counterpart; left unchanged`,
    );
  };

  /** Rewrite a module-specifier literal equal to 'cmdk'; report a 'cmdk/<subpath>' one. */
  const rewriteSite = (node: unknown): void => {
    const text = sourceText(node);
    if (text === undefined) return;
    if (text === OLD_PACKAGE) {
      const lit = asStringLiteral(node);
      if (lit !== undefined) {
        if (firstRaw === undefined) {
          const raw = lit.extra?.raw ?? lit.raw;
          if (typeof raw === 'string') firstRaw = raw;
        }
        lit.value = NEW_PACKAGE;
      } else {
        // recast prints a TemplateElement from value.raw (recast/lib/printer.js, "TemplateElement").
        const quasi = asPlainTemplate(node)?.quasis[0];
        if (quasi === undefined) return;
        quasi.value.raw = NEW_PACKAGE;
        quasi.value.cooked = NEW_PACKAGE;
      }
      changed = true;
    } else if (text.startsWith(`${OLD_PACKAGE}/`)) {
      subpathReport(text);
    }
  };

  /**
   * Replace a declaration with several. The new nodes carry no source location, so recast prints
   * them on consecutive lines instead of copying the original's trailing blank line between them.
   */
  const replaceWith = (
    path: ASTPath,
    nodes: [import('jscodeshift').Node, ...import('jscodeshift').Node[]],
  ): void => {
    (nodes[0] as { comments?: unknown }).comments = (path.node as { comments?: unknown }).comments;
    path.replace(...nodes);
    changed = true;
  };

  const isCmdkSource = (node: unknown): boolean => sourceText(node) === OLD_PACKAGE;

  const handleImport = (path: ASTPath<import('jscodeshift').ImportDeclaration>): void => {
    const node = path.node;
    if (!isCmdkSource(node.source)) {
      rewriteSite(node.source);
      return;
    }

    const mapped: NonNullable<typeof node.specifiers> = [];
    const unmapped: NonNullable<typeof node.specifiers> = [];
    let namespace: (typeof mapped)[number] | undefined;
    let rebuilt = false;

    for (const spec of node.specifiers ?? []) {
      if (spec.type === 'ImportNamespaceSpecifier') {
        namespace = spec;
        continue;
      }
      if (spec.type === 'ImportDefaultSpecifier') {
        const local = nameOf(spec.local) ?? 'Command';
        mapped.push(j.importSpecifier(j.identifier('Command'), j.identifier(local)));
        rebuilt = true;
        continue;
      }
      const imported = nameOf(spec.imported) ?? '';
      const target = mapName(imported);
      if (target === undefined) {
        unmapped.push(spec);
        api.report(`${imported} has no modern-cmdk/react export; left on the cmdk import`);
        continue;
      }
      if (imported === 'useCommandState') {
        api.report(
          `useCommandState was rewritten, but its state is modern-cmdk's CommandState, not cmdk's; review the selector`,
        );
      }
      if (target === imported) {
        mapped.push(spec);
        continue;
      }
      const renamed = j.importSpecifier(
        j.identifier(target),
        j.identifier(nameOf(spec.local) ?? imported),
      );
      const kind = (spec as { importKind?: unknown }).importKind;
      if (kind !== undefined) (renamed as { importKind?: unknown }).importKind = kind;
      mapped.push(renamed);
      rebuilt = true;
    }

    if (namespace === undefined && mapped.length === 0 && unmapped.length > 0) return;

    rewriteSite(node.source);

    if (namespace !== undefined) {
      if (mapped.length > 0) {
        replaceWith(path, [
          j.importDeclaration([namespace], j.stringLiteral(NEW_PACKAGE), node.importKind),
          j.importDeclaration(mapped, j.stringLiteral(NEW_PACKAGE), node.importKind),
        ]);
      }
      const local = nameOf((namespace as { local?: unknown }).local);
      if (local !== undefined) reportNamespaceMembers(path, local, `the namespace import ${local}`);
    } else if (unmapped.length > 0) {
      replaceWith(path, [
        j.importDeclaration(mapped, j.stringLiteral(NEW_PACKAGE), node.importKind),
        j.importDeclaration(unmapped, j.stringLiteral(OLD_PACKAGE), node.importKind),
      ]);
    } else if (rebuilt) {
      node.specifiers = mapped;
    }
  };

  /** Report each `K.name` member access, `<K.name>` JSX tag and `K.name` type reference on a namespace import whose name has no export. */
  const reportNamespaceMembers = (
    importPath: ASTPath<import('jscodeshift').Node>,
    local: string,
    via: string,
  ): void => {
    const declaredHere = importPath.scope?.lookup(local);
    const note = (member: unknown, scope: { lookup(name: string): unknown } | null): void => {
      if (scope?.lookup(local) !== declaredHere) return;
      const name = nameOf(member);
      if (name === undefined || KNOWN_EXPORTS.has(name)) return;
      api.report(`${name} has no modern-cmdk/react export; used through ${via}`);
    };
    root.find(j.MemberExpression, { object: { type: 'Identifier', name: local } }).forEach((p) => {
      if (!p.node.computed) note(p.node.property, p.scope);
    });
    root.find(j.TSQualifiedName, { left: { type: 'Identifier', name: local } }).forEach((p) => {
      note(p.node.right, p.scope);
    });
    root
      .find(j.JSXMemberExpression, { object: { type: 'JSXIdentifier', name: local } })
      .forEach((p) => {
        // A closing tag names the same element as its opening tag, which is already reported.
        let tag: ASTPath<import('jscodeshift').Node> = p;
        while (tag.parent?.node.type === 'JSXMemberExpression') tag = tag.parent;
        if (tag.parent?.node.type === 'JSXClosingElement') return;
        note(p.node.property, p.scope);
      });
  };

  /**
   * For a require()/import()/requireActual() call on 'cmdk' that is bound to a variable (directly
   * or through await), report destructured names and member reads that modern-cmdk/react lacks.
   */
  const reportBoundMembers = (callPath: ASTPath<import('jscodeshift').Node>): void => {
    let p: ASTPath<import('jscodeshift').Node> = callPath.parent;
    if (p?.node.type === 'AwaitExpression') p = p.parent;
    if (p?.node.type !== 'VariableDeclarator') return;
    const id = (p.node as { id?: { type?: string; name?: string; properties?: unknown[] } }).id;
    if (id?.type === 'ObjectPattern') {
      for (const prop of id.properties ?? []) {
        const pr = prop as { type?: string; computed?: boolean; key?: unknown };
        if ((pr.type !== 'ObjectProperty' && pr.type !== 'Property') || pr.computed === true) {
          continue;
        }
        const name = nameOf(pr.key);
        if (name === undefined || mapName(name) === name) continue;
        api.report(
          `${name} has no modern-cmdk/react export under that name; destructured from the cmdk module`,
        );
      }
    } else if (id?.type === 'Identifier' && id.name !== undefined) {
      reportNamespaceMembers(p, id.name, `${id.name}, bound to the cmdk module`);
    }
  };

  const handleExportFrom = (path: ASTPath<import('jscodeshift').ExportNamedDeclaration>): void => {
    const node = path.node;
    if (!isCmdkSource(node.source)) {
      rewriteSite(node.source);
      return;
    }

    const mapped: NonNullable<typeof node.specifiers> = [];
    const unmapped: NonNullable<typeof node.specifiers> = [];
    let rebuilt = false;

    for (const spec of node.specifiers ?? []) {
      if (spec.type !== 'ExportSpecifier') {
        mapped.push(spec); // export * as K: the whole module moves
        continue;
      }
      const exportedName = nameOf(spec.local);
      if (exportedName === undefined) {
        mapped.push(spec);
        continue;
      }
      const target = mapName(exportedName);
      if (target === undefined) {
        unmapped.push(spec);
        api.report(`${exportedName} has no modern-cmdk/react export; left on the cmdk export`);
        continue;
      }
      if (exportedName === 'useCommandState') {
        api.report(
          `useCommandState was rewritten, but its state is modern-cmdk's CommandState, not cmdk's; review the selector`,
        );
      }
      if (target === exportedName) {
        mapped.push(spec);
        continue;
      }
      const renamed = j.exportSpecifier.from({
        local: j.identifier(target),
        exported: j.identifier(nameOf(spec.exported) ?? exportedName),
      });
      const kind = (spec as { exportKind?: unknown }).exportKind;
      if (kind !== undefined) (renamed as { exportKind?: unknown }).exportKind = kind;
      mapped.push(renamed);
      rebuilt = true;
    }

    if (mapped.length === 0 && unmapped.length > 0) return;

    rewriteSite(node.source);

    if (unmapped.length > 0) {
      const kept = j.exportNamedDeclaration(null, mapped, j.stringLiteral(NEW_PACKAGE));
      const rest = j.exportNamedDeclaration(null, unmapped, j.stringLiteral(OLD_PACKAGE));
      if (node.exportKind !== undefined) {
        kept.exportKind = node.exportKind;
        rest.exportKind = node.exportKind;
      }
      replaceWith(path, [kept, rest]);
    } else if (rebuilt) {
      node.specifiers = mapped;
    }
  };

  /** vi.mock('cmdk', factory) and friends: rewrite the path, report a factory naming cmdk-only names. */
  const handleMockFactory = (path: ASTPath<import('jscodeshift').CallExpression>): void => {
    const factory = path.get('arguments', 1);
    const type = (factory.node as { type?: string } | undefined)?.type;
    if (type !== 'ArrowFunctionExpression' && type !== 'FunctionExpression') return;
    const found = new Set<string>();
    j(factory)
      .find(j.Identifier)
      .forEach((p) => {
        if (CMDK_ONLY_NAMES.has(p.node.name)) found.add(p.node.name);
      });
    j(factory)
      .find(j.StringLiteral)
      .forEach((p) => {
        if (CMDK_ONLY_NAMES.has(p.node.value)) found.add(p.node.value);
      });
    if (found.size === 0) return;
    api.report(
      `the mock factory for 'cmdk' names ${[...found].join(', ')}, which modern-cmdk/react does not export under that name; the factory body is not rewritten, check it by hand`,
    );
  };

  root.find(j.Node).forEach((path) => {
    const node = path.node as unknown as Record<string, unknown> & { type: string };
    switch (node.type) {
      case 'ImportDeclaration':
        handleImport(path as ASTPath<import('jscodeshift').ImportDeclaration>);
        break;
      case 'ExportNamedDeclaration':
        handleExportFrom(path as ASTPath<import('jscodeshift').ExportNamedDeclaration>);
        break;
      case 'ExportAllDeclaration': {
        // `export * as K from` is an ExportNamedDeclaration; only the bare star loses names.
        if (isCmdkSource(node.source)) {
          api.report(
            `export * from '${OLD_PACKAGE}' re-exported names that ${NEW_PACKAGE} lacks (${[...CMDK_ONLY_NAMES].join(', ')}); re-export the ${NEW_PACKAGE} names by hand`,
          );
        }
        rewriteSite(node.source);
        break;
      }
      case 'ImportExpression': {
        const isCmdk = isCmdkSource(node.source);
        rewriteSite(node.source);
        if (isCmdk) reportBoundMembers(path);
        break;
      }
      case 'TSImportEqualsDeclaration': {
        const ref = node.moduleReference as { type?: string; expression?: unknown } | undefined;
        if (ref?.type === 'TSExternalModuleReference') {
          const isCmdk = isCmdkSource(ref.expression);
          rewriteSite(ref.expression);
          const id = node.id as { type?: string; name?: string } | undefined;
          if (isCmdk && id?.type === 'Identifier' && id.name !== undefined) {
            reportNamespaceMembers(path, id.name, `the namespace import ${id.name}`);
          }
        }
        break;
      }
      case 'TSImportType': {
        const arg = node.argument as { type?: string; literal?: unknown } | undefined;
        const lit = arg?.type === 'TSLiteralType' ? arg.literal : arg;
        const isCmdk = isCmdkSource(lit);
        rewriteSite(lit);
        if (isCmdk) {
          let q = node.qualifier as
            | { type?: string; left?: unknown; name?: string }
            | null
            | undefined;
          while (q?.type === 'TSQualifiedName') q = q.left as typeof q;
          const name = nameOf(q);
          if (name !== undefined && !KNOWN_EXPORTS.has(name)) {
            api.report(`${name} has no modern-cmdk/react export; used through import('cmdk')`);
          }
        }
        break;
      }
      case 'TSModuleDeclaration': {
        const id = asStringLiteral(node.id);
        if (id?.value === OLD_PACKAGE) {
          api.report(
            `declare module '${OLD_PACKAGE}' was left unchanged; move the declaration to '${NEW_PACKAGE}' by hand`,
          );
        } else if (id?.value.startsWith(`${OLD_PACKAGE}/`)) {
          subpathReport(id.value);
        }
        break;
      }
      case 'CallExpression': {
        const call = path as ASTPath<import('jscodeshift').CallExpression>;
        const callee = call.node.callee as {
          type: string;
          name?: string;
          computed?: boolean;
          object?: { type: string; name?: string };
          property?: { type: string; name?: string };
        };
        const arg = call.node.arguments[0];
        const isCmdk = isCmdkSource(arg);
        if (callee.type === 'Import') {
          rewriteSite(arg);
          if (isCmdk) reportBoundMembers(path);
        } else if (callee.type === 'Identifier' && callee.name === 'require') {
          rewriteSite(arg);
          if (isCmdk) reportBoundMembers(path);
        } else if (
          callee.type === 'MemberExpression' &&
          callee.computed !== true &&
          callee.object?.type === 'Identifier' &&
          MOCK_OBJECTS.has(callee.object.name ?? '') &&
          callee.property?.type === 'Identifier' &&
          MOCK_METHODS.has(callee.property.name ?? '')
        ) {
          const a = arg as
            | {
                type?: string;
                source?: unknown;
                callee?: { type?: string };
                arguments?: unknown[];
              }
            | undefined;
          if (
            isCmdk ||
            (a?.type === 'ImportExpression' && isCmdkSource(a.source)) ||
            (a?.type === 'CallExpression' &&
              a.callee?.type === 'Import' &&
              isCmdkSource(a.arguments?.[0]))
          ) {
            handleMockFactory(call);
          }
          rewriteSite(arg);
          if (isCmdk) reportBoundMembers(path);
        }
        break;
      }
      default:
        break;
    }
  });

  if (!changed) return fileInfo.source;
  return root.toSource(printOptions(fileInfo.source, firstRaw));
}

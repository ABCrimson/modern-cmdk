// modern-cmdk/codemod — Transform: forward-ref
// Unwraps React.forwardRef() into a React 19 component that takes `ref` as a regular prop.
//
// Before:
//   const Panel = React.forwardRef<HTMLDivElement, PanelProps>((props, forwardedRef) => (
//     <div ref={forwardedRef} {...props} />
//   ));
//
// After:
//   const Panel = ({ ref: forwardedRef, ...props }: PanelProps & { ref?: React.Ref<HTMLDivElement> }) => (
//     <div ref={forwardedRef} {...props} />
//   );
//
// What it converts: calls whose callee comes from a `react` import (`forwardRef`, an alias such as
// `forwardRef as fr`, or `<namespace>.forwardRef` for a default or namespace import), including
// inside `memo(...)`, when the argument is an arrow function or function expression with at most
// two parameters. The ref parameter keeps its name (`ref` stays shorthand, any other name becomes
// `ref: name`). The parameters' own annotations, or else the call's type arguments, become the annotation of
// the new props pattern: `Props & { ref?: Ref<T> }`, spelled `<Namespace>.Ref` when a default or
// namespace import of react exists and otherwise through a type-only `Ref` specifier added to the
// react named import. A forwardRef import specifier is removed only when nothing else refers to
// it, and its declaration only when no specifier remains. A single-parameter render function with a
// ref type argument or an annotated props parameter also gets `{ ref?: Ref<T> }` (`Ref<unknown>` without
// a type argument) so callers can still pass `ref`. A props spread in such a function now forwards that
// ref, where forwardRef dropped it. A render function with neither type arguments nor annotations stays
// untyped: under strict TypeScript forwardRef inferred the ref as ForwardedRef<unknown>, which cannot be
// attached to a DOM element, so the input was not type-safe either, and the implicit-any error on the
// output asks for the annotation the author never wrote (`Ref<unknown>` is not assignable to a DOM ref).
//
// What it leaves unchanged, each with one report: an argument that is not a function literal
// (`forwardRef(Inner)`), `forwardRef()` with no argument, a render function without parameters when the
// call has a ref type argument, more than two parameters, a props parameter that is not an identifier,
// an object pattern or an assignment pattern whose left side is one of those, a ref parameter
// that is not a plain identifier, a props pattern that already has a `ref` key or a computed key that is not a literal, a single-parameter render function with an annotated props parameter, no ref type argument and a JSX spread, and a ref
// annotation without any props type (the props type would be lost).

import type {
  API,
  ArrowFunctionExpression,
  ASTPath,
  CallExpression,
  FileInfo,
  FunctionExpression,
  Identifier,
  TSQualifiedName,
} from 'jscodeshift';
import jscodeshift from 'jscodeshift';
import { printOptions } from '../print-options.js';

type Kind = Parameters<API['jscodeshift']['tsParenthesizedType']>[0];
type Param = CallExpression['arguments'][number];

/** The local names a `react` import declaration group binds, read from the file's imports. */
interface ReactBindings {
  /** Local names of `forwardRef` named imports (aliases included). */
  readonly forwardRefs: Set<string>;
  /** Local names of default and namespace imports (`React`, `R`). */
  readonly namespaces: string[];
}

/**
 * jscodeshift transform — unwraps forwardRef and binds the ref parameter as a `ref` prop.
 */
export default function transform(fileInfo: FileInfo, api: API): string {
  // Quick bail — every callee form (named, aliased, namespace) spells forwardRef in its import.
  if (!fileInfo.source.includes('forwardRef')) {
    return fileInfo.source;
  }

  const j = api.jscodeshift;
  const root = j(fileInfo.source);

  const reactImports = root.find(j.ImportDeclaration).filter((path) => {
    return path.node.source.value === 'react' && path.node.importKind !== 'type';
  });

  const programScope = root.find(j.Program).get().scope;
  const bindings: ReactBindings = { forwardRefs: new Set(), namespaces: [] };
  reactImports.forEach((path) => {
    for (const specifier of path.node.specifiers ?? []) {
      if (specifier.type === 'ImportSpecifier') {
        if (specifier.imported.name === 'forwardRef') {
          bindings.forwardRefs.add((specifier.local ?? specifier.imported).name as string);
        }
      } else if (specifier.local) {
        bindings.namespaces.push(specifier.local.name as string);
      }
    }
  });
  if (bindings.forwardRefs.size === 0 && bindings.namespaces.length === 0) {
    return fileInfo.source;
  }

  /** Whether a declaration other than a react import specifier binds `name` as a type anywhere in the file. */
  const redeclaresType = (name: string): boolean =>
    root.find(j.TSTypeParameter, { name }).size() > 0 ||
    root.find(j.TSTypeAliasDeclaration, { id: { name } }).size() > 0 ||
    root.find(j.TSInterfaceDeclaration, { id: { name } }).size() > 0 ||
    root.find(j.TSEnumDeclaration, { id: { name } }).size() > 0 ||
    root.find(j.TSModuleDeclaration, { id: { name } }).size() > 0 ||
    root.find(j.ClassDeclaration, { id: { name } }).size() > 0 ||
    root.find(j.ClassExpression, { id: { name } }).size() > 0 ||
    root.find(j.TSImportEqualsDeclaration, { id: { name } }).size() > 0;
  /**
   * `Ref` as a type name: `<Namespace>.Ref` when react has a default or namespace import, else a
   * `Ref` specifier (existing, or a type-only one added once) on the react named import.
   */
  let refResolved = false;
  let refLocal = 'Ref';
  const refTypeName = (): Identifier | TSQualifiedName => {
    const namespace = bindings.namespaces[0];
    if (namespace !== undefined) {
      return j.tsQualifiedName(j.identifier(namespace), j.identifier('Ref'));
    }
    if (!refResolved) {
      refResolved = true;
      // An existing `Ref` specifier on any react import, type-only declarations included, unless a type
      // declaration of the file (type parameter, alias, interface, enum, namespace, class, import alias) reuses its name.
      const existing = root
        .find(j.ImportDeclaration, { source: { value: 'react' } })
        .find(j.ImportSpecifier, { imported: { name: 'Ref' } })
        .paths()[0];
      const existingLocal =
        existing && ((existing.node.local ?? existing.node.imported).name as string);
      if (existingLocal !== undefined && !redeclaresType(existingLocal)) {
        refLocal = existingLocal;
      } else {
        // Pick a local name no identifier or type parameter of the file uses (a TSTypeParameter is an
        // Identifier in ast-types, def/typescript.js), so enums, namespaces and nested scopes count.
        let suffix = 1;
        while (root.find(j.Identifier, { name: refLocal }).size() > 0) {
          suffix += 1;
          refLocal = suffix === 2 ? 'ReactRef' : `ReactRef${suffix - 1}`;
        }
        const named = reactImports.filter((path) =>
          (path.node.specifiers ?? []).some((s) => s.type === 'ImportSpecifier'),
        );
        named
          .paths()[0]
          ?.node.specifiers?.push(
            Object.assign(
              j.importSpecifier(
                j.identifier('Ref'),
                refLocal === 'Ref' ? null : j.identifier(refLocal),
              ),
              { importKind: 'type' as const },
            ),
          );
      }
    }
    return j.identifier(refLocal);
  };

  let hasChanges = false;
  const manual = (message: string): void => {
    api.report(message);
  };

  const isForwardRefCall = (node: CallExpression): boolean => {
    const callee = node.callee;
    if (callee.type === 'Identifier') return bindings.forwardRefs.has(callee.name);
    return (
      callee.type === 'MemberExpression' &&
      !callee.computed &&
      callee.object.type === 'Identifier' &&
      bindings.namespaces.includes(callee.object.name) &&
      callee.property.type === 'Identifier' &&
      callee.property.name === 'forwardRef'
    );
  };

  const calls: ASTPath<CallExpression>[] = root
    .find(j.CallExpression)
    .filter((path) => {
      if (!isForwardRefCall(path.node)) return false;
      const callee = path.node.callee;
      const name =
        callee.type === 'Identifier' ? callee.name : (callee as { object: Identifier }).object.name;
      // A local binding that shadows the import is not React's forwardRef.
      return path.scope.lookup(name) === programScope;
    })
    .paths();

  for (const path of calls) {
    const call = path.node;
    const renderFn: Param | undefined = call.arguments[0];
    if (renderFn === undefined) {
      manual('forwardRef() without a render function: unwrap by hand');
      continue;
    }
    if (renderFn.type !== 'ArrowFunctionExpression' && renderFn.type !== 'FunctionExpression') {
      manual(
        renderFn.type === 'Identifier'
          ? `forwardRef(${renderFn.name}): unwrap by hand`
          : 'forwardRef(<expression>): unwrap by hand',
      );
      continue;
    }

    const params = renderFn.params;
    if (params.length > 2) {
      manual('forwardRef render function with more than two parameters: unwrap by hand');
      continue;
    }

    // The type arguments: forwardRef<RefType, PropsType>(...). Babel 7 names the field
    // typeParameters, Babel 8 typeArguments.
    const typeArgs = ((call.typeArguments ?? call.typeParameters)?.params ?? []).filter(isTsType);
    const typeArgRef = typeArgs[0];
    const typeArgProps = typeArgs[1];

    const propsParam = params[0];
    const refParam = params[1];

    if (propsParam === undefined) {
      if (typeArgRef !== undefined) {
        manual('forwardRef<T>() render function without parameters: unwrap by hand');
        continue;
      }
      unwrapCall(path, renderFn);
      hasChanges = true;
      continue;
    }

    // The pattern that carries the props: the parameter itself, or the left side of a default.
    const target = propsParam.type === 'AssignmentPattern' ? propsParam.left : propsParam;
    if (target.type !== 'Identifier' && target.type !== 'ObjectPattern') {
      manual('forwardRef props parameter is not an identifier or object pattern: unwrap by hand');
      continue;
    }
    const propsAnnotation = target.typeAnnotation;
    const propsType = tsTypeOf(propsAnnotation) ?? typeArgProps;

    // A computed key that is not a literal may evaluate to 'ref' at run time.
    if (
      target.type === 'ObjectPattern' &&
      target.properties.some(
        (p) =>
          (p.type === 'ObjectProperty' || p.type === 'Property') &&
          p.computed &&
          p.key.type !== 'StringLiteral' &&
          p.key.type !== 'NumericLiteral' &&
          p.key.type !== 'BigIntLiteral' &&
          !(p.key.type === 'TemplateLiteral' && p.key.expressions.length === 0),
      )
    ) {
      manual("forwardRef props pattern has a computed key that may be 'ref': unwrap by hand");
      continue;
    }

    // React 19 strips ref from forwardRef props, so an existing `ref` key reads undefined today.
    if (
      target.type === 'ObjectPattern' &&
      target.properties.some(
        (p) =>
          (p.type === 'ObjectProperty' || p.type === 'Property') &&
          ((!p.computed && p.key.type === 'Identifier' && p.key.name === 'ref') ||
            (p.key.type === 'StringLiteral' && p.key.value === 'ref') ||
            (p.computed &&
              p.key.type === 'TemplateLiteral' &&
              p.key.expressions.length === 0 &&
              p.key.quasis[0]?.value.cooked === 'ref')),
      )
    ) {
      manual("forwardRef props pattern already has a 'ref' key: unwrap by hand");
      continue;
    }

    if (refParam === undefined) {
      // Single parameter: the render function becomes the component as it is. forwardRef stripped ref
      // from props (react-dom-client updateForwardRef); a plain component receives it in props, so a
      // props spread such as <input {...props} /> now forwards the caller's ref.
      // forwardRef((props: P) => ...) infers T as unknown, so its callers may pass any ref.
      // Ref<unknown> is not assignable to a DOM element's ref, so a props spread would stop compiling.
      // Any JSX spread counts: the props may reach it under another name.
      if (
        typeArgRef === undefined &&
        tsTypeOf(propsAnnotation) !== undefined &&
        j(renderFn).find(j.JSXSpreadAttribute).size() > 0
      ) {
        manual(
          'forwardRef render function has a JSX spread and no ref type argument: unwrap by hand',
        );
        continue;
      }
      const singleRef =
        typeArgRef ?? (tsTypeOf(propsAnnotation) !== undefined ? j.tsUnknownKeyword() : undefined);
      if (singleRef !== undefined) {
        const member = j.tsTypeLiteral([
          Object.assign(
            j.tsPropertySignature(
              j.identifier('ref'),
              j.tsTypeAnnotation(
                j.tsTypeReference(refTypeName(), j.tsTypeParameterInstantiation([singleRef])),
              ),
            ),
            { optional: true },
          ),
        ]);
        target.typeAnnotation = j.tsTypeAnnotation(
          propsType !== undefined
            ? j.tsIntersectionType([intersectable(j, propsType), member])
            : member,
        );
      } else if (propsAnnotation == null && typeArgProps !== undefined) {
        target.typeAnnotation = j.tsTypeAnnotation(typeArgProps);
      }
      unwrapCall(path, renderFn);
      hasChanges = true;
      continue;
    }

    if (refParam.type !== 'Identifier') {
      manual('forwardRef ref parameter is not a plain identifier: unwrap by hand');
      continue;
    }
    // The ref's type: the ref parameter's own annotation, else the first type argument as Ref<T>.
    const refAnnotation = refParam.typeAnnotation;
    let refType: Kind | undefined;
    const annotatedRef = tsTypeOf(refAnnotation);
    if (annotatedRef !== undefined) {
      refType = annotatedRef;
    } else if (typeArgRef !== undefined) {
      refType = j.tsTypeReference(refTypeName(), j.tsTypeParameterInstantiation([typeArgRef]));
    }

    // Props annotated but the ref untyped: forwardRef's own inference is ForwardedRef<unknown>.
    if (refType === undefined && propsType !== undefined) {
      refType = j.tsTypeReference(
        refTypeName(),
        j.tsTypeParameterInstantiation([j.tsUnknownKeyword()]),
      );
    }

    let annotation: Kind | undefined;
    if (refType !== undefined) {
      const refMember = j.tsTypeLiteral([
        Object.assign(j.tsPropertySignature(j.identifier('ref'), j.tsTypeAnnotation(refType)), {
          optional: true,
        }),
      ]);
      if (propsType !== undefined) {
        annotation = j.tsIntersectionType([intersectable(j, propsType), refMember]);
      } else if (typeArgs.length > 0) {
        // forwardRef<T>(...) — the props type defaults to {}.
        annotation = refMember;
      } else {
        manual('forwardRef ref is annotated but the props type is unknown: unwrap by hand');
        continue;
      }
    } else if (propsType !== undefined) {
      annotation = propsType;
    }

    const refProperty = j.objectProperty(j.identifier('ref'), j.identifier(refParam.name));
    refProperty.shorthand = refParam.name === 'ref';

    let pattern: Identifier | ReturnType<typeof j.objectPattern>;
    if (target.type === 'ObjectPattern') {
      target.properties.unshift(refProperty);
      pattern = target;
    } else {
      pattern = j.objectPattern.from({
        properties: [refProperty, j.restElement(j.identifier(target.name))],
      });
    }
    if (annotation !== undefined) {
      pattern.typeAnnotation = j.tsTypeAnnotation(annotation);
    } else if (target.type === 'Identifier' && target.typeAnnotation) {
      pattern.typeAnnotation = target.typeAnnotation;
    }

    if (propsParam.type === 'AssignmentPattern') {
      propsParam.left = pattern;
    } else {
      renderFn.params[0] = pattern;
    }
    renderFn.params = [renderFn.params[0] as Param & (typeof renderFn.params)[0]];
    unwrapCall(path, renderFn);
    hasChanges = true;
  }

  if (!hasChanges) {
    return fileInfo.source;
  }

  // Remove the forwardRef specifiers nothing refers to; drop a declaration that ends up empty.
  reactImports.forEach((declaration) => {
    const specifiers = declaration.node.specifiers ?? [];
    const before = specifiers.length;
    const kept = specifiers.filter((specifier) => {
      if (specifier.type !== 'ImportSpecifier' || specifier.imported.name !== 'forwardRef') {
        return true;
      }
      const local = (specifier.local ?? specifier.imported).name as string;
      return isReferenced(j, root, programScope, local);
    });
    if (kept.length === before) return;
    if (kept.length === 0) {
      // Comments on the removed import (a license header, a directive) move to the next statement.
      const comments = declaration.node.comments;
      const siblings = declaration.parent.node.body as { comments?: typeof comments }[];
      const next = siblings[siblings.indexOf(declaration.node) + 1];
      if (comments && next) next.comments = [...comments, ...(next.comments ?? [])];
      j(declaration).remove();
    } else {
      declaration.node.specifiers = kept;
    }
  });

  return root.toSource(printOptions(fileInfo.source));
}

/** Replace the forwardRef call with its render function, keeping the call's own comments. */
function unwrapCall(
  path: ASTPath<CallExpression>,
  renderFn: ArrowFunctionExpression | FunctionExpression,
): void {
  const comments = path.node.comments;
  if (comments) renderFn.comments = [...comments, ...(renderFn.comments ?? [])];
  path.replace(renderFn);
}

/** Flow type arguments (a .js file with Flow) are not TypeScript types and are never used. */
const isTsType = (type: unknown): type is Kind => jscodeshift.TSType.check(type);

/** The TypeScript type inside a `: T` annotation, if the annotation is one. */
function tsTypeOf(
  annotation: { type: string; typeAnnotation?: unknown } | null | undefined,
): Kind | undefined {
  return annotation?.type === 'TSTypeAnnotation' && isTsType(annotation.typeAnnotation)
    ? annotation.typeAnnotation
    : undefined;
}

/** A type that binds looser than `&` gets parentheses before it joins an intersection. */
function intersectable(j: API['jscodeshift'], type: Kind): Kind {
  switch (type.type) {
    case 'TSUnionType':
    case 'TSFunctionType':
    case 'TSConstructorType':
    case 'TSConditionalType':
      return j.tsParenthesizedType(type);
    default:
      return type;
  }
}

/** Whether an Identifier named `name` is a reference outside any import specifier. */
function isReferenced(
  j: API['jscodeshift'],
  root: ReturnType<API['jscodeshift']>,
  programScope: unknown,
  name: string,
): boolean {
  return (
    root
      .find(j.Identifier, { name })
      .filter((path) => {
        if (path.scope.lookup(name) !== programScope) return false;
        const parent = path.parent.node;
        if (
          parent.type === 'ImportSpecifier' ||
          parent.type === 'ImportDefaultSpecifier' ||
          parent.type === 'ImportNamespaceSpecifier'
        ) {
          return false;
        }
        if (
          (parent.type === 'MemberExpression' || parent.type === 'OptionalMemberExpression') &&
          parent.property === path.node &&
          !parent.computed
        ) {
          return false;
        }
        if (
          (parent.type === 'ObjectProperty' || parent.type === 'Property') &&
          parent.key === path.node &&
          !parent.computed &&
          !parent.shorthand
        ) {
          return false;
        }
        return true;
      })
      .size() > 0
  );
}

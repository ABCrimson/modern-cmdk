// @crimson_dev/command-codemod — Transform: forward-ref
// Removes React.forwardRef() wrappers and adds `ref` as a regular prop.
// React 19 no longer needs forwardRef — ref is a normal prop.
//
// Before:
//   const MyComponent = React.forwardRef<HTMLDivElement, Props>((props, ref) => {
//     return <Command.Root ref={ref} {...props} />;
//   });
//
// After:
//   const MyComponent = ({ ref, ...props }: Props & { ref?: React.Ref<HTMLDivElement> }) => {
//     return <Command.Root ref={ref} {...props} />;
//   };

import type { API, FileInfo } from 'jscodeshift';

/**
 * jscodeshift transform — removes forwardRef wrappers and merges the
 * ref parameter into the props object as a regular prop.
 */
export default function transform(fileInfo: FileInfo, api: API): string {
  // Quick bail — skip files that don't use forwardRef
  if (!fileInfo.source.includes('forwardRef')) {
    return fileInfo.source;
  }

  const j = api.jscodeshift;
  const root = j(fileInfo.source);
  let hasChanges = false;

  // Find all forwardRef(...) call expressions
  root
    .find(j.CallExpression)
    .filter((path) => {
      const callee = path.node.callee;

      // React.forwardRef(...)
      if (
        callee.type === 'MemberExpression' &&
        callee.object.type === 'Identifier' &&
        callee.object.name === 'React' &&
        callee.property.type === 'Identifier' &&
        callee.property.name === 'forwardRef'
      ) {
        return true;
      }

      // forwardRef(...)
      if (callee.type === 'Identifier' && callee.name === 'forwardRef') {
        return true;
      }

      return false;
    })
    .forEach((path) => {
      const args = path.node.arguments;
      if (args.length === 0) return;

      const renderFn = args[0];
      if (!renderFn) return;

      // Only handle arrow functions and function expressions
      if (renderFn.type !== 'ArrowFunctionExpression' && renderFn.type !== 'FunctionExpression') {
        return;
      }

      const params = renderFn.params;
      if (params.length < 2) return;

      const propsParam = params[0];
      const refParam = params[1];
      if (!propsParam || !refParam) return;

      // Determine ref parameter name
      const refName = refParam.type === 'Identifier' ? refParam.name : 'ref';

      // Build a shorthand property for ref
      const refProperty = j.objectProperty(j.identifier(refName), j.identifier(refName));
      refProperty.shorthand = true;

      if (propsParam.type === 'ObjectPattern') {
        // Props already destructured: ({ foo, bar }, ref) => ...
        // Prepend ref into the destructured object
        propsParam.properties.unshift(refProperty);
      } else if (propsParam.type === 'Identifier') {
        // Props as single identifier: (props, ref) => ...
        // Convert to: ({ ref, ...props }) => ...
        const restElement = j.restElement(j.identifier(propsParam.name));
        const newParam = j.objectPattern([refProperty, restElement]);

        // Preserve type annotation if present
        if ('typeAnnotation' in propsParam && propsParam.typeAnnotation) {
          (newParam as Record<string, unknown>).typeAnnotation = propsParam.typeAnnotation;
        }

        renderFn.params[0] = newParam;
      }

      // Remove the ref parameter — now merged into props
      renderFn.params = [renderFn.params[0] as (typeof renderFn.params)[0]];

      // Replace the forwardRef(...) call with the unwrapped render function
      j(path).replaceWith(renderFn);
      hasChanges = true;
    });

  // Clean up unused forwardRef imports
  if (hasChanges) {
    const forwardRefUsages = root
      .find(j.Identifier, { name: 'forwardRef' })
      .filter((path) => path.parent.node.type !== 'ImportSpecifier');

    if (forwardRefUsages.length === 0) {
      root
        .find(j.ImportSpecifier, {
          imported: { name: 'forwardRef' },
        })
        .forEach((path) => {
          const importDecl = path.parent.node;
          if (importDecl.specifiers && importDecl.specifiers.length === 1) {
            // Only specifier — remove the entire import declaration
            j(path.parent).remove();
          } else {
            // Multiple specifiers — remove just this one
            j(path).remove();
          }
        });
    }
  }

  return hasChanges ? root.toSource() : fileInfo.source;
}

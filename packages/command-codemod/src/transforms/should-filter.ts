// @crimson_dev/command-codemod — Transform: should-filter
// Renames the `shouldFilter` JSX prop to `filter` on Command components.
//   shouldFilter={false}  ->  filter={false}
//   shouldFilter={true}   ->  (removed — filter is true by default)
//   shouldFilter          ->  (removed — bare attr is truthy, which is the default)

import type { API, FileInfo } from 'jscodeshift';

/**
 * jscodeshift transform — migrates shouldFilter prop to filter.
 */
export default function transform(fileInfo: FileInfo, api: API): string {
  // Quick bail — skip files without shouldFilter
  if (!fileInfo.source.includes('shouldFilter')) {
    return fileInfo.source;
  }

  const j = api.jscodeshift;
  const root = j(fileInfo.source);
  let hasChanges = false;

  // Find all JSX attributes named "shouldFilter"
  root
    .find(j.JSXAttribute, {
      name: { name: 'shouldFilter' },
    })
    .forEach((path) => {
      const value = path.node.value;

      // Determine if the value is explicitly `true`
      const isTrueValue =
        // shouldFilter={true}
        (value &&
          value.type === 'JSXExpressionContainer' &&
          value.expression.type === 'BooleanLiteral' &&
          value.expression.value === true) ||
        // shouldFilter (bare attribute — implicitly true)
        value === null;

      if (isTrueValue) {
        // Remove the attribute entirely — filter defaults to true
        j(path).remove();
      } else {
        // Rename shouldFilter to filter (e.g. shouldFilter={false})
        path.node.name = j.jsxIdentifier('filter');
      }

      hasChanges = true;
    });

  return hasChanges ? root.toSource() : fileInfo.source;
}

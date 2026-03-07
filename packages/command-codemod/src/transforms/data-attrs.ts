// @crimson_dev/command-codemod — Transform: data-attrs
// Renames cmdk data attributes to data-command-* equivalents.
// Handles JSX attributes, CSS selectors in string/template literals,
// and querySelector-style calls.

import type { API, FileInfo } from 'jscodeshift';

/** Mapping from old bare attribute names to new data-attribute names */
const ATTR_MAP = new Map<string, string>([
  ['cmdk-root', 'data-command'],
  ['cmdk-input', 'data-command-input'],
  ['cmdk-list', 'data-command-list'],
  ['cmdk-item', 'data-command-item'],
  ['cmdk-group', 'data-command-group'],
  ['cmdk-separator', 'data-command-separator'],
  ['cmdk-empty', 'data-command-empty'],
  ['cmdk-loading', 'data-command-loading'],
]);

/** CSS custom property renames */
const CSS_VAR_MAP = new Map<string, string>([['--cmdk-list-height', '--command-list-height']]);

/**
 * Replace all cmdk attribute selectors (bracketed) and CSS vars in a string.
 */
function replaceInString(input: string): string {
  let result = input;

  for (const [oldAttr, newAttr] of ATTR_MAP) {
    // Replace bracketed selectors: [cmdk-root] -> [data-command]
    result = result.replaceAll(`[${oldAttr}]`, `[${newAttr}]`);
  }

  for (const [oldVar, newVar] of CSS_VAR_MAP) {
    result = result.replaceAll(oldVar, newVar);
  }

  return result;
}

/**
 * jscodeshift transform — renames cmdk data attributes in JSX and
 * CSS selectors within string/template literals.
 */
export default function transform(fileInfo: FileInfo, api: API): string {
  // Quick bail — skip files with no cmdk references at all
  if (!fileInfo.source.includes('cmdk')) {
    return fileInfo.source;
  }

  const j = api.jscodeshift;
  const root = j(fileInfo.source);
  let hasChanges = false;

  // 1. Rename JSX attributes: <div cmdk-root="" /> -> <div data-command="" />
  for (const [oldAttr, newAttr] of ATTR_MAP) {
    root
      .find(j.JSXAttribute, {
        name: { name: oldAttr },
      })
      .forEach((path) => {
        path.node.name = j.jsxIdentifier(newAttr);
        hasChanges = true;
      });
  }

  // 2. Replace in string literals (e.g. querySelector('[cmdk-item]'))
  root.find(j.StringLiteral).forEach((path) => {
    const original = path.node.value;
    const replaced = replaceInString(original);
    if (replaced !== original) {
      path.node.value = replaced;
      hasChanges = true;
    }
  });

  // 3. Replace in template literals
  root.find(j.TemplateLiteral).forEach((path) => {
    for (const quasi of path.node.quasis) {
      const original = quasi.value.raw;
      const replaced = replaceInString(original);
      if (replaced !== original) {
        quasi.value.raw = replaced;
        quasi.value.cooked = replaced;
        hasChanges = true;
      }
    }
  });

  return hasChanges ? root.toSource() : fileInfo.source;
}

// @crimson_dev/command-codemod — Transform: import-rewrite
// Rewrites imports from 'cmdk' to '@crimson_dev/command-react'.
// Handles named imports, default imports, dynamic imports, require(), and re-exports.

import type { API, FileInfo } from 'jscodeshift';

const OLD_PACKAGE = 'cmdk';
const NEW_PACKAGE = '@crimson_dev/command-react';

/**
 * jscodeshift transform — rewrites all import/require/re-export paths
 * from `cmdk` to `@crimson_dev/command-react`.
 */
export default function transform(fileInfo: FileInfo, api: API): string {
  const j = api.jscodeshift;
  const root = j(fileInfo.source);
  let hasChanges = false;

  // Rewrite import declarations:
  //   import { Command } from 'cmdk'
  //   import Command from 'cmdk'
  //   import * as Cmdk from 'cmdk'
  root
    .find(j.ImportDeclaration, {
      source: { value: OLD_PACKAGE },
    })
    .forEach((path) => {
      path.node.source.value = NEW_PACKAGE;
      hasChanges = true;
    });

  // Rewrite re-exports:
  //   export { Command } from 'cmdk'
  //   export * from 'cmdk'
  root
    .find(j.ExportNamedDeclaration, {
      source: { value: OLD_PACKAGE },
    })
    .forEach((path) => {
      if (path.node.source) {
        path.node.source.value = NEW_PACKAGE;
        hasChanges = true;
      }
    });

  root
    .find(j.ExportAllDeclaration, {
      source: { value: OLD_PACKAGE },
    })
    .forEach((path) => {
      path.node.source.value = NEW_PACKAGE;
      hasChanges = true;
    });

  // Rewrite dynamic imports: import('cmdk')
  root
    .find(j.CallExpression, {
      callee: { type: 'Import' },
    })
    .forEach((path) => {
      const arg = path.node.arguments[0];
      if (arg && arg.type === 'StringLiteral' && arg.value === OLD_PACKAGE) {
        arg.value = NEW_PACKAGE;
        hasChanges = true;
      }
    });

  // Rewrite require('cmdk')
  root
    .find(j.CallExpression, {
      callee: { name: 'require' },
    })
    .forEach((path) => {
      const arg = path.node.arguments[0];
      if (arg && arg.type === 'StringLiteral' && arg.value === OLD_PACKAGE) {
        arg.value = NEW_PACKAGE;
        hasChanges = true;
      }
    });

  return hasChanges ? root.toSource() : fileInfo.source;
}

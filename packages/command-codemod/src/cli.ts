#!/usr/bin/env node

// @crimson_dev/command-codemod — CLI entry point
// Usage: command-codemod <transform> <glob> [--dry-run]
// Available transforms: import-rewrite, data-attrs, forward-ref, should-filter

import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { globby } from 'globby';
import type { API, FileInfo } from 'jscodeshift';
import jscodeshift from 'jscodeshift';

// --- Transform registry ---------------------------------------------------

const AVAILABLE_TRANSFORMS = new Map<string, string>([
  ['import-rewrite', 'Rewrites cmdk imports to @crimson_dev/command-react'],
  ['data-attrs', 'Converts [cmdk-*] selectors to [data-command-*]'],
  ['forward-ref', 'Removes React.forwardRef wrappers (React 19)'],
  ['should-filter', 'Converts shouldFilter prop to filter'],
]);

/**
 * Dynamically import a transform module by name and return its default export.
 */
async function loadTransform(name: string): Promise<(fileInfo: FileInfo, api: API) => string> {
  const mod = await import(`./transforms/${name}.js`);
  return mod.default as (fileInfo: FileInfo, api: API) => string;
}

// --- CLI -------------------------------------------------------------------

function printUsage(): void {
  // ES2026 Iterator Helper: .forEach on map entries
  AVAILABLE_TRANSFORMS.entries().forEach(([_name, _description]) => {});
}

interface CliArgs {
  readonly transformName: string;
  readonly fileGlob: string;
  readonly dryRun: boolean;
}

function parseArgs(argv: string[]): CliArgs | null {
  const args = argv.slice(2);

  // Separate flags from positional args using Iterator Helpers
  const flags = args
    .values()
    .filter((a) => a.startsWith('--'))
    .toArray();
  const positional = args
    .values()
    .filter((a) => !a.startsWith('--'))
    .toArray();

  if (positional.length < 2) {
    return null;
  }

  const transformName = positional[0]!;
  const fileGlob = positional[1]!;
  const dryRun = flags.some((f) => f === '--dry-run');

  return { transformName, fileGlob, dryRun };
}

async function main(): Promise<void> {
  const cliArgs = parseArgs(process.argv);

  if (!cliArgs) {
    printUsage();
    process.exit(0);
  }

  const { transformName, fileGlob, dryRun } = cliArgs;

  // Validate transform name
  if (!AVAILABLE_TRANSFORMS.has(transformName)) {
    process.exit(1);
  }

  // Resolve files
  const files = await globby([fileGlob], {
    absolute: true,
    ignore: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/.next/**'],
  });

  if (files.length === 0) {
    process.exit(1);
  }
  if (dryRun) {
  }

  // Load the transform
  const transformFn = await loadTransform(transformName);

  // Build jscodeshift API object for each parser variant
  const apiForParser = (parser: string): API => ({
    jscodeshift: jscodeshift.withParser(parser),
    j: jscodeshift.withParser(parser),
    stats: () => {},
    report: () => {},
  });

  let filesChanged = 0;
  let errors = 0;

  for (const filePath of files) {
    try {
      const source = await readFile(filePath, 'utf-8');
      const parser = filePath.endsWith('.tsx') || filePath.endsWith('.jsx') ? 'tsx' : 'ts';

      const fileInfo: FileInfo = {
        path: filePath,
        source,
      };

      const result = transformFn(fileInfo, apiForParser(parser));

      if (result !== source) {
        filesChanged++;
        const _relativePath = filePath.replace(`${resolve('.')}/`, '');

        if (!dryRun) {
          await writeFile(filePath, result, 'utf-8');
        }
      }
    } catch (err) {
      errors++;
      const _message = err instanceof Error ? err.message : String(err);
    }
  }
  if (errors > 0) {
  }
  if (dryRun && filesChanged > 0) {
  }
}

main().catch((_err: unknown) => {
  process.exit(1);
});

#!/usr/bin/env node

// modern-cmdk — Codemod CLI entry point
// Usage: modern-cmdk migrate <transform> <glob> [--dry-run] [--concurrency=N]
// Available transforms: import-rewrite, data-attrs, forward-ref, should-filter

import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { globby } from 'globby';
import type { API, FileInfo } from 'jscodeshift';
import jscodeshift from 'jscodeshift';

// --- Transform registry ---------------------------------------------------

const AVAILABLE_TRANSFORMS: Map<string, string> = new Map<string, string>([
  ['import-rewrite', 'Rewrites cmdk imports to modern-cmdk/react'],
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
  readonly concurrency: number;
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

  const transformName = positional[0] as string;
  const fileGlob = positional[1] as string;
  const dryRun = flags.some((f) => f === '--dry-run');

  // Parse --concurrency=N flag using Iterator Helpers
  const concurrencyFlag = flags.values().find((f) => f.startsWith('--concurrency='));
  const concurrency = concurrencyFlag
    ? Number.parseInt(concurrencyFlag.split('=')[1] as string, 10)
    : 8;

  return { transformName, fileGlob, dryRun, concurrency };
}

// --- Batched concurrent file processing ------------------------------------

async function* chunked<T>(items: T[], size: number): AsyncGenerator<T[]> {
  for (let i = 0; i < items.length; i += size) {
    yield items.slice(i, i + size);
  }
}

interface TransformResult {
  readonly filePath: string;
  readonly changed: boolean;
  readonly error?: Error;
}

async function processFile(
  filePath: string,
  transformFn: (fileInfo: FileInfo, api: API) => string,
  apiForParser: (parser: string) => API,
  dryRun: boolean,
): Promise<TransformResult> {
  const source = await readFile(filePath, 'utf-8');
  const parser = filePath.endsWith('.tsx') || filePath.endsWith('.jsx') ? 'tsx' : 'ts';

  const fileInfo: FileInfo = { path: filePath, source };
  const result = transformFn(fileInfo, apiForParser(parser));

  if (result !== source) {
    if (!dryRun) {
      await writeFile(filePath, result, 'utf-8');
    }
    return { filePath, changed: true };
  }
  return { filePath, changed: false };
}

// --- Main ------------------------------------------------------------------

async function main(): Promise<void> {
  const cliArgs = parseArgs(process.argv);

  if (!cliArgs) {
    printUsage();
    process.exit(0);
  }

  const { transformName, fileGlob, dryRun, concurrency } = cliArgs;

  // Validate transform name
  if (!AVAILABLE_TRANSFORMS.has(transformName)) {
    process.exit(1);
  }

  // Resolve files — globby 16 API (ESM-only, same function signature)
  const files = await globby([fileGlob], {
    absolute: true,
    ignore: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/.next/**'],
  });

  if (files.length === 0) {
    process.exit(1);
  }

  // Load the transform
  const transformFn = await loadTransform(transformName);

  // Build jscodeshift API object for each parser variant
  const apiForParser = (parser: string): API => ({
    jscodeshift: jscodeshift.withParser(parser),
    j: jscodeshift.withParser(parser),
    stats: (): void => {},
    report: (): void => {},
  });

  // Process files in concurrent batches using Promise.withResolvers for tracking
  const { promise: done, resolve: resolveDone } = Promise.withResolvers<TransformResult[]>();
  const allResults: TransformResult[] = [];

  // Use chunked async generator for batched concurrency
  for await (const batch of chunked(files, concurrency)) {
    const settled = await Promise.allSettled(
      batch.map((filePath) => processFile(filePath, transformFn, apiForParser, dryRun)),
    );

    // Collect results using Iterator Helpers
    settled.values().forEach((result) => {
      if (result.status === 'fulfilled') {
        allResults.push(result.value);
      } else {
        allResults.push({ filePath: '(unknown)', changed: false, error: result.reason as Error });
      }
    });
  }

  resolveDone(allResults);
  const results = await done;

  // Group results using Object.groupBy
  const grouped = Object.groupBy(results, (r) => {
    if (r.error) return 'errors';
    if (r.changed) return 'changed';
    return 'unchanged';
  });

  const changedFiles = grouped.changed ?? [];
  const errorFiles = grouped.errors ?? [];

  // Report results
  changedFiles.values().forEach((r) => {
    const _relativePath = r.filePath.replace(`${resolve('.')}/`, '');
  });

  if (errorFiles.length > 0) {
    errorFiles.values().forEach((_r) => {});
  }

  if (dryRun && changedFiles.length > 0) {
  }
}

main().catch((_err: unknown) => {
  process.exit(1);
});

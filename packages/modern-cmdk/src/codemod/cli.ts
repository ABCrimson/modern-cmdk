#!/usr/bin/env node

// modern-cmdk — Codemod CLI entry point
// Usage: modern-cmdk <transform> <glob> [--dry-run] [--strict] [--concurrency=N]
//        modern-cmdk --help
//   e.g. npx modern-cmdk import-rewrite "./src/**/*.tsx"
// Available transforms: import-rewrite, data-attrs, forward-ref, should-filter
//
// Exit codes. Without --strict (the 1.x defaults): 0 for --help, missing arguments and per-file
// errors; 1 for an unknown transform, no matching files and an uncaught error. An unknown option
// is ignored with a warning on stderr when both positionals are present (the run carries on as in
// 1.2.2); without them it is a usage error that exits 0. A malformed known option (a flag given a
// value, --concurrency with no value or a dash-led space-form value) is a usage error that exits 0
// and writes nothing, even beside an unknown option. With --strict: 2 for any usage error,
// including an unknown option, and 1 when any file errored.

import { readFile, writeFile } from 'node:fs/promises';
import { relative } from 'node:path';
import { parseArgs, styleText } from 'node:util';
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

type TransformFn = (fileInfo: FileInfo, api: API) => string;

/**
 * Dynamically import a transform module by name and return its default export.
 */
async function loadTransform(name: string): Promise<TransformFn> {
  // @vite-ignore: the bundled bin resolves this next to itself; Vite's dynamic-import-vars
  // rewrite would otherwise prepend a helper import above the shebang when tests load this file.
  const mod = await import(/* @vite-ignore */ `./transforms/${name}.mjs`);
  return mod.default as TransformFn;
}

// --- I/O -------------------------------------------------------------------

/** The two streams the CLI writes to; `process` satisfies this, tests pass collectors. */
export interface CliIo {
  readonly stdout: NodeJS.WritableStream;
  readonly stderr: NodeJS.WritableStream;
}

/** Test seam: replace how a transform is loaded (the bundled bin imports `./transforms/<name>.mjs`). */
export interface CliDeps {
  readonly loadTransform?: (name: string) => Promise<TransformFn>;
}

function usageText(stream: NodeJS.WritableStream): string {
  const bold = (s: string): string => styleText('bold', s, { stream });
  const opt = (s: string): string => styleText('cyan', s.padEnd(17), { stream });
  return [
    `${bold('Usage:')} modern-cmdk <transform> <glob> [options]`,
    '',
    bold('Transforms:'),
    ...AVAILABLE_TRANSFORMS.entries()
      .map(([name, description]) => `  ${opt(name)}${description}`)
      .toArray(),
    '',
    bold('Options:'),
    `  ${opt('--dry-run')}List the files that would change; write nothing`,
    `  ${opt('--strict')}Exit 2 on usage errors (incl. unknown options), 1 on file errors`,
    `  ${opt('--concurrency=N')}Files processed at once (default 8)`,
    `  ${opt('-h, --help')}Show this help`,
    '',
  ].join('\n');
}

// --- Argument parsing ------------------------------------------------------

type Parsed =
  | { readonly kind: 'help' }
  | {
      readonly kind: 'usage-error';
      /** `undefined` for missing arguments: usage alone, no error line. */
      readonly message: string | undefined;
      readonly strict: boolean;
    }
  | {
      readonly kind: 'run';
      readonly transformName: string;
      readonly fileGlob: string;
      readonly dryRun: boolean;
      readonly strict: boolean;
      readonly concurrency: number;
      /** Unknown options that were ignored (never with --strict); run() warns about each. */
      readonly ignored: readonly string[];
    };

const OPTIONS = {
  help: { type: 'boolean', short: 'h' },
  strict: { type: 'boolean' },
  'dry-run': { type: 'boolean' },
  concurrency: { type: 'string' },
} as const;

function parse(argv: readonly string[]): Parsed {
  let values: CliValues;
  let positionals: string[];
  let ignored: string[] = [];
  try {
    ({ values, positionals } = parseCli(argv));
  } catch (err) {
    // A parse failure yields no values, so look at argv for --strict.
    const strictArg = argv.includes('--strict');
    if ((err as NodeJS.ErrnoException).code !== 'ERR_PARSE_ARGS_UNKNOWN_OPTION') {
      return {
        kind: 'usage-error',
        message: err instanceof Error ? err.message : String(err),
        strict: strictArg,
      };
    }
    // Re-parse loosely: unknown options become option tokens, everything else parses as before.
    const loose = parseArgs({
      args: [...argv],
      options: OPTIONS,
      allowPositionals: true,
      strict: false,
      tokens: true,
    });
    ignored = loose.tokens
      .filter((t) => t.kind === 'option' && !Object.hasOwn(OPTIONS, t.name))
      .map((t) => (t as { rawName: string }).rawName);
    const badValue = loose.tokens.find(
      (t) =>
        t.kind === 'option' &&
        Object.hasOwn(OPTIONS, t.name) &&
        (OPTIONS[t.name as keyof typeof OPTIONS].type === 'boolean'
          ? t.value !== undefined
          : t.value === undefined ||
            (!t.inlineValue && t.value.length > 1 && t.value.startsWith('-'))),
    );
    const badMessage =
      badValue?.kind === 'option'
        ? badValue.value === undefined
          ? `Option '${badValue.rawName} <value>' argument missing`
          : OPTIONS[badValue.name as keyof typeof OPTIONS].type === 'boolean'
            ? `Option '${badValue.rawName}' does not take an argument`
            : `Option '${badValue.rawName}' argument is ambiguous.\nDid you forget to specify the option argument for '${badValue.rawName}'?\nTo specify an option argument starting with a dash use '${badValue.rawName}=-XYZ'.`
        : undefined;
    if (badMessage !== undefined) {
      return { kind: 'usage-error', message: badMessage, strict: strictArg };
    }
    if (strictArg || loose.values.help === true || loose.positionals.length < 2) {
      return { kind: 'usage-error', message: `unknown option ${ignored[0]}`, strict: strictArg };
    }
    values = loose.values;
    positionals = loose.positionals;
  }

  const strict = values.strict === true;
  if (values.help) return { kind: 'help' };
  if (positionals.length < 2) {
    return { kind: 'usage-error', message: undefined, strict };
  }

  let concurrency = 8;
  if (values.concurrency !== undefined) {
    if (typeof values.concurrency !== 'string' || !/^[1-9]\d*$/.test(values.concurrency)) {
      return {
        kind: 'usage-error',
        message: `--concurrency must be a positive integer, got "${String(values.concurrency)}"`,
        strict,
      };
    }
    concurrency = Number.parseInt(values.concurrency, 10);
  }

  return {
    kind: 'run',
    transformName: positionals[0] as string,
    fileGlob: positionals[1] as string,
    dryRun: values['dry-run'] === true,
    strict,
    concurrency,
    ignored,
  };
}

interface CliValues {
  readonly help?: string | boolean | undefined;
  readonly strict?: string | boolean | undefined;
  readonly 'dry-run'?: string | boolean | undefined;
  readonly concurrency?: string | boolean | undefined;
}

function parseCli(argv: readonly string[]): {
  readonly values: CliValues;
  readonly positionals: string[];
} {
  return parseArgs({ args: [...argv], options: OPTIONS, allowPositionals: true, strict: true });
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
  transformFn: TransformFn,
  apiForParser: (parser: string) => API,
  dryRun: boolean,
): Promise<TransformResult> {
  try {
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
  } catch (err) {
    return {
      filePath,
      changed: false,
      error: err instanceof Error ? err : new Error(String(err)),
    };
  }
}

// --- Main ------------------------------------------------------------------

/**
 * Run the codemod CLI. Resolves to the process exit code; writes only to `io`.
 */
export async function run(argv: readonly string[], io: CliIo, deps: CliDeps = {}): Promise<number> {
  const out = (s: string): void => void io.stdout.write(`${s}\n`);
  const err = (s: string): void => void io.stderr.write(`${s}\n`);
  const fail = (s: string): void =>
    err(`${styleText('red', 'error:', { stream: io.stderr })} ${s}`);

  try {
    const parsed = parse(argv);

    if (parsed.kind === 'help') {
      out(usageText(io.stdout));
      return 0;
    }
    if (parsed.kind === 'usage-error') {
      // Missing arguments (and an unknown option without both positionals) keep exiting 0 in
      // 1.x; --strict makes them 2.
      if (parsed.message !== undefined) fail(parsed.message);
      err(usageText(io.stderr));
      return parsed.strict ? 2 : 0;
    }

    const { transformName, fileGlob, dryRun, strict, concurrency, ignored } = parsed;
    for (const name of ignored) {
      err(`warning: unknown option ${name} ignored (--strict makes this exit 2)`);
    }

    if (!AVAILABLE_TRANSFORMS.has(transformName)) {
      fail(
        `unknown transform "${transformName}". Valid transforms: ${[...AVAILABLE_TRANSFORMS.keys()].join(', ')}`,
      );
      return strict ? 2 : 1;
    }

    // Resolve files — globby 16 API (ESM-only, same function signature)
    const files = await globby([fileGlob], {
      absolute: true,
      ignore: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/.next/**'],
    });

    if (files.length === 0) {
      fail(`no files matched "${fileGlob}"`);
      return 1;
    }

    const transformFn = await (deps.loadTransform ?? loadTransform)(transformName);

    // Build jscodeshift API object for each parser variant
    const apiForParser = (parser: string): API => ({
      jscodeshift: jscodeshift.withParser(parser),
      j: jscodeshift.withParser(parser),
      stats: (): void => {},
      report: (): void => {},
    });

    const results: TransformResult[] = [];
    for await (const batch of chunked(files, concurrency)) {
      results.push(
        ...(await Promise.all(
          batch.map((filePath) => processFile(filePath, transformFn, apiForParser, dryRun)),
        )),
      );
    }

    const rel = (p: string): string => relative(process.cwd(), p).replaceAll('\\', '/');
    let changed = 0;
    let errors = 0;
    for (const r of results) {
      if (r.error) {
        errors++;
        err(`${rel(r.filePath)}: ${r.error.message}`);
      } else if (r.changed) {
        changed++;
        const verb = styleText('green', dryRun ? 'would change' : 'changed', {
          stream: io.stdout,
        });
        out(`${verb} ${rel(r.filePath)}`);
      }
    }
    const unchanged = results.length - changed - errors;
    out(
      `${changed} changed, ${unchanged} unchanged, ${errors} errors${dryRun ? ' (dry run, nothing written)' : ''}`,
    );

    return strict && errors > 0 ? 1 : 0;
  } catch (e) {
    fail(e instanceof Error ? e.message : String(e));
    return 1;
  }
}

if (import.meta.main) {
  process.exitCode = await run(process.argv.slice(2), process);
}

#!/usr/bin/env node

/// <reference types="node" />
// The package tsconfig loads no @types implicitly; this types process and the NodeJS namespace below.
// modern-cmdk — the deprecated `modern-cmdk` bin, a shim over the bundled codemod (dist/codemod/cli.mjs).
//
// 1.5 splits the codemod into its own package, modern-cmdk-codemod (strict by default). This bin stays in the
// modern-cmdk tarball until 2.0 so `npx modern-cmdk <transform> <glob>` keeps working, and it keeps the 1.x
// exit codes: it runs the bundled CLI lenient unless argv carries --strict. It writes one deprecation line to
// stderr, never touches the network, and starts no other process; the bundled cli.mjs next to it (built from the
// modern-cmdk-codemod source by tsdown.config.ts) does the work, so modern-cmdk has no runtime dependency on
// the new package.

/** The part of the bundled cli.mjs `run` this shim calls: the CLI's own `run`, which the codemod-shim test pins to it. */
export type Run = (
  argv: readonly string[],
  io: { readonly stdout: NodeJS.WritableStream; readonly stderr: NodeJS.WritableStream },
  deps?: { readonly program?: 'modern-cmdk' | 'modern-cmdk-codemod' },
) => Promise<number>;

/** The one line this bin writes to stderr before it runs. */
export const DEPRECATION_WARNING =
  'warning: the modern-cmdk bin is deprecated; use npx modern-cmdk-codemod (strict by default). This bin runs the bundled codemod with the 1.x lenient exit codes unless --strict is given.';

/** The argv handed to the bundled CLI: --lenient is put first unless the caller gave --strict (the two flags exclude each other). */
export function shimArgv(argv: readonly string[]): readonly string[] {
  return argv.includes('--strict') ? argv : ['--lenient', ...argv];
}

// Vite's client transform (the unit tests' happy-dom project) wraps a dynamic import whose argument does not read as a string or template
// literal ending in a script extension in a helper call and prepends the helper's import above the shebang, which is a syntax error. The
// template literal (this directory's URL, then cli.mjs: the URL of ./cli.mjs) keeps this file loadable by tests; the @vite-ignore comment (inside the import() call) silences Vite's 'cannot be analyzed' warning.
if (import.meta.main) {
  process.stderr.write(`${DEPRECATION_WARNING}\n`);
  const { run } = (await import(
    `${/* @vite-ignore */ new URL('.', import.meta.url).href}cli.mjs`
  )) as {
    run: Run;
  };
  process.exitCode = await run(shimArgv(process.argv.slice(2)), process, {
    program: 'modern-cmdk',
  });
}

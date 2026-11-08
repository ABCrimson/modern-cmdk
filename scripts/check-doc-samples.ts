// scripts/check-doc-samples.ts
// TEB-84: type-checks every fenced ts, tsx and typescript sample of the docs and the six READMEs listed in DEFAULT_FILES
// against the built package, so a broken sample cannot ship. Runs with Node's native type stripping:
//
//   node scripts/check-doc-samples.ts [--root <dir>] [--out <dir>] [--skip-wasm]
//
// Roots (default): apps/docs/**/*.md (node_modules, .vitepress/cache and dist excluded), README.md,
// and the READMEs of packages/modern-cmdk, packages/modern-cmdk-codemod, packages/create-modern-cmdk,
// packages/vscode-modern-cmdk and packages/command-search-wasm. --root <dir> scans the
// *.md files under <dir> instead (the gate's own bite test points it at restored sample text).
//
// Each sample is written to node_modules/.cache/doc-samples/<slug>-L<line>.<ext> (or under --out <dir>, a
// directory that must lie under node_modules/.cache, any other path is a usage error (exit 2) because the
// directory is deleted first; so parallel runs do not share one directory; the slug is the page
// path without .md, '/' written as '__'; <line> is the first body line of the fence). A sample with no
// import or export gets `export {}` appended so it is a module. A tsconfig beside them extends
// tsconfig.base.json (jsx react-jsx, noEmit, skipLibCheck false) and maps modern-cmdk, modern-cmdk/react
// and modern-cmdk/react/dialog to packages/modern-cmdk/dist/*.d.mts (run `pnpm build` first), modern-cmdk-search-wasm
// to packages/command-search-wasm/dist/index.d.ts (the wasm package's build, which needs pkg/) and radix-ui to
// packages/modern-cmdk/node_modules/radix-ui. No module
// is stubbed; the one declaration file, `declare module '*.css'`, types the CSS side-effect import.
// The repo's own tsc (node_modules/typescript) checks the directory; every diagnostic is printed as
// page:line: message, then the sample and fragment counts.
//
// --skip-wasm leaves out every sample whose code imports 'modern-cmdk-search-wasm' (import, export-from
// or import() form), counts them and says so on the summary line. The flag exists because the CI build
// job's dist artifact has no wasm build (the wasm package's JS build skips itself without pkg/, which
// only the rust-wasm job produces): dist-tests runs with --skip-wasm and the Rust & WASM job runs the
// full gate. A checkout without the wasm build uses it locally.
//
// A fence whose info string has the word `fragment` is a deliberate excerpt that cannot stand alone and
// is skipped and counted. Exit codes: 0 = every sample type-checks, 1 = a diagnostic, no sample found or
// tsc failed to run, 2 = usage error.

import { spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { parseArgs } from 'node:util';

const ROOT: string = resolve(import.meta.dirname, '..');
const OUT_DIR: string = join(ROOT, 'node_modules/.cache/doc-samples');
const TSC: string = join(ROOT, 'node_modules/typescript/bin/tsc');
const SKIP_DIRS: ReadonlySet<string> = new Set(['node_modules', 'cache', 'dist', '.git']);
const LANGS: ReadonlySet<string> = new Set(['ts', 'tsx', 'typescript']);
// Exported: tests/unit/docs-async-fallbacks.test.ts imports this list for its fallback-shape scan (TEB-99).
export const DEFAULT_FILES: readonly string[] = [
  'README.md',
  'packages/modern-cmdk/README.md',
  'packages/modern-cmdk-codemod/README.md',
  'packages/create-modern-cmdk/README.md',
  'packages/vscode-modern-cmdk/README.md',
  'packages/command-search-wasm/README.md',
];

export interface Sample {
  readonly page: string;
  readonly line: number;
  readonly lang: string;
  readonly code: string;
}

export interface Extraction {
  readonly samples: Sample[];
  readonly fragments: number;
}

/**
 * Every fence whose info string starts with ts, tsx or typescript (an indented fence, as inside a
 * list or a `:::` container, counts), with the page and the line of its first body line. A fence
 * whose info string has the word `fragment` is skipped and counted.
 */
export function extractSamples(markdown: string, page: string): Extraction {
  const samples: Sample[] = [];
  let fragments = 0;
  const lines: string[] = markdown.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const open = /^(\s*)(`{3,}|~{3,})\s*(.*)$/.exec(lines[i] ?? '');
    if (!open) continue;
    const indent: string = open[1] ?? '';
    const fence: string = open[2] ?? '```';
    const info: string = (open[3] ?? '').trim();
    const body: string[] = [];
    let j: number = i + 1;
    for (; j < lines.length; j++) {
      const text: string = lines[j] ?? '';
      if (text.trim() === fence) break;
      body.push(text.startsWith(indent) ? text.slice(indent.length) : text);
    }
    const lang: string = /^[A-Za-z]+/.exec(info)?.[0] ?? '';
    if (LANGS.has(lang)) {
      if (/\bfragment\b/.test(info)) fragments++;
      else samples.push({ page, line: i + 2, lang, code: body.join('\n') });
    }
    i = j;
  }
  return { samples, fragments };
}

/** The generated file name for a sample: <slug>-L<line>.ts|tsx, the slug being the page path with '/' as '__'. */
export function sampleFileName(sample: Sample): string {
  const slug: string = sample.page.replace(/\.md$/, '').replaceAll('/', '__');
  return `${slug}-L${sample.line}.${sample.lang === 'tsx' ? 'tsx' : 'ts'}`;
}

/** Maps a line of a generated file back to `page:line` of the markdown page. */
export function mapDiagnostic(file: string, line: number): string {
  const match = /^(.*)-L(\d+)\.tsx?$/.exec(basename(file));
  if (!match) return `${file}:${line}`;
  return `${(match[1] ?? '').replaceAll('__', '/')}.md:${Number(match[2]) + line - 1}`;
}

/** True when the code imports 'modern-cmdk-search-wasm' (or a subpath) by import, export-from or import(). */
export function importsWasm(code: string): boolean {
  return /\b(?:from|import)\s*\(?\s*(['"])modern-cmdk-search-wasm(?:\/[^'"]*)?\1/.test(code);
}

function hasModuleSyntax(code: string): boolean {
  return /^\s*(import|export)\b/m.test(code);
}

function collectMarkdown(dir: string, into: string[]): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) collectMarkdown(join(dir, entry.name), into);
    } else if (entry.name.endsWith('.md')) {
      into.push(join(dir, entry.name));
    }
  }
}

function scanTargets(root: string | undefined): { dir: string; files: string[] } {
  const files: string[] = [];
  if (root === undefined) {
    collectMarkdown(join(ROOT, 'apps/docs'), files);
    for (const file of DEFAULT_FILES) files.push(join(ROOT, file));
    return { dir: ROOT, files };
  }
  const dir: string = resolve(root);
  collectMarkdown(dir, files);
  return { dir, files };
}

/** The samples' tsconfig: extends and paths are written relative to the directory it lands in. */
export function tsconfigFor(outDir: string): Record<string, unknown> {
  const up: string = relative(outDir, ROOT).split(sep).join('/');
  return {
    extends: `${up}/tsconfig.base.json`,
    compilerOptions: {
      jsx: 'react-jsx',
      noEmit: true,
      skipLibCheck: false,
      declaration: false,
      isolatedDeclarations: false,
      types: ['node'],
      paths: {
        'modern-cmdk': [`${up}/packages/modern-cmdk/dist/core/index.d.mts`],
        'modern-cmdk/react': [`${up}/packages/modern-cmdk/dist/react/index.d.mts`],
        'modern-cmdk/react/dialog': [`${up}/packages/modern-cmdk/dist/react/dialog.d.mts`],
        // the WASM engine's built types (packages/command-search-wasm/dist, produced by the rust-wasm job's build)
        'modern-cmdk-search-wasm': [`${up}/packages/command-search-wasm/dist/index.d.ts`],
        // radix-ui is a required peer (and devDependency) of modern-cmdk, installed under packages/modern-cmdk/node_modules, not at the repository root
        'radix-ui': [`${up}/packages/modern-cmdk/node_modules/radix-ui`],
      },
    },
    include: ['*.ts', '*.tsx'],
  };
}

function main(): number {
  const { values } = parseArgs({
    options: {
      root: { type: 'string' },
      out: { type: 'string' },
      'skip-wasm': { type: 'boolean', default: false },
    },
    strict: true,
  });
  const { dir, files } = scanTargets(values.root);
  const outDir: string = values.out === undefined ? OUT_DIR : resolve(values.out);

  const inside: string = relative(join(ROOT, 'node_modules/.cache'), outDir);
  if (inside === '' || inside.startsWith('..') || isAbsolute(inside)) {
    process.stderr.write(
      `check-doc-samples: --out must be a directory under node_modules/.cache (got ${outDir})
`,
    );
    return 2;
  }

  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  let count = 0;
  let fragments = 0;
  let wasmSkipped = 0;
  for (const file of files) {
    const page: string = relative(dir, file).split(sep).join('/');
    const extraction: Extraction = extractSamples(readFileSync(file, 'utf8'), page);
    fragments += extraction.fragments;
    for (const sample of extraction.samples) {
      if (values['skip-wasm'] && importsWasm(sample.code)) {
        wasmSkipped++;
        continue;
      }
      const code: string = hasModuleSyntax(sample.code)
        ? sample.code
        : `${sample.code}\nexport {};`;
      writeFileSync(join(outDir, sampleFileName(sample)), `${code}\n`);
      count++;
    }
  }
  writeFileSync(join(outDir, 'css.d.ts'), "declare module '*.css';\n");
  writeFileSync(join(outDir, 'tsconfig.json'), `${JSON.stringify(tsconfigFor(outDir), null, 2)}\n`);

  if (count === 0) {
    process.stderr.write(`check-doc-samples: no ts/tsx samples found under ${dir}\n`);
    return 1;
  }

  const result = spawnSync(
    process.execPath,
    [TSC, '-p', join(outDir, 'tsconfig.json'), '--pretty', 'false'],
    { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  if (result.error) {
    process.stderr.write(`check-doc-samples: could not run tsc: ${result.error.message}\n`);
    return 1;
  }
  const diagnostics: string[] = [];
  for (const raw of `${result.stdout}${result.stderr}`.split(/\r?\n/)) {
    const located = /^(.*?)\((\d+),\d+\): (.*)$/.exec(raw);
    if (located) {
      diagnostics.push(
        `${mapDiagnostic(located[1] ?? '', Number(located[2]))}: ${located[3] ?? ''}`,
      );
    } else if (raw.trim() !== '') {
      diagnostics.push(raw);
    }
  }
  if (diagnostics.length > 0) process.stderr.write(`${diagnostics.join('\n')}\n`);
  const wasmClause: string = values['skip-wasm']
    ? `, ${wasmSkipped} wasm samples skipped (--skip-wasm)`
    : '';
  process.stdout.write(
    `check-doc-samples: ${count} samples checked, ${fragments} fragments skipped${wasmClause}\n`,
  );
  return diagnostics.length > 0 || result.status !== 0 ? 1 : 0;
}

if (import.meta.main) process.exitCode = main();

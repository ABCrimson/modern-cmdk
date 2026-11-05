// scripts/check-snippets.ts
// CV-43: type-checks every VS Code snippet of packages/vscode-modern-cmdk, expanded with its defaults, against the
// built modern-cmdk d.mts files, so a snippet that does not compile cannot ship. Runs with Node's native type stripping:
//
//   node scripts/check-snippets.ts [--package <dir>] [--harness <file>] [--out <dir>] [--syntax-only]
//
// Every file listed in the package's contributes.snippets is read once, and compiled once per language the manifest
// contributes it to (CV-77): typescriptreact as .tsx, typescript as .ts, javascriptreact as .jsx and javascript as
// .js, each pass in its own directory under the output with its own tsconfig. A body is expanded the way VS Code
// does for the default text: ${N:default} becomes its default (recursively), ${N|a,b|} its first choice,
// $N, ${N} and $0 become '', and a $TM_* variable becomes 'Example'. The JS passes set allowJs and checkJs on top
// of tsconfigFor, so TypeScript-only syntax is a diagnostic (TS8xxx) and JSDoc types are checked; they set
// noImplicitAny to false, because the JS pass proves syntax and API shape, not annotation coverage.
//
// A body with no import or export line is a fragment and cannot stand alone: scripts/check-snippets.harness.json
// (--harness) holds, keyed by the snippet name, a `wrapper` (lines, with {{body}} where the expanded fragment goes)
// and `declarations` (typed ambient lines appended to the file, for example the imports a fragment relies on and the
// names its placeholders default to); `jsWrapper` and `jsDeclarations` replace them in the .jsx and .js passes,
// where the TypeScript-only declarations (interface, declare, import type) are not valid.
// A fragment with no wrapper fails the check, so a new snippet cannot skip it;
// a full module may carry `declarations` only (its placeholders default to names the snippet cannot declare).
// An entry that names no snippet fails too.
//
// The files land in node_modules/.cache/check-snippets/<language> (--out <dir>, which must lie under
// node_modules/.cache because the directory is deleted first) as <prefix>.<tsx|ts|jsx|js>, beside a tsconfig built by
// tsconfigFor from check-doc-samples.ts (modern-cmdk, modern-cmdk/react and modern-cmdk/react/dialog map to
// packages/modern-cmdk/dist/*.d.mts: run `pnpm build` first). The repo's own tsc checks each directory and every
// diagnostic is printed as <prefix>:<line>: message [<language>], the line counted in the expanded body
// ('[harness]' marks a line of the wrapper or the declarations). --syntax-only keeps only the syntax diagnostics
// (TS1xxx and the TS8xxx "only in TypeScript files" family), for a run without the built dist.
//
// Exit codes: 0 = every snippet type-checks, 1 = a diagnostic, a fragment without a harness entry, or tsc failed to
// run, 2 = usage error.

import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, isAbsolute, join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { tsconfigFor } from './check-doc-samples.ts';

const ROOT: string = resolve(import.meta.dirname, '..');
const OUT_DIR: string = join(ROOT, 'node_modules/.cache/check-snippets');
const TSC: string = join(ROOT, 'node_modules/typescript/bin/tsc');
const DEFAULT_PACKAGE: string = join(ROOT, 'packages/vscode-modern-cmdk');
const DEFAULT_HARNESS: string = join(ROOT, 'scripts/check-snippets.harness.json');
const BODY_MARK = '{{body}}';

/** The manifest languages the checker compiles, with the extension each pass writes. */
export const LANGUAGE_EXTENSIONS = {
  typescriptreact: 'tsx',
  typescript: 'ts',
  javascriptreact: 'jsx',
  javascript: 'js',
} as const;

export type SnippetLanguage = keyof typeof LANGUAGE_EXTENSIONS;

export interface SnippetFile {
  readonly path: string;
  readonly languages: readonly SnippetLanguage[];
}

export interface HarnessEntry {
  readonly wrapper?: readonly string[];
  readonly declarations?: readonly string[];
  readonly jsWrapper?: readonly string[];
  readonly jsDeclarations?: readonly string[];
}

interface Parsed {
  readonly text: string;
  readonly end: number;
}

interface RawSnippet {
  readonly prefix: string | readonly string[];
  readonly body: string | readonly string[];
}

const NAME = /^(?:\d+|[A-Za-z_]\w*)/;

function unescapeChoice(choice: string): string {
  return choice.replace(/\\([,|\\])/g, '$1');
}

function variableValue(name: string): string {
  if (/^\d+$/.test(name)) return '';
  if (name.startsWith('TM_')) return 'Example';
  throw new Error(
    `unsupported snippet variable ${name} (only tab stops and $TM_* variables expand)`,
  );
}

function parseDollar(text: string, at: number): Parsed {
  if (text[at + 1] === '{') {
    const name: string | undefined = NAME.exec(text.slice(at + 2))?.[0];
    if (name === undefined) throw new Error(`malformed placeholder at offset ${at}`);
    const after: number = at + 2 + name.length;
    const next: string | undefined = text[after];
    if (next === '}') return { text: variableValue(name), end: after + 1 };
    if (next === ':') {
      const inner: Parsed = parseText(text, after + 1, true);
      return { text: /^\d+$/.test(name) ? inner.text : variableValue(name), end: inner.end };
    }
    if (next === '|' && /^\d+$/.test(name)) {
      const close: number = text.indexOf('|}', after + 1);
      if (close === -1) throw new Error(`unterminated choice at offset ${at}`);
      const choices: string[] = text
        .slice(after + 1, close)
        .split(/(?<!\\),/)
        .map(unescapeChoice);
      return { text: choices[0] ?? '', end: close + 2 };
    }
    throw new Error(`unsupported placeholder form at offset ${at}`);
  }
  const bare: string | undefined = NAME.exec(text.slice(at + 1))?.[0];
  if (bare === undefined) return { text: '$', end: at + 1 };
  return { text: variableValue(bare), end: at + 1 + bare.length };
}

function parseText(text: string, start: number, nested: boolean): Parsed {
  let out = '';
  let i: number = start;
  while (i < text.length) {
    const ch: string = text[i] ?? '';
    const following: string | undefined = text[i + 1];
    if (ch === '\\' && following !== undefined && '$}\\'.includes(following)) {
      out += following;
      i += 2;
    } else if (nested && ch === '}') {
      return { text: out, end: i + 1 };
    } else if (ch === '$') {
      const parsed: Parsed = parseDollar(text, i);
      out += parsed.text;
      i = parsed.end;
    } else {
      out += ch;
      i++;
    }
  }
  if (nested) throw new Error('unterminated placeholder');
  return { text: out, end: i };
}

/** A snippet body as VS Code inserts it when every placeholder keeps its default. */
export function expandBody(body: string | readonly string[]): string {
  const text: string = typeof body === 'string' ? body : body.join('\n');
  return parseText(text, 0, false).text;
}

function isSnippetLanguage(language: string): language is SnippetLanguage {
  return Object.hasOwn(LANGUAGE_EXTENSIONS, language);
}

/** The distinct snippet files contributes.snippets lists, in manifest order, with every language each is contributed to. */
export function snippetFiles(packageDir: string = DEFAULT_PACKAGE): readonly SnippetFile[] {
  const manifest = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8')) as {
    contributes?: { snippets?: readonly { language: string; path: string }[] };
  };
  const byPath = new Map<string, SnippetLanguage[]>();
  for (const { language, path } of manifest.contributes?.snippets ?? []) {
    if (!isSnippetLanguage(language)) {
      throw new Error(
        `unsupported snippet language "${language}" for ${path} (the checker compiles ${Object.keys(LANGUAGE_EXTENSIONS).join(', ')})`,
      );
    }
    const absolute: string = resolve(packageDir, path);
    const languages: SnippetLanguage[] = byPath.get(absolute) ?? [];
    if (!languages.includes(language)) languages.push(language);
    byPath.set(absolute, languages);
  }
  return [...byPath].map(([path, languages]) => ({ path, languages }));
}

function hasModuleSyntax(code: string): boolean {
  return /^\s*(?:import|export)\b/m.test(code);
}

interface Planned {
  readonly language: SnippetLanguage;
  readonly prefix: string;
  readonly name: string;
  readonly fileName: string;
  readonly code: string;
  readonly bodyStart: number;
  readonly bodyLines: number;
}

/** tsconfigFor for one pass: the JS passes compile .js/.jsx with allowJs and checkJs, without noImplicitAny. */
function tsconfigForLanguage(passDir: string, language: SnippetLanguage): Record<string, unknown> {
  const base = tsconfigFor(passDir) as { compilerOptions: Record<string, unknown> };
  const extension: string = LANGUAGE_EXTENSIONS[language];
  const javascript: boolean = extension === 'js' || extension === 'jsx';
  return {
    ...base,
    compilerOptions: javascript
      ? { ...base.compilerOptions, allowJs: true, checkJs: true, noImplicitAny: false }
      : base.compilerOptions,
    include: [`*.${extension}`],
  };
}

function lineCount(text: string): number {
  return text.split('\n').length;
}

function main(): number {
  let values: { package?: string; harness?: string; out?: string; 'syntax-only'?: boolean };
  try {
    ({ values } = parseArgs({
      options: {
        package: { type: 'string' },
        harness: { type: 'string' },
        out: { type: 'string' },
        'syntax-only': { type: 'boolean', default: false },
      },
      strict: true,
    }));
  } catch (error) {
    process.stderr.write(`check-snippets: ${(error as Error).message}\n`);
    return 2;
  }
  const packageDir: string =
    values.package === undefined ? DEFAULT_PACKAGE : resolve(values.package);
  const harnessPath: string =
    values.harness === undefined ? DEFAULT_HARNESS : resolve(values.harness);
  const outDir: string = values.out === undefined ? OUT_DIR : resolve(values.out);

  const inside: string = relative(join(ROOT, 'node_modules/.cache'), outDir);
  if (inside === '' || inside.startsWith('..') || isAbsolute(inside)) {
    process.stderr.write(
      `check-snippets: --out must be a directory under node_modules/.cache (got ${outDir})\n`,
    );
    return 2;
  }

  const harness = JSON.parse(readFileSync(harnessPath, 'utf8')) as Record<string, HarnessEntry>;
  const failures = new Set<string>();
  const planned: Planned[] = [];
  const names = new Set<string>();
  const prefixes = new Set<string>();

  let files: readonly SnippetFile[];
  try {
    files = snippetFiles(packageDir);
  } catch (error) {
    process.stderr.write(`check-snippets: ${(error as Error).message}\n`);
    return 1;
  }
  for (const file of files) {
    const snippets = JSON.parse(readFileSync(file.path, 'utf8')) as Record<string, RawSnippet>;
    for (const [name, snippet] of Object.entries(snippets)) {
      const prefix: unknown = snippet.prefix;
      if (typeof prefix !== 'string' || prefix === '') {
        failures.add(`${name}: prefix must be one non-empty string (${basename(file.path)})`);
        continue;
      }
      names.add(name);
      const entry: HarnessEntry | undefined = harness[name];
      const body: string = expandBody(snippet.body);
      for (const language of file.languages) {
        const key = `${language}:${prefix}`;
        if (prefixes.has(key)) failures.add(`${prefix}: prefix defined twice for ${language}`);
        prefixes.add(key);
        const javascript: boolean = language === 'javascript' || language === 'javascriptreact';
        let head = '';
        let tail = '';
        if (!hasModuleSyntax(body)) {
          const wrapper: string | undefined = (
            (javascript ? entry?.jsWrapper : undefined) ?? entry?.wrapper
          )?.join('\n');
          if (wrapper === undefined || !wrapper.includes(BODY_MARK)) {
            failures.add(
              `${prefix}: a fragment (no import or export) needs a harness entry with a wrapper containing ${BODY_MARK} for "${name}" in ${basename(harnessPath)}`,
            );
            continue;
          }
          const split: number = wrapper.indexOf(BODY_MARK);
          head = wrapper.slice(0, split);
          tail = wrapper.slice(split + BODY_MARK.length);
        }
        const declarations: string = (
          (javascript ? entry?.jsDeclarations : undefined) ??
          entry?.declarations ??
          []
        ).join('\n');
        planned.push({
          language,
          prefix,
          name,
          fileName: `${prefix}.${LANGUAGE_EXTENSIONS[language]}`,
          code: `${head}${body}${tail}\n${declarations}\n`,
          bodyStart: lineCount(head),
          bodyLines: lineCount(body),
        });
      }
    }
  }
  for (const key of Object.keys(harness)) {
    if (!names.has(key))
      failures.add(`harness entry "${key}" names no snippet in ${basename(harnessPath)}`);
  }
  if (failures.size > 0) {
    process.stderr.write(`${[...failures].join('\n')}\n`);
    return 1;
  }

  rmSync(outDir, { recursive: true, force: true });
  const syntaxOnly: boolean = values['syntax-only'] === true;
  const diagnostics: string[] = [];
  const perLanguage: string[] = [];
  let tscFailed = false;
  for (const language of Object.keys(LANGUAGE_EXTENSIONS) as SnippetLanguage[]) {
    const pass: Planned[] = planned.filter((snippet) => snippet.language === language);
    if (pass.length === 0) continue;
    perLanguage.push(`${language} ${pass.length}`);
    const passDir: string = join(outDir, language);
    mkdirSync(passDir, { recursive: true });
    const byFile = new Map<string, Planned>();
    for (const snippet of pass) {
      writeFileSync(join(passDir, snippet.fileName), snippet.code);
      byFile.set(snippet.fileName, snippet);
    }
    writeFileSync(
      join(passDir, 'tsconfig.json'),
      `${JSON.stringify(tsconfigForLanguage(passDir, language), null, 2)}\n`,
    );
    const result = spawnSync(
      process.execPath,
      [TSC, '-p', join(passDir, 'tsconfig.json'), '--pretty', 'false'],
      { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
    );
    if (result.error) {
      process.stderr.write(`check-snippets: could not run tsc: ${result.error.message}\n`);
      return 1;
    }
    let reported = 0;
    let locatedLines = 0;
    for (const raw of `${result.stdout}${result.stderr}`.split(/\r?\n/)) {
      const located = /^(.*?)\((\d+),\d+\): error TS(\d+): (.*)$/.exec(raw);
      if (located) {
        locatedLines++;
        const code = Number(located[3]);
        if (syntaxOnly && !(code < 2000 || (code >= 8000 && code < 9000))) continue;
        reported++;
        const message = `error TS${located[3]}: ${located[4]}`;
        const snippet: Planned | undefined = byFile.get(basename(located[1] ?? ''));
        const line = Number(located[2]);
        if (snippet === undefined) {
          diagnostics.push(`${basename(located[1] ?? '')}:${line}: ${message} [${language}]`);
        } else if (line >= snippet.bodyStart && line < snippet.bodyStart + snippet.bodyLines) {
          diagnostics.push(
            `${snippet.prefix}:${line - snippet.bodyStart + 1}: ${message} [${language}]`,
          );
        } else {
          diagnostics.push(`${snippet.prefix}:${line}: [harness] ${message} [${language}]`);
        }
      } else if (raw.trim() !== '') {
        reported++;
        diagnostics.push(raw);
      }
    }
    if (result.status !== 0 && reported === 0 && locatedLines === 0) tscFailed = true;
  }
  if (diagnostics.length > 0) process.stderr.write(`${diagnostics.join('\n')}\n`);
  process.stdout.write(
    `check-snippets: ${names.size} snippets checked (${perLanguage.join(', ')}${syntaxOnly ? '; syntax only' : ''})\n`,
  );
  return diagnostics.length > 0 || tscFailed ? 1 : 0;
}

if (import.meta.main) process.exitCode = main();

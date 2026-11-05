// scripts/check-snippets.ts
// CV-43: type-checks every VS Code snippet of packages/vscode-modern-cmdk, expanded with its defaults, against the
// built modern-cmdk d.mts files, so a snippet that does not compile cannot ship. Runs with Node's native type stripping:
//
//   node scripts/check-snippets.ts [--package <dir>] [--harness <file>] [--out <dir>]
//
// Every file listed in the package's contributes.snippets is read once. A body is expanded the way VS Code
// does for the default text: ${N:default} becomes its default (recursively), ${N|a,b|} its first choice,
// $N, ${N} and $0 become '', and a $TM_* variable becomes 'Example'. snippets-core.json bodies are written as
// .ts, every other file's as .tsx.
//
// A body with no import or export line is a fragment and cannot stand alone: scripts/check-snippets.harness.json
// (--harness) holds, keyed by the snippet name, a `wrapper` (lines, with {{body}} where the expanded fragment goes)
// and `declarations` (typed ambient lines appended to the file, for example the imports a fragment relies on and the
// names its placeholders default to). A fragment with no wrapper fails the check, so a new snippet cannot skip it;
// a full module may carry `declarations` only (its placeholders default to names the snippet cannot declare).
// An entry that names no snippet fails too.
//
// The files land in node_modules/.cache/check-snippets (--out <dir>, which must lie under node_modules/.cache because
// the directory is deleted first) as <prefix>.tsx or <prefix>.ts, beside a tsconfig built by tsconfigFor from
// check-doc-samples.ts (modern-cmdk, modern-cmdk/react and modern-cmdk/react/dialog map to
// packages/modern-cmdk/dist/*.d.mts: run `pnpm build` first). The repo's own tsc checks the directory and every
// diagnostic is printed as <prefix>:<line>: message, the line counted in the expanded body ('[harness]' marks a
// line of the wrapper or the declarations).
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

export interface SnippetFile {
  readonly path: string;
  readonly extension: 'ts' | 'tsx';
}

export interface HarnessEntry {
  readonly wrapper?: readonly string[];
  readonly declarations?: readonly string[];
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

/** The distinct snippet files contributes.snippets lists, in manifest order. */
export function snippetFiles(packageDir: string = DEFAULT_PACKAGE): readonly SnippetFile[] {
  const manifest = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8')) as {
    contributes?: { snippets?: readonly { path: string }[] };
  };
  const seen = new Set<string>();
  const files: SnippetFile[] = [];
  for (const { path } of manifest.contributes?.snippets ?? []) {
    const absolute: string = resolve(packageDir, path);
    if (seen.has(absolute)) continue;
    seen.add(absolute);
    files.push({ path: absolute, extension: absolute.endsWith('-core.json') ? 'ts' : 'tsx' });
  }
  return files;
}

function hasModuleSyntax(code: string): boolean {
  return /^\s*(?:import|export)\b/m.test(code);
}

interface Planned {
  readonly prefix: string;
  readonly name: string;
  readonly fileName: string;
  readonly code: string;
  readonly bodyStart: number;
  readonly bodyLines: number;
}

function lineCount(text: string): number {
  return text.split('\n').length;
}

function main(): number {
  let values: { package?: string; harness?: string; out?: string };
  try {
    ({ values } = parseArgs({
      options: {
        package: { type: 'string' },
        harness: { type: 'string' },
        out: { type: 'string' },
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
  const failures: string[] = [];
  const planned: Planned[] = [];
  const names = new Set<string>();
  const prefixes = new Set<string>();

  for (const file of snippetFiles(packageDir)) {
    const snippets = JSON.parse(readFileSync(file.path, 'utf8')) as Record<string, RawSnippet>;
    for (const [name, snippet] of Object.entries(snippets)) {
      const prefix: unknown = snippet.prefix;
      if (typeof prefix !== 'string' || prefix === '') {
        failures.push(`${name}: prefix must be one non-empty string (${basename(file.path)})`);
        continue;
      }
      if (prefixes.has(prefix)) failures.push(`${prefix}: prefix defined twice`);
      prefixes.add(prefix);
      names.add(name);
      const entry: HarnessEntry | undefined = harness[name];
      const body: string = expandBody(snippet.body);
      let head = '';
      let tail = '';
      if (!hasModuleSyntax(body)) {
        const wrapper: string | undefined = entry?.wrapper?.join('\n');
        if (wrapper === undefined || !wrapper.includes(BODY_MARK)) {
          failures.push(
            `${prefix}: a fragment (no import or export) needs a harness entry with a wrapper containing ${BODY_MARK} for "${name}" in ${basename(harnessPath)}`,
          );
          continue;
        }
        const split: number = wrapper.indexOf(BODY_MARK);
        head = wrapper.slice(0, split);
        tail = wrapper.slice(split + BODY_MARK.length);
      }
      const declarations: string = (entry?.declarations ?? []).join('\n');
      planned.push({
        prefix,
        name,
        fileName: `${prefix}.${file.extension}`,
        code: `${head}${body}${tail}\n${declarations}\n`,
        bodyStart: lineCount(head),
        bodyLines: lineCount(body),
      });
    }
  }
  for (const key of Object.keys(harness)) {
    if (!names.has(key))
      failures.push(`harness entry "${key}" names no snippet in ${basename(harnessPath)}`);
  }
  if (failures.length > 0) {
    process.stderr.write(`${failures.join('\n')}\n`);
    return 1;
  }

  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  const byFile = new Map<string, Planned>();
  for (const snippet of planned) {
    writeFileSync(join(outDir, snippet.fileName), snippet.code);
    byFile.set(snippet.fileName, snippet);
  }
  writeFileSync(join(outDir, 'tsconfig.json'), `${JSON.stringify(tsconfigFor(outDir), null, 2)}\n`);

  const result = spawnSync(
    process.execPath,
    [TSC, '-p', join(outDir, 'tsconfig.json'), '--pretty', 'false'],
    {
      cwd: ROOT,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    },
  );
  if (result.error) {
    process.stderr.write(`check-snippets: could not run tsc: ${result.error.message}\n`);
    return 1;
  }
  const diagnostics: string[] = [];
  for (const raw of `${result.stdout}${result.stderr}`.split(/\r?\n/)) {
    const located = /^(.*?)\((\d+),\d+\): (.*)$/.exec(raw);
    if (located) {
      const snippet: Planned | undefined = byFile.get(basename(located[1] ?? ''));
      const line = Number(located[2]);
      if (snippet === undefined) {
        diagnostics.push(`${basename(located[1] ?? '')}:${line}: ${located[3] ?? ''}`);
      } else if (line >= snippet.bodyStart && line < snippet.bodyStart + snippet.bodyLines) {
        diagnostics.push(`${snippet.prefix}:${line - snippet.bodyStart + 1}: ${located[3] ?? ''}`);
      } else {
        diagnostics.push(`${snippet.prefix}:${line}: [harness] ${located[3] ?? ''}`);
      }
    } else if (raw.trim() !== '') {
      diagnostics.push(raw);
    }
  }
  if (diagnostics.length > 0) process.stderr.write(`${diagnostics.join('\n')}\n`);
  process.stdout.write(`check-snippets: ${planned.length} snippets checked\n`);
  return diagnostics.length > 0 || result.status !== 0 ? 1 : 0;
}

if (import.meta.main) process.exitCode = main();

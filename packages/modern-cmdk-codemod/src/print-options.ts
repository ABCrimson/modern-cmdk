// modern-cmdk/codemod — printOptions: the recast print options that keep a file's own style.
//
// recast prints every StringLiteral it rebuilds through its `quote` option (default: double) and
// joins lines with `lineTerminator` (default: os.EOL), so an unconfigured toSource() turns
// 'cmdk' into "cmdk" and an LF file into CRLF on Windows. A transform keeps the file's
// style by printing with `root.toSource(printOptions(source, sampleRaw))`. recast's quote 'auto' is never
// returned: it ties to double.
//
// Pure: no imports.

export interface PrintOptions {
  readonly quote: 'single' | 'double';
  readonly lineTerminator: '\n' | '\r\n';
}

// Comments and template literals are matched only to be skipped; a string is a capture.
const TOKEN =
  /\/\/[^\n]*|\/\*[\s\S]*?\*\/|`(?:[^`\\]|\\[\s\S])*`|(?<s>'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*")/g;

// What may precede a module specifier: `from`, a side-effect `import`, `require(`, `import(`.
const SPECIFIER_CONTEXT = /(?:\bfrom|\bimport|\brequire\s*\(|\bimport\s*\()\s*$/;

function quoteOf(raw: string): 'single' | 'double' | undefined {
  if (raw.startsWith("'")) return 'single';
  if (raw.startsWith('"')) return 'double';
  return undefined;
}

/**
 * Print options that reproduce the source file's line terminator and quote style.
 *
 * - lineTerminator: CRLF when the source contains a CRLF, else LF.
 * - quote: the quote of `sampleRaw` when it starts with one; otherwise the quote of the first
 *   import, export-from, require or dynamic-import specifier; otherwise the more frequent quote
 *   of the file's string literals, a tie giving double.
 */
export function printOptions(source: string, sampleRaw?: string): PrintOptions {
  const lineTerminator = source.includes('\r\n') ? '\r\n' : '\n';

  const sampled = sampleRaw === undefined ? undefined : quoteOf(sampleRaw);
  if (sampled !== undefined) return { quote: sampled, lineTerminator };

  let single = 0;
  let double = 0;
  let specifier: 'single' | 'double' | undefined;
  for (const match of source.matchAll(TOKEN)) {
    const raw = match.groups?.s;
    if (raw === undefined) continue;
    const quote = raw.startsWith("'") ? 'single' : 'double';
    if (quote === 'single') single++;
    else double++;
    if (
      specifier === undefined &&
      SPECIFIER_CONTEXT.test(source.slice(Math.max(0, match.index - 32), match.index))
    ) {
      specifier = quote;
    }
  }
  if (specifier !== undefined) return { quote: specifier, lineTerminator };
  return { quote: single > double ? 'single' : 'double', lineTerminator };
}

import type { API, FileInfo } from 'jscodeshift';
import jscodeshift from 'jscodeshift';
import { describe, expect, it } from 'vitest';
import { printOptions } from '../../packages/modern-cmdk-codemod/src/print-options.js';

describe('codemod: printOptions', () => {
  it('RP-18: printOptions gives CRLF only when the source contains CRLF', () => {
    expect(printOptions("const a = 'x';\r\nconst b = 'y';\r\n").lineTerminator).toBe('\r\n');
    expect(printOptions("const a = 'x';\nconst b = 'y';\n").lineTerminator).toBe('\n');
    expect(printOptions("const a = 'x';").lineTerminator).toBe('\n');
    // A lone CRLF anywhere in the file is enough; a lone CR is not a CRLF.
    expect(printOptions('a\nb\r\nc\n').lineTerminator).toBe('\r\n');
    expect(printOptions('a\rb').lineTerminator).toBe('\n');
  });

  it('IR-4: the quote follows sampleRaw when it starts with a quote', () => {
    const doubleHeavy = 'import a from "a";\nimport b from "b";\nconst c = "c";\n';
    expect(printOptions(doubleHeavy, "'cmdk'").quote).toBe('single');
    expect(printOptions("import a from 'a';\n", '"cmdk"').quote).toBe('double');
    // A sample that does not start with a quote (a template, an identifier, empty) is ignored.
    expect(printOptions(doubleHeavy, '`cmdk`').quote).toBe('double');
    expect(printOptions("import a from 'a';\n", 'cmdk').quote).toBe('single');
    expect(printOptions("import a from 'a';\n", '').quote).toBe('single');
  });

  it('IR-4: otherwise the first import, export-from or require specifier decides', () => {
    const importFirst = 'import a from \'a\';\nconst x = "1";\nconst y = "2";\nconst z = "3";\n';
    expect(printOptions(importFirst).quote).toBe('single');
    const sideEffect = "import \"a\";\nconst x = '1';\nconst y = '2';\n";
    expect(printOptions(sideEffect).quote).toBe('double');
    const exportFrom = 'export * from \'a\';\nconst x = "1";\nconst y = "2";\n';
    expect(printOptions(exportFrom).quote).toBe('single');
    const multiLine = 'import {\n  a,\n  b,\n} from \'a\';\nconst x = "1";\nconst y = "2";\n';
    expect(printOptions(multiLine).quote).toBe('single');
    const required = 'const a = require(\'a\');\nconst x = "1";\nconst y = "2";\n';
    expect(printOptions(required).quote).toBe('single');
    const dynamic = "const a = await import(\"a\");\nconst x = '1';\nconst y = '2';\n";
    expect(printOptions(dynamic).quote).toBe('double');
    // Quotes inside comments and templates are not specifiers and are not counted.
    const commented =
      '// import x from "x"\n/* from "y" */\nconst t = `"a" "b" "c"`;\nimport q from \'q\';\n';
    expect(printOptions(commented).quote).toBe('single');
  });

  it('IR-4: otherwise the more frequent quote wins, and a tie gives double', () => {
    expect(printOptions("const a = '1';\nconst b = '2';\nconst c = \"3\";\n").quote).toBe('single');
    expect(printOptions('const a = "1";\nconst b = "2";\nconst c = \'3\';\n').quote).toBe('double');
    expect(printOptions('const a = \'1\';\nconst b = "2";\n').quote).toBe('double');
    expect(printOptions('const a = 1;\n').quote).toBe('double');
    expect(printOptions('').quote).toBe('double');
  });

  const source = "const a = 'cmdk';\r\nconst b = 'keep';\r\n";
  const expected = "const a = 'modern-cmdk';\r\nconst b = 'keep';\r\n";

  function run(print: (src: string, raw: string) => object): string {
    const j = jscodeshift.withParser('tsx');
    const api: API = { jscodeshift: j, j, stats: () => {}, report: () => {} };
    const file: FileInfo = { path: 'a.ts', source };
    const root = api.jscodeshift(file.source);
    let raw = '';
    root.find(j.StringLiteral, { value: 'cmdk' }).forEach((p) => {
      raw = (p.node.extra as { raw: string }).raw;
      p.node.value = 'modern-cmdk';
      delete (p.node as { extra?: unknown }).extra;
    });
    return root.toSource(print(file.source, raw));
  }

  it('RP-18: a recast round trip keeps CRLF and single quotes', () => {
    const out = run((src, raw) => printOptions(src, raw));
    expect(out).toBe(expected);
  });

  it('RP-18: plain toSource() fails the same assertion', () => {
    const out = run(() => ({}));
    expect(out).not.toBe(expected);
  });
});

// tests/unit/check-package.test.ts
// scripts/check-package.ts, apart from its publint, attw and pnpm pack steps: the file-list diff, the
// 'use client' directive test (startsWithUseClient) and its per-package check (clientDirectiveFailures),
// the --pack-dir and --tarball argument handling, the in-process tarball reader (listTarEntries,
// including header modes), PACKAGES coverage, packedManifestFailures, blankNonCode and bareImports,
// importAllowListFailures and binFailures (shebang and tar header execute bits). The reader is exercised
// on archives built here byte by byte, so no archiver binary runs (see the host tar rule in the script
// header).

import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import {
  absolutePackDir,
  bareImports,
  binFailures,
  blankNonCode,
  clientDirectiveFailures,
  diffFileList,
  importAllowListFailures,
  listTarEntries,
  PACKAGES,
  packedManifestFailures,
  startsWithUseClient,
  type TarEntry,
} from '../../scripts/check-package.ts';

const BLOCK = 512;
const SCRIPT = resolve(import.meta.dirname, '../../scripts/check-package.ts');

interface RawEntry {
  readonly name: string;
  readonly data: string;
  readonly type?: string;
  readonly prefix?: string;
  readonly mode?: number;
}

function field(text: string, length: number): Buffer {
  const out = Buffer.alloc(length);
  out.write(text, 0, 'utf8');
  return out;
}

function entry({ name, data, type = '0', prefix = '', mode = 0o644 }: RawEntry): Buffer {
  const body = Buffer.from(data, 'utf8');
  const header = Buffer.alloc(BLOCK);
  field(name, 100).copy(header, 0);
  field(`${mode.toString(8).padStart(7, '0')}\0`, 8).copy(header, 100);
  field(`${body.length.toString(8).padStart(11, '0')}\0`, 12).copy(header, 124);
  header.write(type, 156, 'utf8');
  field(prefix, 155).copy(header, 345);
  const padded = Buffer.alloc(Math.ceil(body.length / BLOCK) * BLOCK);
  body.copy(padded);
  return Buffer.concat([header, padded]);
}

/** A pax extended-header body holding one `path` record ("<len> path=<value>\n", len counts itself). */
function pax(path: string): string {
  const record = ` path=${path}\n`;
  let length = record.length + 1;
  while (`${length}${record}`.length !== length) length = `${length}${record}`.length;
  return `${length}${record}`;
}

function archive(...entries: readonly RawEntry[]): Buffer {
  return gzipSync(Buffer.concat([...entries.map(entry), Buffer.alloc(BLOCK * 2)]));
}

describe('diffFileList', () => {
  it('returns two empty lists when the lists are equal', () => {
    expect(diffFileList(['b', 'a'], ['a', 'b'])).toEqual({ missing: [], extra: [] });
  });

  it('reports names only in expected as missing and names only in actual as extra, sorted', () => {
    expect(diffFileList(['z', 'a', 'keep'], ['y', 'keep', 'b'])).toEqual({
      missing: ['a', 'z'],
      extra: ['b', 'y'],
    });
  });
});

describe('startsWithUseClient', () => {
  it.each([
    ["'use client';\nimport x from 'y';"],
    ['"use client"\nexport const a = 1;'],
    ["  \n\t'use client';"],
    ["// banner\n/* block */\n'use client';\nconst a = 1;"],
  ])('accepts a leading directive: %j', (code) => {
    expect(startsWithUseClient(code)).toBe(true);
  });

  it.each([
    ["import x from 'y';\n'use client';"],
    ['const a = 1;'],
    ["'use server';"],
    ["'use client-ish';"],
    ['`use client`;'],
    [''],
  ])('rejects anything else: %j', (code) => {
    expect(startsWithUseClient(code)).toBe(false);
  });
});

describe('listTarEntries', () => {
  it('lists regular files with their content and skips directories', () => {
    const entries = listTarEntries(
      archive(
        { name: 'package/', data: '', type: '5' },
        { name: 'package/a.txt', data: 'alpha' },
        { name: 'package/dist/b.mjs', data: 'x'.repeat(700) },
      ),
    );
    expect(entries.map((e) => e.name)).toEqual(['package/a.txt', 'package/dist/b.mjs']);
    expect(entries[0]?.data.toString('utf8')).toBe('alpha');
    expect(entries[1]?.data.length).toBe(700);
  });

  it('joins the ustar prefix field to the name', () => {
    const [only] = listTarEntries(archive({ name: 'file.txt', prefix: 'package/deep', data: 'x' }));
    expect(only?.name).toBe('package/deep/file.txt');
  });

  it('lets a pax path record rename the next entry only', () => {
    const long = `package/${'d/'.repeat(80)}long.txt`;
    const entries = listTarEntries(
      archive(
        { name: 'PaxHeader', type: 'x', data: pax(long) },
        { name: 'truncated', data: 'one' },
        { name: 'package/next.txt', data: 'two' },
      ),
    );
    expect(entries.map((e) => e.name)).toEqual([long, 'package/next.txt']);
  });
});

describe('absolutePackDir', () => {
  it('leaves an unset --pack-dir unset', () => {
    expect(absolutePackDir(undefined, resolve('/work'))).toBeUndefined();
  });

  it('resolves a relative --pack-dir against the given cwd', () => {
    const cwd = resolve('/work/elsewhere');
    expect(absolutePackDir('relpack', cwd)).toBe(resolve(cwd, 'relpack'));
    expect(absolutePackDir('relpack', cwd)).toBe(resolve('/work/elsewhere/relpack'));
  });

  it('leaves an absolute --pack-dir unchanged', () => {
    const absolute = resolve('/abs/packs');
    expect(absolutePackDir(absolute, resolve('/work'))).toBe(absolute);
  });
});

describe('--tarball that does not exist', () => {
  it('is a usage error: exit 2 and the path named on stderr', () => {
    const result = spawnSync(
      process.execPath,
      [SCRIPT, '--tarball', 'C:/nope/modern-cmdk-0.0.0.tgz'],
      {
        encoding: 'utf8',
        timeout: 30_000,
      },
    );
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('--tarball C:/nope/modern-cmdk-0.0.0.tgz does not exist');
    expect(result.stderr).toContain('usage: node scripts/check-package.ts');
  });
});

const file = (name: string, data: string, mode = 0o644): TarEntry => ({
  name,
  data: Buffer.from(data, 'utf8'),
  mode,
});
const manifest = (extra: Record<string, unknown>): string =>
  JSON.stringify({ name: 'x', version: '1.0.0', ...extra });

describe('listTarEntries modes', () => {
  it('reports the header mode of each regular file', () => {
    const [only] = listTarEntries(archive({ name: 'package/a.mjs', data: 'x', mode: 0o755 }));
    expect(only?.mode).toBe(0o755);
  });
});

describe('PACKAGES', () => {
  it('PKG-1: PACKAGES covers every non-private packages/*/package.json', () => {
    const root = resolve(import.meta.dirname, '../../packages');
    const published = readdirSync(root, { withFileTypes: true })
      .filter((dirent) => dirent.isDirectory())
      .map(
        (dirent) =>
          JSON.parse(readFileSync(resolve(root, dirent.name, 'package.json'), 'utf8')) as {
            name: string;
            private?: boolean;
          },
      )
      .filter((pkg) => pkg.private !== true)
      .map((pkg) => pkg.name)
      .sort();
    expect([...PACKAGES].sort()).toEqual(published);
  });
});

describe('packedManifestFailures', () => {
  it('PKG-1: a packed manifest with a catalog: or workspace: specifier fails', () => {
    const failures = packedManifestFailures(
      manifest({
        dependencies: { a: 'catalog:', b: '^1.0.0' },
        peerDependencies: { c: 'workspace:*' },
        optionalDependencies: { d: 'catalog:react' },
        devDependencies: { e: 'catalog:' },
      }),
    );
    expect(failures).toHaveLength(3);
    const text = failures.join('\n');
    expect(text).toContain('dependencies.a');
    expect(text).toContain('peerDependencies.c');
    expect(text).toContain('optionalDependencies.d');
  });

  it('accepts concrete ranges and a manifest without dependency fields', () => {
    expect(packedManifestFailures(manifest({ dependencies: { a: '17.4.0' } }))).toEqual([]);
    expect(packedManifestFailures(manifest({}))).toEqual([]);
  });
});

describe('importAllowListFailures', () => {
  it('SEC-33: a bare import that is not a node: builtin or a declared dependency fails', () => {
    const bad = file('dist/codemod/cli.mjs', "import x from 'jscodeshift';\nexport { x };");
    const failures = importAllowListFailures('modern-cmdk', [bad], []);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain('jscodeshift');
    const codemodBad = file('dist/cli.mjs', "import 'left-pad';");
    expect(
      importAllowListFailures('modern-cmdk-codemod', [codemodBad], ['jscodeshift']),
    ).toHaveLength(1);
  });

  it('accepts node: builtins, relative imports, declared dependencies (with subpaths) and dynamic imports', () => {
    const code = [
      "import { a } from 'node:fs';",
      "import b from './chunk.mjs';",
      "export { c } from 'jscodeshift/src/Runner.js';",
      "const d = await import('@scope/dep/sub');",
      "const note = 'a string that mentions import but no specifier';",
      "/* import('in-block-comment') */ // import('in-line-comment')",
      "api.report(`used through import('cmdk')`); const q = \"require('cmdk')\";",
      `api.report(\`export * from '\${OLD}'\`); const m = "import x from 'cmdk'";`,
    ].join('\n');
    const entries = [file('dist/cli.mjs', code), file('dist/transforms/t.mjs', code)];
    expect(
      importAllowListFailures('modern-cmdk-codemod', entries, ['jscodeshift', '@scope/dep']),
    ).toEqual([]);
  });

  it('modern-cmdk allows only node: builtins under dist/codemod and ignores other dist files', () => {
    const react = file('dist/react/index.mjs', "import 'react';");
    const codemod = file('dist/codemod/cli.mjs', "import 'node:path';");
    expect(importAllowListFailures('modern-cmdk', [react, codemod], ['react'])).toEqual([]);
    const dep = file('dist/codemod/cli.mjs', "import 'react';");
    expect(importAllowListFailures('modern-cmdk', [dep], ['react'])).toHaveLength(1);
  });

  it("SEC-33: rolldown's __require of a bare package fails and a __require of a builtin passes", () => {
    const chunk = file(
      'dist/codemod/chunk-jscodeshift.mjs',
      'var j = __require("jscodeshift");\nconst fs = __require("fs");\n',
    );
    const failures = importAllowListFailures('modern-cmdk', [chunk], []);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain('"jscodeshift"');
  });

  it('create-modern-cmdk is not import-checked', () => {
    const entries = [file('dist/x.mjs', "import 'zzz';")];
    expect(importAllowListFailures('create-modern-cmdk', entries, [])).toEqual([]);
  });
});

// '@{' stands for a template substitution opener in the samples below (a literal one trips noTemplateCurlyInString)
const js = (sample: string): string => sample.replaceAll('@{', '$' + '{');

describe('bareImports and blankNonCode', () => {
  it('DT-68: a real import() after a string holding // on the same line is reported', () => {
    const code = "const u = 'https://x.test'; const m = await import('jscodeshift');";
    expect(bareImports(code)).toEqual(['jscodeshift']);
  });

  it('DT-68: a real require() after a string holding an apostrophe on the same line is reported', () => {
    const code = 'const s = "it\'s"; const r = require("recast");';
    expect(bareImports(code)).toEqual(['recast']);
  });

  it('DT-68: a bare import inside a template literal, a block comment or a line comment is not reported', () => {
    const code = [
      js("const t = `import('a') @{ok('in-substitution-string')} require('b')`;"),
      '/* spanning',
      "   import('c') and require('d')",
      '*/',
      "// import('e') require('f')",
      js("const nested = `outer @{`inner import('g')`} tail`;"),
    ].join('\n');
    expect(bareImports(code)).toEqual([]);
  });

  it('DT-68: code inside a template substitution is still scanned', () => {
    const code = js("const t = `x @{await import('real-dep')}`;");
    expect(bareImports(code)).toEqual(['real-dep']);
  });

  it('DT-68: blankNonCode keeps the length and the line count and blanks exactly the literal contents', () => {
    const src = js(['a(\'x y\', "p\\"q", `t@{b}u`); // note', '/* c', 'd */ e'].join('\n'));
    const out = blankNonCode(src);
    expect(out).toHaveLength(src.length);
    expect(out.split('\n')).toHaveLength(src.split('\n').length);
    // quotes and backticks stay, their contents become spaces, a template substitution stays code, and a
    // comment is blanked whole
    expect(out).toBe(js(['a(\'   \', "    ", ` @{b} `);        ', '    ', '     e'].join('\n')));
  });
});

describe('binFailures', () => {
  const bins = manifest({ bin: { tool: './dist/cli.mjs' } });

  it('PKG-1: every bin target exists in the tarball and starts with #!/usr/bin/env node', () => {
    const good = file('dist/cli.mjs', '#!/usr/bin/env node\nconsole.log(1);', 0o755);
    expect(binFailures([good], bins)).toEqual([]);
    expect(binFailures([], bins)).toHaveLength(1);
    const noShebang = file('dist/cli.mjs', 'console.log(1);', 0o755);
    expect(binFailures([noShebang], bins)).toHaveLength(1);
    const wrong = file('dist/cli.mjs', '#!/usr/bin/node\n', 0o755);
    expect(binFailures([wrong], bins)).toHaveLength(1);
  });

  it('accepts a string bin and fails a manifest with no bin at all', () => {
    const good = file('dist/cli.mjs', '#!/usr/bin/env node\n', 0o755);
    expect(binFailures([good], manifest({ bin: './dist/cli.mjs' }))).toEqual([]);
    expect(binFailures([good], manifest({}))).toHaveLength(1);
  });

  it('PKG-1: a bin target without the execute bits in its tar header fails', () => {
    const plain = file('dist/cli.mjs', '#!/usr/bin/env node\n', 0o644);
    const exec = file('dist/cli.mjs', '#!/usr/bin/env node\n', 0o755);
    expect(binFailures([plain], bins)).toHaveLength(1);
    expect(binFailures([exec], bins)).toEqual([]);
  });
});

describe('clientDirectiveFailures', () => {
  it('PKG-1: modern-cmdk-codemod has no use client directive', () => {
    const bad = file('dist/cli.mjs', "'use client';\nexport {};");
    expect(clientDirectiveFailures('modern-cmdk-codemod', [bad])).toHaveLength(1);
    const good = file('dist/cli.mjs', '#!/usr/bin/env node\nexport {};');
    expect(clientDirectiveFailures('modern-cmdk-codemod', [good])).toEqual([]);
  });

  it('modern-cmdk keeps its rule: react starts with the directive, core and codemod do not', () => {
    const react = file('dist/react/index.mjs', 'export {};');
    expect(clientDirectiveFailures('modern-cmdk', [react])).toHaveLength(1);
    const core = file('dist/core/index.mjs', "'use client';");
    expect(clientDirectiveFailures('modern-cmdk', [core])).toHaveLength(1);
    const ok = file('dist/react/index.mjs', "'use client';\nexport {};");
    expect(clientDirectiveFailures('modern-cmdk', [ok])).toEqual([]);
  });
});

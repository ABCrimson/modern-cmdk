// tests/unit/third-party-notices.test.ts
// PKG-5 (F16's 1.x half): the generator of packages/modern-cmdk/THIRD-PARTY-NOTICES.md, on synthetic region lines
// and a synthetic node_modules tree in a temp dir (never the repository's own packages).

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  bundledPackages,
  collectNotice,
  type LicenseFilePin,
  parseBundleList,
  renderNotices,
} from '../../scripts/third-party-notices.ts';

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'notices-'));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function install(
  dir: string,
  manifest: Record<string, unknown>,
  files: Record<string, string>,
): void {
  const abs = join(root, dir);
  mkdirSync(abs, { recursive: true });
  writeFileSync(join(abs, 'package.json'), JSON.stringify(manifest));
  for (const [name, text] of Object.entries(files)) writeFileSync(join(abs, name), text);
}

describe('third-party notices', () => {
  it('PKG-5: bundledPackages reads region paths, scoped and .pnpm-nested', () => {
    const source = [
      'import x from "node:fs";',
      '//#region ../../node_modules/.pnpm/ast-types@0.16.3/node_modules/ast-types/lib/path.js',
      'var a = 1;',
      '// ../../node_modules/.pnpm/@babel+parser@7.29.0/node_modules/@babel/parser/lib/index.js',
      '//#region ../../node_modules/.pnpm/tslib@2.8.1/node_modules/tslib/tslib.es6.mjs',
      '//#region ../../node_modules/.pnpm/ast-types@0.16.3/node_modules/ast-types/lib/types.js',
      '//#region ../../node_modules/jscodeshift/src/core.js',
      '//#region ../modern-cmdk-codemod/src/cli.ts',
      '//#region src/codemod/bin.ts',
      '// a comment that mentions node_modules/left-pad in prose',
      '// \0rolldown/runtime.js',
    ].join('\n');
    expect(bundledPackages([source]).map((p) => p.name)).toEqual([
      '@babel/parser',
      'ast-types',
      'jscodeshift',
      'tslib',
    ]);
    const [parser] = bundledPackages([source]);
    expect(parser?.dir).toBe('node_modules/.pnpm/@babel+parser@7.29.0/node_modules/@babel/parser');
  });

  it('PKG-5: renderNotices is sorted by name@version and carries each licence text verbatim', () => {
    const text = 'MIT License\r\n\r\nCopyright (c) Zed <z@example.com>\n  indented  line\n';
    const out = renderNotices([
      {
        name: 'zed',
        version: '1.0.0',
        license: 'MIT',
        texts: [{ file: 'LICENSE', text }],
      },
      {
        name: 'alpha',
        version: '2.0.0',
        license: 'ISC',
        texts: [
          { file: 'LICENSE', text: 'ISC text\n' },
          { file: 'LICENSE-EXTRA', text: 'Extra text\n' },
        ],
      },
      {
        name: 'alpha',
        version: '10.0.0',
        license: 'ISC',
        texts: [{ file: 'LICENSE', text: 'ten\n' }],
      },
    ]);
    expect(out.indexOf('alpha@2.0.0')).toBeLessThan(out.indexOf('alpha@10.0.0'));
    expect(out.indexOf('alpha@10.0.0')).toBeLessThan(out.indexOf('zed@1.0.0'));
    // verbatim apart from line endings (normalised to LF) and the trailing newline before the closing fence
    expect(out).toContain(text.replaceAll('\r\n', '\n').trimEnd());
    expect(out).toContain('Extra text');
    expect(out).toContain('`dist/codemod` only');
    expect(out).toContain('2.0');
    expect(out).toContain('modern-cmdk-codemod');
    expect(out.endsWith('\n')).toBe(true);
    expect(renderNotices([])).toBe(renderNotices([]));
  });

  it("PKG-5: a package with no licence file uses tests/package/license-policy.json's noticeFiles pin, and one with neither is an error, never a skip", () => {
    install(
      'node_modules/has',
      { name: 'has', version: '1.2.3', license: 'MIT' },
      { LICENCE: 'own text\n' },
    );
    install(
      'node_modules/pinned',
      { name: 'pinned', version: '0.1.0', license: 'MIT' },
      { 'NOTICE-MIT.txt': 'pinned text\n' },
    );
    install('node_modules/bare', { name: 'bare', version: '9.9.9', license: 'MIT' }, {});

    const has = collectNotice(root, { name: 'has', dir: 'node_modules/has' }, []);
    expect(has).toEqual({
      name: 'has',
      version: '1.2.3',
      license: 'MIT',
      texts: [{ file: 'LICENCE', text: 'own text\n' }],
    });

    const sha = '0123456789abcdef0123456789abcdef01234567';
    const pin: LicenseFilePin = {
      package: 'pinned',
      version: '0.1.0',
      file: 'notices/pinned-LICENSE.txt',
      source: `https://example.com/pinned/blob/${sha}/LICENSE`,
      fetched: '2026-11-05',
      reason: 'the tarball ships no licence file',
    };
    mkdirSync(join(root, 'notices'), { recursive: true });
    writeFileSync(join(root, pin.file), 'pinned text\r\nsecond line\r\n');
    const [text] = collectNotice(root, { name: 'pinned', dir: 'node_modules/pinned' }, [pin]).texts;
    // the pinned file is read from the repository root, with LF endings
    expect(text?.file).toBe('notices/pinned-LICENSE.txt');
    expect(text?.text).toBe('pinned text\nsecond line\n');
    expect(text?.provenance).toContain(pin.source);
    expect(text?.provenance).toContain(`commit ${sha}`);
    expect(text?.provenance).toContain('fetched 2026-11-05');
    expect(text?.provenance).toContain(pin.reason);
    // the rendered section puts the provenance line between the file name and the fence
    const out = renderNotices([
      collectNotice(root, { name: 'pinned', dir: 'node_modules/pinned' }, [pin]),
    ]);
    expect(out).toMatch(
      /## pinned@0\.1\.0\n\nLicence: MIT\n\nFile: `notices\/pinned-LICENSE\.txt`\n\nLicence text pinned in this repository.*fetched 2026-11-05\.\n\n```text\npinned text\nsecond line\n```\n/,
    );
    // a pin for another version does not apply
    expect(() =>
      collectNotice(root, { name: 'pinned', dir: 'node_modules/pinned' }, [
        { ...pin, version: '0.2.0' },
      ]),
    ).toThrow(/pinned@0\.1\.0.*noticeFiles pin in tests\/package\/license-policy\.json/);
    // without a pin the error names the package and the policy file
    expect(() => collectNotice(root, { name: 'bare', dir: 'node_modules/bare' }, [pin])).toThrow(
      /bare@9\.9\.9.*licen[sc]e.*tests\/package\/license-policy\.json/i,
    );
    // a pin without a commit in its source URL is refused, never rendered
    expect(() =>
      collectNotice(root, { name: 'pinned', dir: 'node_modules/pinned' }, [
        { ...pin, source: 'https://example.com/pinned/LICENSE' },
      ]),
    ).toThrow(/40-hex commit/);
  });

  it('PKG-5: parseBundleList reads the explicit bundle list of tsdown.config.ts', () => {
    const config =
      "const BUNDLED_FOR_CODEMOD: string[] = [\n  '@babel/parser',\n  'tslib',\n];\nexport default {};";
    expect(parseBundleList(config)).toEqual(['@babel/parser', 'tslib']);
    expect(() => parseBundleList('export default {};')).toThrow(/BUNDLED_FOR_CODEMOD/);
  });
});

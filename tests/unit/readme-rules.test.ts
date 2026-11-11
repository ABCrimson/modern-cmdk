// tests/unit/readme-rules.test.ts
// The rules about the published READMEs that scripts/check-doc-samples.ts, scripts/check-repo-links.ts and
// scripts/check-package.ts share (scripts/readme-rules.ts): the fence-aware scan, the 78-column fence rule, the
// 28-character unbreakable inline-code rule, the image extraction, and the shape of a pinned commit. Each rule has a
// passing fixture and a failing one; the failing ones are lines restored from the 1.7.0 READMEs that the rule exists
// to keep out.

import { describe, expect, it } from 'vitest';
import {
  COMMIT_SHA,
  extractImageRefs,
  FENCE_COLUMNS,
  fenceWidthViolations,
  INLINE_CODE_COLUMNS,
  inlineCodeViolations,
  isMainPinnedPath,
  isPublishedReadme,
  PUBLISHED_READMES,
  parseRepoFileUrl,
  pinProblem,
  readmeTextViolations,
  scanMarkdown,
} from '../../scripts/readme-rules.ts';

const SHA = '380e25e826341cebc46c8a844a524542fd1f8337';
const RAW = 'https://raw.githubusercontent.com/ABCrimson/modern-cmdk';

describe('PUBLISHED_READMES', () => {
  it('binds exactly the three published packages, not the root README or the private packages', () => {
    expect([...PUBLISHED_READMES]).toEqual([
      'packages/modern-cmdk/README.md',
      'packages/create-modern-cmdk/README.md',
      'packages/modern-cmdk-codemod/README.md',
    ]);
    expect(isPublishedReadme('README.md')).toBe(false);
    expect(isPublishedReadme('packages/vscode-modern-cmdk/README.md')).toBe(false);
    expect(isPublishedReadme('packages/command-search-wasm/README.md')).toBe(false);
    expect(isPublishedReadme('apps/docs/guide/basic-usage.md')).toBe(false);
  });
});

describe('scanMarkdown', () => {
  it('separates fences from prose and keeps line numbers', () => {
    const md = ['Prose', '```ts', 'const a = 1;', '```', 'After', '~~~sh', 'echo hi', '~~~'].join(
      '\n',
    );
    const scan = scanMarkdown(md);
    expect(scan.fences.map((f) => [f.info, f.line, f.body.map((b) => [b.line, b.text])])).toEqual([
      ['ts', 2, [[3, 'const a = 1;']]],
      ['sh', 6, [[7, 'echo hi']]],
    ]);
    expect(scan.prose.split('\n')).toEqual(['Prose', '', '', '', 'After', '', '', '']);
  });

  it('closes a fence only on its own character at its own length or longer, so a markdown sample nests a fence', () => {
    const md = ['````markdown', '```ts', 'x', '```', '````', 'tail'].join('\n');
    const scan = scanMarkdown(md);
    expect(scan.fences).toHaveLength(1);
    expect(scan.fences[0]?.body.map((b) => b.text)).toEqual(['```ts', 'x', '```']);
    expect(scan.prose.split('\n').at(-1)).toBe('tail');
  });

  it('strips the indent of an indented fence from its body and reads an unclosed fence to the end', () => {
    const md = ['- item', '  ```ts', '  indented', '  ```', '```', 'never closed'].join('\n');
    const scan = scanMarkdown(md);
    expect(scan.fences.map((f) => f.body.map((b) => b.text))).toEqual([
      ['indented'],
      ['never closed'],
    ]);
  });

  it('does not take three backticks around words on one line for a fence', () => {
    expect(scanMarkdown('```code```').fences).toHaveLength(0);
  });
});

describe('fenceWidthViolations', () => {
  it('passes a fence line of exactly 78 characters and counts code points, not UTF-16 units', () => {
    const edge = `${'a'.repeat(FENCE_COLUMNS)}`;
    const boxes = `${'├'.repeat(FENCE_COLUMNS)}`; // one code point each, three UTF-8 bytes
    expect(fenceWidthViolations(['```text', edge, boxes, '```'].join('\n'))).toEqual([]);
    const emoji = '𝒜'.repeat(FENCE_COLUMNS); // two UTF-16 units each
    expect(fenceWidthViolations(['```text', emoji, '```'].join('\n'))).toEqual([]);
  });

  it('fails a fence line of 79 characters in any language, naming its line', () => {
    const wide = 'x'.repeat(FENCE_COLUMNS + 1);
    for (const lang of ['ts', 'tsx', 'sh', 'text', 'diff', 'json', '']) {
      const found = fenceWidthViolations(['intro', `\`\`\`${lang}`, 'ok', wide, '```'].join('\n'));
      expect(
        found.map((v) => v.line),
        lang,
      ).toEqual([4]);
      expect(found[0]?.message).toContain('79 characters');
    }
  });

  it('bites on the 142-character sample line of the 1.7.0 modern-cmdk README', () => {
    const line =
      "    { id: itemId('copy'), value: 'Copy', shortcut: 'Mod+C', onSelect: () => navigator.clipboard.writeText(getSelection()?.toString() ?? '') },";
    const found = fenceWidthViolations(['```ts', line, '```'].join('\n'));
    expect(found).toHaveLength(1);
    expect(found[0]?.message).toContain('142 characters');
  });

  it('ignores prose lines of any width', () => {
    expect(fenceWidthViolations(`${'word '.repeat(80)}\n`)).toEqual([]);
  });
});

describe('inlineCodeViolations', () => {
  it('passes a span of exactly 28 characters, a long span that has a space, and a span inside a fence', () => {
    const edge = 'a'.repeat(INLINE_CODE_COLUMNS);
    expect(inlineCodeViolations(`Use \`${edge}\` here.`)).toEqual([]);
    expect(
      inlineCodeViolations(`Run \`${'npm create modern-cmdk@latest my-palette'}\` now.`),
    ).toEqual([]);
    expect(inlineCodeViolations(['```sh', `\`${'b'.repeat(60)}\``, '```'].join('\n'))).toEqual([]);
  });

  it('fails a span of 29 characters with no space, in prose, a table cell and a <code> element', () => {
    const wide = 'c'.repeat(INLINE_CODE_COLUMNS + 1);
    const md = [
      `Prose with \`${wide}\` inside.`, // 1
      `| \`${wide}\` | cell |`, // 2
      `<summary>About <code>${wide}</code></summary>`, // 3
    ].join('\n');
    expect(inlineCodeViolations(md).map((v) => v.line)).toEqual([1, 2, 3]);
  });

  it('reads a double-backtick span whole and measures an escaped <code> after decoding its entities', () => {
    const md = `\`\`${'d'.repeat(30)}\`\` and <code>&lt;Command.Dialog&gt;</code>`;
    expect(inlineCodeViolations(md)).toHaveLength(1);
  });

  it('bites on the spans of the 1.7.0 modern-cmdk README', () => {
    const md = [
      'Figures come from [`benchmarks/size-history/1.7.0.json`](https://example.test/x).',
      'The selector `[cmdk-item][data-selected="true"]` becomes one attribute.',
      'The notices are written by `scripts/third-party-notices.ts`.',
    ].join('\n');
    expect(inlineCodeViolations(md).map((v) => v.line)).toEqual([1, 2, 3]);
  });
});

describe('readmeTextViolations', () => {
  const wide = `\`\`\`ts\n${'x'.repeat(100)}\n\`\`\``;

  it('applies to a published README and to nothing else', () => {
    expect(readmeTextViolations(wide, 'packages/modern-cmdk/README.md')).toHaveLength(1);
    expect(readmeTextViolations(wide, 'packages/modern-cmdk-codemod/README.md')).toHaveLength(1);
    expect(readmeTextViolations(wide, 'README.md')).toEqual([]);
    expect(readmeTextViolations(wide, 'packages/vscode-modern-cmdk/README.md')).toEqual([]);
    expect(readmeTextViolations(wide, 'apps/docs/guide/getting-started.md')).toEqual([]);
  });

  it('lists the violations in line order', () => {
    const md = [`\`${'e'.repeat(40)}\``, '```', 'f'.repeat(90), '```'].join('\n');
    expect(
      readmeTextViolations(md, 'packages/create-modern-cmdk/README.md').map((v) => v.line),
    ).toEqual([1, 3]);
  });
});

describe('extractImageRefs', () => {
  it('reads an <img>, the URLs of a <source srcset>, and a markdown image, with alt and line', () => {
    const md = [
      '<picture>', // 1
      `  <source media="(prefers-color-scheme: dark)" srcset="${RAW}/${SHA}/a-dark.png">`, // 2
      `  <img src="${RAW}/${SHA}/a-light.png" width="760" alt="A drawing of the palette">`, // 3
      '</picture>', // 4
      `![Second picture](${RAW}/${SHA}/b.png "title")`, // 5
    ].join('\n');
    expect(extractImageRefs(md)).toEqual([
      { tag: 'source', line: 2, url: `${RAW}/${SHA}/a-dark.png`, alt: undefined },
      { tag: 'img', line: 3, url: `${RAW}/${SHA}/a-light.png`, alt: 'A drawing of the palette' },
      { tag: 'markdown', line: 5, url: `${RAW}/${SHA}/b.png`, alt: 'Second picture' },
    ]);
  });

  it('reads an <img> whose attributes span lines or hold a > in the alt, and reports a missing alt as undefined', () => {
    const md = `<img\n  src="x.png"\n  alt="a > b">\n<img src="y.png">`;
    const refs = extractImageRefs(md);
    expect(refs.map((r) => [r.url, r.alt, r.line])).toEqual([
      ['x.png', 'a > b', 1],
      ['y.png', undefined, 4],
    ]);
  });

  it('splits a srcset of several candidates and ignores images shown inside a fence', () => {
    const md = [`<source srcset="a.png 1x, b.png 2x">`, '```html', '<img src="c.png">', '```'].join(
      '\n',
    );
    expect(extractImageRefs(md).map((r) => r.url)).toEqual(['a.png', 'b.png']);
  });
});

describe('parseRepoFileUrl', () => {
  it('splits the raw host and the github.com blob and raw forms into ref and path', () => {
    expect(parseRepoFileUrl(`${RAW}/${SHA}/apps/docs/public/brand/readme/x%20y.png`)).toEqual({
      kind: 'raw',
      ref: SHA,
      path: 'apps/docs/public/brand/readme/x y.png',
    });
    expect(
      parseRepoFileUrl(
        `https://github.com/ABCrimson/modern-cmdk/blob/main/packages/a/CHANGELOG.md#top`,
      ),
    ).toEqual({ kind: 'blob', ref: 'main', path: 'packages/a/CHANGELOG.md' });
    expect(
      parseRepoFileUrl('https://github.com/ABCrimson/modern-cmdk/raw/HEAD/LICENSE?x=1'),
    ).toEqual({
      kind: 'raw',
      ref: 'HEAD',
      path: 'LICENSE',
    });
  });

  it('leaves tree links, routes, other repositories and other hosts alone', () => {
    expect(
      parseRepoFileUrl('https://github.com/ABCrimson/modern-cmdk/tree/main/packages'),
    ).toBeUndefined();
    expect(parseRepoFileUrl('https://github.com/ABCrimson/modern-cmdk/issues/1')).toBeUndefined();
    expect(
      parseRepoFileUrl('https://raw.githubusercontent.com/other/repo/main/x.png'),
    ).toBeUndefined();
    expect(parseRepoFileUrl('https://img.shields.io/npm/v/modern-cmdk')).toBeUndefined();
  });

  it('gives a raw URL with no ref an empty ref', () => {
    expect(parseRepoFileUrl(RAW)).toEqual({ kind: 'raw', ref: '', path: '' });
  });
});

describe('isMainPinnedPath', () => {
  it('lets a CHANGELOG.md and the LICENSE stay on main and nothing else', () => {
    expect(isMainPinnedPath('LICENSE')).toBe(true);
    expect(isMainPinnedPath('CHANGELOG.md')).toBe(true);
    expect(isMainPinnedPath('packages/modern-cmdk/CHANGELOG.md')).toBe(true);
    expect(isMainPinnedPath('apps/docs/public/og-image.svg')).toBe(false);
    expect(isMainPinnedPath('packages/create-modern-cmdk/src/versions.ts')).toBe(false);
    expect(isMainPinnedPath('docs/NOT-A-CHANGELOG.md')).toBe(false);
  });
});

describe('pinProblem', () => {
  it('accepts a full lowercase 40-hex commit', () => {
    expect(pinProblem(SHA)).toBeUndefined();
    expect(COMMIT_SHA.test(SHA)).toBe(true);
  });

  it('names ASSET_COMMIT_PLACEHOLDER and says the release is not ready', () => {
    const problem = pinProblem('ASSET_COMMIT_PLACEHOLDER');
    expect(problem).toContain('ASSET_COMMIT_PLACEHOLDER is still a placeholder');
    expect(problem).toContain('the release is not ready');
  });

  it('also names the spec tokens RECORD_COMMIT and VERSIONS_COMMIT and a bare ASSET_COMMIT', () => {
    for (const token of ['RECORD_COMMIT', 'VERSIONS_COMMIT', 'ASSET_COMMIT']) {
      expect(pinProblem(token), token).toContain(`${token} is still a placeholder`);
    }
  });

  it('rejects main, HEAD, a tag, a branch, a short hash, an uppercase hash and an empty ref', () => {
    for (const ref of [
      'main',
      'HEAD',
      'modern-cmdk@1.7.0',
      'release/1.8.0',
      'b42c483',
      SHA.toUpperCase(),
      `${SHA}0`,
    ]) {
      expect(pinProblem(ref), ref).toContain('is not a full 40-hex commit');
    }
    expect(pinProblem('')).toBe('the URL names no commit');
  });
});

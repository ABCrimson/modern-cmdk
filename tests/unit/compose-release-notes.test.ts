// tests/unit/compose-release-notes.test.ts
// scripts/compose-release-notes.ts: the release body composed from a summary file and a CHANGELOG section, the tag
// helpers that keep modern-cmdk the Latest release, and the post-publish probe of the README images.
// The fixtures are temporary repositories; the 1.7.0 case runs against this repository's real CHANGELOG and size record.

import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  changelogSection,
  compareVersions,
  composeBody,
  composeFromRepository,
  findPackageDir,
  newestTag,
  parsePublished,
  parseVersion,
  previousTag,
  probeImages,
  ReleaseNotesError,
  rawImageUrls,
  sizeLine,
  splitTag,
} from '../../scripts/compose-release-notes.ts';

const root = resolve(import.meta.dirname, '../..');
const script = join(root, 'scripts/compose-release-notes.ts');
type FetchInput = Parameters<typeof fetch>[0];
type FetchInit = Parameters<typeof fetch>[1];
const COMMIT = '380e25e826341cebc46c8a844a524542fd1f8337';
const REPO = 'ABCrimson/modern-cmdk';

const scratch = mkdtempSync(join(tmpdir(), 'compose-release-notes-'));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

const SUMMARY = (name: string, version: string): string =>
  [
    `**Upgrade:** \`npm install ${name}@${version}\` · **Breaking:** none · **Deprecated:** none`,
    '',
    `${name} ${version} fixes one thing.`,
    '',
    '### Before you upgrade',
    '',
    '- Nothing to do.',
    '',
    '### Highlights',
    '',
    '- One fix.',
    '',
  ].join('\n');

function write(path: string, text: string): void {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, text);
}

/** A repository with modern-cmdk 1.7.1, create-modern-cmdk 1.4.1 and the codemod 1.0.2 pending release. */
function fixture(name: string): string {
  const dir = join(scratch, name);
  for (const [pkg, version] of [
    ['modern-cmdk', '1.7.1'],
    ['create-modern-cmdk', '1.4.1'],
    ['modern-cmdk-codemod', '1.0.2'],
  ] as const) {
    write(join(dir, 'packages', pkg, 'package.json'), JSON.stringify({ name: pkg, version }));
    write(
      join(dir, 'packages', pkg, 'CHANGELOG.md'),
      `# ${pkg}\n\n## ${version}\n\n### Patch Changes\n\n- Fixed ${pkg}.\n\n## 1.0.0\n\n- First.\n`,
    );
    write(join(dir, '.github/release-notes', `${pkg}@${version}.md`), SUMMARY(pkg, version));
  }
  write(
    join(dir, 'benchmarks/size-history/1.7.1.json'),
    JSON.stringify({
      entries: [
        { name: 'modern-cmdk (core)', size: 7742 },
        { name: 'modern-cmdk + modern-cmdk/react', size: 12038 },
        { name: 'modern-cmdk/styles.css', size: 3986 },
      ],
    }),
  );
  return dir;
}

const TAGS = [
  'modern-cmdk@1.7.0',
  'modern-cmdk@1.6.0',
  'modern-cmdk@1.7.1',
  'modern-cmdk@2.0.0-rc.1',
  'create-modern-cmdk@1.4.0',
  'modern-cmdk-codemod@1.0.1',
  'v0.8.0',
  '@crimson_dev/command@0.10.0',
];

describe('versions and tags', () => {
  it('parses plain, prerelease and build versions and rejects the rest', () => {
    expect(parseVersion('1.7.0')).toEqual({ major: 1, minor: 7, patch: 0, pre: '' });
    expect(parseVersion('2.0.0-rc.1+build.5')).toEqual({
      major: 2,
      minor: 0,
      patch: 0,
      pre: 'rc.1',
    });
    for (const bad of ['1.7', 'v1.7.0', '1.7.0.1', '', '1.7.x']) {
      expect(parseVersion(bad), bad).toBeUndefined();
    }
  });

  it('orders by number, then a release above its prereleases', () => {
    const v = (s: string): NonNullable<ReturnType<typeof parseVersion>> => parseVersion(s) as never;
    expect(compareVersions(v('1.10.0'), v('1.9.9'))).toBeGreaterThan(0);
    expect(compareVersions(v('1.0.0'), v('1.0.0-rc.1'))).toBeGreaterThan(0);
    expect(compareVersions(v('1.0.0-alpha'), v('1.0.0-beta'))).toBeLessThan(0);
    expect(compareVersions(v('1.0.0'), v('1.0.0'))).toBe(0);
  });

  it('splits a tag at its last @, so a scoped name keeps its own', () => {
    expect(splitTag('modern-cmdk@1.7.0')).toEqual({ name: 'modern-cmdk', version: '1.7.0' });
    expect(splitTag('@crimson_dev/command@0.10.0')).toEqual({
      name: '@crimson_dev/command',
      version: '0.10.0',
    });
    expect(splitTag('v0.8.0')).toBeUndefined();
    expect(splitTag('modern-cmdk@')).toBeUndefined();
  });

  it('B-20: the newest modern-cmdk tag is the highest release, never a satellite or a prerelease', () => {
    expect(newestTag(TAGS, 'modern-cmdk')).toBe('modern-cmdk@1.7.1');
    // modern-cmdk-codemod@1.0.1 and create-modern-cmdk@1.4.0 do not count for the name modern-cmdk.
    expect(
      newestTag(['modern-cmdk-codemod@9.0.0', 'create-modern-cmdk@9.0.0'], 'modern-cmdk'),
    ).toBe(undefined);
    expect(newestTag(['modern-cmdk@10.0.0', 'modern-cmdk@9.9.9'], 'modern-cmdk')).toBe(
      'modern-cmdk@10.0.0',
    );
  });

  it('the previous tag is the highest lower version of the same package', () => {
    expect(previousTag(TAGS, 'modern-cmdk', '1.7.1')).toBe('modern-cmdk@1.7.0');
    expect(previousTag(TAGS, 'modern-cmdk', '1.7.0')).toBe('modern-cmdk@1.6.0');
    expect(previousTag(TAGS, 'modern-cmdk', '1.6.0')).toBeUndefined();
    expect(previousTag(TAGS, 'create-modern-cmdk', '1.4.1')).toBe('create-modern-cmdk@1.4.0');
    expect(previousTag(TAGS, 'modern-cmdk-codemod', '1.0.2')).toBe('modern-cmdk-codemod@1.0.1');
  });
});

describe('changelogSection', () => {
  const changelog =
    '# pkg\r\n\r\n## 1.1.0\r\n\r\n### Minor Changes\r\n\r\n- B.\r\n\r\n## 1.0.0\r\n\r\n- A.\r\n';

  it('returns the body between the version heading and the next one, without either heading', () => {
    expect(changelogSection(changelog, '1.1.0')).toBe('### Minor Changes\n\n- B.');
    expect(changelogSection(changelog, '1.0.0')).toBe('- A.');
  });

  it('is undefined for a version without a section, and does not match a longer version', () => {
    expect(changelogSection(changelog, '1.2.0')).toBeUndefined();
    expect(changelogSection(changelog, '1.1')).toBeUndefined();
    expect(changelogSection('## 1.10.0\n\n- x\n', '1.1.0')).toBeUndefined();
  });
});

describe('composeFromRepository', () => {
  it('modern-cmdk: summary, size line, CHANGELOG in details, footer, in the template order', () => {
    const dir = fixture('modern-cmdk');
    const body = composeFromRepository({
      tag: 'modern-cmdk@1.7.1',
      tags: TAGS,
      commit: COMMIT,
      repo: REPO,
      root: dir,
    });
    const parts = [
      SUMMARY('modern-cmdk', '1.7.1').trim(),
      `**Size:** core 7.7 kB · core + React 12.0 kB · styles 4.0 kB, gzip ([record](https://github.com/${REPO}/blob/${COMMIT}/benchmarks/size-history/1.7.1.json))`,
      '<details>\n<summary>Every change in this release</summary>\n\n### Patch Changes\n\n- Fixed modern-cmdk.\n\n</details>',
      `[Full diff](https://github.com/${REPO}/compare/modern-cmdk@1.7.0...modern-cmdk@1.7.1) · [npm](https://www.npmjs.com/package/modern-cmdk/v/1.7.1) · [Documentation](https://abcrimson.github.io/modern-cmdk/) · [Changelog](https://github.com/${REPO}/blob/main/packages/modern-cmdk/CHANGELOG.md)`,
    ];
    expect(body).toBe(`${parts.join('\n\n')}\n`);
  });

  it('a version with no size record gets no size line', () => {
    const dir = fixture('no-record');
    rmSync(join(dir, 'benchmarks'), { recursive: true });
    const body = composeFromRepository({
      tag: 'modern-cmdk@1.7.1',
      tags: TAGS,
      commit: COMMIT,
      repo: REPO,
      root: dir,
    });
    expect(body).not.toContain('**Size:**');
    expect(body).toContain('<details>');
  });

  it('a satellite body has no size line, even when a record for its version exists', () => {
    const dir = fixture('satellite');
    write(
      join(dir, 'benchmarks/size-history/1.0.2.json'),
      readFileSync(join(dir, 'benchmarks/size-history/1.7.1.json'), 'utf8'),
    );
    const body = composeFromRepository({
      tag: 'modern-cmdk-codemod@1.0.2',
      tags: TAGS,
      commit: COMMIT,
      repo: REPO,
      root: dir,
    });
    expect(body).not.toContain('**Size:**');
    expect(body).toContain('compare/modern-cmdk-codemod@1.0.1...modern-cmdk-codemod@1.0.2');
    expect(body).toContain('packages/modern-cmdk-codemod/CHANGELOG.md');
    expect(body).toContain('https://www.npmjs.com/package/modern-cmdk-codemod/v/1.0.2');
  });

  it('create-modern-cmdk: a Scaffolds line, the modern-cmdk version of the checkout, follows the Upgrade line', () => {
    const dir = fixture('create');
    const body = composeFromRepository({
      tag: 'create-modern-cmdk@1.4.1',
      tags: TAGS,
      commit: COMMIT,
      repo: REPO,
      root: dir,
    });
    const [upgrade, scaffolds, summary] = body.split('\n\n');
    expect(upgrade).toMatch(/^\*\*Upgrade:\*\* `npm install create-modern-cmdk@1.4.1`/);
    expect(scaffolds).toBe('**Scaffolds:** modern-cmdk 1.7.1');
    expect(summary).toBe('create-modern-cmdk 1.4.1 fixes one thing.');
  });

  it('the first release of a package has no Full diff link', () => {
    const dir = fixture('first');
    const body = composeFromRepository({
      tag: 'modern-cmdk-codemod@1.0.2',
      tags: ['modern-cmdk-codemod@1.0.2'],
      commit: COMMIT,
      repo: REPO,
      root: dir,
    });
    expect(body).not.toContain('Full diff');
    expect(body.trimEnd().split('\n').at(-1)).toMatch(
      /^\[npm\]\(.*\) · \[Documentation\]\(.*\) · \[Changelog\]\(.*\)$/,
    );
  });

  it('a release with no summary file fails and names the file', () => {
    const dir = fixture('no-summary');
    rmSync(join(dir, '.github/release-notes/modern-cmdk@1.7.1.md'));
    expect(() =>
      composeFromRepository({
        tag: 'modern-cmdk@1.7.1',
        tags: TAGS,
        commit: COMMIT,
        repo: REPO,
        root: dir,
      }),
    ).toThrow(/\.github\/release-notes\/modern-cmdk@1\.7\.1\.md is missing/);
  });

  it('a release with no CHANGELOG section fails', () => {
    const dir = fixture('no-section');
    write(
      join(dir, 'packages/modern-cmdk/CHANGELOG.md'),
      '# modern-cmdk\n\n## 1.0.0\n\n- First.\n',
    );
    expect(() =>
      composeFromRepository({
        tag: 'modern-cmdk@1.7.1',
        tags: TAGS,
        commit: COMMIT,
        repo: REPO,
        root: dir,
      }),
    ).toThrow(/CHANGELOG\.md has no "## 1\.7\.1" section/);
  });

  it('rejects a summary that does not follow the template', () => {
    const dir = fixture('bad-summary');
    const path = join(dir, '.github/release-notes/modern-cmdk@1.7.1.md');
    const options = { tag: 'modern-cmdk@1.7.1', tags: TAGS, commit: COMMIT, repo: REPO, root: dir };
    write(path, SUMMARY('modern-cmdk', '1.7.1').replace('1.7.1`', '1.7.0`'));
    expect(() => composeFromRepository(options)).toThrow(
      /must start with a paragraph "\*\*Upgrade:\*\*/,
    );
    write(path, SUMMARY('modern-cmdk', '1.7.1').replace('### Highlights', '### Features'));
    expect(() => composeFromRepository(options)).toThrow(/no "### Highlights" heading/);
    write(
      path,
      SUMMARY('modern-cmdk', '1.7.1').replace('### Before you upgrade', 'Before you upgrade'),
    );
    expect(() => composeFromRepository(options)).toThrow(/no "### Before you upgrade" heading/);
  });

  it('rejects a tag that is not <package>@<version>, a short commit and an unknown package', () => {
    const dir = fixture('args');
    const options = { tags: TAGS, commit: COMMIT, repo: REPO, root: dir };
    expect(() => composeFromRepository({ ...options, tag: 'v0.8.0' })).toThrow(ReleaseNotesError);
    expect(() =>
      composeFromRepository({ ...options, tag: 'modern-cmdk@1.7.1', commit: '380e25e' }),
    ).toThrow(/40-hex/);
    expect(() => composeFromRepository({ ...options, tag: 'nonexistent@1.0.0' })).toThrow(
      /no packages\/\*\/package\.json is named nonexistent/,
    );
  });

  it('a size record without one of the three entries fails instead of printing a partial line', () => {
    expect(() =>
      sizeLine({ entries: [{ name: 'modern-cmdk (core)', size: 1 }] }, '1.7.1', REPO, COMMIT),
    ).toThrow(/no entry named "modern-cmdk \+ modern-cmdk\/react"/);
  });

  it('finds a package directory by the name in its manifest', () => {
    const dir = fixture('dirs');
    expect(findPackageDir(dir, 'modern-cmdk-codemod')).toBe('modern-cmdk-codemod');
  });
});

describe('the modern-cmdk 1.7.0 body from this repository', () => {
  // The summary file of the 1.7.0 body in the public-surfaces design (section 10.3), as a person would have written it.
  const summary = [
    '**Upgrade:** `npm install modern-cmdk@1.7.0` · **Breaking:** none (a minor release; five behaviour changes are listed below) · **Deprecated:** `forceId`, `useCommand().isPending`, `setOptimisticActiveId`',
    '',
    'modern-cmdk 1.7.0 specifies and tests how a palette behaves over its lifetime: opening and closing, teardown, item and group ids, and telemetry. Production builds now drop the development-only code. A few of these changes are visible in a working app; read the list below before you upgrade.',
    '',
    '### Before you upgrade',
    '',
    '- `dispose()` is final: a disposed machine ignores every later event. Pause a machine with `suspend()` and `resume()` instead.',
    '',
    '### Highlights',
    '',
    "- A production build drops modern-cmdk's development-only warnings and devtools code.",
    '',
  ].join('\n');

  it('is the summary, the size line of the 1.7.0 record, the whole CHANGELOG section in details and the footer', () => {
    const summaryFile = join(scratch, 'modern-cmdk@1.7.0.md');
    writeFileSync(summaryFile, summary);
    const body = composeFromRepository({
      tag: 'modern-cmdk@1.7.0',
      tags: [
        'modern-cmdk@1.5.0',
        'modern-cmdk@1.6.0',
        'modern-cmdk@1.7.0',
        'modern-cmdk-codemod@1.0.1',
      ],
      commit: COMMIT,
      repo: REPO,
      root,
      summaryFile,
    });
    const changelog = readFileSync(join(root, 'packages/modern-cmdk/CHANGELOG.md'), 'utf8').replace(
      /\r\n/g,
      '\n',
    );
    const section = changelog
      .slice(
        changelog.indexOf('## 1.7.0\n') + '## 1.7.0\n'.length,
        changelog.indexOf('\n## 1.6.0\n'),
      )
      .trim();
    expect(section.startsWith('### Minor Changes')).toBe(true);
    expect(body).toBe(
      `${summary.trim()}\n\n` +
        `**Size:** core 7.7 kB · core + React 12.0 kB · styles 4.0 kB, gzip ([record](https://github.com/ABCrimson/modern-cmdk/blob/${COMMIT}/benchmarks/size-history/1.7.0.json))\n\n` +
        `<details>\n<summary>Every change in this release</summary>\n\n${section}\n\n</details>\n\n` +
        '[Full diff](https://github.com/ABCrimson/modern-cmdk/compare/modern-cmdk@1.6.0...modern-cmdk@1.7.0) · [npm](https://www.npmjs.com/package/modern-cmdk/v/1.7.0) · [Documentation](https://abcrimson.github.io/modern-cmdk/) · [Changelog](https://github.com/ABCrimson/modern-cmdk/blob/main/packages/modern-cmdk/CHANGELOG.md)\n',
    );
  });
});

describe('composeBody', () => {
  it('writes LF line endings from a CRLF summary and ends with one newline', () => {
    const body = composeBody({
      name: 'modern-cmdk-codemod',
      version: '1.0.2',
      dir: 'modern-cmdk-codemod',
      repo: REPO,
      commit: COMMIT,
      summary: SUMMARY('modern-cmdk-codemod', '1.0.2').replace(/\n/g, '\r\n'),
      summaryPath: 'summary.md',
      changelog: '- x',
    });
    expect(body).not.toContain('\r');
    expect(body.endsWith('\n')).toBe(true);
    expect(body.endsWith('\n\n')).toBe(false);
  });
});

describe('compose-release-notes.ts as a command', () => {
  const run = (...args: string[]): { status: number | null; stdout: string; stderr: string } => {
    const result = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
    return { status: result.status, stdout: result.stdout, stderr: result.stderr };
  };

  it('compose --out writes the body and exits 0', () => {
    const dir = fixture('cli-ok');
    const tagsFile = join(scratch, 'cli-ok-tags.txt');
    writeFileSync(tagsFile, `${TAGS.join('\n')}\n`);
    const out = join(scratch, 'cli-ok-body.md');
    const result = run(
      'compose',
      '--tag',
      'modern-cmdk@1.7.1',
      '--tags-file',
      tagsFile,
      '--commit',
      COMMIT,
      '--repo',
      REPO,
      '--root',
      dir,
      '--out',
      out,
    );
    expect(result.status, result.stderr).toBe(0);
    expect(readFileSync(out, 'utf8')).toContain('**Size:** core 7.7 kB');
  });

  it('compose without a summary file exits 1 with an ::error:: line and writes nothing', () => {
    const dir = fixture('cli-missing');
    rmSync(join(dir, '.github/release-notes/modern-cmdk@1.7.1.md'));
    const tagsFile = join(scratch, 'cli-missing-tags.txt');
    writeFileSync(tagsFile, 'modern-cmdk@1.7.0\n');
    const out = join(scratch, 'cli-missing-body.md');
    const result = run(
      'compose',
      '--tag',
      'modern-cmdk@1.7.1',
      '--tags-file',
      tagsFile,
      '--commit',
      COMMIT,
      '--root',
      dir,
      '--out',
      out,
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(
      /^::error::\.github\/release-notes\/modern-cmdk@1\.7\.1\.md is missing/,
    );
    expect(() => readFileSync(out)).toThrow();
  });

  it('newest prints the highest modern-cmdk tag and exits 1 when there is none', () => {
    const tagsFile = join(scratch, 'cli-newest-tags.txt');
    writeFileSync(tagsFile, `${TAGS.join('\r\n')}\r\n`);
    const ok = run('newest', '--package', 'modern-cmdk', '--tags-file', tagsFile);
    expect(ok.status, ok.stderr).toBe(0);
    expect(ok.stdout).toBe('modern-cmdk@1.7.1\n');
    const none = run('newest', '--package', 'nonexistent', '--tags-file', tagsFile);
    expect(none.status).toBe(1);
  });

  it('a missing command, an unknown command and a missing option exit 2', () => {
    expect(run().status).toBe(2);
    expect(run('frobnicate').status).toBe(2);
    expect(run('compose', '--tag', 'modern-cmdk@1.7.1').status).toBe(2);
    expect(run('compose', '--bogus').status).toBe(2);
  });

  it('probe-images with nothing published exits 0 without a request', () => {
    const result = run('probe-images', '--published', '[]');
    expect(result.status, result.stderr).toBe(0);
  });

  it('probe-images exits 1 with an ::error:: line when a probe fails (a packument with no readme)', async () => {
    const server = createServer((_request, response) => {
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ versions: { '1.7.1': {} } }));
    });
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
    try {
      const { port } = server.address() as AddressInfo;
      const child = spawn(
        process.execPath,
        [
          script,
          'probe-images',
          '--registry',
          `http://127.0.0.1:${port}`,
          '--published',
          '[{"name":"modern-cmdk","version":"1.7.1"}]',
        ],
        { stdio: ['ignore', 'ignore', 'pipe'] },
      );
      let stderr = '';
      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });
      const status = await new Promise<number | null>((done) => child.on('close', done));
      expect(status).toBe(1);
      expect(stderr).toMatch(/^::error::modern-cmdk@1\.7\.1: the packument has no readme$/m);
    } finally {
      server.close();
    }
  });
});

describe('rawImageUrls and parsePublished', () => {
  const asset = (file: string): string =>
    `https://raw.githubusercontent.com/${REPO}/${COMMIT}/apps/docs/public/brand/readme/${file}`;

  it('finds markdown images, img src and source srcset, once each, without the closing punctuation', () => {
    const readme = [
      `<picture><source media="(prefers-color-scheme: light)" srcset="${asset('a-light.png')} 2x"><img src="${asset('a-dark.png')}" alt="x"></picture>`,
      `![alt](${asset('b.png')} "title") and ![again](${asset('b.png')}).`,
      `See ${asset('c.png')}, then more. A [link](https://github.com/${REPO}/blob/main/README.md).`,
    ].join('\n');
    expect(rawImageUrls(readme)).toEqual([
      asset('a-light.png'),
      asset('a-dark.png'),
      asset('b.png'),
      asset('c.png'),
    ]);
    expect(rawImageUrls('no images here')).toEqual([]);
  });

  it('parses the changesets published-packages output', () => {
    expect(parsePublished('')).toEqual([]);
    expect(parsePublished('[{"name":"modern-cmdk","version":"1.7.1"}]')).toEqual([
      { name: 'modern-cmdk', version: '1.7.1' },
    ]);
    expect(() => parsePublished('{}')).toThrow(/not a JSON array/);
    expect(() => parsePublished('[{"name":"x"}]')).toThrow(/without a name and a version/);
  });
});

describe('probeImages', () => {
  const asset = (file: string): string =>
    `https://raw.githubusercontent.com/${REPO}/${COMMIT}/${file}`;
  const published = [{ name: 'modern-cmdk', version: '1.7.1' }] as const;

  /** A fetch whose answers come from a table of URL -> statuses (one per attempt); the packument URL answers JSON. */
  function fakeFetch(
    readme: string | undefined,
    images: Readonly<Record<string, readonly number[]>>,
    packumentVersions: readonly (readonly string[])[] = [['1.7.1']],
  ): { fetchImpl: typeof fetch; calls: string[] } {
    const calls: string[] = [];
    const attempts = new Map<string, number>();
    const fetchImpl: typeof fetch = (input: FetchInput) => {
      const url = String(input);
      calls.push(url);
      const n = attempts.get(url) ?? 0;
      attempts.set(url, n + 1);
      if (url === 'https://registry.example/modern-cmdk') {
        const versions = packumentVersions[Math.min(n, packumentVersions.length - 1)] ?? [];
        return Promise.resolve(
          Response.json({
            versions: Object.fromEntries(versions.map((v) => [v, {}])),
            ...(readme === undefined ? {} : { readme }),
          }),
        );
      }
      const statuses = images[url];
      if (statuses === undefined) return Promise.reject(new Error(`unexpected request ${url}`));
      return Promise.resolve(
        new Response(null, { status: statuses[Math.min(n, statuses.length - 1)] ?? 500 }),
      );
    };
    return { fetchImpl, calls };
  }

  const options = (fetchImpl: typeof fetch): Parameters<typeof probeImages>[0] => ({
    published,
    registry: 'https://registry.example',
    fetchImpl,
    sleep: () => Promise.resolve(),
    log: () => undefined,
  });

  it('passes when every image answers 200', async () => {
    const { fetchImpl, calls } = fakeFetch(`![a](${asset('a.png')}) ![b](${asset('b.png')})`, {
      [asset('a.png')]: [200],
      [asset('b.png')]: [200],
    });
    expect(await probeImages(options(fetchImpl))).toEqual([]);
    expect(calls).toEqual(['https://registry.example/modern-cmdk', asset('a.png'), asset('b.png')]);
  });

  it('fails on a 404, and on a redirect, which is not 200 either', async () => {
    const { fetchImpl } = fakeFetch(`${asset('a.png')} ${asset('b.png')}`, {
      [asset('a.png')]: [404],
      [asset('b.png')]: [302],
    });
    const problems = await probeImages(options(fetchImpl));
    expect(problems).toEqual([
      `modern-cmdk@1.7.1: ${asset('a.png')} answered 404, not 200`,
      `modern-cmdk@1.7.1: ${asset('b.png')} answered 302, not 200`,
    ]);
  });

  it('retries a 5xx and a 429 and passes when a later attempt answers 200; a 404 is not retried', async () => {
    const { fetchImpl, calls } = fakeFetch(
      `${asset('a.png')} ${asset('b.png')} ${asset('c.png')}`,
      {
        [asset('a.png')]: [503, 200],
        [asset('b.png')]: [429, 502, 200],
        [asset('c.png')]: [404, 200],
      },
    );
    const problems = await probeImages(options(fetchImpl));
    expect(problems).toEqual([`modern-cmdk@1.7.1: ${asset('c.png')} answered 404, not 200`]);
    expect(calls.filter((u) => u === asset('a.png'))).toHaveLength(2);
    expect(calls.filter((u) => u === asset('b.png'))).toHaveLength(3);
    expect(calls.filter((u) => u === asset('c.png'))).toHaveLength(1);
  });

  it('fails an image that is still 503 after the last attempt', async () => {
    const { fetchImpl, calls } = fakeFetch(asset('a.png'), { [asset('a.png')]: [503] });
    expect(await probeImages(options(fetchImpl))).toEqual([
      `modern-cmdk@1.7.1: ${asset('a.png')} answered 503, not 200`,
    ]);
    expect(calls.filter((u) => u === asset('a.png'))).toHaveLength(3);
  });

  it('waits until the registry lists the version', async () => {
    const { fetchImpl, calls } = fakeFetch(asset('a.png'), { [asset('a.png')]: [200] }, [
      [],
      [],
      ['1.7.0', '1.7.1'],
    ]);
    expect(await probeImages(options(fetchImpl))).toEqual([]);
    expect(calls.filter((u) => u === 'https://registry.example/modern-cmdk')).toHaveLength(3);
  });

  it('fails a version the registry never lists, and a packument without a readme', async () => {
    const never = fakeFetch(asset('a.png'), {}, [['1.7.0']]);
    expect(await probeImages(options(never.fetchImpl))).toEqual([
      'modern-cmdk@1.7.1: the registry did not list the version within 26 minutes; npm can take longer, so re-run this job once https://registry.example/modern-cmdk/1.7.1 answers 200',
    ]);
    const bare = fakeFetch(undefined, {});
    expect(await probeImages(options(bare.fetchImpl))).toEqual([
      'modern-cmdk@1.7.1: the packument has no readme',
    ]);
  });

  it('waits long enough for a registry that lists the version after 20 min 10 s (modern-cmdk 1.5.0)', async () => {
    let clock = 0;
    const fetchImpl: typeof fetch = () =>
      Promise.resolve(
        Response.json({
          versions: clock > 20 * 60_000 + 10_000 ? { '1.7.1': {} } : {},
          readme: '# plain',
        }),
      );
    const problems = await probeImages({
      ...options(fetchImpl),
      sleep: (ms: number) => {
        clock += ms;
        return Promise.resolve();
      },
    });
    expect(problems).toEqual([]);
    expect(clock).toBeGreaterThan(20 * 60_000 + 10_000);
  });

  it('passes with a notice for a readme that holds no raw.githubusercontent.com URL', async () => {
    const lines: string[] = [];
    const { fetchImpl, calls } = fakeFetch('# plain', {});
    const problems = await probeImages({
      ...options(fetchImpl),
      log: (line: string) => void lines.push(line),
    });
    expect(problems).toEqual([]);
    expect(calls).toEqual(['https://registry.example/modern-cmdk']);
    expect(lines).toEqual([
      'modern-cmdk@1.7.1: no raw.githubusercontent.com URL in the readme; nothing to probe',
    ]);
  });

  it('does not follow redirects', async () => {
    const seen: (RequestInit | undefined)[] = [];
    const { fetchImpl } = fakeFetch(asset('a.png'), { [asset('a.png')]: [200] });
    const spy: typeof fetch = (input: FetchInput, init?: FetchInit) => {
      if (String(input) === asset('a.png')) seen.push(init);
      return fetchImpl(input, init);
    };
    await probeImages(options(spy));
    expect(seen).toEqual([{ redirect: 'manual' }]);
  });
});

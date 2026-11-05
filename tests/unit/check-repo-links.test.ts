// tests/unit/check-repo-links.test.ts
// G-39 Ruling 1: the path-aware check of the repository's own github.com blob/, tree/ and raw/ links. The extraction,
// classification, slug and fragment rules are pure; the 'check-repo-links runs' suite spawns the script on a temporary
// git repository (--root) and asserts the exit code, the dead line and the summary counts.

import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { afterAll, describe, expect, it } from 'vitest';
import {
  checkBlobFragment,
  checkLineFragment,
  checkTreeFragment,
  classifyLink,
  extractLinks,
  headingAnchors,
  slugify,
} from '../../scripts/check-repo-links.ts';

const run = promisify(execFile);
const SCRIPT: string = resolve(import.meta.dirname, '../../scripts/check-repo-links.ts');
const BASE = 'https://github.com/ABCrimson/modern-cmdk';

describe('extractLinks', () => {
  it('finds inline, reference-style and angle-bracket autolinks with their line numbers', () => {
    const md = [
      `See [the license](${BASE}/blob/main/LICENSE).`, // 1
      '', // 2
      `Autolink <${BASE}/tree/main/packages/x#readme> here`, // 3
      `[ref]: ${BASE}/issues/1`, // 4
      `Bare ${BASE}/pull/57, then more.`, // 5
      `Wiki https://github.com/ABCrimson/modern-cmdk.wiki.git is not the repository.`, // 6
      `Sibling https://github.com/ABCrimson/modern-cmdk-codemod is another repository.`, // 7
    ].join('\n');
    expect(extractLinks(md)).toEqual([
      { url: `${BASE}/blob/main/LICENSE`, line: 1 },
      { url: `${BASE}/tree/main/packages/x#readme`, line: 3 },
      { url: `${BASE}/issues/1`, line: 4 },
      { url: `${BASE}/pull/57`, line: 5 },
    ]);
  });

  it('reads the bare repository URL with .git and a fragment', () => {
    expect(extractLinks(`<${BASE}.git> and ${BASE}#readme`).map((l) => l.url)).toEqual([
      `${BASE}.git`,
      `${BASE}#readme`,
    ]);
  });
});

describe('classifyLink', () => {
  it('classifies blob, tree and raw links with ref, path and fragment', () => {
    expect(classifyLink(`${BASE}/blob/main/packages/a%20b/x.ts#L3-L4`)).toEqual({
      kind: 'blob',
      ref: 'main',
      path: 'packages/a b/x.ts',
      fragment: 'L3-L4',
    });
    expect(classifyLink(`${BASE}/tree/8eb1557/packages?x=1#readme`)).toEqual({
      kind: 'tree',
      ref: '8eb1557',
      path: 'packages',
      fragment: 'readme',
    });
    expect(classifyLink(`${BASE}/raw/HEAD/LICENSE`)).toEqual({
      kind: 'raw',
      ref: 'HEAD',
      path: 'LICENSE',
      fragment: '',
    });
    expect(classifyLink(`${BASE}/tree/main`)).toMatchObject({
      kind: 'tree',
      ref: 'main',
      path: '',
    });
  });

  it('classifies every other URL as a route with its prefix', () => {
    for (const [url, prefix] of [
      [`${BASE}/issues/12`, '/issues'],
      [`${BASE}/pull/57`, '/pull'],
      [`${BASE}/discussions`, '/discussions'],
      [`${BASE}/actions/runs/1`, '/actions'],
      [`${BASE}/releases/tag/v1`, '/releases'],
      [`${BASE}/security/advisories/new`, '/security'],
      [`${BASE}/compare/a...b`, '/compare'],
      [`${BASE}/commit/abcdef1`, '/commit'],
      [`${BASE}/wiki`, '/wiki'],
      [BASE, '(repository)'],
      [`${BASE}.git`, '(repository)'],
      [`${BASE}#readme`, '(repository)'],
      [`${BASE}/blob`, '/blob'],
    ] as const) {
      expect(classifyLink(url)).toMatchObject({ kind: 'route', prefix });
    }
  });
});

describe('slugify and headingAnchors', () => {
  it("matches GitHub's anchors", () => {
    expect(slugify('Hello, World!')).toBe('hello-world');
    expect(slugify('A & B')).toBe('a--b');
    expect(slugify('`pnpm check` & more_stuff')).toBe('pnpm-check--more_stuff');
    expect(slugify('Getting [started](https://x.dev) now')).toBe('getting-started-now');
    expect(slugify('Über café 2')).toBe('über-café-2');
    expect(slugify('Hyphen-ated')).toBe('hyphen-ated');
    expect(slugify('`<Command.Input>`')).toBe('commandinput');
    expect(slugify('`<Command>` props')).toBe('command-props');
    expect(slugify('Use <kbd>Ctrl</kbd> keys')).toBe('use-ctrl-keys');
    expect(slugify('_Em_ heading')).toBe('em-heading');
    expect(slugify('__init__ hook')).toBe('init-hook');
    expect(slugify('`_x_` y')).toBe('_x_-y');
    expect(slugify('The _id field')).toBe('the-_id-field');
    expect(slugify('Using __dirname')).toBe('using-__dirname');
  });

  it('suffixes duplicates with -1, -2 and skips fenced code', () => {
    const md = [
      '# Usage',
      '## Usage',
      '```',
      '# not a heading',
      '```',
      '### Usage',
      '## Other ##',
    ].join('\n');
    expect(headingAnchors(md)).toEqual(new Set(['usage', 'usage-1', 'usage-2', 'other']));
    expect(headingAnchors('Setup\n-----\n\nTitle\n=====\n\n---\n')).toEqual(
      new Set(['setup', 'title']),
    );
    expect(headingAnchors('---\ntitle: x\n---\n# A\n')).toEqual(new Set(['a']));
    // a soft line break is deleted, not hyphenated (github-slugger regex.js removes \0-\x1F; GitHub renders <h1>Line one<br>Line two</h1>)
    expect(headingAnchors('Line one\nLine two\n===\n')).toEqual(new Set(['line-oneline-two']));
  });
});

describe('fragment rules', () => {
  it('checks #L ranges against the line count', () => {
    expect(checkLineFragment('L3', 5).status).toBe('ok');
    expect(checkLineFragment('L1-L5', 5).status).toBe('ok');
    expect(checkLineFragment('L6', 5).status).toBe('dead');
    expect(checkLineFragment('L2-L9', 5).status).toBe('dead');
    expect(checkLineFragment('L4-L2', 5).status).toBe('dead');
    expect(checkLineFragment('L0', 5).status).toBe('dead');
    expect(checkLineFragment('L1C2-L3C4', 5).status).toBe('unchecked');
  });

  it('checks #readme on a tree link for a README.md in the directory, case-insensitively', () => {
    expect(checkTreeFragment('readme', ['index.ts', 'Readme.md']).status).toBe('ok');
    expect(checkTreeFragment('README', ['readme.md']).status).toBe('ok');
    expect(checkTreeFragment('readme', ['index.ts']).status).toBe('dead');
    expect(checkTreeFragment('other', ['index.ts']).status).toBe('unchecked');
    expect(checkTreeFragment('', ['index.ts']).status).toBe('ok');
  });

  it('checks blob fragments: lines, Markdown anchors, everything else unchecked', () => {
    expect(checkBlobFragment('L2', 'a.ts', 'one\ntwo\n').status).toBe('ok');
    expect(checkBlobFragment('L3', 'a.ts', 'one\ntwo\n').status).toBe('dead');
    expect(checkBlobFragment('usage-1', 'a.md', '# Usage\n# Usage\n').status).toBe('ok');
    expect(checkBlobFragment('nope', 'a.md', '# Usage\n').status).toBe('dead');
    expect(checkBlobFragment('anything', 'a.json', '{}').status).toBe('unchecked');
    expect(checkBlobFragment('', 'a.md', '# Usage').status).toBe('ok');
  });
});

describe('check-repo-links runs', () => {
  const dirs: string[] = [];
  afterAll(async () => {
    await Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true })));
  });

  const git = (cwd: string, ...args: string[]): Promise<{ stdout: string; stderr: string }> =>
    run('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', ...args], { cwd });

  async function scan(root: string): Promise<{ code: number; stdout: string; stderr: string }> {
    try {
      const { stdout, stderr } = await run(process.execPath, [SCRIPT, '--root', root], {
        cwd: root,
      });
      return { code: 0, stdout, stderr };
    } catch (error) {
      const e = error as { code: number; stdout: string; stderr: string };
      return { code: e.code, stdout: e.stdout, stderr: e.stderr };
    }
  }

  it('reports the dead link, counts the rest and exits 1; exits 0 once it is fixed', async () => {
    const root: string = await mkdtemp(join(tmpdir(), 'check-repo-links-'));
    dirs.push(root);
    await git(root, 'init', '-q');
    await mkdir(join(root, 'pkg'));
    await writeFile(join(root, 'pkg/README.md'), '# Pkg\n');
    await writeFile(join(root, 'LICENSE'), 'MIT\n');
    await git(root, 'add', '.');
    await git(root, 'commit', '-q', '-m', 'first');
    const sha: string = (await git(root, 'rev-parse', 'HEAD')).stdout.trim();
    const readme = [
      `[ok](${BASE}/blob/main/LICENSE)`, // 1
      `[dead](${BASE}/blob/main/NOPE.md)`, // 2
      `[dir](${BASE}/tree/main/pkg#readme)`, // 3
      `[sha](${BASE}/blob/${sha}/LICENSE)`, // 4
      `[issues](${BASE}/issues/1)`, // 5
      '',
    ].join('\n');
    await writeFile(join(root, 'README.md'), readme);

    const dead = await scan(root);
    expect(dead.code).toBe(1);
    expect(dead.stderr).toContain(`README.md:2: ${BASE}/blob/main/NOPE.md — `);
    expect(dead.stderr.trim().split('\n')).toHaveLength(1);
    expect(dead.stdout).toContain(
      'check-repo-links: 4 links checked in 2 files, 1 dead, 1 unchecked routes',
    );
    expect(dead.stdout).toContain('/issues');

    await writeFile(join(root, 'README.md'), readme.replace('NOPE.md', 'LICENSE'));
    const ok = await scan(root);
    expect(ok.code).toBe(0);
    expect(ok.stdout).toContain(
      'check-repo-links: 4 links checked in 2 files, 0 dead, 1 unchecked routes',
    );
  });

  it('fetches a branch the clone lacks without turning a full clone shallow', async () => {
    const base: string = await mkdtemp(join(tmpdir(), 'check-repo-links-fetch-'));
    dirs.push(base);
    const a: string = join(base, 'A');
    const b: string = join(base, 'B');
    await mkdir(a);
    await git(a, 'init', '-q');
    await writeFile(join(a, 'LICENSE'), 'MIT\n');
    await git(a, 'add', '.');
    await git(a, 'commit', '-q', '-m', 'first');
    const main: string = (await git(a, 'rev-parse', '--abbrev-ref', 'HEAD')).stdout.trim();
    await git(a, 'checkout', '-q', '-b', 'side');
    await writeFile(join(a, 'side.txt'), 'side\n');
    await git(a, 'add', '.');
    await git(a, 'commit', '-q', '-m', 'side');
    await git(base, 'clone', '-q', '--no-local', '--single-branch', '-b', main, a, b);
    await writeFile(join(b, 'README.md'), `[s](${BASE}/blob/side/side.txt)\n`);

    const result = await scan(b);
    expect(result.code).toBe(0);
    expect((await git(b, 'rev-parse', '--is-shallow-repository')).stdout.trim()).toBe('false');
  });

  it('exits 2 on an unknown flag', async () => {
    const result = await run(process.execPath, [SCRIPT, '--bogus']).then(
      () => 0,
      (e: { code: number }) => e.code,
    );
    expect(result).toBe(2);
  });
});

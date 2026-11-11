// tests/unit/public-surfaces.test.ts
// The drift guard for the public text of the modern-cmdk packages: the one description sentence, the Quick start the
// READMEs share, the figures the records write, the codemod's diffs and options, the create-modern-cmdk fragments, and
// the words and links a published README must not hold. It reads sources only (Markdown, package.json, the fixtures
// and the CLI's own --help from source), so it runs in the plain unit suite without a build.

import { readFileSync } from 'node:fs';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Writable } from 'node:stream';
import { stripVTControlCharacters } from 'node:util';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { run as runCreate } from '../../packages/create-modern-cmdk/src/index.js';
import { run as runCodemod } from '../../packages/modern-cmdk-codemod/src/cli.js';
import { releaseNoteProblems } from '../../scripts/check-release-notes.ts';
import {
  blankComments,
  extractImageRefs,
  isMainPinnedPath,
  linkTargets,
  parseRepoFileUrl,
  pinProblem,
  relativeLinkViolations,
} from '../../scripts/readme-rules.ts';
import {
  type Figures,
  NAMED_RECORD_COMMIT,
  NAMED_VERSIONS_COMMIT,
  readFigures,
  renderReadme,
  TARGETS,
} from '../../scripts/write-readme-figures.ts';
import { readCase } from './codemod-fixtures.ts';

const ROOT: string = resolve(import.meta.dirname, '../..');

/** A repository file as text, with CRLF read as LF (a checkout on Windows may hold either). */
function read(path: string): string {
  return readFileSync(join(ROOT, path), 'utf8').replaceAll('\r\n', '\n');
}

const SENTENCE =
  'Headless command palette engine: a framework-agnostic TypeScript core with fuzzy search, frecency ranking and keyboard shortcuts, plus a React 19 adapter.';

const README_ROOT = 'README.md';
const README_CORE = 'packages/modern-cmdk/README.md';
const README_CREATE = 'packages/create-modern-cmdk/README.md';
const README_CODEMOD = 'packages/modern-cmdk-codemod/README.md';
const PACKAGE_READMES: readonly string[] = [README_CORE, README_CREATE, README_CODEMOD];

/** The first paragraph after the hero `<p align="center">...</p>` block that opens a README. */
function paragraphAfterHero(markdown: string): string {
  const match = /^<p align="center">\n[\s\S]*?\n<\/p>\n\n((?:[^\n]+\n?)+)/.exec(markdown);
  if (match?.[1] === undefined) throw new Error('no paragraph after the hero block');
  return match[1].trimEnd();
}

/** The text of a `## heading` section, up to the next `## ` heading. */
function section(markdown: string, heading: string): string {
  const start: number = markdown.indexOf(`\n## ${heading}\n`);
  if (start === -1) throw new Error(`no "## ${heading}" section`);
  const body: string = markdown.slice(start + 1);
  const next: number = body.indexOf('\n## ', 1);
  return next === -1 ? body : body.slice(0, next);
}

interface Fence {
  readonly info: string;
  readonly code: string;
  /** The first paragraph after the closing fence. */
  readonly after: string;
}

/** The fenced code blocks of a Markdown text, in order. */
function fences(markdown: string): Fence[] {
  const found: Fence[] = [];
  for (const match of markdown.matchAll(/^```([^\n]*)\n([\s\S]*?)\n```$\n*((?:[^\n`]+\n?)*)/gm)) {
    found.push({ info: match[1] ?? '', code: match[2] ?? '', after: (match[3] ?? '').trimEnd() });
  }
  return found;
}

/** The rows of the first table in a text, as lists of cells (the header and separator rows left out). */
function tableRows(markdown: string): string[][] {
  const rows: string[][] = [];
  let inTable = false;
  for (const line of markdown.split('\n')) {
    if (line.startsWith('|')) {
      inTable = true;
      rows.push(
        line
          .replace(/^\||\|$/g, '')
          .split(/(?<!\\)\|/)
          .map((cell) => cell.trim()),
      );
    } else if (inTable) {
      break;
    }
  }
  return rows.slice(2);
}

/** Whether `needle` occurs in `haystack` as a run of consecutive lines. */
function containsRun(haystack: readonly string[], needle: readonly string[]): boolean {
  if (needle.length === 0) return false;
  for (let start = 0; start + needle.length <= haystack.length; start++) {
    if (needle.every((line, index) => haystack[start + index] === line)) return true;
  }
  return false;
}

/** A writable that keeps what it is given. */
function sink(): { stream: NodeJS.WritableStream; text: () => string } {
  const chunks: string[] = [];
  return {
    stream: new Writable({
      write(chunk: Buffer, _encoding: BufferEncoding, done: (error?: Error | null) => void): void {
        chunks.push(chunk.toString());
        done();
      },
    }),
    text: () => stripVTControlCharacters(chunks.join('')),
  };
}

describe('the description sentence', () => {
  it('is the same, byte for byte, in the modern-cmdk manifest, both READMEs and the docs config', () => {
    const manifest = JSON.parse(read('packages/modern-cmdk/package.json')) as {
      description: string;
    };
    const config: string = read('apps/docs/.vitepress/config.ts');
    const constant = /^const description =\n?\s*'([^'\n]*)';$/m.exec(config)?.[1];
    expect(manifest.description).toBe(SENTENCE);
    expect(paragraphAfterHero(read(README_CORE))).toBe(SENTENCE);
    expect(paragraphAfterHero(read(README_ROOT))).toBe(SENTENCE);
    expect(constant).toBe(SENTENCE);
  });

  it('is the first paragraph of the create-modern-cmdk and modern-cmdk-codemod READMEs, as their manifest description', () => {
    for (const [directory, readme] of [
      ['packages/create-modern-cmdk', README_CREATE],
      ['packages/modern-cmdk-codemod', README_CODEMOD],
    ] as const) {
      const manifest = JSON.parse(read(`${directory}/package.json`)) as { description: string };
      expect(manifest.description, directory).toBe(paragraphAfterHero(read(readme)));
    }
  });
});

describe('the Quick start', () => {
  it('holds the same tsx sample and the same paragraph under it in the package README and the root README', () => {
    const quickStart = (path: string): Fence => {
      const sample: Fence | undefined = fences(section(read(path), 'Quick start')).find(
        (fence) => fence.info === 'tsx',
      );
      if (sample === undefined) throw new Error(`${path} has no tsx fence under Quick start`);
      return sample;
    };
    const core: Fence = quickStart(README_CORE);
    const root: Fence = quickStart(README_ROOT);
    expect(root.code).toBe(core.code);
    expect(core.after).not.toBe('');
    expect(root.after).toBe(core.after);
  });
});

describe('the figures', () => {
  it('between the figures markers of every README are what the record writer generates', () => {
    const figures: Figures = readFigures(ROOT);
    for (const { file, kind } of TARGETS) {
      const text: string = read(file);
      // The commit the links name comes from git history, which a plain unit run does not read: the commit the README
      // names stands in, as in `write-readme-figures --check` on a shallow clone, and every other byte is compared.
      const named: RegExp = kind === 'create' ? NAMED_VERSIONS_COMMIT : NAMED_RECORD_COMMIT;
      const sha: string = named.exec(text)?.[1] ?? 'UNSET';
      expect(renderReadme(text, kind, figures, sha), file).toBe(text);
    }
    expect(TARGETS.map((target) => target.file).sort()).toEqual(
      [README_ROOT, README_CORE, README_CREATE].sort(),
    );
  });
});

describe('modern-cmdk-codemod README', () => {
  it('shows, for each transform, a diff whose removed and context lines are a run of the fixture input and whose added and context lines are a run of its output', () => {
    const markdown: string = read(README_CODEMOD);
    const diffs = [
      ...markdown.matchAll(/<!-- fixture: ([\w-]+)\/([\w-]+) -->\n```diff\n([\s\S]*?)\n```/g),
    ];
    expect(fences(markdown).filter((fence) => fence.info === 'diff')).toHaveLength(diffs.length);
    expect(diffs.map((diff) => diff[1]).sort()).toEqual([
      'data-attrs',
      'forward-ref',
      'import-rewrite',
      'should-filter',
    ]);
    for (const [, transform = '', name = '', body = ''] of diffs) {
      const fixture = readCase(transform, name);
      const lines: string[] = body.split('\n');
      const context = (line: string): string => (line.startsWith(' ') ? line.slice(1) : line);
      const before: string[] = lines
        .filter((line) => !line.startsWith('+'))
        .map((line) => (line.startsWith('-') ? line.slice(1) : context(line)));
      const after: string[] = lines
        .filter((line) => !line.startsWith('-'))
        .map((line) => (line.startsWith('+') ? line.slice(1) : context(line)));
      expect(containsRun(fixture.input.split('\n'), before), `${transform}/${name} input`).toBe(
        true,
      );
      expect(containsRun(fixture.output.split('\n'), after), `${transform}/${name} output`).toBe(
        true,
      );
    }
  });

  it('lists in its Options table the options --help lists, in the same order', async () => {
    const out = sink();
    const code: number = await runCodemod(
      ['--help'],
      { stdout: out.stream, stderr: sink().stream },
      {
        loadTransform: async () => ({ default: (): string => '' }),
      },
    );
    expect(code).toBe(0);
    const help: string[] = out.text().split('\n');
    const optionLines: string[] = help.slice(help.indexOf('Options:') + 1);
    const helpOptions: string[] = optionLines
      .slice(0, optionLines.indexOf(''))
      .map((line) => /^ {2}(\S.*?) {2,}\S/.exec(line)?.[1] ?? line);
    const readmeOptions: string[] = tableRows(section(read(README_CODEMOD), 'Options')).map((row) =>
      [...(row[0] ?? '').matchAll(/`([^`]+)`/g)].map((token) => token[1]).join(', '),
    );
    expect(helpOptions.length).toBeGreaterThan(0);
    expect(readmeOptions).toEqual(helpOptions);
  });
});

describe('create-modern-cmdk README', () => {
  const dialogApp: string = read('packages/create-modern-cmdk/templates/react-dialog/src/App.tsx');

  it('begins its tsx fragment as the react-basic template begins src/App.tsx', () => {
    const fragment: Fence | undefined = fences(read(README_CREATE)).find(
      (fence) => fence.info === 'tsx fragment',
    );
    expect(fragment).toBeDefined();
    const app: string = read('packages/create-modern-cmdk/templates/react-basic/src/App.tsx');
    expect(app.startsWith(`${fragment?.code}\n`)).toBe(true);
  });

  it('says the react-dialog template opens on Apple platforms only if that template parses Mod+K', () => {
    const row: string | undefined = read(README_CREATE)
      .split('\n')
      .find((line) => line.startsWith('| `react-dialog`'));
    expect(row).toBeDefined();
    const claimsApple: boolean = row?.includes('on Apple platforms') ?? false;
    const parsesModK: boolean = dialogApp.includes("parseShortcut('Mod+K')");
    // An implication: the row may say it only if the template does it.
    expect(!claimsApple || parsesModK).toBe(true);
  });

  describe('the file count', () => {
    let directory: string;

    beforeAll(async () => {
      vi.stubEnv('MODERN_CMDK_VERSION', '1.9.9');
      vi.stubEnv('npm_config_user_agent', undefined);
      directory = await mkdtemp(join(tmpdir(), 'public-surfaces-'));
    });

    afterAll(async () => {
      vi.unstubAllEnvs();
      await rm(directory, { recursive: true, force: true });
    });

    it('says "writes N files", N being the number of files the scaffolder writes for each template', async () => {
      const stated = /writes (\d+) files/.exec(read(README_CREATE))?.[1];
      expect(stated).toBeDefined();
      for (const template of ['react-basic', 'react-dialog']) {
        const target: string = join(directory, template);
        const code: number = await runCreate([target, `--template=${template}`], {
          stdout: sink().stream,
          stderr: sink().stream,
        });
        expect(code, template).toBe(0);
        const written = (await readdir(target, { recursive: true, withFileTypes: true })).filter(
          (entry) => entry.isFile(),
        );
        expect(String(written.length), template).toBe(stated);
      }
    });
  });
});

describe('the published package READMEs', () => {
  it('pin every image and every repository file link to a commit, except CHANGELOG.md and LICENSE, and use no relative link', () => {
    for (const path of PACKAGE_READMES) {
      const markdown: string = read(path);
      const images = extractImageRefs(markdown);
      expect(images.length, path).toBeGreaterThan(0);
      const problems: string[] = [];
      for (const url of [
        ...images.map((image) => image.url),
        ...linkTargets(markdown).map((link) => link.target),
      ]) {
        const parsed = parseRepoFileUrl(url);
        if (parsed === undefined) continue;
        const problem: string | undefined = pinProblem(parsed.ref);
        if (problem !== undefined && !isMainPinnedPath(parsed.path))
          problems.push(`${url}: ${problem}`);
      }
      expect(problems, path).toEqual([]);
      expect(relativeLinkViolations(markdown), path).toEqual([]);
    }
  });

  it('hold no docs path on main, placeholder commit or promise of a later version', () => {
    const forbidden: readonly RegExp[] = [
      /main\/apps\/docs/,
      /ASSET_COMMIT/,
      /RECORD_COMMIT/,
      /VERSIONS_COMMIT/,
      /planned for/i,
    ];
    for (const path of PACKAGE_READMES) {
      const markdown: string = read(path);
      expect(forbidden.filter((pattern) => pattern.test(markdown)).map(String), path).toEqual([]);
    }
  });

  it('hold no ledger id, workflow id or bare commit hash in the text npm prints', () => {
    for (const path of PACKAGE_READMES) {
      // npm prints no HTML comment, and the codemod README's fixture markers are comments that name fixture cases.
      expect(releaseNoteProblems(blankComments(read(path))), path).toEqual([]);
    }
  });
});

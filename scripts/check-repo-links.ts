// scripts/check-repo-links.ts
// G-39 Ruling 1: a path-aware check of this repository's own github.com blob/, tree/ and raw/ links against the
// checkout. The Links job excludes the repository's own github.com pages from lychee (a GitHub 5xx failed it), which
// left the paths into this repository unchecked; this script closes that gap. Runs with Node's native type stripping,
// needs no build and no install:
//
//   node scripts/check-repo-links.ts [--root <dir>]
//
// Files (default): README.md, packages/*/README.md, CONTRIBUTING.md, SECURITY.md, ARCHITECTURE.md,
// apps/docs/**/*.md (node_modules, cache, dist and .git excluded), CHANGELOG.md, packages/*/CHANGELOG.md and
// .changeset/*.md. --root <dir> scans the *.md files under <dir> (node_modules, cache, dist and .git excluded) instead
// and resolves paths against <dir>.
//
// A link https://github.com/ABCrimson/modern-cmdk/(blob|tree|raw)/<ref>/<path>[#fragment] is checked as follows
// (the ref is the first path segment after blob/tree/raw, so a branch name containing a slash is not supported):
//   - ref `main` or `HEAD`: the path must exist in the working tree (a file for blob and raw, a directory for tree);
//   - any other ref (a hex commit of 7 to 40 characters, a branch or a tag): the ref must resolve to a commit and the
//     path must exist in it. A branch is looked up under refs/remotes/origin and refs/tags before anything is
//     fetched. A ref the local object database still does not know is fetched once with
//     `git fetch --no-tags --end-of-options origin <ref>` and the fetch is announced on stdout; the fetch adds
//     --depth=1 only in a shallow clone, so a full clone stays full. An abbreviated hash cannot be fetched, so the
//     Links job checks out the full history. A ref that is neither a hash nor a plain name (letters, digits, '.',
//     '_' and '-', starting with a letter, digit or '_', with no '..' and no '.lock' ending) is reported dead before
//     any git call, and every git call places `--end-of-options` before the arguments a link supplies, so a crafted
//     link in a pull request's Markdown cannot pass options to git.
//   - a path that leaves the root (`..` segments), whatever the ref, is reported dead before any stat, read or git
//     call; a working-tree path a symbolic link resolves outside the root is reported dead without being read.
//   - fragments: `#readme` on a tree link needs a README.md in that directory (case-insensitive); `#L<n>` and
//     `#L<n>-L<m>` on a blob link need 1 <= n <= m <= the file's line count; any other fragment on a blob link to a
//     .md file must match one of GitHub's heading anchors (lowercase, spaces to hyphens, punctuation other than
//     hyphens and underscores removed, paired underscore emphasis delimiters removed, duplicates suffixed -1, -2);
//     a fragment none of these covers is reported as unchecked, not as dead.
// Every other URL under the repository (issues, pull, discussions, actions, releases, security, compare, commit,
// wiki, the bare repository URL) is a route GitHub serves from repository state, not from the tree: it is counted
// and its distinct prefixes are printed as unchecked.
//
// Output: one stderr line per dead link, `file:line: <url> — <reason>` (a control character a link decodes to is
// printed as a \u{..} escape), then on stdout
// `check-repo-links: N links checked in M files, D dead, U unchecked routes`. Exit codes: 0 = no dead link,
// 1 = a dead link, 2 = usage error.

import { execFile } from 'node:child_process';
import { readdir, readFile, realpath, stat } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { parseArgs, promisify } from 'node:util';

const run = promisify(execFile);
const ROOT: string = resolve(import.meta.dirname, '..');
const SKIP_DIRS: ReadonlySet<string> = new Set(['node_modules', 'cache', 'dist', '.git']);
const REPO_URL = 'https://github.com/ABCrimson/modern-cmdk';
const HEX_REF = /^[0-9a-f]{7,40}$/i;
// A branch or tag name this check accepts: the first URL path segment after blob/tree/raw, so it carries no '/';
// letters, digits, '.', '_' and '-'; never starting with '-' (git would read an option) or '.'; '..' (git's range
// syntax) and a '.lock' ending excluded; '@', '{', '~', '^' and ':' are outside the character set, so git's revision
// syntax cannot appear. Anything else is reported dead before git sees it.
const REF_NAME = /^(?!.*\.\.)(?!.*\.lock$)[A-Za-z0-9_][A-Za-z0-9._-]*$/;

/** Whether a link's ref is a branch or tag name this check hands to git. */
export function isRefName(ref: string): boolean {
  return REF_NAME.test(ref);
}
// Paired underscore emphasis delimiters, as GitHub renders them, removed before slugging; intraword and unpaired underscores are literal text.
const EMPHASIS = /(?<![\p{L}\p{N}_])(_+)(?![\s_])(.+?)(?<![\s_])\1(?![\p{L}\p{N}_])/gu;

export interface ExtractedLink {
  readonly url: string;
  readonly line: number;
}

export type RepoLink =
  | {
      readonly kind: 'blob' | 'tree' | 'raw';
      readonly ref: string;
      readonly path: string;
      readonly fragment: string;
    }
  | { readonly kind: 'route'; readonly prefix: string; readonly fragment: string };

export type Verdict =
  | { readonly status: 'ok' }
  | { readonly status: 'dead'; readonly reason: string }
  | { readonly status: 'unchecked' };

const OK: Verdict = { status: 'ok' };
const UNCHECKED: Verdict = { status: 'unchecked' };
const dead = (reason: string): Verdict => ({ status: 'dead', reason });

/** A line with control, format and line/paragraph-separator characters escaped, so one link stays one output line and a decoded link cannot start a workflow command. */
const printable = (text: string): string =>
  text.replace(
    /[\p{Cc}\p{Cf}\u2028\u2029]/gu,
    (c) => `\\u{${(c.codePointAt(0) ?? 0).toString(16)}}`,
  );

const LINK_PATTERN =
  /https:\/\/github\.com\/ABCrimson\/modern-cmdk(?:\.git)?(?![\w-]|\.\w)(?:[/#?][^\s<>()[\]"'`]*)?/g;

/** Every URL of this repository in the text (inline, reference-style, autolink or bare), with its 1-based line. */
export function extractLinks(markdown: string): ExtractedLink[] {
  const links: ExtractedLink[] = [];
  const lines: string[] = markdown.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    for (const match of (lines[i] ?? '').matchAll(LINK_PATTERN)) {
      links.push({ url: match[0].replace(/[.,;:!?*~]+$/, ''), line: i + 1 });
    }
  }
  return links;
}

function decode(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

/** Splits a URL of this repository into blob/tree/raw (ref, path, fragment) or a route (its first segment). */
export function classifyLink(url: string): RepoLink {
  const rest: string = url.slice(REPO_URL.length).replace(/^\.git(?=[/#?]|$)/, '');
  const hash: number = rest.indexOf('#');
  const fragment: string = hash === -1 ? '' : decode(rest.slice(hash + 1));
  const beforeHash: string = hash === -1 ? rest : rest.slice(0, hash);
  const query: number = beforeHash.indexOf('?');
  const pathname: string = query === -1 ? beforeHash : beforeHash.slice(0, query);
  const segments: string[] = pathname.split('/').filter((s) => s !== '');
  const [first, ref, ...path] = segments;
  if ((first === 'blob' || first === 'tree' || first === 'raw') && ref !== undefined) {
    return { kind: first, ref: decode(ref), path: path.map(decode).join('/'), fragment };
  }
  return { kind: 'route', prefix: first === undefined ? '(repository)' : `/${first}`, fragment };
}

/** The anchor GitHub gives a heading's text (before the -1, -2 suffixes of duplicates); HTML tags and paired underscore emphasis delimiters are removed outside inline code spans only, code-span text stays literal. */
export function slugify(heading: string): string {
  return heading
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .split(/(`+[^`]*`+)/)
    .map((part) => {
      if (part.startsWith('`')) return part.replace(/^`+|`+$/g, '');
      let text: string = part.replace(/<[^>]+>/g, '');
      for (let prev = ''; prev !== text; ) {
        prev = text;
        text = text.replace(EMPHASIS, '$2');
      }
      return text;
    })
    .join('')
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M} _-]/gu, '')
    .replaceAll(' ', '-');
}

/** Every heading anchor of a Markdown text (ATX and setext headings outside fenced code and front matter), duplicates suffixed -1, -2. */
export function headingAnchors(markdown: string): Set<string> {
  const anchors = new Set<string>();
  const seen = new Map<string, number>();
  const add = (text: string): void => {
    const base: string = slugify(text);
    const count: number = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    anchors.add(count === 0 ? base : `${base}-${count}`);
  };
  const lines: string[] = markdown.split(/\r?\n/);
  let start = 0;
  if (lines[0] === '---') {
    const close: number = lines.indexOf('---', 1);
    if (close !== -1) start = close + 1;
  }
  let fence: string | undefined;
  let para: string[] = [];
  for (const line of lines.slice(start)) {
    const marker = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1];
    if (marker !== undefined) {
      if (fence === undefined) fence = marker.slice(0, 1);
      else if (marker.startsWith(fence)) fence = undefined;
      para = [];
      continue;
    }
    if (fence !== undefined) continue;
    const heading = /^ {0,3}#{1,6}[ \t]+(.*?)(?:[ \t]+#+)?[ \t]*$/.exec(line)?.[1];
    if (heading !== undefined) {
      add(heading);
      para = [];
      continue;
    }
    if (line.trim() === '') {
      para = [];
      continue;
    }
    if (
      para.length > 0 &&
      /^ {0,3}(=+|-+)[ \t]*$/.test(line) &&
      !/^ {0,3}(?:[-+*][ \t]|\d+[.)][ \t]|>)/.test(para[0] ?? '')
    ) {
      add(para.map((l) => l.trim()).join('\n'));
      para = [];
      continue;
    }
    para.push(line);
  }
  return anchors;
}

/** `#L<n>` and `#L<n>-L<m>` against the file's line count; any other shape is unchecked. */
export function checkLineFragment(fragment: string, lineCount: number): Verdict {
  const match = /^L(\d+)(?:-L(\d+))?$/.exec(fragment);
  if (!match) return UNCHECKED;
  const from = Number(match[1]);
  const to = match[2] === undefined ? from : Number(match[2]);
  if (from < 1 || to < from || to > lineCount) {
    return dead(`#${fragment} is outside the file's ${lineCount} lines`);
  }
  return OK;
}

/** `#readme` on a tree link needs a README.md among the directory's entries; other fragments are unchecked. */
export function checkTreeFragment(fragment: string, entries: readonly string[]): Verdict {
  if (fragment === '') return OK;
  if (fragment.toLowerCase() !== 'readme') return UNCHECKED;
  return entries.some((e) => e.toLowerCase() === 'readme.md')
    ? OK
    : dead('#readme, but the directory has no README.md');
}

function countLines(text: string): number {
  if (text === '') return 0;
  const lines: number = text.split('\n').length;
  return text.endsWith('\n') ? lines - 1 : lines;
}

/** A blob fragment: line ranges for any file, heading anchors for a .md file, otherwise unchecked. */
export function checkBlobFragment(fragment: string, path: string, text: string): Verdict {
  if (fragment === '') return OK;
  if (/^L\d/.test(fragment)) return checkLineFragment(fragment, countLines(text));
  if (!path.toLowerCase().endsWith('.md')) return UNCHECKED;
  return headingAnchors(text).has(fragment.toLowerCase())
    ? OK
    : dead(`no heading anchor #${fragment} in ${path}`);
}

type Entry =
  | { readonly type: 'file'; readonly text: () => Promise<string> }
  | {
      readonly type: 'dir';
      readonly entries: () => Promise<string[]>;
    };

interface Lookup {
  readonly entry: Entry | undefined;
  readonly reason: string;
}

async function git(root: string, args: readonly string[]): Promise<string | undefined> {
  try {
    const { stdout } = await run('git', [...args], {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    });
    return stdout;
  } catch {
    return undefined;
  }
}

/** Resolves paths of links against the working tree (main, HEAD) or a commit (any other ref). */
class Checkout {
  readonly #root: string;
  readonly #commits = new Map<string, Promise<string | undefined>>();
  readonly notes: string[] = [];
  #shallow: boolean | undefined;

  constructor(root: string) {
    this.#root = root;
  }

  #commit(ref: string): Promise<string | undefined> {
    let commit = this.#commits.get(ref);
    if (commit === undefined) {
      commit = this.#resolve(ref);
      this.#commits.set(ref, commit);
    }
    return commit;
  }

  async #resolve(ref: string): Promise<string | undefined> {
    const verify = (rev: string): Promise<string | undefined> =>
      git(this.#root, ['rev-parse', '--verify', '--quiet', '--end-of-options', `${rev}^{commit}`]);
    for (const candidate of HEX_REF.test(ref)
      ? [ref]
      : [ref, `refs/remotes/origin/${ref}`, `refs/tags/${ref}`]) {
      const known: string | undefined = await verify(candidate);
      if (known !== undefined) return known.trim();
    }
    this.#shallow ??=
      (await git(this.#root, ['rev-parse', '--is-shallow-repository']))?.trim() === 'true';
    const args: string[] = [
      'fetch',
      '--no-tags',
      ...(this.#shallow ? ['--depth=1'] : []),
      '--end-of-options',
      'origin',
      ref,
    ];
    const fetched: string | undefined = await git(this.#root, args);
    this.notes.push(
      `check-repo-links: ${ref} is not in the local object database; ran git ${args.join(' ')} (${fetched === undefined ? 'failed' : 'ok'})`,
    );
    if (fetched === undefined) return undefined;
    return (await verify('FETCH_HEAD'))?.trim();
  }

  async lookup(ref: string, path: string): Promise<Lookup> {
    const rel: string = relative(this.#root, join(this.#root, path));
    if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
      return { entry: undefined, reason: `${path} leaves the repository` };
    }
    if (ref === 'main' || ref === 'HEAD') return this.#inWorkingTree(path);
    if (!HEX_REF.test(ref) && !isRefName(ref)) {
      return {
        entry: undefined,
        reason: `${ref} is not a ref this check accepts (main, HEAD, a hex hash of 7 to 40 characters, or a branch or tag name of letters, digits, '.', '_' and '-' that starts with a letter, digit or '_', has no '..' and does not end in '.lock')`,
      };
    }
    return this.#inCommit(ref, path);
  }

  async #inWorkingTree(path: string): Promise<Lookup> {
    const full: string = join(this.#root, path);
    const real: string | undefined = await realpath(full).catch(() => undefined);
    if (real === undefined) {
      return { entry: undefined, reason: `${path || '.'} does not exist in the working tree` };
    }
    const realRel: string = relative(await realpath(this.#root), real);
    if (realRel === '..' || realRel.startsWith(`..${sep}`) || isAbsolute(realRel)) {
      return { entry: undefined, reason: `${path} leaves the repository through a symbolic link` };
    }
    const info = await stat(real);
    if (info.isDirectory()) {
      return {
        entry: { type: 'dir', entries: (): Promise<string[]> => readdir(real) },
        reason: '',
      };
    }
    return {
      entry: { type: 'file', text: (): Promise<string> => readFile(real, 'utf8') },
      reason: '',
    };
  }

  async #inCommit(ref: string, path: string): Promise<Lookup> {
    const commit: string | undefined = await this.#commit(ref);
    if (commit === undefined) {
      return {
        entry: undefined,
        reason: `ref ${ref}${HEX_REF.test(ref) ? '' : ' (a branch or tag)'} is not a commit here and could not be fetched`,
      };
    }
    const spec = `${commit}:./${path}`;
    const type: string | undefined = (
      await git(this.#root, ['cat-file', '-t', '--end-of-options', spec])
    )?.trim();
    if (type === 'blob') {
      return {
        entry: {
          type: 'file',
          text: async (): Promise<string> =>
            (await git(this.#root, ['cat-file', 'blob', '--end-of-options', spec])) ?? '',
        },
        reason: '',
      };
    }
    if (type === 'tree') {
      return {
        entry: {
          type: 'dir',
          entries: async (): Promise<string[]> =>
            ((await git(this.#root, ['ls-tree', '--name-only', '--end-of-options', spec])) ?? '')
              .split('\n')
              .filter((n) => n !== ''),
        },
        reason: '',
      };
    }
    return { entry: undefined, reason: `${path || '.'} does not exist at ${ref}` };
  }
}

/** The verdict for one blob, tree or raw link. */
async function checkLink(
  checkout: Checkout,
  link: Extract<RepoLink, { kind: 'blob' | 'tree' | 'raw' }>,
): Promise<Verdict> {
  const { entry, reason } = await checkout.lookup(link.ref, link.path);
  if (entry === undefined) return dead(reason);
  if (link.kind === 'tree') {
    if (entry.type !== 'dir') return dead(`${link.path} is a file, a tree link needs a directory`);
    return checkTreeFragment(link.fragment, await entry.entries());
  }
  if (entry.type !== 'file') {
    return dead(`${link.path || '.'} is a directory, a ${link.kind} link needs a file`);
  }
  if (link.kind === 'raw' || link.fragment === '') return link.fragment === '' ? OK : UNCHECKED;
  return checkBlobFragment(link.fragment, link.path, await entry.text());
}

async function collectMarkdown(dir: string, into: string[]): Promise<void> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) await collectMarkdown(join(dir, entry.name), into);
    } else if (entry.name.endsWith('.md')) {
      into.push(join(dir, entry.name));
    }
  }
}

async function exists(path: string): Promise<boolean> {
  return (await stat(path).catch(() => undefined))?.isFile() === true;
}

async function defaultFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  const candidates: string[] = [
    'README.md',
    'CONTRIBUTING.md',
    'SECURITY.md',
    'ARCHITECTURE.md',
    'CHANGELOG.md',
  ];
  const packages: string[] = await readdir(join(root, 'packages')).catch(() => []);
  for (const name of packages) {
    candidates.push(`packages/${name}/README.md`, `packages/${name}/CHANGELOG.md`);
  }
  for (const file of candidates) {
    if (await exists(join(root, file))) files.push(join(root, file));
  }
  const changesets: string[] = await readdir(join(root, '.changeset')).catch(() => []);
  for (const name of changesets.filter((n) => n.endsWith('.md'))) {
    files.push(join(root, '.changeset', name));
  }
  await collectMarkdown(join(root, 'apps/docs'), files).catch(() => undefined);
  return files;
}

async function main(): Promise<number> {
  let values: { root?: string | undefined };
  try {
    ({ values } = parseArgs({ options: { root: { type: 'string' } }, strict: true }));
  } catch (error) {
    process.stderr.write(
      `check-repo-links: ${(error as Error).message}\nusage: node scripts/check-repo-links.ts [--root <dir>]\n`,
    );
    return 2;
  }
  const root: string = values.root === undefined ? ROOT : resolve(values.root);
  if (!(await stat(root).catch(() => undefined))?.isDirectory()) {
    process.stderr.write(`check-repo-links: --root is not a directory (got ${root})
`);
    return 2;
  }
  let files: string[];
  if (values.root === undefined) {
    files = await defaultFiles(root);
  } else {
    files = [];
    await collectMarkdown(root, files);
  }

  const checkout = new Checkout(root);
  const prefixes = new Set<string>();
  const deadLines: string[] = [];
  const uncheckedLines: string[] = [];
  let checked = 0;
  let routes = 0;
  for (const file of files) {
    const page: string = relative(root, file).split(sep).join('/');
    for (const { url, line } of extractLinks(await readFile(file, 'utf8'))) {
      const link: RepoLink = classifyLink(url);
      if (link.kind === 'route') {
        routes++;
        prefixes.add(link.prefix);
        continue;
      }
      checked++;
      const verdict: Verdict = await checkLink(checkout, link);
      if (verdict.status === 'dead') {
        deadLines.push(printable(`${page}:${line}: ${url} — ${verdict.reason}`));
      } else if (verdict.status === 'unchecked') {
        uncheckedLines.push(
          printable(
            `${page}:${line}: ${url} — fragment #${link.fragment} is not covered by a rule`,
          ),
        );
      }
    }
  }

  for (const note of checkout.notes) process.stdout.write(`${note}\n`);
  for (const line of uncheckedLines) process.stdout.write(`unchecked: ${line}\n`);
  if (routes > 0) {
    process.stdout.write(`unchecked routes: ${[...prefixes].sort().join(' ')}\n`);
  }
  if (deadLines.length > 0) process.stderr.write(`${deadLines.join('\n')}\n`);
  process.stdout.write(
    `check-repo-links: ${checked} links checked in ${files.length} files, ${deadLines.length} dead, ${routes} unchecked routes\n`,
  );
  return deadLines.length > 0 ? 1 : 0;
}

if (import.meta.main) process.exitCode = await main();

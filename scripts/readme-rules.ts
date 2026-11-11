// scripts/readme-rules.ts
// The rules about the published READMEs that more than one gate applies, as pure functions on Markdown text: which
// pages they bind, a fence-aware scan, the 78-column fence rule, the 28-character unbreakable inline-code rule,
// the extraction of image references and link targets, the spelling of this repository's own URLs, and the shape of a
// pinned (commit) reference. scripts/check-doc-samples.ts (code lines and inline code), scripts/check-repo-links.ts
// (pinned references, their ancestry, the spelling of the repository URL and relative links) and
// scripts/check-package.ts (alt text, the image file at its commit and the spelling of the repository URL) import it;
// none of them is a library.
//
// Why these rules: npm prints a README in a 763 px column (343 px on a phone) in Fira Mono at 16.2 px, so a code
// line over 78 characters scrolls sideways and an inline code span with no space in it that is longer than 28
// characters pushes the page wider than the phone (measured on npmjs.com in November 2026). npm also prints a README
// frozen at its version, so a relative link or a `main` reference in it shows whatever the repository holds later.

/** The READMEs npm prints: the three published packages. The private packages and the root README are not bound. */
export const PUBLISHED_READMES: readonly string[] = [
  'packages/modern-cmdk/README.md',
  'packages/create-modern-cmdk/README.md',
  'packages/modern-cmdk-codemod/README.md',
];

/** The widest fence line, in characters, that fits npm's code block without a horizontal scrollbar. */
export const FENCE_COLUMNS = 78;
/** The longest inline code span without a space that the rule lets through. */
export const INLINE_CODE_COLUMNS = 28;

/** Whether a repository-relative page (forward slashes) is one of the published READMEs. */
export function isPublishedReadme(page: string): boolean {
  return PUBLISHED_READMES.includes(page);
}

export interface FenceBlock {
  readonly info: string;
  /** The 1-based line of the opening fence. */
  readonly line: number;
  /** The body lines, the fence's own indent removed, with their 1-based line numbers. */
  readonly body: readonly { readonly line: number; readonly text: string }[];
}

export interface MarkdownScan {
  readonly fences: readonly FenceBlock[];
  /** The text with every fence line (fence markers and bodies) blanked, so offsets map to the original lines. */
  readonly prose: string;
}

export interface Violation {
  readonly line: number;
  readonly message: string;
}

const FENCE_OPEN = /^(\s*)(`{3,}|~{3,})\s*(.*)$/;

/** Splits Markdown into fenced code blocks and the prose around them (a fence closes on its own character at its own length or longer). */
export function scanMarkdown(markdown: string): MarkdownScan {
  const lines: string[] = markdown.split(/\r?\n/);
  const fences: FenceBlock[] = [];
  const prose: string[] = [];
  let open:
    | {
        indent: string;
        char: string;
        length: number;
        info: string;
        line: number;
        body: { line: number; text: string }[];
      }
    | undefined;
  for (const [index, text] of lines.entries()) {
    const lineNumber: number = index + 1;
    if (open !== undefined) {
      prose.push('');
      const closing = /^\s*(`+|~+)\s*$/.exec(text)?.[1];
      if (closing !== undefined && closing[0] === open.char && closing.length >= open.length) {
        fences.push({ info: open.info, line: open.line, body: open.body });
        open = undefined;
      } else {
        open.body.push({
          line: lineNumber,
          text: text.startsWith(open.indent) ? text.slice(open.indent.length) : text,
        });
      }
      continue;
    }
    const match = FENCE_OPEN.exec(text);
    const marker: string = match?.[2] ?? '';
    // An info string of a backtick fence holds no backtick: ```code``` on one line is an inline span, not a fence.
    if (match !== null && !(marker.startsWith('`') && (match[3] ?? '').includes('`'))) {
      open = {
        indent: match[1] ?? '',
        char: marker.slice(0, 1),
        length: marker.length,
        info: (match[3] ?? '').trim(),
        line: lineNumber,
        body: [],
      };
      prose.push('');
      continue;
    }
    prose.push(text);
  }
  if (open !== undefined) fences.push({ info: open.info, line: open.line, body: open.body });
  return { fences, prose: prose.join('\n') };
}

/** The width of a line in monospace columns: one per code point, a tab to the next multiple of 8. */
function columns(text: string): number {
  let width = 0;
  for (const char of text) width += char === '\t' ? 8 - (width % 8) : 1;
  return width;
}

/** Blanks every HTML comment (npm does not print one), keeping the newlines so offsets and lines map to the original. */
export function blankComments(text: string): string {
  return text.replace(/<!--[\s\S]*?-->/g, (span) => span.replace(/[^\n]/g, ' '));
}

/** The prose of a Markdown text for the extractions below: fences blanked, then HTML comments blanked. */
function proseOf(markdown: string): string {
  return blankComments(scanMarkdown(markdown).prose);
}

/** Every fence line (any language, `text` and `sh` included) wider than FENCE_COLUMNS. */
export function fenceWidthViolations(markdown: string): Violation[] {
  const violations: Violation[] = [];
  for (const fence of scanMarkdown(markdown).fences) {
    for (const { line, text } of fence.body) {
      const width: number = columns(text);
      if (width > FENCE_COLUMNS) {
        violations.push({
          line,
          message: `fence line is ${width} characters, the limit is ${FENCE_COLUMNS} (npm's code block scrolls sideways past it)`,
        });
      }
    }
  }
  return violations;
}

const CODE_SPAN = /(?<!`)(`+)(?!`)(.+?)(?<!`)\1(?!`)/g;
const CODE_ELEMENT = /<code>(.*?)<\/code>/gi;

function decodeEntities(text: string): string {
  return text
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&amp;', '&');
}

/** Every inline code span (a backtick span or a <code> element) with no whitespace in it that is longer than INLINE_CODE_COLUMNS: the browser cannot wrap it. */
export function inlineCodeViolations(markdown: string): Violation[] {
  const violations: Violation[] = [];
  for (const [index, text] of scanMarkdown(markdown).prose.split('\n').entries()) {
    const spans: string[] = [
      ...Array.from(text.matchAll(CODE_SPAN), (m) => (m[2] ?? '').trim()),
      ...Array.from(text.matchAll(CODE_ELEMENT), (m) => decodeEntities(m[1] ?? '').trim()),
    ];
    for (const span of spans) {
      const width: number = columns(span);
      if (width > INLINE_CODE_COLUMNS && !/\s/.test(span)) {
        violations.push({
          line: index + 1,
          message: `inline code \`${span}\` is ${width} characters with no space to wrap at, the limit is ${INLINE_CODE_COLUMNS}`,
        });
      }
    }
  }
  return violations;
}

const LIST_MARKER = /^ {0,3}(?:[-+*]|\d{1,9}[.)])(?:[ \t]|$)/;
const PRE_ELEMENT = /<pre\b[^>]*>([\s\S]*?)<\/pre>/dgi;

/** Every line of an indented (four-space or tab) code block outside a list that is wider than FENCE_COLUMNS, the block's own four columns of indent not counted. */
export function indentedCodeViolations(markdown: string): Violation[] {
  const violations: Violation[] = [];
  let inList = false;
  let afterBlank = true;
  let inBlock = false;
  for (const [index, text] of proseOf(markdown).split('\n').entries()) {
    if (text.trim() === '') {
      afterBlank = true;
      continue;
    }
    const indent: number = columns(/^[ \t]*/.exec(text)?.[0] ?? '');
    if (indent >= 4 && !inList && (afterBlank || inBlock)) {
      inBlock = true;
      const width: number = columns(text) - 4;
      if (width > FENCE_COLUMNS) {
        violations.push({
          line: index + 1,
          message: `indented code line is ${width} characters, the limit is ${FENCE_COLUMNS} (npm's code block scrolls sideways past it)`,
        });
      }
    } else {
      inBlock = false;
      if (indent < 4 && LIST_MARKER.test(text)) inList = true;
      else if (afterBlank && indent < 2) inList = false;
    }
    afterBlank = false;
  }
  return violations;
}

/** Every line of a <pre> element, outside fences, wider than FENCE_COLUMNS (the entities decoded, a <code> wrapper not counted). */
export function preWidthViolations(markdown: string): Violation[] {
  const violations: Violation[] = [];
  const prose: string = proseOf(markdown);
  for (const match of prose.matchAll(PRE_ELEMENT)) {
    const start: number = match.indices?.[1]?.[0] ?? match.index;
    const lines: string[] = (match[1] ?? '').split('\n');
    for (const [offset, raw] of lines.entries()) {
      let text: string = raw;
      if (offset === 0) text = text.replace(/^[ \t]*<code\b[^>]*>/i, '');
      if (offset === lines.length - 1) text = text.replace(/<\/code>[ \t]*$/i, '');
      const width: number = columns(decodeEntities(text.replace(/\r$/, '')));
      if (width > FENCE_COLUMNS) {
        violations.push({
          line: lineOf(prose, start) + offset,
          message: `<pre> line is ${width} characters, the limit is ${FENCE_COLUMNS} (npm's code block scrolls sideways past it)`,
        });
      }
    }
  }
  return violations;
}

/** The text rules (fence, indented code, <pre> and inline code), for a page that is a published README; any other page has none. */
export function readmeTextViolations(markdown: string, page: string): Violation[] {
  if (!isPublishedReadme(page)) return [];
  return [
    ...fenceWidthViolations(markdown),
    ...indentedCodeViolations(markdown),
    ...preWidthViolations(markdown),
    ...inlineCodeViolations(markdown),
  ].sort((a, b) => a.line - b.line);
}

export interface ImageRef {
  /** `img` and `markdown` carry alt text; `source` is a <picture> source (its srcset URLs). */
  readonly tag: 'img' | 'source' | 'markdown';
  readonly line: number;
  readonly url: string;
  /** undefined: the attribute is absent. */
  readonly alt: string | undefined;
}

const IMG_TAG = /<img\b((?:[^>"']|"[^"]*"|'[^']*')*)>/gi;
const SOURCE_TAG = /<source\b((?:[^>"']|"[^"]*"|'[^']*')*)>/gi;
const MARKDOWN_IMAGE = /!\[([^\]]*)\]\(\s*<?([^)\s>]+)>?(?:\s+(?:"[^"]*"|'[^']*'))?\s*\)/g;
const ATTRIBUTE = /([^\s=/]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;

function attributes(source: string): Map<string, string> {
  const found = new Map<string, string>();
  for (const match of source.matchAll(ATTRIBUTE)) {
    found.set(
      (match[1] ?? '').toLowerCase(),
      decodeEntities(match[2] ?? match[3] ?? match[4] ?? ''),
    );
  }
  return found;
}

function lineOf(text: string, index: number): number {
  let line = 1;
  for (let i = text.indexOf('\n'); i !== -1 && i < index; i = text.indexOf('\n', i + 1)) line++;
  return line;
}

const REFERENCE_DEFINITION = /^ {0,3}\[(?!\^)([^\]]+)\]:[ \t]*(?:\r?\n[ \t]*)?<?([^\s>]+)>?/gm;
const FULL_REFERENCE_IMAGE = /!\[([^\]]*)\]\[([^\]]*)\]/g;
const SHORTCUT_REFERENCE_IMAGE = /!\[([^\]]+)\](?![[(])/g;

const labelKey = (label: string): string => label.trim().replace(/\s+/g, ' ').toLowerCase();

/** The link reference definitions `[label]: target` of the prose (a footnote `[^1]:` is not one), by their normalized label; the first definition of a label wins. */
function referenceDefinitions(prose: string): Map<string, { url: string; line: number }> {
  const found = new Map<string, { url: string; line: number }>();
  for (const match of prose.matchAll(REFERENCE_DEFINITION)) {
    const key: string = labelKey(match[1] ?? '');
    if (!found.has(key)) found.set(key, { url: match[2] ?? '', line: lineOf(prose, match.index) });
  }
  return found;
}

/**
 * Every image a README shows outside its fences and its HTML comments: <img>, the URLs of <source srcset>, and the
 * three Markdown forms ![alt](url), ![alt][label] / ![alt][] and ![label], the reference forms resolved against their
 * `[label]: url` definitions (a label with no definition has an empty url, which means the image has no src).
 */
export function extractImageRefs(markdown: string): ImageRef[] {
  const prose: string = proseOf(markdown);
  const definitions = referenceDefinitions(prose);
  const refs: ImageRef[] = [];
  for (const match of prose.matchAll(IMG_TAG)) {
    const attrs = attributes(match[1] ?? '');
    refs.push({
      tag: 'img',
      line: lineOf(prose, match.index),
      url: attrs.get('src') ?? '',
      alt: attrs.get('alt'),
    });
  }
  for (const match of prose.matchAll(SOURCE_TAG)) {
    const srcset: string = attributes(match[1] ?? '').get('srcset') ?? '';
    for (const candidate of srcset.split(',')) {
      const url: string | undefined = candidate.trim().split(/\s+/)[0];
      if (url) refs.push({ tag: 'source', line: lineOf(prose, match.index), url, alt: undefined });
    }
  }
  for (const match of prose.matchAll(MARKDOWN_IMAGE)) {
    refs.push({
      tag: 'markdown',
      line: lineOf(prose, match.index),
      url: match[2] ?? '',
      alt: match[1] ?? '',
    });
  }
  for (const match of prose.matchAll(FULL_REFERENCE_IMAGE)) {
    const alt: string = match[1] ?? '';
    const label: string = (match[2] ?? '').trim() === '' ? alt : (match[2] ?? '');
    refs.push({
      tag: 'markdown',
      line: lineOf(prose, match.index),
      url: definitions.get(labelKey(label))?.url ?? '',
      alt,
    });
  }
  for (const match of prose.matchAll(SHORTCUT_REFERENCE_IMAGE)) {
    const alt: string = match[1] ?? '';
    refs.push({
      tag: 'markdown',
      line: lineOf(prose, match.index),
      url: definitions.get(labelKey(alt))?.url ?? '',
      alt,
    });
  }
  return refs.sort((a, b) => a.line - b.line);
}

const INLINE_LINK = /\]\(\s*<?([^)\s>]*)>?(?:\s+(?:"[^"]*"|'[^']*'))?\s*\)/g;
const A_TAG = /<a\b((?:[^>"']|"[^"]*"|'[^']*')*)>/gi;

/** A link target a README names, with its 1-based line. */
export interface LinkTarget {
  readonly line: number;
  readonly target: string;
}

/**
 * Every target of a link or image outside the fences, the inline code spans and the HTML comments: `](target)`, the
 * `[label]: target` definitions, and the href of <a>, the src of <img> and the srcset of <img> and <source>.
 */
export function linkTargets(markdown: string): LinkTarget[] {
  const prose: string = proseOf(markdown).replace(CODE_SPAN, (span) => ' '.repeat(span.length));
  const targets: LinkTarget[] = [];
  for (const match of prose.matchAll(INLINE_LINK)) {
    targets.push({ line: lineOf(prose, match.index), target: match[1] ?? '' });
  }
  for (const match of prose.matchAll(REFERENCE_DEFINITION)) {
    targets.push({ line: lineOf(prose, match.index), target: match[2] ?? '' });
  }
  for (const [pattern, attribute] of [
    [A_TAG, 'href'],
    [IMG_TAG, 'src'],
    [IMG_TAG, 'srcset'],
    [SOURCE_TAG, 'srcset'],
  ] as const) {
    for (const match of prose.matchAll(pattern)) {
      const value: string = attributes(match[1] ?? '').get(attribute) ?? '';
      const candidates: string[] =
        attribute === 'srcset'
          ? value.split(',').map((c) => c.trim().split(/\s+/)[0] ?? '')
          : [value];
      for (const target of candidates.filter((c) => c !== '')) {
        targets.push({ line: lineOf(prose, match.index), target });
      }
    }
  }
  return targets.sort((a, b) => a.line - b.line);
}

/** Why a link target cannot appear in a published README, or undefined: a target with no scheme that is not a `#` fragment or a `//` host is relative, and npm resolves it against the HEAD of main. */
export function relativeLinkProblem(target: string): string | undefined {
  if (target === '' || target.startsWith('#') || target.startsWith('//')) return undefined;
  if (/^[a-z][a-z0-9+.-]*:/i.test(target)) return undefined;
  return `a relative link, which npm resolves to the HEAD of main; name ${REPO_HOST}/blob/<40-hex commit>/<path> (CHANGELOG.md, LICENSE and tree/ links may use main)`;
}

/** The relative links of a published README, one violation per target. */
export function relativeLinkViolations(markdown: string): Violation[] {
  return linkTargets(markdown).flatMap(({ line, target }) => {
    const problem: string | undefined = relativeLinkProblem(target);
    return problem === undefined ? [] : [{ line, message: `${target} is ${problem}` }];
  });
}

/** A file of this repository addressed by a raw or blob URL at some ref. */
export interface RepoFileUrl {
  readonly kind: 'raw' | 'blob';
  readonly ref: string;
  readonly path: string;
}

const RAW_HOST = 'https://raw.githubusercontent.com/ABCrimson/modern-cmdk';
const REPO_HOST = 'https://github.com/ABCrimson/modern-cmdk';
/** The raw.githubusercontent.com URLs of this repository, as a pattern over running text (a srcset or attribute ends the URL at a quote or space). */
export const RAW_URL_PATTERN =
  /https:\/\/raw\.githubusercontent\.com\/ABCrimson\/modern-cmdk(?:[/#?][^\s<>()[\]"'`]*)?/g;

/** Why a URL of this repository spelled another way is refused in a published README. */
export const SPELLING_PROBLEM = `write the repository as ${RAW_HOST} or ${REPO_HOST} (another spelling of the URL escapes the pin check)`;

/**
 * This repository's raw.githubusercontent.com and github.com URL in any spelling (any letter case, http, www.,
 * a trailing .git): the host serves `raw.githubusercontent.com/abcrimson/modern-cmdk/main/...` with HTTP 200, so a
 * case variant would otherwise slip past the checks that read the canonical spelling.
 */
export const REPO_URL_ANY_CASE =
  /https?:\/\/(?:raw\.githubusercontent\.com|(?:www\.)?github\.com)\/abcrimson\/modern-cmdk(?:\.git)?(?![\w-]|\.\w)/gi;

/** Every URL of this repository in a published README that is not spelled exactly `https://raw.githubusercontent.com/ABCrimson/modern-cmdk` or `https://github.com/ABCrimson/modern-cmdk` (a trailing .git is allowed); fences are read too, HTML comments are not. */
export function repoUrlSpellingViolations(markdown: string): (Violation & { url: string })[] {
  const text: string = blankComments(markdown);
  const found: (Violation & { url: string })[] = [];
  for (const match of text.matchAll(REPO_URL_ANY_CASE)) {
    const url: string = match[0];
    const bare: string = url.replace(/\.git$/, '');
    if (bare === RAW_HOST || bare === REPO_HOST) continue;
    found.push({ line: lineOf(text, match.index), url, message: `${url}: ${SPELLING_PROBLEM}` });
  }
  return found;
}

function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/** Splits `https://raw.githubusercontent.com/ABCrimson/modern-cmdk/<ref>/<path>` and `https://github.com/ABCrimson/modern-cmdk/(blob|raw)/<ref>/<path>` into ref and path; any other URL is undefined. A raw URL with no ref has an empty ref. */
export function parseRepoFileUrl(url: string): RepoFileUrl | undefined {
  let kind: 'raw' | 'blob';
  let rest: string;
  if (url.startsWith(`${RAW_HOST}/`) || url === RAW_HOST) {
    kind = 'raw';
    rest = url.slice(RAW_HOST.length);
  } else if (url.startsWith(`${REPO_HOST}/blob/`) || url.startsWith(`${REPO_HOST}/raw/`)) {
    kind = url.startsWith(`${REPO_HOST}/blob/`) ? 'blob' : 'raw';
    rest = url.slice(REPO_HOST.length).replace(/^\/(?:blob|raw)/, '');
  } else {
    return undefined;
  }
  const pathname: string = rest.split(/[?#]/, 1)[0] ?? '';
  const [ref = '', ...path] = pathname
    .split('/')
    .filter((s) => s !== '')
    .map(decodeSegment);
  return { kind, ref, path: path.join('/') };
}

/** A path that stays on `main` in a published README because the reader wants the newest of it: a CHANGELOG.md or the LICENSE. */
export function isMainPinnedPath(path: string): boolean {
  return path === 'LICENSE' || path === 'CHANGELOG.md' || path.endsWith('/CHANGELOG.md');
}

export const COMMIT_SHA = /^[0-9a-f]{40}$/;
/** ASSET_COMMIT_PLACEHOLDER, and the spec's bare ASSET_COMMIT, RECORD_COMMIT and VERSIONS_COMMIT: a token the release has not filled in. */
const PLACEHOLDER = /^[A-Z][A-Z_]*_COMMIT(?:_PLACEHOLDER)?$/;

/** Why a ref cannot pin a published README, or undefined when it is a full lowercase 40-hex commit. */
export function pinProblem(ref: string): string | undefined {
  if (COMMIT_SHA.test(ref)) return undefined;
  if (ref === '') return 'the URL names no commit';
  if (PLACEHOLDER.test(ref)) {
    return `${ref} is still a placeholder: the release is not ready (the commit that holds the image or record has not been written into this README)`;
  }
  return `ref ${ref} is not a full 40-hex commit (a published README names the commit its pictures and records live at; main, HEAD, tags, branches and short hashes move after publish)`;
}

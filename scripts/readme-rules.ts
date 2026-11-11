// scripts/readme-rules.ts
// The rules about the published READMEs that more than one gate applies, as pure functions on Markdown text: which
// pages they bind, a fence-aware scan, the 78-column fence rule, the 28-character unbreakable inline-code rule,
// the extraction of image references, and the shape of a pinned (commit) reference. scripts/check-doc-samples.ts
// (fences and inline code), scripts/check-repo-links.ts (pinned references and their ancestry) and
// scripts/check-package.ts (alt text and the image file at its commit) import it; none of them is a library.
//
// Why these rules: npm prints a README in a 763 px column (343 px on a phone) in Fira Mono at 16.2 px, so a fence
// line over 78 characters scrolls sideways and an inline code span with no space in it that is longer than 28
// characters pushes the page wider than the phone (docs/specs: public-surfaces design, sections 8.5 and 1.3).

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

/** The length of a line in characters (code points), the unit of a monospace column. */
function columns(text: string): number {
  return Array.from(text).length;
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

/** Both text rules, for a page that is a published README; any other page has none. */
export function readmeTextViolations(markdown: string, page: string): Violation[] {
  if (!isPublishedReadme(page)) return [];
  return [...fenceWidthViolations(markdown), ...inlineCodeViolations(markdown)].sort(
    (a, b) => a.line - b.line,
  );
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

/** Every image a README shows outside its fences: <img>, the URLs of <source srcset>, and ![alt](url). */
export function extractImageRefs(markdown: string): ImageRef[] {
  const { prose } = scanMarkdown(markdown);
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
  return refs.sort((a, b) => a.line - b.line);
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

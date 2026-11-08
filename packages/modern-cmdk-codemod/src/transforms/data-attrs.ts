// modern-cmdk/codemod — Transform: data-attrs
// Renames cmdk's `cmdk-*` attributes to the `data-command-*` attributes modern-cmdk renders, in
// two passes:
//   - the script pass (default export, .ts/.mts/.cts/.tsx/.js/.jsx/.mjs/.cjs): JSX attribute names
//     such as <div cmdk-root="" /> -> <div data-command-root="" />, selectors inside string and
//     template literals such as querySelector('[cmdk-root] [cmdk-item]'), and the Tailwind
//     data-variants of className/class values on JSX elements bound to a 'cmdk' or
//     'modern-cmdk/react' import;
//   - the stylesheet pass (transformStylesheet, .css/.scss): the same selector rewrite, with
//     comments, strings outside attribute selectors and formatting left alone.
// Every site it cannot migrate is reported once and left unchanged.

import type { API, FileInfo } from 'jscodeshift';
import { printOptions } from '../print-options.js';

// Targets, from what packages/modern-cmdk/src/react renders:
//   cmdk-root          -> data-command-root           (command.tsx:68; dialog.tsx:114 renders it on the root inside the dialog)
//   cmdk-dialog        -> data-command-dialog         (dialog.tsx:103, the Dialog.Content element)
//   cmdk-overlay       -> data-command-overlay        (dialog.tsx:97, the Dialog.Overlay element)
//   cmdk-input         -> data-command-input          (input.tsx:68)
//   cmdk-list          -> data-command-list           (list.tsx:158)
//   cmdk-list-sizer    -> data-command-list-inner     (list.tsx:174: the innerRef element, which the ResizeObserver at
//                                                      list.tsx:58-73 measures into --command-list-height, set at
//                                                      list.tsx:105; cmdk's sizer does the same for --cmdk-list-height.
//                                                      Not rendered while the list is virtualized, where
//                                                      data-command-list-virtual at list.tsx:168 replaces it)
//   cmdk-item          -> data-command-item           (item.tsx:84; data-active at :85, data-disabled at :86)
//   cmdk-group         -> data-command-group          (group.tsx:64)
//   cmdk-group-heading -> data-command-group-heading  (group.tsx:70)
//   cmdk-group-items   -> data-command-group-items    (group.tsx:74)
//   cmdk-separator     -> data-command-separator      (separator.tsx:12)
//   cmdk-empty         -> data-command-empty          (empty.tsx:24)
//   cmdk-loading       -> data-command-loading        (loading.tsx:28)
// The cmdk side is node_modules/cmdk/dist/index.mjs (cmdk 1.1.1), which renders exactly these and cmdk-label.
// Tailwind: in v4 `data-active:` is the presence variant of [data-active], and `data-[selected=true]:`
// the value variant of [data-selected="true"] (https://tailwindcss.com/docs/hover-focus-and-other-states#data-attributes,
// read 2026-11-05).

/** Mapping from cmdk attribute names to the attribute modern-cmdk renders. */
export const ATTR_MAP: ReadonlyMap<string, string> = new Map<string, string>([
  ['cmdk-root', 'data-command-root'],
  ['cmdk-dialog', 'data-command-dialog'],
  ['cmdk-overlay', 'data-command-overlay'],
  ['cmdk-input', 'data-command-input'],
  ['cmdk-list', 'data-command-list'],
  ['cmdk-list-sizer', 'data-command-list-inner'],
  ['cmdk-item', 'data-command-item'],
  ['cmdk-group', 'data-command-group'],
  ['cmdk-group-heading', 'data-command-group-heading'],
  ['cmdk-group-items', 'data-command-group-items'],
  ['cmdk-separator', 'data-command-separator'],
  ['cmdk-empty', 'data-command-empty'],
  ['cmdk-loading', 'data-command-loading'],
]);

/** CSS custom property renames. */
export const CSS_VAR_MAP: ReadonlyMap<string, string> = new Map<string, string>([
  ['--cmdk-list-height', '--command-list-height'],
]);

/** cmdk names with no modern-cmdk equivalent, each with the reason a site is reported. */
export const UNMAPPED_ATTRS: ReadonlyMap<string, string> = new Map<string, string>([
  [
    'cmdk-label',
    'cmdk renders a visually hidden <label>; modern-cmdk puts the label on the root as aria-label and renders no label element',
  ],
  [
    'cmdk-item-select',
    'a DOM event cmdk dispatches on an item to run its onSelect, not an attribute; modern-cmdk has no such event, use the item onSelect prop',
  ],
]);

/** cmdk state attributes (always rendered as "true" or "false") and the presence attribute that replaces each. */
const STATE_ATTRS: ReadonlyMap<string, string> = new Map<string, string>([
  ['data-selected', 'data-active'],
  ['data-disabled', 'data-disabled'],
]);

const CMDK_NAMES: ReadonlySet<string> = new Set([...ATTR_MAP.keys(), ...UNMAPPED_ATTRS.keys()]);

/** Imports whose bindings make a JSX element a cmdk element for the Tailwind rewrite. */
const CMDK_SOURCES: ReadonlySet<string> = new Set(['cmdk', 'modern-cmdk/react']);

/** The JSX attributes whose string content is a class list. */
const CLASS_ATTRS: ReadonlySet<string> = new Set(['className', 'class']);

const CSS_VARS_LONGEST_FIRST: readonly string[] = [...CSS_VAR_MAP.keys()].sort(
  (a, b) => b.length - a.length,
);

/** One attribute selector inside a compound: [name], [name=value], [name~="value" i]. */
const ATTRIBUTE_SELECTOR =
  /\[\s*([A-Za-z_][\w-]*)\s*(?:([~|^$*]?=)\s*("[^"]*"|'[^']*'|[^\]\s"']*)\s*)?(?:[iIsS]\s*)?\]/dy;

/**
 * The start of an attribute selector cut short by a template literal's `${`: [cmdk-item=" or
 * [cmdk-item. Only the name is rewritten.
 */
const PARTIAL_ATTRIBUTE_SELECTOR = /\[\s*([A-Za-z_][\w-]*)(?=\s*[~|^$*]?=|\s*$)/dy;

/** Tailwind presence form of the two state attributes: data-[selected]:, data-[disabled]/name:. */
const TAILWIND_PRESENCE = /(?<!\w)data-\[(selected|disabled)\](?=[:/])/g;

/** Tailwind value variants of the two state attributes: data-[selected=true]:, data-[disabled='false']/name:. */
const TAILWIND_STATE =
  /(?<!\w)data-\[(selected|disabled)=(?:(["'])(true|false)\2|(true|false))\](?=[:/])/g;

/** Whitespace that only pads a closing parenthesis, a comma or a combinator inside parentheses. */
const ARGUMENT_PADDING = /\s*[),>+~]/y;

/** Tailwind's `*:` and `**:` variants, which move a class to the element's children or descendants. */
const CHILD_VARIANT = /(?:^|:)\*\*?:/;

function parentMatchOf(flags: readonly boolean[]): ParentMatch {
  if (flags.every(Boolean)) return 'all';
  return flags.some(Boolean) ? 'some' : 'none';
}

/** Reports a site at an index of the text being rewritten. */
type SiteReport = (index: number, message: string) => void;

interface Edit {
  readonly start: number;
  readonly end: number;
  readonly text: string;
}

interface AttributeSite {
  readonly start: number;
  readonly end: number;
  /** The attribute name lowercased: HTML matches attribute names case-insensitively, so every lookup uses this form. */
  readonly name: string;
  readonly nameStart: number;
  readonly nameEnd: number;
  readonly operator: string | undefined;
  readonly value: string | undefined;
  /** True for a selector cut short by the end of the text: its value is unknown. */
  readonly partial: boolean;
}

function applyEdits(text: string, edits: readonly Edit[]): string {
  let result = text;
  for (const edit of [...edits].sort((a, b) => b.start - a.start)) {
    result = result.slice(0, edit.start) + edit.text + result.slice(edit.end);
  }
  return result;
}

function unquote(value: string): string {
  const quote = value[0];
  return (quote === '"' || quote === "'") && value.endsWith(quote) ? value.slice(1, -1) : value;
}

/**
 * Rewrite the cmdk attribute selectors and custom properties in a piece of text: a selector
 * string or template quasi (`css` false), or a whole stylesheet (`css` true).
 *
 * The text is cut into compounds (runs of simple selectors with no combinator, comma, brace or
 * whitespace at the top level). Inside any compound, a bracketed attribute whose name is in
 * ATTR_MAP gets its name replaced, operator and value kept; a name in UNMAPPED_ATTRS is reported.
 * Attribute names match case-insensitively, as they do in an HTML document: [CMDK-ITEM] is [cmdk-item].
 * A compound that holds a cmdk attribute also has its data-selected / data-disabled value
 * attributes rewritten: ="true" to the presence attribute, ="false" to :not(presence); any other
 * form is reported. In a stylesheet, a compound starting with `&` counts as holding a cmdk
 * attribute when the enclosing rule's selectors all end in one; under a rule where only some do,
 * each state attribute of such a compound is reported. Inside the parentheses of :not() / :is() /
 * :where() / :matches(), the compound after an argument's last combinator (its subject) joins the
 * outer compound, and the compounds before it stand alone, rewritten only if they hold a cmdk
 * attribute themselves. Inside any other parentheses (:has(), :nth-child(), url(), var(), ...)
 * every compound stands alone. `tailwind` marks a class value of a cmdk-bound element, where an
 * arbitrary variant `[&[data-selected=true]_svg]` holds the bound element's own attributes up to
 * its first `_`, `>`, `+` or `~`. Inside the parentheses of such a variant, `_` is a combinator too. A `[&...]` after a `*:` or `**:` variant, or after an earlier
 * `[&...]` variant, is not taken as the bound element.
 */
function rewriteSelectors(
  text: string,
  css: boolean,
  report: SiteReport,
  tailwind: boolean,
): string {
  return applyEdits(text, selectorEdits(text, css, report, tailwind));
}

/** How many selectors of a rule's prelude end in a compound that holds a cmdk attribute. */
type ParentMatch = 'all' | 'some' | 'none';

/** One open parenthesis: the outer compound is parked here while the compounds inside collect. */
interface ParenFrame {
  /** The bracket depth at the `(`: 1 for the parentheses of a `[&...]` arbitrary variant. */
  brackets: number;
  /** The argument has produced a character since the last combinator or comma. */
  hasContent: boolean;
  /** The compound that was current at the `(`. */
  outer: { attrs: AttributeSite[]; start: number; ampStart: number; ampDescendant: number };
  /** The function is :not / :is / :where / :matches: an argument's subject compound joins the outer one. */
  subject: boolean;
}

/** The edits rewriteSelectors applies, as ranges of `text`; reports are made while collecting. */
function selectorEdits(text: string, css: boolean, report: SiteReport, tailwind: boolean): Edit[] {
  const edits: Edit[] = [];
  const ruleStack: ParentMatch[] = [];
  let selectorFlags: boolean[] = [];
  let lastFlag = false;
  let preludeFresh = true;
  let preludeIsAtRule = false;
  let attrs: AttributeSite[] = [];
  let compoundStart = -1;
  /** Index of the first `[&` arbitrary variant of the current class token, at its start or after a `:` of a variant prefix that holds no `*:` or `**:` variant. */
  let ampStart = -1;
  /** Index of the first `_`, `>`, `+` or `~` at bracket depth 1, outside parentheses, of a `[&...` arbitrary variant: where the part on another element starts. */
  let ampDescendant = -1;
  const frames: ParenFrame[] = [];
  let brackets = 0;

  if (!css) {
    const whole = text.trim();
    const reason = UNMAPPED_ATTRS.get(whole.toLowerCase());
    if (reason !== undefined) {
      report(
        text.indexOf(whole),
        `${whole} has no modern-cmdk equivalent: ${reason}; left unchanged`,
      );
    }
    const mapped = ATTR_MAP.get(whole.toLowerCase());
    if (mapped !== undefined) {
      report(
        text.indexOf(whole),
        `${whole} is a cmdk attribute name outside a selector; modern-cmdk renders ${mapped}; left unchanged`,
      );
    }
  }

  const endCompound = (isArgument = false): void => {
    if (compoundStart === -1) return;
    const holds = attrs.some((a) => CMDK_NAMES.has(a.name));
    const parentMatch = text[compoundStart] === '&' ? (ruleStack.at(-1) ?? 'none') : 'none';
    const viaParent = parentMatch === 'all';
    const partialParent = parentMatch === 'some' && !holds;
    const ampBound = tailwind && ampStart !== -1;
    for (const a of attrs) {
      const target = ATTR_MAP.get(a.name);
      if (target !== undefined) {
        edits.push({ start: a.nameStart, end: a.nameEnd, text: target });
        continue;
      }
      const reason = UNMAPPED_ATTRS.get(a.name);
      if (reason !== undefined) {
        report(
          a.start,
          `${text.slice(a.nameStart, a.nameEnd)} has no modern-cmdk equivalent: ${reason}; left unchanged`,
        );
        continue;
      }
      const presence = STATE_ATTRS.get(a.name);
      if (presence === undefined || a.partial) continue;
      if (partialParent) {
        report(
          a.start,
          `${text.slice(a.start, a.end)} under a rule whose selectors only partly hold a cmdk attribute cannot be migrated automatically; left unchanged`,
        );
        continue;
      }
      const onBound = ampBound && (ampDescendant === -1 || a.start < ampDescendant);
      if (!(holds || viaParent || onBound)) continue;
      const value = a.operator === '=' && a.value !== undefined ? unquote(a.value) : undefined;
      if (value === 'true') {
        edits.push({ start: a.start, end: a.end, text: `[${presence}]` });
      } else if (value === 'false') {
        edits.push({ start: a.start, end: a.end, text: `:not([${presence}])` });
      } else {
        report(
          a.start,
          `${text.slice(a.start, a.end)} beside a cmdk attribute cannot be migrated automatically: cmdk rendered ${a.name} with a "true" or "false" value, modern-cmdk sets ${presence} only while the state holds; left unchanged`,
        );
      }
    }
    if (!isArgument) lastFlag = holds || viaParent;
    attrs = [];
    compoundStart = -1;
    ampStart = -1;
    ampDescendant = -1;
  };

  /** End the compound collected since the last combinator or comma: an argument's subject joins the outer compound. */
  const endArgumentSubject = (frame: ParenFrame): void => {
    if (!frame.subject) {
      endCompound(true);
      return;
    }
    frame.outer.attrs.push(...attrs);
    if (frame.outer.start === -1) frame.outer.start = compoundStart;
    attrs = [];
    compoundStart = -1;
  };

  const padsArgument = (at: number): boolean => {
    ARGUMENT_PADDING.lastIndex = at;
    return ARGUMENT_PADDING.test(text);
  };

  const startPrelude = (): void => {
    selectorFlags = [];
    lastFlag = false;
    preludeFresh = true;
    preludeIsAtRule = false;
  };

  for (let i = 0; i < text.length; ) {
    const c = text[i] as string;

    if (css && c === '/' && text[i + 1] === '*') {
      endCompound();
      const close = text.indexOf('*/', i + 2);
      i = close === -1 ? text.length : close + 2;
      continue;
    }
    // Plain CSS has no line comments: only SCSS's `//`, at the start of a line or after a
    // statement or block boundary, outside parentheses (a `url( //cdn/a.png)` stays a value).
    if (
      css &&
      frames.length === 0 &&
      c === '/' &&
      text[i + 1] === '/' &&
      (i === 0 || /[\s;{}]/.test(text[i - 1] as string))
    ) {
      endCompound();
      const eol = text.indexOf('\n', i);
      i = eol === -1 ? text.length : eol;
      continue;
    }

    if (brackets > 0 && /\s/.test(c)) brackets = 0;
    const frame = frames.at(-1);
    if (
      frame !== undefined &&
      ((brackets === 0 && /[\s>+~,]/.test(c)) ||
        (tailwind && frame.brackets > 0 && brackets === frame.brackets && /[_>+~,]/.test(c)))
    ) {
      if (c === ',') {
        endArgumentSubject(frame);
        frame.hasContent = false;
      } else if (!/\s/.test(c) || (frame.hasContent && !padsArgument(i))) {
        // A combinator ends an ancestor or sibling compound: it stands alone.
        endCompound(true);
        frame.hasContent = false;
      }
      i++;
      continue;
    }
    if (frame === undefined && brackets === 0 && /[\s>+~,{};]/.test(c)) {
      endCompound();
      if (c === ',') {
        selectorFlags.push(lastFlag);
        lastFlag = false;
      } else if (c === '{') {
        selectorFlags.push(lastFlag);
        ruleStack.push(
          preludeIsAtRule ? (ruleStack.at(-1) ?? 'none') : parentMatchOf(selectorFlags),
        );
        startPrelude();
      } else if (c === '}') {
        ruleStack.pop();
        startPrelude();
      } else if (c === ';') {
        startPrelude();
      }
      i++;
      continue;
    }

    if (compoundStart === -1) {
      compoundStart = i;
      if (preludeFresh) {
        preludeFresh = false;
        preludeIsAtRule = c === '@';
      }
    }

    if (frame !== undefined) frame.hasContent = true;

    if (css && (c === '"' || c === "'") && brackets === 0) {
      let j = i + 1;
      while (j < text.length && text[j] !== c) j += text[j] === '\\' ? 2 : 1;
      i = j + 1;
      continue;
    }

    if (c === '[') {
      ATTRIBUTE_SELECTOR.lastIndex = i;
      const m = ATTRIBUTE_SELECTOR.exec(text);
      const nameSpan = m?.indices?.[1];
      if (m !== null && nameSpan !== undefined) {
        attrs.push({
          start: i,
          end: ATTRIBUTE_SELECTOR.lastIndex,
          name: (m[1] as string).toLowerCase(),
          nameStart: nameSpan[0],
          nameEnd: nameSpan[1],
          operator: m[2],
          value: m[3],
          partial: false,
        });
        i = ATTRIBUTE_SELECTOR.lastIndex;
        continue;
      }
      PARTIAL_ATTRIBUTE_SELECTOR.lastIndex = i;
      const partial = PARTIAL_ATTRIBUTE_SELECTOR.exec(text);
      const partialName = partial?.indices?.[1];
      if (partial !== null && partialName !== undefined) {
        attrs.push({
          start: i,
          end: PARTIAL_ATTRIBUTE_SELECTOR.lastIndex,
          name: (partial[1] as string).toLowerCase(),
          nameStart: partialName[0],
          nameEnd: partialName[1],
          operator: undefined,
          value: undefined,
          partial: true,
        });
        i = PARTIAL_ATTRIBUTE_SELECTOR.lastIndex;
        continue;
      }
      if (
        tailwind &&
        brackets === 0 &&
        ampStart === -1 &&
        text.startsWith('[&', i) &&
        (i === compoundStart ||
          (text[i - 1] === ':' && !CHILD_VARIANT.test(text.slice(compoundStart, i))))
      ) {
        ampStart = i;
        ampDescendant = -1;
      }
      brackets++;
    } else if (c === ']') {
      if (brackets > 0) brackets--;
    } else if (
      tailwind &&
      brackets === 1 &&
      frames.length === 0 &&
      ampStart !== -1 &&
      ampDescendant === -1 &&
      /[_>+~]/.test(c)
    ) {
      ampDescendant = i;
    } else if (c === '(') {
      frames.push({
        brackets,
        hasContent: false,
        outer: { attrs, start: compoundStart, ampStart, ampDescendant },
        subject: /:(?:not|is|where|matches)$/i.test(text.slice(Math.max(0, i - 8), i)),
      });
      attrs = [];
      compoundStart = -1;
      ampStart = -1;
      ampDescendant = -1;
    } else if (c === ')') {
      const closing = frames.pop();
      if (closing !== undefined) {
        endArgumentSubject(closing);
        attrs = closing.outer.attrs;
        compoundStart = closing.outer.start;
        ampStart = closing.outer.ampStart;
        ampDescendant = closing.outer.ampDescendant;
      }
    } else if (c === '-' && text.startsWith('--cmdk-', i) && !/[\w-]/.test(text[i - 1] ?? '')) {
      const name = CSS_VARS_LONGEST_FIRST.find(
        (v) => text.startsWith(v, i) && !/[\w-]/.test(text[i + v.length] ?? ''),
      );
      if (name !== undefined) {
        edits.push({ start: i, end: i + name.length, text: CSS_VAR_MAP.get(name) as string });
        i += name.length;
        continue;
      }
    }
    i++;
  }
  // An unclosed parenthesis ends the text: unwind it as ')' would, so the outer compound is still processed.
  for (let open = frames.pop(); open !== undefined; open = frames.pop()) {
    endArgumentSubject(open);
    attrs = open.outer.attrs;
    compoundStart = open.outer.start;
    ampStart = open.outer.ampStart;
    ampDescendant = open.outer.ampDescendant;
  }
  endCompound();

  return edits;
}

/** Rewrite the Tailwind value variants of the two state attributes in a class list, reporting the presence form. */
function rewriteTailwind(text: string, report: SiteReport): string {
  return applyEdits(text, tailwindEdits(text, report));
}

/** `group-`, `peer-` or `in-` right before a `data-` variant: the state it tests is on another element. */
const OTHER_ELEMENT_PREFIX = /(?<![\w-])(?:group|peer|in)-$/;

/**
 * Where the `group-`, `peer-` or `in-` prefix of the data variant at `index` starts, or -1 for a
 * variant on the bound element itself. Such a variant styles the element by the state of an
 * ancestor or a sibling, which need not be a cmdk element (a cmdk item has no cmdk ancestor with
 * a selected state), so it is reported instead of rewritten.
 */
function otherElementStart(text: string, index: number): number {
  const prefix = OTHER_ELEMENT_PREFIX.exec(text.slice(0, index));
  return prefix === null ? -1 : prefix.index;
}

function reportOtherElement(text: string, start: number, end: number, report: SiteReport): void {
  report(
    start,
    `${text.slice(start, end)}: styles this element by the state of another element (an ancestor or a sibling) that need not be a cmdk element, so it cannot be migrated automatically; left unchanged`,
  );
}

/** The edits rewriteTailwind applies, as ranges of `text`. */
function tailwindEdits(text: string, report: SiteReport): Edit[] {
  const edits: Edit[] = [];
  for (const m of text.matchAll(TAILWIND_PRESENCE)) {
    const other = otherElementStart(text, m.index);
    if (other !== -1) {
      reportOtherElement(text, other, m.index + m[0].length, report);
      continue;
    }
    const name = `data-${m[1]}`;
    const presence = STATE_ATTRS.get(name) as string;
    report(
      m.index,
      `${m[0]}: on a cmdk element cannot be migrated automatically: cmdk rendered ${name} with a "true" or "false" value, modern-cmdk sets ${presence} only while the state holds; left unchanged`,
    );
  }
  for (const m of text.matchAll(TAILWIND_STATE)) {
    const other = otherElementStart(text, m.index);
    if (other !== -1) {
      reportOtherElement(text, other, m.index + m[0].length, report);
      continue;
    }
    const presence = STATE_ATTRS.get(`data-${m[1]}`) as string;
    const value = m[3] ?? m[4];
    if (value === 'true') {
      edits.push({ start: m.index, end: m.index + m[0].length, text: presence });
    } else {
      report(
        m.index,
        `${m[0]}: has no modern-cmdk equivalent, ${presence} is a presence attribute with no false value (use not-${presence}:); left unchanged`,
      );
    }
  }
  return edits;
}

/** 1-based line of an index in a text that itself starts at `firstLine`. */
function lineAt(text: string, index: number, firstLine: number): number {
  let line = firstLine;
  for (let i = text.indexOf('\n'); i !== -1 && i < index; i = text.indexOf('\n', i + 1)) line++;
  return line;
}

/**
 * Stylesheet pass for .css and .scss files: the same selector and custom property rewrite as the
 * script pass, with comments, strings outside attribute selectors and formatting untouched.
 * Each site left for manual migration is reported once with its line.
 */
export function transformStylesheet(source: string, report: (message: string) => void): string {
  return rewriteSelectors(
    source,
    true,
    (index, message) => {
      report(`line ${lineAt(source, index, 1)}: ${message}`);
    },
    false,
  );
}

// Loose views of the AST nodes this transform touches; jscodeshift's node types differ between the
// ts/tsx parsers (StringLiteral, extra.raw) and babel (estree Literal, raw).
interface Loc {
  readonly start?: { readonly line: number };
}
interface LooseNode {
  readonly type: string;
  readonly start?: number;
  readonly loc?: Loc | null;
  readonly value?: unknown;
  readonly raw?: string;
  readonly extra?: { readonly raw?: string };
}
interface LooseQuasi {
  value: { raw: string; cooked?: string | null };
}
interface LooseTemplate {
  readonly start?: number;
  readonly loc?: Loc | null;
  readonly quasis: readonly LooseQuasi[];
  readonly expressions: readonly {
    readonly loc?: {
      readonly start: { readonly line: number };
      readonly end: { readonly line: number };
    } | null;
  }[];
}

/** Stands in for `${...}` while a template literal's quasis are scanned as one text. */
const PLACEHOLDER = '\uE000';

/** How a placeholder reads in a report. */
const PLACEHOLDER_TEXT = '$' + '{...}';

function rawOf(node: LooseNode): string | undefined {
  return node.extra?.raw ?? node.raw;
}

/** A string literal's interior decoded to its value, with the raw span behind every UTF-16 unit. */
interface Decoded {
  readonly cooked: string;
  readonly rawStart: readonly number[];
  readonly rawEnd: readonly number[];
}

const SIMPLE_ESCAPES: ReadonlyMap<string, string> = new Map([
  ['n', '\n'],
  ['t', '\t'],
  ['b', '\b'],
  ['f', '\f'],
  ['v', '\v'],
  ['r', '\r'],
]);

function decodeRaw(inner: string): Decoded {
  const units: string[] = [];
  const rawStart: number[] = [];
  const rawEnd: number[] = [];
  const push = (value: string, from: number, to: number): void => {
    for (const unit of value) {
      // `for...of` yields code points: split an astral one into the two units that share its span.
      for (let k = 0; k < unit.length; k++) {
        units.push(unit.charAt(k));
        rawStart.push(from);
        rawEnd.push(to);
      }
    }
  };
  let i = 0;
  while (i < inner.length) {
    const c = inner.charAt(i);
    if (c !== '\\') {
      push(c, i, i + 1);
      i++;
      continue;
    }
    const next = inner.charAt(i + 1);
    let end = i + 2;
    let value = next;
    if (next === '\r' && inner.charAt(i + 2) === '\n') {
      end = i + 3;
      value = '';
    } else if (next === '\n' || next === '\r' || next === ' ' || next === ' ') {
      value = '';
    } else if (SIMPLE_ESCAPES.has(next)) {
      value = SIMPLE_ESCAPES.get(next) as string;
    } else if (next === 'x') {
      end = i + 4;
      value = String.fromCharCode(Number.parseInt(inner.slice(i + 2, end), 16));
    } else if (next === 'u') {
      if (inner.charAt(i + 2) === '{') {
        end = inner.indexOf('}', i + 3) + 1;
        value = String.fromCodePoint(Number.parseInt(inner.slice(i + 3, end - 1), 16));
      } else {
        end = i + 6;
        value = String.fromCharCode(Number.parseInt(inner.slice(i + 2, end), 16));
      }
    } else if (/[0-7]/.test(next)) {
      const octal = /^[0-7]{1,3}/.exec(inner.slice(i + 1)) as RegExpExecArray;
      end = i + 1 + octal[0].length;
      value = String.fromCharCode(Number.parseInt(octal[0], 8));
    }
    push(value, i, end);
    i = end;
  }
  return { cooked: units.join(''), rawStart, rawEnd };
}

/** Apply edits made against `decoded.cooked` to the raw interior they came from. */
function applyCookedEdits(inner: string, decoded: Decoded, edits: readonly Edit[]): string {
  const total = decoded.rawStart.length;
  return applyEdits(
    inner,
    edits.map((edit) => {
      const start = edit.start < total ? (decoded.rawStart[edit.start] as number) : inner.length;
      const end = edit.end > edit.start ? (decoded.rawEnd[edit.end - 1] as number) : start;
      return { start, end, text: edit.text };
    }),
  );
}

/**
 * jscodeshift transform — renames cmdk attributes in JSX, selectors in string and template
 * literals, and Tailwind state variants on cmdk-bound elements.
 */
export default function transform(fileInfo: FileInfo, api: API): string {
  // Quick bail — skip files with no cmdk references at all
  if (!fileInfo.source.includes('cmdk')) {
    return fileInfo.source;
  }

  const j = api.jscodeshift;
  const root = j(fileInfo.source);
  const sites: { readonly pos: number; readonly run: () => void }[] = [];
  let sampleRaw: string | undefined;
  let changed = false;

  const reportAt = (text: string, firstLine: number | undefined): SiteReport => {
    return (index: number, message: string): void => {
      const line = firstLine === undefined ? '' : `line ${lineAt(text, index, firstLine)}: `;
      api.report(line + message);
    };
  };
  const startOf = (node: { start?: number }): number => node.start ?? 0;

  // Elements bound to cmdk: the local names its imports introduce.
  const bound = new Set<string>();
  root.find(j.ImportDeclaration).forEach((path) => {
    if (!CMDK_SOURCES.has(String(path.node.source.value))) return;
    for (const specifier of path.node.specifiers ?? []) {
      const local = specifier.local?.name;
      if (typeof local === 'string') bound.add(local);
    }
  });
  const isBound = (name: unknown): boolean => {
    let current = name as { type: string; name?: string; object?: unknown } | undefined;
    while (current?.type === 'JSXMemberExpression') {
      current = current.object as typeof current;
    }
    return current?.type === 'JSXIdentifier' && bound.has(current.name as string);
  };

  // Literals inside the class attributes of bound elements get the Tailwind rewrite as well.
  const tailwind = new WeakSet<object>();
  root.find(j.JSXAttribute).forEach((path) => {
    const attrName = path.node.name;
    if (attrName.type !== 'JSXIdentifier' || !CLASS_ATTRS.has(attrName.name)) return;
    const element = path.parent?.node as { name?: unknown } | undefined;
    if (!isBound(element?.name)) return;
    j(path)
      .find(j.Literal)
      .forEach((p) => void tailwind.add(p.node));
    j(path)
      .find(j.TemplateLiteral)
      .forEach((p) => void tailwind.add(p.node));
  });

  // 1. JSX attribute names: <div cmdk-root="" /> -> <div data-command-root="" />
  root.find(j.JSXAttribute).forEach((path) => {
    const attrName = path.node.name;
    if (attrName.type !== 'JSXIdentifier') return;
    const target = ATTR_MAP.get(attrName.name.toLowerCase());
    const reason = UNMAPPED_ATTRS.get(attrName.name.toLowerCase());
    if (target === undefined && reason === undefined) return;
    const node = path.node as unknown as LooseNode;
    sites.push({
      pos: startOf(node),
      run: () => {
        if (target !== undefined) {
          attrName.name = target;
          changed = true;
        } else {
          reportAt('', node.loc?.start?.line === undefined ? undefined : node.loc.start.line)(
            0,
            `${attrName.name} has no modern-cmdk equivalent: ${reason}; left unchanged`,
          );
        }
      },
    });
  });

  // 2. String literals: querySelector('[cmdk-item]'), className="...", JSX attribute strings.
  root.find(j.Literal).forEach((path) => {
    const node = path.node as unknown as LooseNode;
    if (typeof node.value !== 'string' || node.type === 'JSXText') return;
    const original = node.value;
    const raw = rawOf(node);
    const inJsxAttribute = path.parent?.node?.type === 'JSXAttribute';
    const useTailwind = tailwind.has(path.node);
    sites.push({
      pos: startOf(node),
      run: () => {
        const quote = raw?.[0];
        const hasQuotes = quote === '"' || quote === "'";
        if (!hasQuotes) {
          const report = reportAt(original, node.loc?.start?.line);
          let rewritten = rewriteSelectors(original, false, report, useTailwind);
          if (useTailwind) rewritten = rewriteTailwind(rewritten, report);
          if (rewritten === original) return;
          changed = true;
          (path.node as { value: unknown }).value = rewritten;
          return;
        }
        // Edit the literal's own source text, so every escape and its quote survive untouched;
        // recast would otherwise reprint it from its value with one global quote. A JSX attribute
        // string has no escapes: its source text is its value.
        const inner = (raw as string).slice(1, -1);
        const decoded: Decoded = inJsxAttribute
          ? {
              cooked: inner,
              rawStart: Array.from({ length: inner.length }, (_, k) => k),
              rawEnd: Array.from({ length: inner.length }, (_, k) => k + 1),
            }
          : decodeRaw(inner);
        const report = reportAt(decoded.cooked, node.loc?.start?.line);
        const edits = selectorEdits(decoded.cooked, false, report, useTailwind);
        if (useTailwind) edits.push(...tailwindEdits(decoded.cooked, report));
        if (edits.length === 0) return;
        const edited = applyCookedEdits(inner, decoded, edits);
        if (edited === inner) return;
        changed = true;
        if (!inJsxAttribute) sampleRaw ??= raw;
        path.replace(j.jsxText(quote + edited + quote));
      },
    });
  });

  // 3. Template literals: `[cmdk-root] > [cmdk-list]`. The quasis are scanned as one text with a
  // placeholder between them, so a compound split by `${...}` keeps its cmdk attribute.
  root.find(j.TemplateLiteral).forEach((path) => {
    const literal = path.node as unknown as LooseTemplate;
    const useTailwind = tailwind.has(path.node);
    sites.push({
      pos: startOf(literal),
      run: () => {
        const quasis = literal.quasis;
        const original = quasis.map((q) => q.value.raw).join(PLACEHOLDER);
        const firstLine = literal.loc?.start?.line;
        const placeholderAt: number[] = [];
        for (
          let k = original.indexOf(PLACEHOLDER);
          k !== -1;
          k = original.indexOf(PLACEHOLDER, k + 1)
        ) {
          placeholderAt.push(k);
        }
        const report: SiteReport = (index: number, message: string): void => {
          let line = '';
          if (firstLine !== undefined) {
            let n = lineAt(original, index, firstLine);
            placeholderAt.forEach((at, k) => {
              const loc = literal.expressions[k]?.loc;
              if (at < index && loc?.start && loc.end) n += loc.end.line - loc.start.line;
            });
            line = `line ${n}: `;
          }
          api.report(line + message.replaceAll(PLACEHOLDER, PLACEHOLDER_TEXT));
        };
        let rewritten = rewriteSelectors(original, false, report, useTailwind);
        if (useTailwind) rewritten = rewriteTailwind(rewritten, report);
        if (rewritten === original) return;
        const parts = rewritten.split(PLACEHOLDER);
        if (parts.length !== quasis.length) return;
        quasis.forEach((quasi, k) => {
          const part = parts[k] as string;
          if (part === quasi.value.raw) return;
          if (quasi.value.cooked === quasi.value.raw) quasi.value.cooked = part;
          quasi.value.raw = part;
        });
        changed = true;
      },
    });
  });

  // Source order, so the reports read top to bottom.
  for (const site of sites.sort((a, b) => a.pos - b.pos)) site.run();

  return changed ? root.toSource(printOptions(fileInfo.source, sampleRaw)) : fileInfo.source;
}

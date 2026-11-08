// tests/unit/docs-contrast.test.ts
// The docs site's colour tokens against WCAG 2.2 (design-final.md 2.1 contrast table, 4.6 Shiki table, 8 accessibility plan).
//
// apps/docs/.vitepress/theme/styles/tokens.css is parsed as text: the base `html:root` blocks, and separately the
// `@media (prefers-contrast: more)` block that overrides a few of them. Every token is a literal `light-dark(<light>, <dark>)`
// pair of `oklch()` values (or a `var()` of one), so a token resolves to a colour with a small CSS reader and no browser.
// OKLCH goes to linear sRGB with the CSS Color 4 matrices (https://www.w3.org/TR/css-color-4/#color-conversion-code), a colour
// with alpha is composited over its surface in sRGB-encoded space as browsers do, and the ratio is the WCAG relative-luminance
// ratio (https://www.w3.org/TR/WCAG22/#dfn-contrast-ratio).
//
// Each pair asserts its floor (4.5 for text, 3 for large text and non-text) and that the computed ratio is within 0.05 of the
// figure in TABLE and SHIKI: the spec's own figure, except the 14 the spec printed wrongly (listed above TABLE), where it is the
// recomputed one. Every token VALUE is asserted too, against EXPECTED_BASE and EXPECTED_CONTRAST below (design-final.md 2.1
// and 4.6), because item 1's acceptance delegates "every value in tokens.css equals 2.1 and 4.6" to this file: a token edit that
// moves a value or a ratio fails here rather than drifting silently.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

type Scheme = 'light' | 'dark';
type Linear = readonly [number, number, number];

interface Oklch {
  readonly l: number;
  readonly c: number;
  readonly h: number;
  readonly alpha: number;
}

const TOKENS_CSS = resolve(
  import.meta.dirname,
  '../../apps/docs/.vitepress/theme/styles/tokens.css',
);
const SCHEMES: readonly Scheme[] = ['light', 'dark'];
// A ratio computed here may differ from the spec table's two-decimal figure by rounding only
const TABLE_TOLERANCE = 0.05;
const GAMUT_EPSILON = 1e-4;

// --- the CSS reader ---------------------------------------------------------------------------------------------------

interface Rule {
  readonly media: string | null;
  readonly selector: string;
  readonly declarations: ReadonlyMap<string, string>;
}

/** Index of the `}` that closes the block opened at `open`. */
function closingBrace(text: string, open: number): number {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}' && --depth === 0) return i;
  }
  throw new Error(`unbalanced braces from offset ${open}`);
}

function parseDeclarations(body: string): ReadonlyMap<string, string> {
  const declarations = new Map<string, string>();
  let depth = 0;
  let start = 0;
  const flush = (end: number): void => {
    const piece = body.slice(start, end);
    const colon = piece.indexOf(':');
    if (colon > 0) declarations.set(piece.slice(0, colon).trim(), piece.slice(colon + 1).trim());
    start = end + 1;
  };
  for (let i = 0; i < body.length; i++) {
    if (body[i] === '(') depth++;
    else if (body[i] === ')') depth--;
    else if (body[i] === ';' && depth === 0) flush(i);
  }
  flush(body.length);
  return declarations;
}

/** Style rules at the top level and inside `@media`; other at-rules (`@property`, `@font-face`) carry no tokens. */
function parseRules(css: string, media: string | null): readonly Rule[] {
  const rules: Rule[] = [];
  let position = 0;
  for (;;) {
    const open = css.indexOf('{', position);
    if (open === -1) return rules;
    const header = css.slice(position, open).trim();
    const close = closingBrace(css, open);
    const inner = css.slice(open + 1, close);
    if (header.startsWith('@media')) rules.push(...parseRules(inner, header));
    else if (!header.startsWith('@')) {
      rules.push({ media, selector: header, declarations: parseDeclarations(inner) });
    }
    position = close + 1;
  }
}

const source: string = readFileSync(TOKENS_CSS, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const rules: readonly Rule[] = parseRules(source, null);

function collect(predicate: (rule: Rule) => boolean): ReadonlyMap<string, string> {
  const merged = new Map<string, string>();
  for (const rule of rules) {
    if (rule.selector === 'html:root' && predicate(rule)) {
      for (const [name, value] of rule.declarations) merged.set(name, value);
    }
  }
  return merged;
}

/** The base tokens, then the same tokens with the `prefers-contrast: more` overrides applied. */
const baseTokens: ReadonlyMap<string, string> = collect((rule) => rule.media === null);
const contrastOverrides: ReadonlyMap<string, string> = collect((rule) =>
  Boolean(rule.media?.includes('prefers-contrast: more')),
);
const moreContrastTokens: ReadonlyMap<string, string> = new Map([
  ...baseTokens,
  ...contrastOverrides,
]);

/** `name(args)` calls found in `text`, replaced by `replace(args)`; the arguments are split at top-level commas. */
function replaceCalls(
  text: string,
  name: string,
  replace: (args: readonly string[]) => string,
): string {
  let out = text;
  for (;;) {
    let at = -1;
    for (let from = 0; ; ) {
      const found = out.indexOf(`${name}(`, from);
      if (found === -1) break;
      if (found === 0 || !/[\w-]/.test(out[found - 1] ?? '')) {
        at = found;
        break;
      }
      from = found + 1;
    }
    if (at === -1) return out;
    const argsStart = at + name.length + 1;
    let depth = 1;
    let end = argsStart;
    for (; end < out.length && depth > 0; end++) {
      if (out[end] === '(') depth++;
      else if (out[end] === ')') depth--;
    }
    const inner = out.slice(argsStart, end - 1);
    const args: string[] = [];
    let level = 0;
    let begin = 0;
    for (let i = 0; i < inner.length; i++) {
      if (inner[i] === '(') level++;
      else if (inner[i] === ')') level--;
      else if (inner[i] === ',' && level === 0) {
        args.push(inner.slice(begin, i).trim());
        begin = i + 1;
      }
    }
    args.push(inner.slice(begin).trim());
    out = `${out.slice(0, at)}${replace(args)}${out.slice(end)}`;
  }
}

/** A token's value for one scheme with every `var()` followed and every `light-dark()` picked. */
function resolveValue(value: string, scheme: Scheme, tokens: ReadonlyMap<string, string>): string {
  const withVars = replaceCalls(value, 'var', ([reference = '']) => {
    const target = tokens.get(reference);
    if (target === undefined) throw new Error(`${reference} is not declared in tokens.css`);
    return resolveValue(target, scheme, tokens);
  });
  return replaceCalls(withVars, 'light-dark', ([light = '', dark = '']) =>
    scheme === 'light' ? light : dark,
  );
}

function parseOklch(text: string): Oklch {
  const match = /^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+)(%?))?\s*\)$/.exec(
    text.trim(),
  );
  if (match === null) throw new Error(`not an oklch() colour: ${text}`);
  const [, l = '', c = '', h = '', alpha, percent] = match;
  const alphaValue = alpha === undefined ? 1 : Number(alpha) / (percent === '%' ? 100 : 1);
  return { l: Number(l), c: Number(c), h: Number(h), alpha: alphaValue };
}

// --- colour maths (CSS Color 4 reference code, matrices as published) ------------------------------------------------

function oklchToLinear({ l, c, h }: Oklch): Linear {
  const radians = (h * Math.PI) / 180;
  const a = c * Math.cos(radians);
  const b = c * Math.sin(radians);
  const l_ = (l + 0.3963377773761749 * a + 0.2158037573099136 * b) ** 3;
  const m_ = (l - 0.1055613458156586 * a - 0.0638541728258133 * b) ** 3;
  const s_ = (l - 0.0894841775298119 * a - 1.2914855480194092 * b) ** 3;
  return [
    4.0767416360759583 * l_ - 3.3077115392580629 * m_ + 0.2309699031821043 * s_,
    -1.2684380040921763 * l_ + 2.6097574006633715 * m_ - 0.3413193963102197 * s_,
    -0.0041960865418371 * l_ - 0.7034186179359362 * m_ + 1.7076147010309444 * s_,
  ];
}

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));
const encode = (linear: number): number =>
  linear <= 0.0031308 ? 12.92 * linear : 1.055 * linear ** (1 / 2.4) - 0.055;
const decode = (encoded: number): number =>
  encoded <= 0.04045 ? encoded / 12.92 : ((encoded + 0.055) / 1.055) ** 2.4;

function inGamut(linear: Linear): boolean {
  return linear.every((value) => value >= -GAMUT_EPSILON && value <= 1 + GAMUT_EPSILON);
}

function luminance(linear: Linear): number {
  const [r, g, b] = linear.map(clamp01) as unknown as Linear;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: Linear, b: Linear): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (light + 0.05) / (dark + 0.05);
}

/** `colour` composited over `surface` in sRGB-encoded space. */
function compositeOver(colour: Oklch, surface: Linear): Linear {
  const top = oklchToLinear(colour).map((value) => encode(clamp01(value)));
  const bottom = surface.map((value) => encode(clamp01(value)));
  return top.map((value, i) =>
    decode(value * colour.alpha + (bottom[i] ?? 0) * (1 - colour.alpha)),
  ) as unknown as Linear;
}

// --- tokens to colours -----------------------------------------------------------------------------------------------

function colourOf(token: string, scheme: Scheme, tokens: ReadonlyMap<string, string>): Oklch {
  const value = tokens.get(token);
  if (value === undefined) throw new Error(`${token} is not declared in tokens.css`);
  return parseOklch(resolveValue(value, scheme, tokens));
}

/**
 * The colour a chain of tokens paints: `'--mc-brand-soft over --mc-bg-alt'` is the soft fill composited over the
 * alt surface. The last link is the opaque base.
 */
function paint(chain: string, scheme: Scheme, tokens: ReadonlyMap<string, string>): Linear {
  const links = chain.split(' over ').map((link) => colourOf(link.trim(), scheme, tokens));
  const base = links.pop();
  if (base === undefined || base.alpha !== 1) throw new Error(`${chain} has no opaque base`);
  return links.reduceRight((below, colour) => compositeOver(colour, below), oklchToLinear(base));
}

interface Pair {
  readonly name: string;
  readonly foreground: string;
  readonly surface: string;
  readonly floor: number;
  /** The spec table's figure per scheme; absent where the spec prints none (the prefers-contrast block). */
  readonly expected?: Readonly<Record<Scheme, number>>;
}

const pair = (
  name: string,
  foreground: string,
  surface: string,
  floor: number,
  light?: number,
  dark?: number,
): Pair =>
  light === undefined || dark === undefined
    ? { name, foreground, surface, floor }
    : { name, foreground, surface, floor, expected: { light, dark } };

// design-final.md 2.1, contrast table, row by row. Fourteen printed figures are not reproduced, and the figures below are the
// recomputed ones: every pair whose surface is a soft fill composited over another surface (the sidebar pill and its bar,
// the active palette row, the feature tile, the container titles) was printed from final-pairs.mjs, which passes an already
// linear colour to over(), and over() converts OKLCH to linear again. The pill in light was printed 5.55 and is 5.14; a hex
// computation (#b91c1c on #dc2626 at 10% over #f4f6fa) gives 5.14. Printed -> recomputed, light / dark: pill and bar 5.55 / 5.65
// -> 5.14 / 6.25; active palette row 5.98 / 4.95 -> 5.55 / 5.57; feature tile 5.29 / 4.67 -> 4.89 / 5.28; tip title dark
// 9.28 -> 8.70; warning title 5.33 / 9.93 -> 5.39 / 9.28; danger title light 5.60 -> 5.54; important title dark 7.36 -> 7.06;
// note title dark 8.28 -> 7.82. Every floor still holds.
const TABLE: readonly Pair[] = [
  pair('text-1 on bg', '--mc-text-1', '--mc-bg', 4.5, 16.38, 16.16),
  pair('text-1 on bg-alt', '--mc-text-1', '--mc-bg-alt', 4.5, 15.45, 16.75),
  pair('text-2 on bg', '--mc-text-2', '--mc-bg', 4.5, 8.3, 9.81),
  pair('text-2 on bg-alt', '--mc-text-2', '--mc-bg-alt', 4.5, 7.84, 10.16),
  pair('text-2 on bg-soft', '--mc-text-2', '--mc-bg-soft', 4.5, 7.45, 8.89),
  pair('text-3 on bg', '--mc-text-3', '--mc-bg', 4.5, 5.88, 6.57),
  pair('text-3 on bg-soft', '--mc-text-3', '--mc-bg-soft', 4.5, 5.28, 5.96),
  pair('brand-1 on bg', '--mc-brand-1', '--mc-bg', 4.5, 6.33, 7.12),
  pair('brand-1 on bg-alt', '--mc-brand-1', '--mc-bg-alt', 4.5, 5.97, 7.38),
  pair('brand-1 on bg-soft', '--mc-brand-1', '--mc-bg-soft', 4.5, 5.68, 6.45),
  pair(
    'brand-1 on the active sidebar pill',
    '--mc-brand-1',
    '--mc-brand-soft over --mc-bg-alt',
    4.5,
    5.14,
    6.25,
  ),
  pair(
    'brand-1 match on the active palette row',
    '--mc-brand-1',
    '--mc-brand-soft over --mc-bg-elv',
    4.5,
    5.55,
    5.57,
  ),
  pair('brand-1 match on a plain palette row', '--mc-brand-1', '--mc-bg-elv', 4.5, 6.48, 6.75),
  pair('brand-2 (hover) on bg', '--mc-brand-2', '--mc-bg', 4.5, 8.07, 9.72),
  pair('white on button rest', '--mc-button-text', '--mc-button-bg', 4.5, 4.83, 4.83),
  pair('white on button hover', '--mc-button-text', '--mc-button-hover-bg', 4.5, 6.48, 6.48),
  pair('white on button active', '--mc-button-text', '--mc-button-active-bg', 4.5, 8.26, 8.26),
  pair(
    'code-ink on code-bg over bg',
    '--mc-code-ink',
    '--mc-code-bg over --mc-bg',
    4.5,
    10.75,
    11.13,
  ),
  pair(
    'code-ink on code-bg over bg-soft',
    '--mc-code-ink',
    '--mc-code-bg over --mc-bg-soft',
    4.5,
    9.66,
    9.78,
  ),
  pair('hero name start stop (brand-3) on bg', '--mc-brand-3', '--mc-bg', 3, 4.72, 3.93),
  pair('hero name end stop on bg', '--mc-hero-name-end', '--mc-bg', 3, 6.33, 7.12),
  pair('focus ring (brand-3) on bg', '--mc-brand-3', '--mc-bg', 3, 4.72, 3.93),
  pair('border-strong on bg', '--mc-border-strong', '--mc-bg', 3, 3.87, 3.15),
  pair(
    'sidebar active bar (brand-1) on the pill',
    '--mc-brand-1',
    '--mc-brand-soft over --mc-bg-alt',
    3,
    5.14,
    6.25,
  ),
  pair(
    'feature icon (brand-1) on its brand-soft tile over bg-soft',
    '--mc-brand-1',
    '--mc-brand-soft over --mc-bg-soft',
    3,
    4.89,
    5.28,
  ),
  pair('tip title on its soft fill', '--mc-tip-1', '--mc-tip-soft over --mc-bg', 4.5, 5.59, 8.7),
  pair(
    'warning title on its soft fill',
    '--mc-warning-1',
    '--mc-warning-soft over --mc-bg',
    4.5,
    5.39,
    9.28,
  ),
  pair(
    'danger title on its soft fill',
    '--mc-brand-1',
    '--mc-danger-soft over --mc-bg',
    4.5,
    5.54,
    6.15,
  ),
  pair(
    'important title on its soft fill',
    '--mc-important-1',
    '--mc-important-soft over --mc-bg',
    4.5,
    6.23,
    7.06,
  ),
  pair('note title on its soft fill', '--mc-note-1', '--mc-note-soft over --mc-bg', 4.5, 5.9, 7.82),
];

// design-final.md 4.6, the 13 Shiki colours on the code-block surface (bg-alt)
const SHIKI: readonly Pair[] = [
  pair('foreground', '--shiki-foreground', '--mc-bg-alt', 4.5, 15.45, 15.52),
  pair('comment', '--shiki-token-comment', '--mc-bg-alt', 4.5, 5.55, 6.81),
  pair('keyword', '--shiki-token-keyword', '--mc-bg-alt', 4.5, 5.97, 8.0),
  pair('string', '--shiki-token-string', '--mc-bg-alt', 4.5, 5.96, 11.86),
  pair('string-expression', '--shiki-token-string-expression', '--mc-bg-alt', 4.5, 5.96, 11.86),
  pair('function', '--shiki-token-function', '--mc-bg-alt', 4.5, 6.89, 9.52),
  pair('constant', '--shiki-token-constant', '--mc-bg-alt', 4.5, 5.72, 11.44),
  pair('parameter', '--shiki-token-parameter', '--mc-bg-alt', 4.5, 7.81, 12.11),
  pair('punctuation', '--shiki-token-punctuation', '--mc-bg-alt', 4.5, 6.88, 7.91),
  pair('link', '--shiki-token-link', '--mc-bg-alt', 4.5, 5.97, 7.38),
  pair('inserted', '--shiki-token-inserted', '--mc-bg-alt', 4.5, 5.96, 11.13),
  pair('deleted', '--shiki-token-deleted', '--mc-bg-alt', 4.5, 5.97, 7.38),
  pair('changed', '--shiki-token-changed', '--mc-bg-alt', 4.5, 5.69, 11.92),
];

/** The pairs that stay text or meaningful non-text under `prefers-contrast: more`; the spec prints no figures for them. */
const MORE_CONTRAST: readonly Pair[] = [
  ...TABLE.map((entry) => pair(entry.name, entry.foreground, entry.surface, entry.floor)),
  pair('text-2 (now text-1) on bg-soft', '--mc-text-2', '--mc-bg-soft', 4.5),
  pair('text-3 (now text-1) on bg-soft', '--mc-text-3', '--mc-bg-soft', 4.5),
  pair(
    'caution title on its soft fill',
    '--vp-c-caution-1',
    '--vp-c-caution-soft over --mc-bg',
    4.5,
  ),
  pair('divider (now border-strong) on bg', '--mc-divider', '--mc-bg', 3),
];

function ratio(entry: Pair, scheme: Scheme, tokens: ReadonlyMap<string, string>): number {
  return contrast(paint(entry.foreground, scheme, tokens), paint(entry.surface, scheme, tokens));
}

/** One message per pair and scheme that is under its floor or off the printed figure; empty when every pair holds. */
function violations(
  entries: readonly Pair[],
  tokens: ReadonlyMap<string, string>,
): readonly string[] {
  const found: string[] = [];
  for (const entry of entries) {
    for (const scheme of SCHEMES) {
      const computed = ratio(entry, scheme, tokens);
      const label = `${entry.name} (${scheme}) = ${computed.toFixed(2)}`;
      if (computed < entry.floor) found.push(`${label} is under the ${entry.floor}:1 floor`);
      const printed = entry.expected?.[scheme];
      if (printed !== undefined && Math.abs(computed - printed) > TABLE_TOLERANCE) {
        found.push(`${label} is more than ${TABLE_TOLERANCE} from the table figure ${printed}`);
      }
    }
  }
  return found;
}

// Token values. EXPECTED_BASE is every --mc-* and --shiki-* declaration of the base blocks, EXPECTED_CONTRAST the declarations of
// the prefers-contrast: more block, whitespace-normalised. The colour values are design-final.md 2.1 (lines 55-92) and 4.6, typed
// out here; the rest are the documented derivations: each container's -2 is its -1 at L - 0.05 and -3 equals -1 (2.1), with the
// light -2 chroma of tip, warning and note cut to the sRGB edge (0.103, 0.101, 0.119: the largest three-decimal chroma inside
// sRGB at this file's 1e-4 tolerance; tip-2 at 0.104 overshoots by 0.00011); spacing, radius, motion are 2.3; the
// prefers-contrast block is 8 with the light crimson fills at 16% (a 20% fill leaves brand-1 text under 4.5:1).
const EXPECTED_BASE: readonly (readonly [string, string])[] = [
  ['--mc-bg', 'light-dark(oklch(0.992 0.003 273), oklch(0.177 0.051 273))'],
  ['--mc-bg-alt', 'light-dark(oklch(0.972 0.006 273), oklch(0.152 0.044 273))'],
  ['--mc-bg-soft', 'light-dark(oklch(0.955 0.009 273), oklch(0.225 0.055 273))'],
  ['--mc-bg-elv', 'light-dark(oklch(1 0 0), oklch(0.205 0.055 273))'],
  ['--mc-text-1', 'light-dark(oklch(0.235 0.045 273), oklch(0.945 0.012 273))'],
  ['--mc-text-2', 'light-dark(oklch(0.42 0.035 273), oklch(0.79 0.025 273))'],
  ['--mc-text-3', 'light-dark(oklch(0.5 0.03 273), oklch(0.68 0.03 273))'],
  ['--mc-divider', 'light-dark(oklch(0.905 0.012 273), oklch(0.29 0.045 273))'],
  ['--mc-border-strong', 'light-dark(oklch(0.6 0.025 273), oklch(0.5 0.04 273))'],
  ['--mc-brand-1', 'light-dark(oklch(0.505 0.19 27.5), oklch(0.72 0.165 22))'],
  ['--mc-brand-2', 'light-dark(oklch(0.445 0.16 27), oklch(0.8 0.11 20))'],
  ['--mc-brand-3', 'oklch(0.577 0.215 27.3)'],
  ['--mc-brand-soft', 'light-dark(oklch(0.577 0.215 27.3 / 10%), oklch(0.72 0.165 22 / 14%))'],
  ['--mc-hero-name-end', 'light-dark(oklch(0.505 0.19 27.5), oklch(0.72 0.165 22))'],
  ['--mc-button-bg', 'oklch(0.577 0.215 27.3)'],
  ['--mc-button-hover-bg', 'oklch(0.505 0.19 27.5)'],
  ['--mc-button-active-bg', 'oklch(0.445 0.16 27)'],
  ['--mc-button-text', 'oklch(1 0 0)'],
  ['--mc-code-ink', 'light-dark(oklch(0.33 0.07 273), oklch(0.88 0.035 273))'],
  ['--mc-code-bg', 'light-dark(oklch(0.235 0.045 273 / 6%), oklch(0.945 0.012 273 / 8%))'],
  ['--mc-tip-1', 'light-dark(oklch(0.47 0.11 155), oklch(0.8 0.14 155))'],
  ['--mc-tip-2', 'light-dark(oklch(0.42 0.103 155), oklch(0.75 0.14 155))'],
  ['--mc-tip-3', 'light-dark(oklch(0.47 0.11 155), oklch(0.8 0.14 155))'],
  ['--mc-tip-soft', 'light-dark(oklch(0.47 0.11 155 / 8%), oklch(0.8 0.14 155 / 12%))'],
  ['--mc-warning-1', 'light-dark(oklch(0.5 0.105 65), oklch(0.84 0.13 80))'],
  ['--mc-warning-2', 'light-dark(oklch(0.45 0.101 65), oklch(0.79 0.13 80))'],
  ['--mc-warning-3', 'light-dark(oklch(0.5 0.105 65), oklch(0.84 0.13 80))'],
  ['--mc-warning-soft', 'light-dark(oklch(0.5 0.105 65 / 8%), oklch(0.84 0.13 80 / 12%))'],
  ['--mc-important-1', 'light-dark(oklch(0.48 0.2 293), oklch(0.76 0.13 293))'],
  ['--mc-important-2', 'light-dark(oklch(0.43 0.2 293), oklch(0.71 0.13 293))'],
  ['--mc-important-3', 'light-dark(oklch(0.48 0.2 293), oklch(0.76 0.13 293))'],
  ['--mc-important-soft', 'light-dark(oklch(0.48 0.2 293 / 8%), oklch(0.76 0.13 293 / 12%))'],
  ['--mc-note-1', 'light-dark(oklch(0.47 0.13 250), oklch(0.78 0.11 245))'],
  ['--mc-note-2', 'light-dark(oklch(0.42 0.119 250), oklch(0.73 0.11 245))'],
  ['--mc-note-3', 'light-dark(oklch(0.47 0.13 250), oklch(0.78 0.11 245))'],
  ['--mc-note-soft', 'light-dark(oklch(0.47 0.13 250 / 8%), oklch(0.78 0.11 245 / 12%))'],
  ['--mc-danger-soft', 'light-dark(oklch(0.505 0.19 27.5 / 8%), oklch(0.72 0.165 22 / 12%))'],
  ['--mc-nav-glass', 'light-dark(oklch(0.992 0.003 273 / 80%), oklch(0.177 0.051 273 / 80%))'],
  ['--shiki-foreground', 'light-dark(oklch(0.235 0.045 273), oklch(0.92 0.015 273))'],
  ['--shiki-background', 'transparent'],
  ['--shiki-token-comment', 'light-dark(oklch(0.5 0.03 273), oklch(0.68 0.03 273))'],
  ['--shiki-token-keyword', 'light-dark(oklch(0.505 0.19 27.5), oklch(0.74 0.15 22))'],
  ['--shiki-token-string', 'light-dark(oklch(0.47 0.11 155), oklch(0.82 0.13 155))'],
  ['--shiki-token-string-expression', 'light-dark(oklch(0.47 0.11 155), oklch(0.82 0.13 155))'],
  ['--shiki-token-function', 'light-dark(oklch(0.47 0.19 293), oklch(0.78 0.12 293))'],
  ['--shiki-token-constant', 'light-dark(oklch(0.5 0.11 60), oklch(0.83 0.12 70))'],
  ['--shiki-token-parameter', 'light-dark(oklch(0.42 0.08 255), oklch(0.84 0.06 250))'],
  ['--shiki-token-punctuation', 'light-dark(oklch(0.45 0.03 273), oklch(0.72 0.03 273))'],
  ['--shiki-token-link', 'var(--mc-brand-1)'],
  ['--shiki-token-inserted', 'var(--mc-tip-1)'],
  ['--shiki-token-deleted', 'var(--mc-brand-1)'],
  ['--shiki-token-changed', 'var(--mc-warning-1)'],
  ['--mc-space-1', '0.25rem'],
  ['--mc-space-2', '0.5rem'],
  ['--mc-space-3', '0.75rem'],
  ['--mc-space-4', '1rem'],
  ['--mc-space-5', '1.5rem'],
  ['--mc-space-6', '2rem'],
  ['--mc-space-7', '3rem'],
  ['--mc-space-8', '4rem'],
  ['--mc-space-9', '6rem'],
  ['--mc-space-10', '8rem'],
  ['--mc-radius-xs', '4px'],
  ['--mc-radius-sm', '8px'],
  ['--mc-radius-md', '12px'],
  ['--mc-radius-lg', '16px'],
  ['--mc-radius-xl', '22px'],
  ['--mc-radius-pill', '999px'],
  ['--mc-dur-1', '120ms'],
  ['--mc-dur-2', '200ms'],
  ['--mc-dur-3', '320ms'],
  ['--mc-dur-4', '500ms'],
  ['--mc-ease-standard', 'cubic-bezier(0.2, 0, 0, 1)'],
  ['--mc-ease-out', 'cubic-bezier(0.16, 1, 0.3, 1)'],
  [
    '--mc-ease-spring',
    'linear(0, 0.009, 0.035 2.1%, 0.141, 0.281 6.7%, 0.723 12.9%, 0.938 16.7%, 1.017, 1.077, 1.121, 1.149 24.3%, 1.159, 1.163, 1.161, 1.154 29.9%, 1.129 32%, 1.051 36.4%, 1.017 38.8%, 0.991, 0.977 43%, 0.974 44.8%, 0.975 47.2%, 0.997 53.3%, 1.003 55.5%, 1.003 58.1%, 1 63.2%, 0.999 70.2%, 1)',
  ],
];

const EXPECTED_CONTRAST: readonly (readonly [string, string])[] = [
  ['--mc-divider', 'var(--mc-border-strong)'],
  ['--mc-text-2', 'var(--mc-text-1)'],
  ['--mc-text-3', 'var(--mc-text-1)'],
  ['--mc-brand-soft', 'light-dark(oklch(0.577 0.215 27.3 / 16%), oklch(0.72 0.165 22 / 20%))'],
  ['--mc-tip-soft', 'light-dark(oklch(0.47 0.11 155 / 20%), oklch(0.8 0.14 155 / 20%))'],
  ['--mc-warning-soft', 'light-dark(oklch(0.5 0.105 65 / 20%), oklch(0.84 0.13 80 / 20%))'],
  ['--mc-important-soft', 'light-dark(oklch(0.48 0.2 293 / 20%), oklch(0.76 0.13 293 / 20%))'],
  ['--mc-note-soft', 'light-dark(oklch(0.47 0.13 250 / 20%), oklch(0.78 0.11 245 / 20%))'],
  ['--mc-danger-soft', 'light-dark(oklch(0.505 0.19 27.5 / 16%), oklch(0.72 0.165 22 / 20%))'],
];

const normalise = (value: string): string =>
  value.replace(/\s+/g, ' ').replace(/\( /g, '(').replace(/ \)/g, ')').trim();

/** The tokens of a block this file owns (the bridge's --vp-* variables are not values of the design), as sorted "name: value". */
function ownTokens(tokens: ReadonlyMap<string, string>): readonly string[] {
  return [...tokens]
    .filter(([name]) => name.startsWith('--mc-') || name.startsWith('--shiki-'))
    .map(([name, value]) => `${name}: ${normalise(value)}`)
    .sort();
}

const expectedLines = (table: readonly (readonly [string, string])[]): readonly string[] =>
  table.map(([name, value]) => `${name}: ${value}`).sort();

describe('docs colour tokens (tokens.css)', () => {
  it('declares exactly the token values of the spec, none missing and none extra', () => {
    expect(ownTokens(baseTokens)).toEqual(expectedLines(EXPECTED_BASE));
  });

  it('declares exactly the prefers-contrast overrides of the spec', () => {
    expect(ownTokens(contrastOverrides)).toEqual(expectedLines(EXPECTED_CONTRAST));
  });

  it('reads the base tokens and the prefers-contrast overrides', () => {
    expect(baseTokens.size).toBeGreaterThan(60);
    expect([...contrastOverrides.keys()].sort()).toEqual([
      '--mc-brand-soft',
      '--mc-danger-soft',
      '--mc-divider',
      '--mc-important-soft',
      '--mc-note-soft',
      '--mc-text-2',
      '--mc-text-3',
      '--mc-tip-soft',
      '--mc-warning-soft',
    ]);
  });

  it('every token is inside the sRGB gamut, in both schemes and under prefers-contrast: more', () => {
    const outside: string[] = [];
    let checked = 0;
    for (const tokens of [baseTokens, moreContrastTokens]) {
      for (const [name, value] of tokens) {
        if (!name.startsWith('--mc-') && !name.startsWith('--shiki-')) continue;
        for (const scheme of SCHEMES) {
          for (const [text] of resolveValue(value, scheme, tokens).matchAll(/oklch\([^)]*\)/g)) {
            const linear = oklchToLinear(parseOklch(text));
            if (!inGamut(linear)) outside.push(`${name} (${scheme}) ${text}`);
            checked++;
          }
        }
      }
    }
    expect(outside).toEqual([]);
    expect(checked).toBeGreaterThan(150);
  });

  it('meets every pair of the 2.1 contrast table, both schemes, within 0.05 of the table figure (recomputed where the spec printed it wrongly)', () => {
    expect(violations(TABLE, baseTokens)).toEqual([]);
  });

  it('keeps the primary button above 4.5:1 white-on-fill in all three states, in both schemes', () => {
    for (const scheme of SCHEMES) {
      for (const fill of ['--mc-button-bg', '--mc-button-hover-bg', '--mc-button-active-bg']) {
        const computed = contrast(
          paint('--mc-button-text', scheme, baseTokens),
          paint(fill, scheme, baseTokens),
        );
        expect(computed, `${fill} (${scheme})`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('keeps both hero-name gradient stops above the 3:1 large-text floor', () => {
    for (const scheme of SCHEMES) {
      for (const stop of ['--mc-brand-3', '--mc-hero-name-end']) {
        const computed = contrast(
          paint(stop, scheme, baseTokens),
          paint('--mc-bg', scheme, baseTokens),
        );
        expect(computed, `${stop} (${scheme})`).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('the 13 Shiki colours reach 4.5:1 on the code-block surface (bg-alt), within 0.05 of 4.6', () => {
    expect(SHIKI).toHaveLength(13);
    expect(violations(SHIKI, baseTokens)).toEqual([]);
  });

  it('every Shiki variable of the css-variables theme is declared', () => {
    const declared = [...baseTokens.keys()].filter((name) => name.startsWith('--shiki-')).sort();
    expect(declared).toEqual(
      [...SHIKI.map((entry) => entry.foreground), '--shiki-background'].sort(),
    );
  });

  it('keeps the pairs readable under prefers-contrast: more, where the soft fills go to 20% (16% for the two light crimson fills)', () => {
    expect(violations(MORE_CONTRAST, moreContrastTokens)).toEqual([]);
  });
});

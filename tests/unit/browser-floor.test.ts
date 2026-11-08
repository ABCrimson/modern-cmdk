// @vitest-environment node
// tests/unit/browser-floor.test.ts
// CE-29 / R4: the JavaScript browser floor of modern-cmdk, guarded by web-features' data.
//
// tests/unit/browser-floor.json lists the web-features ids the built core and react entries rely on, the AST patterns that prove
// each is still used, the published floor and a deny list of newer APIs. This file builds those entries with the package's own
// packages/modern-cmdk/tsdown.config.ts into a temporary directory (the CI `test` job runs the unit suite without `pnpm build`,
// and packages/modern-cmdk/dist belongs to the suites that read it), parses the output with Vite's parseAst (an ESTree: JSDoc
// comments that mention `await using` or `Map.groupBy` are not code) and checks the list, the deny list and the computed floor
// against the installed web-features.

import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { build, type UserConfig } from 'tsdown';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseAst } from 'vitest/node';
import { features } from 'web-features';
import tsdownConfigs from '../../packages/modern-cmdk/tsdown.config.ts';
import floorConfig from './browser-floor.json' with { type: 'json' };

/** One AST pattern of browser-floor.json; `kind` selects the fields it reads (see the file's $comment). */
interface Pattern {
  readonly kind: string;
  readonly method?: string;
  readonly receiverCall?: readonly string[];
  readonly object?: string;
  readonly property?: string;
  readonly name?: string;
  readonly seed?: string;
}

interface AstNode {
  readonly type: string;
  readonly [key: string]: unknown;
}

type Floor = Readonly<Record<string, string>>;

const PACKAGE_DIR: string = join(import.meta.dirname, '..', '..', 'packages', 'modern-cmdk');
const BROWSERS: readonly string[] = floorConfig.browsers;
const PUBLISHED_FLOOR: Floor = floorConfig.floor;
const LISTED_IDS: readonly string[] = floorConfig.features.map((feature) => feature.id);

// ---------------------------------------------------------------------------------------------------------------------
// web-features
// ---------------------------------------------------------------------------------------------------------------------

type FeatureEntry = NonNullable<(typeof features)[string]>;

function featureOf(id: string): FeatureEntry {
  const entry = features[id];
  if (entry === undefined) {
    throw new Error(`web-features has no id "${id}"`);
  }
  return entry;
}

/** The status of a plain feature; a moved or split id (kind other than 'feature') has none and throws. */
function statusOf(id: string): Extract<FeatureEntry, { kind: 'feature' }>['status'] {
  const entry = featureOf(id);
  if (entry.kind !== 'feature') {
    throw new Error(`web-features id "${id}" has kind "${entry.kind}", not "feature"`);
  }
  return entry.status;
}

// status.support values in web-features 3.45: "N", "N.N", "≤N" and "≤N.N" (the "≤" marks an upper bound: the first
// release is at or before it). The floor takes the bound as the version, the conservative reading.
const VERSION_FORM: RegExp = /^≤?(\d+(?:\.\d+)?)$/u;

/** The numeric segments of a status.support value; any other form throws. */
function versionParts(version: string): number[] {
  const match = VERSION_FORM.exec(version);
  if (match?.[1] === undefined) {
    throw new Error(`unrecognised web-features support value "${version}"`);
  }
  return match[1].split('.').map(Number);
}

/** Negative when a < b, zero when equal, positive when a > b. */
function compareVersions(a: string, b: string): number {
  const left = versionParts(a);
  const right = versionParts(b);
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0);
    if (diff !== 0) {
      return diff;
    }
  }
  return 0;
}

/** A support value without its "≤". */
function plainVersion(version: string): string {
  return versionParts(version).join('.');
}

/** Per browser, the highest status.support version over the ids; an id without an entry for a browser throws. */
function floorOf(ids: readonly string[]): Floor {
  const floor: Record<string, string> = {};
  for (const browser of BROWSERS) {
    let highest: string | undefined;
    for (const id of ids) {
      const version = statusOf(id).support[browser as keyof ReturnType<typeof statusOf>['support']];
      if (version === undefined) {
        throw new Error(`web-features "${id}" has no ${browser} entry in status.support`);
      }
      if (highest === undefined || compareVersions(version, highest) > 0) {
        highest = plainVersion(version);
      }
    }
    if (highest !== undefined) {
      floor[browser] = highest;
    }
  }
  return floor;
}

/** One line per id that is not a Baseline (low or high) plain feature. */
function baselineProblems(ids: readonly string[]): string[] {
  const problems: string[] = [];
  for (const id of ids) {
    const entry = features[id];
    if (entry === undefined || entry.kind !== 'feature') {
      problems.push(`${id}: not a web-features feature`);
    } else if (entry.status.baseline !== 'low' && entry.status.baseline !== 'high') {
      problems.push(`${id}: Baseline is ${String(entry.status.baseline)}`);
    }
  }
  return problems;
}

/** A deny entry is justified while some browser's support is newer than the floor, or the feature is not Baseline. */
function exceedsFloor(id: string, floor: Floor): boolean {
  const status = statusOf(id);
  if (status.baseline === false) {
    return true;
  }
  return BROWSERS.some((browser) => {
    const version = status.support[browser as keyof typeof status.support];
    const bound = floor[browser];
    return version === undefined || (bound !== undefined && compareVersions(version, bound) > 0);
  });
}

// ---------------------------------------------------------------------------------------------------------------------
// AST patterns
// ---------------------------------------------------------------------------------------------------------------------

function isNode(value: unknown): value is AstNode {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { type?: unknown }).type === 'string'
  );
}

function visit(node: unknown, callback: (node: AstNode) => void): void {
  if (Array.isArray(node)) {
    for (const child of node) {
      visit(child, callback);
    }
    return;
  }
  if (!isNode(node)) {
    return;
  }
  callback(node);
  for (const [key, child] of Object.entries(node)) {
    if (key !== 'type') {
      visit(child, callback);
    }
  }
}

/** The static name of a member access: `a.b` and `a['b']`. */
function memberName(node: unknown): string | undefined {
  if (!isNode(node) || node.type !== 'MemberExpression' || !isNode(node.property)) {
    return undefined;
  }
  if (node.computed !== true && node.property.type === 'Identifier') {
    return node.property.name as string;
  }
  if (
    node.computed === true &&
    node.property.type === 'Literal' &&
    typeof node.property.value === 'string'
  ) {
    return node.property.value;
  }
  return undefined;
}

function required(pattern: Pattern, field: 'method' | 'object' | 'property' | 'name'): string {
  const value = pattern[field];
  if (value === undefined) {
    throw new Error(`pattern ${JSON.stringify(pattern)} needs "${field}"`);
  }
  return value;
}

function matches(node: AstNode, pattern: Pattern): boolean {
  switch (pattern.kind) {
    case 'call': {
      if (
        node.type !== 'CallExpression' ||
        memberName(node.callee) !== required(pattern, 'method')
      ) {
        return false;
      }
      if (pattern.receiverCall === undefined) {
        return true;
      }
      const receiver = (node.callee as AstNode).object;
      const call =
        isNode(receiver) && receiver.type === 'ChainExpression' ? receiver.expression : receiver;
      if (!isNode(call) || call.type !== 'CallExpression') {
        return false;
      }
      const name = memberName(call.callee);
      return name !== undefined && pattern.receiverCall.includes(name);
    }
    case 'member': {
      if (memberName(node) !== required(pattern, 'property')) {
        return false;
      }
      if (pattern.object === undefined) {
        return true;
      }
      const target = (node as AstNode).object;
      // `Promise.try` and `globalThis.Promise.try`
      return (
        (isNode(target) && target.type === 'Identifier' && target.name === pattern.object) ||
        memberName(target) === pattern.object
      );
    }
    case 'identifier':
      return node.type === 'Identifier' && node.name === required(pattern, 'name');
    case 'using':
      return (
        node.type === 'VariableDeclaration' &&
        (node.kind === 'using' || node.kind === 'await using')
      );
    default:
      throw new Error(`unknown pattern kind "${pattern.kind}"`);
  }
}

/** The indices of the patterns that match at least once in any of the sources (file name -> text). */
function matchedPatterns(
  sources: ReadonlyMap<string, string>,
  patterns: readonly Pattern[],
): Set<number> {
  const found = new Set<number>();
  for (const [file, text] of sources) {
    visit(parseAst(text, null, file), (node) => {
      patterns.forEach((pattern, index) => {
        if (!found.has(index) && matches(node, pattern)) {
          found.add(index);
        }
      });
    });
  }
  return found;
}

const FEATURE_PATTERNS: readonly { readonly id: string; readonly pattern: Pattern }[] =
  floorConfig.features.flatMap((feature) =>
    feature.patterns.map((pattern) => ({ id: feature.id, pattern })),
  );

const DENY_PATTERNS: readonly { readonly id: string; readonly pattern: Pattern }[] =
  floorConfig.deny.flatMap((entry) => entry.patterns.map((pattern) => ({ id: entry.id, pattern })));

/** Listed patterns that match nowhere in the sources, as `id: {pattern}`. */
function staleFeaturePatterns(sources: ReadonlyMap<string, string>): string[] {
  const found = matchedPatterns(
    sources,
    FEATURE_PATTERNS.map((entry) => entry.pattern),
  );
  return FEATURE_PATTERNS.filter((_, index) => !found.has(index)).map(
    (entry) => `${entry.id}: ${JSON.stringify(entry.pattern)}`,
  );
}

/** The ids of the deny entries that have a pattern matching in the sources. */
function denyViolations(sources: ReadonlyMap<string, string>): string[] {
  const found = matchedPatterns(
    sources,
    DENY_PATTERNS.map((entry) => entry.pattern),
  );
  return [
    ...new Set(DENY_PATTERNS.filter((_, index) => found.has(index)).map((entry) => entry.id)),
  ];
}

// ---------------------------------------------------------------------------------------------------------------------
// The disposal-symbol shim (R7, CE-29, CE-30)
// ---------------------------------------------------------------------------------------------------------------------

const DISPOSAL_SYMBOLS: readonly string[] = ['dispose', 'asyncDispose'];

/** `Symbol.<name>`: a member access on the global identifier `Symbol`. */
function isSymbolMember(node: unknown, name: string): node is AstNode {
  return (
    isNode(node) &&
    memberName(node) === name &&
    isNode(node.object) &&
    node.object.type === 'Identifier' &&
    node.object.name === 'Symbol'
  );
}

function startOf(node: AstNode): number {
  return node.start as number;
}

/** The top-level `Symbol.<name> ??= Symbol.for('Symbol.<name>')` statements of a module body. */
function shimStatements(program: AstNode, name: string): AstNode[] {
  return (program.body as AstNode[]).filter((statement) => {
    if (statement.type !== 'ExpressionStatement' || !isNode(statement.expression)) {
      return false;
    }
    const { expression } = statement;
    const right = expression.right;
    return (
      expression.type === 'AssignmentExpression' &&
      expression.operator === '??=' &&
      isSymbolMember(expression.left, name) &&
      isNode(right) &&
      right.type === 'CallExpression' &&
      isSymbolMember(right.callee, 'for') &&
      (right.arguments as AstNode[]).length === 1 &&
      (right.arguments as AstNode[])[0]?.type === 'Literal' &&
      (right.arguments as AstNode[])[0]?.value === `Symbol.${name}`
    );
  });
}

/** Every `Symbol.<name>` read in the module other than the shim's own left side (computed keys, `x[Symbol.dispose]`, helpers). */
function disposalReaders(program: AstNode, name: string, shims: readonly AstNode[]): AstNode[] {
  const own = new Set<unknown>(shims.map((shim) => (shim.expression as AstNode).left));
  const readers: AstNode[] = [];
  visit(program, (node) => {
    if (isSymbolMember(node, name) && !own.has(node)) {
      readers.push(node);
    }
  });
  return readers;
}

/** Whether an initializer runs no code of the module's own: a literal, a template without expressions, a function or an arrow. */
function isInertInit(init: unknown): boolean {
  if (init === null || init === undefined) {
    return true;
  }
  if (!isNode(init)) {
    return false;
  }
  return (
    init.type === 'Literal' ||
    init.type === 'FunctionExpression' ||
    init.type === 'ArrowFunctionExpression' ||
    (init.type === 'TemplateLiteral' && (init.expressions as unknown[]).length === 0)
  );
}

/** Whether a top-level statement runs nothing when evaluated: an import, a function declaration, or a declaration of inert initializers. */
function isInertStatement(statement: AstNode): boolean {
  switch (statement.type) {
    case 'ImportDeclaration':
    case 'FunctionDeclaration':
      return true;
    case 'VariableDeclaration':
      return (statement.declarations as AstNode[]).every((declarator) =>
        isInertInit(declarator.init),
      );
    case 'ExportNamedDeclaration':
      return (
        !isNode(statement.declaration) ||
        (statement.declaration.type !== 'ClassDeclaration' &&
          isInertStatement(statement.declaration))
      );
    default:
      return false;
  }
}

/**
 * One line per violation of "the shim precedes the first read of the symbol" in an ES module's text; empty when it holds.
 *
 * Why source position is evaluation order here: the bundle is one flat ES module, whose top-level statements run in source order
 * once its imports have been evaluated. A class declaration is not hoisted and evaluates its computed keys when its statement
 * runs; a hoisted function declaration runs nothing until it is called, and a call can only come from a top-level statement
 * or from another module that imports this one (after the whole body ran). A read whose own text starts after the shim is
 * therefore safe only if no earlier statement can call it, so the check has two halves: (1) no read starts before the shim, and
 * (2) every top-level statement before a symbol's shim is inert (an import, a function declaration, or a variable declaration
 * whose initializers are literals, expression-free templates, functions or arrows; the other symbol's shim statement is exempt).
 * Together they guarantee that nothing which reads the symbol can run before its shim, the failure on a runtime without the
 * symbol (Safari 18.4: both keys become the property "undefined", and the async disposer would be the sync one). A call
 * statement, a class, or any other code before the shim is reported with its type and offset.
 */
function disposalShimProblems(text: string, file: string): string[] {
  const program = parseAst(text, null, file) as unknown as AstNode;
  const problems: string[] = [];
  const shimsOf = DISPOSAL_SYMBOLS.flatMap((name) => shimStatements(program, name));
  for (const name of DISPOSAL_SYMBOLS) {
    const shims = shimStatements(program, name);
    if (shims.length !== 1) {
      problems.push(
        `${file}: Symbol.${name}: expected exactly one top-level "Symbol.${name} ??= Symbol.for('Symbol.${name}')" statement, found ${shims.length}`,
      );
      continue;
    }
    const readers = disposalReaders(program, name, shims);
    const first = readers.reduce<AstNode | undefined>(
      (earliest, node) =>
        earliest === undefined || startOf(node) < startOf(earliest) ? node : earliest,
      undefined,
    );
    const shim = shims[0] as AstNode;
    if (first !== undefined && startOf(shim) >= startOf(first)) {
      problems.push(
        `${file}: Symbol.${name}: the shim starts at offset ${startOf(shim)}, not before the first read at offset ${startOf(first)}`,
      );
      continue;
    }
    for (const statement of program.body as AstNode[]) {
      if (startOf(statement) >= startOf(shim)) {
        break;
      }
      if (!isInertStatement(statement) && !shimsOf.some((other) => other === statement)) {
        problems.push(
          `${file}: Symbol.${name}: the top-level ${statement.type} at offset ${startOf(statement)} runs before the shim at offset ${startOf(shim)}`,
        );
      }
    }
  }
  return problems;
}

/** Whether the module reads Symbol.dispose or Symbol.asyncDispose at all (shim statements included). */
function readsDisposalSymbols(text: string, file: string): boolean {
  let found = false;
  visit(parseAst(text, null, file), (node) => {
    found ||= DISPOSAL_SYMBOLS.some((name) => isSymbolMember(node, name));
  });
  return found;
}

/** One line when the module reads a disposal symbol without importing 'modern-cmdk' (whose core evaluates, with its shim, first). */
function coreImportProblems(text: string, file: string): string[] {
  if (!readsDisposalSymbols(text, file)) {
    return [];
  }
  const program = parseAst(text, null, file) as unknown as AstNode;
  const imported = (program.body as AstNode[]).some(
    (statement) =>
      statement.type === 'ImportDeclaration' &&
      isNode(statement.source) &&
      statement.source.value === 'modern-cmdk',
  );
  return imported
    ? []
    : [`${file}: reads Symbol.dispose or Symbol.asyncDispose without importing 'modern-cmdk'`];
}

/** The text without the given statements. */
function withoutRanges(text: string, nodes: readonly AstNode[]): string {
  return [...nodes]
    .sort((a, b) => startOf(b) - startOf(a))
    .reduce(
      (current, node) => current.slice(0, startOf(node)) + current.slice(node.end as number),
      text,
    );
}

/** The text of a module with both shim statements removed, or removed and re-appended at its end. */
function coreWithShimMoved(text: string, file: string, where: 'removed' | 'last'): string {
  const program = parseAst(text, null, file) as unknown as AstNode;
  const shims = DISPOSAL_SYMBOLS.flatMap((name) => shimStatements(program, name));
  const stripped = withoutRanges(text, shims);
  return where === 'removed'
    ? stripped
    : `${stripped}\n${shims.map((shim) => text.slice(startOf(shim), shim.end as number)).join('\n')}\n`;
}

// ---------------------------------------------------------------------------------------------------------------------
// The scanned build
// ---------------------------------------------------------------------------------------------------------------------

function entryKeys(config: UserConfig): string[] {
  const entry = config.entry;
  return entry !== undefined && typeof entry === 'object' && !Array.isArray(entry)
    ? Object.keys(entry)
    : [];
}

let outDir = '';
let buildMs = 0;
let builtFiles: string[] = [];
const sources = new Map<string, string>();

beforeAll(async () => {
  // The core config (entry core/index) and the react config (react/index and react/dialog); the codemod config is not scanned.
  const configs = tsdownConfigs.filter((config) =>
    entryKeys(config).some((key) => key === 'core/index' || key.startsWith('react/')),
  );
  expect(configs.map(entryKeys)).toEqual([['core/index'], ['react/index', 'react/dialog']]);

  outDir = await mkdtemp(join(tmpdir(), 'modern-cmdk-floor-'));
  const started = performance.now();
  for (const config of configs) {
    // A fresh outDir (clean: false, so the second config does not delete the first one's output), no declaration files and
    // no `copy` (the react config copies src/react/styles.css into dist/react, relative to cwd).
    const handle = await build({
      ...config,
      config: false,
      cwd: PACKAGE_DIR,
      outDir,
      clean: false,
      dts: false,
      copy: [],
      report: false,
      logLevel: 'error',
    });
    for (const bundle of handle.bundles) {
      await bundle[Symbol.asyncDispose]();
    }
  }
  buildMs = performance.now() - started;

  const react = await readdir(join(outDir, 'react'));
  builtFiles = ['core/index.mjs', ...react.map((name) => `react/${name}`)].sort();
  for (const file of builtFiles.filter((name) => name.endsWith('.mjs'))) {
    sources.set(file, await readFile(join(outDir, file), 'utf8'));
  }
});

afterAll(async () => {
  if (outDir !== '') {
    await rm(outDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

// ---------------------------------------------------------------------------------------------------------------------
// Assertions
// ---------------------------------------------------------------------------------------------------------------------

describe('browser floor: web-features data (CE-29, R4)', () => {
  it('CE-29: the deny set is exactly the R4 ids plus uint8array-base64-hex and is-error, each with string seeds, and the feature list holds the known two', () => {
    expect(floorConfig.deny.map((entry) => entry.id).sort()).toEqual(
      [
        'explicit-resource-management',
        'is-error',
        'iterator-concat',
        'math-sum-precise',
        'promise-try',
        'regexp-escape',
        'uint8array-base64-hex',
      ].sort(),
    );
    for (const entry of floorConfig.deny) {
      expect(entry.patterns.length, entry.id).toBeGreaterThan(0);
      for (const pattern of entry.patterns) {
        expect(typeof pattern.seed, entry.id).toBe('string');
        expect(pattern.seed.length, entry.id).toBeGreaterThan(0);
      }
    }
    expect(LISTED_IDS).toContain('iterator-methods');
    expect(LISTED_IDS).toContain('array-by-copy');
  });

  it('CE-29: every status.support form in the installed web-features is one versionParts reads', () => {
    const versions = Object.values(features).flatMap((entry) =>
      entry.kind === 'feature' ? Object.values(entry.status.support) : [],
    );
    expect(versions.length).toBeGreaterThan(1000);
    expect(versions.map((version) => versionParts(version).length)).not.toContain(0);
  });

  it.each([
    ['2', '10', -1],
    ['18.4', '18.10', -1],
    ['18.4', '18.4', 0],
    ['18', '18.0', 0],
    ['26', '18.4', 1],
    ['≤122', '122', 0],
    ['≤18.4', '18.3', 1],
    ['≤9.1', '9.2', -1],
  ])('CE-29: compareVersions(%s, %s) has the sign of %i', (a, b, sign) => {
    expect(Math.sign(compareVersions(a, b))).toBe(sign);
  });

  it.each(['', 'N/A', '1.2.3', '>=5', '≤', '≤≤5', '18.'])(
    'CE-29: versionParts rejects the unknown form "%s"',
    (value) => {
      expect(() => versionParts(value)).toThrow('unrecognised web-features support value');
    },
  );

  it('CE-29: web-features is installed at the version browser-floor.json names (a bump forces a re-read)', async () => {
    const entry = createRequire(import.meta.url).resolve('web-features');
    const manifest = JSON.parse(await readFile(join(dirname(entry), 'package.json'), 'utf8')) as {
      version: string;
    };
    expect(floorConfig.webFeaturesVersion).toBe(manifest.version);
  });

  it('CE-29: every listed feature exists, has kind "feature" and is Baseline low or high', () => {
    expect(LISTED_IDS.length).toBeGreaterThan(0);
    expect(baselineProblems(LISTED_IDS)).toEqual([]);
  });

  it('CE-29: the floor computed from the listed features equals the published floor', () => {
    expect(floorOf(LISTED_IDS)).toEqual(PUBLISHED_FLOOR);
    expect(Object.keys(PUBLISHED_FLOOR)).toEqual(BROWSERS);
  });

  it("CE-29: a browser missing from a feature's support fails the floor (explicit-resource-management has no safari entry)", () => {
    expect(() => floorOf([...LISTED_IDS, 'explicit-resource-management'])).toThrow(
      'web-features "explicit-resource-management" has no safari entry in status.support',
    );
  });

  it.each(floorConfig.deny.map((entry) => entry.id))(
    'R4: the deny entry %s is still newer than the floor, or not Baseline',
    (id) => {
      expect(exceedsFloor(id, PUBLISHED_FLOOR)).toBe(true);
    },
  );

  it('R4: Array.fromAsync is not denied because web-features gives it Baseline high under the floor', () => {
    const id = 'array-fromasync';
    const entry = featureOf(id);
    expect(entry.kind === 'feature' ? entry.compat_features : undefined).toContain(
      'javascript.builtins.Array.fromAsync',
    );
    expect(floorConfig.deny.map((denied) => denied.id)).not.toContain(id);
    expect(statusOf(id).baseline).toBe('high');
    expect(exceedsFloor(id, PUBLISHED_FLOOR)).toBe(false);
  });
});

describe('browser floor: the built core and react entries (CE-29, R4)', () => {
  it('R4: the scanned build is the core entry, the react entries and their shared chunks, and no stylesheet was copied', () => {
    expect(builtFiles).toContain('core/index.mjs');
    expect(builtFiles).toContain('react/index.mjs');
    expect(builtFiles).toContain('react/dialog.mjs');
    expect(builtFiles.some((file) => /^react\/chunk-.+\.mjs$/.test(file))).toBe(true);
    expect(builtFiles).not.toContain('react/styles.css');
    expect([...sources.keys()].sort()).toEqual(builtFiles);
  });

  it("CE-29: every listed feature's patterns match the built code (the list cannot go stale)", () => {
    expect(staleFeaturePatterns(sources)).toEqual([]);
  });

  it('CE-29: no deny-listed API appears in the built code', () => {
    expect(denyViolations(sources)).toEqual([]);
  });

  it('R4: comments and strings that mention a denied API are not code', () => {
    const text = [
      '/** Promise.try, Math.sumPrecise, RegExp.escape, Iterator.concat, `await using`, DisposableStack. */',
      "const note = 'Promise.try(f) and using x = y';",
      'export { note };',
    ].join('\n');
    expect(denyViolations(new Map([['note.mjs', text]]))).toEqual([]);
  });

  it('R4: the build reports its wall time', () => {
    expect(buildMs).toBeGreaterThan(0);
    process.stdout.write(
      `browser-floor beforeAll: tsdown build of ${builtFiles.length} files in ${buildMs.toFixed(0)} ms\n`,
    );
  });
});

describe('browser floor: the disposal-symbol shim of the built entries (R7, CE-29)', () => {
  const CORE = 'core/index.mjs';
  const core = (): string => sources.get(CORE) ?? '';

  it('R7: the Symbol.dispose and Symbol.asyncDispose shims precede the first computed disposal key in dist/core/index.mjs', () => {
    expect(core().length).toBeGreaterThan(0);
    // Both symbols are read somewhere (the class keys), so the position check is not vacuous.
    const program = parseAst(core(), null, CORE) as unknown as AstNode;
    for (const name of DISPOSAL_SYMBOLS) {
      const shims = shimStatements(program, name);
      expect(disposalReaders(program, name, shims).length, name).toBeGreaterThan(0);
    }
    expect(disposalShimProblems(core(), CORE)).toEqual([]);
  });

  it('R7: every react file that reads Symbol.dispose or Symbol.asyncDispose imports modern-cmdk, so the core and its shim evaluate first', () => {
    const reactFiles = [...sources.keys()].filter((file) => file.startsWith('react/'));
    const readers = reactFiles.filter((file) =>
      readsDisposalSymbols(sources.get(file) ?? '', file),
    );
    expect(readers.length).toBeGreaterThan(0);
    for (const file of reactFiles) {
      expect(coreImportProblems(sources.get(file) ?? '', file)).toEqual([]);
    }
  });

  it.each([
    ['both shim statements removed', 'removed', ['Symbol.dispose', 'Symbol.asyncDispose']],
    [
      'both shim statements moved after the first computed key',
      'last',
      ['Symbol.dispose', 'Symbol.asyncDispose'],
    ],
  ] as const)(
    'R7: a scratch copy of the built core with %s fails naming the symbol',
    (_name, where, symbols) => {
      const problems = disposalShimProblems(coreWithShimMoved(core(), CORE, where), CORE);
      for (const symbol of symbols) {
        expect(problems.filter((problem) => problem.includes(`${symbol}:`))).toHaveLength(1);
      }
      expect(problems).toHaveLength(symbols.length);
    },
  );

  it('R7: a scratch copy of the built core with only the asyncDispose shim removed names only Symbol.asyncDispose', () => {
    const program = parseAst(core(), null, CORE) as unknown as AstNode;
    const text = withoutRanges(core(), shimStatements(program, 'asyncDispose'));
    expect(disposalShimProblems(text, CORE)).toEqual([
      `${CORE}: Symbol.asyncDispose: expected exactly one top-level "Symbol.asyncDispose ??= Symbol.for('Symbol.asyncDispose')" statement, found 0`,
    ]);
  });

  it('R7: a scratch copy of the built core with a top-level call before the shims fails naming the statement', () => {
    const program = parseAst(core(), null, CORE) as unknown as AstNode;
    const shims = DISPOSAL_SYMBOLS.flatMap((name) => shimStatements(program, name));
    const firstShim = Math.min(...shims.map(startOf));
    // `init` is a hoisted function declared after the shims, so every read of the symbol starts after them; only the call
    // statement ahead of the shims makes the read run first.
    const call = 'init();';
    const reader = 'function init() { return { [Symbol.dispose]: () => undefined }; }';
    const text = [core().slice(0, firstShim), call, core().slice(firstShim), reader, ''].join('\n');
    // The join puts a newline before the call, so it starts one character past the original shim offset.
    const problems = disposalShimProblems(text, CORE);
    expect(problems).toHaveLength(DISPOSAL_SYMBOLS.length);
    for (const problem of problems) {
      expect(problem).toContain(
        `the top-level ExpressionStatement at offset ${firstShim + 1} runs before the shim`,
      );
    }
  });

  it('R7: a shim nested in a function (not evaluated at module load) does not count', () => {
    const program = parseAst(core(), null, CORE) as unknown as AstNode;
    const shims = DISPOSAL_SYMBOLS.flatMap((name) => shimStatements(program, name));
    const wrapped = `${withoutRanges(core(), shims)}\nfunction installShims() {\n${shims
      .map((shim) => core().slice(startOf(shim), shim.end as number))
      .join('\n')}\n}\n`;
    expect(disposalShimProblems(wrapped, CORE)).toHaveLength(2);
  });

  it('R7: a scratch copy of a react file with its modern-cmdk import renamed fails naming the file', () => {
    const file = [...sources.keys()].find(
      (name) => name.startsWith('react/') && readsDisposalSymbols(sources.get(name) ?? '', name),
    );
    expect(file).toBeDefined();
    const text = (sources.get(file ?? '') ?? '').replace('from "modern-cmdk"', 'from "other-lib"');
    expect(coreImportProblems(text, file ?? '')).toEqual([
      `${file}: reads Symbol.dispose or Symbol.asyncDispose without importing 'modern-cmdk'`,
    ]);
  });
});

describe('browser floor: the exit gate, a newer API turns the test red (CE-29, R4)', () => {
  const SEEDS: readonly { readonly id: string; readonly seed: string }[] = floorConfig.deny.flatMap(
    (entry) => entry.patterns.map((pattern) => ({ id: entry.id, seed: pattern.seed })),
  );

  it('R4: the unseeded dist/core/index.mjs reports no violation', () => {
    expect(
      denyViolations(new Map([['core/index.mjs', sources.get('core/index.mjs') ?? '']])),
    ).toEqual([]);
  });

  it.each(SEEDS)(
    'R4: seeding "$seed" into dist/core/index.mjs reports exactly $id',
    ({ id, seed }) => {
      const core = sources.get('core/index.mjs');
      expect(core).toBeDefined();
      expect(denyViolations(new Map([['core/index.mjs', `${core}\n${seed}\n`]]))).toEqual([id]);
    },
  );

  it.each(['promise-try', 'math-sum-precise', 'regexp-escape'])(
    'CE-29: adding %s (support above the floor) to the feature list changes the computed floor',
    (id) => {
      expect(floorOf([...LISTED_IDS, id])).not.toEqual(PUBLISHED_FLOOR);
      expect(exceedsFloor(id, PUBLISHED_FLOOR)).toBe(true);
    },
  );

  it('CE-29: adding explicit-resource-management (Baseline false) to the feature list fails the Baseline check', () => {
    expect(baselineProblems([...LISTED_IDS, 'explicit-resource-management'])).toEqual([
      'explicit-resource-management: Baseline is false',
    ]);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// Biome's useBaseline over the shipped stylesheet (R4)
// ---------------------------------------------------------------------------------------------------------------------

const ROOT: string = join(import.meta.dirname, '..', '..');
const BIOME_BIN: string = join(ROOT, 'node_modules', '@biomejs', 'biome', 'bin', 'biome');
const STYLES_PATH = 'packages/modern-cmdk/src/react/styles.css';

interface BiomeOverride {
  readonly includes?: readonly string[];
  readonly linter?: {
    readonly rules?: {
      readonly suspicious?: {
        readonly useBaseline?: {
          readonly level: string;
          readonly options: { available: string; allowProperties: string[] };
        };
      };
    };
  };
}

interface BiomeConfig {
  overrides: BiomeOverride[];
}

const biomeConfigText = readFileSync(join(ROOT, 'biome.json'), 'utf8');
const stylesheet = readFileSync(join(ROOT, STYLES_PATH), 'utf8');

function stylesheetOverride(config: BiomeConfig): BiomeOverride {
  const override = config.overrides.find((entry) => entry.includes?.includes(STYLES_PATH));
  if (override === undefined) {
    throw new Error(`biome.json has no override for ${STYLES_PATH}`);
  }
  return override;
}

/**
 * Runs the installed Biome (no shell) over `css` placed at the stylesheet's repository path in a scratch tree that holds a copy
 * of biome.json, so the real override applies to it; `biome lint --stdin-file-path` reports no diagnostics at all in Biome 2.6.6
 * (it answers "The contents aren't fixed" for every input, even `debugger;` in a .js file), and the stylesheet's path is
 * CORE's file, not written here. --vcs-use-ignore-file=false because the scratch tree has no ignore file.
 */
function lintStylesheet(
  css: string,
  configText: string = biomeConfigText,
): { status: number | null; output: string } {
  const scratch = mkdtempSync(join(tmpdir(), 'modern-cmdk-baseline-'));
  try {
    mkdirSync(dirname(join(scratch, STYLES_PATH)), { recursive: true });
    writeFileSync(join(scratch, 'biome.json'), configText);
    writeFileSync(join(scratch, STYLES_PATH), css);
    const result = spawnSync(
      process.execPath,
      [
        BIOME_BIN,
        'lint',
        STYLES_PATH,
        '--colors=off',
        '--vcs-use-ignore-file=false',
        '--max-diagnostics=100',
      ],
      { cwd: scratch, encoding: 'utf8' },
    );
    return { status: result.status, output: `${result.stdout}${result.stderr}` };
  } finally {
    rmSync(scratch, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}

const ALLOWED_PROPERTIES: readonly string[] = stylesheetOverride(
  JSON.parse(biomeConfigText) as BiomeConfig,
).linter?.rules?.suspicious?.useBaseline?.options.allowProperties ?? ['<missing>'];

describe('browser floor: Biome useBaseline over styles.css (R4)', () => {
  it('R4: the override enables suspicious/useBaseline as an error at the "newly" level for the stylesheet', () => {
    const rule = stylesheetOverride(JSON.parse(biomeConfigText) as BiomeConfig).linter?.rules
      ?.suspicious?.useBaseline;
    expect(rule?.level).toBe('error');
    expect(rule?.options.available).toBe('newly');
  });

  it('R4: the unmodified styles.css passes biome lint', () => {
    const result = lintStylesheet(stylesheet);
    expect(result.output).not.toContain('useBaseline');
    expect(result.status).toBe(0);
  });

  it.each([
    ['a Limited selector', 'a::scroll-marker { color: red; }'],
    ['a Limited media condition', '@media (inverted-colors: inverted) { a { color: red; } }'],
    ['a Limited property', 'a { anchor-name: --seeded; }'],
  ])('R4: appending %s to styles.css fails with lint/suspicious/useBaseline', (_name, rule) => {
    const result = lintStylesheet(`${stylesheet}\n${rule}\n`);
    expect(result.output).toContain('lint/suspicious/useBaseline');
    expect(result.status).not.toBe(0);
  });

  it.each(ALLOWED_PROPERTIES)(
    'R4: the allowed property %s is used by styles.css and reported once its allow entry is removed',
    (property) => {
      const config = JSON.parse(biomeConfigText) as BiomeConfig;
      const options = stylesheetOverride(config).linter?.rules?.suspicious?.useBaseline?.options;
      expect(options?.allowProperties).toContain(property);
      if (options !== undefined) {
        options.allowProperties = options.allowProperties.filter((allowed) => allowed !== property);
      }
      const result = lintStylesheet(stylesheet, JSON.stringify(config));
      expect(result.output).toContain(`CSS property ${property} isn't part of the chosen Baseline`);
      expect(result.status).not.toBe(0);
    },
  );
});

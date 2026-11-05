// tests/unit/pnpm-catalog.test.ts
// RDG-66 (D54): pnpm-workspace.yaml's default catalog is the single source of the dev pins the workspace
// manifests share (the experimental React build, its types, vite and the TypeScript dev pin).
// pnpm 12.17 docs (pnpm.io/catalogs): `catalog:` is shorthand for `catalog:default`, and `overrides` in
// pnpm-workspace.yaml may use the `catalog:` protocol, so the React overrides reference the catalog too.
// Lockfile shape pnpm writes for a default catalog (pnpm-lock.yaml, top level, before `importers:`):
//   catalogs:
//     default:
//       vite:
//         specifier: 8.3.6
//         version: 8.3.6
// react and react-dom are absent from it: pnpm 12.18.0 resolves them through the `overrides` entry, which the
// lockfile records resolved (top-level `overrides:`, react: 0.0.0-experimental-e84e1492-20261031), so their
// importer specifier lines keep the exact string while the other four read `specifier: 'catalog:'`.
// Only the two-space-indented mapping shape is read here (no flow mappings, no anchors), like the
// freshness sweep's own reader (dep-freshness-catalog.mjs).

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../..');
const read = (path: string): string => readFileSync(resolve(root, path), 'utf8');
const unquote = (s: string): string => s.trim().replace(/^(['"])(.*)\1$/, '$2');
const stripComment = (line: string): string => line.replace(/\s+#.*$/, '').replace(/^#.*$/, '');

/** Entries of a top-level block (`catalog:`, `overrides:`, `minimumReleaseAgeExclude:` list items). */
function topLevelBlock(text: string, name: string): { map: Map<string, string>; items: string[] } {
  const map = new Map<string, string>();
  const items: string[] = [];
  let inside = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = stripComment(raw);
    if (!line.trim()) continue;
    if (!line.startsWith(' ')) {
      inside = line.trim() === `${name}:`;
      continue;
    }
    if (!inside) continue;
    const item = line.match(/^\s+-\s+(.+)$/);
    if (item?.[1]) {
      items.push(unquote(item[1]));
      continue;
    }
    const m = line.match(/^\s+(.+?):\s+(.+)$/);
    if (m?.[1] && m[2]) map.set(unquote(m[1]), unquote(m[2]));
  }
  return { map, items };
}

/** Lockfile `catalogs.default` entries: name -> specifier and version. */
function lockCatalogDefault(text: string): Map<string, { specifier: string; version: string }> {
  const out = new Map<string, { specifier: string; version: string }>();
  let inCatalogs = false;
  let inDefault = false;
  let current: string | null = null;
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim()) continue;
    if (!raw.startsWith(' ')) {
      inCatalogs = raw.trim() === 'catalogs:';
      inDefault = false;
      continue;
    }
    if (!inCatalogs) continue;
    const indent = raw.length - raw.trimStart().length;
    const body = raw.trim();
    if (indent === 2) {
      inDefault = body === 'default:';
      continue;
    }
    if (!inDefault) continue;
    if (indent === 4) {
      current = unquote(body.replace(/:$/, ''));
      out.set(current, { specifier: '', version: '' });
      continue;
    }
    const m = body.match(/^(specifier|version):\s+(.+)$/);
    const entry = current === null ? undefined : out.get(current);
    if (m?.[1] && m[2] && entry) {
      if (m[1] === 'specifier') entry.specifier = unquote(m[2]);
      else entry.version = unquote(m[2]);
    }
  }
  return out;
}

const SIX = ['@types/react', '@types/react-dom', 'react', 'react-dom', 'typescript', 'vite'];
// RDG-117 (1.5.0): the five exact pins two or more manifests shared, widened into the catalog.
const RDG_117 = ['@types/jscodeshift', '@types/node', 'jscodeshift', 'radix-ui', 'tsdown'];
const EXACT = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
// scripts/lane.mjs rewrites the pnpm-workspace.yaml overrides (react, react-dom or typescript) and reinstalls without
// --frozen-lockfile in the lane jobs (ci.yml react-lanes; lanes.yml react-canary and typescript) before they run this
// suite, so the override and lockfile couplings hold only on the committed tree, not inside a lane.
const IN_LANE = ['react-lanes', 'react-canary', 'typescript'].includes(
  process.env.GITHUB_JOB ?? '',
);

const workspace = read('pnpm-workspace.yaml');
const catalog: Map<string, string> = topLevelBlock(workspace, 'catalog').map;
const manifest = (path: string): Record<string, Record<string, string> | undefined> =>
  JSON.parse(read(path));

function specsIn(path: string): Map<string, string> {
  const json = manifest(path);
  const out = new Map<string, string>();
  for (const field of ['dependencies', 'devDependencies']) {
    for (const [name, spec] of Object.entries(json[field] ?? {})) {
      if (SIX.includes(name)) out.set(name, spec);
    }
  }
  return out;
}

describe('pnpm catalog (RDG-66, D54)', () => {
  it('the default catalog holds exactly the six RDG-66 pins and the five RDG-117 pins, each an exact version', () => {
    expect([...catalog.keys()].sort()).toEqual([...SIX, ...RDG_117].sort());
    for (const [name, spec] of catalog) {
      expect(spec, name).toMatch(EXACT);
      expect(spec, name).not.toMatch(/[\^~<>*|]| - /);
    }
  });

  it('react and react-dom share one version', () => {
    expect(catalog.get('react')).toBeDefined();
    expect(catalog.get('react-dom')).toBe(catalog.get('react'));
  });

  it('the root and playground manifests reference catalog: for every one of the six they declare', () => {
    for (const path of ['package.json', 'apps/playground/package.json']) {
      const specs = specsIn(path);
      expect(specs.size, path).toBeGreaterThan(0);
      for (const [name, spec] of specs) expect(spec, `${path} ${name}`).toBe('catalog:');
    }
    expect([...specsIn('package.json').keys()].sort()).toEqual([
      '@types/react',
      '@types/react-dom',
      'react',
      'react-dom',
      'typescript',
    ]);
    expect([...specsIn('apps/playground/package.json').keys()].sort()).toEqual([
      'react',
      'react-dom',
      'typescript',
      'vite',
    ]);
  });

  it('create-modern-cmdk takes typescript from the catalog', () => {
    expect(specsIn('packages/create-modern-cmdk/package.json').get('typescript')).toBe('catalog:');
  });

  it.skipIf(IN_LANE)(
    'the react and react-dom overrides are catalog: or equal to the catalog version',
    () => {
      const { map } = topLevelBlock(workspace, 'overrides');
      for (const name of ['react', 'react-dom']) {
        const value = map.get(name);
        expect(value, `overrides ${name}`).toBeDefined();
        expect([`catalog:`, catalog.get(name)], `overrides ${name}`).toContain(value);
      }
    },
  );

  it('a minimumReleaseAgeExclude entry naming react or react-dom carries the catalog react version', () => {
    const { items } = topLevelBlock(workspace, 'minimumReleaseAgeExclude');
    const reactEntries = items.filter((item) => /^(?:npm:)?react(?:-dom)?@/.test(item));
    for (const item of reactEntries) {
      expect(item.slice(item.lastIndexOf('@') + 1), item).toBe(catalog.get('react'));
    }
    expect(
      items.filter(
        (i) =>
          /^(?:npm:)?react(?:-dom)?@/.test(i) &&
          i.slice(i.lastIndexOf('@') + 1) !== catalog.get('react'),
      ),
    ).toEqual([]);
  });

  it('apps/docs keeps its own exact typescript pin (a scoped hold, visible to the sweep at its site)', () => {
    const spec = manifest('apps/docs/package.json').devDependencies?.typescript;
    expect(spec).toMatch(EXACT);
    expect(spec).not.toBe('catalog:');
  });

  it.skipIf(IN_LANE)(
    'pnpm-lock.yaml records the catalog: catalogs.default for the nine non-overridden names, the overrides for react and react-dom',
    () => {
      const lock = read('pnpm-lock.yaml');
      const locked = lockCatalogDefault(lock);
      const viaCatalog = [...SIX, ...RDG_117]
        .filter((name) => name !== 'react' && name !== 'react-dom')
        .sort();
      expect([...locked.keys()].sort()).toEqual(viaCatalog);
      for (const name of viaCatalog)
        expect(locked.get(name)?.specifier, name).toBe(catalog.get(name));
      const overrides = topLevelBlock(lock, 'overrides').map;
      for (const name of ['react', 'react-dom'])
        expect(overrides.get(name), name).toBe(catalog.get(name));
    },
  );
});

// RDG-117 (1.5.0): the five exact pins that two or more manifests wrote out (@types/node, tsdown, jscodeshift,
// @types/jscodeshift, radix-ui) join the catalog. Only dependencies and devDependencies sites switch: radix-ui's
// peer range in packages/modern-cmdk keeps its range (a consumer-facing contract), idb-keyval stays written out in
// its manifests, and the tests/consumers apps are not workspace projects (they install from packed tarballs).
const RDG_117_SITES: Record<string, readonly string[]> = {
  'package.json': ['@types/jscodeshift', '@types/node', 'jscodeshift', 'tsdown'],
  'packages/create-modern-cmdk/package.json': ['@types/node', 'tsdown'],
  'packages/modern-cmdk/package.json': ['radix-ui'],
  'packages/modern-cmdk-codemod/package.json': [
    '@types/jscodeshift',
    '@types/node',
    'jscodeshift',
    'tsdown',
  ],
  'apps/playground/package.json': ['radix-ui'],
};

describe('RDG-117: the catalog also holds the shared build and codemod pins', () => {
  it('RDG-117: each of the five catalog entries is present as an exact version', () => {
    for (const name of RDG_117) {
      expect(catalog.get(name), name).toMatch(EXACT);
    }
  });

  it('RDG-117: every dependencies or devDependencies site of the five reads catalog:', () => {
    for (const [path, names] of Object.entries(RDG_117_SITES)) {
      const json = manifest(path);
      for (const name of names) {
        const spec = json.dependencies?.[name] ?? json.devDependencies?.[name];
        expect(spec, `${path} ${name}`).toBe('catalog:');
      }
    }
  });

  it('RDG-117: no workspace manifest writes any of the five as an exact version in dependencies or devDependencies', () => {
    const manifests = [
      ...Object.keys(RDG_117_SITES),
      'packages/vscode-modern-cmdk/package.json',
      'apps/docs/package.json',
    ];
    const written: string[] = [];
    for (const path of manifests) {
      const json = manifest(path);
      for (const field of ['dependencies', 'devDependencies']) {
        for (const name of RDG_117) {
          const spec = json[field]?.[name];
          if (spec !== undefined && spec !== 'catalog:')
            written.push(`${path} ${field} ${name} ${spec}`);
        }
      }
    }
    expect(written).toEqual([]);
  });

  it('RDG-117: peerDependencies keep the radix-ui range, never catalog:', () => {
    expect(manifest('packages/modern-cmdk/package.json').peerDependencies?.['radix-ui']).toBe(
      '>=1.4.0 <2.0.0',
    );
  });
});

// RDG-117 (1.5.0): the catalog `typescript` pin is the truth source for every doc that names the nightly. The
// README badge writes it with shields.io's escape (each `-` doubled), so a plain-version grep misses it; these
// tests read both spellings. The tests/consumers manifests are not workspace projects (they install from packed
// tarballs), so the catalog cannot reach their exact pin and it is checked here too.
describe('the TypeScript nightly named in docs follows the catalog', () => {
  const pin = catalog.get('typescript') ?? '';
  const badgePin = pin.replaceAll('-', '--');
  const NIGHTLY = /\d+\.\d+\.\d+-+dev\.\d{8}\.\d+/g;
  const DOC_SITES = [
    'CONTRIBUTING.md',
    'apps/docs/guide/typescript-integration.md',
    'apps/docs/guide/installation.md',
    '.github/ISSUE_TEMPLATE/bug_report.yml',
    'tests/consumers/next-app/package.json',
    'tests/consumers/vite-app/package.json',
  ];

  it('RDG-117: README.md carries the shields badge for the catalog pin once, and the typecheck row', () => {
    expect(pin).toMatch(EXACT);
    const readme = read('README.md');
    expect(readme.split(`TypeScript-${badgePin}-`)).toHaveLength(2);
    expect(readme).toContain(`(TypeScript ${pin})`);
  });

  it('RDG-117: every other doc site names the catalog pin', () => {
    for (const path of DOC_SITES) expect(read(path), path).toContain(pin);
  });

  it('RDG-117: no doc site names any other TypeScript nightly', () => {
    for (const path of ['README.md', ...DOC_SITES]) {
      const named = read(path).match(NIGHTLY) ?? [];
      expect(
        named.filter((v) => v !== pin && v !== badgePin),
        path,
      ).toEqual([]);
    }
  });
});

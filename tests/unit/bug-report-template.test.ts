// tests/unit/bug-report-template.test.ts
// DT-74: the Environment placeholder of .github/ISSUE_TEMPLATE/bug_report.yml names the Chromium major Playwright
//   ships (playwright-core browsers.json) and the macOS runner major of ci.yml, and every other version it shows is
//   the repository's own (.nvmrc, the modern-cmdk manifest version (or, while no modern-cmdk changeset is pending, the
//   release before it in packages/modern-cmdk/CHANGELOG.md), the pnpm-workspace.yaml catalog).
// RDG-62: the placeholder has no separate modern-cmdk/react line, because that subpath always carries modern-cmdk's version.
// RDG-129: the Package dropdown offers every published (non-private) workspace package.

import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../..');
const read = (path: string): string => readFileSync(resolve(root, path), 'utf8');
const unquote = (s: string): string => s.trim().replace(/^(['"])(.*)\1$/, '$2');

const template = read('.github/ISSUE_TEMPLATE/bug_report.yml');

/** The lines of the Environment textarea's `placeholder: |` block, de-indented. */
function placeholderLines(): string[] {
  const lines = template.split(/\r?\n/);
  const env = lines.findIndex((l) => /^\s+id: environment$/.test(l));
  expect(env, 'environment textarea').toBeGreaterThan(-1);
  const at = lines.findIndex((l, i) => i > env && /^\s+placeholder: \|$/.test(l));
  expect(at, 'placeholder block').toBeGreaterThan(-1);
  const out: string[] = [];
  for (const l of lines.slice(at + 1)) {
    if (!/^\s{8}\S/.test(l)) break;
    out.push(l.trim());
  }
  return out;
}

/** The option strings of the `id: package` dropdown. */
function packageOptions(): string[] {
  const lines = template.split(/\r?\n/);
  const at = lines.findIndex((l) => /^\s+id: package$/.test(l));
  expect(at, 'package dropdown').toBeGreaterThan(-1);
  const start = lines.findIndex((l, i) => i > at && /^\s+options:$/.test(l));
  const out: string[] = [];
  for (const l of lines.slice(start + 1)) {
    const m = l.match(/^\s+-\s+(.+)$/);
    if (!m?.[1]) break;
    out.push(unquote(m[1]));
  }
  return out;
}

const value = (key: string): string[] =>
  placeholderLines()
    .filter((l) => l.startsWith(`${key}: `))
    .map((l) => l.slice(key.length + 2));

const catalog = new Map<string, string>();
let inCatalog = false;
for (const raw of read('pnpm-workspace.yaml').split(/\r?\n/)) {
  const line = raw.replace(/\s+#.*$/, '').replace(/^#.*$/, '');
  if (!line.trim()) continue;
  if (!line.startsWith(' ')) {
    inCatalog = line.trim() === 'catalog:';
    continue;
  }
  const m = inCatalog ? line.match(/^\s+(.+?):\s+(.+)$/) : null;
  if (m?.[1] && m[2]) catalog.set(unquote(m[1]), unquote(m[2]));
}

const pendingModernCmdk = readdirSync(resolve(root, '.changeset'))
  .filter((f) => f.endsWith('.md') && f !== 'README.md')
  .some((f) =>
    /^---\r?\n[\s\S]*?^['"]?modern-cmdk['"]?:\s/m.test(
      read(`.changeset/${f}`)
        .split(/^---\r?$/m, 3)
        .slice(0, 2)
        .join('---\n'),
    ),
  );

describe('bug_report.yml placeholders and dropdown', () => {
  it('DT-74: the Environment placeholder names the Chromium major Playwright ships and the macOS runner major of ci.yml', () => {
    const require = createRequire(import.meta.url);
    const pwCore = createRequire(require.resolve('@playwright/test/package.json')).resolve(
      'playwright-core/package.json',
    );
    const browsers = JSON.parse(readFileSync(resolve(pwCore, '..', 'browsers.json'), 'utf8')) as {
      browsers: { name: string; browserVersion?: string }[];
    };
    const chromium = browsers.browsers.find((b) => b.name === 'chromium')?.browserVersion;
    expect(chromium, 'chromium browserVersion').toMatch(/^\d+\./);
    const chromeMajor = (chromium ?? '').split('.')[0];
    const macos = [...read('.github/workflows/ci.yml').matchAll(/\bmacos-(\d+)\b/g)].map(
      (m) => m[1],
    );
    expect(new Set(macos).size, 'one macOS runner major in ci.yml').toBe(1);
    expect(value('Browser')).toEqual([`Chrome ${chromeMajor}`]);
    expect(value('OS')).toEqual([`macOS ${macos[0]}`]);
  });

  it("DT-74: every other placeholder version is the repository's", () => {
    expect(value('Node')).toEqual([`v${read('.nvmrc').trim()}`]);
    const pkg = JSON.parse(read('packages/modern-cmdk/package.json')) as { version: string };
    // While a modern-cmdk changeset is pending, the manifest version is the published one and the placeholder must equal it.
    // A Version PR consumes the changesets and bumps the manifest and CHANGELOG but may not edit this template (release.yml's
    // first-publish-tarball scope gate), so with no modern-cmdk changeset pending the placeholder may also name the release
    // before the manifest version.
    const released = [
      ...read('packages/modern-cmdk/CHANGELOG.md').matchAll(/^## (\d+\.\d+\.\d+)\r?$/gm),
    ].map((m) => m[1]);
    const at = released.indexOf(pkg.version);
    expect(at, `packages/modern-cmdk/CHANGELOG.md has a ## ${pkg.version} heading`).toBeGreaterThan(
      -1,
    );
    expect(value('modern-cmdk')).toHaveLength(1);
    const allowed = pendingModernCmdk ? [pkg.version] : [pkg.version, released[at + 1]];
    expect(allowed).toContain(value('modern-cmdk')[0]);
    expect(value('React')).toEqual([catalog.get('react')]);
    expect(value('TypeScript')).toEqual([catalog.get('typescript')]);
    expect(value('Vite')).toEqual([catalog.get('vite')]);
  });

  it('RDG-62: the placeholder has no separate modern-cmdk/react line', () => {
    expect(placeholderLines().filter((l) => l.startsWith('modern-cmdk/react:'))).toEqual([]);
  });

  it('RDG-129: the Package dropdown offers every published workspace package', () => {
    const options = packageOptions();
    const matched: string[] = [];
    const missing: string[] = [];
    for (const entry of readdirSync(resolve(root, 'packages'), { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const pkg = JSON.parse(read(`packages/${entry.name}/package.json`)) as {
        name: string;
        private?: boolean;
      };
      if (pkg.private === true) continue;
      const hit = options.find(
        (o) => o === pkg.name || o.startsWith(`${pkg.name} (`) || o.startsWith(`${pkg.name}/`),
      );
      if (hit) matched.push(`${pkg.name} -> ${hit}`);
      else missing.push(pkg.name);
    }
    expect(missing, `matched: ${matched.join('; ')}; options: ${options.join(' | ')}`).toEqual([]);
  });
});

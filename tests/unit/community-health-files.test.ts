// tests/unit/community-health-files.test.ts
// The community health files say one thing about the repository's packages and how a release is checked:
// CODE_OF_CONDUCT.md is the Contributor Covenant 3.0 with its reporting route filled in, SECURITY.md scopes the
// published packages and says how each version reached npm, the issue forms and the pull request template offer
// one package list (the published packages and the docs, never the private WASM crate or the playground), the
// template keeps at most 8 checkboxes, and dependabot.yml leaves Playwright's alpha builds to the sweep.

import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../..');
const read = (path: string): string => readFileSync(resolve(root, path), 'utf8');
const unquote = (s: string): string => s.trim().replace(/^(['"])(.*)\1$/, '$2');

/** The names of the non-private workspace packages under packages/. */
function publishedPackages(): string[] {
  const names: string[] = [];
  for (const entry of readdirSync(resolve(root, 'packages'), { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const pkg = JSON.parse(read(`packages/${entry.name}/package.json`)) as {
      name: string;
      private?: boolean;
    };
    if (pkg.private !== true) names.push(pkg.name);
  }
  return names;
}

/** The option strings of the `id: package` dropdown of an issue form. */
function packageOptions(form: string): string[] {
  const lines = read(form).split(/\r?\n/);
  const at = lines.findIndex((l) => /^\s+id: package$/.test(l));
  expect(at, `${form}: package dropdown`).toBeGreaterThan(-1);
  const start = lines.findIndex((l, i) => i > at && /^\s+options:$/.test(l));
  const out: string[] = [];
  for (const l of lines.slice(start + 1)) {
    const m = l.match(/^\s+-\s+(.+)$/);
    if (!m?.[1]) break;
    out.push(unquote(m[1]));
  }
  return out;
}

/** The lines of the pull request template's `## Packages affected` section, as list items. */
function templatePackages(): string[] {
  const lines = read('.github/PULL_REQUEST_TEMPLATE.md').split(/\r?\n/);
  const at = lines.findIndex((l) => /^## Packages affected$/.test(l));
  expect(at, 'Packages affected heading').toBeGreaterThan(-1);
  const out: string[] = [];
  for (const l of lines.slice(at + 1)) {
    if (l.startsWith('## ')) break;
    const m = l.match(/^- \[ \] (.+)$/);
    if (m?.[1]) out.push(m[1]);
  }
  return out;
}

describe('CODE_OF_CONDUCT.md', () => {
  const text = read('CODE_OF_CONDUCT.md');

  it('is the Contributor Covenant 3.0, attribution included', () => {
    expect(text.split(/\r?\n/)[0]).toBe('# Contributor Covenant 3.0 Code of Conduct');
    for (const heading of [
      '## Our Pledge',
      '## Encouraged Behaviors',
      '## Restricted Behaviors',
      '## Reporting an Issue',
      '## Addressing and Repairing Harm',
      '## Scope',
      '## Attribution',
    ]) {
      expect(text, heading).toContain(`\n${heading}\n`);
    }
    expect(text).toContain('https://www.contributor-covenant.org/version/3/0/');
    expect(text).toContain('licensed under CC BY-SA 4.0');
  });

  it('keeps no template note and names GitHub content reports, not a personal address', () => {
    expect(text).not.toContain('[NOTE');
    expect(text).toContain("GitHub's **Report content** option");
    expect(text).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/);
  });
});

describe('one package list across the forms', () => {
  const bug = packageOptions('.github/ISSUE_TEMPLATE/bug_report.yml');
  const feature = packageOptions('.github/ISSUE_TEMPLATE/feature_request.yml');

  it('the bug form and the feature form offer the same options', () => {
    expect(feature).toEqual(bug);
  });

  it('every published package has an option, and the docs the last one', () => {
    for (const name of publishedPackages()) {
      expect(
        bug.some((o) => o === name || o.startsWith(`${name} (`)),
        name,
      ).toBe(true);
    }
    expect(bug.at(-1)).toBe('Documentation');
  });

  it('no list offers the WASM crate or the playground', () => {
    for (const list of [bug, feature, templatePackages()]) {
      expect(list.filter((o) => /wasm|playground/i.test(o))).toEqual([]);
    }
  });

  it('the pull request template lists the same packages and the docs', () => {
    const offered = templatePackages();
    for (const name of publishedPackages()) {
      expect(
        offered.some((o) => o.includes(`\`${name}\``)),
        name,
      ).toBe(true);
    }
    expect(offered.at(-1)).toContain('Documentation');
  });

  it('the pull request template has at most 8 checkboxes', () => {
    const boxes = read('.github/PULL_REQUEST_TEMPLATE.md').match(/^- \[ \] /gm) ?? [];
    expect(boxes.length).toBeLessThanOrEqual(8);
  });
});

describe('SECURITY.md', () => {
  const text = read('SECURITY.md');
  const scope = text.slice(
    text.indexOf('## Scope'),
    text.indexOf('## Known Security Considerations'),
  );

  it('scopes every published package and no playground', () => {
    expect(scope.length).toBeGreaterThan(0);
    for (const name of publishedPackages()) expect(scope, name).toContain(`\`${name}\``);
    expect(scope).not.toMatch(/playground/i);
  });

  it('verifies a published tarball fetched with npm pack', () => {
    expect(text).toContain('npm pack <name>@<version>');
    expect(text).toContain('gh attestation verify <name>-<version>.tgz -R ABCrimson/modern-cmdk');
  });

  it('says modern-cmdk-codemod 1.0.0 was published by hand without npm provenance', () => {
    expect(text).toMatch(
      /`modern-cmdk-codemod` 1\.0\.0 was published by the owner by hand on 2026-11-10/,
    );
    expect(text).toContain('It has no npm provenance.');
    expect(text).toMatch(/1\.0\.1 and every later version are published by the workflow/);
    expect(text).not.toContain('is published by the owner by hand from the artifact');
  });
});

describe('dependabot.yml', () => {
  const text = read('.github/dependabot.yml');
  const npm = text.slice(
    text.indexOf('package-ecosystem: npm'),
    text.indexOf('package-ecosystem: github-actions'),
  );
  const ignored = [...npm.matchAll(/^\s+- dependency-name: '([^']+)'/gm)].map((m) => m[1]);

  it('ignores the Playwright family, whose alpha builds Dependabot cannot order', () => {
    expect(ignored).toEqual(
      expect.arrayContaining(['@playwright/*', 'playwright', 'playwright-core']),
    );
  });

  it('writes no `versions` glob: an npm ignore takes semver ranges, not patterns like *-alpha-*', () => {
    expect(text).not.toMatch(/^\s+versions:/m);
  });
});

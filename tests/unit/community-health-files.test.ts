// tests/unit/community-health-files.test.ts
// The community health files say one thing about the repository's packages and how a release is checked:
// CODE_OF_CONDUCT.md is the Contributor Covenant 3.0 with its reporting route filled in (GitHub Support, the only
// route a personal account has), SECURITY.md scopes the published packages and says how each version reached npm,
// the issue forms and the pull request template offer one package list (the published packages and the docs,
// never the private WASM crate or the playground), the bug form never invites a security report, the template
// keeps at most 8 checkboxes, and dependabot.yml leaves Playwright's alpha builds to a re-resolution outside it.

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

  it('keeps the covenant pledge word for word', () => {
    expect(text).toContain(
      'We pledge to make our community welcoming, safe, and equitable for all.',
    );
    expect(text).toContain(
      'The same privileges of participation are extended to everyone who participates in good faith and in accordance with this Covenant.',
    );
  });

  it('keeps no template note and sends reports to GitHub Support, the only route a personal account has', () => {
    expect(text).not.toContain('[NOTE');
    expect(text).toContain(
      "use GitHub's **Report content** option on the comment, issue, pull request or discussion; the report goes to GitHub Support.",
    );
    expect(text).not.toContain('Report abuse to GitHub Support');
    expect(text).toContain(
      'This repository belongs to a personal account, for which GitHub offers no reports to maintainers.',
    );
    expect(text).not.toContain('privately to the repository');
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

describe('security reports stay out of the public tracker', () => {
  it('no bug form option invites a security report, and the issue chooser links the private route', () => {
    const form = read('.github/ISSUE_TEMPLATE/bug_report.yml');
    const severity = form.slice(form.indexOf('id: severity'), form.indexOf('id: checks'));
    expect(severity).toContain('"Critical -- data loss"');
    expect(severity).not.toMatch(/security/i);
    const config = read('.github/ISSUE_TEMPLATE/config.yml');
    expect(config).toContain('name: Report a security vulnerability');
    expect(config).toContain(
      'url: https://github.com/ABCrimson/modern-cmdk/security/advisories/new',
    );
    expect(config).toContain('about: Report security problems privately, never in a public issue');
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

  it('dates attestations per package: modern-cmdk from 1.4.0, create-modern-cmdk from 1.3.1', () => {
    expect(text).toContain('So are `modern-cmdk` from 1.4.0 and `create-modern-cmdk` from 1.3.1.');
    expect(text).toContain(
      '`modern-cmdk` 1.2.0 to 1.3.0 and `create-modern-cmdk` 1.2.0 to 1.3.0 were published by the workflow with npm provenance, before it made attestations, so `gh attestation verify` fails for them. Earlier versions were published by hand and have neither.',
    );
    expect(text).not.toContain(
      'Releases of `modern-cmdk` and `create-modern-cmdk` that the workflow made',
    );
  });

  it('says a first version is published by hand with no provenance, and promises no attestation', () => {
    expect(text).toContain(
      'The first version of a new package is published by the owner by hand, because npm can set up trusted publishing only for a package that already exists. Such a version has no npm provenance.',
    );
    expect(text).not.toContain('published by hand the same way');
  });

  it('points to private reporting only', () => {
    expect(text).toContain('**Do not** open a public GitHub issue');
    expect(text).toContain('https://github.com/ABCrimson/modern-cmdk/security/advisories/new');
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

  it('gives the Playwright entries no `versions` glob: an npm ignore takes semver ranges, not *-alpha-*', () => {
    const entries = [
      ...npm.matchAll(
        /^ {6}- dependency-name: '(?:@playwright\/\*|playwright|playwright-core)'\n((?: {8}\S.*\n)*)/gm,
      ),
    ];
    expect(entries).toHaveLength(3);
    for (const [entry] of entries) expect(entry).not.toMatch(/versions:/);
  });

  it('keeps no group for the ignored Playwright family', () => {
    const groups = npm.slice(npm.indexOf('groups:'), npm.indexOf('ignore:'));
    expect(groups).not.toMatch(/playwright/);
  });

  it('is public text: it names no sweep', () => {
    expect(text).not.toMatch(/sweep|peak-modern/i);
  });
});

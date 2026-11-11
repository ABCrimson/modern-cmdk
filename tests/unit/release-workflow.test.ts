// tests/unit/release-workflow.test.ts
// D62 (W4-05): .github/workflows/release.yml learns the third published package, modern-cmdk-codemod.
// Regex over the YAML as pnpm-catalog.test.ts does: no YAML parser is a dependency of the workspace.
// Jobs sit at two-space indentation under `jobs:`; a job block runs to the next job key or job-level comment.

import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../..');
const workflow = readFileSync(resolve(root, '.github/workflows/release.yml'), 'utf8');

/** The lines of one job (its key line included) up to the next two-space-indented key or comment. */
function job(name: string): string {
  const lines = workflow.split(/\r?\n/);
  const start = lines.indexOf(`  ${name}:`);
  if (start === -1) return '';
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^ {2}(#|[a-z][\w-]*:)/.test(lines[i] ?? '')) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join('\n');
}

/** The lines of one step of a job: from `- name: <name>` to the next step or the end of the job. */
function step(block: string, name: string): string {
  const lines = block.split('\n');
  const start = lines.indexOf(`      - name: ${name}`);
  if (start === -1) return '';
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^ {6}(- |# )/.test(lines[i] ?? '')) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join('\n');
}

/** Names of the non-private packages/<dir>/package.json manifests. */
function publishedPackages(): string[] {
  return readdirSync(resolve(root, 'packages'), { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map(
      (d) =>
        JSON.parse(readFileSync(resolve(root, 'packages', d.name, 'package.json'), 'utf8')) as {
          name: string;
          private?: boolean;
        },
    )
    .filter((m) => m.private !== true)
    .map((m) => m.name)
    .sort();
}

describe('release.yml attest job (PKG-1, D62)', () => {
  const attest = job('attest');
  // An npm package name has no underscore; the step output key is the name with hyphens turned into underscores.
  const keyOf = (name: string): string => name.replaceAll('-', '_');

  it('PKG-1: the pack-layout case maps every non-private packages/*/package.json', () => {
    const names = publishedPackages();
    expect(names).toContain('modern-cmdk-codemod');
    for (const name of names) {
      expect(attest, name).toContain(`              ${name}) key=${keyOf(name)} ;;`);
    }
    const cases = [...attest.matchAll(/^ {14}([\w-]+)\) key=\w+ ;;$/gm)].map((m) => m[1]);
    expect(cases.sort()).toEqual(names);
  });

  it('PKG-1: every mapped package has an SBOM step and an SBOM-attestation step, each guarded by its key', () => {
    for (const name of publishedPackages()) {
      const key = keyOf(name);
      const guard = `        if: steps.tarballs.outputs.${key} != ''`;
      const sbom = step(attest, `SBOM for ${name}`);
      expect(sbom, `SBOM for ${name}`).toContain(guard);
      expect(sbom).toContain(`path: sbom-src/${key}`);
      expect(sbom).toContain(`output-file: sbom/${name}.spdx.json`);
      const attestation = step(attest, `SBOM attestation for ${name}`);
      expect(attestation, `SBOM attestation for ${name}`).toContain(guard);
      expect(attestation).toContain(`subject-path: \${{ steps.tarballs.outputs.${key} }}`);
      expect(attestation).toContain(`sbom-path: sbom/${name}.spdx.json`);
    }
  });

  it('D62: attest refuses a never-published package', () => {
    const layout = step(attest, 'Check the pack layout and unpack for the SBOM scan');
    expect(layout).toContain('npm view "$name" version');
    expect(layout).toMatch(/grep -q 'E404'/);
    expect(layout).toContain(
      '::error::first publish of $name is owner-gated (D62); publish it by hand first',
    );
    // The refusal sits before the digest check and before any output is written for the package.
    expect(layout.indexOf('npm view "$name" version')).toBeLessThan(
      layout.indexOf('actual="sha256-'),
    );
    // Any other npm error fails the job as well.
    expect(layout).toMatch(/::error::npm view \$name failed/);
    // Both branches end in `exit 1`: the refusal fails the job.
    expect(layout).toMatch(
      /^ {12}if ! registry=\$\(npm view "\$name" version 2>&1\); then\n {14}if grep -q 'E404' <<< "\$registry"; then\n {16}echo "::error::first publish of \$name is owner-gated \(D62\); publish it by hand first"\n {14}else\n {16}echo "::error::npm view \$name failed: \$registry"\n {14}fi\n {14}exit 1\n {12}fi$/m,
    );
  });

  it('D62: no continue-on-error and no `|| true` anywhere in the workflow', () => {
    expect(workflow).not.toMatch(/continue-on-error/);
    expect(workflow).not.toMatch(/\|\| true/);
  });
});

/** The header comment (everything before `jobs:`) as prose: comment markers removed, lines joined by a space. */
function headerProse(): string {
  return workflow
    .slice(0, workflow.indexOf('\njobs:'))
    .split(/\r?\n/)
    .filter((l) => l.startsWith('#'))
    .map((l) => l.replace(/^#\s?/, ''))
    .join(' ');
}

/** Every job key under jobs:. */
function jobNames(): string[] {
  return workflow
    .slice(workflow.indexOf('\njobs:'))
    .split(/\r?\n/)
    .flatMap((l) => /^ {2}([a-z][\w-]*):$/.exec(l)?.[1] ?? []);
}

describe('release.yml header and signing permissions (D62)', () => {
  it('D62: the header lists exactly the jobs whose permissions hold id-token: write', () => {
    const prose = headerProse();
    const listed =
      /\b((?:[\w-]+(?:, | and ))+[\w-]+) are the only jobs holding id-token: write/.exec(
        prose,
      )?.[1];
    expect(listed).toBeDefined();
    const named = (listed ?? '').split(/, | and /).sort();
    const holders = jobNames()
      .filter((name) => /^ {6}id-token: write\b/m.test(job(name)))
      .sort();
    expect(holders).toEqual(['attest', 'publish']);
    expect(named).toEqual(holders);
    // Past the header, the key appears once per holder (permissions: {} at the top grants nothing).
    const afterHeader = workflow.slice(workflow.indexOf('\njobs:'));
    expect(afterHeader.match(/id-token: write/g)).toHaveLength(holders.length);
  });

  it('D62: the header says the attest job refuses a package npm has never seen', () => {
    const prose = headerProse();
    expect(prose).toMatch(/refuses a publish plan that holds a package npm has never seen/);
    expect(prose).toMatch(/published by the owner by hand, never by this workflow/);
  });

  it('D62: the version job comment does not claim changeset version rewrites workspace specifiers', () => {
    const version = job('version');
    expect(version).not.toMatch(/rewrites workspace specifiers/);
    expect(version).toContain('workspace:*');
    expect(version).toContain('apply-release-plan 8.1.1');
  });
});

describe('release.yml has no backfill job and no dispatch trigger (D73)', () => {
  const header = workflow.slice(0, workflow.indexOf('\njobs:'));

  it('D73: the backfill job is absent and the job graph is the push graph alone', () => {
    expect(jobNames()).toEqual([
      'ci-gate',
      'select-mode',
      'version',
      'pack',
      'attest',
      'publish',
      'release-notes',
      'readme-images',
    ]);
    expect(job('backfill')).toBe('');
    expect(workflow).not.toMatch(/backfill/i);
  });

  it('D73: no workflow_dispatch trigger, no task input and no job or expression reads them', () => {
    expect(header).toMatch(/^on:\n {2}push:\n {4}branches: \[main\]\n\n/m);
    expect(workflow).not.toContain('workflow_dispatch');
    expect(workflow).not.toMatch(/inputs\./);
    expect(workflow).not.toMatch(/^ {6}task:/m);
    expect(workflow).not.toContain('github.event_name');
  });

  it('D73: every needs and every job-level if of the surviving graph is intact', () => {
    const needs = Object.fromEntries(
      jobNames().map((n) => {
        const m = /^ {4}needs: (.+)$/m.exec(job(n));
        return [n, m?.[1]?.replace(/[[\]\s]/g, '').split(',') ?? []];
      }),
    );
    expect(needs).toEqual({
      'ci-gate': [],
      'select-mode': ['ci-gate'],
      version: ['select-mode'],
      pack: ['select-mode'],
      attest: ['select-mode', 'pack'],
      publish: ['pack', 'attest'],
      'release-notes': ['publish'],
      'readme-images': ['publish'],
    });
    expect(job('select-mode')).not.toMatch(/^ {4}if:/m);
    expect(job('version')).toContain("if: needs.select-mode.outputs.mode == 'version'");
    expect(job('pack')).toContain("if: needs.select-mode.outputs.mode == 'publish'");
    expect(job('attest')).toContain("if: needs.select-mode.outputs.mode == 'publish'");
  });

  it('D73: the header graph names the push graph and no dispatch run', () => {
    const prose = headerProse();
    expect(prose).toContain('On a push to main: ci-gate -> select-mode ->');
    expect(prose).not.toMatch(/manual dispatch|dispatched run/);
  });
});

describe('release.yml has no first-publish scaffolding', () => {
  it('RDG-131: no job starts with first-publish, no step uploads a first-publish-* artifact, and the header job graph names exactly the jobs that exist', () => {
    const names = jobNames();
    expect(names.filter((name) => name.startsWith('first-publish'))).toEqual([]);
    const uploads = [...workflow.matchAll(/upload-artifact@[^\n]*\n\s+with:\n\s+name: (\S+)/g)].map(
      (m) => m[1],
    );
    expect(uploads).toEqual(['sbom-spdx']);
    expect(workflow).not.toContain('first-publish');
    // The graph line lists every job once: ci-gate -> select-mode -> version | (pack -> attest -> publish -> (release-notes | readme-images)).
    const graph = /^# Job graph\. On a push to main: (.+)$/m.exec(workflow)?.[1] ?? '';
    expect([...new Set(graph.match(/[a-z][a-z-]*/g))].sort()).toEqual([...names].sort());
  });

  it('SEC-60: no job holding id-token: write executes a freshly resolved npm tree', () => {
    for (const name of ['attest', 'publish']) {
      expect(job(name), name).not.toBe('');
      expect(job(name), name).not.toMatch(
        /\bnpm (exec|install|ci)\b|\bnpx\b|codemod-tarball-smoke/,
      );
    }
  });
});

describe('release.yml release notes, Latest and the README image probe', () => {
  const notes = job('release-notes');
  const probe = job('readme-images');
  const publish = job('publish');

  /** The permissions a job grants, as `key:value`. */
  const granted = (block: string): string[] => {
    const perms = block.match(/^ {4}permissions:\n((?: {6}.*\n)+)/m)?.[1] ?? '';
    return [...perms.matchAll(/^ {6}([\w-]+): (\w+)/gm)].map((m) => `${m[1]}:${m[2]}`);
  };

  it('publish exposes what the changesets publish action reports, from a step with an id', () => {
    expect(publish).toMatch(/^ {6}published: \$\{\{ steps\.publish\.outputs\.published \}\}$/m);
    expect(publish).toMatch(
      /^ {6}published-packages: \$\{\{ steps\.publish\.outputs\.published-packages \}\}$/m,
    );
    expect(step(publish, 'Publish packages')).toMatch(/^ {8}id: publish$/m);
  });

  it('B-20: release-notes and readme-images run only after a publish and need publish alone', () => {
    for (const [name, block] of [
      ['release-notes', notes],
      ['readme-images', probe],
    ] as const) {
      expect(block, name).not.toBe('');
      expect(block, name).toContain("    if: needs.publish.outputs.published == 'true'");
      expect(block, name).toContain('    needs: publish\n');
      expect(block, name).toMatch(
        /^ {6}PUBLISHED: \$\{\{ needs\.publish\.outputs\.published-packages \}\}$/m,
      );
    }
  });

  it('release-notes holds contents: write alone, readme-images contents: read alone; neither holds id-token', () => {
    expect(granted(notes)).toEqual(['contents:write']);
    expect(granted(probe)).toEqual(['contents:read']);
    for (const block of [notes, probe]) {
      expect(block).not.toMatch(
        /id-token|attestations|artifact-metadata|secrets\.|NPM_TOKEN|NODE_AUTH_TOKEN/,
      );
    }
  });

  it('SEC-60: release-notes and readme-images install nothing and run no freshly resolved npm code', () => {
    for (const [name, block] of [
      ['release-notes', notes],
      ['readme-images', probe],
    ] as const) {
      expect(block, name).not.toMatch(
        /\b(npm|pnpm|yarn|corepack)\b|\bnpx\b|pnpm\/action-setup|codemod-tarball-smoke/,
      );
    }
    // The script they run imports Node built-ins only.
    const script = readFileSync(resolve(root, 'scripts/compose-release-notes.ts'), 'utf8');
    const imports = [...script.matchAll(/^import .* from '([^']+)';$/gm)].map((m) => m[1]);
    expect(imports.length).toBeGreaterThan(0);
    for (const specifier of imports) expect(specifier, specifier).toMatch(/^node:/);
  });

  it('B-20: release-notes composes each published release, sets its notes, and a missing summary fails the step', () => {
    const compose = step(notes, 'Compose and set the release notes');
    expect(compose).toContain('node scripts/compose-release-notes.ts compose --tag "$tag"');
    expect(compose).toContain('--tags-file "$RUNNER_TEMP/release-tags.txt"');
    expect(compose).toContain('--commit "$GITHUB_SHA"');
    expect(compose).toContain(
      'gh release edit "$tag" --notes-file "$RUNNER_TEMP/release-notes.md"',
    );
    expect(compose).toContain(`jq -r '.[] | "\\(.name)@\\(.version)"' <<< "$PUBLISHED"`);
    // A failed compose is remembered, the others still run, and the step exits non-zero at the end.
    expect(compose).toMatch(/\n {12}else\n {14}failed=1\n {12}fi\n/);
    expect(compose).toMatch(/\n {10}exit "\$failed"$/);
    // The release tags are listed after publish, before they are used.
    const tags = step(notes, 'List the release tags');
    expect(tags).toContain('gh release list --limit 1000 --json tagName,isDraft');
    expect(notes.indexOf('- name: List the release tags')).toBeLessThan(
      notes.indexOf('- name: Compose and set the release notes'),
    );
    expect(tags).toMatch(/^ {8}id: tags$/m);
  });

  it('B-20: the last step marks the highest modern-cmdk release Latest, and runs after a failed compose step', () => {
    const latest = step(notes, 'Keep modern-cmdk the Latest release');
    expect(latest).toMatch(
      /^ {8}if: \$\{\{ !cancelled\(\) && steps\.tags\.outcome == 'success' \}\}$/m,
    );
    expect(latest).toContain(
      'node scripts/compose-release-notes.ts newest --package modern-cmdk --tags-file "$RUNNER_TEMP/release-tags.txt"',
    );
    expect(latest).toContain('gh release edit "$latest" --latest');
    const names = [...notes.matchAll(/^ {6}- name: (.+)$/gm)].map((m) => m[1]);
    expect(names.at(-1)).toBe('Keep modern-cmdk the Latest release');
    // The satellite packages are never marked: the only --latest in the workflow is the modern-cmdk one.
    expect(workflow.match(/--latest/g)).toHaveLength(1);
  });

  it('readme-images probes the packument readme after publish and fails on anything but 200', () => {
    expect(step(probe, 'Request every README image URL')).toContain(
      'node scripts/compose-release-notes.ts probe-images',
    );
    expect(probe).not.toMatch(/continue-on-error|\|\| true/);
  });

  it('every action in the new jobs is pinned by a full commit SHA with its version comment', () => {
    for (const block of [notes, probe]) {
      const uses = [...block.matchAll(/^\s+- uses: (\S+)(.*)$/gm)];
      expect(uses.length).toBeGreaterThan(0);
      for (const m of uses) {
        expect(m[1], m[1]).toMatch(/^[\w-]+\/[\w-]+@[0-9a-f]{40}$/);
        expect(m[2], m[1]).toMatch(/^ # v\d+\.\d+\.\d+$/);
      }
    }
  });

  it('every job-level and step-level uses: in the workflow is pinned by a full commit SHA', () => {
    const unpinned = [...workflow.matchAll(/^\s+(?:- )?uses: (\S+)/gm)]
      .map((m) => m[1] ?? '')
      .filter((ref) => !/@[0-9a-f]{40}$/.test(ref));
    expect(unpinned).toEqual([]);
  });

  it('the header says what the two jobs do and that neither holds id-token', () => {
    const prose = headerProse();
    expect(prose).toMatch(
      /release-notes and readme-images run after a publish, each in a job of its own/,
    );
    expect(prose).toMatch(/neither holds id-token/);
  });
});

describe('release.yml and ci.yml seed the same syft (SEC-73)', () => {
  it('SEC-73: the seeded syft version and digest agree across ci.yml and release.yml', () => {
    const ci = readFileSync(resolve(root, '.github/workflows/ci.yml'), 'utf8');
    // sbom-action reads syft from the tool cache folder named by its syft-version, so the version it names, the tag the seed step
    // downloads and the digest the seed checks must be one release; four sbom-action sites name it (one in ci.yml, three here).
    const versions = [...`${ci}\n${workflow}`.matchAll(/syft-version: (v\d+\.\d+\.\d+)/g)].map(
      (m) => m[1],
    );
    expect(versions).toHaveLength(4);
    const v = versions[0] ?? '';
    expect(new Set(versions)).toEqual(new Set([v]));
    const bare = v.slice(1);
    const asset = `syft_${bare}_linux_amd64.tar.gz`;
    const seed = new RegExp(
      `repo: anchore/syft\\n\\s+tag: ${v}\\n\\s+asset: ${asset.replaceAll('.', '\\.')}\\n\\s+sha256: ([0-9a-f]{64})`,
    ).exec(ci);
    expect(seed, 'the ci.yml syft seed step').not.toBeNull();
    const digest = seed?.[1] ?? '';
    const checks = [
      ...workflow.matchAll(/echo "([0-9a-f]{64}) {2}\$tarball" \| sha256sum --check/g),
    ].map((m) => m[1]);
    expect(checks).toEqual([digest]);
    const count = (needle: string): number => workflow.split(needle).length - 1;
    expect(count(`gh release download ${v} -R anchore/syft -p ${asset}`)).toBe(1);
    expect(count(`releases/download/${v}/${asset}`)).toBe(1);
    expect(count(`RUNNER_TOOL_CACHE/syft/${bare}/x64"`)).toBe(1);
  });
});
